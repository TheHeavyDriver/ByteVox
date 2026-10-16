"use client";

import {
  useActionState,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  addBlockAction,
  addFilterAction,
  createShareLinkAction,
  deleteBlockAction,
  deleteReportAction,
  moveBlockAction,
  revokeShareLinkAction,
  updateBlockAction,
} from "@/lib/report-actions";
import type { BlockDefinition, ChartMetric } from "@/lib/report-spec";

export type EditorColumn = { name: string; guessedType: string };

const controlButton =
  "rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40";
const primaryButton =
  "rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-60";
const inputClass =
  "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500";
const labelClass = "block text-xs font-medium text-stone-600";
const errorClass =
  "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800";

export function AddFilterForm({
  reportId,
  columns,
}: {
  reportId: string;
  columns: EditorColumn[];
}) {
  const [state, formAction, pending] = useActionState(addFilterAction, {
    error: null,
  });
  const [column, setColumn] = useState(columns[0]?.name ?? "");
  const [op, setOp] = useState("contains");
  const id = useId();

  const columnType = columns.find((c) => c.name === column)?.guessedType ?? "text";
  const hasNumberRange = columnType === "number";
  const hasDateRange = columnType === "date";

  function changeColumn(next: string) {
    setColumn(next);
    const nextType = columns.find((c) => c.name === next)?.guessedType ?? "text";
    if (op === "numberBetween" && nextType !== "number") setOp("contains");
    if (op === "dateBetween" && nextType !== "date") setOp("contains");
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reportId" value={reportId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-column`} className={labelClass}>
            Column
          </label>
          <select
            id={`${id}-column`}
            name="column"
            value={column}
            onChange={(event) => changeColumn(event.target.value)}
            className={`${inputClass} mt-1 w-full`}
          >
            {columns.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name} ({option.guessedType})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-op`} className={labelClass}>
            Condition
          </label>
          <select
            id={`${id}-op`}
            name="op"
            value={op}
            onChange={(event) => setOp(event.target.value)}
            className={`${inputClass} mt-1 w-full`}
          >
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="isBlank">is blank</option>
            <option value="notBlank">is not blank</option>
            {hasNumberRange && <option value="numberBetween">number between</option>}
            {hasDateRange && <option value="dateBetween">date between</option>}
          </select>
        </div>
        <div>
          {(op === "contains" || op === "equals") && (
            <>
              <label htmlFor={`${id}-value`} className={labelClass}>
                {op === "contains" ? "Contains text" : "Equals value"}
              </label>
              <input
                id={`${id}-value`}
                name="value"
                required
                placeholder={op === "contains" ? "e.g. North" : "e.g. shipped"}
                className={`${inputClass} mt-1 w-full`}
              />
            </>
          )}
          {(op === "numberBetween" || op === "dateBetween") && (
            <>
              <span className={labelClass}>
                {op === "numberBetween" ? "Range (inclusive)" : "Range (inclusive)"}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  name="min"
                  type={op === "numberBetween" ? "number" : "date"}
                  step="any"
                  placeholder="min"
                  aria-label="Minimum"
                  className={`${inputClass} w-full`}
                />
                <input
                  name="max"
                  type={op === "numberBetween" ? "number" : "date"}
                  step="any"
                  placeholder="max"
                  aria-label="Maximum"
                  className={`${inputClass} w-full`}
                />
              </div>
            </>
          )}
          {(op === "isBlank" || op === "notBlank") && (
            <p className="pt-6 text-xs text-stone-500">
              Rows are selected on whether the cell has any value at all.
            </p>
          )}
        </div>
      </div>
      {state.error && <p className={errorClass}>{state.error}</p>}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Adding…" : "Add filter"}
      </button>
    </form>
  );
}

type MetricKind = "count" | "distinctCount" | "sum" | "mean" | "median" | "min" | "max";

function metricKindOf(definition: BlockDefinition | null): MetricKind {
  return definition?.type === "metric" ? definition.metric.kind : "count";
}

function metricColumnOf(definition: BlockDefinition | null): string {
  if (definition?.type === "metric" && definition.metric.kind !== "count") {
    return definition.metric.column;
  }
  return "";
}

function chartMetricOf(definition: BlockDefinition | null): ChartMetric {
  return definition?.type === "chart"
    ? definition.chart.metric
    : { kind: "count" };
}

export function BlockEditor({
  mode,
  reportId,
  blockId,
  type,
  title,
  definition,
  columns,
}: {
  mode: "add" | "edit";
  reportId: string;
  blockId?: string;
  type: "metric" | "chart" | "table" | "note";
  title: string;
  definition: BlockDefinition | null;
  columns: EditorColumn[];
}) {
  const action = mode === "add" ? addBlockAction : updateBlockAction;
  const [state, formAction, pending] = useActionState(action, { error: null });
  const id = useId();

  const numericColumns = columns.filter((c) => c.guessedType === "number");

  // metric block state
  const [metricKind, setMetricKind] = useState<MetricKind>(metricKindOf(definition));
  const [metricColumn, setMetricColumn] = useState<string>(
    metricColumnOf(definition) || numericColumns[0]?.name || columns[0]?.name || "",
  );

  // chart block state
  const [chartKind, setChartKind] = useState<"bar" | "line">(
    definition?.type === "chart" ? definition.chart.chartKind : "bar",
  );
  const [groupBy, setGroupBy] = useState<string>(
    definition?.type === "chart"
      ? definition.chart.groupBy
      : columns[0]?.name ?? "",
  );
  const initialChartMetric = chartMetricOf(definition);
  const [chartMetricKind, setChartMetricKind] = useState<"count" | "sum" | "mean">(
    initialChartMetric.kind,
  );
  const [chartMetricColumn, setChartMetricColumn] = useState<string>(
    initialChartMetric.kind !== "count" ? initialChartMetric.column : numericColumns[0]?.name ?? "",
  );

  const metricColumnChoices =
    metricKind === "sum" || metricKind === "mean" || metricKind === "median"
      ? numericColumns
      : metricKind === "min" || metricKind === "max"
        ? columns.filter((c) => c.guessedType === "number" || c.guessedType === "date")
        : columns;

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-stone-300 bg-stone-50 p-4"
    >
      <input type="hidden" name="reportId" value={reportId} />
      {blockId && <input type="hidden" name="blockId" value={blockId} />}
      <input type="hidden" name="type" value={type} />

      <div>
        <label htmlFor={`${id}-title`} className={labelClass}>
          Block title (optional)
        </label>
        <input
          id={`${id}-title`}
          name="title"
          defaultValue={title}
          maxLength={120}
          placeholder={type === "metric" ? "e.g. Total revenue" : "e.g. Revenue by region"}
          className={`${inputClass} mt-1 w-full sm:w-96`}
        />
      </div>

      {type === "metric" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-kind`} className={labelClass}>
                Metric
              </label>
              <select
                id={`${id}-kind`}
                name="metricKind"
                value={metricKind}
                onChange={(event) => setMetricKind(event.target.value as MetricKind)}
                className={`${inputClass} mt-1 w-full`}
              >
                <option value="count">Row count</option>
                <option value="distinctCount">Distinct values of a column</option>
                <option value="sum">Sum of a column</option>
                <option value="mean">Mean of a column</option>
                <option value="median">Median of a column</option>
                <option value="min">Minimum of a column</option>
                <option value="max">Maximum of a column</option>
              </select>
            </div>
            {metricKind !== "count" && (
              <div>
                <label htmlFor={`${id}-column`} className={labelClass}>
                  Column
                </label>
                <select
                  id={`${id}-column`}
                  name="metricColumn"
                  value={metricColumn}
                  onChange={(event) => setMetricColumn(event.target.value)}
                  className={`${inputClass} mt-1 w-full`}
                >
                  {metricColumnChoices.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name} ({option.guessedType})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-stone-500">
            Blank and unreadable cells are excluded from the result and counted
            in the explanation panel — never silently dropped.
          </p>
        </>
      )}

      {type === "chart" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-chartkind`} className={labelClass}>
                Chart type
              </label>
              <select
                id={`${id}-chartkind`}
                name="chartKind"
                value={chartKind}
                onChange={(event) =>
                  setChartKind(event.target.value as "bar" | "line")
                }
                className={`${inputClass} mt-1 w-full`}
              >
                <option value="bar">Bar — top groups by value</option>
                <option value="line">Line — trend over values or time</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-groupby`} className={labelClass}>
                Group by
              </label>
              <select
                id={`${id}-groupby`}
                name="groupBy"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value)}
                className={`${inputClass} mt-1 w-full`}
              >
                {columns.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name} ({option.guessedType})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-chartmetric`} className={labelClass}>
                Value
              </label>
              <select
                id={`${id}-chartmetric`}
                name="chartMetricKind"
                value={chartMetricKind}
                onChange={(event) =>
                  setChartMetricKind(event.target.value as "count" | "sum" | "mean")
                }
                className={`${inputClass} mt-1 w-full`}
              >
                <option value="count">Row count</option>
                <option value="sum">Sum of a column</option>
                <option value="mean">Mean of a column</option>
              </select>
            </div>
            {chartMetricKind !== "count" && (
              <div>
                <label htmlFor={`${id}-chartcolumn`} className={labelClass}>
                  Value column
                </label>
                <select
                  id={`${id}-chartcolumn`}
                  name="chartMetricColumn"
                  value={chartMetricColumn}
                  onChange={(event) => setChartMetricColumn(event.target.value)}
                  className={`${inputClass} mt-1 w-full`}
                >
                  {numericColumns.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor={`${id}-topn`} className={labelClass}>
                Max groups shown
              </label>
              <input
                id={`${id}-topn`}
                name="topN"
                type="number"
                min={3}
                max={50}
                defaultValue={definition?.type === "chart" ? definition.chart.topN : 10}
                className={`${inputClass} mt-1 w-full`}
              />
            </div>
          </div>
          <p className="text-xs text-stone-500">
            Date columns group by day and line charts keep every day. Other
            groupings show the top groups and say exactly how much was left out.
          </p>
        </>
      )}

      {type === "table" && (
        <>
          <fieldset>
            <legend className={labelClass}>Columns shown (up to 12)</legend>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {columns.map((option) => (
                <label
                  key={option.name}
                  className="flex items-center gap-2 text-sm text-stone-700"
                >
                  <input
                    type="checkbox"
                    name="tableColumns"
                    value={option.name}
                    defaultChecked={
                      definition?.type === "table"
                        ? definition.table.columns.includes(option.name)
                        : false
                    }
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  {option.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:w-48">
            <label htmlFor={`${id}-limit`} className={labelClass}>
              Rows shown
            </label>
            <input
              id={`${id}-limit`}
              name="tableLimit"
              type="number"
              min={1}
              max={100}
              defaultValue={definition?.type === "table" ? definition.table.limit : 10}
              className={`${inputClass} mt-1 w-full`}
            />
          </div>
        </>
      )}

      {type === "note" && (
        <div>
          <label htmlFor={`${id}-note`} className={labelClass}>
            Note text
          </label>
          <textarea
            id={`${id}-note`}
            name="noteText"
            rows={4}
            defaultValue={definition?.type === "note" ? definition.note.text : ""}
            placeholder="Context a reader needs: caveats, definitions, next steps…"
            className={`${inputClass} mt-1 w-full`}
          />
        </div>
      )}

      {state.error && <p className={errorClass}>{state.error}</p>}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending
          ? "Saving…"
          : mode === "add"
            ? "Add block"
            : "Save block"}
      </button>
    </form>
  );
}

export function BlockFrame({
  reportId,
  blockId,
  index,
  total,
  type,
  title,
  definition,
  columns,
  children,
}: {
  reportId: string;
  blockId: string;
  index: number;
  total: number;
  type: "metric" | "chart" | "table" | "note";
  title: string;
  definition: BlockDefinition | null;
  columns: EditorColumn[];
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div className="mb-1 flex items-center justify-end gap-1">
        <form action={moveBlockAction}>
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="blockId" value={blockId} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            disabled={index === 0}
            className={controlButton}
            aria-label="Move block up"
            title="Move up"
          >
            ↑
          </button>
        </form>
        <form action={moveBlockAction}>
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="blockId" value={blockId} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            disabled={index === total - 1}
            className={controlButton}
            aria-label="Move block down"
            title="Move down"
          >
            ↓
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className={controlButton}
        >
          {editing ? "Close editor" : "Edit"}
        </button>
        <form
          action={deleteBlockAction}
          onSubmit={(event) => {
            if (!window.confirm("Delete this block? The revision log keeps the record of it.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="blockId" value={blockId} />
          <button type="submit" className={controlButton}>
            Delete
          </button>
        </form>
      </div>

      {children}

      {editing && (
        <div className="mt-2">
          <BlockEditor
            mode="edit"
            reportId={reportId}
            blockId={blockId}
            type={type}
            title={title}
            definition={definition}
            columns={columns}
          />
        </div>
      )}
    </div>
  );
}

const BLOCK_TYPES = [
  { type: "metric", label: "Metric" },
  { type: "chart", label: "Chart" },
  { type: "table", label: "Table" },
  { type: "note", label: "Note" },
] as const;

export function AddBlockPanel({
  reportId,
  columns,
}: {
  reportId: string;
  columns: EditorColumn[];
}) {
  const [type, setType] = useState<"metric" | "chart" | "table" | "note">("metric");

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-stone-300 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-stone-700">Add a block:</span>
        {BLOCK_TYPES.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => setType(option.type)}
            className={
              type === option.type
                ? "rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
                : controlButton
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <BlockEditor
        key={type}
        mode="add"
        reportId={reportId}
        type={type}
        title=""
        definition={null}
        columns={columns}
      />
    </div>
  );
}

export function DeleteReportForm({ reportId }: { reportId: string }) {
  return (
    <form
      action={deleteReportAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this report? Its blocks, revisions, and share links are removed. This cannot be undone.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="reportId" value={reportId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50"
      >
        Delete report
      </button>
    </form>
  );
}

export function ShareLinkCreator({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState(createShareLinkAction, {
    url: null,
    error: null,
  });
  const [copied, setCopied] = useState(false);
  const id = useId();

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="reportId" value={reportId} />
        <div>
          <label htmlFor={`${id}-days`} className={labelClass}>
            Link stays active for
          </label>
          <select
            id={`${id}-days`}
            name="days"
            defaultValue="7"
            className={`${inputClass} mt-1`}
          >
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Creating…" : "Create share link"}
        </button>
      </form>

      {state.error && <p className={errorClass}>{state.error}</p>}

      {state.url && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-900">
            Shareable link — shown once. Only its hash is stored, so copy it
            now.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={state.url}
              aria-label="Shareable link"
              className={`${inputClass} w-full font-mono text-xs`}
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.url ?? "");
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className={controlButton}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            Anyone with this link can view the report read-only. Revoke it any
            time below.
          </p>
        </div>
      )}
    </div>
  );
}

export function RevokeLinkForm({
  reportId,
  linkId,
}: {
  reportId: string;
  linkId: string;
}) {
  return (
    <form
      action={revokeShareLinkAction}
      onSubmit={(event) => {
        if (!window.confirm("Revoke this link? Viewers will lose access immediately.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="linkId" value={linkId} />
      <button type="submit" className={controlButton}>
        Revoke
      </button>
    </form>
  );
}
