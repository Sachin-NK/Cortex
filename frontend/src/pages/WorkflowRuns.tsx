import { useEffect, useState } from 'react'
import { api } from '../api'
import type { RunStatus } from '../api'
import { RefreshCw, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    running: 'bg-indigo-500/20 text-indigo-400',
    pending: 'bg-gray-700 text-gray-400',
  }
  return map[status] || 'bg-gray-700 text-gray-400'
}

export default function WorkflowRuns() {
  const [runs, setRuns] = useState<RunStatus[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // Fetch all live runs from backend
      const liveRuns = await api.listRuns()

      // Also check locally stored run IDs, silently drop any that 404 (stale)
      const storedIds: string[] = (() => {
        try { return JSON.parse(localStorage.getItem('runIds') || '[]') } catch { return [] }
      })()
      const liveIds = new Set(liveRuns.map(r => r.run_id))
      const extraIds = storedIds.filter(id => !liveIds.has(id))

      const extraResults = await Promise.allSettled(extraIds.map(id => api.runStatus(id)))
      const validExtras = extraResults.flatMap((r, i) => {
        if (r.status === 'fulfilled') return [r.value]
        // stale — remove from localStorage
        const cleaned = storedIds.filter(id => id !== extraIds[i])
        localStorage.setItem('runIds', JSON.stringify(cleaned))
        return []
      })

      setRuns([...liveRuns, ...validExtras])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (!loading && runs.length === 0) {
    return (
      <div className="p-8 text-center text-gray-600 mt-24">
        <p className="text-lg mb-2">No workflow runs yet</p>
        <p className="text-sm">Run an agent from the Agents page to see execution traces here.</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Workflow Runs</h2>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="space-y-4">
        {runs.map(run => (
          <div key={run.run_id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-mono text-xs text-gray-500">{run.run_id}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>${run.total_cost_usd.toFixed(5)}</span>
                <span>{run.total_tokens} tokens</span>
                <span className={`px-2 py-0.5 rounded-full capitalize ${statusBadge(run.status)}`}>{run.status}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {Object.entries(run.steps).map(([sid, s]) => (
                <div key={sid} className="flex items-center gap-3 text-sm py-1 border-b border-gray-800/50 last:border-0">
                  {s.status === 'completed' && <CheckCircle size={13} className="text-green-400 shrink-0" />}
                  {s.status === 'failed' && <XCircle size={13} className="text-red-400 shrink-0" />}
                  {s.status === 'running' && <Loader2 size={13} className="text-indigo-400 animate-spin shrink-0" />}
                  {s.status === 'pending' && <Clock size={13} className="text-gray-600 shrink-0" />}
                  <span className="flex-1 text-gray-400 text-xs capitalize">{sid.replace(/_/g, ' ')}</span>
                  {s.provider && <span className="text-xs text-gray-600">{s.provider} / {s.model}</span>}
                  <span className="text-xs text-gray-600">{s.tokens} tok</span>
                  {s.error && <span className="text-xs text-red-400 truncate max-w-xs">{s.error}</span>}
                  {run.approval_queue.includes(sid) && (
                    <button
                      onClick={() => api.approveStep(run.run_id, sid).then(load)}
                      className="text-xs px-2 py-0.5 bg-indigo-600 rounded hover:bg-indigo-500"
                    >
                      Approve
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
