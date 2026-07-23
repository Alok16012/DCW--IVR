"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyPoint, SplitPoint, TrendPoint } from "@/lib/queries/metrics";

const axis = { stroke: "#64748b", fontSize: 11 };
const grid = "#1f2a44";

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-[var(--text)]">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-[var(--text-muted)]">
          <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-[var(--text)]">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function HourlyVolumeChart({ data }: { data: HourlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
        <XAxis dataKey="hour" tickLine={false} axisLine={{ stroke: grid }} tick={axis} interval={1} />
        <YAxis tickLine={false} axisLine={false} tick={axis} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
        <Bar dataKey="inbound" name="Inbound" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="outbound" name="Outbound" fill="#38bdf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnsweredMissedTrend({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="ansG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="misG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: grid }} tick={axis} />
        <YAxis tickLine={false} axisLine={false} tick={axis} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} />
        <Area type="monotone" dataKey="answered" name="Answered" stroke="#34d399" strokeWidth={2} fill="url(#ansG)" />
        <Area type="monotone" dataKey="missed" name="Missed" stroke="#f87171" strokeWidth={2} fill="url(#misG)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const SPLIT_COLORS = ["#3b82f6", "#38bdf8"];

export function InboundOutboundSplit({ data }: { data: SplitPoint[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={3} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={SPLIT_COLORS[i % SPLIT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: SPLIT_COLORS[i % SPLIT_COLORS.length] }} />
            <span className="text-[var(--text-muted)]">{d.name}</span>
            <span className="font-semibold text-[var(--text)]">{d.value}</span>
            <span className="text-[var(--text-faint)]">
              ({total ? Math.round((d.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
