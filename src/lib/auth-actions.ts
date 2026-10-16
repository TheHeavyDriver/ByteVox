"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { endCurrentSession, startSession } from "@/lib/session";
import { emailField, passwordField } from "@/lib/validation";

export type AuthState = { error: string | null };

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = emailField.safeParse(formData.get("email") ?? "");
  const password = passwordField.safeParse(formData.get("password") ?? "");
  if (!email.success) {
    return { error: email.error.issues[0]?.message ?? "Invalid email address." };
  }
  if (!password.success) {
    return { error: password.error.issues[0]?.message ?? "Invalid password." };
  }

  const existing = await db.user.findUnique({ where: { email: email.data } });
  if (existing) {
    return { error: "An account with this email already exists. Sign in instead." };
  }

  const user = await db.user.create({
    data: {
      email: email.data,
      passwordHash: await hashPassword(password.data),
    },
  });
  await startSession(user.id);
  redirect("/dashboard");
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = emailField.safeParse(formData.get("email") ?? "");
  const password = z.string().safeParse(formData.get("password") ?? "");
  if (!email.success || !password.success) {
    return { error: "Enter your email and password." };
  }

  const user = await db.user.findUnique({ where: { email: email.data } });
  const passwordOk = user
    ? await verifyPassword(password.data, user.passwordHash)
    : false;
  if (!user || !passwordOk) {
    // same message either way; don't reveal which half was wrong
    return { error: "Email or password is incorrect." };
  }

  await startSession(user.id);
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await endCurrentSession();
  redirect("/login");
}
