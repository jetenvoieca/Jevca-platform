import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations specifically need a direct (non-pooled) connection —
    // Prisma Migrate's advisory-lock mechanism doesn't work reliably
    // through PgBouncer/transaction pooling, which is what DATABASE_URL
    // points at (see the -pooler hostname). This is only used by the
    // Prisma CLI (generate/migrate); the running app's actual queries
    // go through src/lib/db.ts's own adapter, which still explicitly
    // uses the pooled DATABASE_URL — untouched by this change
    // (2026-08-15, after repeated P1002 advisory-lock timeouts on
    // deploy).
    url: env("DIRECT_DATABASE_URL"),
  },
});
