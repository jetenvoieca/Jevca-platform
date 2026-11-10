import type { ReactNode } from "react";

// The sign-up pages' frame (2026-11-10, simple and clean as Craig asked):
// a white page, the business's name, a heading, the content.
export default function SignupFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10 sm:py-16">
      <p className="mb-10 text-sm uppercase tracking-[0.2em] text-neutral-500">Je t&apos;envoie ça</p>
      <h1 className="mb-6 text-3xl font-light text-neutral-900">{title}</h1>
      {children}
    </main>
  );
}
