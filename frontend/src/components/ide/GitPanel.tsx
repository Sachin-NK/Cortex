import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Loader2, AlertCircle, Check, Plus, Minus, RefreshCw, GitCommit } from 'lucide-react'

interface GitFile { status: string; file: string }
interface GitCommitEntry { hash: string; message: string }
interface GitStatus { branch: string; files: GitFile[]; recent_commits: GitCommitEntry[] }

const STATUS_COLOR: Record<string, string> = {
  M: '#f59e0b', A: '#22c55e', D: '#ef4444',
  R: '#6366f1', C: '#06b6d4', '?': '#71717a',
  U: '#f97316',
}

export default function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [staged, setStaged] = useState<Set<string>>(new Set())
  const [lastCommit, setLastCommit] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/git/status')
      if (!r.ok) { setStatus(null); return }
      setStatus(await r.json())
    } catch { setStatus(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const stageFile = async (file: string) => {
    try {
      await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '', files: [file] }),
      })
      setStaged(s => new Set([...s, file]))
    } catch {}
  }

  const stageAll = async () => {
    try {
      await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '', files: ['.'] }),
      })
      setStaged(new Set(status?.files.map(f => f.file) ?? []))
    } catch {}
  }

  const commit = async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    try {
      const r = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMsg }),
      })
      if (r.ok) {
        setLastCommit(commitMsg)
        setCommitMsg('')
        setStaged(new Set())
        await load()
      } else {
        const err = await r.json()
        alert(err.detail || 'Commit failed')
      }
    } catch (e: any) { alert(e.message) }
    finally { setCommitting(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: '#71717a' }}>
      <Loader2 size={14} className="animate-spin" /> Loading git status...
    </div>
  )

  if (!status) return (
    <div className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center">
      <AlertCircle size={28} style={{ color: '#52525b', opacity: 0.5 }} />
      <div>
        <p className="text-sm font-medium" style={{ color: '#71717a' }}>Git not available</p>
        <p className="text-xs mt-1" style={{ color: '#52525b' }}>
          Open a Git repository folder to use source control.
        </p>
      </div>
    </div>
  )

  const changed = status.files.filter(f => !staged.has(f.file))
  const stagedFiles = status.files.filter(f => staged.has(f.file))

  return (
    <div className="flex flex-col h-full" style={{ color: '#d4d4d8' }}>
      {/* Branch + refresh */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid #1e1e24' }}>
        <div className="flex items-center gap-2">
          <GitBranch size={13} style={{ color: '#22c55e' }} />
          <span className="text-xs font-semibold" style={{ color: '#e4e4e7' }}>{status.branch}</span>
        </div>
        <button onClick={load} className="p-1 rounded transition-colors"
          style={{ color: '#52525b' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Staged files */}
        {stagedFiles.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#52525b', borderBottom: '1px solid #1e1e24' }}>
              Staged ({stagedFiles.length})
            </div>
            {stagedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs"
                style={{ borderBottom: '1px solid #1e1e2420' }}>
                <span className="w-4 text-center font-mono shrink-0 font-bold"
                  style={{ color: STATUS_COLOR[f.status] ?? '#71717a' }}>{f.status}</span>
                <span className="flex-1 truncate" style={{ color: '#a1a1aa' }}>{f.file}</span>
                <button onClick={() => setStaged(s => { const n = new Set(s); n.delete(f.file); return n })}
                  className="shrink-0 p-0.5 rounded" style={{ color: '#52525b' }}
                  title="Unstage"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ef4444'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
                  <Minus size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Changed files */}
        {changed.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 py-1"
              style={{ borderBottom: '1px solid #1e1e24' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#52525b' }}>
                Changes ({changed.length})
              </span>
              <button onClick={stageAll} className="text-xs px-1.5 py-0.5 rounded transition-colors"
                style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.1)'}>
                Stage all
              </button>
            </div>
            {changed.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs"
                style={{ borderBottom: '1px solid #1e1e2420' }}>
                <span className="w-4 text-center font-mono shrink-0"
                  style={{ color: STATUS_COLOR[f.status] ?? '#71717a' }}>{f.status}</span>
                <span className="flex-1 truncate" style={{ color: '#a1a1aa' }}>{f.file}</span>
                <button onClick={() => stageFile(f.file)}
                  className="shrink-0 p-0.5 rounded" style={{ color: '#52525b' }}
                  title="Stage file"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#22c55e'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
                  <Plus size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {changed.length === 0 && stagedFiles.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-2">
            <Check size={20} style={{ color: '#22c55e', opacity: 0.5 }} />
            <p className="text-xs" style={{ color: '#52525b' }}>No changes</p>
          </div>
        )}

        {/* Recent commits */}
        {status.recent_commits.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#52525b', borderTop: '1px solid #1e1e24', borderBottom: '1px solid #1e1e24' }}>
              Recent commits
            </div>
            {status.recent_commits.map((c, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs"
                style={{ borderBottom: '1px solid #1e1e2420' }}>
                <GitCommit size={11} style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
                <span className="font-mono text-[10px] shrink-0" style={{ color: '#52525b' }}>{c.hash}</span>
                <span className="truncate" style={{ color: '#a1a1aa' }}>{c.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commit input */}
      <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid #1e1e24' }}>
        {lastCommit && (
          <p className="text-xs mb-2 flex items-center gap-1" style={{ color: '#22c55e' }}>
            <Check size={11} /> Committed: {lastCommit.slice(0, 40)}
          </p>
        )}
        <input value={commitMsg} onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit()}
          placeholder="Commit message..."
          className="w-full px-2.5 py-1.5 rounded text-xs outline-none mb-2"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a35', color: '#e4e4e7' }}
          onFocus={e => (e.target as HTMLElement).style.borderColor = '#6366f1'}
          onBlur={e => (e.target as HTMLElement).style.borderColor = '#2a2a35'} />
        <button
          onClick={commit}
          disabled={committing || !commitMsg.trim()}
          className="w-full py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          style={{
            background: committing || !commitMsg.trim() ? '#1a1a1f' : '#6366f1',
            color: committing || !commitMsg.trim() ? '#52525b' : '#fff',
          }}>
          {committing ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
          {committing ? 'Committing...' : 'Commit'}
        </button>
      </div>
    </div>
  )
}
