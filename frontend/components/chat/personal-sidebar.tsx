"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ConversationList } from "@/components/chat/conversation-list";
import { useUserSearch } from "@/hooks/use-user-search";
import type { ChatSession, User, UserSearchResult } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";

export function PersonalSidebar({
  sessions,
  activeSessionId,
  user,
  loading,
  hasMore,
  loadingMore,
  onSelect,
  onOpenUser,
  onNewDirect,
  onDelete,
  onLoadMore,
  onCloseMobile,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  user: User;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (sessionId: string) => void;
  onOpenUser: (person: UserSearchResult) => Promise<void>;
  onNewDirect: () => void;
  onDelete: (sessionId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onCloseMobile: () => void;
}) {
  const [query, setQuery] = useState("");
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const { results, searching, error, canSearch, hasQuery } = useUserSearch(query);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSessions = sessions.filter((session) =>
    [
      session.title,
      ...(session.messages ?? []).map((message) => message.content),
      ...session.users.map((participant) =>
        `${participant.user.username ?? ""} ${participant.user.displayName ?? ""} ${participant.user.email}`,
      ),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );

  async function openUser(person: UserSearchResult) {
    setOpeningUserId(person.id);
    setOpenError(null);
    try {
      await onOpenUser(person);
      onCloseMobile();
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : "Could not open this conversation.");
    } finally {
      setOpeningUserId(null);
    }
  }

  return (
    <>
      <aside className="flex h-full min-h-0 w-full flex-col bg-surface text-ink">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-lg font-semibold tracking-tight">Personal</h2>
          <Button
            type="button"
            variant="quiet"
            className="min-h-9 px-2 tablet:hidden"
            aria-label="Close conversation menu"
            onClick={onCloseMobile}
          >
            Close
          </Button>
        </div>
        <div className="grid gap-3 border-b border-line p-3">
          <label className="relative block">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <span className="sr-only">Search chats or users by username or email</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              maxLength={100}
              autoComplete="off"
              placeholder="Search chats or people"
              className="h-10 w-full rounded-lg bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <Button type="button" fullWidth onClick={onNewDirect}>
            <Plus aria-hidden="true" className="size-4" />
            New chat
          </Button>
        </div>

        {hasQuery ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {error && <p role="alert" className="px-3 py-2 text-sm text-danger">{error}</p>}
            {openError && <p role="alert" className="px-3 py-2 text-sm text-danger">{openError}</p>}
            {!canSearch ? (
              <p className="px-3 py-3 text-sm text-muted">
                Enter at least two characters to search users.
              </p>
            ) : searching ? (
              <p role="status" className="px-3 py-3 text-sm text-muted">Searching users…</p>
            ) : error ? null : results.length > 0 ? (
              <ul className="grid gap-1" aria-label="People search results">
                {results.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => void openUser(person)}
                      disabled={openingUserId !== null}
                      className="flex min-h-[4.25rem] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
                    >
                      <UserAvatar user={person} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {userDisplayName(person)}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {person.email}
                        </span>
                      </span>
                      {openingUserId === person.id && (
                        <span className="text-xs text-muted">Opening…</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
                <p className="text-sm font-medium">User not found</p>
                <p className="text-xs text-muted">
                  Only registered users can start a chat.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-1"
                  onClick={() => setShowContactInfo(true)}
                >
                  Create Contact
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ConversationList
            sessions={filteredSessions}
            activeSessionId={activeSessionId}
            user={user}
            loading={loading}
            emptyMessage="No personal conversations yet. Search for someone or start a new chat."
            hasMore={hasMore}
            loadingMore={loadingMore}
            onSelect={(id) => {
              onSelect(id);
              onCloseMobile();
            }}
            onDelete={onDelete}
            onLoadMore={onLoadMore}
          />
        )}
      </aside>

      {showContactInfo && (
        <Modal title="Create Contact" onClose={() => setShowContactInfo(false)}>
          <div className="grid gap-4 p-5">
            <p className="text-sm leading-6 text-muted">
              This account is not registered, and this app does not yet have a contact
              creation or invitation endpoint. You can start a chat after they create
              an account.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setShowContactInfo(false)}>
                Got it
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
