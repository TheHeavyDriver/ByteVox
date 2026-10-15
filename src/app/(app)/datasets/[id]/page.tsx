import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getDatasetDetail,
  getDatasetPreviewRows,
  parseColumnStats,
  parseProfileMeta,
} from "@/lib/datasets";
import { formatBytes, formatDateTimeUTC, truncate } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { DeleteDatasetForm, RenameForm } from "./dataset-controls";

const TYPE_STYLES: Record<string, string> = {
  number: "border-emerald-200 bg-emerald-50 text-emerald-800",
  date: "border-sky-200 bg-sky-50 text-sky-800",
  category: "border-amber-200 bg-amber-50 text-amber-800",
  text: "border-stone-200 bg-stone-100 text-stone-700",
};

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.text;
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {type}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-700" : "text-stone-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function parseRowValues(dataJson: string): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(dataJson);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, string>;
    }
  } catch {
    // Fall through to the empty object: a corrupt row renders as blanks
    // rather than crashing the page.
  }
  return {};
}

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dataset = await getDatasetDetail(id, user.id);
  if (!dataset) notFound();

  const previewRows = await getDatasetPreviewRows(dataset.id, 10);
  const meta = parseProfileMeta(dataset.profileJson);
  const columns = dataset.columns.map((column) => ({
    column,
    stats: parseColumnStats(column.statsJson),
  }));
  const preview = previewRows.map((row) => ({
    rowNumber: row.rowNumber,
    values: parseRowValues(row.dataJson),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-stone-500 hover:underline">
            ← All datasets
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {dataset.name}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {dataset.originalFilename} · uploaded{" "}
            {formatDateTimeUTC(dataset.createdAt)}
          </p>
        </div>
        <RenameForm datasetId={dataset.id} name={dataset.name} />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Usable rows" value={dataset.rowCount.toLocaleString()} />
        <Stat
          label="Unreadable rows"
          value={dataset.rejectedCount.toLocaleString()}
          tone={dataset.rejectedCount > 0 ? "warn" : undefined}
        />
        <Stat label="Blank lines" value={meta.blankLines.toLocaleString()} />
        <Stat label="Columns" value={String(dataset.columns.length)} />
        <Stat label="File size" value={formatBytes(dataset.byteSize)} />
        <Stat label="Encoding" value={dataset.encoding} />
      </section>

      {meta.headerNotes.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Import notes — what was adjusted, and why
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {meta.headerNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Columns and type guesses
        </h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3 font-medium">Column</th>
                <th className="px-4 py-3 font-medium">Guessed type</th>
                <th className="px-4 py-3 font-medium">Why</th>
                <th className="px-4 py-3 text-right font-medium">Missing</th>
                <th className="px-4 py-3 text-right font-medium">Distinct</th>
                <th className="px-4 py-3 font-medium">Samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {columns.map(({ column, stats }) => (
                <tr key={column.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{column.name}</td>
                  <td className="px-4 py-3">
                    <TypeBadge type={column.guessedType} />
                  </td>
                  <td className="max-w-md px-4 py-3 text-stone-600">
                    {stats?.reason ?? "No stored profile for this column."}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                    {stats ? stats.missing.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                    {stats ? stats.distinct.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {stats
                      ? stats.samples
                          .slice(0, 3)
                          .map((sample) => truncate(sample, 28))
                          .join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Preview — first {preview.length} row{preview.length === 1 ? "" : "s"}
        </h2>
        {preview.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
            This file had zero usable data rows, so there is nothing to
            preview.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-3 font-medium">#</th>
                  {dataset.columns.map((column) => (
                    <th
                      key={column.id}
                      className="whitespace-nowrap px-3 py-3 font-medium"
                    >
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {preview.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-3 py-2 tabular-nums text-stone-400">
                      {row.rowNumber}
                    </td>
                    {dataset.columns.map((column) => (
                      <td
                        key={column.id}
                        className="max-w-[220px] truncate px-3 py-2 text-stone-700"
                        title={row.values[column.name] ?? ""}
                      >
                        {truncate(row.values[column.name] ?? "", 40)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dataset.rejectedCount > 0 && (
        <section id="unreadable">
          <h2 className="mb-3 text-lg font-medium">
            Unreadable rows — kept, with reasons
          </h2>
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-3 font-medium">File line</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Raw snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {dataset.rejectedRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 tabular-nums text-stone-500">
                      {row.rowNumber}
                    </td>
                    <td className="px-4 py-3 text-stone-700">{row.reason}</td>
                    <td className="max-w-md px-4 py-3 font-mono text-xs text-stone-500">
                      {truncate(row.rawSnippet, 120)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dataset.rejectedCount > dataset.rejectedRows.length && (
              <p className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500">
                Showing the first {dataset.rejectedRows.length} of{" "}
                {dataset.rejectedCount.toLocaleString()} unreadable rows.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-red-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Deleting a dataset removes its rows, profile, unreadable-row list,
          and the stored upload. Reports built on it keep their configuration
          but show a clear “dataset deleted” state instead of numbers.
        </p>
        <div className="mt-3">
          <DeleteDatasetForm datasetId={dataset.id} />
        </div>
      </section>
    </div>
  );
}
