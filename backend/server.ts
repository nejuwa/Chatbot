import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env, logger, prisma } from "./config/index.js";
import { createSocketServer } from "./socket/index.js";

const httpServer = createServer(createApp());
const io = createSocketServer(httpServer);

httpServer.on("error", (error) => {
  logger.error({ err: error }, "HTTP server error");
  process.exitCode = 1;
});

httpServer.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT, host: "0.0.0.0" }, "Chat backend listening");
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "Shutting down chat backend");

  io.close(() => {
    void prisma
      .$disconnect()
      .then(() => logger.info("Socket.IO, HTTP server, and Prisma client closed"))
      .catch((error: unknown) => {
        logger.error({ err: error }, "Failed to disconnect Prisma client");
        process.exitCode = 1;
      });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);