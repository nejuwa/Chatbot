import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { isValidCsrfToken, tokensMatch } from "../utils/csrf.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrfProtection: RequestHandler = (req, res, next) => {
  if (safeMethods.has(req.method)) {
    next();
    return;
  }

  const cookieToken: unknown = req.cookies?.[env.CSRF_COOKIE_NAME];
  const headerToken = req.get("x-csrf-token");

  if (
    !isValidCsrfToken(cookieToken) ||
    !tokensMatch(cookieToken, headerToken)
  ) {
    res.status(403).json({
      error: { code: "CSRF_INVALID", message: "CSRF validation failed" },
    });
    return;
  }

  next();
};
