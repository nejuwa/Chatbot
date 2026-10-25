"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function RegisterForm() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ displayName, email, password });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-white/30 bg-slate-950/35 p-6 text-white shadow-xl shadow-slate-950/10 backdrop-blur-2xl mobile:p-8">
      <Link href="/" className="text-sm font-semibold tracking-wide text-cyan-200"><img src="/chatlogo.png" alt="ChatGPT Logo" className="inline h-9 w-9" /> 
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">Create your account</h1>
      <p className="mt-2 text-sm leading-6 text-white/80">Start a private conversation with your AI assistant.</p>
      {error && <div className="mt-6"><ErrorBanner message={error} /></div>}
      <form className="mt-7 grid gap-5" onSubmit={submit}>
        <Input label="Display name" name="displayName" appearance="glass" autoComplete="name" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={busy} />
        <Input label="Email" name="email" type="email" appearance="glass" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
        <Input label="Password" name="password" type="password" showPasswordToggle appearance="glass" autoComplete="new-password" required minLength={8} maxLength={72} hint="Use at least 8 characters." value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        <Button type="submit" fullWidth disabled={busy}>{busy ? <Spinner label="Creating account…" /> : "Create account"}</Button>
      </form>
      <p className="mt-7 text-center text-sm text-white/80">
        Already registered? <Link href="/login" className="font-medium text-cyan-200 underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </section>
  );
}
