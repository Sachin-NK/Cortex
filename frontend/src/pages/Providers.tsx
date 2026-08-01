import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Provider } from '../api'
import { RefreshCw, CheckCircle, AlertCircle, XCircle } from 'lucide-react'

function CapBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-800 text-gray-600'}`}>
      {label}
    </span>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'healthy') return <CheckCircle size={14} className="text-green-400" />
  if (status === 'degraded') return <AlertCircle size={14} className="text-yellow-400" />
  if (status === 'down') return <XCircle size={14} className="text-red-400" />
  return <span className="w-3.5 h-3.5 rounded-full bg-gray-600 inline-block" />
}

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setProviders(await api.providers()) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Providers</h2>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {providers.length === 0 && !loading && (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg mb-2">No providers configured</p>
          <p className="text-sm">Add API keys to your .env file and restart the backend</p>
          <pre className="mt-4 text-left inline-block bg-gray-900 rounded-lg p-4 text-xs text-gray-400">
{`OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
KIMI_API_KEY=...`}
          </pre>
        </div>
      )}

      <div className="space-y-4">
        {providers.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <StatusIcon status={p.status} />
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.models.join(', ')}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                p.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                p.status === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>{p.status}</span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Input / 1K tokens</p>
                <p className="text-green-400 font-medium">${p.cost_per_1k_input.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Output / 1K tokens</p>
                <p className="text-green-400 font-medium">${p.cost_per_1k_output.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Avg Latency</p>
                <p className="text-blue-400 font-medium">{p.avg_latency_ms}ms</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <CapBadge label="Vision" active={p.capabilities.vision} />
              <CapBadge label="Code" active={p.capabilities.code} />
              <CapBadge label="Reasoning" active={p.capabilities.reasoning} />
              <CapBadge label="Long Context" active={p.capabilities.long_context} />
              <span className="ml-auto text-xs text-gray-600">{(p.capabilities.max_context_tokens / 1000).toFixed(0)}K ctx</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
