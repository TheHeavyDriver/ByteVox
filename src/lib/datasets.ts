import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ColumnStats } from "@/lib/csv/infer";
import type { ImportResult } from "@/lib/csv/importer";

// ---------------------------------------------------------------------------
// File storage
//
// Uploaded bytes are stored under UPLOAD_DIR with a random file name. The
// user-supplied name is never used as a path. Note that no route serves these
// files back: they exist so deletes can free real space and so a future
// re-import feature has the original. (See README, "no raw-file endpoint".)
// ---------------------------------------------------------------------------

export function resolveUploadDir(): string {
  const configured = process.env.UPLOAD_DIR ?? "./var/uploads";
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

export async function saveDatasetFile(bytes: Uint8Array): Promise<string> {
  const dir = resolveUploadDir();
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.csv`;
  await writeFile(path.join(dir, fileName), bytes, { mode: 0o600 });
  return fileName;
}

export async function removeDatasetFile(storagePath: string): Promise<void> {
  const dir = resolveUploadDir();
  const fullPath = path.resolve(dir, storagePath);
  // Never follow a stored path that escapes the upload directory.
  if (!fullPath.startsWith(dir + path.sep)) return;
  await unlink(fullPath).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export type PersistDatasetInput = {
  userId: string;
  name: string;
  originalFilename: string;
  storagePath: string;
  byteSize: number;
  result: ImportResult;
};

// SQLite's parameter limit is generous, but chunking keeps every insert
// statement small and predictable regardless of dataset size.
const INSERT_CHUNK_SIZE = 500;

export async function persistDataset(
  input: PersistDatasetInput,
  database: PrismaClient = db,
) {
  const { result } = input;
  return database.$transaction(
    async (tx) => {
      const dataset = await tx.dataset.create({
        data: {
          userId: input.userId,
          name: input.name,
          originalFilename: input.originalFilename,
          storagePath: input.storagePath,
          byteSize: input.byteSize,
          encoding: result.encoding,
          rowCount: result.rows.length,
          rejectedCount: result.rejected.length,
          profileJson: JSON.stringify({
            blankLines: result.blankLines,
            headerNotes: result.headerNotes,
            ignoredEmptyColumns: result.ignoredEmptyColumns,
          }),
        },
      });

      if (result.columns.length > 0) {
        await tx.datasetColumn.createMany({
          data: result.columns.map((column) => ({
            datasetId: dataset.id,
            position: column.position,
            name: column.name,
            guessedType: column.guessedType,
            statsJson: JSON.stringify({
              reason: column.reason,
              ...column.stats,
            }),
          })),
        });
      }

      for (let i = 0; i < result.rows.length; i += INSERT_CHUNK_SIZE) {
        await tx.datasetRow.createMany({
          data: result.rows.slice(i, i + INSERT_CHUNK_SIZE).map((row) => ({
            datasetId: dataset.id,
            rowNumber: row.rowNumber,
            dataJson: JSON.stringify(row.values),
          })),
        });
      }

      if (result.rejected.length > 0) {
        await tx.rejectedRow.createMany({
          data: result.rejected.map((rejected) => ({
            datasetId: dataset.id,
            rowNumber: rejected.rowNumber,
            reason: rejected.reason,
            rawSnippet: rejected.rawSnippet,
          })),
        });
      }

      return dataset;
    },
    { timeout: 60_000 },
  );
}

// ---------------------------------------------------------------------------
// Access layer
//
// Every function takes the requesting user id and scopes its query by it.
// There is no "look up by id alone" variant, so a route that forgets an
// ownership check cannot accidentally leak another user's data.
// ---------------------------------------------------------------------------

export async function listDatasets(userId: string, database: PrismaClient = db) {
  return database.dataset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      originalFilename: true,
      rowCount: true,
      rejectedCount: true,
      byteSize: true,
      createdAt: true,
    },
  });
}

export async function getDatasetDetail(
  datasetId: string,
  userId: string,
  database: PrismaClient = db,
) {
  return database.dataset.findFirst({
    where: { id: datasetId, userId },
    include: {
      columns: { orderBy: { position: "asc" } },
      rejectedRows: { orderBy: { rowNumber: "asc" }, take: 50 },
    },
  });
}

export type DatasetDetail = NonNullable<
  Awaited<ReturnType<typeof getDatasetDetail>>
>;

export async function getDatasetPreviewRows(
  datasetId: string,
  limit = 10,
  database: PrismaClient = db,
) {
  return database.datasetRow.findMany({
    where: { datasetId },
    orderBy: { rowNumber: "asc" },
    take: limit,
  });
}

export async function renameDataset(
  datasetId: string,
  userId: string,
  name: string,
  database: PrismaClient = db,
): Promise<boolean> {
  const updated = await database.dataset.updateMany({
    where: { id: datasetId, userId },
    data: { name },
  });
  return updated.count === 1;
}

export async function deleteDataset(
  datasetId: string,
  userId: string,
  database: PrismaClient = db,
): Promise<boolean> {
  const dataset = await database.dataset.findFirst({
    where: { id: datasetId, userId },
    select: { id: true, storagePath: true },
  });
  if (!dataset) return false;
  await database.dataset.delete({ where: { id: dataset.id } });
  // Best effort: a leftover file is harmless, a dangling DB row is not.
  await removeDatasetFile(dataset.storagePath);
  return true;
}

// ---------------------------------------------------------------------------
// Stored JSON helpers
// ---------------------------------------------------------------------------

export type DatasetProfileMeta = {
  blankLines: number;
  headerNotes: string[];
  ignoredEmptyColumns: string[];
};

const EMPTY_PROFILE_META: DatasetProfileMeta = {
  blankLines: 0,
  headerNotes: [],
  ignoredEmptyColumns: [],
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseProfileMeta(profileJson: string): DatasetProfileMeta {
  try {
    const raw = JSON.parse(profileJson) as Partial<DatasetProfileMeta>;
    return {
      blankLines: typeof raw.blankLines === "number" ? raw.blankLines : 0,
      headerNotes: stringArray(raw.headerNotes),
      ignoredEmptyColumns: stringArray(raw.ignoredEmptyColumns),
    };
  } catch {
    return EMPTY_PROFILE_META;
  }
}

export type ParsedColumnStats = ColumnStats & { reason: string };

export function parseColumnStats(statsJson: string): ParsedColumnStats | null {
  try {
    const raw = JSON.parse(statsJson) as ParsedColumnStats;
    return typeof raw.reason === "string" ? raw : null;
  } catch {
    return null;
  }
}

/** Parses a stored row's JSON back into a column-name → value map. A corrupt
 * row renders as blanks rather than crashing whatever page is showing it. */
export function parseRowValues(dataJson: string): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(dataJson);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, string>;
    }
  } catch {
    // Fall through to the empty object.
  }
  return {};
}

export function deriveDatasetName(originalFilename: string): string {
  const base = originalFilename
    .replace(/\.csv$/i, "")
    .replace(/[/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return base.slice(0, 80) || "Untitled dataset";
}
