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

Decision: parked for now, manual entry continues. If revisited, this needs its own short design
(OAuth setup, secure token storage, and — importantly — matching pulled transactions against
ones already entered manually so nothing double-counts) before any building, same as the
Pennylane work had a design doc first.
