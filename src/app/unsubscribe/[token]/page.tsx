import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  TEST_UNSUBSCRIBE_TOKEN,
  findSubscriberByToken,
  unsubscribeByToken,
} from "@/lib/unsubscribe";

// The unsubscribe page (2026-10-08) at news.jevca.art/unsubscribe/<token>
// — the link at the foot of every campaign mail. It asks to confirm
// (so a mail app or virus scanner opening the link doesn't unsubscribe
// anyone), then says it's done. In the subscriber's language, or the
// artist's when they have none. Test mails' link ("test") just says so.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

type Language = "EN" | "FR";

const TEXT = {
  EN: {
    ask: (artist: string, email: string) => `Stop receiving ${artist}'s mails at ${email}?`,
    button: "Unsubscribe",
    done: (artist: string) => `You're unsubscribed. You won't receive any more mails from ${artist}.`,
    unknown: "This unsubscribe link isn't recognised. If you keep receiving mails, reply to one and ask to be removed.",
    test: "This was a test mail, so there's nothing to unsubscribe from.",
  },
  FR: {
    ask: (artist: string, email: string) => `Ne plus recevoir les mails de ${artist} à l'adresse ${email} ?`,
    button: "Se désabonner",
    done: (artist: string) => `Vous êtes désabonné(e). Vous ne recevrez plus de mails de ${artist}.`,
    unknown:
      "Ce lien de désabonnement n'est pas reconnu. Si vous recevez encore des mails, répondez à l'un d'eux pour demander à être retiré(e).",
    test: "C'était un mail de test : il n'y a rien à désabonner.",
  },
} as const;

function languageOf(value: string | null | undefined): Language {
  return value?.toUpperCase() === "FR" ? "FR" : "EN";
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (token === TEST_UNSUBSCRIBE_TOKEN) {
    return (
      <Card>
        <p>{TEXT.EN.test}</p>
        <p className="mt-3 text-neutral-500">{TEXT.FR.test}</p>
      </Card>
    );
  }

  const subscriber = await findSubscriberByToken(token);
  if (!subscriber) {
    return (
      <Card>
        <p>{TEXT.EN.unknown}</p>
        <p className="mt-3 text-neutral-500">{TEXT.FR.unknown}</p>
      </Card>
    );
  }

  const text = TEXT[languageOf(subscriber.language ?? subscriber.artist.invoiceLanguage)];
  const artist = subscriber.artist.name;

  if (subscriber.status === "UNSUBSCRIBED") {
    return (
      <Card>
        <p>{text.done(artist)}</p>
      </Card>
    );
  }

  async function confirm() {
    "use server";
    await unsubscribeByToken(token);
    redirect(`/unsubscribe/${encodeURIComponent(token)}`);
  }

  return (
    <Card>
      <p>{text.ask(artist, subscriber.email)}</p>
      <form action={confirm} className="mt-6">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {text.button}
        </button>
      </form>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center text-base leading-relaxed text-neutral-800 shadow-sm">
        {children}
      </div>
    </main>
  );
}
