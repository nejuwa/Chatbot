"use client";

import { useEffect, useState, type FormEvent } from "react";
import { UserRound, UserRoundPlus } from "lucide-react";
import type { User } from "@/types/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Spinner } from "@/components/ui/spinner";

type SavedAccount = Pick<User, "id" | "email" | "displayName" | "username" | "avatarUrl">;

const ACCOUNTS_KEY = "chatbot.accounts";

function readSavedAccounts(): SavedAccount[] {
  const stored = window.localStorage.getItem(ACCOUNTS_KEY);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved accounts are invalid. Clear the saved account list and try again.");
  }
  return parsed.filter((account): account is SavedAccount =>
    typeof account === "object" &&
    account !== null &&
    "id" in account &&
    typeof account.id === "string" &&
    "email" in account &&
    typeof account.email === "string" &&
    "displayName" in account &&
    (typeof account.displayName === "string" || account.displayName === null) &&
    "username" in account &&
    (typeof account.username === "string" || account.username === null) &&
    "avatarUrl" in account &&
    (typeof account.avatarUrl === "string" || account.avatarUrl === null),
  );
}

function mergeAccount(accounts: SavedAccount[], user: SavedAccount) {
  return [user, ...accounts.filter((account) => account.id !== user.id)];
}

export function AccountManagerModal({
  currentUser,
  onLogin,
  onClose,
}: {
  currentUser: User;
  onLogin: (email: string, password: string) => Promise<User>;
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setAccounts(readSavedAccounts());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read saved accounts.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      const updated = mergeAccount(accounts, currentUser);
      if (JSON.stringify(updated) !== JSON.stringify(accounts)) {
        setAccounts(updated);
      }
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save account details on this device.");
    }
  }, [accounts, currentUser, loaded]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await onLogin(email.trim(), password);
      const nextAccounts = mergeAccount(accounts, user);
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(nextAccounts));
      setAccounts(nextAccounts);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in to this account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Accounts" onClose={onClose}>
      <div className="grid gap-5 p-5">
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">Saved accounts</h3>
          {accounts.map((account) => {
            const active = account.id === currentUser.id;
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => setEmail(account.email)}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-14 items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-canvas ${active ? "bg-accent-soft" : "bg-surface"}`}
              >
                <UserAvatar user={account} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {account.username ? `@${account.username}` : account.displayName || account.email}
                  </span>
                  <span className="block truncate text-xs text-muted">{account.email}</span>
                </span>
                {active ? <span className="text-xs text-accent">Current</span> : <UserRound aria-hidden="true" className="size-4 text-muted" />}
              </button>
            );
          })}
          <p className="text-xs leading-5 text-muted">
            For your security, passwords and sign-in tokens are not saved. Sign in again to switch accounts.
          </p>
        </section>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 border-t border-line pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserRoundPlus aria-hidden="true" className="size-4" />
            Add or switch account
          </h3>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <Input
            label="Email"
            name="account-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            disabled={busy}
          />
          <Input
            label="Password"
            name="account-password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner label="Signing in…" /> : "Sign in to account"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
