import { useEffect, useState } from 'react'
import { api, Dashboard as DashboardData, Provider } from '../api'
import { keyStore, PROVIDER_DEFS } from '../api'
import { Activity, DollarSign, Bot, Wrench, Cpu, Wifi, Key } from 'lucide-react'
import { useKeys } from '../context/KeysContext'

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  )
}

function HealthBadge({ status }: { status: string }) {
  const color = status === 'healthy' ? 'bg-green-500' : status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-2`} />
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const { keysVersion } = useKeys()

  // Keys stored locally in browser (sent as headers, not known to backend)
  const localKeys = PROVIDER_DEFS.filter(p => {
    const e = keyStore.get(p.id)
    return e && e.key && e.enabled
  })

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error)
    api.providers().then(setProviders).catch(console.error)
    const id = setInterval(() => {
      api.dashboard().then(setData).catch(console.error)
    }, 10000)
    return () => clearInterval(id)
  }, [keysVersion])

  if (!data) return <div className="p-8 text-gray-500">Loading dashboard...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active Sessions" value={data.active_sessions} icon={Activity} color="bg-indigo-500/20 text-indigo-400" />
        <StatCard label="Total Cost (USD)" value={`$${data.total_cost_usd.toFixed(4)}`} icon={DollarSign} color="bg-green-500/20 text-green-400" />
        <StatCard label="Active Runs" value={data.active_runs} icon={Cpu} color="bg-orange-500/20 text-orange-400" />
        <StatCard label="Agents Available" value={data.available_agents} icon={Bot} color="bg-purple-500/20 text-purple-400" />
        <StatCard label="MCP Tools" value={data.mcp_tools} icon={Wrench} color="bg-cyan-500/20 text-cyan-400" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
          <Wifi size={14} /> Provider Health
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(data.provider_health).map(([id, status]) => (
            <div key={id} className="flex items-center text-sm">
              <HealthBadge status={status} />
              <span className="capitalize font-medium">{id}</span>
              <span className="ml-auto text-xs text-gray-500">{status}</span>
            </div>
          ))}
          {Object.keys(data.provider_health).length === 0 && localKeys.length === 0 && (
            <div className="col-span-3 flex items-center gap-2 text-sm text-gray-600">
              <Key size={13} />
              No providers configured. Add your API keys in the{' '}
              <a href="/keys" className="text-indigo-400 hover:text-indigo-300 underline">API Keys</a> tab.
            </div>
          )}
          {Object.keys(data.provider_health).length === 0 && localKeys.map(p => (
            <div key={p.id} className="flex items-center text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-2" />
              <span className="capitalize font-medium">{p.name}</span>
              <span className="ml-auto text-xs text-indigo-400">key saved</span>
            </div>
          ))}
        </div>
      </div>

      {providers.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Cost Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2">Provider</th>
                  <th className="pb-2">Input / 1K</th>
                  <th className="pb-2">Output / 1K</th>
                  <th className="pb-2">Latency</th>
                  <th className="pb-2">Context</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-green-400">${p.cost_per_1k_input.toFixed(4)}</td>
                    <td className="py-2 text-green-400">${p.cost_per_1k_output.toFixed(4)}</td>
                    <td className="py-2 text-blue-400">{p.avg_latency_ms}ms</td>
                    <td className="py-2 text-gray-400">{(p.capabilities.max_context_tokens / 1000).toFixed(0)}K</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
