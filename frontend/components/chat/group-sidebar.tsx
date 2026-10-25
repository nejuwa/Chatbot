"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "@/components/chat/conversation-list";
import { CreateGroupModal } from "@/components/chat/create-group-modal";
import type { ChatSession, User } from "@/types/api";

export function GroupSidebar({
  sessions,
  activeSessionId,
  user,
  loading,
  hasMore,
  loadingMore,
  onSelect,
  onCreateGroup,
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
  onCreateGroup: (input: { title: string; participantIds: string[] }) => Promise<boolean>;
  onDelete: (sessionId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onCloseMobile: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  return (
    <>
      <aside className="flex h-full min-h-0 w-full flex-col bg-surface text-ink">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-lg font-semibold tracking-tight">Groups</h2>
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
            <span className="sr-only">Search groups</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              maxLength={100}
              placeholder="Search groups"
              className="h-10 w-full rounded-lg bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <Button type="button" fullWidth onClick={() => setShowCreateModal(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Create Group
          </Button>
        </div>
        <ConversationList
          sessions={filteredSessions}
          activeSessionId={activeSessionId}
          user={user}
          loading={loading}
          emptyMessage={query
            ? "No groups match your search."
            : "You have not joined any groups yet. Create a group to get started."}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onSelect={(id) => {
            onSelect(id);
            onCloseMobile();
          }}
          onDelete={onDelete}
          onLoadMore={onLoadMore}
        />
      </aside>
      {showCreateModal && (
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateGroup}
        />
      )}
    </>
  );
}
