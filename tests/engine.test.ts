import { describe, expect, it } from "vitest";
import {
  computeChart,
  computeMetric,
  computeTable,
  type ComputeColumn,
  type ComputeContext,
  type ComputeRow,
} from "@/lib/compute/engine";
import type { FilterCondition } from "@/lib/report-spec";

const columns = new Map<string, ComputeColumn>([
  ["region", { name: "region", guessedType: "category", dateDialect: "day-first" }],
  ["amount", { name: "amount", guessedType: "number", dateDialect: "day-first" }],
  ["order_date", { name: "order_date", guessedType: "date", dateDialect: "day-first" }],
  ["customer", { name: "customer", guessedType: "text", dateDialect: "day-first" }],
]);

const rows: ComputeRow[] = [
  { rowNumber: 1, values: { region: "North", amount: "10", order_date: "2024-01-05", customer: "Ann" } },
  { rowNumber: 2, values: { region: "South", amount: "20.5", order_date: "2024-01-03", customer: "Bob" } },
  { rowNumber: 3, values: { region: "North", amount: "", order_date: "2024-02-01", customer: "Ann" } },
  { rowNumber: 4, values: { region: "East", amount: "N/A", order_date: "2024-01-15", customer: "Cara" } },
  { rowNumber: 5, values: { region: "north", amount: "$30", order_date: "03/02/2024", customer: "ann" } },
];

const dataset = { fileRows: 8, usableRows: 5, rejectedRows: 2, blankLines: 1 };

function ctx(filters: FilterCondition[] = []): ComputeContext {
  return { rows, columns, filters, dataset };
}

describe("computeMetric", () => {
  it("counts rows and fills the ledger", () => {
    const result = computeMetric({ kind: "count" }, ctx());
    expect(result.value).toBe(5);
    expect(result.display).toBe("5");
    expect(result.trace.ledger).toEqual({
      usableRows: 5,
      excludedByFilter: 0,
      excludedByMissing: 0,
      excludedByUnparseable: 0,
      valuesUsed: 5,
      included: 5,
    });
  });

  it("applies equals filters case-insensitively and accounts for exclusions", () => {
    const filters: FilterCondition[] = [
      { column: "region", op: "equals", value: "north" },
    ];
    const result = computeMetric({ kind: "count" }, ctx(filters));
    expect(result.value).toBe(3); // North, North, north
    const l = result.trace.ledger;
    expect(l.excludedByFilter).toBe(2);
    // Invariant: included + excludedByFilter = usableRows.
    expect(l.included + l.excludedByFilter).toBe(l.usableRows);
  });

  it("sums numbers, excluding blanks and unparseable values with counts", () => {
    const result = computeMetric({ kind: "sum", column: "amount" }, ctx());
    expect(result.value).toBe(60.5); // 10 + 20.5 + 30 (its $ stripped)
    const l = result.trace.ledger;
    expect(l.valuesUsed).toBe(3);
    expect(l.excludedByMissing).toBe(1);
    expect(l.excludedByUnparseable).toBe(1);
    // Invariant: included = valuesUsed + missing + unparseable.
    expect(l.valuesUsed + l.excludedByMissing + l.excludedByUnparseable).toBe(
      l.included,
    );
    // File-level ledger rides along for the "where did rows go" panel.
    expect(result.trace.dataset).toEqual(dataset);
    // Samples show the raw value and its parsed form.
    expect(result.trace.samples[0]).toEqual({
      rowNumber: 1,
      raw: "10",
      parsed: "10",
    });
  });

  it("computes mean with a rounded display", () => {
    const result = computeMetric({ kind: "mean", column: "amount" }, ctx());
    expect(result.value).toBeCloseTo(60.5 / 3);
    expect(result.display).toBe("20.17");
  });

  it("computes median for an odd count", () => {
    const result = computeMetric({ kind: "median", column: "amount" }, ctx());
    expect(result.value).toBe(20.5);
    expect(result.trace.formula).toContain("middle value");
  });

  it("computes median for an even count as the mean of the two middles", () => {
    const evenRows: ComputeRow[] = [
      { rowNumber: 1, values: { amount: "1" } },
      { rowNumber: 2, values: { amount: "2" } },
      { rowNumber: 3, values: { amount: "100" } },
      { rowNumber: 4, values: { amount: "4" } },
    ];
    const result = computeMetric(
      { kind: "median", column: "amount" },
      { rows: evenRows, columns, filters: [], dataset },
    );
    expect(result.value).toBe(3); // (2 + 4) / 2
    expect(result.trace.formula).toContain("two middle values");
  });

  it("finds date min/max with the column's dialect", () => {
    const min = computeMetric({ kind: "min", column: "order_date" }, ctx());
    expect(min.value).toBe("2024-01-03");
    const max = computeMetric({ kind: "max", column: "order_date" }, ctx());
    // 03/02/2024 is read day-first => 3 Feb 2024.
    expect(max.value).toBe("2024-02-03");
  });

  it("counts distinct values and reports blanks", () => {
    const result = computeMetric({ kind: "distinctCount", column: "customer" }, ctx());
    // Case-sensitive raw distinctness: Ann, Bob, Cara, ann.
    expect(result.value).toBe(4);
    expect(result.trace.ledger.excludedByMissing).toBe(0);
  });

  it("filters numbers by inclusive range", () => {
    const filters: FilterCondition[] = [
      { column: "amount", op: "numberBetween", min: 15, max: 100 },
    ];
    const result = computeMetric({ kind: "count" }, ctx(filters));
    expect(result.value).toBe(2); // 20.5 and $30
  });

  it("filters dates by inclusive range", () => {
    const filters: FilterCondition[] = [
      { column: "order_date", op: "dateBetween", min: "2024-01-01", max: "2024-01-31" },
    ];
    const result = computeMetric({ kind: "count" }, ctx(filters));
    expect(result.value).toBe(3); // three January rows
  });

  it("returns null with an explanation when nothing qualifies", () => {
    const filters: FilterCondition[] = [
      { column: "region", op: "equals", value: "Nowhere" },
    ];
    const result = computeMetric({ kind: "sum", column: "amount" }, ctx(filters));
    expect(result.value).toBeNull();
    expect(result.display).toBe("—");
  });
});

describe("computeChart", () => {
  it("bars count rows per group, sorted by value desc", () => {
    const result = computeChart(
      { chartKind: "bar", groupBy: "region", metric: { kind: "count" }, topN: 10 },
      ctx(),
    );
    expect(result.points[0]).toEqual({ label: "North", value: 2, rows: 2 });
    expect(result.points).toHaveLength(4);
    expect(result.trace.notes).toEqual([]);
  });

  it("notes omitted groups instead of silently dropping them", () => {
    const manyRows: ComputeRow[] = Array.from({ length: 12 }, (_, i) => ({
      rowNumber: i + 1,
      values: { region: `Region ${String(i + 1).padStart(2, "0")}` },
    }));
    const result = computeChart(
      { chartKind: "bar", groupBy: "region", metric: { kind: "count" }, topN: 3 },
      { rows: manyRows, columns, filters: [], dataset },
    );
    expect(result.points).toHaveLength(3);
    expect(result.trace.notes.join(" ")).toContain("9 smaller groups not shown");
  });

  it("lines up date buckets in date order", () => {
    const result = computeChart(
      { chartKind: "line", groupBy: "order_date", metric: { kind: "count" }, topN: 10 },
      ctx(),
    );
    expect(result.points.map((p) => p.label)).toEqual([
      "2024-01-03",
      "2024-01-05",
      "2024-01-15",
      "2024-02-01",
      "2024-02-03",
    ]);
  });

  it("sums a numeric column per group and excludes an empty group with a note", () => {
    const result = computeChart(
      { chartKind: "bar", groupBy: "region", metric: { kind: "sum", column: "amount" }, topN: 10 },
      ctx(),
    );
    expect(result.points).toEqual([
      { label: "north", value: 30, rows: 1 },
      { label: "South", value: 20.5, rows: 1 },
      { label: "North", value: 10, rows: 2 },
    ]);
    expect(result.trace.notes.join(" ")).toContain("no usable values");
    const l = result.trace.ledger;
    expect(l.valuesUsed + l.excludedByMissing + l.excludedByUnparseable).toBe(
      l.included,
    );
  });

  it("puts blank group keys in an explicit (blank) bucket", () => {
    const blankRows: ComputeRow[] = [
      { rowNumber: 1, values: { region: "" } },
      { rowNumber: 2, values: { region: "" } },
      { rowNumber: 3, values: { region: "North" } },
    ];
    const result = computeChart(
      { chartKind: "bar", groupBy: "region", metric: { kind: "count" }, topN: 10 },
      { rows: blankRows, columns, filters: [], dataset },
    );
    expect(result.points[0]).toEqual({ label: "(blank)", value: 2, rows: 2 });
  });
});

describe("computeTable", () => {
  it("shows the first N filtered rows and notes the truncation", () => {
    const result = computeTable({ columns: ["region", "amount"], limit: 2 }, ctx());
    expect(result.rows).toEqual([
      { rowNumber: 1, cells: ["North", "10"] },
      { rowNumber: 2, cells: ["South", "20.5"] },
    ]);
    expect(result.trace.notes.join(" ")).toContain("first 2 of 5 rows");
  });

  it("respects report filters", () => {
    const filters: FilterCondition[] = [
      { column: "region", op: "equals", value: "north" },
    ];
    const result = computeTable(
      { columns: ["region"], limit: 10 },
      ctx(filters),
    );
    expect(result.rows.map((r) => r.cells[0])).toEqual(["North", "North", "north"]);
  });
});
