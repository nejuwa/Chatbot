"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { reloadUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void reloadUser()
      .then(() => router.replace("/chat"))
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Google sign-in could not be completed.");
      });
    return () => {
      active = false;
    };
  }, [reloadUser, router]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-lg content-center gap-5 px-4">
      {error ? (
        <>
          <ErrorBanner message={error} />
          <a className="text-sm font-medium text-accent underline underline-offset-4" href="/login">
            Return to sign in
          </a>
        </>
      ) : (
        <Spinner label="Finishing Google sign-in…" />
      )}
    </main>
  );
}
