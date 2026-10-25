import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bookmark, Check, CheckCheck, Forward, Pencil, Trash2 } from "lucide-react";
import type { Message, User } from "@/types/api";
import { api } from "@/lib/api";
import { NovaAvatar } from "@/components/chat/nova-avatar";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ImageLightbox } from "@/components/chat/image-lightbox";
import { userDisplayName } from "@/lib/user-display";

export function MessageBubble({
  message,
  startsGroup,
  endsGroup,
  currentUserId,
  sessionType,
  conversationPeer,
  userStatuses,
  onDelete,
  onEdit,
  onForward,
  onSaveMessage,
  className = "",
}: {
  message: Message;
  startsGroup: boolean;
  endsGroup: boolean;
  currentUserId: string | null;
  sessionType: "DIRECT" | "GROUP" | "AI" | null;
  conversationPeer?: Pick<User, "id" | "email" | "displayName" | "username" | "avatarUrl" | "status">;
  userStatuses?: ReadonlyMap<string, User["status"]>;
  onDelete?: (messageId: string) => Promise<void>;
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onForward?: (message: Message) => void;
  onSaveMessage?: (messageId: string) => Promise<void>;
  className?: string;
}) {
  const isOwnMessage = sessionType === "AI"
    ? message.role === "USER"
    : currentUserId !== null && message.senderId === currentUserId;
  const isOwnTextMessage = isOwnMessage && message.role === "USER";
  const isAssistant = message.role === "ASSISTANT";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingMessage, setSavingMessage] = useState(false);
  const [messageSaved, setMessageSaved] = useState(false);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const isAttachment = ["FILE", "IMAGE", "VOICE", "VIDEO"].includes(message.type);
  const isRead = message.isRead || (message.readReceipts ?? []).some(
    (receipt) => receipt.userId !== currentUserId,
  );
  const sender = sessionType === "DIRECT"
    ? conversationPeer ?? message.sender
    : message.sender;
  const senderEmail =
    sender && "email" in sender && typeof sender.email === "string"
      ? sender.email
      : undefined;
  const senderStatus = conversationPeer && conversationPeer.id === sender?.id
    ? conversationPeer.status
    : sender ? userStatuses?.get(sender.id) : undefined;
  const senderName = isAssistant
    ? "Nova"
    : sessionType === "DIRECT"
      ? sender ? userDisplayName({ ...sender, email: senderEmail ?? "Contact" }) : "Contact"
      : message.sender ? userDisplayName({ ...message.sender, email: senderEmail ?? "Participant" }) : "Participant";
  const senderAvatar = sender
    ? {
        id: sender.id,
        displayName: sender.displayName,
        username: sender.username ?? null,
        avatarUrl: sender.avatarUrl,
        email: senderEmail || senderName,
        status: senderStatus,
      }
    : null;
  const corners = isOwnMessage
    ? `rounded-chat ${startsGroup ? "rounded-tr-chat" : "rounded-tr-chat-group"} ${endsGroup ? "rounded-br-sm" : "rounded-br-chat-group"}`
    : `rounded-chat ${startsGroup ? "rounded-tl-chat" : "rounded-tl-chat-group"} ${endsGroup ? "rounded-bl-sm" : "rounded-bl-chat-group"}`;

  useEffect(() => {
    if (!contextMenu) return;
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) {
        setContextMenu(null);
      }
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onEdit || !editContent.trim()) return;
    setSavingEdit(true);
    setActionError(null);
    try {
      await onEdit(message.id, editContent.trim());
      setEditing(false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not edit message.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className={`flex items-end gap-2 ${isOwnMessage ? "justify-end" : "justify-start"} ${className}`}>
      {!isOwnMessage && (
        endsGroup ? (
          isAssistant
            ? <NovaAvatar />
            : senderAvatar
              ? <UserAvatar user={senderAvatar} className="mb-0.5 size-9" />
              : <span aria-hidden="true" className="mb-0.5 size-9 shrink-0 rounded-full bg-accent-soft" />
        ) : (
          <span aria-hidden="true" className="size-9 shrink-0" />
        )
      )}
      <article
        onDoubleClick={(event) => {
          const menuWidth = 192;
          const menuHeight = isOwnMessage ? 200 : 152;
          setContextMenu({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
          });
        }}
        className={`relative max-w-[92%] px-3.5 py-2.5 shadow-sm mobile:max-w-[78%] ${
          isOwnMessage
            ? `${corners} bg-chat-outgoing text-ink ${endsGroup ? "after:absolute after:-right-1 after:bottom-0 after:size-3 after:rotate-45 after:bg-chat-outgoing" : ""}`
            : `${corners} bg-chat-incoming text-ink ${endsGroup ? "after:absolute after:-left-1 after:bottom-0 after:size-3 after:rotate-45 after:bg-chat-incoming" : ""}`
        }`}
      >
        {!isOwnMessage && (
          <p className="mb-1 text-xs font-semibold text-chat-outgoing">
            {senderName}
          </p>
        )}
        {editing ? (
          <form onSubmit={(event) => void saveEdit(event)} className="grid gap-2">
            <textarea
              autoFocus
              value={editContent}
              onChange={(event) => setEditContent(event.currentTarget.value)}
              maxLength={10_000}
              rows={Math.min(5, Math.max(2, editContent.split("\n").length))}
              className="min-w-56 resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              aria-label="Edit message"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditContent(message.content);
                }}
                className="text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit || !editContent.trim()}
                className="text-xs font-semibold text-accent disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : isAttachment ? (
          message.type === "VOICE" ? (
            <audio
              controls
              preload="metadata"
              src={contentUrl(message.content)}
              crossOrigin="use-credentials"
              className="max-w-full"
              aria-label="Voice message"
            />
          ) : message.type === "VIDEO" ? (
            <video
              controls
              preload="metadata"
              src={contentUrl(message.content)}
              crossOrigin="use-credentials"
              className="max-h-80 max-w-full rounded-lg"
              aria-label="Shared video"
            />
          ) : (
            <a
              className={`inline-flex min-h-10 items-center gap-2 underline underline-offset-2 ${
                isOwnMessage ? "text-ink" : "text-accent"
              }`}
              href={contentUrl(message.content)}
              target="_blank"
              rel="noreferrer"
              onClick={message.type === "IMAGE" ? (event) => {
                event.preventDefault();
                setImageLightboxOpen(true);
              } : undefined}
              aria-label={message.type === "IMAGE" ? "Open shared image" : "Download shared file"}
            >
              {message.type === "IMAGE" ? (
                <>
                  <img
                    src={contentUrl(message.content)}
                    alt="Shared image"
                    loading="lazy"
                    crossOrigin="use-credentials"
                    className="max-h-80 max-w-full rounded-lg object-contain"
                  />
                  <span className="sr-only">Open image</span>
                </>
              ) : (
                <>
                  <AttachmentFileIcon />
                  <span>Download file</span>
                </>
              )}
            </a>
          )
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-[1.45]">{message.content}</p>
        )}
        {actionError && (
          <p role="alert" className="mt-2 text-xs text-danger">{actionError}</p>
        )}
        <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] leading-4 ${isOwnMessage ? "text-ink/65" : "text-muted"}`}>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {isOwnTextMessage && (
            <>
              <DeliveryTicks read={isRead} />
              {message.readReceipts && message.readReceipts.length > 1 && (
                <span className="sr-only">
                  Read by {message.readReceipts.length} participants
                </span>
              )}
            </>
          )}
          {isOwnMessage && showDeleteConfirm && onDelete && (
            <button
              type="button"
              onClick={() => {
                setDeleting(true);
                setActionError(null);
                void onDelete(message.id)
                  .then(() => setShowDeleteConfirm(false))
                  .catch((cause: unknown) => {
                    setActionError(cause instanceof Error ? cause.message : "Could not delete message.");
                  })
                  .finally(() => setDeleting(false));
              }}
              disabled={deleting}
              className="ml-2 rounded px-1.5 py-0.5 text-danger hover:bg-white/10 disabled:opacity-50"
              aria-label="Confirm delete message"
            >
              <span className="font-semibold">Confirm?</span>
            </button>
          )}
        </div>
      </article>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Message actions"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-[80] w-48 rounded-lg border border-line bg-surface p-1.5 text-ink shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!onSaveMessage || savingMessage || messageSaved}
            onClick={() => {
              if (!onSaveMessage) return;
              setSavingMessage(true);
              setActionError(null);
              void onSaveMessage(message.id)
                .then(() => setMessageSaved(true))
                .catch((cause: unknown) => {
                  setActionError(cause instanceof Error ? cause.message : "Could not save message.");
                })
                .finally(() => setSavingMessage(false));
              setContextMenu(null);
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas disabled:opacity-45"
          >
            <Bookmark aria-hidden="true" className="size-4" />
            {messageSaved ? "Saved" : savingMessage ? "Saving…" : "Save message"}
          </button>
          {isOwnMessage && (
            <button
              type="button"
              role="menuitem"
              disabled={!onEdit || message.type !== "TEXT"}
              onClick={() => {
                setEditContent(message.content);
                setEditing(true);
                setContextMenu(null);
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas disabled:opacity-45"
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit
            </button>
          )}
          {isOwnMessage && onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setShowDeleteConfirm(true);
                setContextMenu(null);
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-danger hover:bg-danger-soft"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!onForward}
            onClick={() => {
              onForward?.(message);
              setContextMenu(null);
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-canvas disabled:opacity-45"
          >
            <Forward aria-hidden="true" className="size-4" />
            Forward
          </button>
        </div>
      )}
      {imageLightboxOpen && (
        <ImageLightbox
          src={contentUrl(message.content)}
          alt="Shared image"
          onClose={() => setImageLightboxOpen(false)}
        />
      )}
    </div>
  );
}

function AttachmentFileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5 shrink-0" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h7l5 5v11.5H7a2 2 0 01-2-2v-12.5a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v5h5M9 14h6m-6 3h6" />
    </svg>
  );
}

function DeliveryTicks({ read }: { read: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 ${read ? "text-sky-600 dark:text-sky-300" : "text-ink/55"}`}
      role="img"
      aria-label={read ? "Read" : "Sent"}
      title={read ? "Read" : "Sent"}
    >
      {read
        ? <CheckCheck aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
        : <Check aria-hidden="true" className="size-3.5" strokeWidth={2.2} />}
    </span>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function contentUrl(content: string) {
  if (/^https?:\/\//i.test(content)) return content;
  return `${api.baseUrl}${content.startsWith("/") ? content : `/${content}`}`;
}
