"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  showPasswordToggle?: boolean;
  appearance?: "default" | "glass";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = "", showPasswordToggle = false, appearance = "default", type, ...props }, ref) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const inputId = id ?? props.name;
    const helpId = `${inputId}-help`;
    const canTogglePassword = showPasswordToggle && type === "password";
    const glass = appearance === "glass";
    return (
      <div className="grid gap-1.5">
        <label className={`text-sm font-medium ${glass ? "text-white" : "text-ink"}`} htmlFor={inputId}>
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={canTogglePassword && passwordVisible ? "text" : type}
            aria-invalid={Boolean(error)}
            aria-describedby={error || hint ? helpId : undefined}
            className={`min-h-11 w-full rounded-md border px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-canvas ${glass ? "border-white/35 bg-white/90" : "border-line bg-surface"} ${error ? "border-danger" : ""} ${canTogglePassword ? "pr-12" : ""} ${className}`}
            {...props}
          />
          {canTogglePassword && (
            <button
              type="button"
              className={`absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-md focus-visible:z-10 ${glass ? "text-slate-600 hover:text-slate-950" : "text-muted hover:text-ink"}`}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-controls={inputId}
              aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible((visible) => !visible)}
              disabled={props.disabled}
            >
              <PasswordVisibilityIcon visible={passwordVisible} />
            </button>
          )}
        </div>
        {(error || hint) && (
          <p
            className={`text-sm ${error ? "text-danger" : glass ? "text-white/80" : "text-muted"}`}
            id={helpId}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.5 4.4 9.5 6-.4.7-1.3 2-2.8 3.3M6.2 6.2C3.9 7.7 2.7 9.7 2.5 11c1 1.6 4.3 6 9.5 6 1 0 2-.2 2.9-.5" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
