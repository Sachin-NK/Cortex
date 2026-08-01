import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Agent, PolicyType, RunStatus } from '../api'
import { Bot, Play, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'

const POLICIES: { value: PolicyType; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'maximum_quality', label: 'Maximum Quality' },
  { value: 'lowest_cost', label: 'Lowest Cost' },
]

function statusIcon(s: string) {
  if (s === 'completed') return <CheckCircle size={14} className="text-green-400" />
  if (s === 'failed') return <XCircle size={14} className="text-red-400" />
  if (s === 'running') return <Loader2 size={14} className="text-indigo-400 animate-spin" />
  return <Clock size={14} className="text-gray-500" />
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [input, setInput] = useState('')
  const [policy, setPolicy] = useState<PolicyType>('balanced')
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunStatus | null>(null)
  const [output, setOutput] = useState<string>('')
  const [running, setRunning] = useState(false)

  useEffect(() => { api.agents().then(setAgents).catch(console.error) }, [])

  useEffect(() => {
    if (!runId) return
    const poll = setInterval(async () => {
      try {
        const status = await api.runStatus(runId)
        setRun(status)
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(poll)
          setRunning(false)
          const out = await api.runOutput(runId)
          setOutput(out.final_output)
        }
      } catch {}
    }, 1500)
    return () => clearInterval(poll)
  }, [runId])

  const launch = async () => {
    if (!selected || !input.trim()) return
    setRunning(true)
    setRun(null)
    setOutput('')
    try {
      const res = await api.runAgent(selected.id, input, policy)
      setRunId(res.run_id)
      // Persist run ID so WorkflowRuns page can display it
      const existing: string[] = JSON.parse(localStorage.getItem('runIds') || '[]')
      const updated = [res.run_id, ...existing].slice(0, 50) // keep last 50
      localStorage.setItem('runIds', JSON.stringify(updated))
    } catch (e: any) {
      alert(`Error: ${e.message}`)
      setRunning(false)
    }
  }

  const tagColors: Record<string, string> = {
    code: 'bg-blue-500/20 text-blue-400',
    security: 'bg-red-500/20 text-red-400',
    data: 'bg-yellow-500/20 text-yellow-400',
    research: 'bg-purple-500/20 text-purple-400',
    devops: 'bg-cyan-500/20 text-cyan-400',
    writing: 'bg-green-500/20 text-green-400',
    debug: 'bg-orange-500/20 text-orange-400',
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Agent Marketplace</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {agents.map(a => (
          <button
            key={a.id}
            onClick={() => { setSelected(a); setInput(''); setRun(null); setOutput('') }}
            className={`text-left bg-gray-900 border rounded-xl p-4 transition-all hover:border-indigo-500 ${selected?.id === a.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-800'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Bot size={16} className="text-indigo-400" />
              <span className="font-medium text-sm">{a.name}</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">{a.description}</p>
            <div className="flex flex-wrap gap-1">
              {a.tags.map(tag => (
                <span key={tag} className={`text-xs px-1.5 py-0.5 rounded ${tagColors[tag] || 'bg-gray-700 text-gray-400'}`}>{tag}</span>
              ))}
              <span className="ml-auto text-xs text-gray-600">{a.steps} steps</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Run: {selected.name}</h3>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Describe your task for the ${selected.name}…`}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-3"
          />
          <div className="flex items-center gap-3 mb-4">
            <select
              value={policy}
              onChange={e => setPolicy(e.target.value as PolicyType)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            >
              {POLICIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button
              onClick={launch}
              disabled={running || !input.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm transition-colors"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? 'Running…' : 'Launch Agent'}
            </button>
          </div>

          {run && (
            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Step Progress</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>${run.total_cost_usd.toFixed(5)}</span>
                  <span>{run.total_tokens} tokens</span>
                </div>
              </div>
              <div className="space-y-2">
                {Object.entries(run.steps).map(([sid, s]) => (
                  <div key={sid} className="flex items-center gap-3 text-sm">
                    {statusIcon(s.status)}
                    <span className="flex-1 text-gray-400 capitalize">{sid.replace(/_/g, ' ')}</span>
                    {s.provider && <span className="text-xs text-gray-600">{s.provider}</span>}
                    {s.error && <span className="text-xs text-red-400">{s.error}</span>}
                    {run.approval_queue.includes(sid) && (
                      <button
                        onClick={() => runId && api.approveStep(runId, sid)}
                        className="text-xs px-2 py-0.5 bg-indigo-600 rounded hover:bg-indigo-500"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {output && (
            <div className="border-t border-gray-800 mt-4 pt-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Final Output</p>
              <pre className="text-sm text-gray-200 whitespace-pre-wrap bg-gray-800 rounded-lg p-4 max-h-80 overflow-y-auto">{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
