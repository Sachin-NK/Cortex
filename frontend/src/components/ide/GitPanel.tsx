import { useState, useEffect } from 'react'
import { GitBranch, Loader2, AlertCircle } from 'lucide-react'

export default function GitPanel() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [commitMsg, setCommitMsg] = useState('')

  useEffect(() => {
    fetch('/api/git/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: '#71717a' }}>
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>
  )

  if (!status) return (
    <div className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center">
      <AlertCircle size={28} style={{ color: '#52525b', opacity: 0.5 }} />
      <div>
        <p className="text-sm font-medium" style={{ color: '#71717a' }}>Git not configured</p>
        <p className="text-xs mt-1" style={{ color: '#52525b' }}>
          The current workspace is not a Git repository, or the Git endpoint is unavailable.
        </p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ color: '#d4d4d8' }}>
      <div className="px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ borderBottom: '1px solid #1e1e24' }}>
        <GitBranch size={13} style={{ color: '#22c55e' }} />
        <span className="text-xs font-medium">{status.branch ?? 'main'}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {(status.files ?? []).map((f: any, i: number) => (
          <div key={i} className="flex items-center gap-2 py-1 text-xs">
            <span className="w-4 text-center font-mono shrink-0"
              style={{ color: f.status === 'M' ? '#f59e0b' : f.status === '?' ? '#22c55e' : '#ef4444' }}>
              {f.status}
            </span>
            <span className="flex-1 truncate" style={{ color: '#a1a1aa' }}>{f.file}</span>
          </div>
        ))}
        {(!status.files || status.files.length === 0) && (
          <p className="text-xs py-4 text-center" style={{ color: '#52525b' }}>No changes</p>
        )}
      </div>
      <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid #1e1e24' }}>
        <input value={commitMsg} onChange={e => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          className="w-full px-2.5 py-1.5 rounded text-xs outline-none mb-2"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a35', color: '#e4e4e7' }} />
        <button className="w-full py-1.5 rounded text-xs font-medium transition-colors"
          style={{ background: '#6366f1', color: '#fff' }}>
          Commit
        </button>
      </div>
    </div>
  )
}
