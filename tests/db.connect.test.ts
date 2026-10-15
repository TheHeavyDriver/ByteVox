import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("database connection", () => {
  it("connects and can answer a query", async () => {
    const count = await db.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
