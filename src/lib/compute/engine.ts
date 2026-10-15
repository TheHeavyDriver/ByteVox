import type { ColumnType } from "@/lib/csv/infer";
import {
  isBlank,
  parseDateWithDialect,
  toIsoDateString,
  tryParseNumber,
  type DateDialect,
} from "@/lib/csv/value-parsers";
import {
  describeChartMetric,
  describeFilter,
  describeMetric,
  type ChartSpec,
  type FilterCondition,
  type MetricSpec,
  type TableSpec,
} from "@/lib/report-spec";

/**
 * The compute engine. Pure functions over already-loaded rows, so every
 * number a report shows can be recomputed from the same inputs and every
 * result carries the ledger that explains it:
 *
 *   usableRows = included + excludedByFilter
 *   included   = valuesUsed + excludedByMissing + excludedByUnparseable
 *
 * Values are parsed with the exact helpers used at import time, so "9.5 is a
 * number here" stays true from the profile page to the shared report.
 */

export type ComputeRow = { rowNumber: number; values: Record<string, string> };

export type ComputeColumn = {
  name: string;
  guessedType: ColumnType;
  dateDialect: DateDialect;
};

export type DatasetLedger = {
  fileRows: number;
  usableRows: number;
  rejectedRows: number;
  blankLines: number;
};

export type ValueLedger = {
  usableRows: number;
  excludedByFilter: number;
  /** Rows that passed the filter but had a blank value for the column. */
  excludedByMissing: number;
  /** Rows with a non-blank value that still failed to parse (e.g. "N/A"). */
  excludedByUnparseable: number;
  /** Rows that contributed exactly one value to the result. */
  valuesUsed: number;
  included: number;
};

export type TraceSample = { rowNumber: number; raw: string; parsed: string };

export type MetricTrace = {
  headline: string;
  formula: string;
  filterDescriptions: string[];
  ledger: ValueLedger;
  dataset: DatasetLedger;
  samples: TraceSample[];
  notes: string[];
};

export type MetricResult = {
  value: number | string | null;
  display: string;
  trace: MetricTrace;
};

export type ChartPoint = {
  label: string;
  value: number;
  /** Rows in this group that passed the filter. */
  rows: number;
};

export type ChartResult = {
  points: ChartPoint[];
  xLabel: string;
  yLabel: string;
  trace: MetricTrace;
};

export type TableResult = {
  columns: string[];
  rows: Array<{ rowNumber: number; cells: string[] }>;
  trace: MetricTrace;
};

export type ComputeContext = {
  rows: ComputeRow[];
  columns: Map<string, ComputeColumn>;
  filters: FilterCondition[];
  dataset: DatasetLedger;
};

const SAMPLE_LIMIT = 5;
const GROUP_LIMIT_FOR_LINE = 60;

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function matchesCondition(
  raw: string,
  condition: FilterCondition,
  column: ComputeColumn | undefined,
): boolean {
  switch (condition.op) {
    case "contains":
      return raw.toLowerCase().includes(condition.value.toLowerCase());
    case "equals":
      return raw.trim().toLowerCase() === condition.value.toLowerCase();
    case "isBlank":
      return isBlank(raw);
    case "notBlank":
      return !isBlank(raw);
    case "numberBetween": {
      const parsed = tryParseNumber(raw);
      if (!parsed) return false;
      if (condition.min !== null && parsed.value < condition.min) return false;
      if (condition.max !== null && parsed.value > condition.max) return false;
      return true;
    }
    case "dateBetween": {
      const dialect = column?.dateDialect ?? "day-first";
      const parsed = parseDateWithDialect(raw, dialect);
      if (!parsed) return false;
      if (condition.min) {
        const min = parseDateWithDialect(condition.min, dialect);
        if (!min || parsed < min) return false;
      }
      if (condition.max) {
        const max = parseDateWithDialect(condition.max, dialect);
        if (!max || parsed > max) return false;
      }
      return true;
    }
  }
}

export function rowMatchesFilter(
  row: ComputeRow,
  filters: FilterCondition[],
  columns: Map<string, ComputeColumn>,
): boolean {
  for (const condition of filters) {
    const raw = row.values[condition.column] ?? "";
    if (!matchesCondition(raw, condition, columns.get(condition.column))) {
      return false;
    }
  }
  return true;
}

function partitionByFilter(ctx: ComputeContext): {
  includedRows: ComputeRow[];
  excludedByFilter: number;
} {
  const includedRows: ComputeRow[] = [];
  let excludedByFilter = 0;
  for (const row of ctx.rows) {
    if (rowMatchesFilter(row, ctx.filters, ctx.columns)) {
      includedRows.push(row);
    } else {
      excludedByFilter += 1;
    }
  }
  return { includedRows, excludedByFilter };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatMetricValue(value: number | string | null): string {
  if (value === null) return "—";
  return typeof value === "number" ? formatNumber(value) : value;
}

// ---------------------------------------------------------------------------
// Metric blocks
// ---------------------------------------------------------------------------

export function computeMetric(spec: MetricSpec, ctx: ComputeContext): MetricResult {
  const { includedRows, excludedByFilter } = partitionByFilter(ctx);
  const filterDescriptions = ctx.filters.map(describeFilter);
  const included = includedRows.length;

  const ledger: ValueLedger = {
    usableRows: ctx.rows.length,
    excludedByFilter,
    excludedByMissing: 0,
    excludedByUnparseable: 0,
    valuesUsed: 0,
    included,
  };
  const samples: TraceSample[] = [];
  const notes: string[] = [];

  let value: number | string | null = null;
  let formula = "";

  if (spec.kind === "count") {
    value = included;
    ledger.valuesUsed = included;
    formula = `count of rows after ${filterDescriptions.length} filter${filterDescriptions.length === 1 ? "" : "s"}`;
    for (const row of includedRows.slice(0, SAMPLE_LIMIT)) {
      samples.push({ rowNumber: row.rowNumber, raw: "(row counted)", parsed: "1" });
    }
  } else if (spec.kind === "distinctCount") {
    const seen = new Map<string, number>();
    for (const row of includedRows) {
      const raw = row.values[spec.column] ?? "";
      if (isBlank(raw)) {
        ledger.excludedByMissing += 1;
        continue;
      }
      ledger.valuesUsed += 1;
      const key = raw.trim();
      if (!seen.has(key) && samples.length < SAMPLE_LIMIT) {
        seen.set(key, row.rowNumber);
        samples.push({ rowNumber: row.rowNumber, raw, parsed: "(counted once)" });
      } else if (!seen.has(key)) {
        seen.set(key, row.rowNumber);
      }
    }
    value = seen.size;
    if (ledger.excludedByMissing > 0) {
      notes.push(
        `${ledger.excludedByMissing} blank value${ledger.excludedByMissing === 1 ? "" : "s"} had nothing to distinguish.`,
      );
    }
    formula = `distinct (trimmed) values of ${spec.column} across ${ledger.valuesUsed} non-blank rows`;
  } else {
    // sum / mean / median / min / max
    const column = ctx.columns.get(spec.column);
    const useDates =
      (spec.kind === "min" || spec.kind === "max") &&
      column?.guessedType === "date";

    const numbers: number[] = [];
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const row of includedRows) {
      const raw = row.values[spec.column] ?? "";
      if (isBlank(raw)) {
        ledger.excludedByMissing += 1;
        continue;
      }
      if (useDates) {
        const parsed = parseDateWithDialect(raw, column?.dateDialect ?? "day-first");
        if (!parsed) {
          ledger.excludedByUnparseable += 1;
          continue;
        }
        ledger.valuesUsed += 1;
        if (!minDate || parsed < minDate) minDate = parsed;
        if (!maxDate || parsed > maxDate) maxDate = parsed;
        if (samples.length < SAMPLE_LIMIT) {
          samples.push({ rowNumber: row.rowNumber, raw, parsed: toIsoDateString(parsed) });
        }
        continue;
      }
      const parsed = tryParseNumber(raw);
      if (!parsed) {
        ledger.excludedByUnparseable += 1;
        continue;
      }
      ledger.valuesUsed += 1;
      numbers.push(parsed.value);
      if (samples.length < SAMPLE_LIMIT) {
        samples.push({ rowNumber: row.rowNumber, raw, parsed: formatNumber(parsed.value) });
      }
    }

    if (ledger.excludedByUnparseable > 0) {
      notes.push(
        `${ledger.excludedByUnparseable} non-blank value${ledger.excludedByUnparseable === 1 ? "" : "s"} could not be read as ${useDates ? "a date" : "a number"} (for example "N/A") and stayed out of the result.`,
      );
    }
    if (ledger.excludedByMissing > 0) {
      notes.push(
        `${ledger.excludedByMissing} blank value${ledger.excludedByMissing === 1 ? "" : "s"} stayed out of the result.`,
      );
    }

    if (useDates) {
      const result = spec.kind === "min" ? minDate : maxDate;
      value = result ? toIsoDateString(result) : null;
      formula = `${spec.kind === "min" ? "earliest" : "latest"} of ${ledger.valuesUsed} parsed dates in ${spec.column}`;
    } else if (numbers.length === 0) {
      value = null;
      formula = `no usable values in ${spec.column} (${ledger.valuesUsed} parsed)`;
    } else if (spec.kind === "sum") {
      value = numbers.reduce((total, n) => total + n, 0);
      formula = `sum(${spec.column}) over ${ledger.valuesUsed} parsed values`;
    } else if (spec.kind === "mean") {
      const total = numbers.reduce((sum, n) => sum + n, 0);
      value = total / numbers.length;
      formula = `sum(${spec.column}) ÷ ${ledger.valuesUsed} parsed values`;
    } else if (spec.kind === "median") {
      const sorted = [...numbers].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 1) {
        value = sorted[mid]!;
        formula = `middle value of ${ledger.valuesUsed} parsed values, sorted`;
      } else {
        value = (sorted[mid - 1]! + sorted[mid]!) / 2;
        formula = `mean of the two middle values of ${ledger.valuesUsed} parsed values, sorted`;
      }
    } else if (spec.kind === "min") {
      value = Math.min(...numbers);
      formula = `smallest of ${ledger.valuesUsed} parsed values`;
    } else {
      value = Math.max(...numbers);
      formula = `largest of ${ledger.valuesUsed} parsed values`;
    }
  }

  return {
    value,
    display: formatMetricValue(value),
    trace: {
      headline: describeMetric(spec),
      formula,
      filterDescriptions,
      ledger,
      dataset: ctx.dataset,
      samples,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// Chart blocks
// ---------------------------------------------------------------------------

function groupKeyFor(
  row: ComputeRow,
  column: ComputeColumn | undefined,
): { label: string; sortValue: string } {
  const raw = column ? row.values[column.name] ?? "" : "";
  if (isBlank(raw)) return { label: "(blank)", sortValue: "\uffff(blank)" };
  if (column?.guessedType === "date") {
    const parsed = parseDateWithDialect(raw, column.dateDialect);
    if (!parsed) return { label: "(unparseable date)", sortValue: "\uffff(unparseable)" };
    const iso = toIsoDateString(parsed);
    return { label: iso, sortValue: iso };
  }
  const trimmed = raw.trim();
  return { label: trimmed, sortValue: trimmed };
}

export function computeChart(spec: ChartSpec, ctx: ComputeContext): ChartResult {
  const { includedRows, excludedByFilter } = partitionByFilter(ctx);
  const filterDescriptions = ctx.filters.map(describeFilter);
  const groupColumn = ctx.columns.get(spec.groupBy);

  const groups = new Map<
    string,
    { label: string; sortValue: string; sum: number; parsedCount: number; rows: number }
  >();

  const ledger: ValueLedger = {
    usableRows: ctx.rows.length,
    excludedByFilter,
    excludedByMissing: 0,
    excludedByUnparseable: 0,
    valuesUsed: 0,
    included: includedRows.length,
  };

  for (const row of includedRows) {
    const key = groupKeyFor(row, groupColumn);
    let group = groups.get(key.label);
    if (!group) {
      group = { label: key.label, sortValue: key.sortValue, sum: 0, parsedCount: 0, rows: 0 };
      groups.set(key.label, group);
    }
    group.rows += 1;

    if (spec.metric.kind === "count") {
      group.parsedCount += 1;
      ledger.valuesUsed += 1;
      continue;
    }
    const raw = row.values[spec.metric.column] ?? "";
    if (isBlank(raw)) {
      ledger.excludedByMissing += 1;
      continue;
    }
    const parsed = tryParseNumber(raw);
    if (!parsed) {
      ledger.excludedByUnparseable += 1;
      continue;
    }
    group.sum += parsed.value;
    group.parsedCount += 1;
    ledger.valuesUsed += 1;
  }

  const notes: string[] = [];
  if (ledger.excludedByUnparseable > 0) {
    notes.push(
      `${ledger.excludedByUnparseable} value${ledger.excludedByUnparseable === 1 ? "" : "s"} could not be read as a number and stayed out of the ${describeChartMetric(spec.metric)}.`,
    );
  }
  if (ledger.excludedByMissing > 0) {
    notes.push(
      `${ledger.excludedByMissing} blank value${ledger.excludedByMissing === 1 ? "" : "s"} stayed out of the ${describeChartMetric(spec.metric)}.`,
    );
  }

  const pointValue = (group: { sum: number; parsedCount: number }): number | null => {
    if (spec.metric.kind === "count") return group.parsedCount;
    if (group.parsedCount === 0) return null;
    return spec.metric.kind === "mean" ? group.sum / group.parsedCount : group.sum;
  };

  const viable = [...groups.values()].filter(
    (group) => pointValue(group) !== null,
  );
  const emptyGroups = groups.size - viable.length;
  if (emptyGroups > 0) {
    notes.push(
      `${emptyGroups} group${emptyGroups === 1 ? "" : "s"} had no usable values and ${emptyGroups === 1 ? "is" : "are"} not plotted.`,
    );
  }

  let points: ChartPoint[];

  if (spec.chartKind === "line" && groupColumn?.guessedType === "date") {
    // A time series keeps every day bucket, in date order.
    points = viable
      .sort((a, b) => a.sortValue.localeCompare(b.sortValue))
      .map((group) => ({
        label: group.label,
        value: pointValue(group) ?? 0,
        rows: group.rows,
      }));
  } else {
    // Bar charts (and category line charts) show the top N groups by value.
    const sorted = [...viable].sort(
      (a, b) => (pointValue(b) ?? 0) - (pointValue(a) ?? 0),
    );
    const kept = sorted.slice(0, spec.topN);
    const omitted = sorted.slice(spec.topN);
    if (omitted.length > 0) {
      const omittedSum = omitted.reduce(
        (total, group) => total + (pointValue(group) ?? 0),
        0,
      );
      notes.push(
        `${omitted.length} smaller group${omitted.length === 1 ? "" : "s"} not shown (${formatNumber(omittedSum)} total across ${omitted.reduce((t, g) => t + g.rows, 0)} rows). Increase the top-N to include them.`,
      );
    }
    if (spec.chartKind === "line") {
      kept.sort((a, b) => a.sortValue.localeCompare(b.sortValue));
    }
    points = kept.map((group) => ({
      label: group.label,
      value: pointValue(group) ?? 0,
      rows: group.rows,
    }));
  }

  if (spec.chartKind === "line" && groupColumn?.guessedType !== "date" && points.length > GROUP_LIMIT_FOR_LINE) {
    // Defensive cap: category line charts stay readable.
    const dropped = points.slice(GROUP_LIMIT_FOR_LINE);
    points = points.slice(0, GROUP_LIMIT_FOR_LINE);
    notes.push(
      `${dropped.length} further groups beyond the first ${GROUP_LIMIT_FOR_LINE} are not plotted.`,
    );
  }

  return {
    points,
    xLabel: spec.groupBy,
    yLabel: describeChartMetric(spec.metric),
    trace: {
      headline: `${spec.chartKind === "bar" ? "Bar" : "Line"} chart: ${describeChartMetric(spec.metric)} by ${spec.groupBy}`,
      formula: `${describeChartMetric(spec.metric)} per ${groupColumn?.guessedType === "date" ? "day" : "group"} over ${ledger.included} rows that passed the filter`,
      filterDescriptions,
      ledger,
      dataset: ctx.dataset,
      samples: [],
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// Table blocks
// ---------------------------------------------------------------------------

export function computeTable(spec: TableSpec, ctx: ComputeContext): TableResult {
  const { includedRows, excludedByFilter } = partitionByFilter(ctx);
  const filterDescriptions = ctx.filters.map(describeFilter);
  const shown = includedRows.slice(0, spec.limit);

  const notes: string[] = [];
  if (includedRows.length > shown.length) {
    notes.push(
      `Showing the first ${shown.length} of ${includedRows.length} rows that passed the filter.`,
    );
  }

  return {
    columns: spec.columns,
    rows: shown.map((row) => ({
      rowNumber: row.rowNumber,
      cells: spec.columns.map((column) => row.values[column] ?? ""),
    })),
    trace: {
      headline: `Table: ${spec.columns.join(", ")}`,
      formula: `raw values from rows that passed the filter, in file order`,
      filterDescriptions,
      ledger: {
        usableRows: ctx.rows.length,
        excludedByFilter,
        excludedByMissing: 0,
        excludedByUnparseable: 0,
        valuesUsed: shown.length,
        included: includedRows.length,
      },
      dataset: ctx.dataset,
      samples: [],
      notes,
    },
  };
}
