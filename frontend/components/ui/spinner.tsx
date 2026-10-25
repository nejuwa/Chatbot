export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span aria-label={label} role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="size-4 rounded-full border-2 border-line border-t-accent" />
      <span>{label}</span>
    </span>
  );
}
