import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Login — ByteVox Report Builder" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <Link
          href="/"
          className="text-2xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          ByteVox Report Builder
        </Link>
        <p className="mt-1 text-sm text-stone-600">
          Upload a CSV, build a report, and share it with a link where every
          number shows how it was calculated.
        </p>
      </div>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium">Sign in</h2>
        <SignInForm />
        <p className="mt-4 text-sm text-stone-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-stone-900 underline underline-offset-2"
          >
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}
