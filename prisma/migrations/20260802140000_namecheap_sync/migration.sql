-- AlterTable: drop Renewal cost — Namecheap's API doesn't expose a
-- per-domain renewal price (it varies with promos/pricing tier at
-- purchase time), so this field was never going to stay accurate.
ALTER TABLE "Site" DROP COLUMN "domainRenewalCost";
