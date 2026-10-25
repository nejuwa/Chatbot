"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "@/components/chat/conversation-list";
import { GroupSidebar } from "@/components/chat/group-sidebar";
import { PersonalSidebar } from "@/components/chat/personal-sidebar";
import type { ChatSection } from "@/components/chat/main-navigation";
import type { ChatSession, User, UserSearchResult } from "@/types/api";

export function ChatSidebar({
  sessions,
  hasMoreSessions,
  loadingMoreSessions,
  activeSessionId,
  section,
  user,
  loading,
  mobileMenuOpen,
  onMobileMenuOpenChange,
  onNewChat,
  onNewDirect,
  onSelect,
  onOpenUser,
  onCreateGroup,
  onDeleteSession,
  onLoadMore,
}: {
  sessions: ChatSession[];
  hasMoreSessions: boolean;
  loadingMoreSessions: boolean;
  activeSessionId: string | null;
  section: ChatSection;
  user: User;
  loading: boolean;
  mobileMenuOpen: boolean;
  onMobileMenuOpenChange: (open: boolean) => void;
  onNewChat: () => Promise<void>;
  onNewDirect: () => void;
  onSelect: (id: string) => void;
  onOpenUser: (person: UserSearchResult) => Promise<void>;
  onCreateGroup: (input: { title: string; participantIds: string[] }) => Promise<boolean>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const sectionTitle: Record<ChatSection, string> = {
    personal: "Personal",
    groups: "Groups",
    ai: "AI chats",
  };
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const aiSessions = sessions.filter((session) =>
    session.type === "AI" && (!normalizedSearch || [
      session.title,
      ...(session.messages ?? []).map((message) => message.content),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))),
  );

  async function createAiChat() {
    setBusy(true);
    try {
      await onNewChat();
      onMobileMenuOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  function renderSection() {
    if (section === "personal") {
      return (
        <PersonalSidebar
          sessions={sessions.filter((session) => session.type === "DIRECT")}
          activeSessionId={activeSessionId}
          user={user}
          loading={loading}
          hasMore={hasMoreSessions}
          loadingMore={loadingMoreSessions}
          onSelect={onSelect}
          onOpenUser={onOpenUser}
          onNewDirect={onNewDirect}
          onDelete={onDeleteSession}
          onLoadMore={onLoadMore}
          onCloseMobile={() => onMobileMenuOpenChange(false)}
        />
      );
    }
    if (section === "groups") {
      return (
        <GroupSidebar
          sessions={sessions.filter((session) => session.type === "GROUP")}
          activeSessionId={activeSessionId}
          user={user}
          loading={loading}
          hasMore={hasMoreSessions}
          loadingMore={loadingMoreSessions}
          onSelect={onSelect}
          onCreateGroup={onCreateGroup}
          onDelete={onDeleteSession}
          onLoadMore={onLoadMore}
          onCloseMobile={() => onMobileMenuOpenChange(false)}
        />
      );
    }

    return (
      <aside className="flex h-full min-h-0 w-full flex-col bg-surface text-ink">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-lg font-semibold tracking-tight">{sectionTitle.ai}</h2>
          <Button
            type="button"
            variant="quiet"
            className="min-h-9 px-2 tablet:hidden"
            aria-label="Close conversation menu"
            onClick={() => onMobileMenuOpenChange(false)}
          >
            Close
          </Button>
        </div>
        <div className="grid gap-3 border-b border-line p-3">
          <label className="relative block">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <span className="sr-only">Search AI chats</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search AI chats"
              className="h-10 w-full rounded-lg bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <Button type="button" fullWidth onClick={() => void createAiChat()} disabled={busy}>
            <Plus aria-hidden="true" className="size-4" />
            {busy ? "Creating…" : "New AI chat"}
          </Button>
        </div>
        <ConversationList
          sessions={aiSessions}
          activeSessionId={activeSessionId}
          user={user}
          loading={loading}
          emptyMessage={search
            ? "No AI conversations match your search."
            : "No AI conversations yet. Start a new chat."}
          hasMore={hasMoreSessions}
          loadingMore={loadingMoreSessions}
          onSelect={(id) => {
            onSelect(id);
            onMobileMenuOpenChange(false);
          }}
          onDelete={onDeleteSession}
          onLoadMore={onLoadMore}
        />
      </aside>
    );
  }

  const sidebar = renderSection();
  return (
    <div
      className={`h-full min-h-0 w-full tablet:w-[19rem] tablet:shrink-0 ${
        mobileMenuOpen
          ? "fixed inset-0 z-40 tablet:relative tablet:inset-auto tablet:z-auto"
          : "hidden tablet:block"
      }`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/25 tablet:hidden"
        aria-label="Close conversation menu"
        onClick={() => onMobileMenuOpenChange(false)}
        tabIndex={mobileMenuOpen ? 0 : -1}
      />
      <div
        id="chat-conversation-drawer"
        role={mobileMenuOpen ? "dialog" : undefined}
        aria-label={mobileMenuOpen ? "Your conversations" : undefined}
        aria-modal={mobileMenuOpen ? true : undefined}
        className={`relative z-10 h-full border-r border-line bg-surface ${
          mobileMenuOpen ? "w-[min(20rem,86vw)] tablet:w-full" : "w-full"
        }`}
      >
        {sidebar}
      </div>
    </div>
  );
}
