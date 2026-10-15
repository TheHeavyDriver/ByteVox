# ByteVox — Roadmap

Mission: a report builder where every number shows its work and a share link shows exactly what it should and nothing more.
Companion docs: `PRD.md` (requirements) · `TECHSTACK.md` (stack & architecture) · `todo.md` (the build checklist).

**How to read this file:** `todo.md` is the working checklist for today's 5-hour build. This roadmap is the milestone-level view of the path to submission — and the honest plan for what comes after, including the scale story the reviewers will ask about.

---

## 1. Milestones to submission

| # | Milestone | Goal | Exit criteria | Budget | Refs |
| --- | --- | --- | --- | --- | --- |
| M0 | Docs | Requirements and design are decided and written down | PRD, TECHSTACK, todo, roadmap reviewed; decisions locked (see §6) | done | — |
| M1 | Foundation | A user can exist and get into an empty app | Signup → sign-out → login round-trip works; schema migrated; shell styled | 0:40 | PRD §4 "Auth" |
| M2 | Trustworthy data | A messy CSV lands honestly | Sample CSV imports; profile explains every guess, count, and rejected row; profile numbers independently verified | 1:10 | PRD §4 "CSV import policy", "Type inference" |
| M3 | Traceable numbers | Any number can explain itself | All 4 block kinds work; filters apply everywhere; every trace's buckets reconcile to file rows; identical values in preview and saved view | 1:30 | PRD §4 "Compute and trace contract" |
| M4 | Safe sharing | A link shows the report, nothing else, and dies on command | Private-window loop: create → view → revoke → gone; leak audit passes; What changed timeline renders | 0:40 | PRD §4 "Sharing and security" |
| M5 | Proof | The risky parts are tested | `npm test` green: aggregation, bad-file matrix, expired/revoked/foreign access, type inference, revisions | 0:25 | PRD §5 |
| M6 | Submission | A reviewer can run it and understand it | Fresh-clone rehearsal passes in a few commands; demo video recorded; README complete; email sent | 0:35 | PRD §8 checklist |

Total: 5:00. Hard stop: 5:30 — ship what exists, list the cuts.

## 2. Build timeline

```
0:00 ─ M1 Foundation ──── M2 Import + profile ──────────── M3 Compute + builder ────────────── M4 Share ── M5 Tests ─ M6 Docs/demo
       schema·auth         parser·inference·profile UI     engine·builder·trace panels            links      suites     video·README
       shell               (sample CSV written first)      (revisions start early)                what-changed
```

Sequencing rules that made this order (do not reorder casually):

1. **Sample CSV before the parser** — the mess defines the edge cases; building the parser first invites untested assumptions.
2. **Compute engine before the builder UI** — the UI renders its output; there is no second math path to reconcile later.
3. **Revisions at first save** — history accrues while you develop instead of being bolted on.
4. **Leak audit before the demo, not after** — it is a demo beat itself (open in private window, revoke, watch it die).

## 3. Submission gate

Ship only when all of these are true:

- Assignment requirements #1–#8 verified end to end, plus the optional What-changed view.
- Every displayed number has a trace panel whose accounting reconciles (`included + filter-excluded + missing-excluded = usable rows`, `usable + rejected = file rows`).
- Ownership enforced in the data layer — verified by trying user B on user A's URLs/APIs, not by reading the code.
- Fresh-clone run in a few commands, timed and rehearsed.
- README claims match demo video exactly; cuts are listed honestly.

## 4. Post-submission roadmap

### v1.1 — "Sharpen what exists" (if advanced / invited for walkthrough)

| Item | Why |
| --- | --- |
| Median metric | The likely live ask; already drilled, ships as one engine function + enum value |
| Numeric-range filter kind | Second likely live ask; one FilterSpec variant + predicate + editor row |
| Week/month bucketing on line charts | Currently day-only — the first real analytic limitation |
| Rejected-row pagination | Remove the capped-list cut |
| One more optional feature: suggested charts, PDF export, or comments | Pick based on how reviewers reacted; comments likely strongest for a reporting tool |
| Password reset + rate limiting on auth and upload | Close the two most obvious honest gaps first |

### v1.2 — "Make it a service" (weeks)

- OAuth sign-in + email verification; session management UI (see and revoke devices).
- Audit log: who viewed which share link, when (owners are trusting links with data).
- CI on GitHub Actions: tests + typecheck on every push; preview deploys.
- Structured logging + error tracking; configurable limits (size/rows/blocks per install).
- Background import queue with progress and retry — the first step toward scale.

### v2 — "100× data" (the scaling story, staged)

Current envelope: 10 MB / 50k rows / 100 columns / 30 blocks, computed in memory per request. At 100× (≈5M rows) the first failures are request memory/time, then the one-JSON-row-per-record storage shape, then pagination-less UI. Fix in this order, keeping trace semantics identical at every step:

1. **Push aggregation into SQL** — `GROUP BY` through Prisma's parameterized builder; the compute engine's spec becomes the query plan; traces must keep the same accounting buckets.
2. **Materialize result snapshots** per (report, version) so views (especially share links) are O(1) reads.
3. **Move imports to a background worker** with progress reporting; SQLite's single writer is the import bottleneck.
4. **Swap SQLite → Postgres** (schema is portable) or Turso/libSQL for hosted setups.
5. **Normalize/columnar storage** for hot columns; streaming compute for very wide reports.

### Parking lot (unscheduled ideas)

Templates and report duplication · scheduled refresh and threshold alerts · multi-user workspaces with per-member permissions · embeddable read-only widget · public API · dataset joins · formula/metric composer (derived columns).

## 5. Risks and watch items

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Time overrun past 5:30 | Medium | Cut order in `todo.md`; correctness is never cut; ship the honest remainder |
| Date parsing ambiguity (`03/04/2024`) misleads users | Certain (sample data includes it) | Profile flags ambiguity and states the chosen interpretation; tests assert the flag |
| scrypt slows test suites | Medium | Fixed cost params in tests; hash only where needed; cache nothing in prod |
| SQLite writer contention | Low (single-reviewer use) | Documented limitation; v2 path exists |
| Share page served stale by caches | Low if forgotten, high impact | `force-dynamic` + `no-store` set at page level; revocation check runs per request by design |
| Framework version churn (Next.js/Prisma majors) | Medium | Pin versions; lockfile committed; upgrade deliberately, never mid-build |
| Demo flakiness (network, accidental data) | Medium | Rehearse from a fresh clone; small sample dataset; no external services in the demo path |
| Over-claiming in README/demo | Chronic | Final honesty pass item in `todo.md`; claims map 1:1 to demo beats |

## 6. Decision log

Locked decisions (changing any of these requires a README note, because the difference will show):

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Next.js full-stack + SQLite + Prisma | Few-commands run time; one process; typed end to end |
| D2 | Optional feature = What changed view | Reinforces the traceability theme; demo-friendly |
| D3 | Explicit Save (no autosave) | Revision history stays meaningful and explainable |
| D4 | All numbers computed server-side in one pure engine | The assignment's consistency requirement, structurally |
| D5 | Authorization baked into the data layer; share path is token-only | "Enforced where the data is read" — a property, not a checklist |
| D6 | No raw-file endpoint exists at all | Strongest possible answer to "viewer must not reach the raw file" |
| D7 | 90% threshold type inference; category = ≤50 distinct AND <50% coverage | Explainable, tunable constants; evidence stored per column |
| D8 | Caps: 10 MB / 50k rows / 100 cols / 30 blocks; share expiry default 7d max 90d | Generous for the assignment's scale; explicit errors, never truncation |
| D9 | Day-only date bucketing on line charts | Scope control; week/month is v1.1 |
| D10 | Line charts/tables/spreadsheets render CSV text as plain text everywhere | XSS posture: React escaping only, no innerHTML anywhere |
