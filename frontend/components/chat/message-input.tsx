"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { Mic, Smile, Square } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "video/webm",
  "video/mp4",
].join(",");

export function MessageInput({
  disabled,
  sending,
  darkMode = false,
  onSend,
  onUpload,
  onTypingChange,
}: {
  disabled?: boolean;
  sending: boolean;
  darkMode?: boolean;
  onSend: (message: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onTypingChange?: (typing: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!emojiPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !emojiPickerRef.current?.contains(event.target)
      ) {
        setEmojiPickerOpen(false);
      }
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setEmojiPickerOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiPickerOpen]);

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = value.trim();
    if (!content || disabled || sending) return;
    setValue("");
    onTypingChange?.(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      await onSend(content);
    } catch {
      setValue(content);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function insertEmoji(emoji: string) {
    if (value.length + emoji.length > MAX_MESSAGE_LENGTH) return;
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const next = `${value.slice(0, cursor)}${emoji}${value.slice(cursor)}`;
    setValue(next);
    onTypingChange?.(true);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(cursor + emoji.length, cursor + emoji.length);
      if (textarea) textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    });
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setUploadError("Files must be 25 MB or smaller.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      await onUpload(file);
    } catch (cause) {
      setUploadError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : "The file could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUploadError("Voice recording is not supported in this browser.");
      return;
    }
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        setRecording(false);
        setUploadError("The voice message could not be recorded.");
        stream.getTracks().forEach((track) => track.stop());
        setUploading(false);
      };
      recorder.onstop = () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const type = recorder.mimeType.split(";")[0] || "audio/webm";
        const extension = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const voice = new File(chunks, `voice-message.${extension}`, { type });
        if (voice.size > MAX_UPLOAD_SIZE_BYTES) {
          setUploadError("Voice messages must be 25 MB or smaller.");
          return;
        }
        setUploading(true);
        void onUpload(voice)
          .catch((cause: unknown) => {
            setUploadError(cause instanceof Error ? cause.message : "The voice message could not be sent.");
          })
          .finally(() => setUploading(false));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setUploading(false);
      setUploadError(null);
      setRecording(true);
    } catch (cause) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setUploadError(cause instanceof Error ? cause.message : "Microphone access was denied.");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={(event) => void handleFileChange(event)}
        disabled={disabled || sending || uploading}
        aria-label="Choose a file to attach"
      />
      {uploadError && (
        <p role="alert" className="mb-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {uploadError}
        </p>
      )}
      <div className="flex items-end gap-2 rounded-[1.75rem] border border-line bg-surface px-2 py-2 shadow-sm focus-within:border-chat-outgoing">
        <button
          type="button"
          className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Attach a file"
          title="Attach a file"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending || uploading || recording}
        >
          {uploading ? <Spinner label="Uploading file…" /> : <AttachmentIcon />}
        </button>
        <label htmlFor="chat-message" className="sr-only">Write a message</label>
        <textarea
          ref={textareaRef}
          id="chat-message"
          name="message"
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          value={value}
          disabled={disabled || sending || uploading || recording}
          onChange={(event) => {
            setValue(event.target.value);
            onTypingChange?.(Boolean(event.target.value.trim()));
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 200)}px`;
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => onTypingChange?.(false)}
          placeholder="Write a message…"
          className="chat-message-textarea block max-h-48 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-base leading-6 text-ink outline-none placeholder:text-muted focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed"
          aria-describedby="message-input-help"
        />
        <p id="message-input-help" className="sr-only">
          Press Enter to send. Press Shift and Enter for a new line.
        </p>
        <div ref={emojiPickerRef} className="relative mb-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setEmojiPickerOpen((open) => !open)}
            disabled={disabled || sending || uploading}
            aria-label={emojiPickerOpen ? "Close emoji picker" : "Open emoji picker"}
            title="Choose an emoji"
            aria-expanded={emojiPickerOpen}
            className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Smile aria-hidden="true" className="size-5" />
          </button>
          {emojiPickerOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-3 overflow-hidden rounded-xl border border-line shadow-xl">
              <EmojiPicker
                theme={darkMode ? "dark" : "light"}
                width={Math.min(350, typeof window === "undefined" ? 350 : window.innerWidth - 32)}
                height={400}
                onEmojiClick={(selection) => insertEmoji(selection.emoji)}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (recording) {
              mediaRecorderRef.current?.stop();
              setRecording(false);
            } else {
              void startVoiceRecording();
            }
          }}
          disabled={disabled || sending || uploading}
          aria-label={recording ? "Stop voice recording" : "Record voice message"}
          title={recording ? "Stop recording" : "Record voice message"}
          className={`mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${
            recording ? "bg-danger text-white" : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          {recording ? <Square aria-hidden="true" className="size-4 fill-current" /> : <Mic aria-hidden="true" className="size-5" />}
        </button>
        {value.length > 0 && (
          <span className="mb-2 text-xs tabular-nums text-muted">{value.length}/{MAX_MESSAGE_LENGTH}</span>
        )}
        <button
          type="submit"
          disabled={disabled || sending || uploading || recording || !value.trim()}
          aria-label="Send message"
          className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full p-0 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{
            backgroundColor: "var(--app-primary)",
            color: "var(--app-primary-foreground)",
          }}
        >
          {sending || uploading ? <Spinner label={uploading ? "Uploading…" : "Sending…"} /> : <span aria-hidden="true" className="text-xl leading-none">➤</span>}
        </button>
      </div>
    </form>
  );
}

function AttachmentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12.5 6.8-6.8a3.2 3.2 0 114.5 4.5l-9.1 9.1a5 5 0 01-7.1-7.1l9.2-9.2" />
    </svg>
  );
}
