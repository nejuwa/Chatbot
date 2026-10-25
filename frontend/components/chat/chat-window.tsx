"use client";

import { useEffect, useRef } from "react";
import type { ChatSession, Message } from "@/types/api";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { MessageBubble } from "@/components/chat/message-bubble";
import { NovaAvatar } from "@/components/chat/nova-avatar";
import { UserAvatar } from "@/components/chat/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { userDisplayName } from "@/lib/user-display";

export function ChatWindow({
  messages,
  streamingText,
  loading,
  sending,
  currentUserId,
  session,
  sessionId,
  onDeleteMessage,
  onEditMessage,
  onForwardMessage,
  onSaveMessage,
  hasOlderMessages,
  loadingOlderMessages,
  onLoadOlder,
  otherUserTyping = false,
}: {
  messages: Message[];
  streamingText: string;
  loading: boolean;
  sending: boolean;
  currentUserId: string | null;
  session: ChatSession | null;
  sessionId: string | null;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onForwardMessage?: (message: Message) => void;
  onSaveMessage?: (messageId: string) => Promise<void>;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlder?: () => Promise<void>;
  otherUserTyping?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLLIElement>(null);
  const shouldStickToBottom = useRef(true);
  const readMessageIds = useRef<Set<string>>(new Set());
  const conversationPeer = session?.users.find(
    (participant) =>
      participant.user.id !== currentUserId &&
      participant.user.email !== "ai-assistant@system.invalid",
  )?.user;
  const userStatuses = new Map(
    (session?.users ?? []).map(({ user }) => [user.id, user.status] as const),
  );

  useEffect(() => {
    if (shouldStickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [messages, streamingText, sending]);

  useEffect(() => {
    if (!sessionId || !currentUserId) return;

    const unreadMessages = messages.filter(
      (msg) =>
        msg.senderId !== currentUserId &&
        msg.senderId !== null &&
        !msg.isRead &&
        !readMessageIds.current.has(msg.id),
    );

    if (unreadMessages.length === 0) return;

    unreadMessages.forEach((msg) => {
      readMessageIds.current.add(msg.id);
      void api.messages.markRead(sessionId, msg.id).catch(() => {
        readMessageIds.current.delete(msg.id);
      });
    });
  }, [messages, sessionId, currentUserId]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-hidden px-4 py-8 tablet:px-8" aria-label="Loading messages">
        <div className="flex items-end gap-2">
          <Skeleton className="size-9 rounded-full bg-surface/70" />
          <Skeleton className="h-20 w-3/4 rounded-chat bg-surface/75" />
        </div>
        <Skeleton className="ml-auto h-16 w-3/4 rounded-chat bg-chat-outgoing/70" />
        <div className="flex items-end gap-2">
          <Skeleton className="size-9 rounded-full bg-surface/70" />
          <Skeleton className="h-24 w-5/6 rounded-chat bg-surface/75" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      aria-label="Conversation messages"
      onScroll={(event) => {
        const element = event.currentTarget;
        shouldStickToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 120;
      }}
    >
      <ol
        className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 tablet:px-8 tablet:py-8"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Chat messages"
      >
        {hasOlderMessages && onLoadOlder && (
          <li className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => void onLoadOlder()}
              disabled={loadingOlderMessages}
              className="min-h-10 rounded-md border border-line bg-surface/85 px-4 text-sm text-ink hover:bg-surface disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {loadingOlderMessages ? "Loading older messages…" : "Load older messages"}
            </button>
          </li>
        )}
        {session?.type === "AI" && messages.length === 0 && !streamingText && !sending && (
          <li className="flex items-end gap-2">
            <NovaAvatar />
            <div className="max-w-[85%] rounded-chat rounded-bl-chat-group bg-chat-incoming px-4 py-3 text-sm leading-6 text-ink shadow-sm">
              <p className="font-medium">Hi, I’m Nova.</p>
              <p>What would you like to talk about?</p>
            </div>
          </li>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const startsGroup = !previous || !sameSender(previous, message);
          const endsGroup = !next || !sameSender(message, next);
          const showDate = !previous || !sameUtcDay(previous.createdAt, message.createdAt);

          return (
            <li key={message.id} className={showDate ? "mt-5 first:mt-0" : ""}>
              {showDate && <DateSeparator value={message.createdAt} />}
              {message.role === "SYSTEM" ? (
                <p className="mx-auto my-3 w-fit rounded-full bg-slate-900/45 px-3 py-1 text-center text-xs text-white">
                  {message.content}
                </p>
              ) : (
                <MessageBubble
                  message={message}
                  startsGroup={startsGroup}
                  endsGroup={endsGroup}
                  currentUserId={currentUserId}
                  sessionType={session?.type ?? null}
                  conversationPeer={conversationPeer}
                  userStatuses={userStatuses}
                  onDelete={onDeleteMessage}
                  onEdit={onEditMessage}
                  onForward={onForwardMessage}
                  onSaveMessage={onSaveMessage}
                  className={previous && sameUtcDay(previous.createdAt, message.createdAt) ? "mt-1.5" : "mt-3"}
                />
              )}
            </li>
          );
        })}

        {(sending || streamingText || otherUserTyping) && (
          session?.type === "AI" ? (
            <li className="mt-1.5 flex items-end gap-2">
              <NovaAvatar />
              <article className="relative max-w-[88%] rounded-chat rounded-bl-chat-group bg-chat-incoming px-4 py-3 text-ink shadow-sm mobile:max-w-[78%]">
                {streamingText ? (
                  <div className="whitespace-pre-wrap break-words text-sm leading-6">{streamingText}</div>
                ) : (
                  <Spinner label="Nova is typing…" />
                )}
                <p className="mt-1 text-right text-[10px] leading-4 text-muted">Nova</p>
              </article>
            </li>
          ) : otherUserTyping ? (
            <li className="mt-1.5 flex items-end gap-2">
              {conversationPeer ? (
                <UserAvatar user={conversationPeer} className="mb-0.5 size-9" />
              ) : (
                <span className="size-9 shrink-0" />
              )}
              <article className="rounded-chat rounded-bl-chat-group bg-chat-incoming px-4 py-3 text-sm text-muted shadow-sm">
                {conversationPeer ? userDisplayName(conversationPeer) : "A participant"} is typing…
              </article>
            </li>
          ) : sending ? (
            <li className="mt-1.5 flex justify-end">
              <article className="rounded-chat rounded-br-sm bg-chat-outgoing px-4 py-3 text-sm text-ink shadow-sm">
                <Spinner label="Sending…" />
              </article>
            </li>
          ) : null
        )}
        <li ref={bottomRef} aria-hidden="true" className="h-px" />
      </ol>
    </div>
  );
}

function sameSender(left: Message, right: Message) {
  return left.role === right.role && left.senderId === right.senderId;
}

function sameUtcDay(left: string, right: string) {
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

function DateSeparator({ value }: { value: string }) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const day = date.toISOString().slice(0, 10);
  const label =
    day === today.toISOString().slice(0, 10)
      ? "Today"
      : day === yesterday.toISOString().slice(0, 10)
        ? "Yesterday"
        : new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            month: "long",
            day: "numeric",
            year: "numeric",
          }).format(date);

  return (
    <div className="mb-4 flex justify-center">
      <time
        dateTime={day}
        className="rounded-full border border-white/50 bg-slate-900/35 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
      >
        {label}
      </time>
    </div>
  );
}
