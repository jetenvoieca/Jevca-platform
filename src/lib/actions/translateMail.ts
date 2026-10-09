"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { normalizeMailTemplate } from "@/lib/mailTemplateLayout";
import { cleanMailContent } from "@/lib/mailContent";
import {
  frenchGaps,
  tagsToRichText,
  type FrenchFill,
  type TranslationPiece,
} from "@/lib/mailTranslation";
import type { RichText } from "@/lib/richText";
import type { CampaignMailInput } from "@/lib/actions/campaigns";
import type { ClientKind } from "@/lib/clientKind";

// A campaign mail's "Translate now" (2026-10-08): translates the English
// of every part whose French is still empty (see lib/mailTranslation.ts)
// with Claude — a natural rewrite for a French reader in the artist's
// own voice (Settings → Personal Profile → Writing voice), the same
// approach as Louise's own site. Needs ANTHROPIC_API_KEY in Netlify's
// environment variables.

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 4000;

// What each kind of piece is, so the translation suits it.
const PIECE_NAMES: Record<string, string> = {
  subject: "the subject line",
  preview: "the preview text shown after the subject",
  header: "a heading",
  button: "a button's label",
  text: "a passage of text",
  cell: "a column of text",
};

// When an artist or brand has no Writing voice of their own yet.
const DEFAULT_VOICE: Record<ClientKind, string> = {
  ARTIST:
    "An artist writing to the people who follow their work: warm, personal and natural — never corporate or generic marketing-speak.",
  BRAND:
    "A brand writing to the people who follow it: warm, personal and natural — never corporate or generic marketing-speak.",
};

export async function translateMailToFrench(
  siteId: string,
  input: CampaignMailInput
): Promise<{ fill: FrenchFill } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "Translation isn't set up yet (ANTHROPIC_API_KEY is missing in Netlify)." };

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { artist: { select: { name: true, kind: true, writingVoice: true } } },
  });
  if (!site) return { error: "Site not found." };

  const layout = normalizeMailTemplate(input.layout);
  const pieces = frenchGaps({
    content: cleanMailContent(input.content, layout),
    subject: { en: String(input.subject?.en ?? ""), fr: String(input.subject?.fr ?? "") },
    preview: { en: String(input.preview?.en ?? ""), fr: String(input.preview?.fr ?? "") },
  });
  if (pieces.length === 0) return { error: "Everything with English already has French." };

  const voice = site.artist.writingVoice?.trim() || DEFAULT_VOICE[site.artist.kind];
  const system =
    `You translate ${site.artist.name}'s emails to their subscribers from English into French. ` +
    `Their voice: ${voice}\n\n` +
    "Write natural French for a French reader, in the same voice — not a literal, word-for-word " +
    "translation — keeping roughly the same length and tone. Leave names of people and places as they are. " +
    'Formatted text comes as one string per paragraph with simple tags: <b>, <i>, <br> and <a n="1">…</a>. ' +
    "Keep every tag around the matching French words, and keep each paragraph as its own string, in order.";

  // One request per piece, all at once: a mail's pieces are short, so
  // the whole mail comes back in about the time of its longest piece —
  // well inside the time a request to the site is allowed to take.
  const client = new Anthropic({ apiKey });
  const translate = async (piece: TranslationPiece): Promise<string | RichText | null> => {
    const rich = piece.kind === "rich";
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: [
        {
          name: "give_french",
          description: rich
            ? "The French, one tagged string per English paragraph, in order."
            : "The French translation.",
          input_schema: {
            type: "object",
            properties: {
              french: rich
                ? {
                    type: "array",
                    items: { type: "string" },
                    minItems: piece.paragraphs.length,
                    maxItems: piece.paragraphs.length,
                  }
                : { type: "string" },
            },
            required: ["french"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "give_french" },
      messages: [
        {
          role: "user",
          content: `Translate this part of an email (${PIECE_NAMES[piece.key.split(":")[0]] ?? "text"}) into French:\n\n${JSON.stringify(
            rich ? piece.paragraphs : piece.text
          )}`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === "tool_use");
    const french = block && block.type === "tool_use" ? (block.input as { french?: unknown }).french : null;
    if (piece.kind === "line") return typeof french === "string" && french.trim() ? french.trim() : null;
    return Array.isArray(french) ? tagsToRichText(french.map((v) => String(v ?? "")), piece.links) : null;
  };

  try {
    const results = await Promise.all(pieces.map(translate));
    const fill: FrenchFill = {};
    pieces.forEach((p, i) => {
      const value = results[i];
      if (value) fill[p.key] = value;
    });
    return Object.keys(fill).length > 0 ? { fill } : { error: "The translation came back empty — try again." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { error: `Translation failed: ${message}` };
  }
}
