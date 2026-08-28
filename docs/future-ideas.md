# Future ideas (not designed or scheduled yet)

Short notes on things raised but deliberately not built yet — kept here so they don't get lost,
without pretending they're designed or committed to.

## N26 / Open Banking connection for Business Expenses (raised 2026-08-28)

Idea: pull the platform's own business expenses directly from the N26 bank account, instead of
entering them by hand on /accounts/expenses.

Checked at the time: N26 has no genuine public developer API for this. Unofficial
reverse-engineered options exist (raw N26 login credentials, unsupported, last meaningfully
maintained ~2020) — not something to build a real business tool on. The proper route would be an
EU Open Banking (PSD2) aggregator that supports N26 as a connected institution — e.g. GoCardless
Bank Account Data (free tier), Tink, Salt Edge, or TrueLayer — via a proper OAuth-style consent
flow through N26's own login, re-approved periodically (PSD2 rule, typically ~90 days), rather
than a stored password.

**Update (2026-08-28, same day):** rather than build the live connection, added a CSV import
instead (see `importPlatformExpensesCsv` in `src/lib/actions/platformExpenses.ts`) — the person
exports/curates a simple CSV (date, supplier, category, description, amount, currency) from N26
themselves, removing anything that isn't a real business expense before importing. Covers the
actual need (less typing) without the OAuth/token/dedup complexity of a live connection.

The live N26/Open Banking connection remains parked. Worth revisiting only if manual CSV export
becomes a real recurring friction point, not by default — if revisited, still needs its own
short design (OAuth setup, secure token storage, and matching pulled transactions against
anything already entered so nothing double-counts) before any building.
