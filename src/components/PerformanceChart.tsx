"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  readonly date: string;
  readonly score: number;
}

interface PerformanceChartProps {
  readonly data: readonly DataPoint[];
  readonly title?: string;
}

interface TooltipPayloadItem {
  readonly value: number;
  readonly name: string;
}

interface CustomTooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly TooltipPayloadItem[];
  readonly label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="glass-card p-3 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="text-pos font-bold tabular-nums">
        Alpha Score: {payload[0].value.toFixed(1)}
      </p>
    </div>
  );
}

export default function PerformanceChart({
  data,
  title = "Alpha Score Over Time",
}: PerformanceChartProps) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-white font-semibold text-sm mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data as DataPoint[]}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#1e1e2e" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#1e1e2e" }}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={50}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label={{
                value: "Neutral",
                fill: "#6b7280",
                fontSize: 10,
                position: "right",
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#26de81"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: "#26de81",
                stroke: "#0a0a0f",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
