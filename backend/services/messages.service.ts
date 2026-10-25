import { MessageRole, MessageType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { removeStoredFile } from "./files.service.js";
import {
  generateSessionTitleFromFirstMessage,
  maybeGenerateAiReply,
} from "./ai.service.js";
import {
  broadcastMessageUpdated,
  broadcastMessageDeleted,
  broadcastMessageRead,
  broadcastSessionMessage,
  notifyOnlineReceiver,
} from "../socket/index.js";
import { SessionServiceError } from "./service-error.js";

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  receiverId: z.string().min(1).max(128).optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export const messagePaginationSchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const readMessageSchema = z.object({
  messageId: z.string().min(1).max(128),
});

function throwNotFound(): never {
  throw new SessionServiceError("SESSION_NOT_FOUND", 404, "Chat session not found");
}

function throwForbidden(): never {
  throw new SessionServiceError(
    "FORBIDDEN",
    403,
    "You do not have permission to perform this action",
  );
}

async function requireSessionParticipant(sessionId: string, userId: string) {
  const membership = await prisma.chatSessionUser.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { id: true },
  });
  if (!membership) {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throwNotFound();
    }
    throwForbidden();
  }
}

function mapMessage(message: {
  id: string;
  sessionId: string;
  senderId: string | null;
  receiverId: string | null;
  role: string;
  type: MessageType;
  content: string;
  isRead: boolean;
  readAt: Date | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: Date;
  sender: {
    id: string;
    email?: string;
    displayName: string | null;
    username?: string | null;
    avatarUrl: string | null;
  } | null;
  readReceipts?: Array<{ userId: string; readAt: Date }>;
}) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    senderId: message.senderId,
    receiverId: message.receiverId,
    role: message.role,
    type: message.type,
    content: message.content,
    isRead: message.isRead,
    readAt: message.readAt,
    promptTokens: message.promptTokens,
    completionTokens: message.completionTokens,
    createdAt: message.createdAt,
    sender: message.sender,
    ...(message.readReceipts ? { readReceipts: message.readReceipts } : {}),
  };
}

export async function listSessionMessages(
  userId: string,
  sessionId: string,
  input: z.output<typeof messagePaginationSchema>,
) {
  await requireSessionParticipant(sessionId, userId);

  if (input.cursor) {
    const message = await prisma.message.findFirst({
      where: { id: input.cursor, sessionId },
      select: { id: true },
    });
    if (!message) {
      throw new SessionServiceError("INVALID_CURSOR", 400, "Invalid message cursor");
    }
  }

  const messages = await prisma.message.findMany({
    where: { sessionId, hiddenBy: { none: { userId } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1,
    include: {
      sender: {
        select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
      },
      readReceipts: {
        select: { userId: true, readAt: true },
      },
    },
  });

  const hasMore = messages.length > input.limit;
  const items = messages.slice(0, input.limit).reverse().map(mapMessage);

  return {
    items,
    nextCursor: hasMore ? items.at(0)?.id ?? null : null,
  };
}

export async function sendSessionMessage(
  userId: string,
  sessionId: string,
  input: z.output<typeof createMessageSchema>,
) {
  await requireSessionParticipant(sessionId, userId);

  if (input.type === MessageType.SYSTEM) {
    throw new SessionServiceError(
      "FORBIDDEN",
      403,
      "System messages cannot be sent by users",
    );
  }

  if (input.receiverId) {
    if (input.receiverId === userId) {
      throw new SessionServiceError(
        "VALIDATION_ERROR",
        400,
        "You cannot send a message to yourself",
      );
    }

    const receiverMembership = await prisma.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId: input.receiverId } },
      select: { id: true },
    });

    if (!receiverMembership) {
      throw new SessionServiceError(
        "VALIDATION_ERROR",
        400,
        "The receiver is not in this session",
      );
    }
  }

  const result = await prisma.$transaction(async (transaction) => {
    const senderMembership = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { id: true },
    });
    if (!senderMembership) {
      throw new SessionServiceError(
        "FORBIDDEN",
        403,
        "You are not a participant in this session",
      );
    }
    if (input.receiverId) {
      const receiverMembership = await transaction.chatSessionUser.findUnique({
        where: { sessionId_userId: { sessionId, userId: input.receiverId } },
        select: { id: true },
      });
      if (!receiverMembership) {
        throw new SessionServiceError(
          "VALIDATION_ERROR",
          400,
          "The receiver is not in this session",
        );
      }
    }
    const session = await transaction.chatSession.findUnique({
      where: { id: sessionId },
      select: { title: true },
    });
    if (!session) {
      throwNotFound();
    }
    const message = await transaction.message.create({
      data: {
        sessionId,
        senderId: userId,
        receiverId: input.receiverId,
        role: MessageRole.USER,
        type: input.type,
        content: input.content,
      },
      include: {
        sender: {
          select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
        },
      },
    });

    await transaction.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: message.createdAt },
    });

    return {
      message: mapMessage(message),
      titleNeedsGeneration: session.title === "New chat",
    };
  });

  const created = result.message;
  broadcastSessionMessage({
    ...created,
    role: created.role,
    receiverId: created.receiverId,
    isRead: created.isRead,
    readAt: created.readAt,
    promptTokens: created.promptTokens,
    completionTokens: created.completionTokens,
    sender: created.sender,
  });

  if (input.receiverId) {
    notifyOnlineReceiver({
      messageId: created.id,
      sessionId,
      senderId: userId,
      preview: created.content.slice(0, 160),
      createdAt: created.createdAt,
    }, input.receiverId);
  }

  if (result.titleNeedsGeneration) {
    void generateSessionTitleFromFirstMessage(sessionId, created.content);
  }
  void maybeGenerateAiReply(userId, sessionId, created.id);
  return created;
}

export async function markMessageRead(
  userId: string,
  sessionId: string,
  messageId: string,
) {
  await requireSessionParticipant(sessionId, userId);

  const message = await prisma.message.findFirst({
    where: { id: messageId, sessionId },
    select: { id: true, senderId: true, isRead: true, createdAt: true },
  });

  if (!message) {
    throw new SessionServiceError("MESSAGE_NOT_FOUND", 404, "Message not found");
  }
  if (!message.senderId || message.senderId === userId) {
    return { updated: false, messageId };
  }

  const readAt = new Date();
  const created = await prisma.$transaction(async (transaction) => {
    const membership = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { id: true },
    });
    if (!membership) {
      throwForbidden();
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

  if (created && message.senderId) {
    broadcastMessageRead(sessionId, messageId, message.senderId, userId, readAt);
  }

  return { updated: created, messageId, ...(created ? { readAt: readAt.toISOString() } : {}) };
}

export async function deleteOwnMessage(
  userId: string,
  sessionId: string,
  messageId: string,
) {
  await requireSessionParticipant(sessionId, userId);

  const result = await prisma.$transaction(async (transaction) => {
    const membership = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { id: true },
    });
    if (!membership) {
      throwForbidden();
    }
    const message = await transaction.message.findFirst({
      where: { id: messageId, sessionId },
      select: {
        id: true,
        senderId: true,
        file: { select: { storedName: true } },
      },
    });

    if (!message) {
      throw new SessionServiceError("MESSAGE_NOT_FOUND", 404, "Message not found");
    }
    if (message.senderId !== userId) {
      throw new SessionServiceError(
        "FORBIDDEN",
        403,
        "You can only delete your own messages",
      );
    }

    await transaction.message.delete({ where: { id: message.id } });

    const session = await transaction.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const latestMessage = await transaction.message.findFirst({
      where: { sessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });

    await transaction.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: latestMessage?.createdAt ?? session.createdAt },
    });

    return {
      deletedMessageId: message.id,
      storedName: message.file?.storedName,
    };
  });

  if (result.storedName) {
    await removeStoredFile(result.storedName);
  }
  broadcastMessageDeleted(sessionId, messageId, userId);
  return { deletedMessageId: result.deletedMessageId };
}

export async function updateOwnMessage(
  userId: string,
  sessionId: string,
  messageId: string,
  input: z.output<typeof updateMessageSchema>,
) {
  await requireSessionParticipant(sessionId, userId);
  const existing = await prisma.message.findFirst({
    where: { id: messageId, sessionId },
    select: { senderId: true, type: true, role: true },
  });
  if (!existing) {
    throw new SessionServiceError("MESSAGE_NOT_FOUND", 404, "Message not found");
  }
  if (existing.senderId !== userId || existing.role !== MessageRole.USER) {
    throw new SessionServiceError("FORBIDDEN", 403, "You can only edit your own messages");
  }
  if (existing.type !== MessageType.TEXT) {
    throw new SessionServiceError("MESSAGE_NOT_EDITABLE", 409, "Only text messages can be edited");
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: input.content },
    include: {
      sender: { select: { id: true, email: true, displayName: true, username: true, avatarUrl: true } },
      readReceipts: { select: { userId: true, readAt: true } },
    },
  });
  const mapped = mapMessage(updated);
  broadcastMessageUpdated(mapped);
  return mapped;
}

export async function clearSessionHistory(userId: string, sessionId: string) {
  await requireSessionParticipant(sessionId, userId);
  return prisma.$transaction(async (transaction) => {
    const messages = await transaction.message.findMany({
      where: { sessionId, hiddenBy: { none: { userId } } },
      select: { id: true },
    });
    if (messages.length === 0) return { hiddenCount: 0 };

    const result = await transaction.messageHidden.createMany({
      data: messages.map(({ id }) => ({ messageId: id, userId })),
      skipDuplicates: true,
    });
    return { hiddenCount: result.count };
  });
}
