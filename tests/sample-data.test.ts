import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importCsvBytes } from "@/lib/csv/importer";

describe("sample-data/messy_orders.csv", () => {
  it("accounts for every row: nothing is silently dropped", async () => {
    const bytes = new Uint8Array(readFileSync("sample-data/messy_orders.csv"));
    const outcome = await importCsvBytes(bytes);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const r = outcome.result;

    // Injected messiness is fixed and seeded in scripts/generate-messy-csv.mjs:
    // 2500 data rows, 3 with an extra field, 2 missing fields, 1 unclosed
    // quote, 4 blank lines.
    expect(r.rows).toHaveLength(2494);
    expect(r.rejected).toHaveLength(6);
    expect(r.blankLines).toBe(4);
    expect(
      r.rejected.filter((x) => x.reason.includes("Invalid Record Length")),
    ).toHaveLength(5);
    expect(r.rejected.some((x) => x.reason.includes("Quote Not Closed"))).toBe(
      true,
    );

    // Physical-line reconciliation: every physical line in the file is the
    // header, a usable row, a rejected row, a blank line, or a continuation
    // of a quoted multi-line cell. Nothing is unaccounted for.
    const text = new TextDecoder().decode(bytes);
    const physicalLines = text.split(/\r\n|\n|\r/).length - 1; // file ends with \n
    const accounted = 1 + r.rows.length + r.rejected.length + r.blankLines;
    const continuationLines = physicalLines - accounted;
    expect(continuationLines).toBeGreaterThanOrEqual(0);
    expect(continuationLines).toBeLessThan(10);

    // Reported adjustments:
    expect(r.headerNotes.join(" ")).toContain("Duplicate header");
    expect(r.ignoredEmptyColumns).toEqual(
      expect.arrayContaining(["internal_code", "column_14"]),
    );

    // The profile copes with the deliberate mess:
    const byName = new Map(r.columns.map((c) => [c.name, c]));
    expect(byName.get("region (2)")).toBeDefined();
    expect(byName.get("order_id")?.guessedType).toBe("text"); // identifier rule
    expect(byName.get("order_date")?.guessedType).toBe("date"); // mixed formats
    expect(byName.get("quantity")?.guessedType).toBe("number");
    expect(byName.get("region")?.guessedType).toBe("category");
    expect(byName.get("notes")?.guessedType).toBe("text");

    // Dates arrive in three formats and two orders; the profile must say so.
    const orderDate = byName.get("order_date");
    expect(orderDate?.stats.date.ambiguous).toBeGreaterThan(0);
    expect(orderDate?.stats.date.min).not.toBeNull();
    expect(orderDate?.stats.date.max).not.toBeNull();

    // The XSS probe cell is preserved as a plain string value, not executed.
    const xssRow = r.rows.find((row) => row.values.notes?.includes("<script>"));
    expect(xssRow).toBeDefined();
  });
});
