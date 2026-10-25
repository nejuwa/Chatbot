"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Check,
  Crown,
  FileText,
  Film,
  Image as ImageIcon,
  Mic,
  MoreHorizontal,
  Phone,
  Users,
  VolumeX,
  X,
} from "lucide-react";
import type { ChatSession, Message, SavedMessage, User } from "@/types/api";
import { api } from "@/lib/api";
import { userDisplayName } from "@/lib/user-display";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { UserAvatar } from "@/components/chat/user-avatar";
import { GroupAvatar } from "@/components/chat/group-avatar";
import { ImageLightbox } from "@/components/chat/image-lightbox";
import { navigationPalettes, useTheme } from "@/contexts/theme-context";

type ProfileView = "contact" | "mine" | "saved";
type GalleryTab = "photos" | "videos" | "files" | "voice";

export function ProfileSidebar({
  view,
  user,
  contact,
  session,
  messages,
  savedMessages,
  muted,
  onClose,
  onSaveProfile,
  onUploadAvatar,
  onUpdateGroupProfile,
  onUploadGroupAvatar,
  onColumnColorChange,
  onCall,
  onToggleMute,
}: {
  view: ProfileView;
  user: User;
  contact: Pick<User, "id" | "email" | "displayName" | "username" | "bio" | "avatarUrl" | "status" | "lastSeen"> | null;
  session: ChatSession | null;
  messages: Message[];
  savedMessages: SavedMessage[];
  muted: boolean;
  onClose: () => void;
  onSaveProfile: (input: Pick<User, "displayName" | "username" | "bio">) => Promise<void>;
  onUploadAvatar: (file: File) => Promise<void>;
  onUpdateGroupProfile: (input: { title: string; description: string | null }) => Promise<void>;
  onUploadGroupAvatar: (file: File) => Promise<void>;
  onColumnColorChange: (color: string) => void;
  onCall: () => void;
  onToggleMute: () => void;
}) {
  const [gallery, setGallery] = useState<GalleryTab | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [moreFeedback, setMoreFeedback] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [groupTitle, setGroupTitle] = useState(session?.title ?? "");
  const [groupDescription, setGroupDescription] = useState(session?.description ?? "");
  const [savingGroup, setSavingGroup] = useState(false);
  const [savedGroup, setSavedGroup] = useState(false);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const { palette } = useTheme();
  const isGroupOwner = view === "contact" &&
    session?.type === "GROUP" &&
    session.ownerId === user.id;
  const groupOwner = session?.type === "GROUP"
    ? session.users.find((participant) => participant.user.id === session.ownerId) ?? null
    : null;
  const groupMembers = session?.type === "GROUP"
    ? [...session.users].sort((left, right) => {
        if (left.user.id === session.ownerId) return -1;
        if (right.user.id === session.ownerId) return 1;
        return userDisplayName(left.user).localeCompare(userDisplayName(right.user));
      })
    : [];

  useEffect(() => {
    setGroupTitle(session?.title ?? "");
    setGroupDescription(session?.description ?? "");
    setSavedGroup(false);
  }, [session?.id, session?.title, session?.description]);

  const media = useMemo(() => ({
    photos: messages.filter((message) => message.type === "IMAGE"),
    videos: messages.filter((message) => message.type === "VIDEO"),
    files: messages.filter((message) => message.type === "FILE"),
    voice: messages.filter((message) => message.type === "VOICE"),
  }), [messages]);
  const title = view === "mine"
    ? "My Profile"
    : view === "saved"
      ? "Saved Messages"
      : session?.type === "AI"
        ? "Nova"
        : session?.type === "GROUP"
        ? session.title
        : contact ? userDisplayName(contact) : "Profile";
  const profileAvatarUrl = view === "mine"
    ? user.avatarUrl
    : session?.type === "GROUP"
        ? session.avatarUrl
        : contact?.avatarUrl ?? null;

  function openPhotoPreview(avatarUrl: string | null) {
    if (!avatarUrl) return;
    const url = /^https?:\/\//i.test(avatarUrl)
        ? avatarUrl
        : `${api.baseUrl}${avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`}`;
    setPhotoPreviewUrl(url);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSaveProfile({
        displayName: displayName.trim() || null,
        username: username.trim().replace(/^@/, "").toLowerCase() || null,
        bio: bio.trim() || null,
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photos must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onUploadAvatar(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload your photo.");
    } finally {
      setUploading(false);
    }
  }

  async function submitGroupProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupTitle.trim()) return;
    setSavingGroup(true);
    setError(null);
    try {
      await onUpdateGroupProfile({
        title: groupTitle.trim(),
        description: groupDescription.trim() || null,
      });
      setSavedGroup(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the group profile.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function uploadGroupAvatar(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Group photos must be 5 MB or smaller.");
      return;
    }
    setUploadingGroupAvatar(true);
    setError(null);
    try {
      await onUploadGroupAvatar(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the group photo.");
    } finally {
      setUploadingGroupAvatar(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        aria-label="Close profile panel"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-[26rem] flex-col overflow-y-auto border-l border-line bg-surface text-ink shadow-2xl"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-canvas">
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
          {view === "contact" && (
            <button type="button" aria-label="More profile actions" className="rounded-full p-2 hover:bg-canvas">
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close profile panel" className="rounded-full p-2 hover:bg-canvas">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {view === "saved" ? (
          <div className="grid gap-3 p-4">
            {savedMessages.length === 0 ? (
              <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
                Save a message from its context menu and it will appear here.
              </p>
            ) : savedMessages.map((savedMessage) => (
              <article key={savedMessage.messageId} className="rounded-xl border border-line bg-canvas p-3">
                <p className="mb-1 text-xs font-semibold text-accent">
                  {savedMessage.message.sender
                    ? userDisplayName(savedMessage.message.sender)
                    : "Saved message"}
                </p>
                {savedMessage.message.type === "IMAGE" ? (
                  <a href={`${api.baseUrl}${savedMessage.message.content}`} target="_blank" rel="noreferrer">
                    <img
                      src={`${api.baseUrl}${savedMessage.message.content}`}
                      alt="Saved shared image"
                      crossOrigin="use-credentials"
                      className="max-h-64 w-full rounded-lg object-contain"
                    />
                  </a>
                ) : savedMessage.message.type === "VOICE" ? (
                  <audio controls src={`${api.baseUrl}${savedMessage.message.content}`} crossOrigin="use-credentials" className="w-full" />
                ) : savedMessage.message.type === "VIDEO" ? (
                  <video controls src={`${api.baseUrl}${savedMessage.message.content}`} crossOrigin="use-credentials" className="max-h-64 w-full rounded-lg" />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {savedMessage.message.type === "FILE" ? "Shared file" : savedMessage.message.content}
                  </p>
                )}
                <time className="mt-2 block text-right text-[11px] text-muted">
                  Saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(savedMessage.savedAt))}
                </time>
              </article>
            ))}
          </div>
        ) : view === "mine" ? (
          <div className="grid gap-5 p-5">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => openPhotoPreview(user.avatarUrl)}
                disabled={!user.avatarUrl}
                aria-label="View profile photo"
                className="shrink-0 rounded-full disabled:cursor-default"
              >
                <UserAvatar user={user} className="size-20 border-0 text-2xl" />
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas">
                <Camera aria-hidden="true" className="size-4" />
                {uploading ? "Uploading…" : "Change photo"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void uploadAvatar(file);
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted">Signed in as {user.email}</p>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <form onSubmit={(event) => void submitProfile(event)} className="grid gap-4">
              <label className="grid gap-1.5 text-sm">
                Name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} className="h-10 rounded-lg border border-line bg-canvas px-3" />
              </label>
              <label className="grid gap-1.5 text-sm">
                Username
                <span className="flex h-10 items-center rounded-lg border border-line bg-canvas px-3">
                  <span className="text-muted">@</span>
                  <input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))} maxLength={32} autoCapitalize="none" className="min-w-0 flex-1 bg-transparent px-1 outline-none" />
                </span>
                <span className="text-xs text-muted">3–32 lowercase letters, numbers, or underscores.</span>
              </label>
              <label className="grid gap-1.5 text-sm">
                Bio
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={3} className="resize-y rounded-lg border border-line bg-canvas px-3 py-2" />
              </label>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : saved ? <><Check aria-hidden="true" className="size-4" /> Saved</> : "Save profile"}
              </Button>
            </form>
            <section className="grid gap-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Navigation color</h3>
              <div className="flex flex-wrap gap-3">
                {navigationPalettes.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    aria-label={color.name}
                    title={color.name}
                    onClick={() => onColumnColorChange(color.value)}
                    aria-pressed={palette.value === color.value}
                    className={`size-8 rounded-full border-2 border-white shadow ring-1 ring-line ${palette.value === color.value ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <>
            <section className="flex flex-col items-center border-b border-line px-5 py-7 text-center">
              <button
                type="button"
                onClick={() => openPhotoPreview(profileAvatarUrl)}
                disabled={!profileAvatarUrl}
                aria-label={`View ${title} profile photo`}
                className="mb-3 shrink-0 rounded-full disabled:cursor-default"
              >
                {contact ? (
                  <UserAvatar user={contact} className="size-28 border-0 text-3xl" />
                ) : session?.type === "GROUP" ? (
                  <GroupAvatar title={session.title} avatarUrl={session.avatarUrl} className="size-28 border-0 text-3xl" />
                ) : (
                  <div className="grid size-28 place-items-center rounded-full bg-accent-soft text-4xl font-semibold text-accent">
                    {session?.title.slice(0, 1).toUpperCase() ?? "C"}
                  </div>
                )}
              </button>
              <h3 className="max-w-full truncate text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">
                {contact?.status === "ONLINE"
                  ? "online"
                  : contact?.lastSeen
                    ? `last seen ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(contact.lastSeen))}`
                    : session?.type === "GROUP"
                      ? `${session.users.length} members`
                      : "last seen recently"}
              </p>
              {contact?.bio && <p className="mt-3 max-w-sm text-sm leading-5 text-muted">{contact.bio}</p>}
              {session?.type === "GROUP" && session.description && (
                <p className="mt-3 max-w-sm whitespace-pre-wrap text-sm leading-5 text-muted">{session.description}</p>
              )}
            </section>
            {session?.type === "GROUP" && (
              <section className="grid gap-3 border-b border-line p-4">
                <div className="flex items-center gap-2">
                  <Users aria-hidden="true" className="size-4 text-muted" />
                  <h3 className="text-sm font-semibold">
                    Members <span className="font-normal text-muted">({groupMembers.length})</span>
                  </h3>
                </div>
                {groupOwner ? (
                  <div className="flex items-center gap-3 rounded-lg bg-canvas p-3">
                    <UserAvatar user={groupOwner.user} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{userDisplayName(groupOwner.user)}</p>
                      <p className="text-xs text-muted">
                        {groupOwner.user.id === user.id ? "Group owner · You" : "Group owner"}
                      </p>
                    </div>
                    <Crown aria-label="Group owner" className="size-4 shrink-0 text-amber-500" />
                  </div>
                ) : (
                  <p className="text-sm text-muted">Owner details are unavailable.</p>
                )}
                <ul className="grid gap-2">
                  {groupMembers.filter((member) => member.user.id !== session.ownerId).map((member) => (
                    <li key={member.id} className="flex items-center gap-3 rounded-lg px-1 py-1">
                      <UserAvatar user={member.user} className="size-9 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{userDisplayName(member.user)}</p>
                        <p className="text-xs text-muted">
                          {member.role === "ADMIN" ? "Admin" : "Member"}
                        </p>
                      </div>
                      {member.user.id === user.id && (
                        <span className="text-xs text-muted">You</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="grid grid-cols-4 border-b border-line px-3 py-3">
              <Action icon={<Bookmark className="size-5" />} label="Message" onClick={onClose} />
              <Action icon={<VolumeX className="size-5" />} label={muted ? "Unmute" : "Mute"} onClick={onToggleMute} />
              <Action icon={<Phone className="size-5" />} label="Call" onClick={onCall} />
              <Action icon={<MoreHorizontal className="size-5" />} label="More" onClick={() => setShowMore((value) => !value)} />
            </div>
            {isGroupOwner && session?.type === "GROUP" && (
              <section className="grid gap-4 border-b border-line p-4">
                <div>
                  <h3 className="text-sm font-semibold">Edit group profile</h3>
                  <p className="mt-1 text-xs text-muted">Only the group owner can change these details.</p>
                </div>
                {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPhotoPreview(session.avatarUrl)}
                    disabled={!session.avatarUrl}
                    aria-label="View group photo"
                    className="shrink-0 rounded-full disabled:cursor-default"
                  >
                    <GroupAvatar title={session.title} avatarUrl={session.avatarUrl} className="size-14 text-xl" />
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-canvas">
                    <Camera aria-hidden="true" className="size-4" />
                    {uploadingGroupAvatar ? "Uploading…" : "Change group photo"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingGroupAvatar}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void uploadGroupAvatar(file);
                      }}
                    />
                  </label>
                </div>
                <form onSubmit={(event) => void submitGroupProfile(event)} className="grid gap-3">
                  <label className="grid gap-1.5 text-sm">
                    Group name
                    <input
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.currentTarget.value)}
                      maxLength={120}
                      required
                      className="h-10 rounded-lg border border-line bg-canvas px-3"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    About
                    <textarea
                      value={groupDescription}
                      onChange={(event) => setGroupDescription(event.currentTarget.value)}
                      maxLength={500}
                      rows={3}
                      className="resize-y rounded-lg border border-line bg-canvas px-3 py-2"
                    />
                    <span className="text-xs text-muted">Up to 500 characters.</span>
                  </label>
                  <Button type="submit" disabled={savingGroup || !groupTitle.trim()}>
                    {savingGroup ? "Saving…" : savedGroup ? <><Check aria-hidden="true" className="size-4" /> Saved</> : "Save group profile"}
                  </Button>
                </form>
              </section>
            )}
            {showMore && (
              <div className="grid gap-2 border-b border-line p-4">
                <button
                  type="button"
                  onClick={() => {
                    const value = contact?.username ? `@${contact.username}` : contact?.email;
                    if (!value) return;
                    void navigator.clipboard.writeText(value)
                      .then(() => setMoreFeedback("Copied to clipboard."))
                      .catch(() => setMoreFeedback("Could not access the clipboard."));
                  }}
                  className="min-h-10 rounded-lg bg-canvas px-3 text-left text-sm hover:bg-line/50"
                >
                  Copy username or email
                </button>
                {moreFeedback && <p role="status" className="text-xs text-muted">{moreFeedback}</p>}
              </div>
            )}
            <section className="grid gap-3 border-b border-line px-5 py-4 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Info</h3>
              {contact?.username && <InfoRow label="Username" value={`@${contact.username}`} />}
              <InfoRow label="Email" value={contact?.email ?? "Not available"} />
              <InfoRow label="Phone" value="Not available" />
            </section>
            <section className="grid gap-1 px-3 py-4">
              <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Shared media</h3>
              <MediaRow icon={<ImageIcon className="size-5" />} label="Photos" count={session?.mediaCounts?.photos ?? media.photos.length} onClick={() => setGallery(gallery === "photos" ? null : "photos")} />
              <MediaRow icon={<Film className="size-5" />} label="Videos" count={session?.mediaCounts?.videos ?? media.videos.length} onClick={() => setGallery(gallery === "videos" ? null : "videos")} />
              <MediaRow icon={<FileText className="size-5" />} label="Files" count={session?.mediaCounts?.files ?? media.files.length} onClick={() => setGallery(gallery === "files" ? null : "files")} />
              <MediaRow icon={<Mic className="size-5" />} label="Voice messages" count={session?.mediaCounts?.voice ?? media.voice.length} onClick={() => setGallery(gallery === "voice" ? null : "voice")} />
              {gallery && (
                <div className="mt-2 grid grid-cols-3 gap-2 p-2">
                  {gallery === "photos" && media.photos.map((message) => (
                    <a key={message.id} href={`${api.baseUrl}${message.content}`} target="_blank" rel="noreferrer">
                      <img src={`${api.baseUrl}${message.content}`} alt="Shared photo" crossOrigin="use-credentials" className="aspect-square w-full rounded-md object-cover" />
                    </a>
                  ))}
                  {gallery === "videos" && media.videos.map((message) => (
                    <video key={message.id} controls src={`${api.baseUrl}${message.content}`} crossOrigin="use-credentials" className="col-span-3 max-h-64 w-full rounded-md" />
                  ))}
                  {gallery === "files" && media.files.map((message) => (
                    <a key={message.id} href={`${api.baseUrl}${message.content}`} target="_blank" rel="noreferrer" className="col-span-3 truncate rounded-md bg-canvas p-2 text-sm">
                      Shared file
                    </a>
                  ))}
                  {gallery === "voice" && media.voice.map((message) => (
                    <audio key={message.id} controls src={`${api.baseUrl}${message.content}`} crossOrigin="use-credentials" className="col-span-3 w-full" />
                  ))}
                  {media[gallery].length === 0 && <p className="col-span-3 px-1 py-2 text-sm text-muted">No shared {gallery} yet.</p>}
                </div>
              )}
            </section>
          </>
        )}
      </aside>
      {photoPreviewUrl && (
        <ImageLightbox
          src={photoPreviewUrl}
          alt={`${title} profile photo`}
          onClose={() => setPhotoPreviewUrl(null)}
        />
      )}
    </div>
  );
}

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid justify-items-center gap-1 rounded-lg py-2 text-xs text-accent hover:bg-canvas">
      {icon}
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 break-all">{value}</p></div>;
}

function MediaRow({ icon, label, count, onClick }: { icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-left hover:bg-canvas">
      <span className="text-accent">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-xs text-muted">{count || ""}</span>
    </button>
  );
}
