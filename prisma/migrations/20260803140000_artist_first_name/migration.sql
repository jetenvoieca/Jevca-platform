-- AlterTable: Artist gains a dedicated First Name field for personalised
-- greetings — kept separate from the free-text `name` field, which can't
-- be safely parsed for a greeting (titles, initials, studio names, etc.)
ALTER TABLE "Artist" ADD COLUMN "firstName" TEXT;
