import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlockCard } from "@/components/block-view";
import { computeBlocks, type BlockView } from "@/lib/compute/engine";
import { formatDateTimeUTC } from "@/lib/format";
import {
  removeFilterAction,
  updateReportMetaAction,
} from "@/lib/report-actions";
import {
  getReportForUser,
  loadReportDatasetContext,
  shareStatus,
} from "@/lib/reports";
import {
  describeFilter,
  parseBlockDefinition,
  parseFilterList,
} from "@/lib/report-spec";
import { getCurrentUser } from "@/lib/session";
import {
  AddBlockPanel,
  AddFilterForm,
  BlockFrame,
  DeleteReportForm,
} from "./report-controls";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const report = await getReportForUser(id, user.id);
  if (!report) notFound();

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

  const activeShares = report.shareLinks.filter(
    (link) => shareStatus(link) === "active",
  ).length;

  const editorColumns =
    datasetCtx?.uiColumns.map((column) => ({
      name: column.name,
      guessedType: column.guessedType as string,
    })) ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="text-sm text-stone-500 hover:underline"
            >
              ← All reports
            </Link>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
              {report.title}
            </h1>
            {report.description && (
              <p className="mt-1 max-w-3xl text-sm text-stone-600">
                {report.description}
              </p>
            )}
            <p className="mt-1 text-xs text-stone-500">
              v{report.version} · updated {formatDateTimeUTC(report.updatedAt)}
              {report.dataset && (
                <>
                  {" · dataset: "}
                  <Link
                    href={`/datasets/${report.dataset.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {report.dataset.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <Link
            href={`/reports/${report.id}/share`}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
          >
            Share{activeShares > 0 ? ` (${activeShares} active)` : ""}
          </Link>
        </div>

        <details className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer select-none text-sm font-medium text-stone-700">
            Edit title and description
          </summary>
          <form action={updateReportMetaAction} className="mt-3 space-y-3">
            <input type="hidden" name="reportId" value={report.id} />
            <div>
              <label
                htmlFor="report-title"
                className="block text-xs font-medium text-stone-600"
              >
                Title
              </label>
              <input
                id="report-title"
                name="title"
                defaultValue={report.title}
                required
                maxLength={120}
                className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 sm:w-96"
              />
            </div>
            <div>
              <label
                htmlFor="report-description"
                className="block text-xs font-medium text-stone-600"
              >
                Description
              </label>
              <textarea
                id="report-description"
                name="description"
                rows={3}
                defaultValue={report.description}
                className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
            >
              Save
            </button>
          </form>
        </details>
      </header>

      {!datasetCtx && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            The dataset behind this report was deleted
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-amber-900">
            The report&apos;s title, filters, block configuration, and revision
            history are intact, but no block can be computed without its rows.
            Nothing is estimated or carried over in the meantime.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-900">Filters</h2>
          <p className="text-xs text-stone-500">
            Applied to every block; rows they exclude are counted in each
            block&apos;s explanation.
          </p>
        </div>

        {filters.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            No filters — every usable row counts.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {filters.map((filter, index) => (
              <li
                key={`${index}-${describeFilter(filter)}`}
                className="flex items-center gap-1 rounded-full border border-stone-300 bg-stone-50 py-1 pl-3 pr-1.5 text-sm text-stone-700"
              >
                {describeFilter(filter)}
                <form action={removeFilterAction}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <input type="hidden" name="index" value={index} />
                  <button
                    type="submit"
                    aria-label={`Remove filter: ${describeFilter(filter)}`}
                    className="rounded-full px-1.5 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700"
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {datasetCtx && (
          <div className="mt-4 border-t border-stone-100 pt-4">
            <p className="mb-3 text-sm font-medium text-stone-700">
              Add a filter
            </p>
            <AddFilterForm reportId={report.id} columns={editorColumns} />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-stone-900">Blocks</h2>

        {report.blocks.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            No blocks yet — add the first one below.
          </p>
        )}

        {report.blocks.map((block, index) => {
          const view: BlockView =
            blockViews.find((candidate) => candidate.id === block.id) ?? {
              id: block.id,
              position: block.position,
              type: block.type,
              title: block.title,
              definition: parseBlockDefinition(block.specJson),
            };
          const type = block.type as "metric" | "chart" | "table" | "note";

          if (!datasetCtx) {
            return <BlockCard key={block.id} view={view} />;
          }

          return (
            <BlockFrame
              key={block.id}
              reportId={report.id}
              blockId={block.id}
              index={index}
              total={report.blocks.length}
              type={type}
              title={block.title}
              definition={view.definition}
              columns={editorColumns}
            >
              <BlockCard view={view} />
            </BlockFrame>
          );
        })}

        {datasetCtx && (
          <AddBlockPanel reportId={report.id} columns={editorColumns} />
        )}
      </section>

      <section className="rounded-lg border border-red-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Deleting a report removes its blocks, revision history, and share
          links. The dataset it used stays untouched.
        </p>
        <div className="mt-3">
          <DeleteReportForm reportId={report.id} />
        </div>
      </section>
    </div>
  );
}
