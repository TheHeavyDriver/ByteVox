# ByteVox Report Builder — Product Requirements Document

**Working title:** ByteVox Report Builder (rename freely)
**Source:** Derived from `assignment.md` — Full Stack Intern build assignment
**Companion doc:** `TECHSTACK.md` (stack choices, architecture, data model)
**Budget:** 4–5 hours of build time, hard stop at 5.5 hours. Cut scope before quality.

---

## 1. Problem Statement

People who work with spreadsheets run into the same three failures:

1. **Numbers lose their provenance.** Once a total is pasted into a deck, a doc, or a dashboard, nobody can say which rows, which filters, and which exclusions produced it. "Where did this 4,710 come from?" is unanswerable.
2. **Messy CSVs get silently mangled.** Real exports contain blanks, mixed date formats, odd values, and rows that fail to parse. Most tools quietly drop those rows, so the report looks clean while the data underneath is not.
3. **Sharing a report usually leaks more than intended.** Sending the spreadsheet shares everything; a naive dashboard link often exposes other reports, raw files, or other people's data.

The user needs: upload a CSV → build a short report from it → share a read-only link where **every number can show exactly how it was calculated**, and the viewer can see the report and nothing else.

For this particular build, the app is also a hiring artifact. Correctness, server-enforced ownership, honest handling of messy input, and a clear written explanation are the primary evaluation criteria — a small app that is correct and honest beats a big one that is broken.

## 2. Solution

A single web app (the **report builder**) with two kinds of users:

- **Report author (owner):** signs in, uploads a CSV. The server parses it, profiles every column (guessed type + why, missing counts), and lists every row that could not be read together with its reason. The author then builds a report as a list of blocks — metrics, charts, tables, and text notes — with a report-level filter that applies to every block. Every computed number carries a "How was this calculated?" panel. The author shares the report with an expiring, revocable read-only link.
- **Share-link viewer:** opens the link with no account. They see exactly the report as built, each number with the same "How was this calculated?" panel, plus a "What changed" timeline showing edits made since the link was created. They cannot reach the raw file, other reports, the data profile, or anyone else's data.

All numbers are computed on the server in a single code path, so the same number appears everywhere it is shown — builder, owner view, and share view.

**Optional feature selected (assignment allows at most one):** the "What changed" view when a shared report is edited.

## 3. User Stories

### Accounts

1. As a visitor, I want to sign up with an email and password, so that my datasets and reports belong to my own account.
2. As a returning user, I want to sign in, so that I can get back to my work.
3. As a user, I want my session to survive page refreshes for about a week, so that I am not re-logging in constantly.
4. As a user, I want to sign out and have the session actually destroyed on the server, so that shared machines are safe.
5. As a visitor, I want clear validation errors for a bad email, a short password, or an already-registered email, so that I can fix the problem myself.
6. As a user, I want it to be impossible — even by manually requesting URLs or APIs — to see another user's datasets, reports, or profile, because ownership must be enforced where the data is read, not only in the screens.

### CSV upload and profiling

7. As a report author, I want to upload a CSV by file picker or drag-and-drop, so that getting data in is frictionless.
8. As a report author, I want a clear message when my file is too large (over 10 MB), so that I know the limit and what to do.
9. As a report author, I want a clear message when my file is not a CSV (no consistent delimiter, binary content), so that I am not left guessing.
10. As a report author, I want a clear message when my file looks like an Excel workbook (`.xlsx` magic bytes), telling me to export it as CSV.
11. As a report author, I want a clear message when my file is badly encoded and cannot be decoded as UTF-8 or UTF-16-with-BOM, so that I can re-export it correctly.
12. As a report author, I want the upload to parse on the server (never in the browser), so that results are consistent and trustworthy.
13. As a report author, I want to see the file's row count after upload, so that I can sanity-check what was read.
14. As a report author, I want to see missing values per column, so that I know where the gaps are.
15. As a report author, I want each column's guessed type (number, date, category, or text) shown with the reasoning behind the guess, so that I can trust or question it.
16. As a report author, I want ambiguous dates (e.g. `03/04/2024` which could be two dates) flagged explicitly in the profile, so that I am not misled.
17. As a report author, I want a list of every row that could not be read with its row number, the reason, and a raw snippet, so that nothing is silently dropped.
18. As a report author, I want blank lines and ignored all-empty columns reported as counts in the profile, so that "nothing dropped" is visible, not just claimed.
19. As a report author, I want duplicate or empty header names renamed deterministically (e.g. `region (2)`, `column_5`) and noted, so that the profile explains what changed and why.
20. As a report author, I want a preview of the first rows of the file, so that I can eyeball the parse result.
21. As a report author, I want to rename a dataset, so that files named `export_(3).csv` become recognizable.
22. As a report author, I want to delete a dataset (with a confirmation that names what will be affected), so that I can clean up; deletion removes its rows from storage and disables reports built on it with a clear message.
23. As a report author, I want uploaded data to be immutable, so that historical reports and revisions stay honest.

### Building a report

24. As a report author, I want to create a report on top of a dataset, so that I have a canvas for analysis.
25. As a report author, I want to add a **metric** block (sum, average, count, min, or max of a column), so that I can surface the key numbers.
26. As a report author, I want an optional split-by-category on a metric, so that I can see the same metric per group, each group with its own trace.
27. As a report author, I want to add a **bar** or **line** chart, so that I can visualize a category or a date series.
28. As a report author, I want to add a **table** block listing the top N rows by a column (ascending or descending), so that I can show the underlying detail.
29. As a report author, I want to add a **text note** block, so that I can add commentary; note text is rendered as plain text only.
30. As a report author, I want to reorder blocks, so that the story reads in the right order.
31. As a report author, I want to remove blocks, so that drafts can be trimmed.
32. As a report author, I want to title the report and each block, so that the report is presentable without extra notes.
33. As a report author, I want a report-level **date-range filter** on one date column, so that one change narrows every block at once.
34. As a report author, I want a report-level **category filter** (multi-select of values), so that I can scope the whole report to a subset.
35. As a report author, I want to clear filters easily, so that experimentation is cheap.
36. As a report author, I want every block to recompute on the server when I change blocks or filters, so that what I preview is exactly what gets stored and shared.
37. As a report author, I want an explicit Save with a visible unsaved-changes indicator, so that "what changed" history reflects deliberate saves.
38. As a report author, I want friendly empty states ("add your first block"), so that a fresh report is not a puzzle.
39. As a report author, I want a clear error state when a report's dataset was deleted, instead of broken numbers.
40. As a report author, I want a clear message if I exceed limits (e.g. 30 blocks per report), so that I know the boundary.

### Show its work

41. As any user looking at a number, I want a "How was this calculated?" control on every metric, chart, and table, so that the number is traceable.
42. As any user, I want the panel to open with a plain-English description of the calculation ("Sum of Amount where OrderDate is between Jan 1 and Mar 31, 2024, split by Region"), so that a non-technical reader follows it.
43. As any user, I want the panel to show the exact operation that ran (aggregation, column(s), filter values, grouping) in a machine-readable form, so that the claim is checkable, not hand-wavy.
44. As any user, I want the panel to show how many rows were included and excluded, with the reason for each exclusion bucket (filtered out, missing value in the target column, rejected at import), so that the accounting adds up.
45. As any user, I want the exclusion buckets plus included rows to reconcile exactly with the file's total rows, so that I can audit the trail end to end.
46. As any user, I want the same number to appear identically in the builder preview, the owner's view, and the share view, because all three render the output of the same server-side computation.
47. As a keyboard user, I want the trace panel to open and close without a mouse, so that traceability is not mouse-only.
48. As any user looking at a split metric or a chart, I want the trace per group or series (each with row counts), so that a bar's height is as explainable as a standalone number.

### Sharing

49. As a report author, I want to create a read-only share link with an expiry date (default 7 days, maximum 90), so that access is time-boxed by default.
50. As a report author, I want to copy the link with one click, so that sharing is easy.
51. As a report author, I want to revoke a link instantly, so that access stops immediately on the next request — no caches, no grace period.
52. As a report author, I want to see the status of all links for a report (active, expired, revoked, created date, expiry date), so that I stay in control.
53. As a report author, I want to create a new link after revoking one, so that revocation is not a dead end.
54. As a viewer, I want to open a share link without an account, so that sharing does not require onboarding the recipient.
55. As a viewer, I want to see exactly the report as the owner built it — same blocks, same numbers, same "How was this calculated?" panels — and nothing else: no raw file, no other reports, no profile, no owner PII, no controls.
56. As a viewer, I want a friendly, clear page when a link is expired or revoked, without any hint about what used to be there.
57. As a security-conscious author, I want share tokens to be long and random, so that links cannot be guessed or enumerated; a wrong or partial token looks exactly like an expired one.
58. As a viewer on a phone, I want the share page to work well at phone width, so that links are usable anywhere.

### What changed (optional feature)

59. As a report author, I want each save of a report to record a human-readable change summary ("Added metric 'Total revenue'", "Removed chart 'Revenue by month'", "Reordered blocks", "Changed filter: date range Jan 1 – Mar 31 (was: none)"), so that the history explains itself.
60. As a viewer, I want a "What changed" timeline listing edits made since my link was created, so that I know the report moved under me.
61. As a viewer, I want a "new since your last visit" badge using a local cookie, so that I can spot fresh changes without an account.
62. As a viewer, I want the change entries to be human-readable titles only (never internal IDs, column statistics, or raw data), so that the timeline leaks nothing.

### Robustness, UX, and operations

63. As a user on a phone, I want every page usable from 360px width upward, so that the app is not desktop-only.
64. As a keyboard user, I want to operate the whole app — including block reordering via up/down buttons — with Tab/Enter/Space only, with visible focus and labelled controls.
65. As a user, I want clear loading states (uploading, parsing, computing) instead of frozen screens.
66. As a user, I want all inputs validated on the server (not just the screen), so that crafted requests fail safely.
67. As a user, I want any text that came from the CSV shown as plain text, never interpreted as markup or code.
68. As an operator (the person running the app locally), I want to run it in a few commands (`npm install`, `npm run setup`, `npm run dev`), so that reviewing takes minutes.
69. As an operator, I want an intentionally messy sample CSV shipped in the repo, so that I can reproduce the demo instantly.
70. As a maintainer, I want automated tests for the aggregation logic, at least one bad-file case, and expired/revoked/foreign access, runnable with one command.

## 4. Implementation Decisions

### Stack

Full details and rationale in `TECHSTACK.md`. Summary: Next.js (App Router, TypeScript, Node runtime) as a single full-stack app; Prisma + SQLite; Tailwind CSS; `csv-parse` for parsing; Recharts for charts; Vitest for tests; npm for scripts.

### Modules (deep modules with small interfaces)

1. **CSV importer** — takes raw bytes, a filename, and limits; decodes (UTF-8 / UTF-16 with BOM), sniffs the delimiter, parses row by row, and returns parsed rows, per-column statistics, rejected rows with reasons, and a profile. All encoding/sniffing/quoting edge cases live here, behind one call.
2. **Type inference** — takes a column's values; returns the guessed type, a confidence signal, and human-readable reasons (including date ambiguity flags). Pure and independently testable.
3. **Compute engine** — takes rows, a report filter, and a block spec; returns the value(s) plus a trace object: plain-English description, exact operation, and full row accounting. This is the single source of every number in the product (builder preview, owner view, share view). Pure and heavily tested.
4. **Access layer** — every read/write function takes the current user id (or, for share pages, a share token) as an argument. There is no unscoped "get report by id" exposed to pages or handlers; ownership is baked into the module, so authorization cannot be forgotten at a call site.
5. **Auth** — signup/login/logout, password hashing (scrypt, built-in Node crypto), DB-backed sessions with hashed tokens, and the current-user resolver.
6. **Revisions** — diffs a saved report against its previous version into human-readable change summaries for the "What changed" view.
7. **UI pages** — dashboard (datasets + reports), dataset profile, report builder, share-link management, and the public share viewer. Pages are thin: they call the modules above and render.

### Data model (summary)

`User`, `Session`, `Dataset` (owner, filename, byte size, row count, rejected count), `DatasetColumn` (type guess + stats + reasons), `DatasetRow` (row number + values as JSON), `RejectedRow` (row number, reason, raw snippet), `Report` (owner, dataset, title, filter, version), `Block` (type, position, spec), `ShareLink` (report, token hash, created/expires/revoked timestamps), `ReportRevision` (version, timestamp, change summary). Full schema in `TECHSTACK.md`.

### CSV import policy (nothing silently dropped)

- **Encoding:** UTF-8 with or without BOM (BOM stripped); UTF-16LE/BE accepted when a BOM is present; anything else is rejected with a clear, actionable message.
- **Limits:** 10 MB per file, 50,000 data rows, 100 columns. Exceeding any limit is an explicit error, not a truncation.
- **File-shape errors:** empty file, header-only file (allowed: profile with 0 data rows), no consistent delimiter (not a CSV), `PK\x03\x04` magic bytes ("this is probably an .xlsx; export as CSV").
- **Row-level failures:** rows with a wrong field count, unclosed quotes, or other parse errors are recorded in `RejectedRow` with row number, reason, and a raw snippet — and shown in the profile, paginated.
- **Visible-but-benign adjustments:** blank lines skipped, all-empty columns ignored, duplicate/empty headers renamed — each reported as a count in the profile.
- **Header detection:** the first row is treated as the header when all its cells are non-empty and unique after de-duplication; otherwise headers are synthesized (`column_1` …) and the profile says so.

### Type inference rules

For each column, over all non-missing values:

- ≥ 90% parse as numbers → **number** (thousands separators, leading sign, a single leading currency symbol, and trailing `%` are tolerated and noted).
- Else ≥ 90% parse as dates against an explicit format list (ISO 8601 first, then common day-first and month-first formats) → **date**. If both day-first and month-first readings are valid for some values, the profile **flags the ambiguity** and states which interpretation was chosen.
- Else, ≤ 50 distinct non-missing values and those distinct values cover less than 50% of the rows → **category**.
- Everything else (including identifier-like columns where every value is unique) → **text**.
- The profile shows the supporting counts (how many values passed/failed each test), so the guess is explainable and the thresholds are visible, tunable constants.

### Compute and trace contract

- One pure function computes every block: given (rows, report filter, block spec) it returns results plus a trace: `{ description, specRun, accounting }`.
- **Accounting buckets:** `fileRows → rejectedAtImport + usableRows`, then `usableRows → excludedByFilter + excludedByMissingValue + includedRows`. Groups (for split metrics and chart series) carry their own counts. Rows with a missing group key form a visible "—" group.
- **Trace panel content:** (1) plain-English sentence, (2) the exact operation that ran (aggregation, column, filter, grouping, ordering, limit), (3) the row accounting above.
- **Filters:** a report carries up to 10 conditions, ANDed, applied to every block: contains, equals, is blank, is not blank, number between, date between. Text matching for equals/contains is case-insensitive on trimmed values; distinct counts and chart grouping use the raw (trimmed) values — the difference is stated in the README rather than hidden.
- **Charts:** bar = top groups by aggregated value (top N shown, the remainder reported in the trace, never silently dropped); line = a series over the group values with every bucket kept. Date groupings bucket by day. Chart data is computed server-side; the client only draws pixels.
- **Tables:** the first N matching rows (default 10, up to 100) showing chosen columns, in source row order — the trace names the order and how many rows the limit omitted.
- **Metrics:** count, distinct count, sum, mean, median, min, max. Count counts included rows; value metrics exclude blank and unparseable cells, and the trace splits both buckets by name.
- No client-side arithmetic for any displayed number.

### Sharing and security

- Share token: 32 random bytes (base64url). Only the SHA-256 hash is stored, so a database leak does not leak working links.
- Expiry is required at creation (default 7 days, max 90) and enforced on every request; revocation is a timestamp that takes effect on the next request (share pages are `force-dynamic`, never cached).
- The share path resolves "report by token", never "report by id": the viewer's data is loaded through a function whose only input is the token. Unknown, expired, and revoked tokens get friendly, distinctly worded pages — none expose any report content, and none reveal whether any report exists.
- The share view exposes only: report title and description, the dataset's display name, block titles/content, computed values, trace panels (including a handful of sample source rows by design), and the "what changed" diff against the link's share version. No dataset id, filename, or path, no profile, no rejected rows, no owner identity, no link controls.
- **No raw-file endpoint exists at all.** Uploaded bytes live outside any statically served directory and are never returned over HTTP; only parsed rows are read.
- All mutations validate input server-side (zod) before touching the database; no SQL strings are ever built from user input (Prisma only).
- CSV text is rendered as plain text everywhere; nothing from a file is interpreted as markup.

### Auth

- Email + password with scrypt hashing (per-user salt, constant-time comparison).
- Sessions: random token, SHA-256-hashed at rest, delivered as an httpOnly, SameSite=Lax cookie (Secure in production), ~7-day expiry, server-side revocation on sign-out.
- CSRF: SameSite=Lax cookies plus an Origin check on state-changing requests.
- Out of scope by design (and stated honestly in the README): OAuth, email verification, password reset, rate limiting.

### Report editing and revisions

- Saved immediately, versioned always. Every mutation (title/description, filter add/remove, block add/edit/move/delete) runs through one transactional helper that checks ownership, applies the change, bumps `Report.version`, and stores a snapshot revision in the same transaction — no version can exist without its snapshot.
- A revision stores a small human-readable snapshot (title, description, filter descriptions, block labels), not a diff; diffs are computed between the snapshot at a share link's version (`ShareLink.versionAtShare`) and the live report, so they are exact and the wording cannot drift.
- The owner sees a live diff preview on the report's share page for the newest active link; viewers see the same diff as a "What changed since this link was shared" panel.

### UX and accessibility

- Layout: single column below 640px; builder uses list + editor panels that stack on mobile.
- Keyboard: native `details`/`summary` for trace panels, real buttons for block reordering (up/down), visible focus rings, labelled inputs, `aria-live` announcements for async status.
- States: loading skeletons/spinners for upload and compute; explicit empty states for a fresh dataset, empty report, and zero matching rows (an empty result shows "0 rows matched — here's why" instead of a blank chart).
- Copy tone: plain English, no jargon in user-facing text.

## 5. Testing Decisions

**Philosophy:** test external behavior of the deep modules — inputs and outputs — never UI internals or implementation details. If a test needs to know how a number is computed internally, it is testing the wrong thing.

**Prior art:** there is no existing codebase; the suite is a floor, not a ceiling: verification via small fixtures and table-driven cases.

**Modules tested (Vitest, one command: `npm test`):**

1. **Compute engine (highest priority):** sum/avg/min/max/count, split-by-category, date-range and category filters, missing-value exclusion, empty result sets, all-missing columns (returns no value with a reason, not a crash), and the accounting invariant `included + excludedByFilter + excludedByMissingValue = usableRows` and `usableRows + rejectedAtImport = fileRows`.
2. **CSV importer — bad-file matrix:** not-a-CSV (prose/binary), `.xlsx` magic bytes, invalid UTF-8, empty file, header-only file, ragged rows (recorded as rejected with reasons, remaining rows kept), unclosed quote, no total loss: `imported + rejected + blankLines = physical lines` for every fixture.
3. **Type inference:** clean numbers/dates/categories, mixed columns around the 90% threshold, ambiguous `DD/MM vs MM/DD` flagging, identifier-like all-unique column classified as text.
4. **Access control (the enforcement point):** a second user cannot fetch, mutate, delete, or share another user's report or dataset through the access layer; expired/revoked/random tokens resolve to their distinct no-content states; a valid link exposes exactly the shared report and nothing adjacent. Resolvers take an injectable `now`, so expiry tests never flake.
5. **Revisions:** adding/removing/reordering blocks and changing the filter each produce the expected summary entries.

**Explicitly not tested:** React rendering, Tailwind styling, and (unless time allows) a full HTTP-level end-to-end pass. Route handlers are intentionally thin wrappers over the tested domain modules; an HTTP smoke test is a stretch goal, not a substitute for the above.

## 6. Out of Scope

- The three optional features not chosen: PDF/image export, suggested charts on upload, comments.
- Multi-user sharing of a report among signed-in accounts; every report has exactly one owner.
- Editing dataset values, joins across datasets, or any data-transformation layer — files are immutable once imported.
- OAuth, email verification, password reset, rate limiting, audit logs.
- Week/month date bucketing on line charts (day-only; a bucket selector is a stretch, cut first if behind).
- Scheduled refresh, alerts, or any background processing.
- Perfect SQLite concurrency; the app targets single-reviewer local use and light hosting.

## 7. Assignment Traceability

| Assignment requirement | Where satisfied |
| --- | --- |
| 1. Accounts, ownership enforced at the data layer | Stories 1–6; modules 4–5; "Auth" + "Sharing and security" |
| 2. Server-side parse, type guess, profile, rejected rows | Stories 7–23; "CSV import policy", "Type inference rules" |
| 3. Blocks + report-level filter | Stories 24–40; "Compute and trace contract" |
| 4. "How was this calculated?" everywhere, server-computed | Stories 41–48; modules 3 identity in all three views |
| 5. Read-only, expiring, revocable share link that leaks nothing | Stories 49–58; "Sharing and security" |
| 6. Loading/empty/error states, mobile, keyboard, server validation, safe rendering | Stories 63–67; "UX and accessibility" |
| 7. Tests: aggregation, bad file, expiry/revocation/foreign access | Section 5 |
| 8. Runs in a few commands | Story 68; `TECHSTACK.md` setup section |
| Optional: "What changed" view | Stories 59–62; "Report editing and revisions" |

## 8. Further Notes

### Time plan

| Track | Budget |
| --- | --- |
| Schema, auth, scaffolding | 0:40 |
| CSV import + profiling UI | 1:10 |
| Compute engine + builder + trace panels | 1:30 |
| Share links + viewer + What changed | 0:40 |
| Tests | 0:25 |
| README + sample data + demo recording | 0:35 |
| **Total** | **5:00** |

If behind, cut in this order: polish/animations → "new since last visit" badge (keep the timeline) → dataset rename/delete → rejected-rows pagination (render a simple capped list). Core correctness is never the thing that gets cut.

### Deliverables checklist (per assignment)

- [ ] README sections: what was built; how to run in a few commands; "How my report builder works" (≤ 2 pages); decisions and trade-offs; what was cut for time; hours spent; how AI was used — including one place AI was wrong and how it was caught.
- [ ] Repository contains an intentionally messy sample CSV (a few thousand rows: blanks, bad dates like `31/02/2024`, `N/A` values, ragged rows, trailing spaces, duplicate header names) plus tiny binary fixtures for encoding tests.
- [ ] 3–4 minute demo video showing: messy CSV upload + profile readout → building a report with each block kind → "How was this calculated?" on two numbers → sharing the link and opening it in a private window → revoking it and showing it stops working → trying a bad file.
- [ ] Honest "what could still go wrong" list (seed: no rate limiting, SQLite concurrency, in-memory compute at scale, unsigned note text is plain but still user content shown to viewers).

### Live-walkthrough readiness

The assignment says a likely live ask is adding a **median metric** or a new **filter kind**. The design anticipates both: a new aggregation is one pure function plus one enum value; a new filter kind is one predicate in the compute engine plus one editor row. Keep the compute engine's spec typed and exhaustive (`switch` with exhaustive checks) so the build fails loudly when a variant is added and not handled.

### Honesty rules for the write-up and demo

- No claimed feature that does not work end to end in the demo.
- Numbers in the README (row counts, timings) must come from the actual sample data.
- The "AI was wrong here" anecdote must be a real logged incident; keep a running note during the build.

## 9. As-built deviations (v1)

Where the built app deliberately differs from the plan above, recorded rather than glossed over:

1. **No explicit Save button.** Every mutation saves and versions immediately; no unsaved state exists, so the diff preview on the share page always reflects exactly what is stored.
2. **Generic filter list instead of one date-range + one category filter.** Up to 10 conditions, ANDed, six operators. A practical superset; multi-select "value in list" and negation are not built.
3. **Metric split-by-category not built.** Grouping lives in chart blocks (top groups + a visible "(blank)" bucket), each with a full trace.
4. **Tables show the first N rows in source order** (chosen columns, 1–100). Block-level column sorting was cut; the trace states the order and the omitted-row count.
5. **No "new since your last visit" badge** (cut by plan, cut #2). The what-changed panel itself is built.
6. **Distinct friendly pages for expired vs revoked vs unknown tokens** instead of one identical not-found page. None of the pages exposes report content or confirms what a wrong token would have been.
7. **The viewer sees the dataset's display name** for traceability; no id, filename, or path, and the raw file remains unreachable.
8. **Extra scope shipped beyond the plan:** median and distinct-count metrics (plus min/max naming the column); number-between and date-between operators; bar charts group by any column, with dates bucketing by day.
9. **Rejected-rows list is capped** at the first 50 with exact reasons plus the total count, rather than paginated; blank-line and ignored-column counts are surfaced in the profile.
