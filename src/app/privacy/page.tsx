import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy — JEVCA Studio" };

// The privacy statement for the JEVCA Studio admin tool (2026-10-09) —
// Google requires a public one before the Gmail connection used by the
// Inbox's Personal tab can be published. Public (see middleware.ts).
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-lg border border-neutral-200 bg-white p-8 text-sm leading-relaxed text-neutral-700">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900">JEVCA Studio — Privacy</h1>

        <p className="mb-4">
          JEVCA Studio is a private administration tool used by Je T&apos;envoie ÇA to manage its clients&apos;
          websites. It is not offered to the public, and only its owner can sign in.
        </p>

        <h2 className="mb-2 mt-6 font-semibold text-neutral-900">Gmail</h2>
        <p className="mb-4">
          The owner can connect their own Google account so their email appears in the tool&apos;s Inbox. The tool
          then reads, sends, archives and moves to Bin email in that account, only when the owner does so in the
          tool. Email is read directly from Google each time and is not stored by JEVCA Studio. The only thing kept
          is the access permission Google provides, stored encrypted, and it is deleted when Gmail is disconnected.
          This permission can also be withdrawn at any time from the Google account&apos;s security settings.
        </p>
        <p className="mb-4">
          Data obtained from Google is used only to show and manage the owner&apos;s own email in the tool. It is
          never sold, shared with anyone else, used for advertising, or used to train any AI model. JEVCA
          Studio&apos;s use of information received from Google APIs adheres to the Google API Services User Data
          Policy, including the Limited Use requirements.
        </p>

        <h2 className="mb-2 mt-6 font-semibold text-neutral-900">Contact</h2>
        <p>craig@isendyouthis.com</p>
      </div>
    </div>
  );
}
