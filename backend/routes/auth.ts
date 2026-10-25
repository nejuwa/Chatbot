import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  clearGoogleOAuthStateCookie,
  googleOAuthConfigured,
  passport,
} from "../config/index.js";
import {
  completeGoogleSignIn,
  createCsrf,
  credentialsSchema,
  googleProviderDenied,
  login,
  logout,
  oauthNotConfigured,
  refreshSession,
  register,
  requestPasswordReset,
  requestPasswordResetSchema,
  resetPassword,
  resetPasswordSchema,
  registrationSchema,
} from "../controllers/index.js";
import { validateBody } from "../middleware/validation.js";

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many attempts. Try again shortly." },
  },
});

router.get("/csrf", createCsrf);

router.get("/google", (req, res, next) => {
  if (!googleOAuthConfigured) {
    oauthNotConfigured(res);
    return;
  }

  passport.authenticate("google", {
    session: false,
    prompt: "select_account",
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  if (!googleOAuthConfigured) {
    oauthNotConfigured(res);
    return;
  }

  if (typeof req.query.error === "string") {
    clearGoogleOAuthStateCookie(res);
    googleProviderDenied(res);
    return;
  }

  passport.authenticate(
    "google",
    { session: false },
    (error: unknown, user: { id: string } | false) =>
      void completeGoogleSignIn(error, user, res, next).catch(next),
  )(req, res, next);
});

router.post(
  "/register",
  authRateLimit,
  validateBody(registrationSchema),
  register,
);

router.post(
  "/login",
  authRateLimit,
  validateBody(credentialsSchema),
  login,
);

router.post("/refresh", authRateLimit, refreshSession);
router.post(
  "/password/forgot",
  authRateLimit,
  validateBody(requestPasswordResetSchema),
  requestPasswordReset,
);
router.post(
  "/password/reset",
  authRateLimit,
  validateBody(resetPasswordSchema),
  resetPassword,
);
router.post("/logout", logout);

export { router as authRouter };
