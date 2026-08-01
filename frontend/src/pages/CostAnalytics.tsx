import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { api, CostReport, OptimizationReport } from '../api'
import { RefreshCw, DollarSign, Zap, Cpu, TrendingDown, Loader2, Crown } from 'lucide-react'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#f43f5e', '#14b8a6', '#8b5cf6']

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`p-3 rounded-lg ${color}`}><Icon size={20} /></div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Orchestrator efficiency gauge — works for any LLM, not just Claude ────────
function OrchestratorGauge({ orchestrator, pct, delegated, savings }: {
  orchestrator: string; pct: number; delegated: number; savings: number
}) {
  const r = 56
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  // Color changes based on % — green = low usage (efficient), red = high (over-used)
  const color = pct < 20 ? '#22c55e' : pct < 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4">
        <Crown size={13} className="text-yellow-400" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Orchestrator Usage
        </p>
      </div>
      <svg width={144} height={144} viewBox="0 0 144 144">
        <circle cx="72" cy="72" r={r} fill="none" stroke="#1f2937" strokeWidth="12" />
        <circle
          cx="72" cy="72" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 72 72)"
        />
        <text x="72" y="64" textAnchor="middle" fill="#f3f4f6" fontSize="22" fontWeight="700">{pct.toFixed(0)}%</text>
        <text x="72" y="80" textAnchor="middle" fill="#6b7280" fontSize="10">of tokens</text>
        <text x="72" y="94" textAnchor="middle" fill="#818cf8" fontSize="10" fontWeight="600">
          {orchestrator}
        </text>
      </svg>
      <p className="text-sm text-gray-300 mt-3 text-center">
        <span className="text-green-400 font-semibold">{delegated}</span> tasks delegated away
      </p>
      <p className="text-xs text-green-400 mt-1">${savings.toFixed(4)} estimated savings</p>
      {pct > 40 && (
        <p className="text-xs text-yellow-400 mt-2 text-center">
          High orchestrator usage — consider delegating more tasks
        </p>
      )}
    </div>
  )
}

export default function CostAnalytics() {
  const [data, setData] = useState<CostReport | null>(null)
  const [report, setReport] = useState<OptimizationReport | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [costs, opt] = await Promise.all([api.costs(), api.getOptimizationReport()])
      setData(costs)
      setReport(opt)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500 gap-2">
      <Loader2 size={18} className="animate-spin" /> Loading analytics…
    </div>
  )

  if (!data || !report) return <div className="p-8 text-gray-500">Failed to load cost data.</div>

  const providerEntries = Object.entries(data.by_provider)
  const costBarData = providerEntries.map(([name, v]) => ({ name, cost: parseFloat(v.cost_usd.toFixed(6)) }))
  const tokenBarData = providerEntries.map(([name, v]) => ({ name, tokens: v.input_tokens + v.output_tokens }))
  const agentPieData = Object.entries(data.by_agent).map(([name, v]) => ({ name, value: v.calls }))

  const orch = report.orchestrator
  const orchUsage = report.orchestrator_usage
  const del = report.delegation

  const optimizeLabel: Record<string, string> = {
    cost: 'Minimize Cost', quality: 'Maximum Quality',
    latency: 'Lowest Latency', balanced: 'Balanced',
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Cost Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">
            Optimizing for: <span className="text-indigo-400 font-medium">{optimizeLabel[report.optimize_for] ?? report.optimize_for}</span>
            {' · '}Orchestrator: <span className="text-yellow-400 font-medium">{orch}</span>
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Cost" value={`$${data.total_cost_usd.toFixed(4)}`}
          icon={DollarSign} color="bg-indigo-500/20 text-indigo-400" />
        <StatCard label="Total Tokens" value={data.total_tokens.toLocaleString()}
          icon={Zap} color="bg-yellow-500/20 text-yellow-400" />
        <StatCard
          label={`${orch} Usage`}
          value={`${orchUsage.percentage_of_total.toFixed(1)}%`}
          sub={`${orchUsage.calls} calls · $${orchUsage.cost_usd.toFixed(5)}`}
          icon={Cpu} color="bg-orange-500/20 text-orange-400"
        />
        <StatCard
          label="Tasks Delegated"
          value={del.tasks_delegated_away_from_orchestrator.toString()}
          sub={`$${del.estimated_savings_usd.toFixed(4)} saved`}
          icon={TrendingDown} color="bg-green-500/20 text-green-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Cost by provider */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Cost by Provider</p>
          {costBarData.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-8">No data yet — run some queries first</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={costBarData} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`$${Number(v).toFixed(6)}`, 'Cost']}
                />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                  {costBarData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tokens by provider */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Tokens by Provider</p>
          {tokenBarData.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tokenBarData} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [Number(v).toLocaleString(), 'Tokens']}
                />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]}>
                  {tokenBarData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Orchestrator gauge — not Claude-specific */}
        <OrchestratorGauge
          orchestrator={orch}
          pct={orchUsage.percentage_of_total}
          delegated={del.tasks_delegated_away_from_orchestrator}
          savings={del.estimated_savings_usd}
        />
      </div>

      {/* Worker breakdown + agent pie */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Worker provider table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Provider Breakdown</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800 text-left">
                  <th className="pb-2">Provider</th>
                  <th className="pb-2 text-right">Calls</th>
                  <th className="pb-2 text-right">Tokens</th>
                  <th className="pb-2 text-right">%</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {providerEntries.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-600 py-4">No data yet</td></tr>
                )}
                {providerEntries.map(([name, v]) => {
                  const isOrch = name === orch
                  const tokens = v.input_tokens + v.output_tokens
                  const pct = data.total_tokens > 0 ? (tokens / data.total_tokens * 100).toFixed(1) : '0'
                  return (
                    <tr key={name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-1.5 font-medium capitalize flex items-center gap-1.5">
                        {isOrch && <Crown size={10} className="text-yellow-400 shrink-0" />}
                        {name}
                      </td>
                      <td className="py-1.5 text-right text-gray-400">{v.calls}</td>
                      <td className="py-1.5 text-right text-gray-400">{tokens.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-gray-500">{pct}%</td>
                      <td className="py-1.5 text-right text-green-400">${v.cost_usd.toFixed(5)}</td>
                    </tr>
                  )
                })}
                {providerEntries.length > 0 && (
                  <tr className="font-semibold text-gray-300 border-t border-gray-700">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right">{providerEntries.reduce((s, [, v]) => s + v.calls, 0)}</td>
                    <td className="pt-2 text-right">{data.total_tokens.toLocaleString()}</td>
                    <td className="pt-2 text-right">100%</td>
                    <td className="pt-2 text-right text-green-400">${data.total_cost_usd.toFixed(5)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agent task pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Task Distribution by Agent</p>
          {agentPieData.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-8">No agent runs yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={agentPieData} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {agentPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
