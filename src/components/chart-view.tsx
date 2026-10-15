"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartViewProps = {
  chartKind: "bar" | "line";
  points: Array<{ label: string; value: number }>;
  xLabel: string;
  yLabel: string;
};

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

export function ChartView({
  chartKind,
  points,
  xLabel,
  yLabel,
}: ChartViewProps) {
  const data = points.map((point) => ({
    label: point.label,
    value: point.value,
  }));
  const dense = data.length > 12;

  const axisProps = {
    x: {
      dataKey: "label",
      tick: { fontSize: 11, fill: "#57534e" },
      interval: (dense ? "preserveStartEnd" : 0) as 0 | "preserveStartEnd",
      angle: dense ? -30 : 0,
      textAnchor: (dense ? "end" : "middle") as "end" | "middle",
      height: dense ? 64 : 30,
    },
    y: {
      tick: { fontSize: 11, fill: "#57534e" },
      tickFormatter: (value: number) => compact.format(value),
      width: 56,
    },
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartKind === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
            <XAxis {...axisProps.x} />
            <YAxis {...axisProps.y} />
            <Tooltip
              formatter={(value) => [compact.format(Number(value)), yLabel]}
              labelFormatter={(label) => `${xLabel}: ${label}`}
            />
            <Bar
              dataKey="value"
              fill="#0f766e"
              radius={[3, 3, 0, 0]}
              name={yLabel}
            />
          </BarChart>
        ) : (
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
            <XAxis {...axisProps.x} />
            <YAxis {...axisProps.y} />
            <Tooltip
              formatter={(value) => [compact.format(Number(value)), yLabel]}
              labelFormatter={(label) => `${xLabel}: ${label}`}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#0f766e"
              strokeWidth={2}
              dot={data.length <= 40}
              name={yLabel}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
