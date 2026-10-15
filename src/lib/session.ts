import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  createSession,
  destroySessionByToken,
  getUserBySessionToken,
} from "@/lib/auth";
import type { User } from "@/generated/prisma/client";

/**
 * Cookie glue around the auth module. Kept separate so auth.ts stays pure
 * (no Next.js imports) and testable.
 */

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  await destroySessionByToken(token);
  jar.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  return getUserBySessionToken(jar.get(SESSION_COOKIE_NAME)?.value);
}
