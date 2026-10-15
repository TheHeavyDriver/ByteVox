// Prepares everything `vitest run` needs, so `npm test` works on a fresh
// clone even before `npm run setup` has been run:
//   1. the Prisma client (src/generated is gitignored, so it must be
//      generated once per clone),
//   2. the var/ directory,
//   3. the throwaway test database's schema (var/test.db, see
//      vitest.config.mts).
// The Prisma CLI loads .env itself but never overrides an ambient
// DATABASE_URL, so setting it here targets the test database only.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const env = { ...process.env, DATABASE_URL: "file:./var/test.db" };

if (!existsSync(path.join(root, "src/generated/prisma/client.ts"))) {
  execSync("prisma generate", { stdio: "inherit", env: process.env });
}
mkdirSync(path.join(root, "var"), { recursive: true });
execSync("prisma migrate deploy", { stdio: "inherit", env });
