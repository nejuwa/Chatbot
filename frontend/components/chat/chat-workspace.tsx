"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Ellipsis, Pencil, Trash2, UsersRound, UserRound, Eraser, Phone, LogOut, Sparkles } from "lucide-react";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatWindow } from "@/components/chat/chat-window";
import { MessageInput } from "@/components/chat/message-input";
import { MainNavigation, type ChatSection } from "@/components/chat/main-navigation";
import { NovaAvatar } from "@/components/chat/nova-avatar";
import { UserAvatar } from "@/components/chat/user-avatar";
import { SessionDialog } from "@/components/chat/session-dialog";
import { ForwardMessageDialog } from "@/components/chat/forward-message-dialog";
import { ProfileSidebar } from "@/components/chat/profile-sidebar";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { useTheme } from "@/contexts/theme-context";
import { ApiError, api } from "@/lib/api";
import { CallModal } from "@/components/chat/call-modal";
import { GroupAvatar } from "@/components/chat/group-avatar";
import type { ChatSession, Message, SavedMessage, SessionType, UserSearchResult } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";

const LAST_SESSION_KEY = "chatbot.lastSessionId";

function upsertMessage(messages: Message[], message: Message) {
  const existingIndex = messages.findIndex((item) => item.id === message.id);
  if (existingIndex === -1) return [...messages, message];

  return messages.flatMap((item, index) => {
    if (index === existingIndex) return [message];
    return item.id === message.id ? [] : [item];
  });
}

export function ChatWorkspace() {
  const router = useRouter();
  const { user, loading: authLoading, error: connectionError, logout, reloadUser } = useAuth();
  const { darkMode, setDarkMode, palette, setPalette } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const [chatSection, setChatSection] = useState<ChatSection>("ai");
  const [profileView, setProfileView] = useState<"contact" | "mine" | "saved" | null>(null);
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>([]);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [mutedSessions, setMutedSessions] = useState<Set<string>>(new Set());
  const [createSessionType, setCreateSessionType] = useState<"DIRECT" | "GROUP">("GROUP");
  const [chatActionsOpen, setChatActionsOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [addingAi, setAddingAi] = useState(false);
  const [sessionDialogMode, setSessionDialogMode] = useState<"create" | "participants" | null>(null);
  const [sessionDialogBusy, setSessionDialogBusy] = useState(false);
  const [sessionDialogError, setSessionDialogError] = useState<string | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [realtimeState, setRealtimeState] = useState<
    "connecting" | "connected" | "reconnecting" | "disconnected"
  >("connecting");
  const [incomingMessage, setIncomingMessage] = useState<{
    sessionId: string;
    messageId: string;
    preview: string;
  } | null>(null);
  const reconnectSyncRef = useRef<() => void>(() => {});
  const mutedSessionsRef = useRef<Set<string>>(new Set());

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );
  const chatPeer = activeSession?.users.find(
    (participant) =>
      participant.user.id !== user?.id &&
      participant.user.email !== "ai-assistant@system.invalid",
  );
  const currentSessionRole = activeSession?.users.find(
    (participant) => participant.user.id === user?.id,
  )?.role;

  const { setTyping, sendRealtimeMessage } = useChatRealtime(user?.id, {
    activeSessionId,
    onConnectionState: setRealtimeState,
    onMessage: (message) => setMessages((current) => upsertMessage(current, message)),
    onMessageUpdated: (message) => setMessages((current) => upsertMessage(current, message)),
    onSessionDeleted: (sessionId) => {
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      if (activeSessionId === sessionId) {
        window.localStorage.removeItem(LAST_SESSION_KEY);
        setMessages([]);
        setActiveSessionId(null);
        void loadSessions();
      }
    },
    onSessionChanged: () => {
      void loadSessions(activeSessionId);
    },
    onMessageDeleted: (sessionId, messageId) => {
      if (sessionId === activeSessionId) {
        setMessages((current) => current.filter((message) => message.id !== messageId));
      }
    },
    onMessageRead: (sessionId, messageId, readerId, readAt) => {
      if (sessionId !== activeSessionId || readerId === user?.id) return;
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== messageId) return message;
          const readReceipts = message.readReceipts ?? [];
          if (readReceipts.some((receipt) => receipt.userId === readerId)) return message;
          return {
            ...message,
            isRead: true,
            readAt,
            readReceipts: [...readReceipts, { userId: readerId, readAt }],
          };
        }),
      );
    },
    onTyping: (sessionId, typingUserId, isTyping) => {
      if (sessionId !== activeSessionId || typingUserId === user?.id) return;
      setTypingUserIds((current) => isTyping
        ? current.includes(typingUserId) ? current : [...current, typingUserId]
        : current.filter((id) => id !== typingUserId));
    },
    onUserStatus: (statusUserId, status, lastSeen) => {
      setSessions((current) => current.map((session) => ({
        ...session,
        users: session.users.map((participant) =>
          participant.user.id === statusUserId
            ? { ...participant, user: { ...participant.user, status, lastSeen } }
            : participant,
        ),
      })));
    },
    onUsersOnline: (onlineUserIds) => {
      const online = new Set(onlineUserIds);
      setSessions((current) => current.map((session) => ({
        ...session,
        users: session.users.map((participant) =>
          online.has(participant.user.id)
            ? { ...participant, user: { ...participant.user, status: "ONLINE" } }
            : participant,
        ),
      })));
    },
    onNotification: (message) => {
      if (mutedSessionsRef.current.has(message.sessionId)) return;
      setIncomingMessage({
        sessionId: message.sessionId,
        messageId: message.id,
        preview: message.content,
      });
    },
    onNotificationPreview: (notification) => {
      if (mutedSessionsRef.current.has(notification.sessionId)) return;
      setIncomingMessage((current) => current?.messageId === notification.messageId
        ? current
        : {
            sessionId: notification.sessionId,
            messageId: notification.messageId,
            preview: notification.preview,
          });
    },
    onError: (message) => {
      setError(message);
      if (message === "Your session expired. Please sign in again.") {
        router.replace("/login");
      }
    },
    onRecovered: (reconnected) => {
      setError((current) =>
        current === "Live updates disconnected. Reconnecting…" ? null : current,
      );
      if (reconnected) reconnectSyncRef.current();
    },
  });

  const loadSessions = useCallback(async (preferredId?: string | null) => {
    const page = await api.sessions.list({ limit: 50 });
    setSessions(page.items);
    setSessionsCursor(page.nextCursor);
    const storedId = typeof window === "undefined" ? null : window.localStorage.getItem(LAST_SESSION_KEY);
    const desiredId = preferredId ?? storedId;
    const chosen = page.items.find((session) => session.id === desiredId) ?? page.items[0] ?? null;
    setActiveSessionId(chosen?.id ?? null);
    return chosen?.id ?? null;
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const data = await api.sessions.get(sessionId, { limit: 50 });
      setMessages(data.messages);
      setOlderCursor(data.nextCursor);
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? data.session : session)),
      );
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "Could not load conversation.");
    } finally {
      setLoadingMessages(false);
    }
  }, [router]);

  reconnectSyncRef.current = () => {
    void loadSessions(activeSessionId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not refresh conversations.");
    });
    if (activeSessionId) void loadMessages(activeSessionId);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    setLoadingSessions(true);
    void api.sessions.list({ limit: 50 })
      .then((page) => {
        if (cancelled) return;
        setSessions(page.items);
        setSessionsCursor(page.nextCursor);
        const storedId = window.localStorage.getItem(LAST_SESSION_KEY);
        const chosen = page.items.find((session) => session.id === storedId) ?? page.items[0] ?? null;
        setActiveSessionId(chosen?.id ?? null);
        if (chosen) {
          setChatSection(
            chosen.type === "AI" ? "ai" : chosen.type === "GROUP" ? "groups" : "personal",
          );
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
        setError(cause instanceof Error ? cause.message : "Could not load conversations.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setOlderCursor(null);
      setTypingUserIds([]);
      return;
    }
    setTypingUserIds([]);
    window.localStorage.setItem(LAST_SESSION_KEY, activeSessionId);
    void loadMessages(activeSessionId);
  }, [activeSessionId, loadMessages]);

  const createChat = useCallback(async () => {
    setError(null);
    try {
      const created = await api.sessions.create({ type: "AI", title: "New chat" });
      setSessions((current) => [created, ...current.filter((session) => session.id !== created.id)]);
      setActiveSessionId(created.id);
      setChatSection("ai");
      setMessages([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a conversation.");
    }
  }, []);

  async function sendMessage(content: string) {
    setSending(true);
    setStreamingText("");
    setError(null);
    let sessionId = activeSessionId;
    try {
      if (!sessionId) {
        const created = await api.sessions.create({ type: "AI", title: "New chat" });
        sessionId = created.id;
        setSessions((current) => [created, ...current]);
        setActiveSessionId(created.id);
      }
      const selected = sessions.find((session) => session.id === sessionId);
      if (!selected || selected.type === "AI") {
        await api.ai.chat(sessionId, content, {
          onToken: (delta) => setStreamingText((current) => current + delta),
        });
      } else {
        const aiParticipant = selected.users.find(
          (participant) => participant.user.email === "ai-assistant@system.invalid",
        );
        const createdMessage = await sendRealtimeMessage(
          sessionId,
          content,
          aiParticipant?.user.id,
        );
        setMessages((current) => upsertMessage(current, createdMessage));
      }

      const [data, refreshedSessions] = await Promise.all([
        api.sessions.get(sessionId, { limit: 50 }),
        api.sessions.list({ limit: 50 }),
      ]);
      setMessages(data.messages);
      setOlderCursor(data.nextCursor);
      setSessions(refreshedSessions.items);
      setSessionsCursor(refreshedSessions.nextCursor);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "The AI could not complete this response.");
      if (sessionId) {
        try {
          const data = await api.sessions.get(sessionId, { limit: 50 });
          setMessages(data.messages);
        } catch {
          // Keep the original request failure visible; history can be refreshed from the banner.
        }
      }
      throw cause;
    } finally {
      setSending(false);
      setStreamingText("");
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    let sessionId = activeSessionId;
    if (!sessionId) {
      const created = await api.sessions.create({ type: "AI", title: "New chat" });
      sessionId = created.id;
      setSessions((current) => [created, ...current.filter((session) => session.id !== created.id)]);
      setActiveSessionId(created.id);
    }

    try {
      const message = await api.files.upload(sessionId, file);
      setMessages((current) => upsertMessage(current, message));
      const refreshedSessions = await api.sessions.list({ limit: 50 });
      setSessions(refreshedSessions.items);
      setSessionsCursor(refreshedSessions.nextCursor);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      throw cause;
    }
  }

  async function loadOlderMessages() {
    if (!activeSessionId || !olderCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const page = await api.sessions.get(activeSessionId, {
        limit: 50,
        cursor: olderCursor,
      });
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !known.has(message.id)), ...current];
      });
      setOlderCursor(page.nextCursor);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "Could not load older messages.");
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  async function loadMoreSessions() {
    if (!sessionsCursor || loadingMoreSessions) return;
    setLoadingMoreSessions(true);
    try {
      const page = await api.sessions.list({ limit: 50, cursor: sessionsCursor });
      setSessions((current) => {
        const known = new Set(current.map((session) => session.id));
        return [...current, ...page.items.filter((session) => !known.has(session.id))];
      });
      setSessionsCursor(page.nextCursor);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
      setError(cause instanceof Error ? cause.message : "Could not load more conversations.");
    } finally {
      setLoadingMoreSessions(false);
    }
  }

  async function createConversation(input: {
    type: SessionType;
    title?: string;
    participantIds?: string[];
  }) {
    setSessionDialogBusy(true);
    setSessionDialogError(null);
    try {
      const created = await api.sessions.create(input);
      setSessions((current) => [created, ...current.filter((session) => session.id !== created.id)]);
      setActiveSessionId(created.id);
      setChatSection(
        input.type === "GROUP" ? "groups" : input.type === "DIRECT" ? "personal" : "ai",
      );
      setMessages([]);
      setOlderCursor(null);
      setSessionDialogMode(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
      setSessionDialogError(cause instanceof Error ? cause.message : "Could not create conversation.");
    } finally {
      setSessionDialogBusy(false);
    }
  }

  async function openDirectConversation(person: UserSearchResult) {
    const existing = sessions.find((session) =>
      session.type === "DIRECT" &&
      session.users.some((participant) => participant.user.id === person.id),
    );
    if (existing) {
      setChatSection("personal");
      setActiveSessionId(existing.id);
      return;
    }

    try {
      const created = await api.sessions.create({
        type: "DIRECT",
        participantIds: [person.id],
      });
      setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setChatSection("personal");
      setActiveSessionId(created.id);
      setMessages([]);
      setOlderCursor(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
      throw cause;
    }
  }

  async function createGroupFromSidebar(input: {
    title: string;
    participantIds: string[];
  }): Promise<boolean> {
    try {
      const created = await api.sessions.create({
        type: "GROUP",
        title: input.title,
        participantIds: input.participantIds,
      });
      setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setChatSection("groups");
      setActiveSessionId(created.id);
      setMessages([]);
      setOlderCursor(null);
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
      throw cause;
    }
  }

  async function refreshActiveSession() {
    if (!activeSessionId) return;
    const data = await api.sessions.get(activeSessionId, { limit: 50 });
    setSessions((current) =>
      current.map((session) => session.id === activeSessionId ? data.session : session),
    );
    setMessages(data.messages);
    setOlderCursor(data.nextCursor);
  }

  async function inviteParticipant(userId: string) {
    if (!activeSessionId) return;
    setSessionDialogBusy(true);
    setSessionDialogError(null);
    try {
      await api.sessions.invite(activeSessionId, userId);
      await refreshActiveSession();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
      setSessionDialogError(cause instanceof Error ? cause.message : "Could not invite participant.");
    } finally {
      setSessionDialogBusy(false);
    }
  }

  async function removeParticipant(userId: string) {
    if (!activeSessionId) return;
    setSessionDialogBusy(true);
    setSessionDialogError(null);
    try {
      await api.sessions.removeParticipant(activeSessionId, userId);
      await refreshActiveSession();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.replace("/login");
      setSessionDialogError(cause instanceof Error ? cause.message : "Could not remove participant.");
    } finally {
      setSessionDialogBusy(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!activeSessionId) return;
    try {
      await api.messages.delete(activeSessionId, messageId);
      setMessages((current) => current.filter((msg) => msg.id !== messageId));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "Could not delete message.");
      throw cause;
    }
  }

  async function editMessage(messageId: string, content: string) {
    if (!activeSessionId) return;
    const updated = await api.messages.update(activeSessionId, messageId, content);
    setMessages((current) => upsertMessage(current, updated));
  }

  async function saveMessage(messageId: string) {
    const saved = await api.users.saveMessage(messageId);
    setSavedMessages((current) => [
      saved,
      ...current.filter((item) => item.messageId !== saved.messageId),
    ]);
  }

  function toggleMuteActiveSession() {
    if (!activeSessionId) return;
    const updated = new Set(mutedSessionsRef.current);
    if (updated.has(activeSessionId)) updated.delete(activeSessionId);
    else updated.add(activeSessionId);
    mutedSessionsRef.current = updated;
    setMutedSessions(updated);
  }

  async function openSavedMessages() {
    try {
      const saved = await api.users.savedMessages();
      setSavedMessages(saved);
      setProfileView("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Saved Messages.");
    }
  }

  async function saveProfile(input: {
    displayName: string | null;
    username: string | null;
    bio: string | null;
  }) {
    await api.users.update(input);
    await reloadUser();
  }

  async function uploadAvatar(file: File) {
    await api.users.uploadAvatar(file);
    await reloadUser();
  }

  async function clearHistory() {
    if (!activeSessionId) return;
    await api.messages.clearHistory(activeSessionId);
    setMessages([]);
    setOlderCursor(null);
    setChatActionsOpen(false);
    const page = await api.sessions.list({ limit: 50 });
    setSessions(page.items);
    setSessionsCursor(page.nextCursor);
  }

  async function forwardMessage(message: Message, targetSessionId: string) {
    const target = sessions.find((session) => session.id === targetSessionId);
    if (!target) throw new Error("That conversation is no longer available.");
    const content = message.type === "TEXT"
      ? `Forwarded message:\n${message.content}`
      : `Forwarded ${message.type.toLowerCase()} message`;
    if (target.type === "AI") {
      await api.messages.send(targetSessionId, { content });
    } else {
      const aiParticipant = target.users.find(
        (participant) => participant.user.email === "ai-assistant@system.invalid",
      );
      await sendRealtimeMessage(targetSessionId, content, aiParticipant?.user.id);
    }
    setForwardingMessage(null);
  }

  async function deleteSession(sessionId: string) {
    try {
      await api.sessions.delete(sessionId);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
        window.localStorage.removeItem(LAST_SESSION_KEY);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      throw cause;
    }
  }

  async function renameSession(newTitle: string) {
    if (!activeSessionId) return;
    setRenaming(true);
    try {
      const updated = await api.sessions.rename(activeSessionId, newTitle);
      setSessions((current) =>
        current.map((session) => (session.id === activeSessionId ? updated : session)),
      );
      setShowRenameInput(false);
      setRenameValue("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "Could not rename conversation.");
      throw cause;
    } finally {
      setRenaming(false);
    }
  }

  async function updateGroupProfile(input: { title: string; description: string | null }) {
    if (!activeSessionId) return;
    try {
      const updated = await api.sessions.updateGroupProfile(activeSessionId, input);
      setSessions((current) =>
        current.map((session) => session.id === updated.id ? updated : session),
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      throw cause;
    }
  }

  async function uploadGroupAvatar(file: File) {
    if (!activeSessionId) return;
    try {
      const updated = await api.sessions.uploadGroupAvatar(activeSessionId, file);
      setSessions((current) =>
        current.map((session) => session.id === updated.id ? updated : session),
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      throw cause;
    }
  }

  function startRename() {
    if (!activeSession) return;
    setRenameValue(activeSession.title || "New chat");
    setShowRenameInput(true);
  }

  async function leaveSession() {
    if (!activeSessionId) return;
    try {
      const result = await api.sessions.leave(activeSessionId);
      if (result.deleted) {
        setSessions((current) => current.filter((session) => session.id !== activeSessionId));
      } else {
        setSessions((current) => current.filter((session) => session.id !== activeSessionId));
      }
      setActiveSessionId(null);
      setMessages([]);
      window.localStorage.removeItem(LAST_SESSION_KEY);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "Could not leave conversation.");
      throw cause;
    }
  }

  async function addAiToSession() {
    if (!activeSessionId) return;
    setAddingAi(true);
    try {
      await api.sessions.addAi(activeSessionId);
      const refreshed = await api.sessions.get(activeSessionId);
      setSessions((current) =>
        current.map((session) => (session.id === activeSessionId ? refreshed.session : session)),
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
      }
      setError(cause instanceof Error ? cause.message : "Could not add AI to conversation.");
      throw cause;
    } finally {
      setAddingAi(false);
    }
  }

  async function signOut() {
    setError(null);
    try {
      await logout();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  if (authLoading || (!user && !connectionError)) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="Loading your workspace…" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg content-center gap-4 px-4">
        <ErrorBanner message={connectionError ?? "Sign in to open your conversations."} />
        <Button onClick={() => router.push("/login")}>Go to sign in</Button>
      </main>
    );
  }

  return (
    <main className="relative isolate flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-canvas text-ink tablet:flex-row">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 chat-wallpaper" />
      <MainNavigation
        user={user}
        columnColor={palette.value}
        columnForeground={palette.foreground}
        section={chatSection}
        darkMode={darkMode}
        isMainMenuOpen={isMainMenuOpen}
        onMainMenuOpenChange={setIsMainMenuOpen}
        onSectionChange={setChatSection}
        onMobileSectionSelect={(section) => {
          setChatSection(section);
          setMobileMenuOpen(false);
          setMobileListOpen(true);
        }}
        onThemeChange={setDarkMode}
        onMobileChats={() => {
          setMobileListOpen(false);
          setMobileMenuOpen(true);
        }}
        onNewGroup={() => {
          setCreateSessionType("GROUP");
          setSessionDialogError(null);
          setSessionDialogMode("create");
        }}
        onMyProfile={() => setProfileView("mine")}
        onSavedMessages={() => void openSavedMessages()}
        onOpenContact={openDirectConversation}
        onCall={() => setCallModalOpen(true)}
        onLogout={() => void signOut()}
      />
      <ChatSidebar
        sessions={sessions}
        hasMoreSessions={Boolean(sessionsCursor)}
        loadingMoreSessions={loadingMoreSessions}
        activeSessionId={activeSessionId}
        section={chatSection}
        user={user}
        loading={loadingSessions}
        mobileMenuOpen={mobileMenuOpen}
        mobileListOpen={mobileListOpen}
        onMobileMenuOpenChange={(open) => {
          setMobileMenuOpen(open);
          if (!open) setMobileListOpen(false);
        }}
        onNewChat={createChat}
        onNewDirect={() => {
          setCreateSessionType("DIRECT");
          setSessionDialogError(null);
          setSessionDialogMode("create");
        }}
        onOpenUser={openDirectConversation}
        onCreateGroup={createGroupFromSidebar}
        onSelect={(sessionId) => {
          setActiveSessionId(sessionId);
          setMobileListOpen(false);
          const selected = sessions.find((session) => session.id === sessionId);
          if (selected) {
            setChatSection(
              selected.type === "AI" ? "ai" : selected.type === "GROUP" ? "groups" : "personal",
            );
          }
        }}
        onDeleteSession={deleteSession}
        onLoadMore={loadMoreSessions}
      />
      <section className={`${mobileListOpen ? "hidden tablet:flex" : "flex"} relative min-h-0 min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] tablet:pb-0`}>
        <header className="z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-chat-header px-3 text-ink tablet:px-6">
          <Button
            type="button"
            variant="quiet"
            className="min-h-10 px-2 text-ink hover:bg-canvas tablet:hidden"
            aria-label="Open main menu"
            aria-expanded={isMainMenuOpen}
            onClick={() => setIsMainMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
          <button
            type="button"
            disabled={!activeSession}
            onClick={() => setProfileView("contact")}
            aria-label="View conversation profile"
            className="shrink-0 rounded-full disabled:cursor-default"
          >
            {activeSession?.type === "AI" ? (
              <NovaAvatar className="size-10 border-line" />
            ) : activeSession?.type === "DIRECT" && chatPeer ? (
              <UserAvatar user={chatPeer.user} className="size-10" />
            ) : activeSession?.type === "GROUP" ? (
              <GroupAvatar title={activeSession.title} avatarUrl={activeSession.avatarUrl} className="size-10" />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">
                {(chatPeer?.user.username?.[0] ?? chatPeer?.user.displayName?.[0] ?? chatPeer?.user.email[0] ?? "U").toUpperCase()}
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            {showRenameInput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void renameSession(renameValue);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={120}
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="Conversation name"
                  autoFocus
                />
                <Button
                  type="submit"
                  variant="quiet"
                  className="min-h-8 px-2 text-xs"
                  disabled={renaming || !renameValue.trim()}
                >
                  {renaming ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  className="min-h-8 px-2 text-xs"
                  onClick={() => {
                    setShowRenameInput(false);
                    setRenameValue("");
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setProfileView("contact")}
                className="min-w-0 flex-1 text-left"
              >
                <h1 className="truncate text-sm font-semibold">
                  {activeSession?.type === "AI"
                    ? "Nova"
                    : activeSession?.type === "DIRECT"
                      ? chatPeer ? userDisplayName(chatPeer.user) : activeSession.title
                      : activeSession?.title ?? "Choose a conversation"}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {activeSession?.type === "AI" || !activeSession
                    ? "AI Assistant · Online"
                    : activeSession.type === "DIRECT"
                      ? `${chatPeer?.user.status.toLowerCase() ?? "offline"}`
                      : `${activeSession.users.length} participants${
                          activeSession.users.some((participant) =>
                            participant.user.email === "ai-assistant@system.invalid",
                          ) ? " · AI enabled" : ""
                        }`}
                  <span aria-hidden="true" className="text-muted">·</span>
                  <span
                    role="status"
                    aria-live="polite"
                    className="inline-flex items-center gap-1.5"
                    aria-label={`Realtime ${realtimeState}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${
                        realtimeState === "connected"
                          ? "bg-emerald-500"
                          : realtimeState === "reconnecting"
                            ? "bg-amber-500"
                            : realtimeState === "disconnected"
                              ? "bg-red-500"
                              : "bg-muted"
                      }`}
                    />
                    {realtimeState === "connected"
                      ? "Live"
                      : realtimeState === "reconnecting"
                        ? "Reconnecting"
                        : realtimeState === "disconnected"
                          ? "Offline"
                          : "Connecting"}
                  </span>
                </p>
              </button>
            )}
          </div>
          <div className="relative">
            <Button
              type="button"
              variant="quiet"
              className="min-h-10 px-2 text-ink hover:bg-canvas"
              aria-label="Chat actions"
              aria-expanded={chatActionsOpen}
              onClick={() => setChatActionsOpen((open) => !open)}
            >
              <Ellipsis aria-hidden="true" className="size-5" />
            </Button>
            {chatActionsOpen && (
              <div className="absolute right-0 top-12 z-30 max-h-[min(70dvh,32rem)] w-60 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 text-ink shadow-lg">
                {!showRenameInput && activeSession && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setChatActionsOpen(false);
                        setCallModalOpen(true);
                      }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas"
                    >
                      <Phone aria-hidden="true" className="size-4" />
                      Call
                    </button>
                    {activeSession.type !== "AI" && (
                      <button
                        type="button"
                        onClick={() => {
                          setChatActionsOpen(false);
                          setSessionDialogError(null);
                          setSessionDialogMode("participants");
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas"
                      >
                        <UsersRound aria-hidden="true" className="size-4" />
                        Manage participants
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setChatActionsOpen(false);
                        startRename();
                      }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      Rename conversation
                    </button>
                    {activeSession.type !== "AI" && !activeSession.users.some((participant) => participant.user.email === "ai-assistant@system.invalid") && (
                      <button
                        type="button"
                        disabled={addingAi}
                        onClick={() => {
                          setChatActionsOpen(false);
                          void addAiToSession();
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas disabled:opacity-50"
                      >
                        <Sparkles aria-hidden="true" className="size-4" />
                        {addingAi ? "Adding AI…" : "Add AI to conversation"}
                      </button>
                    )}
                    {activeSession.type !== "AI" && (
                      <button
                        type="button"
                        onClick={() => {
                          setChatActionsOpen(false);
                          void leaveSession().catch((cause: unknown) => {
                            setError(cause instanceof Error ? cause.message : "Could not leave conversation.");
                          });
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas"
                      >
                        <LogOut aria-hidden="true" className="size-4" />
                        Leave conversation
                      </button>
                    )}
                    <div className="my-1 border-t border-line" />
                  </>
                )}
                {activeSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileView("contact");
                      setChatActionsOpen(false);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas"
                  >
                    <UserRound aria-hidden="true" className="size-4" />
                    View Profile
                  </button>
                )}
                <button
                  type="button"
                  disabled={!activeSession}
                  onClick={() => {
                    if (!activeSession) return;
                    setChatActionsOpen(false);
                    setConfirmClearHistory(true);
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas disabled:opacity-50"
                >
                  <Eraser aria-hidden="true" className="size-4" />
                  Clear History
                </button>
                <button
                  type="button"
                  disabled={!activeSession}
                  onClick={() => {
                    setChatActionsOpen(false);
                    void leaveSession().catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : "Could not delete chat.");
                    });
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Delete chat
                </button>
                {activeSession?.type === "GROUP" &&
                  activeSession.ownerId === user?.id &&
                  currentSessionRole === "OWNER" && (
                    <button
                      type="button"
                      onClick={() => {
                        setChatActionsOpen(false);
                        void deleteSession(activeSession.id).catch((cause: unknown) => {
                          setError(cause instanceof Error ? cause.message : "Could not delete group.");
                        });
                      }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-danger hover:bg-danger-soft"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Delete Group
                    </button>
                  )}
              </div>
            )}
          </div>
        </header>
        {error && (
          <div className="px-4 pt-4 tablet:px-8">
            <ErrorBanner
              message={error}
              onDismiss={() => setError(null)}
              onRetry={() => {
                if (activeSessionId) void loadMessages(activeSessionId);
                else void loadSessions();
              }}
            />
          </div>
        )}
        {incomingMessage && (
          <Toast
            message={`New message: ${incomingMessage.preview.slice(0, 100)}`}
            actionLabel="Open"
            onAction={() => {
                setActiveSessionId(incomingMessage.sessionId);
                setIncomingMessage(null);
            }}
            onDismiss={() => setIncomingMessage(null)}
          />
        )}
        <ChatWindow
          key={activeSessionId ?? "empty"}
          messages={messages}
          streamingText={streamingText}
          loading={loadingMessages}
          sending={sending}
          currentUserId={user?.id ?? null}
          session={activeSession}
          sessionId={activeSessionId}
          onDeleteMessage={deleteMessage}
          onEditMessage={editMessage}
          onForwardMessage={(message) => setForwardingMessage(message)}
          onSaveMessage={saveMessage}
          hasOlderMessages={Boolean(olderCursor)}
          loadingOlderMessages={loadingOlderMessages}
          onLoadOlder={loadOlderMessages}
          otherUserTyping={typingUserIds.length > 0}
        />
        <div className="shrink-0 border-t border-line bg-surface/90 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md mobile:px-5 mobile:py-4 tablet:px-8">
          <MessageInput
            sending={sending}
            darkMode={darkMode}
            onSend={sendMessage}
            onUpload={uploadFile}
            onTypingChange={(typing) => setTyping(activeSessionId, typing)}
          />
        </div>
      </section>
      {profileView && user && (
        <ProfileSidebar
          view={profileView}
          user={user}
          contact={chatPeer?.user ?? null}
          session={activeSession}
          messages={messages}
          savedMessages={savedMessages}
          muted={Boolean(activeSessionId && mutedSessions.has(activeSessionId))}
          onClose={() => setProfileView(null)}
          onSaveProfile={saveProfile}
          onUploadAvatar={uploadAvatar}
          onUpdateGroupProfile={updateGroupProfile}
          onUploadGroupAvatar={uploadGroupAvatar}
          onColumnColorChange={setPalette}
          onCall={() => setCallModalOpen(true)}
          onToggleMute={toggleMuteActiveSession}
        />
      )}
      {callModalOpen && (
        <CallModal
          contact={activeSession?.type === "AI" ? null : chatPeer?.user ?? null}
          onClose={() => setCallModalOpen(false)}
        />
      )}
      {sessionDialogMode && user && (
        <SessionDialog
          mode={sessionDialogMode}
          initialType={createSessionType}
          user={user}
          session={activeSession ?? undefined}
          busy={sessionDialogBusy}
          error={sessionDialogError}
          onClose={() => setSessionDialogMode(null)}
          onCreate={createConversation}
          onInvite={inviteParticipant}
          onRemove={removeParticipant}
        />
      )}
      {confirmClearHistory && activeSession && (
        <Modal
          title="Clear chat history?"
          onClose={() => {
            if (!clearingHistory) setConfirmClearHistory(false);
          }}
        >
          <div className="grid gap-4 p-5">
            <p className="text-sm leading-6 text-muted">
              This hides the messages in this conversation from your history. Other
              participants will still see their messages.
            </p>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="quiet"
                disabled={clearingHistory}
                onClick={() => setConfirmClearHistory(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={clearingHistory}
                className="bg-danger text-white hover:opacity-90"
                onClick={() => {
                  setClearingHistory(true);
                  void clearHistory()
                    .then(() => setConfirmClearHistory(false))
                    .catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : "Could not clear chat history.");
                    })
                    .finally(() => setClearingHistory(false));
                }}
              >
                {clearingHistory ? "Clearing…" : "Clear history"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {forwardingMessage && user && (
        <ForwardMessageDialog
          sessions={sessions}
          currentUser={user}
          currentSessionId={activeSessionId}
          messageType={forwardingMessage.type}
          onClose={() => setForwardingMessage(null)}
          onForward={(targetSessionId) => forwardMessage(forwardingMessage, targetSessionId)}
        />
      )}
    </main>
  );
}
