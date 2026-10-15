# ByteVox Report Builder — Tech Stack & Architecture

**Companion doc:** `PRD.md` (requirements, user stories, testing plan)
**Constraint that shaped everything:** a reviewer must go from clone to running app in a few commands, and the whole thing must be buildable, explainable, and testable in ~5 hours by one person.

---

## 1. At a Glance

| Layer | Choice | Why (one line) |
| --- | --- | --- |
| Framework | Next.js (App Router) + React 19, TypeScript strict | One app, one process, one command; server code and UI share types. |
| Styling | Tailwind CSS v4 | Fast to build a finished-feeling UI; no design system to maintain. |
| Database | SQLite via Prisma ORM | Zero-setup persistence; reviewer runs nothing extra. |
| Auth | Hand-rolled: scrypt + DB-backed sessions | Fully explainable; no heavy auth dependency for a 5-hour build. |
| CSV parsing | `csv-parse` (node-csv) | Battle-tested, streaming, precise error reporting with line numbers. |
| Dates | `date-fns` | Explicit-format parsing; no implicit `Date` guessing. |
| Validation | `zod` | One schema validates every server-side input. |
| Charts | Recharts | Simple declarative bar/line charts; data computed server-side. |
| Tests | Vitest | Fast, TypeScript-native; matches the "deep module" testing plan. |
| File storage | Local disk (`var/uploads/`), never served | Raw bytes are never reachable over HTTP at all. |
| Package manager | npm | Most universal; no extra tooling for reviewers. |

Version policy: pin to the latest stable versions at build time (Next.js 15+, React 19, Tailwind v4, Prisma 6+, Vitest 3+, Node 20+ LTS). The lockfile is committed.

## 2. Choices and Rejected Alternatives

### 2.1 Next.js full-stack (App Router)

Server components read the database directly; route handlers and server actions handle mutations; the browser never talks to a database or computes a number. One dev server, one build, one deploy target.

- **Rejected: React SPA + separate API (Express/FastAPI).** Two processes, CORS, duplicated types, and a second set of run instructions — real cost for zero benefit at this size.
- **Rejected: Django full-stack.** Excellent batteries, but a template/SPA split for the builder UI would cost more time than it saves.
- **Trade-off accepted:** Next.js couples UI and server by design. At this scale that is a feature (shared types, one code path), not a problem.

### 2.2 Prisma + SQLite

- SQLite means the reviewer runs `npm install && npm run setup && npm run dev` — no database server, no Docker.
- Prisma gives typed queries, committed migrations, and a guarantee the app never builds SQL from user input (the assignment's hard requirement).
- **Rejected: Postgres via Docker.** More "production", but adds Docker to the run instructions and buys nothing the assignment measures.
- **Migration path if needed:** swap the Prisma datasource to Postgres and re-run migrations; the schema is deliberately portable. (See §8, Turso/libSQL for hosted SQLite.)

### 2.3 Hand-rolled auth (scrypt + sessions table)

- Passwords: Node's built-in `crypto.scrypt` (per-user salt, 16 bytes), verified with `timingSafeEqual`. Zero native dependencies, so `npm install` never fails on a missing compiler.
- Sessions: 32 random bytes; only the SHA-256 hash is stored in a `Session` row; the raw token lives in an httpOnly, SameSite=Lax cookie (Secure in production), ~7-day expiry. Sign-out deletes the row.
- **Rejected: NextAuth/Auth.js.** Config-heavy for email+password and has version churn; the assignment's "any simple approach" favors code we can explain line by line.
- **Rejected: signed cookie without a table.** Cannot revoke individual sessions; the table costs nothing.

### 2.4 CSV pipeline

- **`csv-parse` (node-csv)** with `bom: true`, `trim: true`, `skip_empty_lines: true`, multi-delimiter detection (`,` `;` `\t` `|`), strict quoting, and `skip_records_with_error` so a bad row yields a record with its line number and message instead of killing the file.
- **Rejected: PapaParse.** Browser-first; its Node error reporting is weaker.
- **Rejected: hand-rolled parser.** Quoting/escaping edge cases are exactly where "nothing silently dropped" dies.
- **Encoding:** detect and decode UTF-8 (BOM-aware) and UTF-16LE/BE (BOM required) with the platform `TextDecoder`; reject anything else with an actionable message. Sniff `.xlsx` magic bytes (`PK\x03\x04`) for a targeted error.
- The importer is one deep module: bytes in, `{rows, columns, rejected, profile}` or a typed error out.

### 2.5 Charts

- Recharts for bar and line. The server computes every plotted value; the client only renders geometry. Chart tooltips display server-computed values verbatim, so a tooltip and a trace panel can never disagree.
- **Rejected: hand-rolled SVG.** Fun, but buys time savings only if nothing goes wrong; Recharts is faster to a finished look.
- **Rejected: ECharts/Chart.js.** Heavier and less ergonomic in React for two chart types.

### 2.6 Testing

- Vitest for unit and module tests; the tested surface is exactly the PRD's test plan (compute engine, CSV importer, type inference, access control, revisions).
- Test databases: a temporary SQLite file per suite, migrated via `prisma migrate deploy` in global setup; expiry tests inject a fixed `now` so they can never flake.
- **Rejected: Jest.** Slower configuration with TypeScript/ESM; no upside here.

## 3. Architecture

```
Browser (React 19 + Tailwind)
   │   server-rendered HTML · server actions · fetch
   ▼
Next.js server (App Router, Node runtime) — the only place logic runs
   ├─ pages (server components; thin, call modules below)
   ├─ route handlers / server actions (zod validation → session → userId)
   │
   ├─ access layer        every function takes userId or share token; no unscoped reads
   ├─ auth module         scrypt hashing, session create/verify/destroy
   ├─ csv importer        decode → sniff → parse → reject-account → infer types
   ├─ compute engine      pure: (rows, filter, block spec) → value + trace
   └─ revisions module    diff saved report → human-readable change summary
   ▼
Prisma ORM ──► SQLite (var/dev.db)
CSV bytes on disk (var/uploads/) — written once, never served over HTTP
```

Rules that keep this honest:

1. **One compute path.** Builder preview, owner view, and share view all render the return value of the same `computeReport` call. There is no second implementation of any number anywhere, including the client.
2. **Authorization at the data layer.** Pages and handlers cannot request data without supplying a user id or share token; the access layer refuses everything else. "Enforced where the data is read" is structural, not a per-screen check.
3. **The share path is token-only.** It resolves report-by-token with expiry and revocation checks before anything loads; expired, revoked, wrong, and partial tokens all yield the same not-found page.

## 4. Data Model

| Entity | Key fields | Notes |
| --- | --- | --- |
| `User` | id, email (unique), passwordHash, createdAt | scrypt hash with embedded salt. |
| `Session` | id, tokenHash (unique), userId, expiresAt, createdAt | Raw token never stored. |
| `Dataset` | id, userId, name, originalFilename, storagePath, byteSize, encoding, rowCount, rejectedCount, status, createdAt | `status: ready \| failed`; immutable after import. |
| `DatasetColumn` | id, datasetId, position, name, guessedType (`number\|date\|category\|text`), confidence, statsJson | Stats: missing count, distinct count, per-type parse counts, min/max, samples, ambiguity flags — this JSON is what the profile page explains the guess with. |
| `DatasetRow` | id, datasetId, rowNumber, dataJson | Values keyed by column name; JSON keeps the schema stable across CSV shapes. |
| `RejectedRow` | id, datasetId, rowNumber, reason, rawSnippet | Powers the "could not be read" list; nothing is dropped without a row here. |
| `Report` | id, userId, datasetId, title, description, filterJson, version, createdAt, updatedAt | `filterJson`: at most one date-range + one category filter. |
| `Block` | id, reportId, position, type (`metric\|chart\|table\|note`), title, specJson | Specs are small typed JSON validated by zod. |
| `ShareLink` | id, reportId, tokenHash (unique), createdAt, expiresAt, revokedAt | Expiry required (default 7d, max 90d); revoke = set `revokedAt`. |
| `ReportRevision` | id, reportId, version, createdBy, createdAt, summaryJson | Array of human-readable change strings written at save time. |

Indexes: `Dataset.userId`, `Report.userId`, `Block(reportId, position)`, `Block.reportId`, `ShareLink.tokenHash`, `DatasetRow.datasetId`. Foreign keys cascade from `Dataset` and `Report` so deleting a dataset (and its rows) or report cleans up fully.

Rough row math: a 3,000-row CSV with 10 columns ≈ 30,000 `DatasetRow` rows of small JSON — trivial for SQLite. The 50,000-row cap keeps single-file imports comfortably sub-second to low-seconds.

## 5. Key Flows

### 5.1 Upload → profile

1. Route handler accepts multipart upload; content-length and streamed byte count enforce the 10 MB cap (no trust in headers alone).
2. Importer decodes (UTF-8/BOM aware, UTF-16 with BOM), sniffs delimiter, parses with `csv-parse`.
3. Every skipped row is captured with line number and reason → `RejectedRow`. Blank lines and empty columns are counted for the profile.
4. Type inference runs per column (rules in PRD §4) → `DatasetColumn.statsJson` keeps the evidence (parse pass/fail counts, ambiguity flags).
5. Rows, columns, and rejected rows are persisted in one transaction; the raw file is moved to `var/uploads/<uuid>.csv` (mode 600, never in a served directory).
6. The profile page renders from the database — counts, guesses with reasons, rejected-row list, first-rows preview.

### 5.2 A number from file to screen (the consistency guarantee)

1. Page load (builder visit, owner view, or share view) first resolves authorization: session → userId, or share token → (report, checks passed).
2. The access layer loads the dataset rows **and** the report's blocks + filter.
3. `computeReport(rows, filter, blocks)` runs each block in one pass, returning for each: the value(s)/series/table rows **and** a trace `{description, specRun, accounting}` where `accounting` reconciles `fileRows = rejectedAtImport + excludedByFilter + excludedByMissingValue + includedRows` (per group for split metrics and chart series).
4. The page renders values and trace panels from that single object; navigation between preview and saved view changes nothing about the math. If a number appears on screen, its trace was computed in the same call.

### 5.3 Share link lifecycle

1. **Create:** owner picks an expiry (default 7 days, max 90). Server generates 32 random bytes, stores only `sha256(token)`, returns the URL once.
2. **View:** `/s/<token>` hashes the token, looks up the link, checks `revokedAt is null` and `expiresAt > now`, then loads the report through the token-scoped path — report title, blocks, computed values, traces, and revisions newer than the link's creation. Nothing else is reachable from this path, and there is no raw-file endpoint anywhere in the app.
3. **Revoke:** sets `revokedAt`; the next request 404s (share pages are `force-dynamic`, `no-store`) — no caches to wait out.
4. **Edge cases:** expired/revoked/unknown/partial tokens render one identical not-found page (no oracle, no enumeration signal); every invalid link test injects a fixed clock.

### 5.4 What changed

On Save, the revisions module diffs previous vs next report and appends a `ReportRevision` with human-readable entries (block added/removed/reordered/edited, filter changed). The owner sees the full timeline; viewers see entries newer than their link's creation date, with a "new since last visit" badge from a cookie storing the last-seen version per link. Entries contain block titles and change kinds only — never internal ids or data.

## 6. Security Posture

| Concern | Mitigation |
| --- | --- |
| Broken access control | Access layer requires userId or share token on every call; no unscoped reads exist to misuse. Share path resolves by token only. |
| SQL injection | Prisma only; no string-built SQL anywhere in the codebase, so the assignment's requirement is structurally met rather than reviewed case by case. |
| XSS | React auto-escaping; no `dangerouslySetInnerHTML`; CSV values and note text rendered as plain text. |
| CSRF | SameSite=Lax cookies + Origin check on state-changing requests; server actions verify origin by default. |
| Session theft | httpOnly + Secure (prod) cookies; tokens SHA-256-hashed at rest; server-side revocation. |
| Token guessing | 256-bit tokens, hashed at rest, constant-shaped errors for invalid links. |
| Upload abuse | Size/row/column caps, encoding validation, magic-byte sniffing; file stored outside served paths. |
| Data over-exposure in shares | Share render includes only report content + traces + revision summaries; no dataset name, profile, rejected rows, or owner identity. |
| Password storage | scrypt with per-user salt and constant-time comparison. |
| **Known gaps (stated honestly in README)** | No rate limiting or brute-force lockout, no email verification or password reset, no audit log. |

## 7. Setup and Scripts

Prerequisites: Node 20+ LTS and npm. Nothing else — no Docker, no external services.

```bash
npm install      # dependencies
npm run setup    # prisma generate + migrate deploy (creates var/dev.db)
npm run dev      # http://localhost:3000
```

| Script | Does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run setup` | Generate Prisma client + apply migrations (idempotent) |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Vitest suite (compute engine, importer, access control, revisions) |
| `npm run demo:data` | (optional helper) regenerate the messy sample CSV |

Environment (`.env.example` committed, values sensible by default):

```
DATABASE_URL="file:./var/dev.db"
UPLOAD_DIR="./var/uploads"
MAX_UPLOAD_MB=10
```

`var/` (database + uploads) and `.env` are gitignored; the committed sample CSV lives in `sample-data/`.

## 8. Performance and the 100× Question

Current envelope: 10 MB / 50,000 rows / 100 columns per dataset; a few thousand rows is the expected case. Import is a single streaming pass; report rendering loads the dataset's rows once per request and computes all blocks in memory — fast and, more importantly, correct and traceable (the trace's row accounting needs full control of the filter/exclusion steps, which in-memory evaluation gives for free).

With files 100× larger (≈ 5M rows):

1. **First thing to break: request memory and time.** Loading all rows inline per render and recomputing every block per request blows up memory and latency.
2. **Then storage shape:** one JSON row per record inflates SQLite size and parse cost; SQLite's single writer serializes a 5M-row import.
3. **Then the UI:** profile previews and rejected-row lists need pagination everywhere.

The planned fix path, in order: push aggregations into SQL (`GROUP BY` via Prisma's parameterized query builder) while keeping the same trace semantics; materialize result snapshots per (report, version) so share views are O(1) reads; move imports to a background worker with progress reporting; switch to Postgres (or Turso/libSQL for hosted SQLite) and columnar storage for the hot columns. None of this is built now — it is scoped out deliberately and described in the README's scaling section, which is exactly what the assignment asks for.

## 9. Test Tooling

- Vitest runs all suites; test files sit next to the modules they test.
- Each database-touching suite gets a fresh temporary SQLite file (`prisma migrate deploy` against it in setup, delete in teardown).
- Time-dependent tests (link expiry) pass an explicit `now` into the resolver — no fake timers, no flakes.
- Fixtures: `sample-data/messy.csv` (demo/import tests) plus tiny byte-level fixtures for encoding and `.xlsx`-magic-byte cases, and prose/binary "not a CSV" files.

## 10. Deployment (optional live link)

SQLite needs a persistent disk, so:

- **Fly.io or Railway** with a small volume mounted for `var/` — one container, `npm ci && npm run build && npm start`.
- **Vercel is not suitable as-is** (ephemeral, read-only filesystem); hosting there would mean swapping the datasource to Turso/libSQL. This is documented, not silently ignored, and local-run remains the primary supported path.
