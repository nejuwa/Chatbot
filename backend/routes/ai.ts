import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { aiChat } from "../controllers/ai.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validation.js";
import { aiChatBodySchema } from "../services/ai.service.js";

const router = Router();

const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "The AI is busy right now. Please try again shortly.",
    },
  },
});

router.post(
  "/chat",
  authenticate,
  aiRateLimit,
  validateBody(aiChatBodySchema),
  aiChat,
);

export { router as aiRouter };
