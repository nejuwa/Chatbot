import { MessageRole, MessageType, SessionType } from "@prisma/client";
import {
  AIMessage,
  type ContentBlock,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { ChatGoogle } from "@langchain/google";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import { AI_USER_EMAIL } from "../auth/constants.js";
import { broadcastAiError, broadcastSessionMessage } from "../socket/index.js";
import type { RealtimeMessage } from "../socket/types.js";
import { createChatModel } from "../modules/ai/llm.js";
import { readStoredImage } from "./files.service.js";
import { z } from "zod";

const NEW_SESSION_TITLE = "New chat";
const AUTO_TITLE_SESSIONS = new Set<string>();
const GEMINI_REQUEST_TIMES: number[] = [];
const GEMINI_REQUESTS_PER_MINUTE = 5;
const MAX_AI_IMAGE_CONTEXT_BYTES = 15 * 1024 * 1024;

export class AiServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

function reserveGeminiRequest(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Request aborted");
  }
  const cutoff = Date.now() - 60_000;
  while (GEMINI_REQUEST_TIMES[0] !== undefined && GEMINI_REQUEST_TIMES[0] <= cutoff) {
    GEMINI_REQUEST_TIMES.shift();
  }
  if (GEMINI_REQUEST_TIMES.length >= GEMINI_REQUESTS_PER_MINUTE) {
    throw new AiServiceError(
      "RATE_LIMITED",
      429,
      "The AI is busy right now. Please try again shortly.",
    );
  }
  GEMINI_REQUEST_TIMES.push(Date.now());
}

export const aiChatBodySchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().trim().min(1).max(10_000),
});

type PreparedAiChat = {
  model: ChatGoogle;
  sessionId: string;
  userMessageId: string;
  userMessage: RealtimeMessage;
  aiUserId: string;
  history: BaseMessage[];
  titleNeedsGeneration: boolean;
  firstMessage: string;
};

type AiHistoryItem = {
  role: string;
  type: MessageType;
  content: string;
  file: { storedName: string; mimeType: string } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeErrorDetails(error: unknown) {
  const status = isRecord(error) ? error.status ?? error.statusCode : undefined;
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    ...(typeof status === "number" ? { status } : {}),
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  return String(error).toLowerCase();
}

function isRateLimitError(error: unknown) {
  const text = errorText(error);
  const status = isRecord(error) ? error.status ?? error.statusCode : undefined;
  return (
    status === 429 ||
    /429|resource_exhausted|quota exceeded|rate.?limit/.test(text)
  );
}

function isTimeoutError(error: unknown) {
  const text = errorText(error);
  return /timeout|timed out|deadline_exceeded|aborterror/.test(text);
}

function isTransientError(error: unknown) {
  if (isRateLimitError(error) || isTimeoutError(error)) {
    return true;
  }

  const status = isRecord(error) ? error.status ?? error.statusCode : undefined;
  return typeof status === "number" && status >= 500;
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Request aborted"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Request aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function withRetries<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= 2 ||
        !isTransientError(error) ||
        signal?.aborted ||
        (error instanceof AiServiceError && error.code === "RATE_LIMITED")
      ) {
        throw error;
      }
      await wait(250 * 2 ** attempt, signal);
    }
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (isRecord(part) && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
}

async function buildHistoryMessages(history: AiHistoryItem[]) {
  let imageBytes = 0;
  const messages: BaseMessage[] = [];

  for (const message of history) {
    if (message.role === MessageRole.ASSISTANT) {
      messages.push(new AIMessage(message.content));
      continue;
    }
    if (message.role === MessageRole.SYSTEM) {
      messages.push(new SystemMessage(message.content));
      continue;
    }

    if (message.type === MessageType.IMAGE) {
      const file = message.file;
      if (!file) {
        messages.push(new HumanMessage("The user shared an image attachment that is not available for analysis."));
        continue;
      }

      const image = await readStoredImage(file.storedName, file.mimeType);
      imageBytes += image.byteLength;
      if (imageBytes > MAX_AI_IMAGE_CONTEXT_BYTES) {
        throw new AiServiceError(
          "IMAGE_CONTEXT_TOO_LARGE",
          413,
          "These images are too large to analyze together. Start a new chat or remove some images, then try again.",
        );
      }

      const imageContent: ContentBlock.Standard[] = [
        { type: "text", text: "The user shared this image:" },
        {
          type: "image",
          mimeType: file.mimeType,
          data: image.toString("base64"),
        },
      ];
      messages.push(new HumanMessage({
        content: imageContent,
        response_metadata: { output_version: "v1" },
      }));
      continue;
    }

    messages.push(new HumanMessage(message.type === MessageType.FILE
      ? "The user shared a file attachment."
      : message.type === MessageType.VOICE
        ? "The user shared a voice message."
        : message.type === MessageType.VIDEO
          ? "The user shared a video attachment."
        : message.content));
  }

  return messages;
}

function fallbackTitle(message: string) {
  return message.split(/\s+/).slice(0, 6).join(" ").slice(0, 120) || NEW_SESSION_TITLE;
}

function cleanTitle(title: string, originalMessage: string) {
  const cleaned = title
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .split(/\r?\n/, 1)[0]
    ?.trim()
    .slice(0, 120);
  return cleaned || fallbackTitle(originalMessage);
}

export function mapAiError(error: unknown) {
  if (isRateLimitError(error)) {
    return new AiServiceError(
      "RATE_LIMITED",
      429,
      "The AI is busy right now. Please try again shortly.",
    );
  }
  if (isTimeoutError(error)) {
    return new AiServiceError(
      "LLM_TIMEOUT",
      504,
      "The AI response took too long. Please try again.",
    );
  }
  return new AiServiceError(
    "LLM_ERROR",
    502,
    "The AI could not complete this response. Please try again.",
  );
}

export async function prepareAiChat(userId: string, sessionId: string, prompt: string) {
  let model: ChatGoogle;
  try {
    model = createChatModel();
  } catch (error) {
    logger.error({ err: error }, "AI provider configuration error");
    throw new AiServiceError(
      "LLM_ERROR",
      503,
      "The AI service is not configured.",
    );
  }

  const prepared = await prisma.$transaction(async (transaction) => {
    const participant = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: {
        id: true,
        session: {
          select: {
            id: true,
            type: true,
            title: true,
            users: {
              where: { user: { email: AI_USER_EMAIL } },
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!participant) {
      const exists = await transaction.chatSession.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });
      throw new AiServiceError(
        exists ? "FORBIDDEN" : "SESSION_NOT_FOUND",
        exists ? 403 : 404,
        exists
          ? "You are not a participant in this session."
          : "Chat session not found.",
      );
    }

    const aiUserId = participant.session.users[0]?.userId;
    if (participant.session.type !== SessionType.AI && !aiUserId) {
      throw new AiServiceError(
        "AI_NOT_IN_SESSION",
        409,
        "Add the AI participant to this session before starting an AI chat.",
      );
    }

    const assistantId = aiUserId ?? (await transaction.user.findUnique({
      where: { email: AI_USER_EMAIL },
      select: { id: true },
    }))?.id;
    if (!assistantId) {
      throw new AiServiceError(
        "AI_PARTICIPANT_NOT_FOUND",
        500,
        "The AI participant is not configured for this session.",
      );
    }

    const userMessage = await transaction.message.create({
      data: {
        sessionId,
        senderId: userId,
        role: MessageRole.USER,
        type: MessageType.TEXT,
        content: prompt,
      },
      include: {
        sender: {
          select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
        },
      },
    });

    await transaction.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: userMessage.createdAt },
    });

    const history = await transaction.message.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: env.HISTORY_WINDOW,
      select: {
        role: true,
        type: true,
        content: true,
        file: { select: { storedName: true, mimeType: true } },
      },
    });

    return {
      sessionId,
      userMessageId: userMessage.id,
      userMessage,
      aiUserId: assistantId,
      history: history.reverse(),
      titleNeedsGeneration: participant.session.title === NEW_SESSION_TITLE,
      firstMessage: prompt,
    };
  });

  const history = await buildHistoryMessages(prepared.history);
  broadcastSessionMessage(prepared.userMessage);
  return {
    ...prepared,
    model,
    history: [new SystemMessage(env.SYSTEM_PROMPT), ...history],
  };
}

async function prepareAiReplyForExistingMessage(
  userId: string,
  sessionId: string,
  userMessageId: string,
): Promise<PreparedAiChat> {
  let model: ChatGoogle;
  try {
    model = createChatModel();
  } catch (error) {
    logger.error({ err: error }, "AI provider configuration error");
    throw new AiServiceError(
      "LLM_ERROR",
      503,
      "The AI service is not configured.",
    );
  }

  const prepared = await prisma.$transaction(async (transaction) => {
    const participant = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: {
        session: {
          select: {
            id: true,
            type: true,
            title: true,
            users: {
              where: { user: { email: AI_USER_EMAIL } },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!participant) {
      throw new AiServiceError("FORBIDDEN", 403, "Session membership is required.");
    }

    const aiUserId = participant.session.users[0]?.userId;
    if (!aiUserId) {
      throw new AiServiceError(
        "AI_NOT_IN_SESSION",
        409,
        "The AI participant is not in this session.",
      );
    }

    const userMessage = await transaction.message.findFirst({
      where: {
        id: userMessageId,
        sessionId,
        senderId: userId,
        role: MessageRole.USER,
      },
      include: {
        sender: {
          select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
        },
      },
    });
    if (!userMessage) {
      throw new AiServiceError(
        "MESSAGE_NOT_FOUND",
        404,
        "The message to answer was not found.",
      );
    }

    const history = await transaction.message.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: env.HISTORY_WINDOW,
      select: {
        role: true,
        type: true,
        content: true,
        file: { select: { storedName: true, mimeType: true } },
      },
    });

    return {
      sessionId,
      userMessageId: userMessage.id,
      userMessage,
      aiUserId,
      history: history.reverse(),
      titleNeedsGeneration: participant.session.title === NEW_SESSION_TITLE,
      firstMessage: userMessage.content,
    };
  });

  const history = await buildHistoryMessages(prepared.history);
  return {
    ...prepared,
    model,
    history: [new SystemMessage(env.SYSTEM_PROMPT), ...history],
  };
}

export async function maybeGenerateAiReply(
  userId: string,
  sessionId: string,
  userMessageId: string,
) {
  try {
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        users: { some: { userId } },
      },
      select: {
        type: true,
        users: {
          where: { user: { email: AI_USER_EMAIL } },
          select: { userId: true },
        },
        messages: {
          where: {
            id: userMessageId,
            senderId: userId,
            type: MessageType.TEXT,
          },
          select: { receiverId: true },
        },
      },
    });
    if (!session) {
      return;
    }

    const aiUserId = session.users[0]?.userId;
    const addressedToAi = Boolean(
      aiUserId && session.messages[0]?.receiverId === aiUserId,
    );
    if (session.type !== SessionType.AI && !addressedToAi) {
      return;
    }
    if (!aiUserId) {
      throw new AiServiceError(
        "AI_NOT_IN_SESSION",
        409,
        "The AI participant is not in this session.",
      );
    }

    const prepared = await prepareAiReplyForExistingMessage(
      userId,
      sessionId,
      userMessageId,
    );
    await streamAiReply(
      prepared,
      () => {},
      AbortSignal.timeout(60_000),
    );
  } catch (error) {
    logger.error(
      { ...safeErrorDetails(error), userId, sessionId, userMessageId },
      "Automatic AI reply failed",
    );
    const clientError = error instanceof AiServiceError
      ? error
      : mapAiError(error);
    broadcastAiError(sessionId, clientError.code, clientError.message);
  }
}

export async function streamAiReply(
  prepared: PreparedAiChat,
  onToken: (delta: string) => void,
  signal: AbortSignal,
) {
  let content = "";
  let promptTokens = 0;
  let completionTokens = 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      reserveGeminiRequest(signal);
      const chunks = await prepared.model.stream(prepared.history, { signal });

      for await (const chunk of chunks) {
        if (signal.aborted) {
          throw signal.reason ?? new Error("Request aborted");
        }
        const delta = textFromContent(chunk.content);
        if (delta) {
          content += delta;
          onToken(delta);
        }
        if (chunk.usage_metadata) {
          promptTokens = chunk.usage_metadata.input_tokens;
          completionTokens = chunk.usage_metadata.output_tokens;
        }
      }

      if (!content.trim()) {
        throw new Error("The model returned an empty response");
      }
      break;
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      if (error instanceof AiServiceError && error.code === "RATE_LIMITED") {
        throw error;
      }
      if (attempt < 2 && content.length === 0 && isTransientError(error)) {
        await wait(250 * 2 ** attempt, signal);
        continue;
      }
      logger.warn(
        { ...safeErrorDetails(error), code: error instanceof AiServiceError ? error.code : undefined },
        "Gemini response generation failed",
      );
      throw mapAiError(error);
    }
  }

  let assistantMessage: RealtimeMessage;
  try {
    assistantMessage = await prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: {
          sessionId: prepared.sessionId,
          senderId: prepared.aiUserId,
          role: MessageRole.ASSISTANT,
          type: MessageType.TEXT,
          content,
          promptTokens,
          completionTokens,
        },
        include: {
          sender: {
            select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
          },
        },
      });
      await transaction.chatSession.update({
        where: { id: prepared.sessionId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });
  } catch (error) {
    logger.error(
      { ...safeErrorDetails(error), sessionId: prepared.sessionId },
      "Failed to persist AI response",
    );
    throw new AiServiceError(
      "LLM_ERROR",
      500,
      "The AI response could not be saved.",
    );
  }

  broadcastSessionMessage(assistantMessage);

  if (prepared.titleNeedsGeneration) {
    void generateAutoTitle(
      prepared.model,
      prepared.sessionId,
      prepared.firstMessage,
    ).catch((error: unknown) => {
      logger.error(
        { ...safeErrorDetails(error), sessionId: prepared.sessionId },
        "Failed to generate session title",
      );
    });
  }

  return {
    messageId: assistantMessage.id,
    usage: { promptTokens, completionTokens },
  };
}

async function generateAutoTitle(
  model: ChatGoogle | undefined,
  sessionId: string,
  firstMessage: string,
) {
  if (AUTO_TITLE_SESSIONS.has(sessionId)) {
    return;
  }
  AUTO_TITLE_SESSIONS.add(sessionId);

  try {
    let title = fallbackTitle(firstMessage);
    if (model) {
      try {
        const signal = AbortSignal.timeout(20_000);
        const result = await withRetries(
          async () => {
            reserveGeminiRequest(signal);
            return model.invoke(
              [
                new SystemMessage(
                  "Create a concise title of 4 to 6 words for this chat. Return only the title.",
                ),
                new HumanMessage(firstMessage),
              ],
              { signal },
            );
          },
          signal,
        );
        title = cleanTitle(textFromContent(result.content), firstMessage);
      } catch (error) {
        logger.warn(
          { ...safeErrorDetails(error), sessionId },
          "Auto-title generation failed; using fallback",
        );
      }
    }

    await prisma.chatSession.updateMany({
      where: { id: sessionId, title: NEW_SESSION_TITLE },
      data: { title },
    });
  } finally {
    AUTO_TITLE_SESSIONS.delete(sessionId);
  }
}

export async function generateSessionTitleFromFirstMessage(
  sessionId: string,
  firstMessage: string,
) {
  let model: ChatGoogle | undefined;
  try {
    model = createChatModel();
  } catch (error) {
    logger.warn(
      { ...safeErrorDetails(error), sessionId },
      "Gemini unavailable for title generation; using fallback",
    );
  }
  try {
    await generateAutoTitle(model, sessionId, firstMessage);
  } catch (error) {
    logger.error(
      { ...safeErrorDetails(error), sessionId },
      "Failed to persist generated session title",
    );
  }
}
