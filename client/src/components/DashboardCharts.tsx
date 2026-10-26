import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const PHASE_COLORS: Record<string, string> = {
  Running: '#34d399', Pending: '#fbbf24', Succeeded: '#38bdf8', Failed: '#f87171', Unknown: '#64748b',
};

const TOOLTIP_STYLE = { background: '#151c28', border: '1px solid #2e3a4f', borderRadius: 8, fontSize: 12 };

// Heavy chart panels, split into their own lazy chunk so the dashboard's
// stat cards render instantly while recharts loads in parallel.
export default function DashboardCharts({ pie, counts }: { pie: { name: string; value: number }[]; counts: Record<string, number> }) {
  return (
    <>
      {/* Pod phases */}
      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-1">Pods by phase</h2>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                {pie.map((p) => <Cell key={p.name} fill={PHASE_COLORS[p.name] || '#64748b'} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Workload counts */}
      <div className="ks-card p-4">
        <h2 className="font-semibold text-slate-200 mb-1">Workloads</h2>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: 'Deploy', v: counts.deployments },
              { name: 'STS', v: counts.statefulsets },
              { name: 'DS', v: counts.daemonsets },
              { name: 'Jobs', v: counts.jobs },
              { name: 'Cron', v: counts.cronjobs },
            ]} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={52} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="v" fill="#0ea5e9" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
