import {
  ParticipantRole,
  Prisma,
  SessionType,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AI_USER_DISPLAY_NAME, AI_USER_EMAIL } from "../auth/constants.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import { readStoredFile, removeStoredFile } from "./files.service.js";
import {
  cloudinaryReferenceForAvatar,
  isCloudinaryConfigured,
  uploadCloudinaryAsset,
} from "./cloudinary-storage.service.js";
import { SessionServiceError } from "./service-error.js";

export { SessionServiceError } from "./service-error.js";

export const createSessionSchema = z
  .object({
    type: z.nativeEnum(SessionType),
    participantIds: z.array(z.string().min(1).max(128)).max(99).optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.participantIds && new Set(input.participantIds).size !== input.participantIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantIds"],
        message: "Participant IDs must be unique",
      });
    }

    if (input.type === SessionType.DIRECT && input.participantIds?.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantIds"],
        message: "A direct session requires exactly one other participant",
      });
    }

    if (input.type === SessionType.GROUP && (input.participantIds?.length ?? 0) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantIds"],
        message: "A group session requires at least one other participant",
      });
    }

    if (input.type === SessionType.AI && (input.participantIds?.length ?? 0) !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantIds"],
        message: "An AI session cannot include other human participants",
      });
    }
  });

export const renameSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const updateGroupProfileSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable(),
});

export const inviteParticipantSchema = z.object({
  userId: z.string().min(1).max(128),
});

export const sessionIdSchema = z.object({
  id: z.string().min(1).max(128),
});

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const sessionParticipantSelect = {
  id: true,
  role: true,
  joinedAt: true,
  lastReadAt: true,
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      bio: true,
      avatarUrl: true,
      status: true,
      lastSeen: true,
    },
  },
} satisfies Prisma.ChatSessionUserSelect;

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

async function requireSessionParticipant(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
) {
  const participant = await transaction.chatSessionUser.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: {
      id: true,
      role: true,
      session: { select: { id: true, type: true, ownerId: true, avatarUrl: true } },
    },
  });

  if (!participant) {
    const session = await transaction.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throwNotFound();
    }

    throwForbidden();
  }

  return participant;
}

async function requireManager(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
) {
  const participant = await requireSessionParticipant(transaction, sessionId, userId);
  if (
    participant.role !== ParticipantRole.OWNER &&
    participant.role !== ParticipantRole.ADMIN
  ) {
    throwForbidden();
  }

  return participant;
}

export async function getOrCreateAiUser(transaction: Prisma.TransactionClient) {
  const user = await transaction.user.upsert({
    where: { email: AI_USER_EMAIL },
    create: {
      email: AI_USER_EMAIL,
      displayName: AI_USER_DISPLAY_NAME,
    },
    update: {
      displayName: AI_USER_DISPLAY_NAME,
      status: UserStatus.OFFLINE,
    },
    select: { id: true, passwordHash: true, googleId: true },
  });

  if (user.passwordHash || user.googleId) {
    throw new SessionServiceError(
      "AI_PARTICIPANT_CONFLICT",
      500,
      "The reserved AI participant account is occupied",
    );
  }

  return { id: user.id };
}

export async function createSession(
  userId: string,
  input: z.output<typeof createSessionSchema>,
) {
  return prisma.$transaction(async (transaction) => {
    const participantIds = input.participantIds ?? [];
    if (participantIds.includes(userId)) {
      throw new SessionServiceError(
        "DUPLICATE_PARTICIPANT",
        400,
        "You cannot add yourself as another participant",
      );
    }

    const otherUsers = participantIds.length
      ? await transaction.user.findMany({
          where: {
            id: { in: participantIds },
            email: { not: AI_USER_EMAIL },
          },
          select: { id: true },
        })
      : [];

    if (otherUsers.length !== participantIds.length) {
      throw new SessionServiceError(
        "PARTICIPANT_NOT_FOUND",
        404,
        "One or more participants were not found",
      );
    }

    if (input.type === SessionType.DIRECT) {
      const existingCandidates = await transaction.chatSession.findMany({
        where: {
          type: SessionType.DIRECT,
          AND: [
            { users: { some: { userId } } },
            { users: { some: { userId: participantIds[0] } } },
          ],
        },
        include: { users: { select: sessionParticipantSelect } },
      });
      const existing = existingCandidates.find((session) =>
        session.users.some((participant) => participant.user.id === userId) &&
        session.users.some((participant) => participant.user.id === participantIds[0]) &&
        session.users.every((participant) =>
          participant.user.id === userId ||
          participant.user.id === participantIds[0] ||
          participant.user.email === AI_USER_EMAIL,
        ),
      );
      if (existing) return existing;
    }

    const users = [
      { userId, role: ParticipantRole.OWNER },
      ...participantIds.map((participantId) => ({
        userId: participantId,
        role: ParticipantRole.MEMBER,
      })),
    ];

    if (input.type === SessionType.AI) {
      const aiUser = await getOrCreateAiUser(transaction);
      users.push({ userId: aiUser.id, role: ParticipantRole.MEMBER });
    }

    return transaction.chatSession.create({
      data: {
        type: input.type,
        title: input.title,
        ownerId: userId,
        users: {
          create: users.map(({ userId: participantId, role }) => ({
            role,
            user: { connect: { id: participantId } },
          })),
        },
      },
      include: {
        users: { select: sessionParticipantSelect },
      },
    });
  });
}

export async function listSessions(
  userId: string,
  input: z.output<typeof paginationQuerySchema>,
) {
  if (input.cursor) {
    const cursorIsParticipant = await prisma.chatSessionUser.findFirst({
      where: { userId, sessionId: input.cursor },
      select: { id: true },
    });
    if (!cursorIsParticipant) {
      throw new SessionServiceError("INVALID_CURSOR", 400, "Invalid session cursor");
    }
  }

  const sessions = await prisma.chatSession.findMany({
    where: { users: { some: { userId } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1,
    include: {
      users: { select: sessionParticipantSelect },
      messages: {
        where: { hiddenBy: { none: { userId } } },
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          senderId: true,
          type: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  const hasMore = sessions.length > input.limit;
  const items = sessions.slice(0, input.limit);

  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  };
}

export async function getSession(
  userId: string,
  sessionId: string,
  input: z.output<typeof paginationQuerySchema>,
) {
  const session = await prisma.chatSession.findFirst({
    where: {
      id: sessionId,
      users: { some: { userId } },
    },
    include: {
      users: { select: sessionParticipantSelect },
    },
  });

  if (!session) {
    const exists = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!exists) {
      throwNotFound();
    }

    throwForbidden();
  }

  if (input.cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: { id: input.cursor, sessionId },
      select: { id: true },
    });
    if (!cursorMessage) {
      throw new SessionServiceError("INVALID_CURSOR", 400, "Invalid message cursor");
    }
  }

  const descendingMessages = await prisma.message.findMany({
    where: { sessionId, hiddenBy: { none: { userId } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1,
    include: {
      sender: {
        select: { id: true, displayName: true, username: true, email: true, avatarUrl: true },
      },
      readReceipts: {
        select: { userId: true, readAt: true },
      },
    },
  });
  const groupedMediaCounts = await prisma.message.groupBy({
    by: ["type"],
    where: { sessionId, hiddenBy: { none: { userId } } },
    _count: { _all: true },
  });

  const hasMore = descendingMessages.length > input.limit;
  const page = descendingMessages.slice(0, input.limit);

  return {
    session: {
      ...session,
      mediaCounts: {
        photos: groupedMediaCounts.find((group) => group.type === "IMAGE")?._count._all ?? 0,
        videos: groupedMediaCounts.find((group) => group.type === "VIDEO")?._count._all ?? 0,
        files: groupedMediaCounts.find((group) => group.type === "FILE")?._count._all ?? 0,
        voice: groupedMediaCounts.find((group) => group.type === "VOICE")?._count._all ?? 0,
      },
    },
    messages: page.reverse(),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function renameSession(
  userId: string,
  sessionId: string,
  title: string,
) {
  return prisma.$transaction(async (transaction) => {
    const participant = await requireManager(transaction, sessionId, userId);
    if (
      participant.role === ParticipantRole.ADMIN &&
      participant.session.ownerId !== userId
    ) {
      const owner = await transaction.chatSessionUser.findUnique({
        where: {
          sessionId_userId: {
            sessionId,
            userId: participant.session.ownerId,
          },
        },
        select: { role: true },
      });
      if (owner?.role !== ParticipantRole.OWNER) {
        throwForbidden();
      }
    }

    return transaction.chatSession.update({
      where: { id: sessionId },
      data: { title },
      include: { users: { select: sessionParticipantSelect } },
    });
  });
}

async function requireGroupOwner(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
) {
  const participant = await requireSessionParticipant(transaction, sessionId, userId);
  if (
    participant.session.type !== SessionType.GROUP ||
    participant.session.ownerId !== userId
  ) {
    throwForbidden();
  }
  return participant;
}

export async function updateGroupProfile(
  userId: string,
  sessionId: string,
  input: z.output<typeof updateGroupProfileSchema>,
) {
  return prisma.$transaction(async (transaction) => {
    await requireGroupOwner(transaction, sessionId, userId);
    return transaction.chatSession.update({
      where: { id: sessionId },
      data: { title: input.title, description: input.description },
      include: { users: { select: sessionParticipantSelect } },
    });
  });
}

const groupAvatarTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function validGroupAvatar(file: Express.Multer.File) {
  if (file.mimetype === "image/jpeg") {
    return file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff;
  }
  if (file.mimetype === "image/png") {
    return file.buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }
  return file.mimetype === "image/webp" &&
    file.buffer.length >= 12 &&
    file.buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    file.buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export async function uploadGroupAvatar(
  userId: string,
  sessionId: string,
  file: Express.Multer.File | undefined,
) {
  const extension = file && groupAvatarTypes.get(file.mimetype);
  if (!file || !extension || !validGroupAvatar(file)) {
    throw new SessionServiceError(
      "INVALID_AVATAR",
      400,
      "Choose a valid JPEG, PNG, or WebP group photo.",
    );
  }

  await prisma.$transaction((transaction) =>
    requireGroupOwner(transaction, sessionId, userId),
  );

  const directory = path.resolve(env.UPLOAD_DIR, "group-avatars");
  const id = randomUUID();
  let filename = `${id}${extension}`;
  let storedName = path.join("group-avatars", filename);

  try {
    if (isCloudinaryConfigured()) {
      const storedAsset = await uploadCloudinaryAsset(file.buffer, {
        folder: "group-avatars",
        mimeType: file.mimetype,
        extension,
        publicId: id,
      });
      filename = `cloud-${id}${extension}`;
      storedName = storedAsset.storedName;
    } else {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, filename), file.buffer, { flag: "wx" });
    }

    const { updated, previousAvatarUrl } = await prisma.$transaction(async (transaction) => {
      const participant = await requireGroupOwner(transaction, sessionId, userId);
      const updatedSession = await transaction.chatSession.update({
        where: { id: sessionId },
        data: { avatarUrl: `/api/sessions/${encodeURIComponent(sessionId)}/avatar/${filename}` },
        include: { users: { select: sessionParticipantSelect } },
      });
      return { updated: updatedSession, previousAvatarUrl: participant.session.avatarUrl };
    });
    if (
      previousAvatarUrl?.startsWith(`/api/sessions/${encodeURIComponent(sessionId)}/avatar/`)
    ) {
      const previousFilename = previousAvatarUrl.split("/").at(-1);
      const cloudReference = previousFilename &&
        cloudinaryReferenceForAvatar("group-avatars", previousFilename);
      if (
        previousFilename &&
        (/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(previousFilename) || cloudReference)
      ) {
        await removeStoredFile(
          cloudReference ?? path.join("group-avatars", previousFilename),
        );
      }
    }
    return updated;
  } catch (error) {
    await removeStoredFile(storedName);
    throw error;
  }
}

export async function getGroupAvatar(
  userId: string,
  sessionId: string,
  filename: string,
) {
  const cloudReference = cloudinaryReferenceForAvatar("group-avatars", filename);
  const isLocalAvatar = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename);
  if (!cloudReference && !isLocalAvatar) {
    throwNotFound();
  }
  const participant = await prisma.chatSessionUser.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { id: true },
  });
  if (!participant) {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) throwNotFound();
    throwForbidden();
  }
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { avatarUrl: true },
  });
  if (
    session?.avatarUrl !==
    `/api/sessions/${encodeURIComponent(sessionId)}/avatar/${filename}`
  ) {
    throwNotFound();
  }
  const mimeType = filename.endsWith(".jpg")
    ? "image/jpeg"
    : filename.endsWith(".png")
      ? "image/png"
      : "image/webp";
  return {
    buffer: await readStoredFile(
      cloudReference ?? path.join("group-avatars", filename),
      mimeType,
    ),
    mimeType,
  };
}

export async function deleteSession(userId: string, sessionId: string) {
  const { storedNames, avatarUrl } = await prisma.$transaction(async (transaction) => {
    const participant = await requireSessionParticipant(transaction, sessionId, userId);
    if (
      participant.role !== ParticipantRole.OWNER ||
      participant.session.ownerId !== userId
    ) {
      throwForbidden();
    }

    const files = await transaction.chatFile.findMany({
      where: { sessionId },
      select: { storedName: true },
    });
    await transaction.chatSession.delete({ where: { id: sessionId } });
    return {
      storedNames: files.map((file) => file.storedName),
      avatarUrl: participant.session.avatarUrl,
    };
  });
  await Promise.all(storedNames.map(removeStoredFile));
  const filename = avatarUrl?.split("/").at(-1);
  if (
    avatarUrl?.startsWith(`/api/sessions/${encodeURIComponent(sessionId)}/avatar/`) &&
    filename &&
    (/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename) ||
      cloudinaryReferenceForAvatar("group-avatars", filename))
  ) {
    const cloudReference = cloudinaryReferenceForAvatar("group-avatars", filename);
    await removeStoredFile(
      cloudReference ??
      path.join("group-avatars", filename),
    );
  }
}

export async function inviteParticipant(
  userId: string,
  sessionId: string,
  invitedUserId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const participant = await requireManager(transaction, sessionId, userId);
    if (participant.session.type !== SessionType.GROUP) {
      throw new SessionServiceError(
        "INVALID_SESSION_TYPE",
        409,
        "Participants can only be invited to group sessions",
      );
    }

    const invitee = await transaction.user.findFirst({
      where: { id: invitedUserId, email: { not: AI_USER_EMAIL } },
      select: { id: true },
    });
    if (!invitee) {
      throw new SessionServiceError(
        "PARTICIPANT_NOT_FOUND",
        404,
        "User to invite was not found",
      );
    }

    const existing = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId: invitedUserId } },
      select: { id: true },
    });
    if (existing) {
      throw new SessionServiceError(
        "ALREADY_PARTICIPANT",
        409,
        "User is already a participant",
      );
    }

    return transaction.chatSessionUser.create({
      data: { sessionId, userId: invitedUserId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
        },
      },
    });
  });
}

export async function removeParticipant(
  userId: string,
  sessionId: string,
  targetUserId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const actor = await requireManager(transaction, sessionId, userId);
    if (targetUserId === actor.session.ownerId) {
      throw new SessionServiceError(
        "OWNER_CANNOT_BE_REMOVED",
        409,
        "The session owner cannot be removed",
      );
    }

    const target = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId: targetUserId } },
      select: { id: true, role: true, user: { select: { email: true } } },
    });
    if (!target) {
      throw new SessionServiceError(
        "PARTICIPANT_NOT_FOUND",
        404,
        "Session participant not found",
      );
    }
    if (
      target.user.email === AI_USER_EMAIL ||
      (actor.role === ParticipantRole.ADMIN &&
        target.role !== ParticipantRole.MEMBER)
    ) {
      throwForbidden();
    }

    await transaction.chatSessionUser.delete({ where: { id: target.id } });
  });
}

export async function leaveSession(userId: string, sessionId: string) {
  return prisma.$transaction(async (transaction) => {
    const participant = await requireSessionParticipant(transaction, sessionId, userId);
    const remaining = await transaction.chatSessionUser.findMany({
      where: { sessionId, userId: { not: userId } },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { email: true } },
      },
    });
    const remainingHumans = remaining.filter(
      (entry) => entry.user.email !== AI_USER_EMAIL,
    );

    if (remainingHumans.length === 0) {
      await transaction.chatSession.delete({ where: { id: sessionId } });
      return { deleted: true };
    }

    if (participant.session.ownerId === userId) {
      const nextOwner = remainingHumans[0];
      await transaction.chatSession.update({
        where: { id: sessionId },
        data: {
          ownerId: nextOwner.userId,
          users: {
            update: [
              { where: { id: nextOwner.id }, data: { role: ParticipantRole.OWNER } },
              {
                where: { id: participant.id },
                data: { role: ParticipantRole.MEMBER },
              },
            ],
          },
        },
      });
    }

    await transaction.chatSessionUser.delete({ where: { id: participant.id } });
    return { deleted: false };
  });
}

export async function addAiParticipant(userId: string, sessionId: string) {
  return prisma.$transaction(async (transaction) => {
    await requireSessionParticipant(transaction, sessionId, userId);
    const aiUser = await getOrCreateAiUser(transaction);
    const existing = await transaction.chatSessionUser.findUnique({
      where: { sessionId_userId: { sessionId, userId: aiUser.id } },
      select: { id: true },
    });

    if (existing) {
      return { added: false, participantId: existing.id };
    }

    const created = await transaction.chatSessionUser.create({
      data: {
        sessionId,
        userId: aiUser.id,
        role: ParticipantRole.MEMBER,
      },
      select: { id: true },
    });

    return { added: true, participantId: created.id };
  });
}
