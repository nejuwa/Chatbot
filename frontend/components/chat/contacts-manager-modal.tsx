"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Search, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useUserSearch } from "@/hooks/use-user-search";
import { api } from "@/lib/api";
import { userDisplayName } from "@/lib/user-display";
import type { SavedContact, UserSearchResult } from "@/types/api";

type ContactsTab = "list" | "add";

export function ContactsManagerModal({
  onOpenContact,
  onClose,
}: {
  onOpenContact: (contact: UserSearchResult) => Promise<void>;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [tab, setTab] = useState<ContactsTab>("list");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { results, searching, error: searchError, canSearch } = useUserSearch(query);
  const contactIds = useMemo(() => new Set(contacts.map((contact) => contact.id)), [contacts]);
  const availableResults = results.filter((person) => !contactIds.has(person.id));

  useEffect(() => {
    let cancelled = false;
    void api.users.contacts()
      .then((result) => {
        if (!cancelled) setContacts(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load contacts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addContact(person: UserSearchResult) {
    setBusyId(person.id);
    setError(null);
    try {
      const saved = await api.users.addContact(person.id);
      setContacts((current) => [saved, ...current.filter((contact) => contact.id !== saved.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this contact.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeContact(contactId: string) {
    setBusyId(contactId);
    setError(null);
    try {
      await api.users.removeContact(contactId);
      setContacts((current) => current.filter((contact) => contact.id !== contactId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this contact.");
    } finally {
      setBusyId(null);
    }
  }

  async function openContact(contact: SavedContact) {
    setBusyId(contact.id);
    setError(null);
    try {
      await onOpenContact(contact);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this conversation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Contacts" onClose={onClose}>
      <div className="grid max-h-[min(75dvh,44rem)] gap-4 overflow-y-auto p-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div role="tablist" aria-label="Contact actions" className="grid grid-cols-2 rounded-lg bg-canvas p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "list"}
            onClick={() => setTab("list")}
            className={`min-h-10 rounded-md px-3 text-sm font-medium ${tab === "list" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Contact list ({contacts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "add"}
            onClick={() => setTab("add")}
            className={`min-h-10 rounded-md px-3 text-sm font-medium ${tab === "add" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Add contact
          </button>
        </div>
        {tab === "list" ? (
          <section role="tabpanel" className="grid gap-2">
            {loading ? (
              <div className="py-5"><Spinner label="Loading contacts…" /></div>
            ) : contacts.length ? (
              <ul className="grid gap-1">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas">
                    <UserAvatar user={contact} className="size-10" />
                    <button
                      type="button"
                      onClick={() => void openContact(contact)}
                      disabled={busyId !== null}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-medium">{userDisplayName(contact)}</span>
                      <span className="block truncate text-xs text-muted">
                        {contact.status === "ONLINE" ? "Online" : contact.email}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Message ${userDisplayName(contact)}`}
                      title="Open conversation"
                      onClick={() => void openContact(contact)}
                      disabled={busyId !== null}
                      className="grid size-9 place-items-center rounded-full text-accent hover:bg-accent-soft disabled:opacity-50"
                    >
                      {busyId === contact.id ? <Spinner label="Opening…" /> : <MessageCircle aria-hidden="true" className="size-4" />}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${userDisplayName(contact)} from contacts`}
                      title="Remove contact"
                      onClick={() => void removeContact(contact.id)}
                      disabled={busyId !== null}
                      className="grid size-9 place-items-center rounded-full text-muted hover:bg-canvas hover:text-danger disabled:opacity-50"
                    >
                      <UserRoundMinus aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid justify-items-center gap-3 rounded-lg bg-canvas p-6 text-center">
                <p className="text-sm text-muted">Your contact list is empty.</p>
                <Button type="button" onClick={() => setTab("add")}>
                  <UserRoundPlus aria-hidden="true" className="size-4" />
                  Add your first contact
                </Button>
              </div>
            )}
          </section>
        ) : (
          <section role="tabpanel" className="grid gap-3">
            <label className="relative block">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <span className="sr-only">Search users by name, username, or email</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                maxLength={100}
                autoComplete="off"
                placeholder="Search by name, username, or email"
                className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted"
              />
            </label>
            {searchError && <p role="alert" className="text-sm text-danger">{searchError}</p>}
            {canSearch && searching && <p role="status" className="text-sm text-muted">Searching users…</p>}
            {canSearch && !searching && !searchError && (
              availableResults.length ? (
                <ul className="grid gap-1">
                  {availableResults.map((person) => (
                    <li key={person.id} className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas">
                      <UserAvatar user={person} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{userDisplayName(person)}</span>
                        <span className="block truncate text-xs text-muted">
                          {person.status === "ONLINE" ? "Online" : person.email}
                        </span>
                      </span>
                      <Button
                        type="button"
                        onClick={() => void addContact(person)}
                        disabled={busyId !== null}
                        className="min-h-9 px-3"
                      >
                        {busyId === person.id ? <Spinner label="Adding…" /> : <><UserRoundPlus aria-hidden="true" className="size-4" /> Add</>}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No new users found.</p>
              )
            )}
            {!canSearch && query.trim() && <p className="text-xs text-muted">Enter at least two characters to search.</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
