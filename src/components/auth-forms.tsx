"use client";

import { useActionState } from "react";
import {
  signInAction,
  signUpAction,
  type AuthState,
} from "@/lib/auth-actions";

const initialState: AuthState = { error: null };

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {error}
    </p>
  );
}

function SubmitButton({
  pending,
  idleLabel,
  pendingLabel,
}: {
  pending: boolean;
  idleLabel: string;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function Field({
  id,
  label,
  type,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
      />
    </div>
  );
}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <Field id="email" label="Email" type="email" autoComplete="email" />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
      />
      <ErrorNote error={state.error} />
      <SubmitButton pending={pending} idleLabel="Sign in" pendingLabel="Signing in…" />
    </form>
  );
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <Field id="email" label="Email" type="email" autoComplete="email" />
      <Field
        id="password"
        label="Password (8+ characters)"
        type="password"
        autoComplete="new-password"
      />
      <ErrorNote error={state.error} />
      <SubmitButton
        pending={pending}
        idleLabel="Create account"
        pendingLabel="Creating account…"
      />
    </form>
  );
}
