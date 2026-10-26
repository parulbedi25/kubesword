import React from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const COLORS: Record<string, string> = {
  Running: '#34d399',
  Pending: '#fbbf24',
  Succeeded: '#38bdf8',
  Failed: '#f87171',
  Unknown: '#64748b',
};
const FALLBACK = ['#818cf8', '#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#38bdf8', '#f87171', '#94a3b8'];

const tipStyle = {
  background: '#141b2d',
  border: '1px solid #2a3350',
  borderRadius: 8,
  fontSize: 12,
  color: '#e2e8f0',
} as const;

export function PodPhasePie({ data }: { data: { name: string; value: number }[] }) {
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return <p className="text-sm text-slate-500 py-8 text-center">No pods to chart.</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} strokeWidth={0}>
          {rows.map((d, i) => (
            <Cell key={d.name} fill={COLORS[d.name] || FALLBACK[i % FALLBACK.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Legend({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
      {data
        .filter((d) => d.value > 0)
        .map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: COLORS[d.name] || FALLBACK[i % FALLBACK.length] }}
            />
            {d.name} <strong className="text-slate-200">{d.value}</strong>
          </span>
        ))}
    </div>
  );
}

export function BarList({ data }: { data: { name: string; value: number }[] }) {
  const rows = data.filter((d) => d.value > 0).slice(0, 10);
  if (rows.length === 0) return <p className="text-sm text-slate-500 py-8 text-center">Nothing to show.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 30)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="#232c47" horizontal={false} />
        <XAxis type="number" stroke="#64748b" fontSize={11} allowDecimals={false} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={110} />
        <Tooltip contentStyle={tipStyle} cursor={{ fill: '#1b2340' }} />
        <Bar dataKey="value" fill="#818cf8" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
