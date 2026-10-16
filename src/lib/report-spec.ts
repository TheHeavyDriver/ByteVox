import { z } from "zod";

// Report specs: filters, blocks, and their validated shapes.
//
// Everything the user can type into the builder passes through these schemas
// before it is stored or executed, so the compute engine only ever sees
// well-formed specs. The types exported here are the source of truth for
// both the server and the UI.

export const filterConditionSchema = z.discriminatedUnion("op", [
  z.object({
    column: z.string().min(1),
    op: z.literal("contains"),
    value: z.string().trim().min(1, "Provide text to match."),
  }),
  z.object({
    column: z.string().min(1),
    op: z.literal("equals"),
    value: z.string().trim().min(1, "Provide a value to match."),
  }),
  z.object({ column: z.string().min(1), op: z.literal("isBlank") }),
  z.object({ column: z.string().min(1), op: z.literal("notBlank") }),
  z.object({
    column: z.string().min(1),
    op: z.literal("numberBetween"),
    min: z.number().nullable(),
    max: z.number().nullable(),
  }),
  z.object({
    column: z.string().min(1),
    op: z.literal("dateBetween"),
    // inclusive ISO dates (yyyy-MM-dd); either side can be null
    min: z.string().nullable(),
    max: z.string().nullable(),
  }),
]);

export type FilterCondition = z.infer<typeof filterConditionSchema>;
export const filterListSchema = z.array(filterConditionSchema).max(10);

export function describeFilter(condition: FilterCondition): string {
  switch (condition.op) {
    case "contains":
      return `${condition.column} contains “${condition.value}”`;
    case "equals":
      return `${condition.column} equals “${condition.value}”`;
    case "isBlank":
      return `${condition.column} is blank`;
    case "notBlank":
      return `${condition.column} is not blank`;
    case "numberBetween": {
      const parts: string[] = [];
      if (condition.min !== null) parts.push(`${condition.min}`);
      if (condition.max !== null) parts.push(`${condition.max}`);
      const range =
        condition.min !== null && condition.max !== null
          ? `${condition.min} and ${condition.max}`
          : parts[0] ?? "any number";
      return `${condition.column} is between ${range}`;
    }
    case "dateBetween": {
      if (condition.min && condition.max) {
        return `${condition.column} is between ${condition.min} and ${condition.max}`;
      }
      if (condition.min) return `${condition.column} is on or after ${condition.min}`;
      if (condition.max) return `${condition.column} is on or before ${condition.max}`;
      return `${condition.column} is a date`;
    }
  }
}

export const metricSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("distinctCount"), column: z.string().min(1) }),
  z.object({
    kind: z.enum(["sum", "mean", "median", "min", "max"]),
    column: z.string().min(1),
  }),
]);

export type MetricSpec = z.infer<typeof metricSpecSchema>;

export function describeMetric(spec: MetricSpec): string {
  switch (spec.kind) {
    case "count":
      return "Row count";
    case "distinctCount":
      return `Distinct values of ${spec.column}`;
    case "sum":
      return `Sum of ${spec.column}`;
    case "mean":
      return `Mean of ${spec.column}`;
    case "median":
      return `Median of ${spec.column}`;
    case "min":
      return `Minimum of ${spec.column}`;
    case "max":
      return `Maximum of ${spec.column}`;
  }
}

export const chartMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.enum(["sum", "mean"]), column: z.string().min(1) }),
]);

export type ChartMetric = z.infer<typeof chartMetricSchema>;

export const chartSpecSchema = z.object({
  chartKind: z.enum(["bar", "line"]),
  groupBy: z.string().min(1),
  metric: chartMetricSchema,
  topN: z.number().int().min(3).max(50).default(10),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;

export function describeChartMetric(spec: ChartMetric): string {
  switch (spec.kind) {
    case "count":
      return "row count";
    case "sum":
      return `sum of ${spec.column}`;
    case "mean":
      return `mean of ${spec.column}`;
  }
}

export const tableSpecSchema = z.object({
  columns: z.array(z.string().min(1)).min(1).max(12),
  limit: z.number().int().min(1).max(100).default(10),
});

export type TableSpec = z.infer<typeof tableSpecSchema>;

export const noteSpecSchema = z.object({
  text: z.string().max(2000),
});

export type NoteSpec = z.infer<typeof noteSpecSchema>;

export const blockDefinitionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("metric"),
    title: z.string().trim().max(120).default(""),
    metric: metricSpecSchema,
  }),
  z.object({
    type: z.literal("chart"),
    title: z.string().trim().max(120).default(""),
    chart: chartSpecSchema,
  }),
  z.object({
    type: z.literal("table"),
    title: z.string().trim().max(120).default(""),
    table: tableSpecSchema,
  }),
  z.object({
    type: z.literal("note"),
    title: z.string().trim().max(120).default(""),
    note: noteSpecSchema,
  }),
]);

export type BlockDefinition = z.infer<typeof blockDefinitionSchema>;

export function describeBlock(definition: BlockDefinition): string {
  switch (definition.type) {
    case "metric":
      return describeMetric(definition.metric);
    case "chart":
      return `${describeChartMetric(definition.chart.metric)} by ${definition.chart.groupBy}`;
    case "table":
      return `Rows: ${definition.table.columns.join(", ")}`;
    case "note": {
      const text = definition.note.text.trim().replace(/\s+/g, " ");
      if (!text) return "Empty note";
      return `Note: ${text.length > 60 ? `${text.slice(0, 59)}…` : text}`;
    }
  }
}

// Corrupt stored JSON parses to null instead of throwing.
export function parseBlockDefinition(specJson: string): BlockDefinition | null {
  try {
    const parsed = blockDefinitionSchema.safeParse(JSON.parse(specJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Same idea for stored filters; corrupt data parses to [].
export function parseFilterList(filterJson: string): FilterCondition[] {
  try {
    const parsed = filterListSchema.safeParse(JSON.parse(filterJson));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
