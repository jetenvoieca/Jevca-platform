import { NextRequest, NextResponse } from "next/server";
import { readStudioRequest, text } from "@/lib/studioRequest";
import { db } from "@/lib/db";
import { noteHopperAdded } from "@/lib/hopperAlerts";

// The Studio app's Instructions (2026-10-31): puts the text in the
// artist's Hopper as a note (see HopperNote). Authenticated by the
// artist's personal token.
const MAX_LENGTH = 5000;

export async function POST(request: NextRequest) {
  const req = await readStudioRequest(request);
  if ("response" in req) return req.response;
  const { artist, fields } = req;

  const note = text(fields.text);
  if (!note) return NextResponse.json({ error: "Type your instructions first." }, { status: 400 });
  if (note.length > MAX_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_LENGTH} characters.` }, { status: 400 });
  }

  await db.hopperNote.create({ data: { artistId: artist.id, text: note } });
  await noteHopperAdded(artist.id);
  return NextResponse.json({ ok: true });
}
