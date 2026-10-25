"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useUserSearch } from "@/hooks/use-user-search";
import type { UserSearchResult } from "@/types/api";
import { userDisplayName } from "@/lib/user-display";

export function CreateGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { title: string; participantIds: string[] }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { results, searching, error, canSearch, hasQuery } = useUserSearch(query);

  function toggleUser(user: UserSearchResult) {
    setSelectedUsers((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSubmitError(null);
    try {
      const created = await onCreate({
        title: title.trim(),
        participantIds: selectedUsers.map(({ id }) => id),
      });
      if (created) onClose();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create group" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4 p-5">
        <label className="grid gap-1.5 text-sm font-medium">
          Group name
          <input
            autoFocus
            required
            minLength={1}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="Name your group"
            className="min-h-11 rounded-md border border-line bg-surface px-3 text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium">
          Add people
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            minLength={2}
            maxLength={100}
            autoComplete="off"
            placeholder="Search by name or email"
            className="min-h-11 rounded-md border border-line bg-surface px-3 font-normal text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {searching && <p role="status" className="text-sm text-muted">Searching users…</p>}
        {canSearch && !searching && !error && results.length === 0 && (
          <p className="text-sm text-muted">User not found.</p>
        )}
        {!canSearch && hasQuery && (
          <p className="text-xs text-muted">Enter at least two characters to search.</p>
        )}
        {results.length > 0 && (
          <ul className="grid max-h-40 gap-1 overflow-y-auto" aria-label="User search results">
            {results.map((person) => {
              const selected = selectedUsers.some(({ id }) => id === person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => toggleUser(person)}
                    aria-pressed={selected}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-canvas ${
                      selected ? "bg-accent-soft" : ""
                    }`}
                  >
                    <UserAvatar user={person} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {userDisplayName(person)}
                      </span>
                      <span className="block truncate text-xs text-muted">{person.email}</span>
                    </span>
                    <span className="text-xs text-accent">{selected ? "Selected" : "Add"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedUsers.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs font-medium text-muted">
              Selected ({selectedUsers.length})
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Selected group members">
              {selectedUsers.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => toggleUser(person)}
                    aria-label={`Remove ${userDisplayName(person)}`}
                    className="flex items-center gap-2 rounded-full border border-line bg-canvas py-1 pl-1 pr-3 text-xs hover:border-accent"
                  >
                    <UserAvatar user={person} className="size-7" />
                    <span className="max-w-32 truncate">
                      {userDisplayName(person)}
                    </span>
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || selectedUsers.length === 0}>
            {busy ? "Creating…" : "Create group"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
