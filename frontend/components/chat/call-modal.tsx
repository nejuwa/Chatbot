"use client";

import { useState, type ReactNode } from "react";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import type { User } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";
import { UserAvatar } from "@/components/chat/user-avatar";

export function CallModal({
  contact,
  onClose,
}: {
  contact: Pick<User, "email" | "displayName" | "username" | "avatarUrl"> | null;
  onClose: () => void;
}) {
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-[#0e1621]/95 p-4 text-white">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Voice call"
        className="flex min-h-[min(38rem,90dvh)] w-full max-w-md flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#17212b] px-8 py-10 shadow-2xl"
      >
        {contact ? (
          <UserAvatar user={contact} className="mb-6 size-32 border-0 text-4xl" />
        ) : (
          <div className="mb-6 grid size-32 place-items-center rounded-full bg-[#253342] text-4xl">
            N
          </div>
        )}
        <h2 className="max-w-full truncate text-2xl font-semibold">
          {contact ? userDisplayName(contact) : "Nova"}
        </h2>
        <p className="mt-2 text-sm text-white/65">Calling…</p>
        <div className="mt-auto flex items-center gap-6 pt-16">
          <CallControl
            label={muted ? "Unmute microphone" : "Mute microphone"}
            active={muted}
            onClick={() => setMuted((value) => !value)}
            icon={muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          />
          <CallControl
            label={speaker ? "Turn speaker off" : "Turn speaker on"}
            active={speaker}
            onClick={() => setSpeaker((value) => !value)}
            icon={speaker ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="End call"
            className="grid size-14 place-items-center rounded-full bg-red-600 text-white hover:bg-red-700"
          >
            <PhoneOff aria-hidden="true" className="size-6" />
          </button>
        </div>
        <p className="mt-5 text-xs text-white/45">Call controls are a UI preview; calling is not connected yet.</p>
      </section>
    </div>
  );
}

function CallControl({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-12 place-items-center rounded-full ${active ? "bg-white text-[#17212b]" : "bg-white/10 text-white hover:bg-white/20"}`}
    >
      {icon}
    </button>
  );
}
