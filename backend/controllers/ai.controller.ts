import type { RequestHandler } from "express";
import type { z } from "zod";
import {
  AiServiceError,
  aiChatBodySchema,
  prepareAiChat,
  streamAiReply,
} from "../services/ai.service.js";

type AiChatBody = z.output<typeof aiChatBodySchema>;

export const aiChat: RequestHandler<
  Record<string, string>,
  unknown,
  AiChatBody
> = async (req, res, next) => {
  if (!req.userId) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  let prepared;
  try {
    prepared = await prepareAiChat(
      req.userId,
      req.body.sessionId,
      req.body.message,
    );
  } catch (error) {
    if (error instanceof AiServiceError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    next(error);
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(
    `event: meta\ndata: ${JSON.stringify({
      sessionId: prepared.sessionId,
      messageId: prepared.userMessageId,
    })}\n\n`,
  );

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("AI request timed out"));
  }, 60_000);
  res.once("close", () => {
    if (!res.writableEnded) {
      controller.abort(new Error("Client disconnected"));
    }
  });

  try {
    const result = await streamAiReply(
      prepared,
      (delta) => {
        res.write(`event: token\ndata: ${JSON.stringify({ delta })}\n\n`);
      },
      controller.signal,
    );
    res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
    res.end();
  } catch (error) {
    if (res.destroyed) {
      return;
    }
    const responseError = timedOut
      ? new AiServiceError(
          "LLM_TIMEOUT",
          504,
          "The AI response took too long. Please try again.",
        )
      : error instanceof AiServiceError
        ? error
        : new AiServiceError(
            "LLM_ERROR",
            502,
            "The AI could not complete this response. Please try again.",
          );
    res.write(
      `event: error\ndata: ${JSON.stringify({
        code: responseError.code,
        message: responseError.message,
      })}\n\n`,
    );
    res.end();
  } finally {
    clearTimeout(timeout);
  }
};
