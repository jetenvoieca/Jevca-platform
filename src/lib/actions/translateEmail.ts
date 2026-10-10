"use server";

import Anthropic from "@anthropic-ai/sdk";

// Translate on an opened email in the Inbox (2026-10-09, direct request —
// French emails into English), on every email tab. Uses Claude, with the
// same ANTHROPIC_API_KEY as campaign translation (see translateMail.ts).
// Takes the email's readable text (what "Show text" shows), so nothing
// needs fetching again; nothing is stored.

// The fast model: a whole email comes back in one request, which has to
// finish well inside the time a request to the site is allowed to take.
const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 4000;
// Very long emails (long threads quoted below) are cut to this many
// characters first — the message itself is always at the top.
const MAX_INPUT_CHARS = 12000;

export type EmailTranslation =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string };

export async function translateEmailToEnglish(subject: string, text: string): Promise<EmailTranslation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "Translation isn't set up (ANTHROPIC_API_KEY is missing in Netlify)." };
  if (!text.trim() && !subject.trim()) return { ok: false, error: "This email has no text to translate." };

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system:
        "You translate emails into natural, clear British English. Keep the meaning, tone and layout — " +
        "paragraphs, lists, line breaks — and leave names, addresses, numbers, links and amounts as they are. " +
        "Anything already in English stays as it is.",
      tools: [
        {
          name: "give_english",
          description: "The email in English.",
          input_schema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "The subject line in English." },
              body: { type: "string", description: "The email's text in English." },
              already_english: { type: "boolean", description: "True if the email was already all in English." },
            },
            required: ["subject", "body", "already_english"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "give_english" },
      messages: [
        {
          role: "user",
          content: `Translate this email into English.\n\nSubject: ${subject}\n\n${text.slice(0, MAX_INPUT_CHARS)}`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === "tool_use");
    const out = (block && block.type === "tool_use" ? block.input : null) as {
      subject?: unknown;
      body?: unknown;
      already_english?: unknown;
    } | null;
    if (out?.already_english === true) return { ok: false, error: "This email is already in English." };
    if (typeof out?.body !== "string" || !out.body.trim()) {
      return { ok: false, error: "The translation came back empty — try again." };
    }
    return { ok: true, subject: typeof out.subject === "string" ? out.subject : subject, body: out.body };
  } catch (err) {
    return { ok: false, error: `Translation failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}
