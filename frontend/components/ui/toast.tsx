"use client";

export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-line bg-accent-soft px-4 py-2 text-sm text-ink tablet:px-8"
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="shrink-0 font-medium text-accent underline underline-offset-2"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="shrink-0 px-1 text-muted hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
