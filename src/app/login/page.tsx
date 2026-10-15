import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SignInForm, SignUpForm } from "./auth-forms";

export const metadata: Metadata = { title: "Sign in — ByteVox Report Builder" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-8 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ByteVox Report Builder
        </h1>
        <p className="mt-1 max-w-xl text-sm text-stone-600">
          Upload a CSV, build a report, and share it with a link where every
          number shows how it was calculated.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Sign in</h2>
          <SignInForm />
        </section>
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Create an account</h2>
          <SignUpForm />
        </section>
      </div>
    </main>
  );
}
