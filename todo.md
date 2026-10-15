# ByteVox — Build TODO

Operational checklist for the 5-hour build. Companion to `PRD.md` (what and why) and `TECHSTACK.md` (how).
Work top to bottom. Check boxes as you go. Keep the **Hours log** and **AI usage log** at the bottom updated as you work — the assignment requires both.

**Budget:** 0:40 foundation · 1:10 import · 1:30 compute/builder · 0:40 sharing · 0:25 tests · 0:35 docs/demo = **5:00**. Hard stop **5:30**.
**Rule:** when behind, cut from the bottom-up cut list — never cut correctness.

---

## Phase 0 — Kickoff (first 10 min, inside the foundation budget)

- [ ] Re-read `PRD.md` §4 and `TECHSTACK.md` §3–§5 to re-anchor decisions
- [ ] Start the timer; mark the 5:30 hard stop
- [ ] Open the Hours log and AI usage log below; log from the first commit (retro-logging loses the honest detail)

## Phase 1 — Foundation: schema + auth + shell (0:40)

- [ ] Scaffold Next.js app (TypeScript, App Router, Tailwind, `src/` layout)
- [ ] `git init`, first commit; `.gitignore`: `node_modules/`, `.next/`, `var/`, `.env`
- [ ] Install deps: `prisma @prisma/client csv-parse date-fns zod recharts`; dev: `vitest`
- [ ] `.env` + committed `.env.example` (`DATABASE_URL=file:./var/dev.db`, `UPLOAD_DIR=./var/uploads`, `MAX_UPLOAD_MB=10`); create `var/` dirs
- [ ] Prisma schema: `User`, `Session`, `Dataset`, `DatasetColumn`, `DatasetRow`, `RejectedRow`, `Report`, `Block`, `ShareLink`, `ReportRevision` + indexes + cascade deletes (see `TECHSTACK.md` §4)
- [ ] First migration; add `npm run setup` script (generate + migrate deploy) — idempotent
- [ ] Auth module: scrypt hash/verify (per-user salt, `timingSafeEqual`), `createSession` / `destroySession` / `getCurrentUser` (token SHA-256-hashed at rest)
- [ ] Signup / login / logout route handlers or server actions, all zod-validated; httpOnly SameSite=Lax cookie
- [ ] `/login` page (sign in / sign up), authed dashboard skeleton with nav + sign-out
- [ ] **Smoke test:** signup → dashboard → sign out → login → dashboard again

## Phase 2 — Trustworthy data: import + profile (1:10)

### Sample data (do this early; it drives everything downstream)

- [ ] Write `sample-data/messy.csv` (~2–3k rows) via a small committed generator script. Include on purpose:
  - [ ] blank cells scattered; `N/A`, `unknown`, `-` values
  - [ ] mixed date formats; at least one impossible date (`31/02/2024`); ambiguous `DD/MM vs MM/DD` values
  - [ ] numbers with thousands separators, currency symbols, `%`, leading/trailing spaces
  - [ ] 1–2 ragged rows (wrong field count); one unclosed-quote row
  - [ ] duplicate header names; one all-empty column; trailing commas
  - [ ] one cell containing `<script>alert(1)</script>` (XSS probe for the profile/table rendering)
  - [ ] long text value (>200 chars) in the notes column

### Importer module (bytes in → structured result or typed error)

- [ ] Size limit enforced on the stream (not just the header); 10 MB
- [ ] Decode: UTF-8 strict + BOM strip; UTF-16LE/BE when BOM present; else typed "badly encoded" error with guidance
- [ ] Content sniffs: `.xlsx` magic bytes `PK\x03\x04` → targeted message; empty file; header-only file allowed (0 data rows)
- [ ] Parse with `csv-parse`: multi-delimiter sniff (`,` `;` `\t` `|`), `trim`, strict quoting, `skip_records_with_error` collecting line numbers + reasons
- [ ] Header detection: first row if all cells non-empty + unique after de-dupe; else synth `column_1…` and record the fact; duplicate/empty headers renamed `name (2)` + noted
- [ ] Row accounting: rejected rows captured (row number, reason, raw snippet); blank-line count and ignored empty-column count recorded — nothing silently dropped
- [ ] Caps: 50,000 rows / 100 columns → explicit errors, never truncation
- [ ] Type inference module: number (separators/currency/`%` tolerance) / date (explicit format list, ISO first) / category (≤50 distinct AND <50% coverage) / text (incl. all-unique identifiers); 90% thresholds; ambiguity flags stored with the guess
- [ ] Persist in one transaction: `Dataset`, `DatasetColumn` (+ stats evidence), `DatasetRow`, `RejectedRow`; move raw file to `UPLOAD_DIR/<uuid>.csv` (never in a served path)

### UI

- [ ] Upload UI on dashboard: drag-drop + picker, progress, distinct clear messages for too-large / not-a-CSV / .xlsx / bad encoding / empty
- [ ] Profile page: rows read vs rejected; per-column type guess **with reasons**; missing + distinct counts; ambiguous dates flagged; first-rows preview; rejected-rows list (capped, with snippet)
- [ ] Dataset rename; delete with confirmation naming the affected reports (cut candidate #3)
- [ ] **Honesty check:** independently count the sample file's lines/rows (`wc -l`, quick script) and compare against the profile — numbers must match

## Phase 3 — Traceable numbers: compute engine + builder (1:30)

### Compute engine (pure module — every number in the product comes from here)

- [ ] Typed specs + zod schemas: `FilterSpec` (≤1 date range + ≤1 category), `BlockSpec` (metric / chart / table / note)
- [ ] Row pipeline: usable rows → minus filter-excluded → metric/table/chart evaluation
- [ ] Metric: sum / average / count / min / max; missing-value exclusion for sum/avg/min/max; `count` = included rows; empty result → no value + reason (never a crash, never `NaN` on screen)
- [ ] split-by-category with per-group counts; missing group key → visible "—" group
- [ ] Chart series: bar = category × aggregate; line = date bucketed by **day** × aggregate
- [ ] Table: top N (10/25/50) by column asc/desc; blanks sort last (stated in trace)
- [ ] Trace builder: plain-English description + exact spec that ran + accounting buckets; per group/series too
- [ ] `computeReport(rows, filter, blocks)` single entry point — the builder, owner view, and share view all consume its output verbatim
- [ ] Exhaustive `switch` on block kinds and filter kinds (adding a variant must fail the build until handled)

### Revisions (start early so history accrues while you develop)

- [ ] Diff saved report → human-readable summaries (block added/removed/reordered/edited, filter changed) with version bump on explicit Save

### Builder UI

- [ ] Create report from a dataset; title + description; owner list of reports on dashboard
- [ ] Block list with add / remove / reorder (up/down buttons — keyboard-friendly); block editors per type; block titles
- [ ] Filter bar: pick date column + range; pick category column + multi-select; clear button; applies to every block
- [ ] "How was this calculated?" `details/summary` panel on every metric / chart / table (and per group) showing description, spec, accounting
- [ ] Note block (plain text render only)
- [ ] Unsaved-changes indicator; Save disabled when clean
- [ ] States: fresh-report empty state ("add your first block"); zero-match results ("0 rows matched — here's why"); loading during compute; clear error when the dataset was deleted; 30-block cap message
- [ ] Keyboard pass: tab order, visible focus, panels openable without a mouse

## Phase 4 — Safe sharing: links + what changed (0:40)

- [ ] Share create: 32 random bytes, store SHA-256 hash only, return URL once; expiry required, default 7 days, max 90; zod-validated
- [ ] Token resolver with injectable `now`: hash → lookup → revoked/expired checks → report or not-found. Expired, revoked, wrong, partial, and missing tokens all produce the **same** not-found page
- [ ] `/s/[token]` viewer page: `force-dynamic` + `no-store`; renders via the same `computeReport`; trace panels included; read-only
- [ ] Share management UI: list links with computed status (active / expired / revoked), create, copy, revoke; re-share after revoke works
- [ ] What-changed panel on share page: revision entries with `createdAt` after the link's creation date; last-seen cookie badge (cut candidate #2)
- [ ] Leak audit (must pass before demo): viewer payload contains no dataset name/id, no profile, no rejected rows, no owner email, no other reports; grep the codebase to confirm **no raw-file endpoint exists at all**
- [ ] Owner flow check: confirm the builder preview, owner view, and share view show identical numbers (spot-check one metric in all three)

## Phase 5 — Tests (0:25)

- [ ] Vitest config; helper: temp SQLite per DB suite (`migrate deploy` on temp file, delete after)
- [ ] Fixtures: prose "not CSV", `.xlsx` magic bytes, invalid UTF-8 bytes, unclosed quote, ragged rows, header-only, empty file
- [ ] **Compute suite:** agg semantics (missing excluded), groupBy, filters, empty result, all-missing column, accounting invariants `included + excludedByFilter + excludedByMissing = usableRows` and `usable + rejected = fileRows`
- [ ] **Importer suite:** every bad fixture → expected typed error or rejections with reasons; no-total-loss assertion on `messy.csv` (imported + rejected + blankLines = physical lines)
- [ ] **Type inference suite:** threshold edges (89/90/91%), ambiguity flagging, currency/`%` tolerance, all-unique → text
- [ ] **Access suite:** user B cannot reach user A's report or dataset through the access layer; expired / revoked / random / partial token → not-found; valid token exposes only that report
- [ ] **Revisions suite:** add / remove / reorder / filter-change each produce the expected summaries
- [ ] `npm test` green from a clean checkout

## Phase 6 — README, demo, submission (0:35)

- [ ] README: what was built · run in a few commands · **"How my report builder works" (≤2 pages)** covering: type guessing + bad-row handling · file→screen consistency · share-link safety · what could still go wrong · what breaks first at 100× (reuse `TECHSTACK.md` §8)
- [ ] README: decisions and trade-offs · what was cut for time · hours spent (from the log) · how AI was used incl. **one real mistake and how you caught it** (from the log)
- [ ] Fresh-clone rehearsal: new temp dir → `npm install && npm run setup && npm run dev` → upload sample → build a tiny report; time it honestly
- [ ] Live-walkthrough drills (below) — one timed run each
- [ ] Demo video (3–4 min), rehearse once, then record: messy upload + profile readout → each block type → "How was this calculated?" on two numbers → share link in private window → revoke → stops working → bad file
- [ ] Final commit + tag; email careers@bytevox.ai: repo link (read access), video, optional live link
- [ ] Final honesty pass: remove any README claim that the demo doesn't actually show

---

## Manual adversarial pass (before recording — the reviewers will try this)

- [ ] Logged out: request `/reports/<id>`, `/datasets/<id>`, `/s/<random-token>` → all denied cleanly
- [ ] As user B: paste user A's report URL and dataset URL; call the underlying APIs directly → denied
- [ ] Revoke a live link → reload in the private window → gone instantly
- [ ] Create a 1-minute-expiry link, wait it out → same not-found page as a revoked link
- [ ] View-source the share page: no dataset id/filename, no owner email, no other report titles
- [ ] Upload the sample CSV containing the `<script>` cell → shown as literal text everywhere (profile, table block)
- [ ] Grep: no string-built SQL (Prisma only), no `dangerouslySetInnerHTML`

## Definition of done (submission gate)

- [ ] All 8 assignment musts work end to end; optional "What changed" works
- [ ] The three required tests (aggregation / bad file / expired-revoked-foreign) pass
- [ ] Every on-screen number has a working trace panel whose buckets reconcile
- [ ] Runs from a fresh clone in a few commands — verified, not assumed
- [ ] README + demo video complete; claims match reality

## Cut order (when behind — top of list goes first)

1. Polish and animations
2. "New since last visit" badge (keep the timeline)
3. Dataset rename / delete
4. Rejected-rows list capped without pagination (keep the list itself — it is a requirement)

## Live-walkthrough drills (the ask is likely one of these)

- [ ] Add a **median** metric: spec enum value + engine function + editor option + trace description — target ≤15 min
- [ ] Add a **numeric-range filter** kind: FilterSpec variant + predicate + editor row — target ≤15 min
- [ ] Practice explaining one trace end to end out loud, from file row count to final number

## Hours log

| Phase | Budget | Actual | Notes |
| --- | --- | --- | --- |
| 1 Foundation | 0:40 | | |
| 2 Import + profile | 1:10 | | |
| 3 Compute + builder | 1:30 | | |
| 4 Sharing + what changed | 0:40 | | |
| 5 Tests | 0:25 | | |
| 6 Docs + demo | 0:35 | | |
| **Total** | **5:00** | | |

## AI usage log (fill as you go; the assignment asks for one real AI mistake)

| # | What I used AI for | Outcome | Verified how |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |

> At the end, mark the row where AI was **wrong** (hallucinated API, wrong edge case, stale pattern, etc.) and write how you caught it — that becomes a README paragraph.
