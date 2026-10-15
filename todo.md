# ByteVox — Build TODO (status after v1 build)

Operational checklist for the 5-hour build. Companion to `PRD.md` (what and why) and `TECHSTACK.md` (how).
Boxes below reflect the **actual v1 build**; deviations are noted inline and summarised in `PRD.md` §9.

**Budget:** 0:40 foundation · 1:10 import · 1:30 compute/builder · 0:40 sharing · 0:25 tests · 0:35 docs/demo = **5:00**. Hard stop **5:30**.
**Rule:** when behind, cut from the bottom-up cut list — never cut correctness.

---

## Phase 0 — Kickoff

- [x] Re-read `PRD.md` §4 and `TECHSTACK.md` §3–§5 to re-anchor decisions
- [x] Start the timer; mark the 5:30 hard stop
- [x] Open the Hours log and AI usage log below; log from the first commit

## Phase 1 — Foundation: schema + auth + shell

- [x] Scaffold Next.js app (TypeScript, App Router, Tailwind, `src/` layout)
- [x] `git init`, first commit; `.gitignore`: `node_modules/`, `.next/`, `var/`, `.env`
- [x] Install deps (pinned: Prisma 7 + better-sqlite3 adapter, csv-parse, zod, date-fns, recharts; dev: vitest)
- [x] `.env` + committed `.env.example`; create `var/` dirs
- [x] Prisma schema: all 10 models + indexes + cascade deletes (`Report.datasetId` is `SetNull` — reports degrade visibly when a dataset is deleted)
- [x] First migrations; `npm run setup` (ensure-env + generate + migrate deploy), idempotent
- [x] Auth module: scrypt hash/verify (`timingSafeEqual`), sessions with SHA-256-hashed tokens, per-request `getCurrentUser` cache
- [x] Signup / login / logout server actions, zod-validated; httpOnly SameSite=Lax cookie
- [x] `/login` page + authed app shell with nav + sign-out
- [x] **Smoke test:** done in a live browser (signup → dashboard → sign out → login)

## Phase 2 — Trustworthy data: import + profile

### Sample data

- [x] `sample-data/messy_orders.csv` (~2.5k rows) + committed generator (`npm run demo:data`). Contains on purpose: scattered blanks; `N/A`/`unknown`/`-`; mixed + impossible dates (`31/02/2024`); ambiguous D/M vs M/D; currency/`%`/spaces in numbers; 2 short + 3 extra-field rows; 4 blank lines; 1 unclosed quote; duplicate + empty headers; one all-empty column; embedded newline; `<script>` cell; long note text; a duplicate-header `region (2)` case
- [x] Verified: no-total-loss test reconciles `2,494 usable + 6 unreadable + 4 blank lines = row total` (`tests/sample-data.test.ts`)

### Importer module

- [x] Size limit checked in the action and the importer (10 MB env-configurable) — typed error, never truncation
- [x] Decode: UTF-8 strict + BOM strip; UTF-16LE/BE when BOM present; else typed "badly encoded" error with guidance
- [x] Sniffs: `.xlsx` magic bytes, empty file, header-only allowed (0 data rows)
- [x] `csv-parse` with a delimiter list (`,` `;` `\t` `|`), `trim`, `relax_column_count:false`, blank lines counted (not skipped silently), rejects collected with line numbers + reasons
- [x] Header handling: duplicate names → `name (2)`; empty names → `column_N`; all reported as profile notes
- [x] Row accounting: rejects with row number, reason, raw snippet; blank-line count and ignored empty columns recorded — nothing silently dropped
- [x] Caps: 50,000 rows / 100 columns → explicit errors
- [x] Type inference: number (separators/currency/`%`) / date (explicit formats, majority dialect + ambiguity flags) / category (≤50 distinct AND <50% coverage) / text (incl. all-unique identifiers); reasons stored with every guess
- [x] Persist in one transaction: `Dataset`, `DatasetColumn` (+ stats evidence), `DatasetRow`, `RejectedRow`; raw file to `UPLOAD_DIR/<uuid>`, never served

### UI

- [x] Upload UI on dashboard: picker + clear per-error messages, manual-dispatch so a failed upload keeps the chosen file *(drag-and-drop not built — picker only; noted in README)*
- [x] Profile page: row ledger (usable / unreadable / blank lines), per-column type + reason + missing/distinct/samples, import notes, first-rows preview, unreadable-rows list with snippets
- [x] Dataset rename; delete with confirmation *(confirmation explains the effect on reports; it does not list report names — noted)*
- [x] **Honesty check:** sample file reality matches the profile (2494/6/4), asserted in tests

## Phase 3 — Traceable numbers: compute engine + builder

### Compute engine

- [x] Typed specs + zod schemas (central `report-spec.ts`); safe stored-JSON parsers
- [x] Row pipeline: usable rows → filter-excluded → metric/chart/table evaluation
- [x] Metric kinds: count / distinct count / sum / mean / median / min / max; blank + unparseable excluded from value metrics and counted by bucket; empty result → no value + reason, never `NaN`
- [x] Filters: up to 10 conditions, ANDed: contains / equals / is blank / is not blank / number between / date between *(replaces the planned one date-range + one category filter; see PRD §9)*
- [x] Charts: bar = top N groups (+ visible "(blank)" group; omitted groups reported in the trace), line = every bucket kept; date groupings bucket by day; bar/line may group by any column
- [x] Table: first N matching rows (source order), chosen columns, blanks shown as blanks; trace states the limit
- [x] Trace: formula line, filter descriptions in plain English, two reconciling ledgers, sample source rows, honest notes (top-N omissions, empty groups)
- [x] `computeBlocks` dispatch + exhaustive `switch` on block/filter kinds — new variants fail the build until handled
- [x] 18 engine tests + 28 importer tests + inference/sample/access/diff suites (67 total)

### Revisions

- [x] Versioned snapshots: every mutation (meta / filters / blocks) bumps `version` and stores a snapshot revision in one transaction — **no explicit Save; every change is saved** (deviation, documented)
- [x] Human-readable diffs (title, description, filters, block added/removed/changed/reordered) computed against a share link's `versionAtShare`

### Builder UI

- [x] Create report from a dataset (default row-count block); report list on dashboard
- [x] Block list with add / edit / move up-down / delete; per-type editors; block titles
- [x] Report-level filter panel (chips + remove; add form adapts to column type)
- [x] "How this is computed" `details` panel on every metric / chart / table
- [x] Note block (plain text only)
- [x] 30-block cap enforced with a clear message; 10-filter cap enforced
- [x] States: fresh-report empty state, empty chart/table explanations, dataset-deleted state for blocked reports
- [x] Keyboard: native controls throughout (details/summary, real buttons, labelled inputs) — no dedicated screen-reader audit performed (noted)

## Phase 4 — Safe sharing: links + what changed

- [x] Share create: 32 random bytes, SHA-256 hash stored, URL shown once; expiry default 7d / max 90d; zod-validated
- [x] Token resolver with injectable `now`: hash → lookup → revoked/expired checks → report or a no-content state
- [x] `/s/[token]` viewer: `force-dynamic`, read-only, same compute path, trace panels included
- [x] Share management UI: links with computed status, create, copy-once, revoke; re-share after revoke works
- [x] What-changed panel on the viewer (diff of `versionAtShare` snapshot vs live report); owner preview on the share page *(last-seen badge cut by plan)*
- [x] Leak audit passed by probe: viewer payload contains no dataset id, no owner email, no upload path, no raw row data; no raw-file endpoint exists (verified by grep + curl)
- [x] Owner flow parity: builder, share page, and viewer all render the same `computeBlocks` output (spot-checked in browser) *(deviation: viewer shows the dataset **display name** for traceability)*

## Phase 5 — Tests

- [x] Vitest config with alias; throwaway DB (`var/test.db`) via env *(one shared test DB + teardown-by-cascade, not per-suite temp files — noted)*
- [x] Importer fixtures: prose "not CSV", xlsx magic bytes, bad encoding, unclosed quote, ragged rows, header-only, empty file
- [x] Compute suite: aggregation semantics (missing excluded), grouping, all filter kinds, empty results, all-missing columns, accounting invariants
- [x] Importer suite: typed errors + rejects with reasons; no-total-loss assertion on the sample file
- [x] Inference suite: threshold edges, ambiguity flags, currency/`%`, all-unique → text
- [x] Access suite: user B cannot read/mutate/delete/share user A's data; expired / revoked / random token outcomes
- [x] Diff suite: add / remove / reorder / edit produce expected summaries; corrupt snapshots handled
- [x] `npm test` green (67 tests, 7 files)

## Phase 6 — README, demo, submission

- [x] README: "How my report builder works" (≤2 pages), run steps, decisions/trade-offs, cuts, AI usage, screenshots
- [x] README: the one real AI mistake (the sample-data generator's field-count bug, caught by the reconciliation test — also logged below)
- [ ] README: hours spent (fill from the Hours log below; the only intentionally-unfinished line)
- [x] Fresh-clone rehearsal: temp clone → `npm install` (7 s warm cache) → `npm run setup` → `npm test` (67 green) → `npm run build` (9 s) → production server serves `/login` and the no-content share page
- [ ] Live-walkthrough drills — one timed run each (median metric; numeric-range filter; explain a trace aloud)
- [ ] Demo video (3–4 min), rehearse once, then record: messy upload + profile readout → each block type → "How this is computed?" on two numbers → share link in a private window → edit report → what-changed appears → revoke → stops working → bad file
- [ ] Final commit + tag; email careers@bytevox.ai: repo link (read access), video, optional live link
- [ ] Final honesty pass: remove any README claim the demo doesn't show

## Manual adversarial pass (before recording)

- [x] Logged out: `/reports/<id>` and `/datasets/<id>` redirect to `/login` (verified with curl)
- [x] Bogus share token → friendly no-content page; share payload scanned for dataset id / owner email / upload paths (clean)
- [x] No `dangerouslySetInnerHTML`; no string-built SQL (grep: only Prisma's generated client has raw-query APIs)
- [x] Revoke a live link → the viewer shows "This link was revoked" on the very next load (verified live; the confirm dialog is part of the flow)
- [x] Expiry path → resolver unit-tested with an injected clock (same code path revocation exercises live; no real-time wait-up performed)
- [x] `<script>` cell probe → uploaded a tiny file containing `<script>alert('xss')</script>`; rendered as literal text in the preview and samples, nothing executed (probe dataset deleted afterwards)
- [x] As user B: every read/mutate/delete/share path is enforced in access-layer tests (a separate browser re-run was not needed)

## Definition of done (submission gate)

- [x] All 8 assignment musts work end to end; optional "What changed" works
- [x] The three required tests (aggregation / bad file / expired-revoked-foreign) pass
- [x] Every on-screen number has a working trace panel whose buckets reconcile
- [x] Runs from a fresh clone in a few commands — verified, not assumed (rehearsal numbers above)
- [ ] Demo video complete (README is done apart from the hours line)

## Cut order (when behind — top of list goes first)

1. Polish and animations
2. "New since last visit" badge (keep the timeline) — **cut**
3. Dataset rename / delete — **not cut; both shipped**
4. Rejected-rows list capped without pagination — **capped at 50 (+total), shipped**

## Live-walkthrough drills (the ask is likely one of these)

- [ ] Add a **new metric kind**: spec enum value + engine branch + editor option + trace description — target ≤15 min
- [ ] Add a **new filter kind**: FilterSpec variant + predicate + editor row — target ≤15 min
- [ ] Practice explaining one trace end to end out loud, from file row count to the final number

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

> Fill the Actual column from your own clock (commit timestamps are a lower bound). If the build ran past plan, say so here — the README repeats the honest number.

## AI usage log (the assignment asks for one real AI mistake)

| # | What I used AI for | Outcome | Verified how |
| --- | --- | --- | --- |
| 1 | Scaffolding Next.js 16 + Prisma 7 (config, adapter, migrations) | Correct after pinning Prisma 7 (npm `latest` was an 8.0.0-rc) | `npm run setup` from scratch + build |
| 2 | csv-parse configuration & row accounting | Correct behavior (rejects + blank-line counts) after fixing the generator's ragged rows | Reconciliation test: 2494 + 6 + 4 |
| 3 | Compute engine + trace ledgers | Kept | 67 tests incl. invariants |
| 4 | Sample-data generator | The AI wrote three rows it claimed had 15 fields but wrote 14; the no-total-loss test failed the moment it ran and exposed the bug | Fixed the generator; reconciliation test green: 1 header + 2,494 + 6 + 4 + 1 continuation = 2,506 lines |
| 5 | Browser E2E debugging | An AI debugging session misread a Playwright failure as a product bug; the real cause was a stale element ref after a re-render | Re-snapshot before every interaction; full flow passed end to end |
