import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
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
// page-switching and catalogue slowness reported 2026-08-08.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

globalForPrisma.prisma = db;
