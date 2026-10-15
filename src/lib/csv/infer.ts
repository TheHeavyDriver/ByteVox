import {
  isBlank,
  parseDateCandidates,
  parseDateWithDialect,
  toIsoDateString,
  tryParseNumber,
  type DateDialect,
} from "./value-parsers";

export type ColumnType = "number" | "date" | "category" | "text";

export type ColumnStats = {
  /** Data rows considered, including rows where this cell is blank. */
  total: number;
  missing: number;
  distinct: number;
  number: {
    parsed: number;
    currencyStripped: number;
    percentStripped: number;
    min: number | null;
    max: number | null;
  };
  date: {
    parsed: number;
    dialect: DateDialect;
    min: string | null;
    max: string | null;
    /** Values that read as a date under both D/M/Y and M/D/Y. */
    ambiguous: number;
    flags: string[];
  };
  samples: string[];
};

export type ColumnProfile = {
  name: string;
  position: number;
  guessedType: ColumnType;
  /** One plain-English sentence explaining the guess. */
  reason: string;
  stats: ColumnStats;
};

// Tunable constants. They are deliberately visible here and repeated in the
// column profile so the guess is explainable, not magic.
export const NUMBER_THRESHOLD = 0.9;
export const DATE_THRESHOLD = 0.9;
export const CATEGORY_MAX_DISTINCT = 50;
export const CATEGORY_MAX_COVERAGE = 0.5;
const SAMPLE_SIZE = 5;
const IDENTIFIER_MIN_ROWS = 20;

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function inferColumn(
  name: string,
  position: number,
  values: string[],
): ColumnProfile {
  const total = values.length;
  const nonMissing = values.filter((v) => !isBlank(v));
  const missing = total - nonMissing.length;

  const distinctSet = new Set(nonMissing.map((v) => v.trim()));
  const distinct = distinctSet.size;
  const samples = [...distinctSet].slice(0, SAMPLE_SIZE);

  const stats: ColumnStats = {
    total,
    missing,
    distinct,
    number: {
      parsed: 0,
      currencyStripped: 0,
      percentStripped: 0,
      min: null,
      max: null,
    },
    date: {
      parsed: 0,
      dialect: "day-first",
      min: null,
      max: null,
      ambiguous: 0,
      flags: [],
    },
    samples,
  };

  if (nonMissing.length === 0) {
    return {
      name,
      position,
      guessedType: "text",
      reason: "Every value in this column is blank; there is nothing to guess from.",
      stats,
    };
  }

  // -- numbers --------------------------------------------------------------
  let integersOnly = true;
  for (const raw of nonMissing) {
    const parsed = tryParseNumber(raw);
    if (parsed) {
      stats.number.parsed += 1;
      if (parsed.strippedCurrency) stats.number.currencyStripped += 1;
      if (parsed.strippedPercent) stats.number.percentStripped += 1;
      if (!Number.isInteger(parsed.value)) integersOnly = false;
      stats.number.min =
        stats.number.min === null
          ? parsed.value
          : Math.min(stats.number.min, parsed.value);
      stats.number.max =
        stats.number.max === null
          ? parsed.value
          : Math.max(stats.number.max, parsed.value);
    } else {
      integersOnly = false;
    }
  }

  // -- dates ----------------------------------------------------------------
  let dayOnly = 0;
  let monthOnly = 0;
  let ambiguous = 0;
  for (const raw of nonMissing) {
    const candidates = parseDateCandidates(raw);
    const isDayFirst = candidates.dayFirst !== null;
    const isMonthFirst = candidates.monthFirst !== null;
    if (isDayFirst && isMonthFirst) {
      ambiguous += 1;
    } else if (isDayFirst) {
      dayOnly += 1;
    } else if (isMonthFirst) {
      monthOnly += 1;
    }
  }

  let dialect: DateDialect = "day-first";
  if (dayOnly > 0 && monthOnly === 0) {
    dialect = "day-first";
  } else if (monthOnly > 0 && dayOnly === 0) {
    dialect = "month-first";
  } else if (monthOnly > 0 && dayOnly > 0) {
    // Conflicting unambiguous values — pick the majority, and say so.
    dialect = dayOnly >= monthOnly ? "day-first" : "month-first";
    stats.date.flags.push(
      "values use both D/M/Y and M/D/Y orders; the majority was chosen",
    );
  } else if (ambiguous > 0) {
    stats.date.flags.push(
      "day vs month order is ambiguous; interpreted as D/M/Y (day first)",
    );
  }
  stats.date.dialect = dialect;
  stats.date.ambiguous = ambiguous;

  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const raw of nonMissing) {
    const parsed = parseDateWithDialect(raw, dialect);
    if (parsed) {
      stats.date.parsed += 1;
      if (!minDate || parsed < minDate) minDate = parsed;
      if (!maxDate || parsed > maxDate) maxDate = parsed;
    }
  }
  if (minDate) stats.date.min = toIsoDateString(minDate);
  if (maxDate) stats.date.max = toIsoDateString(maxDate);

  // -- decision -------------------------------------------------------------
  const numberShare = stats.number.parsed / nonMissing.length;
  const dateShare = stats.date.parsed / nonMissing.length;
  const allUnique = distinct === nonMissing.length;

  const currencyNote =
    stats.number.currencyStripped > 0
      ? ` (currency symbols stripped from ${stats.number.currencyStripped})`
      : "";
  const percentNote =
    stats.number.percentStripped > 0
      ? ` (percent signs noted on ${stats.number.percentStripped})`
      : "";

  if (numberShare >= NUMBER_THRESHOLD) {
    if (allUnique && integersOnly && nonMissing.length >= IDENTIFIER_MIN_ROWS) {
      return {
        name,
        position,
        guessedType: "text",
        reason: `Treated as text: all ${nonMissing.length} values are distinct whole numbers, which usually means an identifier, not a measure.`,
        stats,
      };
    }
    return {
      name,
      position,
      guessedType: "number",
      reason: `${pct(stats.number.parsed, nonMissing.length)}% of values (${stats.number.parsed}/${nonMissing.length}) parse as numbers${currencyNote}${percentNote}.`,
      stats,
    };
  }

  if (dateShare >= DATE_THRESHOLD) {
    const dialectLabel =
      dialect === "day-first" ? "D/M/Y style" : "M/D/Y style";
    const flagNote =
      stats.date.flags.length > 0 ? ` ${stats.date.flags.join("; ")}.` : "";
    return {
      name,
      position,
      guessedType: "date",
      reason: `${pct(stats.date.parsed, nonMissing.length)}% of values (${stats.date.parsed}/${nonMissing.length}) parse as dates (${dialectLabel}).${flagNote}`,
      stats,
    };
  }

  const coverage = distinct / nonMissing.length;
  // Small files are treated generously: with fewer than 10 rows a handful of
  // distinct labels is still a usable category, even if every row differs.
  const categoryOk =
    distinct <= CATEGORY_MAX_DISTINCT &&
    (coverage < CATEGORY_MAX_COVERAGE || nonMissing.length < 10);
  if (categoryOk) {
    return {
      name,
      position,
      guessedType: "category",
      reason: `${distinct} distinct values cover ${pct(distinct, nonMissing.length)}% of ${nonMissing.length} rows — a repeatable set of labels.`,
      stats,
    };
  }

  return {
    name,
    position,
    guessedType: "text",
    reason: `Mixed or high-cardinality values: ${stats.number.parsed} look numeric, ${stats.date.parsed} look like dates, ${distinct} distinct values remain.`,
    stats,
  };
}
