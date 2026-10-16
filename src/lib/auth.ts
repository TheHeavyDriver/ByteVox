import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import type { PrismaClient, User } from "@/generated/prisma/client";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "bv_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Passwords are stored as "scrypt:<salt hex>:<hash hex>". scrypt ships with
// Node, so there is no native dependency to install and every step is
// explainable.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Session and share tokens are 32 random bytes; only the SHA-256 hash is
// stored, so a database leak does not leak usable tokens.
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

// 32 random bytes, URL-safe
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: string,
  database: PrismaClient = db,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await database.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function getUserBySessionToken(
  token: string | undefined,
  database: PrismaClient = db,
  now: Date = new Date(),
): Promise<User | null> {
  if (!token) return null;
  const session = await database.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await database.session
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function destroySessionByToken(
  token: string | undefined,
  database: PrismaClient = db,
): Promise<void> {
  if (!token) return;
  await database.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) },
  });
}
