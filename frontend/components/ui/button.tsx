import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  fullWidth?: boolean;
};

const variants = {
  primary: "bg-primary text-primary-foreground hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:bg-canvas",
  quiet: "text-muted hover:bg-canvas hover:text-ink",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      style={variant === "primary" ? {
        ...style,
        backgroundColor: "var(--app-primary)",
        color: "var(--app-primary-foreground)",
      } : style}
      {...props}
    />
  );
}
