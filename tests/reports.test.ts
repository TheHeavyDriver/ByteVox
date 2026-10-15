import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createReport,
  createShareLink,
  deleteReport,
  getReportDiffSince,
  getReportForUser,
  loadReportDatasetContext,
  mutateReport,
  resolveShareLink,
  revokeShareLink,
  shareStatus,
} from "@/lib/reports";

/**
 * These tests run against var/test.db (see vitest.config.mts). Every fixture
 * is created under a fresh user; afterAll deletes those users, and the
 * schema's cascades clean up everything they own.
 */

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await db.$disconnect();
});

async function makeUser() {
  const user = await db.user.create({
    data: {
      email: `test-${randomUUID()}@example.com`,
      passwordHash: "scrypt:00:00",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

const COLUMN_STATS = JSON.stringify({
  reason: "test fixture",
  missing: 0,
  distinct: 2,
  samples: ["North"],
  date: { dialect: "day-first" },
});

async function makeDataset(userId: string) {
  const dataset = await db.dataset.create({
    data: {
      userId,
      name: "test dataset",
      originalFilename: "test.csv",
      storagePath: "test.csv",
      byteSize: 123,
      encoding: "utf-8",
      rowCount: 2,
      rejectedCount: 1,
      profileJson: JSON.stringify({
        blankLines: 1,
        headerNotes: [],
        ignoredEmptyColumns: [],
      }),
    },
  });
  await db.datasetColumn.createMany({
    data: [
      {
        datasetId: dataset.id,
        position: 0,
        name: "region",
        guessedType: "category",
        statsJson: COLUMN_STATS,
      },
      {
        datasetId: dataset.id,
        position: 1,
        name: "amount",
        guessedType: "number",
        statsJson: COLUMN_STATS,
      },
    ],
  });
  await db.datasetRow.createMany({
    data: [
      {
        datasetId: dataset.id,
        rowNumber: 1,
        dataJson: JSON.stringify({ region: "North", amount: "10" }),
      },
      {
        datasetId: dataset.id,
        rowNumber: 2,
        dataJson: JSON.stringify({ region: "South", amount: "20" }),
      },
    ],
  });
  return dataset;
}

describe("reports and revisions", () => {
  it("createReport seeds a v1 revision and a default row-count block", async () => {
    const user = await makeUser();
    const dataset = await makeDataset(user.id);

    const report = await createReport(user.id, dataset.id, "My report");
    expect(report).not.toBeNull();

    const detail = await getReportForUser(report!.id, user.id);
    expect(detail?.blocks).toHaveLength(1);
    expect(detail?.blocks[0]!.type).toBe("metric");

    const revisions = await db.reportRevision.findMany({
      where: { reportId: report!.id },
    });
    expect(revisions.map((revision) => revision.version)).toEqual([1]);
  });

  it("createReport refuses another user's dataset", async () => {
    const owner = await makeUser();
    const dataset = await makeDataset(owner.id);
    const stranger = await makeUser();

    expect(await createReport(stranger.id, dataset.id, "Stolen")).toBeNull();
  });

  it("mutateReport bumps the version, snapshots it, and diffs exactly", async () => {
    const user = await makeUser();
    const dataset = await makeDataset(user.id);
    const report = (await createReport(user.id, dataset.id, "Diff me"))!;

    const changed = await mutateReport(report.id, user.id, async (tx) => {
      await tx.report.update({
        where: { id: report.id },
        data: {
          filterJson: JSON.stringify([
            { column: "region", op: "equals", value: "North" },
          ]),
        },
      });
    });
    expect(changed).toBe(true);

    const after = await db.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(after.version).toBe(2);

    const revisions = await db.reportRevision.findMany({
      where: { reportId: report.id },
      orderBy: { version: "asc" },
    });
    expect(revisions.map((revision) => revision.version)).toEqual([1, 2]);

    const diff = await getReportDiffSince(report.id, 1);
    expect(diff?.changed).toBe(true);
    expect(diff?.items ?? []).toContain(
      "Filter added: region equals “North”",
    );

    const unchanged = await getReportDiffSince(report.id, 2);
    expect(unchanged).toEqual({ changed: false, currentVersion: 2, items: [] });
  });

  it("mutateReport refuses a non-owner without touching the report", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const dataset = await makeDataset(owner.id);
    const report = (await createReport(owner.id, dataset.id, "Mine"))!;

    const changed = await mutateReport(report.id, stranger.id, async (tx) => {
      await tx.report.delete({ where: { id: report.id } });
    });
    expect(changed).toBe(false);

    const after = await db.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(after.version).toBe(1);
  });

  it("deleteReport is owner-scoped and cascades", async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const dataset = await makeDataset(user.id);
    const report = (await createReport(user.id, dataset.id, "Delete me"))!;
    await createShareLink(report.id, user.id, 7);

    expect(await deleteReport(report.id, stranger.id)).toBe(false);
    expect(await deleteReport(report.id, user.id)).toBe(true);
    expect(await db.block.count({ where: { reportId: report.id } })).toBe(0);
    expect(
      await db.reportRevision.count({ where: { reportId: report.id } }),
    ).toBe(0);
    expect(await db.shareLink.count({ where: { reportId: report.id } })).toBe(0);
  });
});

describe("share links", () => {
  it("creates a link whose token resolves only before revocation or expiry", async () => {
    const user = await makeUser();
    const dataset = await makeDataset(user.id);
    const report = (await createReport(user.id, dataset.id, "Share me"))!;
    await mutateReport(report.id, user.id, async (tx) => {
      await tx.report.update({
        where: { id: report.id },
        data: { filterJson: JSON.stringify([{ column: "region", op: "notBlank" }]) },
      });
    });

    const created = await createShareLink(report.id, user.id, 7);
    expect(created).not.toBeNull();

    const resolved = await resolveShareLink(created!.token);
    expect(resolved.status).toBe("ok");
    if (resolved.status === "ok") {
      expect(resolved.report.id).toBe(report.id);
      expect(resolved.link.versionAtShare).toBe(2);
    }

    expect((await resolveShareLink("not-a-real-token")).status).toBe("invalid");
    expect((await resolveShareLink("")).status).toBe("invalid");

    expect(await revokeShareLink(created!.linkId, report.id, user.id)).toBe(
      true,
    );
    expect((await resolveShareLink(created!.token)).status).toBe("revoked");
  });

  it("treats a past expiry as expired without any cookie or session", async () => {
    const user = await makeUser();
    const dataset = await makeDataset(user.id);
    const report = (await createReport(user.id, dataset.id, "Old link"))!;

    await db.shareLink.create({
      data: {
        reportId: report.id,
        tokenHash: sha256Hex("expired-token"),
        expiresAt: new Date(Date.now() - 1000),
        versionAtShare: 1,
      },
    });

    expect((await resolveShareLink("expired-token")).status).toBe("expired");
  });

  it("refuses link creation and revocation by non-owners", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const dataset = await makeDataset(owner.id);
    const report = (await createReport(owner.id, dataset.id, "Private"))!;

    expect(await createShareLink(report.id, stranger.id, 7)).toBeNull();

    const link = await createShareLink(report.id, owner.id, 1);
    expect(
      await revokeShareLink(link!.linkId, report.id, stranger.id),
    ).toBe(false);
    expect(await revokeShareLink("no-such-link", report.id, owner.id)).toBe(
      false,
    );
  });

  it("classifies link status", () => {
    const now = new Date();
    expect(
      shareStatus(
        { revokedAt: now, expiresAt: new Date(now.getTime() + 1000) },
        now,
      ),
    ).toBe("revoked");
    expect(
      shareStatus(
        { revokedAt: null, expiresAt: new Date(now.getTime() - 1000) },
        now,
      ),
    ).toBe("expired");
    expect(
      shareStatus(
        { revokedAt: null, expiresAt: new Date(now.getTime() + 1000) },
        now,
      ),
    ).toBe("active");
  });
});

describe("dataset context and deletion", () => {
  it("loads rows and columns that mirror the dataset ledger", async () => {
    const user = await makeUser();
    const dataset = await makeDataset(user.id);

    const ctx = await loadReportDatasetContext(dataset.id);
    expect(ctx).not.toBeNull();
    expect(ctx!.ledger).toEqual({
      fileRows: 3,
      usableRows: 2,
      rejectedRows: 1,
      blankLines: 1,
    });
    expect(ctx!.rows).toHaveLength(2);
    expect(ctx!.rows[0]!.values).toEqual({ region: "North", amount: "10" });
    expect(ctx!.uiColumns.map((column) => column.name)).toEqual([
      "region",
      "amount",
    ]);
    expect(ctx!.uiColumns[1]!.guessedType).toBe("number");
  });

  it("deleting a dataset leaves the report but clears its datasetId", async () => {
    const user = await makeUser();
    const dataset = await makeDataset(user.id);
    const report = (await createReport(user.id, dataset.id, "Kept"))!;

    await db.dataset.delete({ where: { id: dataset.id } });

    const after = await db.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(after.datasetId).toBeNull();
    expect(await loadReportDatasetContext(dataset.id)).toBeNull();
  });
});
