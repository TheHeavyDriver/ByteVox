import {
  describeBlock,
  describeFilter,
  parseBlockDefinition,
  parseFilterList,
} from "@/lib/report-spec";

/**
 * Report snapshots and diffs — the machinery behind "what changed".
 *
 * Every mutation stores a snapshot (small, human-readable) in a revision
 * row. The public share view diffs the snapshot at the version the link was
 * created against the live report, so a viewer never has to guess what moved.
 */

export type SnapshotBlock = { id: string; type: string; label: string };

export type ReportSnapshot = {
  title: string;
  description: string;
  filters: string[];
  blocks: SnapshotBlock[];
};

export function buildReportSnapshot(input: {
  title: string;
  description: string;
  filterJson: string;
  blocks: Array<{ id: string; type: string; title?: string; specJson: string }>;
}): ReportSnapshot {
  return {
    title: input.title,
    description: input.description,
    filters: parseFilterList(input.filterJson).map(describeFilter),
    blocks: input.blocks.map((block) => {
      const definition = parseBlockDefinition(block.specJson);
      const base = definition ? describeBlock(definition) : "(unreadable block)";
      return {
        id: block.id,
        type: block.type,
        label: block.title ? `${block.title} — ${base}` : base,
      };
    }),
  };
}

export function parseSnapshot(json: string): ReportSnapshot | null {
  try {
    const raw = JSON.parse(json) as Partial<ReportSnapshot>;
    if (typeof raw.title !== "string") return null;
    return {
      title: raw.title,
      description: typeof raw.description === "string" ? raw.description : "",
      filters: Array.isArray(raw.filters)
        ? raw.filters.filter((item): item is string => typeof item === "string")
        : [],
      blocks: Array.isArray(raw.blocks)
        ? raw.blocks.filter(
            (block): block is SnapshotBlock =>
              !!block &&
              typeof block.id === "string" &&
              typeof block.type === "string" &&
              typeof block.label === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
}

function typeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function diffSnapshots(
  from: ReportSnapshot,
  to: ReportSnapshot,
): string[] {
  const items: string[] = [];

  if (from.title !== to.title) {
    items.push(`Title: “${from.title}” → “${to.title}”`);
  }
  if (from.description !== to.description) {
    items.push("Description updated");
  }

  const addedFilters = to.filters.filter((f) => !from.filters.includes(f));
  const removedFilters = from.filters.filter((f) => !to.filters.includes(f));
  for (const filter of addedFilters) items.push(`Filter added: ${filter}`);
  for (const filter of removedFilters) items.push(`Filter removed: ${filter}`);

  const fromById = new Map(from.blocks.map((block) => [block.id, block]));
  const toById = new Map(to.blocks.map((block) => [block.id, block]));

  for (const block of to.blocks) {
    const previous = fromById.get(block.id);
    if (!previous) {
      items.push(`${typeLabel(block.type)} block added: ${block.label}`);
    } else if (previous.label !== block.label || previous.type !== block.type) {
      items.push(
        `${typeLabel(block.type)} block changed: ${previous.label} → ${block.label}`,
      );
    }
  }
  for (const block of from.blocks) {
    if (!toById.has(block.id)) {
      items.push(`${typeLabel(block.type)} block removed: ${block.label}`);
    }
  }

  const commonFrom = from.blocks
    .filter((block) => toById.has(block.id))
    .map((block) => block.id);
  const commonTo = to.blocks
    .filter((block) => fromById.has(block.id))
    .map((block) => block.id);
  if (commonFrom.join(",") !== commonTo.join(",")) {
    items.push("Blocks reordered");
  }

  return items;
}
