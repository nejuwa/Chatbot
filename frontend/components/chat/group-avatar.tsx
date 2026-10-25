"use client";

import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import { api } from "@/lib/api";

export function GroupAvatar({
  title,
  avatarUrl,
  className = "",
}: {
  title: string;
  avatarUrl: string | null;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = avatarUrl
    ? /^https?:\/\//i.test(avatarUrl)
      ? avatarUrl
      : `${api.baseUrl}${avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`}`
    : null;

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accent-soft font-semibold text-accent ${className}`}
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          crossOrigin="use-credentials"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : title.trim() ? (
        title.trim().slice(0, 1).toUpperCase()
      ) : (
        <UsersRound className="size-5" />
      )}
    </span>
  );
}
