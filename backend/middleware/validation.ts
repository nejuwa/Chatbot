import type { ParamsDictionary } from "express-serve-static-core";
import type { RequestHandler } from "express";
import { z } from "zod";

export function validateBody<Schema extends z.ZodTypeAny>(
  schema: Schema,
): RequestHandler<ParamsDictionary, unknown, z.output<Schema>> {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body validation failed",
          details: result.error.flatten().fieldErrors,
        },
      });
      return;
    }

    req.body = result.data;
    next();
  };
}