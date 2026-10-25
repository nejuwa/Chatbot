import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import multer from "multer";
import { SessionServiceError } from "../services/sessions.service.js";
import {
  createSessionFileMessage,
  getSessionFile,
} from "../services/files.service.js";

function userId(req: Parameters<RequestHandler>[0]) {
  if (!req.userId) {
    throw new SessionServiceError("UNAUTHORIZED", 401, "Authentication required");
  }
  return req.userId;
}

function routeParam(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    throw new SessionServiceError(
      "VALIDATION_ERROR",
      400,
      `Invalid ${name}`,
    );
  }
  return value;
}

export const uploadSessionFile: RequestHandler<ParamsDictionary> = async (
  req,
  res,
  next,
) => {
  try {
    const message = await createSessionFileMessage(
      userId(req),
      routeParam(req.params.id, "session ID"),
      req.file,
    );
    res.status(201).json({ data: message });
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

export const downloadSessionFile: RequestHandler<
  { id: string; fileId: string }
> = async (req, res, next) => {
  try {
    const file = await getSessionFile(
      userId(req),
      routeParam(req.params.id, "session ID"),
      routeParam(req.params.fileId, "file ID"),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.type(file.mimeType);
    res.download(file.path, file.originalName, (error) => {
      if (error) {
        if (res.headersSent) {
          next(error);
          return;
        }
        next(error);
      }
    });
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

export const uploadError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
        message: tooLarge
          ? "The uploaded file exceeds the size limit"
          : "The upload request is invalid",
      },
    });
    return;
  }
  next(error);
};
