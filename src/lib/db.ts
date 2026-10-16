import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 connects through a driver adapter. DATABASE_URL looks like
// "file:./var/dev.db", relative to the project root, and the Prisma CLI
// resolves it the same way (see prisma7.config.ts). Normalizing to an
// absolute path here means a change of working directory can never silently
// switch which database the app talks to.
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./var/dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  if (filePath === ":memory:") {
    return raw;
  }
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath);
  return `file:${absolute}`;
}

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

// In dev, Next.js hot-reloads modules; without this guard every reload would
// create another client and another SQLite connection.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
