import type { NextFunction, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { z } from "zod";
import {
  createMessageSchema,
  clearSessionHistory as clearSessionHistoryService,
  deleteOwnMessage as deleteOwnMessageService,
  listSessionMessages as listSessionMessagesService,
  markMessageRead as markMessageReadService,
  messagePaginationSchema,
  sendSessionMessage as sendSessionMessageService,
  updateMessageSchema,
  updateOwnMessage as updateOwnMessageService,
} from "../services/messages.service.js";
import { SessionServiceError } from "../services/sessions.service.js";

function authenticatedUserId(req: Parameters<RequestHandler>[0]) {
  if (!req.userId) {
    throw new SessionServiceError(
      "UNAUTHORIZED",
      401,
      "Authentication required",
    );
  }
  return req.userId;
}

function parseSessionId(req: Parameters<RequestHandler>[0]) {
  const parsed = z.object({ id: z.string().min(1).max(128) }).safeParse(req.params);
  if (!parsed.success) {
    throw new SessionServiceError("INVALID_SESSION_ID", 400, "Invalid session ID");
  }
  return parsed.data.id;
}

function parseMessageId(req: Parameters<RequestHandler>[0]) {
  const parsed = z.object({ messageId: z.string().min(1).max(128) }).safeParse(req.params);
  if (!parsed.success) {
    throw new SessionServiceError("INVALID_MESSAGE_ID", 400, "Invalid message ID");
  }
  return parsed.data.messageId;
}

function parsePagination(req: Parameters<RequestHandler>[0]) {
  const parsed = messagePaginationSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new SessionServiceError(
      "VALIDATION_ERROR",
      400,
      "Invalid pagination parameters",
    );
  }
  return parsed.data;
}

async function respond(
  res: Response,
  next: NextFunction,
  operation: () => Promise<unknown>,
  statusCode = 200,
) {
  try {
    const data = await operation();
    res.status(statusCode).json({ data });
  } catch (error) {
    if (error instanceof SessionServiceError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    next(error);
  }
}

export const listSessionMessages: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    listSessionMessagesService(
      authenticatedUserId(req),
      parseSessionId(req),
      parsePagination(req),
    ),
  );

export const sendSessionMessage: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof createMessageSchema>
> = (req, res, next) =>
  respond(
    res,
    next,
    () =>
      sendSessionMessageService(
        authenticatedUserId(req),
        parseSessionId(req),
        req.body,
      ),
    201,
  );

export const markMessageRead: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    markMessageReadService(
      authenticatedUserId(req),
      parseSessionId(req),
      parseMessageId(req),
    ),
  );

export const deleteOwnMessage: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    deleteOwnMessageService(
      authenticatedUserId(req),
      parseSessionId(req),
      parseMessageId(req),
    ),
  );

export const updateOwnMessage: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof updateMessageSchema>
> = (req, res, next) =>
  respond(res, next, () =>
    updateOwnMessageService(
      authenticatedUserId(req),
      parseSessionId(req),
      parseMessageId(req),
      req.body,
    ),
  );

export const clearSessionHistory: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    clearSessionHistoryService(
      authenticatedUserId(req),
      parseSessionId(req),
    ),
  );
