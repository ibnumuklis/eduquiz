"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BRAND = "#4f46e5";
const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)", fontSize: 12 };

export function ActivityChart({ data, label = "Pengumpulan" }: { data: { date: string; submissions: number }[]; label?: string }) {
  const rows = data.map((d) => ({
    ...d,
    day: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(`${d.date}T00:00:00`)),
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label={`Grafik ${label.toLowerCase()} harian`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="eqArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.3} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, label]} />
          <Area type="monotone" dataKey="submissions" stroke={BRAND} strokeWidth={2.5} fill="url(#eqArea)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const DIST_COLORS = ["#f43f5e", "#fb923c", "#f59e0b", "#14b8a6", "#6366f1", "#7c3aed"];

export function DistributionChart({ data }: { data: { range: string; count: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Grafik distribusi nilai">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Siswa"]} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
