// Generates the intentionally messy sample dataset used for the demo and for
// import tests: sample-data/messy_orders.csv
//
// Run with: npm run demo:data
//
// The mess is deliberate and listed in the README: mixed date formats,
// impossible dates, blanks, N/A values, currency symbols, percent signs,
// ragged rows, an unclosed quote, blank lines, duplicate and empty headers,
// an all-empty column, trailing spaces, a very long note, an embedded
// newline, and an XSS probe cell. Everything is seeded, so reruns produce
// byte-identical output.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "sample-data", "messy_orders.csv");

// Deterministic PRNG (mulberry32) so the dataset is reproducible.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

const FIRST = ["Ann", "Bob", "Cara", "Dev", "Ela", "Finn", "Gus", "Hana", "Ivan", "Jill", "Kai", "Lena", "Milo", "Nia", "Omar", "Pia", "Quin", "Ravi", "Sara", "Tom"];
const LAST = ["Agarwal", "Baker", "Chen", "Dubois", "Evans", "Fischer", "Gupta", "Hernandez", "Ito", "Jensen", "Kaur", "Lopez", "Meyer", "Novak", "Okafor", "Patel", "Quinn", "Rossi", "Singh", "Tanaka"];
const REGIONS = ["North", "South", "East", "West", "northeast"];
const PRODUCTS = ["Widget", "Gadget", "Sprocket", "Gizmo", "Doohickey", "Thingama", "Contraption", "Bracket", "Flange", "Bolt", "Nut", "Washer"];
const STATUSES = ["shipped", "delivered", "pending", "cancelled", "returned", " shipped ", "Unknown"];
const NOTE_ACTIONS = ["confirm", "call", "email", "recheck", "expedite", "note", "hold", "release", "escalate", "retry", "reschedule", "split"];
const NOTE_OBJECTS = ["the delivery slot", "the warehouse", "the customer", "the payment", "the invoice", "the courier", "the gift wrap", "the address", "the discount", "the return pick-up"];

function fmtIso(d) {
  return d.toISOString().slice(0, 10);
}
function fmtDayFirst(d) {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
function fmtMonthFirst(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

function csvCell(value) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function makeDate() {
  const day = int(1, 28);
  const month = int(1, 12);
  const year = chance(0.8) ? 2024 : 2025;
  const d = new Date(Date.UTC(year, month - 1, day));
  const roll = rnd();
  if (roll < 0.55) return fmtIso(d);
  if (roll < 0.8) return fmtDayFirst(d);
  return fmtMonthFirst(d);
}

const HEADER = [
  "order_id", "order_date", "customer", "region", "product", "quantity",
  "unit_price", "discount_pct", "total_amount", "status", "internal_code",
  "notes", "region", "",
].join(",");

const TOTAL_ROWS = 2500;
const lines = [HEADER];

// Fixed positions for injected messiness.
const raggedExtra = new Set([120, 640, 1990]);
const raggedMissing = new Set([350, 1500]);
const blankLineAfter = new Set([77, 512, 1801, 2333]);

for (let i = 0; i < TOTAL_ROWS; i += 1) {
  const orderId = 1001 + i;
  const isLast = i === TOTAL_ROWS - 1;

  if (raggedExtra.has(i)) {
    // Extra trailing field: 15 fields where 14 are expected.
    lines.push(`${orderId},2024-03-15,${pick(FIRST)} ${pick(LAST)},North,Widget,3,$10.00,5%,$28.50,shipped,,note,North,,EXTRA`);
    continue;
  }
  if (raggedMissing.has(i)) {
    // Missing trailing fields.
    lines.push(`${orderId},2024-06-02,${pick(FIRST)} ${pick(LAST)}`);
    continue;
  }
  if (isLast) {
    // Unclosed quote: the row is rejected with a reason, and the profile
    // must say so. Kept last so only one row is affected.
    lines.push(`${orderId},2024-12-31,Ravi Patel,"unterminated note`);
    continue;
  }

  const quantity = chance(0.03) ? "" : chance(0.05) ? "  7 " : String(int(1, 50));
  const unit = 5 + rnd() * 195;
  let unitPrice;
  if (chance(0.04)) unitPrice = "";
  else if (chance(0.3)) unitPrice = `$${unit.toFixed(2)}`;
  else if (chance(0.05)) unitPrice = `$${Math.round(unit * 100).toLocaleString("en-US")}.00`;
  else unitPrice = (Math.round(unit * 100) / 100).toFixed(2);

  let discount;
  const discRoll = rnd();
  if (discRoll < 0.04) discount = "";
  else if (discRoll < 0.1) discount = "N/A";
  else discount = `${pick([0, 5, 10, 15, 20])}%`;

  const qtyNum = Number(quantity.trim() || "0");
  const unitNum = Number(unitPrice.replace(/[$,]/g, "") || "0");
  const discNum = Number(discount.replace("%", "") || "0");
  let total;
  if (chance(0.04)) total = "";
  else if (chance(0.04)) total = "N/A";
  else total = (qtyNum * unitNum * (1 - discNum / 100)).toFixed(2);

  let orderDate;
  const dateRoll = rnd();
  if (dateRoll < 0.03) orderDate = "";
  else if (dateRoll < 0.05) orderDate = "N/A";
  else if (dateRoll < 0.065) orderDate = pick(["2024-02-31", "31/02/2024", "2024-13-05"]);
  else orderDate = makeDate();

  const region = chance(0.03) ? "" : pick(REGIONS);
  const product = chance(0.03) ? "" : chance(0.01) ? "unknown" : pick(PRODUCTS);

  let notes;
  const noteRoll = rnd();
  if (noteRoll < 0.06) notes = "";
  else if (noteRoll < 0.09) notes = pick(["all good", "partial delivery", "urgent", "refund requested", "N/A", "unknown", "-"]);
  else if (noteRoll < 0.095) notes = "This is a very long note that keeps going well past two hundred characters to test how the table and profile views cope with oversized text values without breaking the layout or truncating information silently. It ends here.";
  else if (noteRoll < 0.096) notes = "Line one\nLine two in the same cell";
  else if (noteRoll < 0.097) notes = "<script>alert('xss')</script>";
  else if (noteRoll < 0.0975) notes = 'Customer said: "wrap it twice", then left.';
  else notes = `${pick(NOTE_ACTIONS)} ${pick(NOTE_OBJECTS)} #${int(1000, 9999)}`;
  if (chance(0.02)) notes = `  ${notes}`;

  const regionDup = chance(0.2) ? pick(["north", "south", "east", "west"]) : "";

  const row = [
    String(orderId),
    orderDate,
    chance(0.01) ? "" : `${pick(FIRST)} ${pick(LAST)}`,
    region,
    product,
    quantity,
    unitPrice,
    discount,
    total,
    chance(0.04) ? "" : pick(STATUSES),
    "", // internal_code: empty on every row (ignored column, reported)
    notes,
    regionDup,
    "", // empty header: all-empty column, reported as column_14
  ].map(csvCell).join(",");

  lines.push(row);

  if (blankLineAfter.has(i)) lines.push("");
}

mkdirSync(join(__dirname, "..", "sample-data"), { recursive: true });
writeFileSync(OUT_PATH, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${OUT_PATH} (${TOTAL_ROWS} data rows + injected messiness)`);
