"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const FORCE_MOBILE_NAV = true;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLElement>("a")?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;

      const links = menuRef.current?.querySelectorAll<HTMLElement>("a");
      if (!links?.length) return;
      const first = links[0];
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        triggerRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        triggerRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === triggerRef.current) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const closeMenu = () => setOpen(false);
  const menuLayout = FORCE_MOBILE_NAV
    ? "fixed inset-x-0 top-0 z-40"
    : "fixed inset-x-0 top-0 z-40 desktop:hidden";

  return (
    <header className="relative z-50 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 mobile:px-10 tablet:px-16 desktop:px-20">
      <Link
        href="/"
        aria-label="Nova home"
        className="flex items-center text-sm font-semibold tracking-[0.18em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        onClick={closeMenu}
      >
        <Image src="/chatlogo.png" alt="" width={64} height={64} className="h-16 w-auto" />
        <span className="ml-2 text-lg font-bold tracking-normal">
          <span className="text-white">No</span>
          <span className="text-blue-300">va</span>
        </span>
      </Link>

      {!FORCE_MOBILE_NAV && (
        <nav aria-label="Main navigation" className="hidden items-center gap-8 desktop:flex">
          <NavigationLinks onNavigate={closeMenu} />
        </nav>
      )}

      <button
        ref={triggerRef}
        type="button"
        className={`relative z-50 inline-flex size-11 items-center justify-center rounded-md border border-white/40 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${FORCE_MOBILE_NAV ? "" : "desktop:hidden"}`}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="public-navigation-menu"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close navigation menu"
            className="fixed inset-0 z-40 cursor-default bg-slate-950/60"
            onClick={closeMenu}
          />
          <div
            ref={menuRef}
            id="public-navigation-menu"
            role="dialog"
            aria-label="Site navigation"
            aria-modal="true"
            className={`${menuLayout} border-b border-white/15 bg-[#073849] px-6 pb-8 pt-24 text-white shadow-lg mobile:px-10 tablet:px-16 desktop:px-20`}
          >
            <nav aria-label="Main navigation" className="mx-auto grid max-w-7xl gap-1">
              <NavigationLinks onNavigate={closeMenu} />
            </nav>
          </div>
        </>
      )}
    </header>
  );
}

function NavigationLinks({ onNavigate }: { onNavigate: () => void }) {
  const linkClass =
    "flex min-h-12 items-center border-b border-white/15 text-base font-medium text-white/90 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <>
      <a href="#features" className={linkClass} onClick={onNavigate}>
        About
      </a>
      <Link href="/login" className={linkClass} onClick={onNavigate}>
        Sign in
      </Link>
      <Link href="/register" className={linkClass} onClick={onNavigate}>
        Get started
      </Link>
    </>
  );
}
