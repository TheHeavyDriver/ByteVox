import { generateToken, sha256Hex } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma, PrismaClient, Report } from "@/generated/prisma/client";
import type { ComputeColumn, ComputeRow, DatasetLedger } from "@/lib/compute/engine";
import type { ColumnType } from "@/lib/csv/infer";
import type { DateDialect } from "@/lib/csv/value-parsers";
import {
  parseColumnStats,
  parseProfileMeta,
  parseRowValues,
} from "@/lib/datasets";
import {
  buildReportSnapshot,
  diffSnapshots,
  parseSnapshot,
  type ReportSnapshot,
} from "@/lib/report-diff";
import { blockDefinitionSchema } from "@/lib/report-spec";

/**
 * Reports: persistence, ownership-scoped access, mutation-with-revision, and
 * share links.
 *
 * Every mutation goes through mutateReport, which bumps the report version
 * and stores a snapshot revision in the same transaction. That single rule
 * is what makes "what changed since this link was shared" exact rather than
 * approximate.
 */

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const DEFAULT_BLOCK = blockDefinitionSchema.parse({
  type: "metric",
  metric: { kind: "count" },
});

export async function createReport(
  userId: string,
  datasetId: string,
  title: string,
  database: PrismaClient = db,
): Promise<Report | null> {
  const dataset = await database.dataset.findFirst({
    where: { id: datasetId, userId },
    select: { id: true },
  });
  if (!dataset) return null;

  return database.$transaction(
    async (tx) => {
      const report = await tx.report.create({
        data: { userId, datasetId: dataset.id, title, filterJson: "[]" },
      });
      await tx.block.create({
        data: {
          reportId: report.id,
          position: 0,
          type: DEFAULT_BLOCK.type,
          title: "",
          specJson: JSON.stringify(DEFAULT_BLOCK),
        },
      });
      // v1 gets a snapshot too, so a share link created before any edit can
      // still diff exactly ("what changed since this link was shared").
      const blocks = await tx.block.findMany({
        where: { reportId: report.id },
        orderBy: { position: "asc" },
      });
      await tx.reportRevision.create({
        data: {
          reportId: report.id,
          version: report.version,
          createdBy: userId,
          summaryJson: JSON.stringify(
            buildReportSnapshot({
              title: report.title,
              description: report.description,
              filterJson: report.filterJson,
              blocks,
            }),
          ),
        },
      });
      return report;
    },
    { timeout: 20_000 },
  );
}

export async function listReports(userId: string, database: PrismaClient = db) {
  return database.report.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      version: true,
      updatedAt: true,
      dataset: { select: { id: true, name: true } },
    },
  });
}

export async function getReportForUser(
  reportId: string,
  userId: string,
  database: PrismaClient = db,
) {
  return database.report.findFirst({
    where: { id: reportId, userId },
    include: {
      blocks: { orderBy: { position: "asc" } },
      dataset: true,
      shareLinks: { orderBy: { createdAt: "desc" } },
    },
  });
}

export type ReportDetail = NonNullable<
  Awaited<ReturnType<typeof getReportForUser>>
>;

export async function deleteReport(
  reportId: string,
  userId: string,
  database: PrismaClient = db,
): Promise<boolean> {
  const deleted = await database.report.deleteMany({
    where: { id: reportId, userId },
  });
  return deleted.count === 1;
}

/**
 * Applies a change to a report, bumps its version, and stores a snapshot
 * revision — all in one transaction, after checking ownership. This is the
 * only way report content ever changes.
 */
export async function mutateReport(
  reportId: string,
  userId: string,
  apply: (tx: Prisma.TransactionClient, report: Report) => Promise<void>,
  database: PrismaClient = db,
): Promise<boolean> {
  return database.$transaction(
    async (tx) => {
      const report = await tx.report.findFirst({
        where: { id: reportId, userId },
      });
      if (!report) return false;

      await apply(tx, report);

      const updated = await tx.report.update({
        where: { id: report.id },
        data: { version: { increment: 1 } },
      });
      const blocks = await tx.block.findMany({
        where: { reportId: report.id },
        orderBy: { position: "asc" },
      });
      await tx.reportRevision.create({
        data: {
          reportId: report.id,
          version: updated.version,
          createdBy: userId,
          summaryJson: JSON.stringify(
            buildReportSnapshot({
              title: updated.title,
              description: updated.description,
              filterJson: updated.filterJson,
              blocks,
            }),
          ),
        },
      });
      return true;
    },
    { timeout: 20_000 },
  );
}

// ---------------------------------------------------------------------------
// Compute input (loaded fresh from the database rows)
// ---------------------------------------------------------------------------

export type UiColumn = {
  name: string;
  guessedType: ColumnType;
  missing: number;
  distinct: number;
  samples: string[];
  dialect: DateDialect;
};

export type ReportDatasetContext = {
  datasetName: string;
  ledger: DatasetLedger;
  computeColumns: ComputeColumn[];
  uiColumns: UiColumn[];
  rows: ComputeRow[];
};

export async function loadReportDatasetContext(
  datasetId: string,
  database: PrismaClient = db,
): Promise<ReportDatasetContext | null> {
  const dataset = await database.dataset.findFirst({
    where: { id: datasetId },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  if (!dataset) return null;

  const meta = parseProfileMeta(dataset.profileJson);

  const rowRecords = await database.datasetRow.findMany({
    where: { datasetId },
    orderBy: { rowNumber: "asc" },
    select: { rowNumber: true, dataJson: true },
  });

  const uiColumns: UiColumn[] = dataset.columns.map((column) => {
    const stats = parseColumnStats(column.statsJson);
    return {
      name: column.name,
      guessedType: column.guessedType as ColumnType,
      missing: stats?.missing ?? 0,
      distinct: stats?.distinct ?? 0,
      samples: stats?.samples ?? [],
      dialect: stats?.date?.dialect ?? "day-first",
    };
  });

  return {
    datasetName: dataset.name,
    ledger: {
      fileRows: dataset.rowCount + dataset.rejectedCount,
      usableRows: dataset.rowCount,
      rejectedRows: dataset.rejectedCount,
      blankLines: meta.blankLines,
    },
    computeColumns: uiColumns.map((column) => ({
      name: column.name,
      guessedType: column.guessedType,
      dateDialect: column.dialect,
    })),
    uiColumns,
    rows: rowRecords.map((record) => ({
      rowNumber: record.rowNumber,
      values: parseRowValues(record.dataJson),
    })),
  };
}

// ---------------------------------------------------------------------------
// "What changed" — diff of the live report against a stored version
// ---------------------------------------------------------------------------

export type ReportDiff = {
  changed: boolean;
  currentVersion: number;
  items: string[];
};

export async function getReportDiffSince(
  reportId: string,
  fromVersion: number,
  database: PrismaClient = db,
): Promise<ReportDiff | null> {
  const report = await database.report.findUnique({
    where: { id: reportId },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
  if (!report) return null;

  if (report.version <= fromVersion) {
    return { changed: false, currentVersion: report.version, items: [] };
  }

  const revision = await database.reportRevision.findFirst({
    where: { reportId, version: fromVersion },
  });
  const from: ReportSnapshot | null = revision
    ? parseSnapshot(revision.summaryJson)
    : null;
  const to = buildReportSnapshot({
    title: report.title,
    description: report.description,
    filterJson: report.filterJson,
    blocks: report.blocks,
  });

  return {
    changed: true,
    currentVersion: report.version,
    items: from
      ? diffSnapshots(from, to)
      : ["The earlier snapshot is unavailable, but this report has been updated."],
  };
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export const SHARE_MAX_DAYS = 90;
export const SHARE_DEFAULT_DAYS = 7;

export function shareStatus(
  link: { revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): "active" | "expired" | "revoked" {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/**
 * Creates a share link. The plaintext token is returned exactly once — only
 * its SHA-256 hash is stored (same rule as session tokens).
 */
export async function createShareLink(
  reportId: string,
  userId: string,
  expiresInDays: number,
  database: PrismaClient = db,
): Promise<{ token: string; linkId: string } | null> {
  const report = await database.report.findFirst({
    where: { id: reportId, userId },
    select: { id: true, version: true },
  });
  if (!report) return null;

  const days = Math.min(
    Math.max(Math.round(expiresInDays), 1),
    SHARE_MAX_DAYS,
  );
  const token = generateToken();
  const link = await database.shareLink.create({
    data: {
      reportId: report.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      versionAtShare: report.version,
    },
    select: { id: true },
  });
  return { token, linkId: link.id };
}

export async function revokeShareLink(
  linkId: string,
  reportId: string,
  userId: string,
  database: PrismaClient = db,
): Promise<boolean> {
  const report = await database.report.findFirst({
    where: { id: reportId, userId },
    select: { id: true },
  });
  if (!report) return false;
  const revoked = await database.shareLink.updateMany({
    where: { id: linkId, reportId: report.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return revoked.count === 1;
}

export type SharedReport = Prisma.ReportGetPayload<{
  include: { blocks: true; dataset: true };
}>;

export type ShareResolution =
  | { status: "invalid" | "revoked" | "expired" }
  | {
      status: "ok";
      link: {
        id: string;
        createdAt: Date;
        expiresAt: Date;
        versionAtShare: number;
      };
      report: SharedReport;
    };

/**
 * Resolves a share token to its report (latest version) or a reason it
 * cannot be shown. The only key is the token itself — deliberately no
 * access to the raw uploaded file.
 */
export async function resolveShareLink(
  token: string,
  database: PrismaClient = db,
  now: Date = new Date(),
): Promise<ShareResolution> {
  if (!token || token.length > 200) return { status: "invalid" };

  const link = await database.shareLink.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      report: {
        include: {
          blocks: { orderBy: { position: "asc" } },
          dataset: true,
        },
      },
    },
  });
  if (!link) return { status: "invalid" };
  if (link.revokedAt) return { status: "revoked" };
  if (link.expiresAt.getTime() <= now.getTime()) return { status: "expired" };

  return {
    status: "ok",
    link: {
      id: link.id,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      versionAtShare: link.versionAtShare,
    },
    report: link.report,
  };
}
