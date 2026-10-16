import { format, isValid, parse as parseWithFormat } from "date-fns";

// Value parsing is shared by type inference AND by the compute engine, so
// "this cell is a number" means the same thing at profiling time and at
// aggregation time. Any change here changes both, consistently.

export type DateDialect = "day-first" | "month-first";

const CURRENCY_SYMBOLS = ["$", "€", "£", "₹"] as const;

export function isBlank(raw: string): boolean {
  return raw.trim() === "";
}

export type NumberParse = {
  value: number;
  strippedCurrency: boolean;
  strippedPercent: boolean;
};

// Lenient on purpose: tolerates surrounding whitespace, one leading currency
// symbol, thousands separators, and a trailing percent sign (kept as-is,
// e.g. "12%" -> 12, and reported in the column profile).
export function tryParseNumber(raw: string): NumberParse | null {
  let s = raw.trim();
  if (s === "") return null;
  let strippedCurrency = false;
  let strippedPercent = false;
  if ((CURRENCY_SYMBOLS as readonly string[]).includes(s[0] ?? "")) {
    s = s.slice(1).trimStart();
    strippedCurrency = true;
  }
  if (s.endsWith("%")) {
    s = s.slice(0, -1).trimEnd();
    strippedPercent = true;
  }
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(s)) return null;
  const value = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value, strippedCurrency, strippedPercent };
}

type NumericFamily = { fmt: string; variants: string[] };

// Day-first numeric families (with all reasonable digit-width renderings).
const DAY_FIRST_NUMERIC: NumericFamily[] = [
  {
    fmt: "d/M/yyyy",
    variants: ["d/M/yyyy", "dd/MM/yyyy", "d/MM/yyyy", "dd/M/yyyy"],
  },
  {
    fmt: "d-M-yyyy",
    variants: ["d-M-yyyy", "dd-MM-yyyy", "d-MM-yyyy", "dd-M-yyyy"],
  },
  {
    fmt: "d.M.yyyy",
    variants: ["d.M.yyyy", "dd.MM.yyyy", "d.MM.yyyy", "dd.M.yyyy"],
  },
];

// Month-first numeric families.
const MONTH_FIRST_NUMERIC: NumericFamily[] = [
  {
    fmt: "M/d/yyyy",
    variants: ["M/d/yyyy", "MM/dd/yyyy", "M/dd/yyyy", "MM/d/yyyy"],
  },
  {
    fmt: "M-d-yyyy",
    variants: ["M-d-yyyy", "MM-dd-yyyy", "M-dd-yyyy", "MM-d-yyyy"],
  },
];

// ISO formats. "yyyy-MM-dd" and "yyyy/M/d" are unambiguous.
const ISO_NUMERIC: NumericFamily[] = [
  { fmt: "yyyy-MM-dd", variants: ["yyyy-MM-dd", "yyyy-M-d"] },
  { fmt: "yyyy/MM/dd", variants: ["yyyy/MM/dd", "yyyy/M/d"] },
];

// Month-name formats are unambiguous regardless of locale conventions.
const MONTH_NAME_FORMATS = ["d MMM yyyy", "d MMMM yyyy", "MMM d, yyyy", "MMMM d, yyyy"];

function matchNumericFamily(input: string, family: NumericFamily): Date | null {
  try {
    const parsed = parseWithFormat(input, family.fmt, new Date());
    if (!isValid(parsed)) return null;
    return family.variants.some((v) => format(parsed, v) === input) ? parsed : null;
  } catch {
    return null;
  }
}

function matchMonthNameFormat(input: string, fmt: string): Date | null {
  try {
    const parsed = parseWithFormat(input, fmt, new Date());
    if (!isValid(parsed)) return null;
    return format(parsed, fmt) === input ? parsed : null;
  } catch {
    return null;
  }
}

export type DateCandidates = {
  // ISO or month-name formats: a single certain interpretation
  unambiguous: Date | null;
  // only valid as D/M/Y (or M/D/Y), i.e. the ambiguous bucket
  dayFirst: Date | null;
  monthFirst: Date | null;
};

export function parseDateCandidates(raw: string): DateCandidates {
  const input = raw.trim().replace(/\s+/g, " ");
  if (input === "") return { unambiguous: null, dayFirst: null, monthFirst: null };

  let unambiguous: Date | null = null;
  for (const family of ISO_NUMERIC) {
    unambiguous = unambiguous ?? matchNumericFamily(input, family);
  }
  for (const fmt of MONTH_NAME_FORMATS) {
    unambiguous = unambiguous ?? matchMonthNameFormat(input, fmt);
  }

  let dayFirst: Date | null = null;
  for (const family of DAY_FIRST_NUMERIC) {
    dayFirst = dayFirst ?? matchNumericFamily(input, family);
  }

  let monthFirst: Date | null = null;
  for (const family of MONTH_FIRST_NUMERIC) {
    monthFirst = monthFirst ?? matchNumericFamily(input, family);
  }

  return { unambiguous, dayFirst, monthFirst };
}

// Resolves a single value under a column's chosen dialect. The dialect only
// decides how AMBIGUOUS values are read; values that are valid under just
// one convention are accepted either way (they carry no ambiguity).
export function parseDateWithDialect(
  raw: string,
  dialect: DateDialect,
): Date | null {
  const c = parseDateCandidates(raw);
  if (c.unambiguous) return c.unambiguous;
  if (dialect === "day-first") return c.dayFirst ?? c.monthFirst;
  return c.monthFirst ?? c.dayFirst;
}

export function toIsoDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
