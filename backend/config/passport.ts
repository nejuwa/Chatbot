import type { Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import {
  CookieStateStore,
  googleOAuthStateCookieName,
  googleOAuthStateCookieOptions,
  verifyGoogleUser,
} from "../auth/google.js";
import { env } from "./env.js";

const googleOAuthConfig =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL
    ? {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      }
    : undefined;

export const googleOAuthConfigured = googleOAuthConfig !== undefined;

if (googleOAuthConfig) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        ...googleOAuthConfig,
        scope: ["profile", "email"],
        state: true,
        store: new CookieStateStore(),
        passReqToCallback: true,
      },
      async (_req, _accessToken, _refreshToken, profile, done) => {
        await verifyGoogleUser(profile, done);
      },
    ),
  );
}

export function clearGoogleOAuthStateCookie(res: Response) {
  res.clearCookie(googleOAuthStateCookieName, googleOAuthStateCookieOptions);
}

export { passport };