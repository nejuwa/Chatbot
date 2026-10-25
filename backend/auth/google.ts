import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import type { Profile, VerifyCallback } from "passport-google-oauth20";
import type OAuth2Strategy from "passport-oauth2";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { AI_USER_EMAIL } from "./constants.js";

export const googleOAuthStateCookieName = "google_oauth_state";
export const googleOAuthStateCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth/google",
};
const stateCookieMaxAgeOptions = {
  ...googleOAuthStateCookieOptions,
  maxAge: 10 * 60 * 1000,
};

export class CookieStateStore implements OAuth2Strategy.StateStore {
  store(
    req: Request,
    callback: OAuth2Strategy.StateStoreStoreCallback,
  ): void;
  store(
    req: Request,
    meta: OAuth2Strategy.Metadata,
    callback: OAuth2Strategy.StateStoreStoreCallback,
  ): void;
  store(
    req: Request,
    metaOrCallback:
      | OAuth2Strategy.Metadata
      | OAuth2Strategy.StateStoreStoreCallback,
    callback?: OAuth2Strategy.StateStoreStoreCallback,
  ) {
    const done =
      typeof metaOrCallback === "function" ? metaOrCallback : callback;
    const response = req.res;

    if (!done || !response) {
      done?.(new Error("Unable to initialize OAuth state"), "");
      return;
    }

    const state = randomBytes(32).toString("base64url");
    response.cookie(googleOAuthStateCookieName, state, stateCookieMaxAgeOptions);
    done(null, state);
  }

  verify(
    req: Request,
    state: string,
    callback: OAuth2Strategy.StateStoreVerifyCallback,
  ): void;
  verify(
    req: Request,
    state: string,
    meta: OAuth2Strategy.Metadata,
    callback: OAuth2Strategy.StateStoreVerifyCallback,
  ): void;
  verify(
    req: Request,
    state: string,
    metaOrCallback:
      | OAuth2Strategy.Metadata
      | OAuth2Strategy.StateStoreVerifyCallback,
    callback?: OAuth2Strategy.StateStoreVerifyCallback,
  ) {
    const done =
      typeof metaOrCallback === "function" ? metaOrCallback : callback;
    const response = req.res;
    const cookieState: unknown = req.cookies?.[googleOAuthStateCookieName];

    response?.clearCookie(
      googleOAuthStateCookieName,
      googleOAuthStateCookieOptions,
    );

    if (!done || !response || typeof cookieState !== "string" || !state) {
      done?.(null, false, { message: "Unable to verify authorization state." });
      return;
    }

    const expected = Buffer.from(cookieState);
    const actual = Buffer.from(state);
    const valid =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    done(null, valid, valid ? undefined : { message: "Invalid authorization state." });
  }
}

export const googleOAuthStateStore = new CookieStateStore();

export async function verifyGoogleUser(
  profile: Profile,
  done: VerifyCallback,
): Promise<void> {
  try {
    const verifiedEmail = profile.emails
      ?.find((email) => email.verified)
      ?.value.trim()
      .toLowerCase();

    if (!verifiedEmail || !profile.id || verifiedEmail === AI_USER_EMAIL) {
      done(null, false, { message: "A verified Google email is required." });
      return;
    }

    let user = await prisma.user.findUnique({
      where: { googleId: profile.id },
      select: { id: true },
    });

    if (!user) {
      const existingByEmail = await prisma.user.findUnique({
        where: { email: verifiedEmail },
        select: { id: true, googleId: true },
      });

      if (existingByEmail?.googleId && existingByEmail.googleId !== profile.id) {
        done(null, false, { message: "Google account is already linked." });
        return;
      }

      if (existingByEmail) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: profile.id,
            displayName: profile.displayName || undefined,
            avatarUrl: profile.photos?.[0]?.value,
          },
          select: { id: true },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: verifiedEmail,
            googleId: profile.id,
            displayName: profile.displayName || undefined,
            avatarUrl: profile.photos?.[0]?.value,
          },
          select: { id: true },
        });
      }
    }

    done(null, { id: user.id });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      try {
        const user = await prisma.user.findUnique({
          where: { googleId: profile.id },
          select: { id: true },
        });

        if (user) {
          done(null, { id: user.id });
          return;
        }
      } catch (lookupError) {
        done(lookupError);
        return;
      }
    }

    done(error);
  }
}
