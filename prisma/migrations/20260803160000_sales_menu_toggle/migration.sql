-- AlterTable: Site gains the modular Sales-menu toggle, off by default
ALTER TABLE "Site" ADD COLUMN "salesEnabled" BOOLEAN NOT NULL DEFAULT false;
