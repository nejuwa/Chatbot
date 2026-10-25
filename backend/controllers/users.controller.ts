import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { removeStoredFile, readStoredFile } from "../services/files.service.js";
import {
  cloudinaryReferenceForAvatar,
  isCloudinaryConfigured,
  uploadCloudinaryAsset,
} from "../services/cloudinary-storage.service.js";

export const searchUsersSchema = z.object({
  query: z.string().trim().min(2).max(100),
});
export const updateProfileSchema = z.object({
  displayName: z.string().trim().max(100).nullable(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/).nullable(),
  bio: z.string().trim().max(500).nullable(),
});
export const createContactSchema = z.object({
  userId: z.string().trim().min(1).max(128),
});
export const contactIdSchema = z.object({
  contactId: z.string().trim().min(1).max(128),
});

const avatarTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function validAvatar(file: Express.Multer.File) {
  if (file.mimetype === "image/jpeg") {
    return file.buffer.length >= 3 && file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
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

function publicUserSelect() {
  return {
    id: true,
    email: true,
    displayName: true,
    username: true,
    bio: true,
    avatarUrl: true,
    status: true,
    lastSeen: true,
  } as const;
}

export const getCurrentUser: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: publicUserSelect(),
  });

  if (!user) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  res.status(200).json({ data: user });
};

export const updateCurrentUser: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Profile fields are invalid. Usernames must be 3-32 letters, numbers, or underscores.",
      },
    });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: parsed.data,
      select: publicUserSelect(),
    });
    res.status(200).json({ data: user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({
        error: { code: "USERNAME_TAKEN", message: "That username is already in use." },
      });
      return;
    }
    throw error;
  }
};

export const searchUsers: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  const parsed = searchUsersSchema.safeParse(
    req.method === "GET" ? { query: req.query.q } : req.body,
  );
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "User search query must contain 2 to 100 characters",
      },
    });
    return;
  }

  const query = parsed.data.query;
  const users = await prisma.user.findMany({
    where: {
      id: { not: req.userId },
      email: { not: "ai-assistant@system.invalid" },
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
    take: 10,
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      status: true,
    },
  });

  res.status(200).json({ data: users });
};

export const listContacts: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const contacts = await prisma.userContact.findMany({
    where: {
      ownerId: req.userId,
      contact: { email: { not: "ai-assistant@system.invalid" } },
    },
    orderBy: [{ contact: { displayName: "asc" } }, { contact: { email: "asc" } }],
    select: {
      contact: {
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          status: true,
          lastSeen: true,
        },
      },
    },
  });
  res.status(200).json({ data: contacts.map(({ contact }) => contact) });
};

export const createContact: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const parsed = createContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A valid user ID is required." } });
    return;
  }
  if (parsed.data.userId === req.userId) {
    res.status(400).json({ error: { code: "INVALID_CONTACT", message: "You cannot add yourself as a contact." } });
    return;
  }
  const contact = await prisma.user.findFirst({
    where: { id: parsed.data.userId, email: { not: "ai-assistant@system.invalid" } },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      status: true,
      lastSeen: true,
    },
  });
  if (!contact) {
    res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found." } });
    return;
  }
  await prisma.userContact.upsert({
    where: { ownerId_contactId: { ownerId: req.userId, contactId: contact.id } },
    create: { ownerId: req.userId, contactId: contact.id },
    update: {},
  });
  res.status(201).json({ data: contact });
};

export const deleteContact: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const parsed = contactIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid contact ID." } });
    return;
  }
  const deleted = await prisma.userContact.deleteMany({
    where: { ownerId: req.userId, contactId: parsed.data.contactId },
  });
  if (deleted.count === 0) {
    res.status(404).json({ error: { code: "CONTACT_NOT_FOUND", message: "Contact not found." } });
    return;
  }
  res.status(204).end();
};

export const saveMessage: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const parsed = z.object({ messageId: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A message ID is required." } });
    return;
  }
  const message = await prisma.message.findFirst({
    where: {
      id: parsed.data.messageId,
      session: { users: { some: { userId: req.userId } } },
    },
    select: { id: true },
  });
  if (!message) {
    res.status(404).json({ error: { code: "MESSAGE_NOT_FOUND", message: "Message not found." } });
    return;
  }
  const saved = await prisma.savedMessage.upsert({
    where: { userId_messageId: { userId: req.userId, messageId: message.id } },
    create: { userId: req.userId, messageId: message.id },
    update: {},
    include: {
      message: {
        include: {
          sender: { select: { id: true, displayName: true, username: true, email: true, avatarUrl: true } },
        },
      },
    },
  });
  res.status(201).json({ data: saved });
};

export const listSavedMessages: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const items = await prisma.savedMessage.findMany({
    where: { userId: req.userId },
    orderBy: { savedAt: "desc" },
    take: 100,
    include: {
      message: {
        include: {
          sender: { select: { id: true, displayName: true, username: true, email: true, avatarUrl: true } },
        },
      },
    },
  });
  res.status(200).json({ data: items });
};

export const uploadProfileAvatar: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const file = req.file;
  const extension = file && avatarTypes.get(file.mimetype);
  if (!file || !extension || !validAvatar(file)) {
    res.status(400).json({
      error: { code: "INVALID_AVATAR", message: "Choose a valid JPEG, PNG, or WebP image." },
    });
    return;
  }
  const previous = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { avatarUrl: true },
  });
  if (!previous) {
    res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found." } });
    return;
  }

  const id = randomUUID();
  let filename = `${id}${extension}`;
  let storedName = path.join("avatars", filename);
  const directory = path.resolve(env.UPLOAD_DIR, "avatars");
  if (isCloudinaryConfigured()) {
    const storedAsset = await uploadCloudinaryAsset(file.buffer, {
      folder: "avatars",
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
  const avatarUrl = `/api/users/${encodeURIComponent(req.userId)}/avatar/${filename}`;
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatarUrl },
      select: publicUserSelect(),
    });
    if (previous.avatarUrl?.startsWith(`/api/users/${req.userId}/avatar/`)) {
      const oldName = previous.avatarUrl.split("/").at(-1);
      if (
        oldName &&
        (/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(oldName) ||
          cloudinaryReferenceForAvatar("avatars", oldName))
      ) {
        const cloudReference = cloudinaryReferenceForAvatar("avatars", oldName);
        await removeStoredFile(
          cloudReference ?? path.join("avatars", oldName),
        );
      }
    }
    res.status(200).json({ data: user });
  } catch (error) {
    await removeStoredFile(storedName);
    throw error;
  }
};

export const getProfileAvatar: RequestHandler = async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const userId = typeof req.params.id === "string" ? req.params.id : "";
  const filename = typeof req.params.filename === "string" ? req.params.filename : "";
  const cloudReference = cloudinaryReferenceForAvatar("avatars", filename);
  const isLocalAvatar = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename);
  if (!cloudReference && !isLocalAvatar) {
    res.status(404).end();
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (user?.avatarUrl !== `/api/users/${encodeURIComponent(userId)}/avatar/${filename}`) {
    res.status(404).end();
    return;
  }
  const extension = path.extname(filename);
  const mimeType = extension === ".jpg"
    ? "image/jpeg"
    : extension === ".png"
      ? "image/png"
      : "image/webp";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.type(mimeType);
  res.send(await readStoredFile(
    cloudReference ?? path.join("avatars", filename),
    mimeType,
  ));
};
