"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createReport,
  createShareLink,
  deleteReport,
  mutateReport,
  revokeShareLink,
  SHARE_DEFAULT_DAYS,
  SHARE_MAX_DAYS,
} from "@/lib/reports";
import {
  blockDefinitionSchema,
  filterConditionSchema,
  parseFilterList,
  type BlockDefinition,
  type FilterCondition,
} from "@/lib/report-spec";
import { getCurrentUser } from "@/lib/session";

function revalidateReport(reportId: string): void {
  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Report lifecycle
// ---------------------------------------------------------------------------

const createReportSchema = z.object({
  datasetId: z.string().min(1),
  title: z.string().trim().max(120).optional(),
});

export async function createReportAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = createReportSchema.safeParse({
    datasetId: formData.get("datasetId"),
    title: formData.get("title") ?? undefined,
  });
  if (!parsed.success) redirect("/");

  const title = parsed.data.title || "Untitled report";
  const report = await createReport(user.id, parsed.data.datasetId, title);
  if (!report) redirect("/");

  revalidatePath("/");
  redirect(`/reports/${report.id}`);
}

const reportMetaSchema = z.object({
  reportId: z.string().min(1),
  title: z.string().trim().min(1, "Title cannot be blank.").max(120),
  description: z.string().trim().max(2000),
});

export async function updateReportMetaAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = reportMetaSchema.safeParse({
    reportId: formData.get("reportId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return;

  const changed = await mutateReport(
    parsed.data.reportId,
    user.id,
    async (tx) => {
      await tx.report.update({
        where: { id: parsed.data.reportId },
        data: {
          title: parsed.data.title,
          description: parsed.data.description,
        },
      });
    },
  );
  if (changed) revalidateReport(parsed.data.reportId);
}

export async function deleteReportAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;

  const deleted = await deleteReport(reportId, user.id);
  revalidatePath("/");
  if (deleted) redirect("/");
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type FilterFormState = { error: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildConditionFromForm(
  formData: FormData,
): { ok: true; condition: FilterCondition } | { ok: false; error: string } {
  const column = String(formData.get("column") ?? "");
  const op = String(formData.get("op") ?? "");

  let candidate: unknown;
  switch (op) {
    case "contains":
    case "equals":
      candidate = { column, op, value: String(formData.get("value") ?? "") };
      break;
    case "isBlank":
    case "notBlank":
      candidate = { column, op };
      break;
    case "numberBetween": {
      const minRaw = String(formData.get("min") ?? "").trim();
      const maxRaw = String(formData.get("max") ?? "").trim();
      if (minRaw === "" && maxRaw === "") {
        return { ok: false, error: "Enter at least one bound." };
      }
      const min = minRaw === "" ? null : Number(minRaw);
      const max = maxRaw === "" ? null : Number(maxRaw);
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
        return { ok: false, error: "Bounds must be numbers." };
      }
      if (min !== null && max !== null && min > max) {
        return { ok: false, error: "The minimum is greater than the maximum." };
      }
      candidate = { column, op, min, max };
      break;
    }
    case "dateBetween": {
      const min = String(formData.get("min") ?? "").trim() || null;
      const max = String(formData.get("max") ?? "").trim() || null;
      if (!min && !max) {
        return { ok: false, error: "Enter at least one date." };
      }
      if ((min && !ISO_DATE.test(min)) || (max && !ISO_DATE.test(max))) {
        return { ok: false, error: "Dates must look like 2024-01-31." };
      }
      if (min && max && min > max) {
        return { ok: false, error: "The start date is after the end date." };
      }
      candidate = { column, op, min, max };
      break;
    }
    default:
      return { ok: false, error: "Choose a filter type." };
  }

  const parsed = filterConditionSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That filter is not valid.",
    };
  }
  return { ok: true, condition: parsed.data };
}

export async function addFilterAction(
  _prev: FilterFormState,
  formData: FormData,
): Promise<FilterFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };

  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return { error: "Missing report." };

  const built = buildConditionFromForm(formData);
  if (!built.ok) return { error: built.error };

  let failure: string | null = null;
  const changed = await mutateReport(reportId, user.id, async (tx, report) => {
    const filters = parseFilterList(report.filterJson);
    if (filters.length >= 10) {
      failure = "A report can carry at most 10 filters.";
      return;
    }
    const next = [...filters, built.condition];
    await tx.report.update({
      where: { id: report.id },
      data: { filterJson: JSON.stringify(next) },
    });
  });
  if (!changed) return { error: "Report not found." };
  if (failure) return { error: failure };
  revalidateReport(reportId);
  return { error: null };
}

export async function removeFilterAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reportId = String(formData.get("reportId") ?? "");
  const index = Number(formData.get("index"));
  if (!reportId || !Number.isInteger(index) || index < 0) return;

  const changed = await mutateReport(reportId, user.id, async (tx, report) => {
    const filters = parseFilterList(report.filterJson);
    const next = filters.filter((_, i) => i !== index);
    await tx.report.update({
      where: { id: report.id },
      data: { filterJson: JSON.stringify(next) },
    });
  });
  if (changed) revalidateReport(reportId);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type BlockFormState = { error: string | null };

/** One report can hold this many blocks; the add action reports the cap. */
const MAX_BLOCKS = 30;

function buildDefinitionFromForm(
  formData: FormData,
):
  | { ok: true; definition: BlockDefinition; title: string }
  | { ok: false; error: string } {
  const type = String(formData.get("type") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  let candidate: unknown;
  switch (type) {
    case "metric": {
      const kind = String(formData.get("metricKind") ?? "count");
      if (kind === "count") {
        candidate = { type: "metric", title, metric: { kind: "count" } };
      } else {
        candidate = {
          type: "metric",
          title,
          metric: { kind, column: String(formData.get("metricColumn") ?? "") },
        };
      }
      break;
    }
    case "chart": {
      const chartKind = String(formData.get("chartKind") ?? "bar");
      const groupBy = String(formData.get("groupBy") ?? "");
      const metricKind = String(formData.get("chartMetricKind") ?? "count");
      const metric =
        metricKind === "count"
          ? { kind: "count" }
          : {
              kind: metricKind,
              column: String(formData.get("chartMetricColumn") ?? ""),
            };
      const topNRaw = Number(formData.get("topN") ?? 10);
      candidate = {
        type: "chart",
        title,
        chart: {
          chartKind,
          groupBy,
          metric,
          topN: Number.isFinite(topNRaw) ? topNRaw : 10,
        },
      };
      break;
    }
    case "table": {
      const columns = formData.getAll("tableColumns").map(String);
      const limitRaw = Number(formData.get("tableLimit") ?? 10);
      candidate = {
        type: "table",
        title,
        table: {
          columns,
          limit: Number.isFinite(limitRaw) ? limitRaw : 10,
        },
      };
      break;
    }
    case "note":
      candidate = {
        type: "note",
        title,
        note: { text: String(formData.get("noteText") ?? "") },
      };
      break;
    default:
      return { ok: false, error: "Choose a block type." };
  }

  const parsed = blockDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "That block configuration is not valid.",
    };
  }
  // The block title lives in the Block row, not in the definition.
  return { ok: true, definition: { ...parsed.data, title: "" }, title };
}

export async function addBlockAction(
  _prev: BlockFormState,
  formData: FormData,
): Promise<BlockFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };

  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return { error: "Missing report." };

  const built = buildDefinitionFromForm(formData);
  if (!built.ok) return { error: built.error };

  let failure: string | null = null;
  const changed = await mutateReport(reportId, user.id, async (tx, report) => {
    const count = await tx.block.count({ where: { reportId: report.id } });
    if (count >= MAX_BLOCKS) {
      failure = `A report can hold at most ${MAX_BLOCKS} blocks.`;
      return;
    }
    const highest = await tx.block.aggregate({
      where: { reportId: report.id },
      _max: { position: true },
    });
    await tx.block.create({
      data: {
        reportId: report.id,
        position: (highest._max.position ?? -1) + 1,
        type: built.definition.type,
        title: built.title,
        specJson: JSON.stringify(built.definition),
      },
    });
  });
  if (!changed) return { error: "Report not found." };
  if (failure) return { error: failure };
  revalidateReport(reportId);
  return { error: null };
}

export async function updateBlockAction(
  _prev: BlockFormState,
  formData: FormData,
): Promise<BlockFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };

  const reportId = String(formData.get("reportId") ?? "");
  const blockId = String(formData.get("blockId") ?? "");
  if (!reportId || !blockId) return { error: "Missing report or block." };

  const built = buildDefinitionFromForm(formData);
  if (!built.ok) return { error: built.error };

  const changed = await mutateReport(reportId, user.id, async (tx, report) => {
    await tx.block.updateMany({
      where: { id: blockId, reportId: report.id },
      data: {
        type: built.definition.type,
        title: built.title,
        specJson: JSON.stringify(built.definition),
      },
    });
  });
  if (!changed) return { error: "Report not found." };
  revalidateReport(reportId);
  return { error: null };
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reportId = String(formData.get("reportId") ?? "");
  const blockId = String(formData.get("blockId") ?? "");
  if (!reportId || !blockId) return;

  const changed = await mutateReport(reportId, user.id, async (tx, report) => {
    await tx.block.deleteMany({ where: { id: blockId, reportId: report.id } });
  });
  if (changed) revalidateReport(reportId);
}

export async function moveBlockAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reportId = String(formData.get("reportId") ?? "");
  const blockId = String(formData.get("blockId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!reportId || !blockId || (direction !== "up" && direction !== "down")) {
    return;
  }

  const changed = await mutateReport(reportId, user.id, async (tx, report) => {
    const blocks = await tx.block.findMany({
      where: { reportId: report.id },
      orderBy: { position: "asc" },
    });
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= blocks.length) return;
    const a = blocks[index]!;
    const b = blocks[swapWith]!;
    await tx.block.update({
      where: { id: a.id },
      data: { position: b.position },
    });
    await tx.block.update({
      where: { id: b.id },
      data: { position: a.position },
    });
  });
  if (changed) revalidateReport(reportId);
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export type ShareFormState = { url: string | null; error: string | null };

export async function createShareLinkAction(
  _prev: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  const user = await getCurrentUser();
  if (!user) return { url: null, error: "Your session expired. Sign in and try again." };

  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return { url: null, error: "Missing report." };

  const daysRaw = Number(formData.get("days") ?? SHARE_DEFAULT_DAYS);
  const days = Number.isFinite(daysRaw)
    ? Math.min(Math.max(Math.round(daysRaw), 1), SHARE_MAX_DAYS)
    : SHARE_DEFAULT_DAYS;

  const created = await createShareLink(reportId, user.id, days);
  if (!created) return { url: null, error: "Report not found." };

  const headerBag = await headers();
  const host = headerBag.get("host") ?? "localhost:3000";
  const proto = headerBag.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/s/${created.token}`;

  revalidatePath(`/reports/${reportId}/share`);
  return { url, error: null };
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reportId = String(formData.get("reportId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  if (!reportId || !linkId) return;

  const revoked = await revokeShareLink(linkId, reportId, user.id);
  if (revoked) revalidatePath(`/reports/${reportId}/share`);
}
