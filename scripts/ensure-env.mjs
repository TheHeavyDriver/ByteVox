// Creates .env from .env.example when missing so a fresh clone can run
// `npm run setup` and `npm run dev` with no manual steps.
// The committed defaults contain no secrets: sessions are random,
// DB-backed tokens, and the "database" is a local SQLite file.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env") && existsSync(".env.example")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}
