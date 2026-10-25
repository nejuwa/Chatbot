"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { UserSearchResult } from "@/types/api";

export function useUserSearch(query: string) {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    let cancelled = false;
    if (normalizedQuery.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    setSearching(true);
    setError(null);
    const timeout = setTimeout(() => {
      void api.users.search(normalizedQuery)
        .then((users) => {
          if (!cancelled) setResults(users);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setResults([]);
          setError(cause instanceof Error ? cause.message : "Could not search users.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [normalizedQuery]);

  return {
    results,
    searching,
    error,
    canSearch: normalizedQuery.length >= 2,
    hasQuery: normalizedQuery.length > 0,
  };
}
