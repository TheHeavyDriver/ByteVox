import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { emailField, passwordField } from "@/lib/validation";

describe("password hashing", () => {
  it("verifies the correct password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("produces different hashes for the same password (per-user salt)", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
  });
});

describe("credential validation", () => {
  it("normalizes emails (trim + lowercase)", () => {
    const result = emailField.safeParse("  Mixed@Case.COM ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("mixed@case.com");
  });

  it("rejects a non-email string", () => {
    expect(emailField.safeParse("definitely not an email").success).toBe(false);
  });

  it("enforces a minimum password length of 8", () => {
    expect(passwordField.safeParse("short").success).toBe(false);
    expect(passwordField.safeParse("longenough").success).toBe(true);
  });
});
