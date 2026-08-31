import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Switched from @prisma/adapter-pg (a plain TCP connection) to Neon's own
// serverless driver (2026-09-01). Diagnosed from real Netlify function
// logs after a reported 2-3 second delay selecting an artwork turned out
// to affect navigation generally: every request that had to open a
// brand-new database connection — either a fresh Netlify function
// container spinning up, or an existing one reconnecting after the
// database sat idle for a minute or more — paid a full TCP+TLS handshake
// before a single query could even start, measured at 2-5+ seconds in
// production. DATABASE_URL already points at Neon's pooled endpoint (see
// prisma.config.ts), so this isn't a pooling problem — it's the
// connection *setup* cost itself on every one of those short-lived
// serverless invocations, which is exactly what Neon's driver exists to
// avoid (WebSocket/HTTP transport instead of a fresh TCP handshake each
// time).
//
// `ws` is required explicitly (rather than relying on any global
// WebSocket) because this runs in a plain Node.js serverless function,
// not the Edge runtime — Neon's own setup instructions call for this
// explicitly. It's marked as a serverExternalPackage in next.config.mjs
// so its native optional dependencies (bufferutil/utf-8-validate) are
// required normally at runtime instead of being bundled by Next's
// build, which is a known source of "bufferUtil.mask is not a function"
// errors if skipped.
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});

// Reuse a single PrismaClient (and its underlying connection pool) across
// warm invocations, in every environment. Previously this was only cached
// outside production ("if NODE_ENV !== production"), which is the right
// call for a traditional long-running server (avoids duplicate clients
// during Next.js dev's hot-reload) but wrong here: on Netlify Functions, a
// warm container can serve more than one request, and without caching in
// production too, every one of those requests was constructing a brand
// new PrismaClient — and opening brand new database connections — instead
// of reusing the warm one. Confirmed as a real contributor to the
// page-switching and catalogue slowness reported 2026-08-08. Unchanged by
// the 2026-09-01 driver swap above — still exactly as important with the
// Neon adapter as it was with the old TCP one; this is what lets a warm
// container's *second* request onwards skip connection setup entirely
// rather than just making that setup faster.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

globalForPrisma.prisma = db;
