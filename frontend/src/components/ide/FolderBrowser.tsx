import { useState, useEffect } from 'react'
import { FolderInput, HardDrive, Folder, ChevronRight, X, Home, Loader2 } from 'lucide-react'
import { api } from '../../api'
import type { FileEntry } from '../../api'

interface Props { onSelect: (path: string) => void; onClose: () => void }

export default function FolderBrowser({ onSelect, onClose }: Props) {
  const [drives, setDrives] = useState<{ path: string; label: string }[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    api.listDrives().then(d => {
      setDrives(d)
      if (d.length > 0) browse(d[0].path, [])
    }).catch(console.error)
  }, [])

  const browse = async (path: string, hist: string[]) => {
    setLoading(true)
    try {
      const res = await api.browseDir(path)
      setCurrentPath(res.path)
      setEntries(res.entries.filter(e => e.is_dir))
      setHistory(hist)
    } catch (e: any) { alert(e.message) }
    finally { setLoading(false) }
  }

  const goBack = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    browse(prev, history.slice(0, -1))
  }

  const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 560, maxHeight: '70vh', background: '#111114', border: '1px solid #2a2a35' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: '1px solid #1e1e24' }}>
          <div className="flex items-center gap-2">
            <FolderInput size={16} style={{ color: '#6366f1' }} />
            <span className="font-semibold text-sm" style={{ color: '#e4e4e7' }}>Open Folder from Device</span>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <X size={16} />
          </button>
        </div>

        {/* Drives */}
        <div className="flex gap-1.5 px-4 py-2 shrink-0 flex-wrap"
          style={{ borderBottom: '1px solid #1e1e24' }}>
          {drives.map(d => (
            <button key={d.path} onClick={() => browse(d.path, [])}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
              style={{ background: '#1a1a1f', border: '1px solid #2a2a35', color: '#a1a1aa' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#2a2a35'}>
              <HardDrive size={11} /> {d.label}
            </button>
          ))}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-1.5 shrink-0 overflow-x-auto"
          style={{ borderBottom: '1px solid #1e1e24' }}>
          <button onClick={goBack} disabled={history.length === 0}
            className="flex items-center gap-1 text-xs transition-colors shrink-0"
            style={{ color: history.length > 0 ? '#6366f1' : '#2a2a35' }}>
            <ChevronRight size={11} className="rotate-180" /> Back
          </button>
          <span className="mx-2" style={{ color: '#2a2a35' }}>|</span>
          <Home size={11} style={{ color: '#52525b', flexShrink: 0 }} />
          {parts.map((p, i) => (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              <ChevronRight size={10} style={{ color: '#2a2a35' }} />
              <span className="text-xs" style={{ color: i === parts.length - 1 ? '#a1a1aa' : '#52525b' }}>{p}</span>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: '#52525b' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: '#52525b' }}>No subfolders</p>
          ) : entries.map(e => (
            <button key={e.path} onClick={() => browse(e.path, [...history, currentPath])}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm group transition-colors"
              style={{ color: '#d4d4d8' }}
              onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = '#1e1e24'}
              onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}>
              <Folder size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <span className="flex-1 truncate">{e.name}</span>
              <ChevronRight size={12} style={{ color: '#52525b', flexShrink: 0 }} />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid #1e1e24' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] mb-0.5" style={{ color: '#52525b' }}>Selected:</p>
            <p className="text-xs font-mono truncate" style={{ color: '#a1a1aa' }}>{currentPath || '—'}</p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ background: '#1a1a1f', color: '#71717a', border: '1px solid #2a2a35' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#52525b'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#2a2a35'}>
            Cancel
          </button>
          <button onClick={() => { if (currentPath) { onSelect(currentPath); onClose() } }}
            disabled={!currentPath}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: currentPath ? '#6366f1' : '#2a2a35', color: currentPath ? '#fff' : '#52525b' }}
            onMouseEnter={e => { if (currentPath) (e.currentTarget as HTMLElement).style.background = '#4f46e5' }}
            onMouseLeave={e => { if (currentPath) (e.currentTarget as HTMLElement).style.background = '#6366f1' }}>
            Open Here
          </button>
        </div>
      </div>
    </div>
  )
}
