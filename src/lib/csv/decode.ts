/**
 * Turns raw uploaded bytes into text, or explains — in plain English — why
 * that is not possible. No guessing: anything we cannot decode confidently
 * is rejected with a message rather than shown as mojibake.
 */

export type DecodeErrorCode = "empty" | "xlsx" | "binary" | "bad_encoding";

export type DecodedFile =
  | {
      ok: true;
      text: string;
      encoding: "UTF-8" | "UTF-8 (BOM)" | "UTF-16 LE" | "UTF-16 BE";
    }
  | { ok: false; code: DecodeErrorCode; message: string };

const MAGIC_SIGNATURES: Array<{ bytes: number[]; label: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], label: "PDF" }, // %PDF
  { bytes: [0x89, 0x50, 0x4e, 0x47], label: "PNG image" },
  { bytes: [0x47, 0x49, 0x46, 0x38], label: "GIF image" },
  { bytes: [0xff, 0xd8, 0xff], label: "JPEG image" },
];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function decodeWith(
  bytes: Uint8Array,
  encoding: "utf-16le" | "utf-16be",
  label: "UTF-16 LE" | "UTF-16 BE",
): DecodedFile {
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    return { ok: true, text, encoding: label };
  } catch {
    return {
      ok: false,
      code: "bad_encoding",
      message: `The file starts with a ${label} byte-order mark but its contents are not valid ${label} text. Re-export the file as UTF-8 and try again.`,
    };
  }
}

export function decodeCsvBytes(bytes: Uint8Array): DecodedFile {
  if (bytes.length === 0) {
    return {
      ok: false,
      code: "empty",
      message: "The file is empty (0 bytes), so there is nothing to read.",
    };
  }

  // ZIP-based container (xlsx is a zip). PK\x03\x04 / PK\x05\x06 / PK\x07\x08.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  ) {
    return {
      ok: false,
      code: "xlsx",
      message:
        "This looks like a spreadsheet workbook (.xlsx) or another ZIP-based file, not a CSV. Export it as CSV and upload that.",
    };
  }

  for (const signature of MAGIC_SIGNATURES) {
    if (startsWith(bytes, signature.bytes)) {
      return {
        ok: false,
        code: "binary",
        message: `This looks like a ${signature.label} file, not a CSV.`,
      };
    }
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeWith(bytes, "utf-16le", "UTF-16 LE");
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeWith(bytes, "utf-16be", "UTF-16 BE");
  }

  const hasUtf8Bom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

  let text: string;
  try {
    // fatal: true means invalid byte sequences throw instead of becoming U+FFFD.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      code: "bad_encoding",
      message:
        "The file is not valid UTF-8, and it has no UTF-16 byte-order mark. Text read from it would be corrupted, so it was rejected. Re-export it as UTF-8 and try again.",
    };
  }

  if (text.includes("\u0000")) {
    return {
      ok: false,
      code: "binary",
      message:
        "The file contains NUL bytes, which binary files have and text files do not. It does not look like a CSV.",
    };
  }

  return { ok: true, text, encoding: hasUtf8Bom ? "UTF-8 (BOM)" : "UTF-8" };
}
