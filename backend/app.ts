import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { env, logger, passport } from "./config/index.js";
import { prisma } from "./config/prisma.js";
import { csrfProtection } from "./middleware/csrf.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { sessionsRouter } from "./routes/sessions.js";
import { usersRouter } from "./routes/users.js";

export function createApp() {
  const app = express();
  const apiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." },
    },
  });

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({
        ...(req.userId ? { userId: req.userId } : {}),
        route: req.route?.path ?? req.path,
      }),
      genReqId: (_req, res) => {
        const requestId = randomUUID();
        res.setHeader("X-Request-Id", requestId);
        return requestId;
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ready" });
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Readiness check failed",
      );
      res.status(503).json({ status: "not_ready" });
    }
  });

  app.use("/api", apiRateLimit, csrfProtection);
  app.use("/api/auth", authRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/users", usersRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Unhandled request error",
    );
    res.status(500).json({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
    });
  };

  app.use(errorHandler);

  return app;
}
