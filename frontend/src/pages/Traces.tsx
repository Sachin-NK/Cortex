import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Trace, TraceEvent } from '../api'
import { RefreshCw, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'

function statusColor(status: string) {
  if (status === 'completed') return 'text-green-400'
  if (status === 'error') return 'text-red-400'
  if (status === 'running') return 'text-indigo-400'
  return 'text-gray-500'
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle size={13} className="text-green-400 shrink-0" />
  if (status === 'error') return <XCircle size={13} className="text-red-400 shrink-0" />
  if (status === 'running') return <Loader2 size={13} className="text-indigo-400 animate-spin shrink-0" />
  return <Clock size={13} className="text-gray-600 shrink-0" />
}

function EventRow({ event }: { event: TraceEvent }) {
  const [open, setOpen] = useState(false)
  const hasDetail = event.message || event.provider

  return (
    <div className="border-b border-gray-800/40 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-gray-800/30 transition-colors text-left"
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        {hasDetail
          ? (open ? <ChevronDown size={11} className="text-gray-500 shrink-0" /> : <ChevronRight size={11} className="text-gray-500 shrink-0" />)
          : <span className="w-[11px] shrink-0" />
        }
        <span className={`w-28 shrink-0 font-mono ${statusColor(event.status)}`}>{event.event_type}</span>
        <span className="text-gray-500 w-16 shrink-0">{event.provider || '-'}</span>
        <span className="text-gray-600 w-28 shrink-0 truncate">{event.model || '-'}</span>
        <span className="text-gray-600 w-16 shrink-0 text-right">{event.latency_ms > 0 ? `${event.latency_ms}ms` : '-'}</span>
        <span className="text-gray-600 w-14 shrink-0 text-right">{event.input_tokens + event.output_tokens > 0 ? `${event.input_tokens + event.output_tokens}t` : '-'}</span>
        <span className="text-gray-600 flex-1 text-right">{event.cost_usd > 0 ? `$${event.cost_usd.toFixed(6)}` : '-'}</span>
      </button>
      {open && hasDetail && (
        <div className="px-10 pb-2 text-xs text-gray-500 space-y-1">
          {event.message && <p className="font-mono break-all">{event.message}</p>}
        </div>
      )}
    </div>
  )
}

function TraceCard({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-800/30 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <ChevronDown size={14} className="text-gray-500 shrink-0" />
          : <ChevronRight size={14} className="text-gray-500 shrink-0" />
        }
        <StatusIcon status={trace.final_status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{trace.user_request || '(no request)'}</p>
          <p className="text-xs text-gray-600 font-mono">{trace.trace_id.slice(0, 16)}…</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
          <span>{trace.total_events} events</span>
          <span>{trace.total_tokens} tokens</span>
          <span>${trace.total_cost_usd.toFixed(5)}</span>
          <span className={`px-2 py-0.5 rounded-full capitalize ${
            trace.final_status === 'completed' ? 'bg-green-500/20 text-green-400' :
            trace.final_status === 'running'   ? 'bg-indigo-500/20 text-indigo-400' :
                                                  'bg-red-500/20 text-red-400'
          }`}>{trace.final_status}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800">
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-gray-600 border-b border-gray-800 bg-gray-800/30">
            <span className="w-[11px] shrink-0" />
            <span className="w-28 shrink-0">event type</span>
            <span className="w-16 shrink-0">provider</span>
            <span className="w-28 shrink-0">model</span>
            <span className="w-16 shrink-0 text-right">latency</span>
            <span className="w-14 shrink-0 text-right">tokens</span>
            <span className="flex-1 text-right">cost</span>
          </div>
          {trace.events.length === 0 && (
            <p className="px-5 py-4 text-xs text-gray-600">No events recorded.</p>
          )}
          {trace.events.map((e, i) => <EventRow key={i} event={e} />)}
        </div>
      )}
    </div>
  )
}

export default function Traces() {
  const [traces, setTraces] = useState<Trace[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setTraces(await api.traces()) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Traces</h2>
          <p className="text-xs text-gray-500 mt-0.5">Every request, routing decision, and LLM call - in full detail.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {traces.length === 0 && !loading && (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg mb-2">No traces yet</p>
          <p className="text-sm">Send a chat message or run an agent to see execution traces here.</p>
        </div>
      )}

      <div className="space-y-3">
        {traces.map(t => <TraceCard key={t.trace_id} trace={t} />)}
      </div>
    </div>
  )
}
