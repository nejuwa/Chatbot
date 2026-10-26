import bcrypt from "bcryptjs";
import { AuthTokenType, Prisma } from "@prisma/client";
import type { NextFunction, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { z } from "zod";
import { AI_USER_EMAIL } from "../auth/constants.js";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import {
  clearAuthCookie,
  clearCsrfCookie,
  clearRefreshCookie,
  setAuthCookie,
  setCsrfCookie,
  setRefreshCookie,
} from "../utils/cookies.js";
import { createCsrfToken } from "../utils/csrf.js";
import { logger } from "../config/logger.js";

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(8)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must be at most 72 bytes",
    }),
});

export const registrationSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(100).optional(),
}).refine((registration) => registration.email !== AI_USER_EMAIL, {
  path: ["email"],
  message: "This email address cannot be registered",
});

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: credentialsSchema.shape.password,
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRefreshToken() {
  return randomBytes(48).toString("base64url");
}

function hasSmtpConfiguration() {
  return Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM,
  );
}

const mailer = hasSmtpConfiguration()
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    })
  : undefined;

export async function issueSession(res: Response, userId: string) {
  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.AUTH_ACCESS_TOKEN_SECONDS,
  });
  const refreshToken = createRefreshToken();
  await prisma.authToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      type: AuthTokenType.REFRESH,
      userId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const csrfToken = createCsrfToken();

  setAuthCookie(res, token);
  setRefreshCookie(res, refreshToken);
  setCsrfCookie(res, csrfToken);

  return csrfToken;
}

export const createCsrf: RequestHandler = (_req, res) => {
  const csrfToken = createCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.status(200).json({ csrfToken });
};

export const register: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof registrationSchema>
> = async (req, res) => {
  const { email, password, displayName } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        bio: true,
        avatarUrl: true,
        status: true,
        lastSeen: true,
      },
    });
    const csrfToken = await issueSession(res, user.id);

    res.status(201).json({ data: user, csrfToken });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        error: {
          code: "EMAIL_IN_USE",
          message: "An account with this email already exists",
        },
      });
      return;
    }
    throw error;
  }
};

export const login: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof credentialsSchema>
> = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { email: req.body.email },
  });
  const validPassword = user?.passwordHash
    ? await bcrypt.compare(req.body.password, user.passwordHash)
    : false;

  if (!user || !validPassword) {
    res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
    });
    return;
  }

  const csrfToken = await issueSession(res, user.id);
  res.status(200).json({
    data: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastSeen: user.lastSeen,
    },
    csrfToken,
  });
};

export const refreshSession: RequestHandler = async (req, res) => {
  const refreshToken: unknown = req.cookies?.[env.AUTH_REFRESH_COOKIE_NAME];
  if (typeof refreshToken !== "string" || refreshToken.length < 32) {
    clearAuthCookie(res);
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.status(401).json({
      error: { code: "REFRESH_INVALID", message: "Sign in again to continue" },
    });
    return;
  }

  const tokenHash = hashToken(refreshToken);
  const now = new Date();
  const nextRefreshToken = createRefreshToken();
  try {
    const user = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.authToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, type: true, expiresAt: true, consumedAt: true },
      });
      if (!existing || existing.type !== AuthTokenType.REFRESH || existing.expiresAt <= now) {
        return null;
      }

      if (existing.consumedAt) {
        await transaction.authToken.updateMany({
          where: {
            userId: existing.userId,
            type: AuthTokenType.REFRESH,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        return null;
      }

      const consumed = await transaction.authToken.updateMany({
        where: { id: existing.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        return null;
      }

      const account = await transaction.user.findUnique({
        where: { id: existing.userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          bio: true,
          avatarUrl: true,
          status: true,
          lastSeen: true,
        },
      });
      if (!account) {
        return null;
      }

      await transaction.authToken.create({
        data: {
          tokenHash: hashToken(nextRefreshToken),
          type: AuthTokenType.REFRESH,
          userId: account.id,
          expiresAt: new Date(
            now.getTime() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      });
      return account;
    });

    if (!user) {
      clearAuthCookie(res);
      clearRefreshCookie(res);
      clearCsrfCookie(res);
      res.status(401).json({
        error: { code: "REFRESH_INVALID", message: "Sign in again to continue" },
      });
      return;
    }

    const accessToken = jwt.sign({}, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: env.AUTH_ACCESS_TOKEN_SECONDS,
    });
    const csrfToken = createCsrfToken();
    setAuthCookie(res, accessToken);
    setRefreshCookie(res, nextRefreshToken);
    setCsrfCookie(res, csrfToken);
    res.status(200).json({ data: user, csrfToken });
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Failed to refresh authentication session",
    );
    throw error;
  }
};

export const logout: RequestHandler = async (req, res) => {
  const refreshToken: unknown = req.cookies?.[env.AUTH_REFRESH_COOKIE_NAME];
  if (typeof refreshToken === "string") {
    await prisma.authToken.updateMany({
      where: {
        tokenHash: hashToken(refreshToken),
        type: AuthTokenType.REFRESH,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  }
  clearAuthCookie(res);
  clearRefreshCookie(res);
  clearCsrfCookie(res);
  res.status(204).end();
};

export async function completeGoogleSignIn(
  error: unknown,
  user: { id: string } | false,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (error) {
    next(error);
    return;
  }

  if (!user) {
    res.redirect(
      302,
      new URL("/login?error=google_auth_failed", env.CORS_ORIGIN).toString(),
    );
    return;
  }

  await issueSession(res, user.id);
  res.redirect(302, new URL("/auth/callback", env.CORS_ORIGIN).toString());
}

export const requestPasswordReset: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof requestPasswordResetSchema>
> = async (req, res) => {
  if (!mailer) {
    res.status(503).json({
      error: { code: "EMAIL_NOT_CONFIGURED", message: "Password reset email is unavailable" },
    });
    return;
  }

  const genericResponse = {
    data: { message: "If an account exists for that email, reset instructions will be sent." },
  };
  const user = await prisma.user.findUnique({
    where: { email: req.body.email },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    res.status(200).json(genericResponse);
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await prisma.$transaction(async (transaction) => {
    await transaction.authToken.updateMany({
      where: {
        userId: user.id,
        type: AuthTokenType.PASSWORD_RESET,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
    await transaction.authToken.create({
      data: {
        tokenHash: hashToken(token),
        type: AuthTokenType.PASSWORD_RESET,
        userId: user.id,
        expiresAt,
      },
    });
  });

  const resetUrl = new URL(env.PASSWORD_RESET_URL);
  resetUrl.searchParams.set("token", token);
  try {
    await mailer.sendMail({
      from: env.SMTP_FROM,
      to: req.body.email,
      subject: "Reset your chatbot password",
      text: `Use this link within one hour to reset your password: ${resetUrl.toString()}`,
    });
  } catch (error) {
    await prisma.authToken.updateMany({
      where: { tokenHash: hashToken(token), consumedAt: null },
      data: { consumedAt: new Date() },
    });
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        userId: user.id,
      },
      "Failed to send password reset email",
    );
    res.status(503).json({
      error: {
        code: "EMAIL_DELIVERY_FAILED",
        message: "Unable to send the reset email right now. Please try again later.",
      },
    });
    return;
  }
  res.status(200).json(genericResponse);
};

export const resetPassword: RequestHandler<
  ParamsDictionary,
  unknown,
  z.output<typeof resetPasswordSchema>
> = async (req, res) => {
  const tokenHash = hashToken(req.body.token);
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const now = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    const token = await transaction.authToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, type: true, expiresAt: true, consumedAt: true },
    });
    if (
      !token ||
      token.type !== AuthTokenType.PASSWORD_RESET ||
      token.expiresAt <= now ||
      token.consumedAt
    ) {
      return false;
    }

    const consumed = await transaction.authToken.updateMany({
      where: {
        id: token.id,
        type: AuthTokenType.PASSWORD_RESET,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      return false;
    }

    await transaction.user.update({
      where: { id: token.userId },
      data: { passwordHash },
    });
    await transaction.authToken.updateMany({
      where: {
        userId: token.userId,
        type: AuthTokenType.REFRESH,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
    return true;
  });

  if (!result) {
    res.status(400).json({
      error: { code: "RESET_TOKEN_INVALID", message: "Reset token is invalid or expired" },
    });
    return;
  }

  clearAuthCookie(res);
  clearRefreshCookie(res);
  clearCsrfCookie(res);
  res.status(200).json({ data: { message: "Password has been reset" } });
};

export function googleProviderDenied(res: Response) {
  res.redirect(
    302,
    new URL("/login?error=google_auth_failed", env.CORS_ORIGIN).toString(),
  );
}

export function oauthNotConfigured(res: Response) {
  res.status(503).json({
    error: {
      code: "OAUTH_NOT_CONFIGURED",
      message: "Google sign-in is not configured",
    },
  });
}
