import type { ReactNode } from "react";
import { ChartView } from "@/components/chart-view";
import type { BlockView, MetricTrace } from "@/lib/compute/engine";
import { describeBlock } from "@/lib/report-spec";

/**
 * Rendering for a computed block: the value first, the explanation one
 * click away. The ledger panel mirrors the engine's invariants line for
 * line, so the UI cannot drift from the accounting without it being obvious.
 */

function LedgerRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-stone-200 py-1.5 last:border-b-0">
      <span className="text-stone-600">{label}</span>
      <span className="flex items-baseline gap-3">
        <span className="tabular-nums font-medium text-stone-800">
          {value.toLocaleString()}
        </span>
        <span className="max-w-[22rem] text-right text-stone-500">{detail}</span>
      </span>
    </div>
  );
}

export function LedgerPanel({ trace }: { trace: MetricTrace }) {
  const { ledger, dataset } = trace;
  const showValueLine =
    ledger.excludedByMissing > 0 || ledger.excludedByUnparseable > 0;

  return (
    <details className="mt-3 rounded-md border border-stone-200 bg-stone-50">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-stone-600 hover:text-stone-900">
        How this is computed
      </summary>
      <div className="space-y-3 border-t border-stone-200 px-3 py-3 text-xs">
        <p className="font-mono text-[11px] text-stone-600">{trace.formula}</p>

        <div>
          <LedgerRow
            label="Rows in file"
            value={dataset.fileRows}
            detail={`${dataset.usableRows.toLocaleString()} usable + ${dataset.rejectedRows.toLocaleString()} unreadable + ${dataset.blankLines.toLocaleString()} blank lines skipped`}
          />
          <LedgerRow
            label="Kept by filters"
            value={ledger.included}
            detail={`${ledger.usableRows.toLocaleString()} usable = ${ledger.included.toLocaleString()} included + ${ledger.excludedByFilter.toLocaleString()} excluded by filters`}
          />
          {showValueLine && (
            <LedgerRow
              label="Values used"
              value={ledger.valuesUsed}
              detail={`${ledger.included.toLocaleString()} included = ${ledger.valuesUsed.toLocaleString()} used + ${ledger.excludedByMissing.toLocaleString()} blank + ${ledger.excludedByUnparseable.toLocaleString()} unparseable`}
            />
          )}
        </div>

        <p className="text-stone-500">
          Filters:{" "}
          {trace.filterDescriptions.length > 0
            ? trace.filterDescriptions.join(" · ")
            : "none"}
        </p>

        {trace.samples.length > 0 && (
          <div>
            <p className="mb-1 text-stone-500">
              First source rows for this number:
            </p>
            <div className="overflow-hidden rounded border border-stone-200 bg-white">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-500">
                    <th className="px-2 py-1 font-medium">Row</th>
                    <th className="px-2 py-1 font-medium">Raw value</th>
                    <th className="px-2 py-1 font-medium">Counted as</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {trace.samples.map((sample) => (
                    <tr key={sample.rowNumber}>
                      <td className="px-2 py-1 tabular-nums text-stone-500">
                        #{sample.rowNumber}
                      </td>
                      <td className="max-w-[16rem] truncate px-2 py-1 font-mono text-stone-700">
                        {sample.raw}
                      </td>
                      <td className="px-2 py-1 tabular-nums text-stone-700">
                        {sample.parsed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {trace.notes.map((note) => (
          <p
            key={note}
            className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800"
          >
            {note}
          </p>
        ))}

        <p className="text-stone-400">
          {dataset.rejectedRows > 0
            ? `${dataset.rejectedRows.toLocaleString()} unreadable rows stay visible on the dataset profile with their exact reasons.`
            : "No rows were dropped at import for this dataset."}
        </p>
      </div>
    </details>
  );
}

export function BlockCard({
  view,
  controls,
}: {
  view: BlockView;
  controls?: ReactNode;
}) {
  const definition = view.definition;
  const label = definition ? describeBlock(definition) : "Unreadable block";
  const heading = view.title || label;

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-stone-900">
            {heading}
          </h3>
          {view.title && definition && (
            <p className="text-xs text-stone-500">{label}</p>
          )}
        </div>
        {controls && <div className="flex shrink-0 items-center gap-1">{controls}</div>}
      </header>

      {!definition && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          This block&apos;s stored configuration no longer parses. Edit or
          delete it — nothing is guessed in its place.
        </p>
      )}

      {definition?.type === "metric" && view.metric && (
        <div>
          <p className="text-xs text-stone-500">{view.metric.trace.headline}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-900">
            {view.metric.display}
          </p>
          <LedgerPanel trace={view.metric.trace} />
        </div>
      )}

      {definition?.type === "chart" && view.chart && (
        <div>
          {view.chart.points.length === 0 ? (
            <p className="rounded border border-dashed border-stone-300 px-3 py-6 text-center text-sm text-stone-500">
              No rows qualified, so the chart is empty.
            </p>
          ) : (
            <ChartView
              chartKind={definition.chart.chartKind}
              points={view.chart.points}
              xLabel={view.chart.xLabel}
              yLabel={view.chart.yLabel}
            />
          )}
          <LedgerPanel trace={view.chart.trace} />
        </div>
      )}

      {definition?.type === "table" && view.table && (
        <div>
          <div className="overflow-x-auto rounded border border-stone-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="px-3 py-2 font-medium">Row</th>
                  {view.table.columns.map((column) => (
                    <th key={column} className="px-3 py-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {view.table.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={view.table.columns.length + 1}
                      className="px-3 py-4 text-center text-stone-500"
                    >
                      No rows qualified for this table.
                    </td>
                  </tr>
                )}
                {view.table.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-3 py-1.5 tabular-nums text-stone-400">
                      #{row.rowNumber}
                    </td>
                    {row.cells.map((cell, index) => (
                      <td
                        key={view.table!.columns[index]}
                        className="max-w-[16rem] truncate px-3 py-1.5 text-stone-700"
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <LedgerPanel trace={view.table.trace} />
        </div>
      )}

      {definition?.type === "note" && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
          {definition.note.text || "Empty note."}
        </p>
      )}

      {definition &&
        definition.type !== "note" &&
        !view.metric &&
        !view.chart &&
        !view.table && (
          <p className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500">
            This block cannot be computed right now because its dataset is
            gone.
          </p>
        )}
    </section>
  );
}
