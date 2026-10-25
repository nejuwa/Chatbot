import { Button } from "./button";

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <p>{message}</p>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="quiet" className="min-h-9 px-2 text-danger" onClick={onRetry}>
            Try again
          </Button>
        )}
        {onDismiss && (
          <Button variant="quiet" className="min-h-9 px-2 text-danger" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
