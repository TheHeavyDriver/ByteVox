import { describe, expect, it } from "vitest";
import {
  buildReportSnapshot,
  diffSnapshots,
  parseSnapshot,
  type ReportSnapshot,
} from "@/lib/report-diff";

const METRIC = JSON.stringify({ type: "metric", metric: { kind: "count" } });

function snapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    title: "Report",
    description: "",
    filters: [],
    blocks: [],
    ...overrides,
  };
}

describe("buildReportSnapshot", () => {
  it("labels filters, titled blocks, notes, and unreadable blocks", () => {
    const built = buildReportSnapshot({
      title: "R",
      description: "",
      filterJson: JSON.stringify([
        { column: "region", op: "equals", value: "North" },
      ]),
      blocks: [
        { id: "b1", type: "metric", title: "Orders", specJson: METRIC },
        {
          id: "b2",
          type: "note",
          title: "",
          specJson: JSON.stringify({
            type: "note",
            note: { text: "Context for readers" },
          }),
        },
        { id: "b3", type: "metric", title: "", specJson: "{broken" },
      ],
    });

    expect(built.filters).toEqual(["region equals “North”"]);
    expect(built.blocks[0]!.label).toBe("Orders — Row count");
    expect(built.blocks[1]!.label).toBe("Note: Context for readers");
    expect(built.blocks[2]!.label).toBe("(unreadable block)");
  });

  it("truncates long note text in labels", () => {
    const built = buildReportSnapshot({
      title: "R",
      description: "",
      filterJson: "[]",
      blocks: [
        {
          id: "n1",
          type: "note",
          title: "",
          specJson: JSON.stringify({
            type: "note",
            note: { text: "x".repeat(100) },
          }),
        },
      ],
    });
    expect(built.blocks[0]!.label).toBe(`Note: ${"x".repeat(59)}…`);
  });
});

describe("diffSnapshots", () => {
  it("reports nothing when two snapshots are identical", () => {
    const a = snapshot({
      filters: ["region equals “North”"],
      blocks: [{ id: "b1", type: "metric", label: "Row count" }],
    });
    expect(diffSnapshots(a, a)).toEqual([]);
  });

  it("reports title and description edits", () => {
    const items = diffSnapshots(
      snapshot(),
      snapshot({ title: "New title", description: "Why it exists" }),
    );
    expect(items).toEqual([
      "Title: “Report” → “New title”",
      "Description updated",
    ]);
  });

  it("reports filters added and removed", () => {
    const items = diffSnapshots(
      snapshot({ filters: ["region equals “north”"] }),
      snapshot({ filters: ["status equals “shipped”"] }),
    );
    expect(items).toEqual([
      "Filter added: status equals “shipped”",
      "Filter removed: region equals “north”",
    ]);
  });

  it("reports blocks added, changed, and removed", () => {
    const from = snapshot({
      blocks: [
        { id: "b1", type: "metric", label: "Row count" },
        { id: "b2", type: "note", label: "Note: old text" },
      ],
    });
    const to = snapshot({
      blocks: [
        { id: "b2", type: "note", label: "Note: new text" },
        { id: "b3", type: "chart", label: "Sum of amount by region" },
      ],
    });
    expect(diffSnapshots(from, to)).toEqual([
      "Note block changed: Note: old text → Note: new text",
      "Chart block added: Sum of amount by region",
      "Metric block removed: Row count",
    ]);
  });

  it("reports reorders of surviving blocks", () => {
    const items = diffSnapshots(
      snapshot({
        blocks: [
          { id: "b1", type: "metric", label: "Row count" },
          { id: "b2", type: "chart", label: "Sum of amount by region" },
        ],
      }),
      snapshot({
        blocks: [
          { id: "b2", type: "chart", label: "Sum of amount by region" },
          { id: "b1", type: "metric", label: "Row count" },
        ],
      }),
    );
    expect(items).toEqual(["Blocks reordered"]);
  });
});

describe("parseSnapshot", () => {
  it("round-trips a valid snapshot and normalizes junk fields", () => {
    const parsed = parseSnapshot(
      JSON.stringify({
        title: "T",
        description: 5,
        filters: ["a", 3, null],
        blocks: [
          { id: "x", type: "note", label: "n" },
          null,
          { id: 1, type: "note", label: "n" },
        ],
      }),
    );
    expect(parsed).toEqual({
      title: "T",
      description: "",
      filters: ["a"],
      blocks: [{ id: "x", type: "note", label: "n" }],
    });
  });

  it("returns null for corrupt or titleless JSON", () => {
    expect(parseSnapshot("{")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ nope: true }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ title: 42 }))).toBeNull();
  });
});
