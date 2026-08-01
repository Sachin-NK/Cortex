import { useState } from 'react'
import { Search, Loader2, FileText, Hash } from 'lucide-react'
import { api } from '../../api'
import type { FileEntry } from '../../api'

interface Result { file: string; line: number; text: string }

interface Props {
  onOpenFile: (e: FileEntry, line?: number) => void
}

export default function SearchPanel({ onOpenFile }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    ;(acc[r.file] = acc[r.file] || []).push(r)
    return acc
  }, {})

  const doSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearched(false)
    try {
      const res = await api.searchFiles(query)
      setResults(res)
      setSearched(true)
    } catch { setResults([]) }
    finally { setSearching(false) }
  }

  return (
    <div className="flex flex-col h-full" style={{ color: '#d4d4d8' }}>
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e24' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>Search</span>
      </div>

      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1e1e24' }}>
        <div className="flex gap-1.5">
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search in files…"
            className="flex-1 px-2.5 py-1.5 rounded text-xs outline-none"
            style={{ background: '#1a1a1f', border: '1px solid #2a2a35', color: '#e4e4e7' }}
            onFocus={e => (e.target as HTMLElement).style.borderColor = '#6366f1'}
            onBlur={e => (e.target as HTMLElement).style.borderColor = '#2a2a35'}
          />
          <button onClick={doSearch} disabled={searching}
            className="px-2 rounded flex items-center"
            style={{ background: '#6366f1', color: '#fff' }}>
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!searched && !searching && (
          <p className="text-xs text-center py-8" style={{ color: '#52525b' }}>
            Type and press Enter to search
          </p>
        )}
        {searched && results.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: '#52525b' }}>
            No results found
          </p>
        )}
        {Object.entries(grouped).map(([file, hits]) => (
          <div key={file} className="mb-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs sticky top-0"
              style={{ background: '#111114', color: '#71717a', borderBottom: '1px solid #1e1e24' }}>
              <FileText size={11} style={{ color: '#6366f1', flexShrink: 0 }} />
              <span className="truncate">{file.split('/').pop()}</span>
              <span className="ml-auto shrink-0 px-1 rounded text-[10px]"
                style={{ background: '#1e1e2e', color: '#6366f1' }}>{hits.length}</span>
            </div>
            {hits.map((r, i) => (
              <button key={i}
                onClick={() => onOpenFile({ name: file.split('/').pop()!, path: file, is_dir: false, size: 0 }, r.line)}
                className="w-full flex items-start gap-2 px-3 py-1 text-left hover:bg-[#1e1e24] transition-colors">
                <span className="shrink-0 text-[10px] w-6 text-right pt-0.5" style={{ color: '#52525b' }}>{r.line}</span>
                <span className="text-xs truncate" style={{ color: '#a1a1aa', fontFamily: 'monospace' }}>{r.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
