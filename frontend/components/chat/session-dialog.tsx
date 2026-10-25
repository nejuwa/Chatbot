"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { ChatSession, SessionType, User, UserSearchResult } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";

export function SessionDialog({
  mode,
  initialType = "GROUP",
  user,
  session,
  busy,
  error,
  onClose,
  onCreate,
  onInvite,
  onRemove,
}: {
  mode: "create" | "participants";
  initialType?: "DIRECT" | "GROUP";
  user: User;
  session?: ChatSession;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: { type: SessionType; title?: string; participantIds?: string[] }) => Promise<void>;
  onInvite: (userId: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const [type, setType] = useState<SessionType>(initialType);
  const [title, setTitle] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate({
      type,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(type === "GROUP" || type === "DIRECT"
        ? { participantIds: selectedUsers.map((participant) => participant.id) }
        : {}),
    });
  }

  const currentRole = session?.users.find((participant) => participant.user.id === user.id)?.role;
  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";

  return (
    <Modal
      title={mode === "create" ? "New conversation" : "Participants"}
      onClose={onClose}
    >
      <div className="grid gap-5 p-5">
        {error && <ErrorBanner message={error} />}
        {mode === "create" ? (
          <form onSubmit={(event) => void create(event)} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              Conversation type
              <select
                value={type}
                onChange={(event) => {
                  const selectedType = event.currentTarget.value;
                  if (selectedType === "AI" || selectedType === "DIRECT" || selectedType === "GROUP") {
                    setType(selectedType);
                    if (selectedType === "DIRECT") {
                      setSelectedUsers((current) => current.slice(0, 1));
                    }
                  }
                }}
                className="min-h-11 rounded-md border border-line bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                <option value="AI">Nova assistant</option>
                <option value="DIRECT">Direct conversation</option>
                <option value="GROUP">Group conversation</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Name <span className="font-normal text-muted">Optional, up to 120 characters</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                className="min-h-11 rounded-md border border-line px-3 focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>
            {type !== "AI" && (
              <div className="grid gap-3">
                <UserSearch
                  label="Find participants by name or email"
                  actionLabel="Add"
                  onSelect={async (participant) => {
                    setSelectedUsers((current) => current.some((item) => item.id === participant.id)
                      ? current
                      : [...current, participant]);
                  }}
                  isSelected={(participant) =>
                    selectedUsers.some((item) => item.id === participant.id) ||
                    (type === "DIRECT" && selectedUsers.length > 0)
                  }
                />
                <ul className="grid gap-2" aria-label="Selected participants">
                  {selectedUsers.map((participant) => (
                    <li key={participant.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {userDisplayName(participant)}
                        </span>
                        <span className="block truncate text-xs text-muted">{participant.email}</span>
                      </span>
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() => setSelectedUsers((current) =>
                          current.filter((item) => item.id !== participant.id),
                        )}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
                {selectedUsers.length === 0 && (
                  <p className="text-xs text-muted">
                    Search for at least one person to start this conversation.
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
              <Button
                type="submit"
                disabled={busy || (type !== "AI" && selectedUsers.length === 0)}
              >
                {busy ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <ul className="grid gap-2" aria-label="Session participants">
              {session?.users.map((participant) => {
                const isSelf = participant.user.id === user.id;
                const removable =
                  canManage &&
                  !isSelf &&
                  participant.role !== "OWNER" &&
                  participant.user.email !== "ai-assistant@system.invalid" &&
                  (currentRole === "OWNER" || participant.role === "MEMBER");
                return (
                  <li key={participant.user.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{userDisplayName(participant.user)}</span>
                      <span className="block truncate text-xs text-muted">
                        {participant.role.toLowerCase()} · {participant.user.status.toLowerCase()}
                        {isSelf ? " · you" : ""}
                      </span>
                    </span>
                    {removable && (
                      <Button type="button" variant="quiet" disabled={busy} onClick={() => void onRemove(participant.user.id)}>
                        Remove
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {session?.type === "GROUP" && canManage && (
              <div className="border-t border-line pt-4">
                <UserSearch
                  label="Find someone to invite by name or email"
                  actionLabel="Invite"
                  onSelect={(participant) => onInvite(participant.id)}
                  isSelected={(participant) =>
                    session.users.some((item) => item.user.id === participant.id)
                  }
                />
              </div>
            )}
            {!canManage && (
              <p className="text-sm text-muted">Only the session owner or an administrator can manage group participants.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function UserSearch({
  label,
  actionLabel,
  onSelect,
  isSelected,
}: {
  label: string;
  actionLabel: string;
  onSelect: (user: UserSearchResult) => Promise<void>;
  isSelected: (user: UserSearchResult) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      setResults(await api.users.search(query.trim()));
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : "Could not search users.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function select(participant: UserSearchResult) {
    setActingOn(participant.id);
    setSearchError(null);
    try {
      await onSelect(participant);
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : "Could not add this participant.");
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <label className="grid gap-1.5 text-sm font-medium">
          {label}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            minLength={2}
            maxLength={100}
            autoComplete="off"
            placeholder="Enter a name or email"
            className="min-h-11 rounded-md border border-line px-3 font-normal focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <Button type="button" variant="secondary" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>
      {searchError && <p role="alert" className="text-sm text-danger">{searchError}</p>}
      {results.length > 0 ? (
        <ul className="grid gap-2" aria-label="User search results">
          {results.map((participant) => {
            const selected = isSelected(participant);
            return (
              <li key={participant.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {userDisplayName(participant)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {participant.email} · {participant.status.toLowerCase()}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={selected || actingOn === participant.id}
                  onClick={() => void select(participant)}
                >
                  {selected ? "Added" : actingOn === participant.id ? "Working…" : actionLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        !searching && query.length > 0 && !searchError && (
          <p className="text-sm text-muted">
            {query.trim().length < 2 ? "Enter at least two characters to search." : "No users found."}
          </p>
        )
      )}
    </div>
  );
}
