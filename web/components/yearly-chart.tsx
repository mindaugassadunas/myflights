"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";

type Row = {
  year: number;
  flights: number;
  km: number;
  hours: number;
};

/**
 * Year-over-year combo chart: bars for flight count (left axis, accent),
 * line for distance in km (right axis, amber). Tapping a bar navigates
 * to `/log?year={year}` so the user can drill in.
 */
export function YearlyChart({ data }: { data: Row[] }) {
  const router = useRouter();

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#1F2228" vertical={false} />
        <XAxis
          dataKey="year"
          stroke="#8B9099"
          tickLine={false}
          axisLine={false}
          tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
        />
        <YAxis
          yAxisId="flights"
          stroke="#8B9099"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}`}
          tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: "#00D4FF" }}
          width={28}
        />
        <YAxis
          yAxisId="km"
          orientation="right"
          stroke="#8B9099"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
          tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: "#E8A547" }}
          width={32}
        />
        <Tooltip
          cursor={{ fill: "#1A1D23" }}
          contentStyle={{
            background: "#13151A",
            border: "1px solid #1F2228",
            borderRadius: 2,
            fontSize: 12,
            fontFamily: "JetBrains Mono, monospace",
            color: "#E8EAED",
          }}
          formatter={(value, name) => {
            const v = typeof value === "number" ? value : Number(value ?? 0);
            if (name === "km") return [`${Math.round(v).toLocaleString()} km`, "Distance"];
            return [`${v}`, "Flights"];
          }}
          labelFormatter={(label) => `Year ${label}`}
        />
        <Bar
          yAxisId="flights"
          dataKey="flights"
          radius={[2, 2, 0, 0]}
          onClick={(d: unknown) => {
            const payload = (d as { payload?: { year?: number } })?.payload;
            if (payload?.year !== undefined) router.push(`/log?year=${payload.year}`);
          }}
          cursor="pointer"
        >
          {data.map((d) => (
            <Cell key={d.year} fill="#00D4FF" />
          ))}
        </Bar>
        <Line
          yAxisId="km"
          type="monotone"
          dataKey="km"
          stroke="#E8A547"
          strokeWidth={2}
          dot={{ r: 3, fill: "#E8A547", stroke: "#0A0B0D", strokeWidth: 1 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
