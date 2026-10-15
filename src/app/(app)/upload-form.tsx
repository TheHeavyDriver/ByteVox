"use client";

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { uploadDatasetAction, type UploadState } from "@/lib/dataset-actions";

const initialState: UploadState = { error: null };

export function UploadForm() {
  const [state, formAction, pending] = useActionState(
    uploadDatasetAction,
    initialState,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // The action is dispatched manually so a failed upload keeps the chosen
  // file in the input (React resets uncontrolled fields after form actions).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setLocalError("Choose a CSV file to upload.");
      return;
    }
    setLocalError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(() => formAction(formData));
  }

  const error = localError ?? state.error;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain,.tsv,.txt"
          onChange={() => setLocalError(null)}
          aria-label="CSV file"
          className="block w-full cursor-pointer rounded-md border border-stone-300 bg-white text-sm text-stone-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-stone-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-stone-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
        >
          {pending ? "Reading and profiling…" : "Upload and profile"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <p className="text-xs text-stone-500">
        Up to 10 MB, 50,000 rows, 100 columns. Messy files are welcome: every
        adjustment, ignored column, and unreadable row is reported on the
        profile page — never hidden.
      </p>
    </form>
  );
}
