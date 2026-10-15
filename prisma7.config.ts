import { defineConfig } from "prisma/config";

// Give the Prisma CLI the same environment Next.js gets. Optional in CI,
// where DATABASE_URL may come from the ambient environment.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env present — fall back to the ambient environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
