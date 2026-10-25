import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";

export const authenticate: RequestHandler = (req, res, next) => {
  const token: unknown = req.cookies?.[env.AUTH_COOKIE_NAME];

  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const userId = typeof payload === "string" ? undefined : payload.sub;

    if (typeof userId !== "string" || userId.length === 0) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    req.userId = userId;
    next();
  } catch {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
};
