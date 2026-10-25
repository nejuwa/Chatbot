"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function PasswordResetForm() {
  return (
    <Suspense fallback={<div className="w-full max-w-md"><Spinner /></div>}>
      <PasswordResetFormContent />
    </Suspense>
  );
}

function PasswordResetFormContent() {
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (resetToken) {
        const result = await api.auth.resetPassword(resetToken, password);
        setSuccess(result.data.message);
      } else {
        const result = await api.auth.requestPasswordReset(email);
        setSuccess(result.data.message);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The password reset request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-lg border border-line bg-surface p-6 mobile:p-8">
      <Link href="/" className="text-sm font-semibold tracking-wide text-accent">CHATBOT</Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">
        {resetToken ? "Choose a new password" : "Reset your password"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        {resetToken ? "Enter a new password for your account." : "We’ll email a one-time reset link if the account exists."}
      </p>
      {error && <div className="mt-6"><ErrorBanner message={error} /></div>}
      {success && (
        <p role="status" className="mt-6 rounded-md border border-line bg-accent-soft px-4 py-3 text-sm text-ink">
          {success}
        </p>
      )}
      <form className="mt-7 grid gap-5" onSubmit={submit}>
        {resetToken ? (
          <Input label="New password" name="password" type="password" showPasswordToggle autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        ) : (
          <Input label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? <Spinner label="Please wait…" /> : resetToken ? "Set new password" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">Return to sign in</Link>
      </p>
    </section>
  );
}
