import { MessageRole, MessageType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { prisma } from "../config/prisma.js";
import {
  deleteCloudinaryAsset,
  isCloudinaryConfigured,
  parseCloudinaryReference,
  readCloudinaryAsset,
  uploadCloudinaryAsset,
} from "./cloudinary-storage.service.js";
import { broadcastSessionMessage } from "../socket/index.js";
import { SessionServiceError } from "./service-error.js";

const uploadDirectory = path.resolve(env.UPLOAD_DIR);

const fileTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["audio/webm", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/mp4", ".m4a"],
  ["video/webm", ".webm"],
  ["video/mp4", ".mp4"],
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
]);

function fail(code: string, statusCode: number, message: string): never {
  throw new SessionServiceError(code, statusCode, message);
}

function safeOriginalName(name: string) {
  const normalized = path.basename(name.replace(/\\/g, "/"));
  const cleaned = normalized.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 255) || "download";
}

function validSignature(mimeType: string, buffer: Buffer) {
  switch (mimeType) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/gif":
      return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null;
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "application/pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case "text/plain":
      return !buffer.includes(0);
    case "audio/webm":
      return buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "audio/ogg":
      return buffer.subarray(0, 4).toString("ascii") === "OggS";
    case "audio/mp4":
      return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    case "video/webm":
      return buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "video/mp4":
      return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    default:
      return false;
  }
}

export function isSupportedUpload(file: {
  mimetype: string;
  buffer: Buffer;
}) {
  return (
    fileTypes.has(file.mimetype) &&
    validSignature(file.mimetype, file.buffer)
  );
}

export async function readStoredImage(storedName: string, mimeType: string) {
  if (
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
  ) {
    fail("IMAGE_UNAVAILABLE", 422, "The uploaded image cannot be analyzed");
  }
  return readStoredFile(storedName, mimeType);
}

export async function readStoredFile(storedName: string, mimeType: string) {
  if (storedName.startsWith("cloudinary:")) {
    if (!parseCloudinaryReference(storedName)) {
      fail("FILE_NOT_FOUND", 404, "File not found");
    }
    return readCloudinaryAsset(storedName, mimeType);
  }
  const storedPath = path.resolve(uploadDirectory, storedName);
  if (!storedPath.startsWith(`${uploadDirectory}${path.sep}`)) {
    fail("FILE_NOT_FOUND", 404, "File not found");
  }
  return readFile(storedPath);
}

export async function createSessionFileMessage(
  userId: string,
  sessionId: string,
  file: Express.Multer.File | undefined,
) {
  if (!file) {
    fail("FILE_REQUIRED", 400, "Upload a file using the 'file' field");
  }
  const extension = fileTypes.get(file.mimetype);
  if (!extension || !isSupportedUpload(file)) {
    fail("UNSUPPORTED_FILE_TYPE", 400, "This file type is not supported");
  }

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
      fail("SESSION_NOT_FOUND", 404, "Chat session not found");
    }
    fail("FORBIDDEN", 403, "You are not a participant in this session");
  }

  const fileId = randomUUID();
  let storedName = `${randomUUID()}${extension}`;
  const originalName = safeOriginalName(file.originalname);
  const messageType = file.mimetype.startsWith("image/")
    ? MessageType.IMAGE
    : file.mimetype.startsWith("audio/")
      ? MessageType.VOICE
      : file.mimetype.startsWith("video/")
        ? MessageType.VIDEO
        : MessageType.FILE;
  const content = `/api/sessions/${encodeURIComponent(sessionId)}/files/${fileId}`;

  try {
    if (isCloudinaryConfigured()) {
      const storedAsset = await uploadCloudinaryAsset(file.buffer, {
        folder: "chat-files",
        mimeType: file.mimetype,
        extension,
      });
      storedName = storedAsset.storedName;
    } else {
      await mkdir(uploadDirectory, { recursive: true });
      const storedPath = path.join(uploadDirectory, storedName);
      await writeFile(storedPath, file.buffer, { flag: "wx" });
    }

    const message = await prisma.$transaction(async (transaction) => {
      const currentMembership = await transaction.chatSessionUser.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
        select: { id: true },
      });
      if (!currentMembership) {
        fail("FORBIDDEN", 403, "You are not a participant in this session");
      }
      const created = await transaction.message.create({
        data: {
          sessionId,
          senderId: userId,
          role: MessageRole.USER,
          type: messageType,
          content,
        },
        include: {
          sender: {
            select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
          },
        },
      });
      await transaction.chatFile.create({
        data: {
          id: fileId,
          sessionId,
          uploaderId: userId,
          messageId: created.id,
          storedName,
          originalName,
          mimeType: file.mimetype,
          size: file.size,
        },
      });
      await transaction.chatSession.update({
        where: { id: sessionId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    broadcastSessionMessage(message);
    return message;
  } catch (error) {
    await removeStoredFile(storedName);
    throw error;
  }
}

export async function getSessionFile(
  userId: string,
  sessionId: string,
  fileId: string,
) {
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
      fail("SESSION_NOT_FOUND", 404, "Chat session not found");
    }
    fail("FORBIDDEN", 403, "You are not a participant in this session");
  }

  const file = await prisma.chatFile.findFirst({
    where: { id: fileId, sessionId },
    select: {
      storedName: true,
      originalName: true,
      mimeType: true,
      size: true,
    },
  });
  if (!file) {
    fail("FILE_NOT_FOUND", 404, "File not found");
  }
  return {
    ...file,
    buffer: await readStoredFile(file.storedName, file.mimeType),
  };
}

export async function removeStoredFile(storedName: string) {
  if (storedName.startsWith("cloudinary:")) {
    try {
      if (!parseCloudinaryReference(storedName)) {
        fail("FILE_NOT_FOUND", 404, "Cloudinary asset reference is invalid");
      }
      await deleteCloudinaryAsset(storedName);
    } catch (error) {
      logger.error({ err: error, storedName }, "Failed to remove Cloudinary upload");
    }
    return;
  }

  try {
    const storedPath = path.resolve(uploadDirectory, storedName);
    if (!storedPath.startsWith(`${uploadDirectory}${path.sep}`)) {
      fail("FILE_NOT_FOUND", 404, "Stored file path is invalid");
    }
    await unlink(storedPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    logger.error({ err: error, storedName }, "Failed to remove stored upload");
  }
}
