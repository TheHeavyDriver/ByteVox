import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 connects through a driver adapter. Our DATABASE_URL looks like
 * "file:./var/dev.db", which is relative to the project root. The Prisma CLI
 * resolves it the same way (see prisma7.config.ts), so the CLI and the app
 * always point at the same file. We normalize to an absolute path here so the
 * process working directory can never silently change which database is used.
 */
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./var/dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  if (filePath === ":memory:") {
    return raw;
  }
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  return `file:${absolute}`;
}

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
  return new PrismaClient({ adapter });
}

// In development, Next.js hot-reloads modules; without this guard every
// reload would create another client and another SQLite connection.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
