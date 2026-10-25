"use client";

import { useEffect, useState } from "react";
import type { User } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";
import { api } from "@/lib/api";

function safeAvatarUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("/") ? `${api.baseUrl}${url}` : url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function UserAvatar({
  user,
  className = "",
}: {
  user: Pick<User, "avatarUrl" | "displayName" | "username" | "email"> & {
    status?: User["status"];
  };
  className?: string;
}) {
  const label = userDisplayName(user);
  const avatarUrl = safeAvatarUrl(user.avatarUrl);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center overflow-visible rounded-full border border-line bg-accent-soft font-semibold text-accent ${className}`}
    >
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt=""
          crossOrigin="use-credentials"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      ) : (
        (label.replace(/^@/, "")[0] ?? "U").toUpperCase()
      )}
      {user.status === "ONLINE" && (
        <span
          aria-label="Online"
          title="Online"
          className="absolute bottom-0 right-0 z-10 size-3 rounded-full border-2 border-surface bg-emerald-500"
        />
      )}
    </span>
  );
}
