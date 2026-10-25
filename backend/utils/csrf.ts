import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

function sign(nonce: string) {
  return createHmac("sha256", env.JWT_SECRET).update(nonce).digest("base64url");
}

export function createCsrfToken() {
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${sign(nonce)}`;
}

export function isValidCsrfToken(token: unknown): token is string {
  if (typeof token !== "string") {
    return false;
  }

  const [nonce, signature, ...extra] = token.split(".");
  if (!nonce || !signature || extra.length > 0) {
    return false;
  }

  const expected = Buffer.from(sign(nonce));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function tokensMatch(cookieToken: unknown, headerToken: unknown) {
  if (
    typeof cookieToken !== "string" ||
    typeof headerToken !== "string" ||
    cookieToken.length !== headerToken.length
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
}
