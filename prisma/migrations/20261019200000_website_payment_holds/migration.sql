-- A website buyer's hold on a work while they pay.
ALTER TABLE "Purchase" ADD COLUMN "holdUntil" TIMESTAMP(3);
CREATE INDEX "Purchase_holdUntil_idx" ON "Purchase"("holdUntil");
