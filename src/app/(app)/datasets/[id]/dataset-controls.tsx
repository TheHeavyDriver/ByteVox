"use client";

import { deleteDatasetAction, renameDatasetAction } from "@/lib/dataset-actions";

export function RenameForm({
  datasetId,
  name,
}: {
  datasetId: string;
  name: string;
}) {
  return (
    <form action={renameDatasetAction} className="flex items-center gap-2">
      <input type="hidden" name="datasetId" value={datasetId} />
      <label htmlFor="dataset-name" className="sr-only">
        Dataset name
      </label>
      <input
        id="dataset-name"
        name="name"
        defaultValue={name}
        required
        maxLength={80}
        className="w-56 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
      />
      <button
        type="submit"
        className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
      >
        Rename
      </button>
    </form>
  );
}

export function DeleteDatasetForm({ datasetId }: { datasetId: string }) {
  return (
    <form
      action={deleteDatasetAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Delete this dataset? Its rows, profile, and stored upload are removed. This cannot be undone.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="datasetId" value={datasetId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        Delete dataset
      </button>
    </form>
  );
}
