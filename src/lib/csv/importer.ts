import { parse, type CsvError } from "csv-parse";
import { decodeCsvBytes, type DecodeErrorCode } from "./decode";
import { inferColumn, type ColumnProfile } from "./infer";
import { isBlank } from "./value-parsers";

/**
 * The importer is the single entry point for "bytes in, structured dataset
 * out". Everything that could go wrong with a real-world CSV is handled here
 * and reported, never silently dropped:
 *
 * - wrong encoding / binary files / xlsx containers -> typed errors
 * - rows that fail to parse -> RejectedRow with line number and reason
 * - blank lines and all-empty columns -> counted and reported
 * - messy headers -> normalized and reported
 */

export type ImportErrorCode =
  | "too_large"
  | "too_many_rows"
  | "too_many_columns"
  | "not_csv"
  | DecodeErrorCode;

export type ImportError = { code: ImportErrorCode; message: string };

export type RejectedRow = {
  rowNumber: number;
  reason: string;
  rawSnippet: string;
};

export type ImportedRow = {
  /** 1-based index over usable data rows (header is not a data row). */
  rowNumber: number;
  values: Record<string, string>;
};

export type ImportResult = {
  encoding: string;
  columns: ColumnProfile[];
  rows: ImportedRow[];
  rejected: RejectedRow[];
  blankLines: number;
  /** Human-readable notes about header normalization. */
  headerNotes: string[];
  /** Names of all-empty columns that were ignored (and reported). */
  ignoredEmptyColumns: string[];
};

export type ImportLimits = {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
};

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxRows: 50_000,
  maxColumns: 100,
};

export type ImportOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; error: ImportError };

type RawSkip = { code: string; message: string; lines: number[] };

function normalizeLines(lines: unknown): number[] {
  if (typeof lines === "number") return [lines];
  if (Array.isArray(lines)) return lines.filter((l) => typeof l === "number");
  return [];
}

function parseAll(text: string): Promise<{ records: string[][]; skips: RawSkip[] }> {
  const parser = parse({
    bom: true,
    trim: true,
    skip_empty_lines: false,
    skip_records_with_error: true,
    relax_column_count: false,
    // Try the common delimiters; csv-parse picks per record.
    delimiter: [",", ";", "\t", "|"],
  });

  const records: string[][] = [];
  const skips: RawSkip[] = [];

  parser.on("readable", () => {
    let record: unknown;
    while ((record = parser.read()) !== null) {
      records.push(record as string[]);
    }
  });

  parser.on("skip", (err: CsvError) => {
    skips.push({
      code: String(err.code ?? "UNKNOWN"),
      message: err.message,
      lines: normalizeLines(err.lines),
    });
  });

  return new Promise((resolve, reject) => {
    parser.on("end", () => resolve({ records, skips }));
    parser.on("error", reject);
    parser.write(text);
    parser.end();
  });
}

function resolveHeaderNames(headerRow: string[]): {
  names: string[];
  notes: string[];
} {
  const names: string[] = [];
  const notes: string[] = [];
  const seen = new Map<string, number>();
  const synthesizedNames: string[] = [];
  const renamed: string[] = [];

  headerRow.forEach((cell, index) => {
    let base = cell.trim();
    if (base === "") {
      base = `column_${index + 1}`;
      synthesizedNames.push(base);
    }
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count === 1) {
      names.push(base);
    } else {
      const renamedName = `${base} (${count})`;
      names.push(renamedName);
      renamed.push(`${base} → ${renamedName}`);
    }
  });

  if (synthesizedNames.length > 0) {
    notes.push(
      `${synthesizedNames.length} empty header cell${synthesizedNames.length === 1 ? " was" : "s were"} named ${synthesizedNames.join(", ")} and kept.`,
    );
  }
  if (renamed.length > 0) {
    notes.push(`Duplicate header name(s) renamed: ${renamed.join(", ")}.`);
  }
  return { names, notes };
}

function snippetForLines(rawLines: string[], lines: number[]): string {
  if (lines.length === 0) return "";
  const start = Math.max(1, lines[0] ?? 1);
  const end = Math.min(rawLines.length, lines[lines.length - 1] ?? start);
  const text = rawLines.slice(start - 1, end).join(" ⏎ ");
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function importCsvBytes(
  bytes: Uint8Array,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ImportOutcome> {
  if (bytes.byteLength > limits.maxBytes) {
    return {
      ok: false,
      error: {
        code: "too_large",
        message: `The file is ${formatMegabytes(bytes.byteLength)}; the limit is ${formatMegabytes(limits.maxBytes)}. Split it or export a smaller range.`,
      },
    };
  }

  const decoded = decodeCsvBytes(bytes);
  if (!decoded.ok) {
    return { ok: false, error: { code: decoded.code, message: decoded.message } };
  }

  const { records, skips } = await parseAll(decoded.text);

  if (records.length === 0) {
    return {
      ok: false,
      error: {
        code: "not_csv",
        message:
          "No readable rows were found. The file may contain only blank lines, or it may not be a CSV at all.",
      },
    };
  }

  const headerRow = records[0];
  if (headerRow.length > limits.maxColumns) {
    return {
      ok: false,
      error: {
        code: "too_many_columns",
        message: `The file has ${headerRow.length} columns; the limit is ${limits.maxColumns}.`,
      },
    };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > limits.maxRows) {
    return {
      ok: false,
      error: {
        code: "too_many_rows",
        message: `The file has ${dataRecords.length.toLocaleString()} data rows; the limit is ${limits.maxRows.toLocaleString()}. Split the file or export a smaller range.`,
      },
    };
  }

  const rawLines = decoded.text.split(/\r\n|\n|\r/);

  // Classify parser skips: blank lines are expected noise (counted, reported);
  // anything else is a row we could not read (reported with a reason).
  let blankLines = 0;
  const rejected: RejectedRow[] = [];
  for (const skip of skips) {
    const isBlankLine =
      skip.code === "CSV_RECORD_INCONSISTENT_FIELDS_LENGTH" &&
      skip.lines.length > 0 &&
      skip.lines.every((l) => (rawLines[l - 1] ?? "").trim() === "");
    if (isBlankLine) {
      blankLines += 1;
      continue;
    }
    rejected.push({
      rowNumber: skip.lines[0] ?? 0,
      reason: skip.message,
      rawSnippet: snippetForLines(rawLines, skip.lines),
    });
  }

  const { names, notes } = resolveHeaderNames(headerRow);

  // All-empty columns are dropped from the profile — but named in the report.
  const keptIndexes: number[] = [];
  const ignoredEmptyColumns: string[] = [];
  names.forEach((name, index) => {
    const allBlank =
      dataRecords.length > 0 &&
      dataRecords.every((record) => isBlank(record[index] ?? ""));
    if (allBlank) {
      ignoredEmptyColumns.push(name);
    } else {
      keptIndexes.push(index);
    }
  });

  const keptNames = keptIndexes.map((i) => names[i]!);

  const rows: ImportedRow[] = dataRecords.map((record, rowIndex) => {
    const values: Record<string, string> = {};
    keptIndexes.forEach((sourceIndex, i) => {
      values[keptNames[i]!] = record[sourceIndex] ?? "";
    });
    return { rowNumber: rowIndex + 1, values };
  });

  const columns: ColumnProfile[] = keptIndexes.map((sourceIndex, i) =>
    inferColumn(
      keptNames[i]!,
      i,
      dataRecords.map((record) => record[sourceIndex] ?? ""),
    ),
  );

  if (ignoredEmptyColumns.length > 0) {
    notes.push(
      `${ignoredEmptyColumns.length} column(s) were empty on every row and were ignored: ${ignoredEmptyColumns.join(", ")}.`,
    );
  }
  if (blankLines > 0) {
    notes.push(
      `${blankLines} blank line${blankLines === 1 ? " was" : "s were"} skipped.`,
    );
  }

  return {
    ok: true,
    result: {
      encoding: decoded.encoding,
      columns,
      rows,
      rejected,
      blankLines,
      headerNotes: notes,
      ignoredEmptyColumns,
    },
  };
}
