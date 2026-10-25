import type { Server as HttpServer } from "node:http";
import { MessageRole, MessageType, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { env, logger, prisma } from "../config/index.js";
import { PresenceRegistry } from "./presence.js";
import {
  generateSessionTitleFromFirstMessage,
  maybeGenerateAiReply,
} from "../services/ai.service.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  SendMessageAcknowledgement,
  ServerToClientEvents,
  SocketData,
} from "./types.js";
import type { RealtimeMessage } from "./types.js";
import type {
  ReadMessagePayload,
  SendMessagePayload,
  SessionPayload,
  StatusUpdatePayload,
} from "./types.js";
import { z } from "zod";

const sessionPayloadSchema = z.object({
  sessionId: z.string().min(1).max(128),
});

const sendMessageSchema = sessionPayloadSchema.extend({
  content: z.string().trim().min(1).max(10_000),
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  receiverId: z.string().min(1).max(128).optional(),
});

const readMessageSchema = sessionPayloadSchema.extend({
  messageId: z.string().min(1).max(128),
});

const statusUpdateSchema = z.object({
  status: z.enum([UserStatus.ONLINE, UserStatus.AWAY]),
});

const chatRoom = (sessionId: string) => `chat:${sessionId}`;
const userRoom = (userId: string) => `user:${userId}`;
type ChatSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
let activeSocketServer: ChatSocketServer | undefined;
let activePresenceRegistry: PresenceRegistry | undefined;
const socketEventTimes = new Map<string, number[]>();

function handshakeCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function verifySocketUserId(token: unknown) {
  if (typeof token !== "string" || token.length === 0) {
    return undefined;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const userId = typeof payload === "string" ? undefined : payload.sub;
    return typeof userId === "string" && userId.length > 0 ? userId : undefined;
  } catch {
    return undefined;
  }
}

function consumeSocketEvent(userId: string, event: string, limit: number) {
  const key = `${userId}:${event}`;
  const now = Date.now();
  const cutoff = now - 60_000;
  const timestamps = (socketEventTimes.get(key) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );
  if (timestamps.length >= limit) {
    socketEventTimes.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  socketEventTimes.set(key, timestamps);
  return true;
}

function clearSocketEventLimits(userId: string) {
  const prefix = `${userId}:`;
  for (const key of socketEventTimes.keys()) {
    if (key.startsWith(prefix)) {
      socketEventTimes.delete(key);
    }
  }
}

export function broadcastSessionMessage(message: RealtimeMessage) {
  activeSocketServer?.to(chatRoom(message.sessionId)).emit("message:new", message);
}

export function broadcastMessageUpdated(message: RealtimeMessage) {
  activeSocketServer?.to(chatRoom(message.sessionId)).emit("message:updated", message);
}

export function broadcastAiError(sessionId: string, code: string, message: string) {
  activeSocketServer?.to(chatRoom(sessionId)).emit("ai:error", {
    sessionId,
    code,
    message,
  });
}

export function notifyOnlineReceiver(notification: {
  messageId: string;
  sessionId: string;
  senderId: string;
  preview: string;
  createdAt: Date;
}, receiverId: string) {
  if (!activeSocketServer || !activePresenceRegistry?.has(receiverId)) {
    return;
  }

  activeSocketServer.to(userRoom(receiverId)).emit("notification:new", {
    ...notification,
    createdAt: notification.createdAt.toISOString(),
  });
}

export function broadcastMessageDeleted(
  sessionId: string,
  messageId: string,
  deletedBy: string,
) {
  activeSocketServer?.to(chatRoom(sessionId)).emit("message:deleted", {
    sessionId,
    messageId,
    deletedBy,
  });
}

export function revokeSessionParticipant(sessionId: string, userId: string) {
  if (!activeSocketServer) {
    return;
  }
  void activeSocketServer
    .in(userRoom(userId))
    .socketsLeave(chatRoom(sessionId));
}

export function addSessionParticipantRoom(sessionId: string, userId: string) {
  if (!activeSocketServer) {
    return;
  }
  const userSockets = activeSocketServer.in(userRoom(userId));
  void userSockets.socketsJoin(chatRoom(sessionId));
  userSockets.emit("session:added", { sessionId });
}

export function closeSessionRoom(sessionId: string) {
  if (!activeSocketServer) {
    return;
  }
  const room = chatRoom(sessionId);
  activeSocketServer.to(room).emit("session:deleted", { sessionId });
  void activeSocketServer.in(room).socketsLeave(room);
}

export function broadcastMessageRead(
  sessionId: string,
  messageId: string,
  senderId: string,
  userId: string,
  readAt: Date,
) {
  activeSocketServer?.to(userRoom(senderId)).emit("message:read", {
    sessionId,
    messageId,
    userId,
    readAt: readAt.toISOString(),
  });
}

function emitSocketError(
  socket: Parameters<
    Parameters<SocketIOServer<ClientToServerEvents, ServerToClientEvents>["on"]>[1]
  >[0],
  code: string,
  message: string,
) {
  socket.emit("socket:error", { code, message });
}

function handleOperation(
  socket: Parameters<
    Parameters<SocketIOServer<ClientToServerEvents, ServerToClientEvents>["on"]>[1]
  >[0],
  operation: () => Promise<void>,
  disconnectOnError = false,
  onFailure?: (result: SendMessageAcknowledgement) => void,
) {
  void operation().catch((error: unknown) => {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        userId: socket.data.userId,
      },
      "Socket event failed",
    );
    emitSocketError(socket, "INTERNAL_ERROR", "Unable to process socket event");
    onFailure?.({
      error: { code: "INTERNAL_ERROR", message: "Unable to process socket event" },
    });
    if (disconnectOnError) {
      socket.disconnect(true);
    }
  });
}

function emitTypingToOtherUsers(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
  presence: PresenceRegistry,
  sessionId: string,
  userId: string,
  payload: Parameters<ServerToClientEvents["user:typing"]>[0],
) {
  io.to(chatRoom(sessionId))
    .except(presence.socketIds(userId))
    .emit("user:typing", payload);
}

function emitStatusToOtherUsers(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
  presence: PresenceRegistry,
  sessionId: string,
  userId: string,
  payload: Parameters<ServerToClientEvents["user:status"]>[0],
) {
  io.to(chatRoom(sessionId))
    .except(presence.socketIds(userId))
    .emit("user:status", payload);
}

async function getUserSessionPeers(userId: string) {
  const memberships = await prisma.chatSessionUser.findMany({
    where: { userId },
    select: {
      sessionId: true,
      session: {
        select: {
          users: {
            where: { userId: { not: userId } },
            select: { userId: true },
          },
        },
      },
    },
  });

  return {
    sessionIds: memberships.map((membership) => membership.sessionId),
    peerIds: memberships.flatMap((membership) =>
      membership.session.users.map((participant) => participant.userId),
    ),
  };
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });
  activeSocketServer = io;
  const presence = new PresenceRegistry();
  activePresenceRegistry = presence;

  io.use((socket, next) => {
    let token: unknown = socket.handshake.auth.token;
    if (typeof token !== "string" || token.length === 0) {
      if (socket.handshake.headers.origin !== env.CORS_ORIGIN) {
        next(new Error("Unauthorized"));
        return;
      }
      token = handshakeCookie(
        socket.handshake.headers.cookie,
        env.AUTH_COOKIE_NAME,
      );
    }

    const userId = verifySocketUserId(token);
    if (!userId) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;

    handleOperation(socket, async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        emitSocketError(socket, "UNAUTHORIZED", "User account no longer exists");
        socket.disconnect(true);
        return;
      }

      const { sessionIds, peerIds } = await getUserSessionPeers(userId);
      await socket.join([userRoom(userId), ...sessionIds.map(chatRoom)]);
      if (!socket.connected) {
        return;
      }

      const becameOnline = presence.add(userId, socket.id);
      if (becameOnline) {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { status: UserStatus.ONLINE },
          });
        } catch (error) {
          presence.remove(userId, socket.id);
          socket.disconnect(true);
          throw error;
        }

        for (const sessionId of sessionIds) {
          emitStatusToOtherUsers(io, presence, sessionId, userId, {
            userId,
            status: UserStatus.ONLINE,
            lastSeen: new Date().toISOString(),
          });
        }
      }

      socket.emit("users:online", presence.onlineUserIds(peerIds));
    }, true);

    socket.on("session:join", (payload: SessionPayload) => {
      handleOperation(socket, async () => {
        const parsed = sessionPayloadSchema.safeParse(payload);
        if (!parsed.success) {
          emitSocketError(socket, "VALIDATION_ERROR", "Invalid session ID");
          return;
        }

        const membership = await prisma.chatSessionUser.findUnique({
          where: {
            sessionId_userId: {
              sessionId: parsed.data.sessionId,
              userId,
            },
          },
          select: { id: true },
        });

        if (!membership) {
          emitSocketError(socket, "FORBIDDEN", "You are not a participant in this session");
          return;
        }

        await socket.join(chatRoom(parsed.data.sessionId));
      });
    });

    socket.on("session:leave", (payload: SessionPayload) => {
      const parsed = sessionPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        emitSocketError(socket, "VALIDATION_ERROR", "Invalid session ID");
        return;
      }

      void socket.leave(chatRoom(parsed.data.sessionId));
    });

    socket.on("message:send", (
      payload: SendMessagePayload,
      acknowledge?: (result: SendMessageAcknowledgement) => void,
    ) => {
      const reject = (code: string, message: string) => {
        emitSocketError(socket, code, message);
        acknowledge?.({ error: { code, message } });
      };
      handleOperation(socket, async () => {
        const parsed = sendMessageSchema.safeParse(payload);
        if (!parsed.success) {
          reject("VALIDATION_ERROR", "Invalid message");
          return;
        }

        const { sessionId, content, type, receiverId } = parsed.data;
        if (!consumeSocketEvent(userId, "message:send", 30)) {
          reject("RATE_LIMITED", "Too many messages. Try again shortly.");
          return;
        }
        const membership = await prisma.chatSessionUser.findUnique({
          where: { sessionId_userId: { sessionId, userId } },
          select: { id: true },
        });
        if (!membership) {
          reject("FORBIDDEN", "You are not a participant in this session");
          return;
        }

        if (type === MessageType.SYSTEM) {
          reject("FORBIDDEN", "System messages cannot be sent by users");
          return;
        }

        if (receiverId) {
          const receiverMembership = await prisma.chatSessionUser.findUnique({
            where: { sessionId_userId: { sessionId, userId: receiverId } },
            select: { id: true },
          });
          if (!receiverMembership || receiverId === userId) {
            reject("VALIDATION_ERROR", "Invalid message receiver");
            return;
          }
        }

        const result = await prisma.$transaction(async (transaction) => {
          const currentMembership = await transaction.chatSessionUser.findUnique({
            where: { sessionId_userId: { sessionId, userId } },
            select: { id: true },
          });
          if (!currentMembership) {
            reject("FORBIDDEN", "You are not a participant in this session");
            return null;
          }
          if (receiverId) {
            const receiverMembership = await transaction.chatSessionUser.findUnique({
              where: { sessionId_userId: { sessionId, userId: receiverId } },
              select: { id: true },
            });
            if (!receiverMembership) {
              reject("VALIDATION_ERROR", "Invalid message receiver");
              return null;
            }
          }
          const session = await transaction.chatSession.findUnique({
            where: { id: sessionId },
            select: { title: true },
          });
          if (!session) {
            reject("NOT_FOUND", "Chat session not found");
            return null;
          }

          const created = await transaction.message.create({
            data: {
              sessionId,
              senderId: userId,
              receiverId,
              role: MessageRole.USER,
              type,
              content,
            },
            select: {
              id: true,
              sessionId: true,
              senderId: true,
              receiverId: true,
              role: true,
              type: true,
              content: true,
              isRead: true,
              readAt: true,
              promptTokens: true,
              completionTokens: true,
              createdAt: true,
              sender: {
                select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
              },
            },
          });
          await transaction.chatSession.update({
            where: { id: sessionId },
            data: { lastMessageAt: created.createdAt },
          });
          return {
            message: created,
            titleNeedsGeneration: session.title === "New chat",
          };
        });
        if (!result) {
          return;
        }
        const { message } = result;

        io.to(chatRoom(sessionId)).emit("message:new", message);
        acknowledge?.({ message });

        if (receiverId) {
          notifyOnlineReceiver({
            messageId: message.id,
            sessionId,
            senderId: userId,
            preview: content.slice(0, 160),
            createdAt: message.createdAt,
          }, receiverId);
        }

        if (type === MessageType.TEXT && result.titleNeedsGeneration) {
          void generateSessionTitleFromFirstMessage(sessionId, content);
        }
        void maybeGenerateAiReply(userId, sessionId, message.id);
      }, false, (result) => acknowledge?.(result));
    });

    socket.on("message:read", (payload: ReadMessagePayload) => {
      handleOperation(socket, async () => {
        const parsed = readMessageSchema.safeParse(payload);
        if (!parsed.success) {
          emitSocketError(socket, "VALIDATION_ERROR", "Invalid read receipt");
          return;
        }

        const { sessionId, messageId } = parsed.data;
        if (!consumeSocketEvent(userId, "message:read", 120)) {
          emitSocketError(socket, "RATE_LIMITED", "Too many read receipts. Try again shortly.");
          return;
        }
        const membership = await prisma.chatSessionUser.findUnique({
          where: { sessionId_userId: { sessionId, userId } },
          select: { id: true },
        });
        if (!membership) {
          emitSocketError(socket, "FORBIDDEN", "You are not a participant in this session");
          return;
        }

        const message = await prisma.message.findFirst({
          where: { id: messageId, sessionId },
          select: { id: true, senderId: true, isRead: true, createdAt: true },
        });
        if (!message) {
          emitSocketError(socket, "NOT_FOUND", "Message not found");
          return;
        }
        if (
          !message.senderId ||
          message.senderId === userId
        ) {
          return;
        }

        const readAt = new Date();
        const created = await prisma.$transaction(async (transaction) => {
          const currentMembership = await transaction.chatSessionUser.findUnique({
            where: { sessionId_userId: { sessionId, userId } },
            select: { id: true },
          });
          if (!currentMembership) {
            return false;
          }
          const receipt = await transaction.messageRead.createMany({
            data: [{ messageId, userId, readAt }],
            skipDuplicates: true,
          });
          if (receipt.count === 0) {
            return false;
          }
          await transaction.message.updateMany({
            where: { id: messageId, sessionId, isRead: false },
            data: { isRead: true, readAt },
          });
          await transaction.chatSessionUser.update({
            where: { sessionId_userId: { sessionId, userId } },
            data: { lastReadAt: readAt },
          });
          return true;
        });

        if (created) {
          io.to(userRoom(message.senderId)).emit("message:read", {
            sessionId,
            messageId,
            userId,
            readAt: readAt.toISOString(),
          });
        }
      });
    });

    const handleTyping = (event: "typing:start" | "typing:stop", isTyping: boolean) => {
      socket.on(event, (payload: SessionPayload) => {
        handleOperation(socket, async () => {
          const parsed = sessionPayloadSchema.safeParse(payload);
          if (!parsed.success) {
            emitSocketError(socket, "VALIDATION_ERROR", "Invalid session ID");
            return;
          }
          if (!consumeSocketEvent(userId, event, 60)) {
            emitSocketError(socket, "RATE_LIMITED", "Too many typing updates. Try again shortly.");
            return;
          }

          const membership = await prisma.chatSessionUser.findUnique({
            where: {
              sessionId_userId: {
                sessionId: parsed.data.sessionId,
                userId,
              },
            },
            select: { id: true },
          });
          if (!membership) {
            emitSocketError(socket, "FORBIDDEN", "You are not a participant in this session");
            return;
          }

          emitTypingToOtherUsers(io, presence, parsed.data.sessionId, userId, {
              sessionId: parsed.data.sessionId,
              userId,
              isTyping,
            });
        });
      });
    };

    handleTyping("typing:start", true);
    handleTyping("typing:stop", false);

    socket.on("status:update", (payload: StatusUpdatePayload) => {
      handleOperation(socket, async () => {
        const parsed = statusUpdateSchema.safeParse(payload);
        if (!parsed.success) {
          emitSocketError(socket, "VALIDATION_ERROR", "Invalid presence status");
          return;
        }

        const updated = await prisma.user.update({
          where: { id: userId },
          data: { status: parsed.data.status },
          select: { status: true, lastSeen: true },
        });
        const { sessionIds } = await getUserSessionPeers(userId);

        for (const sessionId of sessionIds) {
          emitStatusToOtherUsers(io, presence, sessionId, userId, {
            userId,
            status: updated.status,
            lastSeen: updated.lastSeen.toISOString(),
          });
        }
      });
    });

    socket.on("disconnect", () => {
      if (!presence.remove(userId, socket.id)) {
        return;
      }
      clearSocketEventLimits(userId);

      handleOperation(socket, async () => {
        const lastSeen = new Date();
        const user = await prisma.user.update({
          where: { id: userId },
          data: { status: UserStatus.OFFLINE, lastSeen },
          select: {
            sessions: {
              select: { sessionId: true },
            },
          },
        });

        for (const membership of user.sessions) {
          io.to(chatRoom(membership.sessionId)).emit("user:status", {
            userId,
            status: UserStatus.OFFLINE,
            lastSeen: lastSeen.toISOString(),
          });
        }
      });
    });
  });

  return io;
}
