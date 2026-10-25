"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function LoginForm() {
  const { login, loading: authLoading, error: connectionError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not sign in. Check that the backend is running.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-white/30 bg-slate-950/35 p-6 text-white shadow-xl shadow-slate-950/10 backdrop-blur-2xl mobile:p-8">
      <Link href="/" className="text-sm font-semibold tracking-wide text-cyan-200">
        <img src="/chatlogo.png" alt="ChatGPT Logo" className="inline h-9 w-9" /> 
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-white/80">Sign in to continue your conversations.</p>
      {(error || connectionError) && (
        <div className="mt-6">
          <ErrorBanner message={error ?? connectionError ?? ""} />
        </div>
      )}
      <form className="mt-7 grid gap-5" onSubmit={submit}>
        <Input
          label="Email"
          name="email"
          type="email"
          appearance="glass"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={authLoading || busy}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          showPasswordToggle
          appearance="glass"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={authLoading || busy}
        />
        <div className="flex justify-end">
          <Link href="/reset-password" className="text-sm font-medium text-cyan-200 underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth disabled={authLoading || busy}>
          {busy ? <Spinner label="Signing in…" /> : "Sign in"}
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-white/70">
        <span className="h-px flex-1 bg-white/30" />
        <span>OR</span>
        <span className="h-px flex-1 bg-white/30" />
      </div>
      <Button
        type="button"
        fullWidth
        className="border border-white/50 bg-white/90 text-slate-900 hover:bg-white"
        disabled={busy}
        onClick={() => {
          window.location.assign(api.auth.googleLoginUrl());
        }}
      >
        <GoogleMark />
        Continue with Google
      </Button>
      <p className="mt-7 text-center text-sm text-white/80">
        New here?{" "}
        <Link href="/register" className="font-medium text-cyan-200 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.04 46.98 31.94 46.98 24.55Z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.93 23.93 0 0 0 0 24c0 3.88.93 7.55 2.56 10.78l7.97-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}
