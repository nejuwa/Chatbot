import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";
import { env } from "../config/env.js";

export type CloudinaryResourceType = "image" | "video" | "raw";

export interface StoredCloudinaryAsset {
  storedName: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
}

const referencePrefix = "cloudinary:";
const resourceTypes = new Set(["image", "video", "raw"]);
const credentialsConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET,
);

if (credentialsConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export function isCloudinaryConfigured() {
  return credentialsConfigured;
}

export function createCloudinaryReference(
  resourceType: CloudinaryResourceType,
  publicId: string,
) {
  return `${referencePrefix}${resourceType}:${publicId}`;
}

export function parseCloudinaryReference(
  storedName: string,
): { resourceType: CloudinaryResourceType; publicId: string } | null {
  if (!storedName.startsWith(referencePrefix)) return null;

  const separatorIndex = storedName.indexOf(":", referencePrefix.length);
  if (separatorIndex < 0) return null;

  const resourceType = storedName.slice(referencePrefix.length, separatorIndex);
  const publicId = storedName.slice(separatorIndex + 1);
  if (
    !resourceTypes.has(resourceType) ||
    !publicId ||
    publicId.startsWith("/") ||
    publicId.split("/").some((part) => !part || part === "." || part === "..") ||
    !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?(?:\/[A-Za-z0-9_.-]+)*$/.test(publicId)
  ) {
    return null;
  }

  return {
    resourceType: resourceType as CloudinaryResourceType,
    publicId,
  };
}

export function cloudinaryReferenceForAvatar(
  folder: "avatars" | "group-avatars",
  filename: string,
) {
  const match = /^cloud-([0-9a-f-]{36})\.(jpg|png|webp)$/i.exec(filename);
  if (!match) return null;
  return createCloudinaryReference("image", `${folder}/${match[1]}`);
}

function formatForMimeType(mimeType: string, publicId: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "audio/webm" || mimeType === "video/webm") return "webm";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/plain") return "txt";
  return extname(publicId).slice(1) || mimeType.split("/")[1];
}

function cloudinaryUpload(
  buffer: Buffer,
  options: {
    folder: string;
    publicId: string;
    resourceType: CloudinaryResourceType;
    originalExtension?: string;
  },
) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: `${options.folder}/${options.publicId}${
          options.resourceType === "raw" ? options.originalExtension ?? "" : ""
        }`,
        resource_type: options.resourceType,
        type: "authenticated",
        overwrite: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error("Cloudinary upload completed without an asset response."));
          return;
        }
        resolve(result);
      },
    );
    upload.end(buffer);
  });
}

export async function uploadCloudinaryAsset(
  buffer: Buffer,
  input: {
    folder: "chat-files" | "avatars" | "group-avatars";
    mimeType: string;
    extension: string;
    publicId?: string;
  },
): Promise<StoredCloudinaryAsset> {
  if (!credentialsConfigured) {
    throw new Error("Cloudinary storage is not configured.");
  }

  const resourceType: CloudinaryResourceType = input.mimeType.startsWith("image/")
    ? "image"
    : input.mimeType.startsWith("audio/") || input.mimeType.startsWith("video/")
      ? "video"
      : "raw";
  const result = await cloudinaryUpload(buffer, {
    folder: input.folder,
    publicId: input.publicId ?? randomUUID(),
    resourceType,
    ...(resourceType === "raw" ? { originalExtension: input.extension } : {}),
  });

  return {
    storedName: createCloudinaryReference(resourceType, result.public_id),
    publicId: result.public_id,
    resourceType,
  };
}

export async function readCloudinaryAsset(storedName: string, mimeType: string) {
  const asset = parseCloudinaryReference(storedName);
  if (!credentialsConfigured || !asset) {
    throw new Error("Cloudinary asset reference is invalid or storage is not configured.");
  }

  const signedUrl = cloudinary.utils.private_download_url(
    asset.publicId,
    formatForMimeType(mimeType, asset.publicId),
    {
      resource_type: asset.resourceType,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 60,
      attachment: false,
    },
  );
  const response = await fetch(signedUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Cloudinary asset download failed with status ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteCloudinaryAsset(storedName: string) {
  const asset = parseCloudinaryReference(storedName);
  if (!credentialsConfigured || !asset) {
    throw new Error("Cloudinary asset reference is invalid or storage is not configured.");
  }

  const result = await cloudinary.uploader.destroy(asset.publicId, {
    resource_type: asset.resourceType,
    type: "authenticated",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary asset deletion failed with status ${result.result}.`);
  }
}
