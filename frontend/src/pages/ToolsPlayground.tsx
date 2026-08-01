import { useEffect, useState } from 'react'
import { api, MCPTool } from '../api'
import {
  Wrench, Play, Loader2, ChevronRight, Code2, FileSearch,
  Globe, GitCompare, Hash, FileText, Search, TestTube,
} from 'lucide-react'

// ── Tool icon mapping ─────────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, any> = {
  code_lint: Code2,
  json_validate: FileSearch,
  regex_test: Hash,
  estimate_tokens: Hash,
  web_search: Globe,
  diff_text: GitCompare,
  read_file: FileText,
  write_file: FileText,
  list_files: FileSearch,
  search_files: Search,
  run_tests: TestTube,
}

// ── JSON syntax highlighter (simple) ─────────────────────────────────────────
function JsonOutput({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2)
  // Simple colorize: strings green, numbers yellow, booleans/null purple
  const highlighted = text
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span style="color:#818cf8">$1</span>$2')
    .replace(/: ("(?:[^"\\]|\\.)*")/g, ': <span style="color:#4ade80">$1</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:#fbbf24">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color:#f472b6">$1</span>')

  return (
    <pre
      className="text-xs leading-relaxed overflow-auto p-4 bg-gray-950 rounded-lg border border-gray-800 max-h-96 font-mono"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}

// ── Tool input forms ──────────────────────────────────────────────────────────
const MODELS = ['claude-3-5-haiku-20241022', 'gpt-4o-mini', 'gemini-1.5-flash', 'gpt-4o', 'claude-3-5-sonnet-20241022']
const LANGUAGES = ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'cpp', 'c', 'ruby', 'php', 'bash']

function ToolForm({
  tool, onRun, loading,
}: {
  tool: MCPTool; onRun: (args: Record<string, unknown>) => void; loading: boolean
}) {
  const [args, setArgs] = useState<Record<string, string>>({})
  const set = (k: string, v: string) => setArgs(a => ({ ...a, [k]: v }))

  const submit = () => {
    const parsed: Record<string, unknown> = {}
    Object.entries(args).forEach(([k, v]) => {
      if (v === '') return
      const n = Number(v)
      parsed[k] = !isNaN(n) && v.trim() !== '' ? n : v
    })
    onRun(parsed)
  }

  const renderForm = () => {
    switch (tool.id) {
      case 'code_lint':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Language</label>
              <select value={args.language ?? ''} onChange={e => set('language', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">Select language…</option>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Code</label>
              <textarea rows={10} value={args.code ?? ''} onChange={e => set('code', e.target.value)}
                placeholder="Paste code to lint…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        )

      case 'json_validate':
        return (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">JSON</label>
            <textarea rows={12} value={args.json ?? ''} onChange={e => set('json', e.target.value)}
              placeholder='{"key": "value"}'
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
        )

      case 'regex_test':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Pattern</label>
              <input value={args.pattern ?? ''} onChange={e => set('pattern', e.target.value)}
                placeholder="e.g. \d+" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Test String</label>
              <textarea rows={4} value={args.test_string ?? ''} onChange={e => set('test_string', e.target.value)}
                placeholder="String to test against…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Flags (optional)</label>
              <input value={args.flags ?? ''} onChange={e => set('flags', e.target.value)}
                placeholder="g, i, m, s…" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        )

      case 'estimate_tokens':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Model</label>
              <select value={args.model ?? ''} onChange={e => set('model', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">Select model…</option>
                {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Text</label>
              <textarea rows={10} value={args.text ?? ''} onChange={e => set('text', e.target.value)}
                placeholder="Paste text to count tokens…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        )

      case 'web_search':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Query</label>
              <input value={args.query ?? ''} onChange={e => set('query', e.target.value)}
                placeholder="Search query…" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Num Results</label>
              <input type="number" min="1" max="20" value={args.num_results ?? '5'} onChange={e => set('num_results', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        )

      case 'diff_text':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Original</label>
              <textarea rows={12} value={args.original ?? ''} onChange={e => set('original', e.target.value)}
                placeholder="Original text…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Modified</label>
              <textarea rows={12} value={args.modified ?? ''} onChange={e => set('modified', e.target.value)}
                placeholder="Modified text…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        )

      default:
        // Generic: render text input for each likely arg based on tool description
        return (
          <div className="space-y-3">
            {['input', 'path', 'query', 'text', 'content', 'name'].map(key => (
              <div key={key}>
                <label className="text-xs text-gray-400 mb-1 block capitalize">{key}</label>
                <input value={args[key] ?? ''} onChange={e => set(key, e.target.value)}
                  placeholder={`${key}…`}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
            ))}
          </div>
        )
    }
  }

  return (
    <div className="space-y-4">
      {renderForm()}
      <button
        onClick={submit}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {loading ? 'Running…' : 'Run'}
      </button>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ToolsPlayground() {
  const [tools, setTools] = useState<MCPTool[]>([])
  const [selected, setSelected] = useState<MCPTool | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    api.mcpTools()
      .then(t => { setTools(t); if (t.length > 0) setSelected(t[0]) })
      .catch(e => console.error(e))
      .finally(() => setFetching(false))
  }, [])

  const run = async (args: Record<string, unknown>) => {
    if (!selected) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await api.invokeTool(selected.id, args)
      if (res.success) setResult(res.output)
      else setError(res.error ?? 'Tool returned an error')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Tool list */}
      <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">MCP Tools</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {fetching ? (
            <div className="flex items-center justify-center py-8 text-gray-600">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : tools.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-8 px-4">No tools available</p>
          ) : (
            tools.map(t => {
              const Icon = TOOL_ICONS[t.id] ?? Wrench
              const active = selected?.id === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelected(t); setResult(null); setError(null) }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    active ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200 border-l-2 border-transparent'
                  }`}
                >
                  <Icon size={15} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                  </div>
                  {active && <ChevronRight size={12} className="ml-auto shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-64 text-gray-600">
            <div className="text-center">
              <Wrench size={36} className="mx-auto mb-3 opacity-30" />
              <p>Select a tool to get started</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl">
            {/* Tool header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                {(() => { const Icon = TOOL_ICONS[selected.id] ?? Wrench; return <Icon size={20} className="text-indigo-400" /> })()}
                <h2 className="text-xl font-bold">{selected.name}</h2>
              </div>
              <p className="text-sm text-gray-500">{selected.description}</p>
            </div>

            {/* Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Inputs</p>
              <ToolForm tool={selected} onRun={run} loading={loading} />
            </div>

            {/* Results */}
            {error && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-red-400 mb-1">Error</p>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {result !== null && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Output</p>
                <JsonOutput value={result} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
