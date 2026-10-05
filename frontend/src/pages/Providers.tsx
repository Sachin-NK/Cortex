import { useEffect, useState } from 'react'
import { api, keyStore, PROVIDER_DEFS } from '../api'
import type { Provider } from '../api'
import { RefreshCw, CheckCircle, AlertCircle, XCircle, Key } from 'lucide-react'
import { useKeys } from '../context/KeysContext'

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
  const { keysVersion } = useKeys()

  // Derive which providers have a key stored locally so we can show them
  // even when the backend returns an empty list (keys sent per-request as headers)
  const localKeyIds = PROVIDER_DEFS.filter(p => {
    const e = keyStore.get(p.id)
    return e && e.key && e.enabled
  }).map(p => p.id)

  const load = async () => {
    setLoading(true)
    try { setProviders(await api.providers()) }
    finally { setLoading(false) }
  }

  // Re-fetch whenever keys change (triggered by KeysSettings)
  useEffect(() => { load() }, [keysVersion])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Providers</h2>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {providers.length === 0 && !loading && (
        <div className="text-center py-20 text-gray-500">
          {localKeyIds.length === 0 ? (
            <>
              <Key size={36} className="mx-auto mb-4 text-gray-700" />
              <p className="text-lg mb-1">No providers configured</p>
              <p className="text-sm mb-4">Add your API keys in the <span className="text-indigo-400">API Keys</span> tab to get started.</p>
            </>
          ) : (
            <>
              <RefreshCw size={36} className="mx-auto mb-4 text-gray-700" />
              <p className="text-lg mb-1">Keys saved — waiting for backend</p>
              <p className="text-sm">
                Keys for <span className="text-indigo-400">{localKeyIds.join(', ')}</span> are stored locally.
                They are sent as headers on each request — the backend may not list them until a request is made.
              </p>
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Backend-reported providers */}
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

        {/* Locally-configured providers not yet returned by the backend */}
        {localKeyIds
          .filter(id => !providers.some(p => p.id === id))
          .map(id => {
            const def = PROVIDER_DEFS.find(p => p.id === id)!
            return (
              <div key={id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 opacity-75">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-600" />
                    <div>
                      <h3 className="font-semibold">{def.name}</h3>
                      <p className="text-xs text-gray-500">{def.models.slice(0, 3).join(', ')}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Key saved · ready
                  </span>
                </div>
                <p className="mt-3 text-xs text-gray-600">
                  Key is stored in your browser and will be used on the next request. Backend health status will appear after the first call.
                </p>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}
