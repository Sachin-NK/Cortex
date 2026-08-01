import { useState, useEffect, useRef } from 'react'
import { Bot, Play, Loader2, CheckCircle, XCircle, Clock, X, ChevronRight } from 'lucide-react'
import { api } from '../../api'
import type { Agent, RunStatus, PolicyType } from '../../api'

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: '#a855f7', gemini: '#3b82f6', openai: '#22c55e',
  anthropic: '#f97316', kimi: '#06b6d4', openrouter: '#ec4899',
}

const STATUS_ICONS: Record<string, any> = {
  completed: CheckCircle, failed: XCircle, running: Loader2, pending: Clock,
}

interface RunModalProps { agent: Agent; onClose: () => void }

function RunModal({ agent, onClose }: RunModalProps) {
  const [input, setInput] = useState('')
  const [policy, setPolicy] = useState<PolicyType>('balanced')
  const [runId, setRunId] = useState('')
  const [status, setStatus] = useState<RunStatus | null>(null)
  const [launching, setLaunching] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = async () => {
    if (!input.trim()) return
    setLaunching(true)
    try {
      const r = await api.runAgent(agent.id, input, policy)
      setRunId(r.run_id)
      pollRef.current = setInterval(async () => {
        const s = await api.runStatus(r.run_id)
        setStatus(s)
        if (s.status === 'completed' || s.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }, 2000)
    } catch (e: any) { alert(e.message) }
    finally { setLaunching(false) }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col"
        style={{ background: '#111114', border: '1px solid #2a2a35' }}>
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid #1e1e24' }}>
          <div className="flex items-center gap-2.5">
            <Bot size={16} style={{ color: '#6366f1' }} />
            <span className="font-semibold text-sm" style={{ color: '#e4e4e7' }}>{agent.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#1e1e2e', color: '#71717a' }}>{agent.steps} steps</span>
          </div>
          <button onClick={onClose} className="p-1 rounded"
            style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!runId ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#71717a' }}>Task</label>
                <textarea value={input} onChange={e => setInput(e.target.value)} rows={4}
                  placeholder={`Describe what you want ${agent.name} to do…`}
                  className="w-full px-3 py-2.5 rounded-lg text-sm resize-none outline-none"
                  style={{ background: '#0d0d0f', border: '1px solid #2a2a35', color: '#e4e4e7' }}
                  onFocus={e => (e.target as HTMLElement).style.borderColor = '#6366f1'}
                  onBlur={e => (e.target as HTMLElement).style.borderColor = '#2a2a35'} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#71717a' }}>Policy</label>
                <select value={policy} onChange={e => setPolicy(e.target.value as PolicyType)}
                  className="px-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: '#0d0d0f', border: '1px solid #2a2a35', color: '#e4e4e7' }}>
                  <option value="balanced">Balanced</option>
                  <option value="lowest_cost">Lowest Cost</option>
                  <option value="maximum_quality">Maximum Quality</option>
                  <option value="lowest_latency">Lowest Latency</option>
                </select>
              </div>
              <button onClick={start} disabled={launching || !input.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors"
                style={{ background: launching ? '#4338ca' : '#6366f1', color: '#fff', opacity: !input.trim() ? 0.5 : 1 }}>
                {launching ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {launching ? 'Starting…' : 'Run Agent'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs" style={{ color: '#71717a' }}>Run {runId.slice(0,8)}…</span>
                {status && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: status.status === 'completed' ? '#14532d' : status.status === 'failed' ? '#450a0a' : '#1e1b4b', color: status.status === 'completed' ? '#4ade80' : status.status === 'failed' ? '#f87171' : '#a5b4fc' }}>
                    {status.status}
                  </span>
                )}
              </div>
              {status && Object.entries(status.steps).map(([sid, step], i) => {
                const SIcon = STATUS_ICONS[step.status] ?? Clock
                const pColor = PROVIDER_COLORS[step.provider] ?? '#71717a'
                return (
                  <div key={sid} className="flex items-start gap-3 px-3 py-2 rounded-lg"
                    style={{ background: '#0d0d0f', border: '1px solid #1e1e24' }}>
                    <SIcon size={14} className={step.status === 'running' ? 'animate-spin mt-0.5 shrink-0' : 'mt-0.5 shrink-0'}
                      style={{ color: step.status === 'completed' ? '#4ade80' : step.status === 'failed' ? '#f87171' : '#a5b4fc' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: '#e4e4e7' }}>Step {i + 1}</span>
                        {step.provider && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: `${pColor}22`, color: pColor }}>
                            {step.provider}
                          </span>
                        )}
                        {step.tokens > 0 && (
                          <span className="text-[10px]" style={{ color: '#52525b' }}>{step.tokens} tok</span>
                        )}
                      </div>
                      {step.error && <p className="text-xs mt-1 truncate" style={{ color: '#f87171' }}>{step.error}</p>}
                    </div>
                  </div>
                )
              })}
              {!status && <div className="flex items-center gap-2 py-3" style={{ color: '#71717a' }}><Loader2 size={14} className="animate-spin" /><span className="text-xs">Waiting for steps…</span></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<Agent | null>(null)

  useEffect(() => {
    api.agents().then(setAgents).catch(console.error).finally(() => setLoading(false))
  }, [])

  const TAG_COLORS: Record<string, string> = { code: '#3b82f6', security: '#ef4444', data: '#22c55e', devops: '#f59e0b', research: '#a855f7', writing: '#06b6d4', analysis: '#f97316', debug: '#e879f9' }

  return (
    <div className="flex flex-col h-full" style={{ color: '#d4d4d8' }}>
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e24' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>Agents</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: '#71717a' }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : agents.map(a => (
          <div key={a.id} className="px-3 py-2.5" style={{ borderBottom: '1px solid #1e1e24' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: '#e4e4e7' }}>{a.name}</p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: '#71717a' }}>{a.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {a.tags.map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: `${TAG_COLORS[t] ?? '#6366f1'}22`, color: TAG_COLORS[t] ?? '#6366f1' }}>
                      {t}
                    </span>
                  ))}
                  <span className="text-[10px]" style={{ color: '#52525b' }}>{a.steps} steps</span>
                </div>
              </div>
              <button onClick={() => setRunning(a)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                style={{ background: '#1e1e2e', color: '#6366f1', border: '1px solid #2a2a35' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#6366f1'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#1e1e2e'; (e.currentTarget as HTMLElement).style.color = '#6366f1' }}>
                <Play size={11} /> Run
              </button>
            </div>
          </div>
        ))}
      </div>
      {running && <RunModal agent={running} onClose={() => setRunning(null)} />}
    </div>
  )
}
