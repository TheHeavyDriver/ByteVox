import type { Metadata } from "next";
import { BlockCard } from "@/components/block-view";
import { computeBlocks, type BlockView } from "@/lib/compute/engine";
import { formatDateTime } from "@/lib/format";
import {
  getReportDiffSince,
  loadReportDatasetContext,
  resolveShareLink,
} from "@/lib/reports";
import {
  describeFilter,
  parseBlockDefinition,
  parseFilterList,
} from "@/lib/report-spec";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolution = await resolveShareLink(token);
  return {
    title:
      resolution.status === "ok"
        ? `${resolution.report.title} — shared report`
        : "Shared report",
    robots: { index: false, follow: false },
  };
}

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "This link doesn't work",
    body: "The token is unknown. It may have been mistyped or the link was never created on this server.",
  },
  revoked: {
    title: "This link was revoked",
    body: "The report owner turned this share link off. Ask them for a fresh one if you still need access.",
  },
  expired: {
    title: "This link has expired",
    body: "Share links have a limited lifetime by design. Ask the report owner for a new link.",
  },
};

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolution = await resolveShareLink(token);

  if (resolution.status !== "ok") {
    const copy = STATUS_COPY[resolution.status] ?? STATUS_COPY.invalid!;
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm text-stone-600">{copy.body}</p>
      </div>
    );
  }

  const { report, link } = resolution;
  const filters = parseFilterList(report.filterJson);
  const datasetCtx = report.datasetId
    ? await loadReportDatasetContext(report.datasetId)
    : null;
  const blockViews: BlockView[] = datasetCtx
    ? computeBlocks(report.blocks, {
        rows: datasetCtx.rows,
        columns: new Map(
          datasetCtx.computeColumns.map((column) => [column.name, column]),
        ),
        filters,
        dataset: datasetCtx.ledger,
      })
    : report.blocks.map((block) => ({
        id: block.id,
        position: block.position,
        type: block.type,
        title: block.title,
        definition: parseBlockDefinition(block.specJson),
      }));

  const diff = await getReportDiffSince(report.id, link.versionAtShare);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
          Shared report · read-only
        </p>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {report.title}
          </h1>
          {report.description && (
            <p className="mt-1 max-w-3xl text-sm text-stone-600">
              {report.description}
            </p>
          )}
        </div>
        <p className="text-xs text-stone-500">
          Built from {datasetCtx?.datasetName ?? "(deleted dataset)"} · report
          v{report.version}, updated {formatDateTime(report.updatedAt)} ·
          link created {formatDateTime(link.createdAt)}, expires{" "}
          {formatDateTime(link.expiresAt)}
        </p>
      </header>

      {diff && diff.changed && (
        <details
          open
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
        >
          <summary className="cursor-pointer select-none text-sm font-semibold text-amber-900">
            What changed since this link was shared (v{link.versionAtShare} →
            v{diff.currentVersion})
          </summary>
          {diff.items.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {diff.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-amber-900">
              The report was re-saved without visible changes to title,
              filters, or blocks.
            </p>
          )}
          <p className="mt-2 text-xs text-amber-800">
            You are looking at the latest version. Numbers below reflect{" "}
            v{diff.currentVersion}.
          </p>
        </details>
      )}

      {!datasetCtx && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            The dataset behind this report was deleted
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            The report configuration is shown below, but its numbers cannot be
            recomputed. Nothing is estimated in their place.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Filters
        </h2>
        {filters.length === 0 ? (
          <p className="mt-1 text-sm text-stone-600">
            None — every usable row counts.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {filters.map((filter, index) => (
              <li
                key={`${index}-${describeFilter(filter)}`}
                className="rounded-full border border-stone-300 bg-stone-50 px-3 py-1 text-sm text-stone-700"
              >
                {describeFilter(filter)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-4">
        {blockViews.map((view) => (
          <BlockCard key={view.id} view={view} />
        ))}
        {blockViews.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            This report has no blocks.
          </p>
        )}
      </div>

      <footer className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs text-stone-500">
        <p>
          Every number above traces back to rows in the source dataset: open a
          block&apos;s “How this is computed” panel to see the full count of
          rows included, excluded by filters, blank, and unparseable — plus
          sample source rows. Unreadable rows are listed with their exact
          reasons on the dataset profile.
        </p>
        <p className="mt-2">
          This link exposes only this report. It cannot reach the raw uploaded
          file, other reports, or the owner&apos;s account.
        </p>
      </footer>
    </div>
  );
}
