import type { NextFunction, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { z } from "zod";
import {
  addAiParticipant as addAiParticipantService,
  createSession as createSessionService,
  createSessionSchema,
  deleteSession as deleteSessionService,
  getSession as getSessionService,
  inviteParticipant as inviteParticipantService,
  inviteParticipantSchema,
  leaveSession as leaveSessionService,
  listSessions as listSessionsService,
  paginationQuerySchema,
  removeParticipant as removeParticipantService,
  renameSession as renameSessionService,
  renameSessionSchema,
  getGroupAvatar as getGroupAvatarService,
  updateGroupProfile as updateGroupProfileService,
  updateGroupProfileSchema,
  uploadGroupAvatar as uploadGroupAvatarService,
  SessionServiceError,
} from "../services/sessions.service.js";
import { sessionIdSchema } from "../services/sessions.service.js";
import {
  addSessionParticipantRoom,
  closeSessionRoom,
  revokeSessionParticipant,
} from "../socket/index.js";

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

function sessionId(req: Parameters<RequestHandler>[0]) {
  const parsed = sessionIdSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new SessionServiceError("INVALID_SESSION_ID", 400, "Invalid session ID");
  }
  return parsed.data.id;
}

function parsePagination(req: Parameters<RequestHandler>[0]) {
  const parsed = paginationQuerySchema.safeParse(req.query);
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

export const createSession: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof createSessionSchema>
> = (req, res, next) =>
  respond(
    res,
    next,
    () => createSessionService(authenticatedUserId(req), req.body),
    201,
  );

export const listSessions: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    listSessionsService(authenticatedUserId(req), parsePagination(req)),
  );

export const getSession: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    getSessionService(
      authenticatedUserId(req),
      sessionId(req),
      parsePagination(req),
    ),
  );

export const renameSession: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof renameSessionSchema>
> = (req, res, next) =>
  respond(res, next, () =>
    renameSessionService(
      authenticatedUserId(req),
      sessionId(req),
      req.body.title,
    ),
  );

export const updateGroupProfile: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof updateGroupProfileSchema>
> = (req, res, next) =>
  respond(res, next, () =>
    updateGroupProfileService(
      authenticatedUserId(req),
      sessionId(req),
      req.body,
    ),
  );

export const uploadGroupAvatar: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    uploadGroupAvatarService(
      authenticatedUserId(req),
      sessionId(req),
      req.file,
    ),
  );

export const getGroupAvatar: RequestHandler = async (req, res, next) => {
  try {
    const id = sessionId(req);
    const filename = typeof req.params.filename === "string" ? req.params.filename : "";
    const image = await getGroupAvatarService(authenticatedUserId(req), id, filename);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.type(image.mimeType).send(image.buffer);
  } catch (error) {
    if (error instanceof SessionServiceError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    next(error);
  }
};

export const deleteSession: RequestHandler = async (req, res, next) => {
  try {
    const id = sessionId(req);
    await deleteSessionService(authenticatedUserId(req), id);
    closeSessionRoom(id);
    res.status(204).end();
  } catch (error) {
    if (error instanceof SessionServiceError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    next(error);
  }
};

export const inviteParticipant: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof inviteParticipantSchema>
> = (req, res, next) =>
  respond(
    res,
    next,
    async () => {
      const id = sessionId(req);
      const participant = await inviteParticipantService(
        authenticatedUserId(req),
        id,
        req.body.userId,
      );
      addSessionParticipantRoom(id, req.body.userId);
      return participant;
    },
    201,
  );

export const removeParticipant: RequestHandler = (req, res, next) => {
  const parsed = z
    .object({ id: z.string().min(1).max(128), userId: z.string().min(1).max(128) })
    .safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid participant route parameters" },
    });
    return;
  }

  return respond(res, next, async () => {
    await removeParticipantService(
      authenticatedUserId(req),
      parsed.data.id,
      parsed.data.userId,
    );
    revokeSessionParticipant(parsed.data.id, parsed.data.userId);
    return { removed: true };
  });
};

export const leaveSession: RequestHandler = (req, res, next) =>
  respond(res, next, async () => {
    const id = sessionId(req);
    const userId = authenticatedUserId(req);
    const result = await leaveSessionService(userId, id);
    if (result.deleted) {
      closeSessionRoom(id);
    } else {
      revokeSessionParticipant(id, userId);
    }
    return result;
  });

export const addAiParticipant: RequestHandler = (req, res, next) =>
  respond(res, next, () =>
    addAiParticipantService(authenticatedUserId(req), sessionId(req)),
  );
