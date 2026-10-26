import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";

const baseCookieOptions: CookieOptions = {
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
};

export function setAuthCookie(res: Response, token: string) {
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: env.AUTH_ACCESS_TOKEN_SECONDS * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(env.AUTH_COOKIE_NAME, {
    ...baseCookieOptions,
    httpOnly: true,
  });
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(env.AUTH_REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, {
    ...baseCookieOptions,
    httpOnly: true,
  });
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(env.CSRF_COOKIE_NAME, token, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(env.CSRF_COOKIE_NAME, {
    ...baseCookieOptions,
    httpOnly: false,
  });
}
