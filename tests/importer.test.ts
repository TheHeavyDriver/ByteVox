import { describe, expect, it } from "vitest";
import { decodeCsvBytes } from "@/lib/csv/decode";
import { importCsvBytes } from "@/lib/csv/importer";
import { inferColumn } from "@/lib/csv/infer";

const enc = (s: string) => new TextEncoder().encode(s);

describe("decode", () => {
  it("decodes plain UTF-8", () => {
    const result = decodeCsvBytes(enc("a,b\n1,2\n"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.encoding).toBe("UTF-8");
  });

  it("strips a UTF-8 BOM", () => {
    const result = decodeCsvBytes(enc("\uFEFFa,b\n1,2\n"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.encoding).toBe("UTF-8 (BOM)");
      expect(result.text.startsWith("a,b")).toBe(true);
    }
  });

  it("rejects xlsx (zip) content with a targeted message", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = decodeCsvBytes(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("xlsx");
  });

  it("rejects invalid UTF-8 bytes", () => {
    const bytes = new Uint8Array([0x61, 0x2c, 0x62, 0x0a, 0xff, 0xfe, 0xc3, 0x28]);
    const result = decodeCsvBytes(bytes);
    // 0xff 0xfe is a UTF-16LE BOM, so this specific case goes down the
    // UTF-16 route; craft a truly invalid UTF-8 sequence instead:
    const bad = new Uint8Array([0x61, 0xc3, 0x28, 0x62]);
    const result2 = decodeCsvBytes(bad);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.code).toBe("bad_encoding");
  });

  it("rejects an empty file", () => {
    const result = decodeCsvBytes(new Uint8Array());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty");
  });
});

describe("importCsvBytes", () => {
  it("imports a clean CSV with guessed types", async () => {
    const outcome = await importCsvBytes(
      enc("name,amount\nAnn,10.5\nBob,20\nCara,3.25\n"),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rows).toHaveLength(3);
    expect(
      outcome.result.columns.map((c) => [c.name, c.guessedType]),
    ).toEqual([
      ["name", "category"],
      ["amount", "number"],
    ]);
  });

  it("reports ragged rows with reasons, and drops nothing", async () => {
    // 6 physical lines: header + 5 data-ish lines. Data lines: ok, ragged,
    // blank, ok, ragged.
    const outcome = await importCsvBytes(
      enc("a,b\n1,2\n3,4,5\n\n6\n7,8\n"),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const r = outcome.result;
    expect(r.rows).toHaveLength(2);
    expect(r.rejected).toHaveLength(2);
    expect(r.blankLines).toBe(1);
    // Nothing lost: usable + rejected + blank = physical data lines (5).
    expect(r.rows.length + r.rejected.length + r.blankLines).toBe(5);
    expect(r.rejected[0]!.reason).toContain("Invalid Record Length");
    expect(r.rejected[0]!.rowNumber).toBe(3);
  });

  it("renames duplicate and empty headers, and notes both", async () => {
    const outcome = await importCsvBytes(
      enc("region,,region\nnorth,1,a\nsouth,2,b\n"),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.columns.map((c) => c.name)).toEqual([
      "region",
      "column_2",
      "region (2)",
    ]);
    expect(outcome.result.headerNotes.join(" ")).toContain("Duplicate header");
    expect(outcome.result.headerNotes.join(" ")).toContain("column_2");
  });

  it("ignores all-empty columns but reports them", async () => {
    const outcome = await importCsvBytes(enc("a,,c\n1,,x\n2,,y\n"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.columns.map((c) => c.name)).toEqual(["a", "c"]);
    expect(outcome.result.ignoredEmptyColumns).toEqual(["column_2"]);
    expect(outcome.result.headerNotes.join(" ")).toContain("empty on every row");
  });

  it("handles semicolon and tab delimiters", async () => {
    const semi = await importCsvBytes(enc("a;b\n1;2\n3;4\n"));
    expect(semi.ok).toBe(true);
    if (semi.ok) expect(semi.result.rows).toHaveLength(2);
    const tab = await importCsvBytes(enc("a\tb\n1\t2\n3\t4\n"));
    expect(tab.ok).toBe(true);
    if (tab.ok) expect(tab.result.rows).toHaveLength(2);
  });

  it("never returns a partial success past the size limit", async () => {
    const outcome = await importCsvBytes(enc("a,b\n1,2\n"), {
      maxBytes: 3,
      maxRows: 100,
      maxColumns: 100,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("too_large");
  });

  it("rejects files past the row cap instead of truncating", async () => {
    const outcome = await importCsvBytes(enc("a\n1\n2\n3\n"), {
      maxBytes: 1024,
      maxRows: 2,
      maxColumns: 100,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("too_many_rows");
  });

  it("treats a header-only file as a valid dataset with zero rows", async () => {
    const outcome = await importCsvBytes(enc("a,b\n"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rows).toHaveLength(0);
    expect(outcome.result.columns).toHaveLength(2);
  });
});

describe("inferColumn", () => {
  it("flags ambiguous day/month order and prefers day-first", () => {
    const profile = inferColumn("d", 0, [
      "03/04/2024",
      "05/06/2024",
      "07/08/2024",
    ]);
    expect(profile.guessedType).toBe("date");
    expect(profile.stats.date.dialect).toBe("day-first");
    expect(profile.stats.date.ambiguous).toBe(3);
    expect(profile.stats.date.flags.join(" ")).toContain("ambiguous");
  });

  it("uses day > 12 evidence to choose day-first confidently", () => {
    const profile = inferColumn("d", 0, [
      "15/03/2024",
      "03/04/2024",
      "20/05/2024",
    ]);
    expect(profile.guessedType).toBe("date");
    expect(profile.stats.date.dialect).toBe("day-first");
    expect(profile.stats.date.ambiguous).toBe(1);
    expect(profile.stats.date.flags).toHaveLength(0);
  });

  it("classifies unique integers in many rows as an identifier, not a number", () => {
    const values = Array.from({ length: 30 }, (_, i) => String(1000 + i));
    const profile = inferColumn("order_id", 0, values);
    expect(profile.guessedType).toBe("text");
    expect(profile.reason).toContain("identifier");
  });

  it("keeps a unique decimal column as a number", () => {
    const values = Array.from({ length: 30 }, (_, i) => (10.5 + i).toFixed(2));
    const profile = inferColumn("amount", 0, values);
    expect(profile.guessedType).toBe("number");
  });

  it("tolerates currency symbols and thousands separators", () => {
    const profile = inferColumn("price", 0, ["$1,234.50", "€2,000", "999"]);
    expect(profile.guessedType).toBe("number");
    expect(profile.stats.number.min).toBe(999);
    expect(profile.stats.number.max).toBe(2000);
    expect(profile.stats.number.currencyStripped).toBe(2);
  });

  it("treats a value that is neither number nor date as mixed text", () => {
    const profile = inferColumn(
      "x",
      0,
      Array.from({ length: 30 }, (_, i) => `value-${i}-${i * 7}`),
    );
    expect(profile.guessedType).toBe("text");
  });

  it("counts missing values and keeps them out of parsing shares", () => {
    const values = ["1", "", "3", "  ", "5"];
    const profile = inferColumn("n", 0, values);
    expect(profile.guessedType).toBe("number");
    expect(profile.stats.missing).toBe(2);
    expect(profile.stats.number.parsed).toBe(3);
  });
});
