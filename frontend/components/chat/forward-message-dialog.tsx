"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { UserAvatar } from "@/components/chat/user-avatar";
import { NovaAvatar } from "@/components/chat/nova-avatar";
import type { ChatSession, User } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";

export function ForwardMessageDialog({
  sessions,
  currentUser,
  currentSessionId,
  messageType,
  onClose,
  onForward,
}: {
  sessions: ChatSession[];
  currentUser: User;
  currentSessionId: string | null;
  messageType: string;
  onClose: () => void;
  onForward: (sessionId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targets = sessions.filter((session) => session.id !== currentSessionId);

  async function choose(sessionId: string) {
    setBusyId(sessionId);
    setError(null);
    try {
      await onForward(sessionId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not forward the message.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Forward message" onClose={onClose}>
      <div className="grid gap-3 p-4">
        {messageType !== "TEXT" && (
          <p className="rounded-md bg-canvas px-3 py-2 text-xs leading-5 text-muted">
            This forwards the {messageType.toLowerCase()} message as a note. Its original
            attachment cannot be copied to another chat yet.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {targets.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Create another conversation before forwarding a message.
          </p>
        ) : (
          <ul className="grid max-h-[min(55dvh,24rem)] gap-1 overflow-y-auto">
            {targets.map((session) => {
              const peer = session.users.find(
                (participant) =>
                  participant.user.id !== currentUser.id &&
                  participant.user.email !== "ai-assistant@system.invalid",
              );
              const label = session.type === "AI"
                ? session.title === "New chat" ? "Nova" : session.title
                : session.type === "DIRECT"
                  ? peer ? userDisplayName(peer.user) : "Direct chat"
                  : session.title || "Group";
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => void choose(session.id)}
                    disabled={busyId !== null}
                    className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-canvas disabled:opacity-55"
                  >
                    {session.type === "AI" ? (
                      <NovaAvatar className="mb-0 size-10" />
                    ) : session.type === "DIRECT" && peer ? (
                      <UserAvatar user={peer.user} className="size-10" />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                        {(label[0] ?? "G").toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                    {busyId === session.id && (
                      <span role="status" className="text-xs text-muted">Forwarding…</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
