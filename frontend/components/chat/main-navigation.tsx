"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  ContactRound,
  Menu,
  Moon,
  Phone,
  Sparkles,
  Settings2,
  Sun,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import type { User } from "@/types/api";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { AccountManagerModal } from "@/components/chat/account-manager-modal";
import { ContactsManagerModal } from "@/components/chat/contacts-manager-modal";
import type { UserSearchResult } from "@/types/api";

export type ChatSection = "personal" | "groups" | "ai";

export function MainNavigation({
  user,
  columnColor,
  columnForeground,
  section,
  darkMode,
  isMainMenuOpen,
  onMainMenuOpenChange,
  onSectionChange,
  onMobileSectionSelect,
  onThemeChange,
  onMobileChats,
  onNewGroup,
  onLogout,
  onMyProfile,
  onSavedMessages,
  onCall,
  onOpenContact,
}: {
  user: User;
  columnColor: string;
  columnForeground: string;
  section: ChatSection;
  darkMode: boolean;
  isMainMenuOpen: boolean;
  onMainMenuOpenChange: (open: boolean) => void;
  onSectionChange: (section: ChatSection) => void;
  onMobileSectionSelect: (section: ChatSection) => void;
  onThemeChange: (dark: boolean) => void;
  onMobileChats: () => void;
  onNewGroup: () => void;
  onLogout: () => void;
  onMyProfile: () => void;
  onSavedMessages: () => void;
  onCall: () => void;
  onOpenContact: (contact: UserSearchResult) => Promise<void>;
}) {
  const { login } = useAuth();
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  useEffect(() => {
    if (!isMainMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onMainMenuOpenChange(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMainMenuOpen, onMainMenuOpenChange]);

  const sections = [
    { id: "personal" as const, label: "Personal", icon: ContactRound },
    { id: "groups" as const, label: "Groups", icon: UsersRound },
    { id: "ai" as const, label: "AI Chat", icon: Sparkles },
  ];

  function closeMenu() {
    onMainMenuOpenChange(false);
  }

  function openNewGroup() {
    closeMenu();
    onNewGroup();
  }

  return (
    <>
      <nav
        aria-label="Main navigation"
        style={{
          backgroundColor: darkMode ? "var(--app-canvas)" : columnColor || "var(--app-surface)",
          color: darkMode ? "var(--app-ink)" : columnForeground,
        }}
        className="relative z-10 hidden h-full w-[4.25rem] shrink-0 flex-col items-center border-r border-line py-3 tablet:flex"
      >
        <button
          type="button"
          onClick={() => onMainMenuOpenChange(!isMainMenuOpen)}
          aria-label={isMainMenuOpen ? "Close main menu" : "Open main menu"}
          aria-expanded={isMainMenuOpen}
          title="Main menu"
          className="flex size-11 items-center justify-center rounded-xl text-current hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-accent"
          style={isMainMenuOpen ? { backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" } : undefined}
        >
          {isMainMenuOpen
            ? <X aria-hidden="true" className="size-5" strokeWidth={1.8} />
            : <Menu aria-hidden="true" className="size-5" strokeWidth={1.8} />}
        </button>
        <div className="mt-5 grid gap-2">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onSectionChange(id);
                closeMenu();
              }}
              aria-label={label}
              aria-current={section === id ? "page" : undefined}
              title={label}
              className="flex size-11 items-center justify-center rounded-xl text-current transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-accent"
              style={section === id ? { backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" } : undefined}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onThemeChange(!darkMode)}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Light mode" : "Night mode"}
            aria-pressed={darkMode}
            className="flex size-11 items-center justify-center rounded-xl text-current hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {darkMode
              ? <Sun aria-hidden="true" className="size-5" strokeWidth={1.8} />
              : <Moon aria-hidden="true" className="size-5" strokeWidth={1.8} />}
          </button>
        </div>
        <div className="mt-auto grid gap-2">
          <button
            type="button"
            onClick={() => onMainMenuOpenChange(true)}
            aria-label="Settings"
            title="Settings"
            className="flex size-11 items-center justify-center rounded-xl text-current hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Settings2 aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </button>
        </div>
      </nav>

      <nav
        aria-label="Chat sections"
        className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] text-ink shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur tablet:hidden"
      >
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onMobileSectionSelect(id);
            }}
            aria-label={label}
            aria-current={section === id ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] focus-visible:outline-2 focus-visible:outline-accent ${
              section === id ? "text-accent" : "text-muted"
            }`}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={section === id ? 2.2 : 1.8} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>

      {isMainMenuOpen && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close main menu"
            className="absolute inset-0 bg-black/45"
            onClick={closeMenu}
          />
          <aside
            aria-label="Main menu"
            className="absolute inset-y-0 left-0 flex w-[17.125rem] max-w-[86vw] flex-col overflow-y-auto border-r border-line bg-surface text-ink shadow-2xl"
          >
            <div className="shrink-0 border-b border-line px-6 pb-4 pt-5">
              <UserAvatar user={user} className="mb-4 size-12 border-0" />
              <p className="truncate text-sm font-semibold">
                {user.username ? `@${user.username}` : user.displayName || user.email}
              </p>
              <p className="mt-1 text-sm text-accent">Set Emoji Status</p>
              <p className="mt-1 truncate text-xs text-muted">{user.email}</p>
            </div>

            <div className="py-2">
                <MenuItem
                  icon={ContactRound}
                  label="Chats"
                  onClick={() => {
                    closeMenu();
                    onMobileChats();
                  }}
                />
                <MenuItem
                  icon={UserRound}
                  label="My Profile"
                  onClick={() => {
                    closeMenu();
                    onMyProfile();
                  }}
                />
                <MenuItem
                  icon={UsersRound}
                  label="New Group"
                  onClick={openNewGroup}
                />
                <MenuItem
                  icon={Phone}
                  label="Calls"
                  onClick={() => {
                    closeMenu();
                    onCall();
                  }}
                />
                <MenuItem
                  icon={Bookmark}
                  label="Saved Messages"
                  onClick={() => {
                    closeMenu();
                    onSavedMessages();
                  }}
                />
                <div className="my-2 border-t border-line" />
                <MenuItem
                  icon={Settings2}
                  label="Settings"
                  onClick={closeMenu}
                />
                <MenuItem
                  icon={ContactRound}
                  label="Contacts"
                  onClick={() => {
                    closeMenu();
                    setContactsOpen(true);
                  }}
                />
                <MenuItem
                  icon={UserRoundPlus}
                  label="Add Account"
                  onClick={() => {
                    closeMenu();
                    setAccountManagerOpen(true);
                  }}
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={darkMode}
                  onClick={() => onThemeChange(!darkMode)}
                  className="flex min-h-11 w-full items-center gap-4 px-6 text-left text-sm hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {darkMode
                    ? <Sun aria-hidden="true" className="size-5 text-muted" />
                    : <Moon aria-hidden="true" className="size-5 text-muted" />}
                  <span className="flex-1">Night Mode</span>
                  <span
                    aria-hidden="true"
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      darkMode ? "bg-accent" : "bg-muted/45"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                        darkMode ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
                <div className="my-2 border-t border-line" />
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onLogout();
                  }}
                  className="flex min-h-11 w-full items-center px-6 text-left text-sm text-danger hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Sign out
                </button>
            </div>

            <p className="mt-auto px-6 pb-5 pt-4 text-xs text-muted">Nova Chat</p>
          </aside>
        </div>
      )}
      {accountManagerOpen && (
        <AccountManagerModal
          currentUser={user}
          onLogin={login}
          onClose={() => setAccountManagerOpen(false)}
        />
      )}
      {contactsOpen && (
        <ContactsManagerModal
          onOpenContact={onOpenContact}
          onClose={() => setContactsOpen(false)}
        />
      )}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-4 px-6 text-left text-sm hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon aria-hidden="true" className="size-5 text-muted" strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}
