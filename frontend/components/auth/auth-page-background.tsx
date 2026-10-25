import type { ReactNode } from "react";

export function AuthPageBackground({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 py-10">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/photo.jpg')" }}
      />
      <div aria-hidden="true" className="fixed inset-0 -z-10 bg-slate-950/20" />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
