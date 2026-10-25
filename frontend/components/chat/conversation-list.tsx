"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NovaAvatar } from "@/components/chat/nova-avatar";
import { UserAvatar } from "@/components/chat/user-avatar";
import { GroupAvatar } from "@/components/chat/group-avatar";
import type { ChatSession, User } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";

export function ConversationList({
  sessions,
  activeSessionId,
  user,
  loading,
  emptyMessage,
  hasMore,
  loadingMore,
  onSelect,
  onDelete,
  onLoadMore,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  user: User;
  loading: boolean;
  emptyMessage: string;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteSession(event: React.MouseEvent, sessionId: string) {
    event.stopPropagation();
    if (!onDelete) return;
    setDeletingId(sessionId);
    setError(null);
    try {
      await onDelete(sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete conversation.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
      {error && <p role="alert" className="px-3 py-2 text-sm text-danger">{error}</p>}
      {loading ? (
        <div className="grid gap-2 p-2" aria-label="Loading conversations">
          <div className="h-11 rounded-md bg-line/70" />
          <div className="h-11 rounded-md bg-line/70" />
          <div className="h-11 rounded-md bg-line/70" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="px-3 py-3 text-sm leading-6 text-muted">{emptyMessage}</p>
      ) : (
        <ul className="grid gap-1">
          {sessions.map((session) => {
            const otherParticipants = session.users.filter(
              (participant) => participant.user.id !== user.id,
            );
            const contact = otherParticipants.find(
              (participant) => participant.user.email !== "ai-assistant@system.invalid",
            );
            const title = session.type === "DIRECT"
              ? contact ? userDisplayName(contact.user) : "Direct chat"
              : session.type === "AI"
                ? session.title === "New chat" ? "Nova" : session.title
                : session.title || "Group";

            return (
            <li key={session.id}>
              <div className="group relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  aria-current={activeSessionId === session.id ? "page" : undefined}
                  className={`flex min-h-[4.25rem] min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    activeSessionId === session.id
                      ? "bg-accent-soft font-medium text-ink"
                      : "text-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {session.type === "AI" ? (
                    <NovaAvatar className="mb-0 size-10" />
                  ) : session.type === "DIRECT" && contact ? (
                    <UserAvatar user={contact.user} className="size-10" />
                  ) : session.type === "GROUP" ? (
                    <GroupAvatar title={session.title} avatarUrl={session.avatarUrl} className="size-10" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Bot aria-hidden="true" className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{title}</span>
                    <span className="mt-1 block truncate text-xs font-normal text-muted">
                      {session.messages?.[0]?.content ?? "No messages yet"}
                    </span>
                  </span>
                </button>
                {onDelete && session.ownerId === user.id && (
                  <button
                    type="button"
                    onClick={(event) => void deleteSession(event, session.id)}
                    disabled={deletingId === session.id}
                    className="absolute right-2 rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                    aria-label={`Delete ${session.title || "chat"}`}
                  >
                    <span aria-hidden="true">{deletingId === session.id ? "…" : "×"}</span>
                  </button>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <Button
          type="button"
          variant="quiet"
          fullWidth
          className="mt-2"
          disabled={loadingMore}
          onClick={() => void onLoadMore()}
        >
          {loadingMore ? "Loading…" : "Load more conversations"}
        </Button>
      )}
    </div>
  );
}
