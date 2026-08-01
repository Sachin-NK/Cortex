import { useState, useEffect, useRef } from 'react'
import { Search, FileText, ChevronRight, Command } from 'lucide-react'
import { api } from '../../api'
import type { FileEntry } from '../../api'

interface Action { id: string; label: string; description?: string; icon?: any; onRun: () => void }

interface Props {
  mode: 'files' | 'commands'
  recentFiles: string[]
  workspaceFiles: FileEntry[]
  onOpen: (path: string, name: string) => void
  onClose: () => void
  actions?: Action[]
}

function fileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts','tsx'].includes(ext)) return '#3b82f6'
  if (['js','jsx'].includes(ext)) return '#f59e0b'
  if (['py'].includes(ext)) return '#22c55e'
  if (['json','yaml','yml'].includes(ext)) return '#f97316'
  if (['md'].includes(ext)) return '#a78bfa'
  return '#71717a'
}

function flattenTree(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = []
  const walk = (es: FileEntry[]) => {
    for (const e of es) {
      if (!e.is_dir) result.push(e)
      if (e.children) walk(e.children)
    }
  }
  walk(entries)
  return result
}

export default function CommandPalette({ mode, recentFiles, workspaceFiles, onOpen, onClose, actions = [] }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const allFiles = flattenTree(workspaceFiles)

  const fileItems = query
    ? allFiles.filter(f => f.name.toLowerCase().includes(query.toLowerCase()) || f.path.toLowerCase().includes(query.toLowerCase()))
    : allFiles.filter(f => recentFiles.includes(f.path)).slice(0, 8)

  const cmdItems = actions.filter(a => !query || a.label.toLowerCase().includes(query.toLowerCase()))

  const items = mode === 'files' ? fileItems : cmdItems

  useEffect(() => { setSelected(0) }, [query])

  const confirm = (idx: number) => {
    if (mode === 'files') {
      const f = fileItems[idx]
      if (f) { onOpen(f.path, f.name); onClose() }
    } else {
      const a = cmdItems[idx]
      if (a) { a.onRun(); onClose() }
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); confirm(selected) }
  }

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="fixed inset-0 z-[999] flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[600px] rounded-xl shadow-2xl overflow-hidden"
        style={{ background: '#111114', border: '1px solid #2a2a35' }}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #1e1e24' }}>
          <Search size={16} style={{ color: '#52525b', flexShrink: 0 }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={mode === 'files' ? 'Search files by name…' : 'Search commands…'}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: '#e4e4e7' }} />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1e1e24', color: '#52525b' }}>esc</kbd>
        </div>

        {/* Label */}
        {!query && (
          <div className="px-4 py-1.5">
            <span className="text-[11px]" style={{ color: '#52525b' }}>
              {mode === 'files' ? 'Recent files' : 'Commands'}
            </span>
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: '#52525b' }}>
              {query ? 'No results' : mode === 'files' ? 'No recent files' : 'No commands'}
            </p>
          )}
          {mode === 'files' && (fileItems as FileEntry[]).map((f, i) => (
            <button key={f.path} onClick={() => confirm(i)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{ background: i === selected ? '#1e1e2e' : 'transparent' }}
              onMouseEnter={() => setSelected(i)}>
              <FileText size={14} style={{ color: fileColor(f.name), flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: '#e4e4e7' }}>{f.name}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#52525b' }}>{f.path}</p>
              </div>
              {i === selected && <ChevronRight size={12} style={{ color: '#6366f1', flexShrink: 0 }} />}
            </button>
          ))}
          {mode === 'commands' && (cmdItems as Action[]).map((a, i) => {
            const Icon = a.icon ?? Command
            return (
              <button key={a.id} onClick={() => confirm(i)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ background: i === selected ? '#1e1e2e' : 'transparent' }}
                onMouseEnter={() => setSelected(i)}>
                <Icon size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: '#e4e4e7' }}>{a.label}</p>
                  {a.description && <p className="text-xs mt-0.5" style={{ color: '#52525b' }}>{a.description}</p>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
