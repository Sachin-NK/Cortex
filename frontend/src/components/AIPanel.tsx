import { useState, useRef, useEffect } from 'react'
import {
  X, Copy, Check, Loader2, Sparkles, CornerDownLeft, ChevronDown,
  MessageSquare, Code2, Eye, ChevronRight, ChevronLeft,
} from 'lucide-react'
import { api } from '../api'
import type { UserProvider } from '../api'

interface AIPanelProps {
  currentFile?: string
  currentLanguage?: string
  initialAction?: { code: string; lang: string; action: string } | null
  onClose: () => void
  onInsert: (text: string) => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: { provider: string; model: string; tokens: number; cost_usd: number }
}

interface InlineDiff {
  original: string
  suggested: string
  provider: string
  model: string
}

interface ReviewIssue {
  line?: number
  severity: string
  message: string
}

type PanelMode = 'chat' | 'inline' | 'review'

const QUICK_ACTIONS = [
  { id: 'explain',  label: 'Explain',   prompt: 'Explain what this code does in detail.' },
  { id: 'refactor', label: 'Refactor',  prompt: 'Refactor this code to be cleaner and follow best practices.' },
  { id: 'fix',      label: 'Fix Bug',   prompt: 'Identify and fix any bugs or issues in this code.' },
  { id: 'test',     label: 'Tests',     prompt: 'Write comprehensive unit tests for this code.' },
  { id: 'document', label: 'Docs',      prompt: 'Add detailed documentation/comments to this code.' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="p-1 rounded transition-colors hover:bg-gray-700"
      style={{ color: '#52525b' }}
      title="Copy"
    >
      {copied ? <Check size={12} style={{ color: '#4ade80' }} /> : <Copy size={12} />}
    </button>
  )
}

function ProviderBadge({ provider, model }: { provider: string; model: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
      {provider} / {model.split('/').pop()}
    </span>
  )
}

export default function AIPanel({ currentFile, currentLanguage, initialAction, onClose, onInsert }: AIPanelProps) {
  const [mode, setMode] = useState<PanelMode>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionFired, setActionFired] = useState(false)
  const [providers, setProviders] = useState<UserProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [inlineDiff, setInlineDiff] = useState<InlineDiff | null>(null)
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    api.userProviders().then(p => {
      const active = p.filter(pr => pr.is_active)
      setProviders(active)
      if (active.length > 0) setSelectedProvider(active[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (initialAction && !actionFired) {
      setActionFired(true)
      fireAction(initialAction.action, initialAction.code, initialAction.lang)
    }
  }, [initialAction]) // eslint-disable-line

  const fireAction = async (action: string, code: string, lang: string) => {
    const qa = QUICK_ACTIONS.find(a => a.id === action)
    const prompt = qa ? qa.prompt : action
    const displayLang = lang || currentLanguage || 'plaintext'
    setMessages(prev => [...prev, {
      role: 'user',
      content: `[${action.toUpperCase()}]${code ? `\n\`\`\`${displayLang}\n${code.slice(0, 300)}${code.length > 300 ? '\n…' : ''}\n\`\`\`` : ` on ${currentFile?.split(/[/\\]/).pop() ?? 'current file'}`}`,
    }])
    setLoading(true)
    try {
      const res = await api.codeAction({
        action: prompt,
        code: code || undefined,
        language: displayLang,
        file_path: currentFile,
        policy: selectedProvider || undefined,
      })
      setMessages(prev => [...prev, {
        role: 'assistant', content: res.result,
        meta: { provider: res.provider, model: res.model, tokens: res.tokens, cost_usd: res.cost_usd },
      }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userInput = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userInput }])
    setLoading(true)
    try {
      const res = await api.codeAction({
        action: 'chat',
        user_message: userInput,
        language: currentLanguage || 'plaintext',
        file_path: currentFile,
        policy: selectedProvider || undefined,
      })
      setMessages(prev => [...prev, {
        role: 'assistant', content: res.result,
        meta: { provider: res.provider, model: res.model, tokens: res.tokens, cost_usd: res.cost_usd },
      }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const runReview = async () => {
    if (!currentFile) return
    setReviewLoading(true)
    setReviewIssues([])
    try {
      const res = await api.codeAction({
        action: 'Review this code thoroughly. List each issue as: LINE:SEVERITY:MESSAGE (one per line). Severities: error, warning, info. After the list, add a blank line and a 2-sentence summary.',
        file_path: currentFile,
        language: currentLanguage,
      })
      const lines = res.result.split('\n')
      const parsed: ReviewIssue[] = []
      for (const line of lines) {
        const m = line.match(/^(\d+):(error|warning|info):(.+)$/i)
        if (m) parsed.push({ line: parseInt(m[1]), severity: m[2].toLowerCase(), message: m[3].trim() })
      }
      if (parsed.length === 0) parsed.push({ severity: 'info', message: res.result.slice(0, 400) })
      setReviewIssues(parsed)
    } catch (e: any) {
      setReviewIssues([{ severity: 'error', message: e.message }])
    } finally { setReviewLoading(false) }
  }

  const runInlineSuggest = async (action: string) => {
    setLoading(true)
    try {
      const res = await api.codeAction({
        action,
        file_path: currentFile,
        language: currentLanguage || 'plaintext',
      })
      setInlineDiff({ original: '(current file)', suggested: res.result, provider: res.provider, model: res.model })
    } catch (e: any) {
      setInlineDiff({ original: '', suggested: `Error: ${e.message}`, provider: '', model: '' })
    } finally { setLoading(false) }
  }

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center py-3 border-l shrink-0"
        style={{ width: 40, background: '#111114', borderColor: '#1e1e24' }}
      >
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded transition-colors"
          style={{ color: '#6366f1' }}
          title="Expand AI Panel"
        >
          <ChevronLeft size={16} />
        </button>
        <Sparkles size={14} style={{ color: '#6366f1', marginTop: 8 }} />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col shrink-0 border-l h-full"
      style={{ width: 360, background: '#111114', borderColor: '#1e1e24' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{ borderColor: '#1e1e24' }}>
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: '#6366f1' }} />
          <span className="text-sm font-medium" style={{ color: '#e4e4e7' }}>Cortex AI</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Model selector */}
          {providers.length > 0 && (
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="text-xs rounded px-1.5 py-0.5 border focus:outline-none focus:ring-1 focus:ring-indigo-500 mr-1"
              style={{ background: '#0d0d0f', borderColor: '#2a2a35', color: '#818cf8', maxWidth: 110 }}
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-gray-800 transition-colors" style={{ color: '#52525b' }} title="Collapse">
            <ChevronRight size={14} />
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 transition-colors" style={{ color: '#52525b' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b shrink-0" style={{ borderColor: '#1e1e24' }}>
        {([
          { id: 'chat',   icon: MessageSquare, label: 'Chat' },
          { id: 'inline', icon: Code2,         label: 'Inline' },
          { id: 'review', icon: Eye,           label: 'Review' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs transition-colors flex-1 justify-center"
            style={{
              color: mode === tab.id ? '#6366f1' : '#71717a',
              borderBottom: mode === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              background: mode === tab.id ? 'rgba(99,102,241,0.06)' : 'transparent',
            }}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b shrink-0" style={{ borderColor: '#1e1e24' }}>
        {QUICK_ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => mode === 'inline' ? runInlineSuggest(a.id) : fireAction(a.id, '', currentLanguage || 'plaintext')}
            className="px-2 py-0.5 text-xs rounded transition-colors border"
            style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8', borderColor: 'rgba(99,102,241,0.2)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)' }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Context file */}
      {currentFile && (
        <div className="px-3 py-1 text-xs border-b truncate shrink-0" style={{ borderColor: '#1e1e24', color: '#52525b' }}>
          📄 {currentFile.split(/[/\\]/).pop()} ({currentLanguage})
        </div>
      )}

      {/* -- Chat mode --------------------------------------- */}
      {mode === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="text-center mt-8">
                <Sparkles size={26} style={{ color: '#3f3f46', margin: '0 auto 12px' }} />
                <p className="text-xs" style={{ color: '#52525b' }}>
                  Ask about the current file, or use Quick Actions above.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <div className="ml-4 rounded-xl px-3 py-2 border" style={{ background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.2)' }}>
                    <p className="text-xs whitespace-pre-wrap" style={{ color: '#c7d2fe' }}>{msg.content}</p>
                  </div>
                ) : (
                  <div className="rounded-xl px-3 py-2 border" style={{ background: '#1a1a1f', borderColor: '#2a2a35' }}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium" style={{ color: '#818cf8' }}>AI</span>
                      <div className="flex items-center gap-1">
                        <CopyButton text={msg.content} />
                        <button onClick={() => onInsert(msg.content)} title="Insert" className="p-1 rounded hover:bg-gray-700 transition-colors" style={{ color: '#52525b' }}>
                          <CornerDownLeft size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#e4e4e7' }}>{msg.content}</p>
                    {msg.meta && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ProviderBadge provider={msg.meta.provider} model={msg.meta.model} />
                        <span className="text-xs" style={{ color: '#3f3f46' }}>
                          {msg.meta.tokens} tok • ${msg.meta.cost_usd.toFixed(5)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="rounded-xl px-3 py-2 border flex items-center gap-2" style={{ background: '#1a1a1f', borderColor: '#2a2a35' }}>
                <Loader2 size={12} className="animate-spin" style={{ color: '#6366f1' }} />
                <span className="text-xs" style={{ color: '#71717a' }}>Thinking…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-3 border-t shrink-0" style={{ borderColor: '#1e1e24' }}>
            <div className="flex gap-2 items-end">
              <textarea
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Ask about this file… (Enter to send)"
                rows={2}
                className="flex-1 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none border"
                style={{ background: '#0d0d0f', borderColor: '#2a2a35', color: '#e4e4e7' }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366f1' }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a35' }}
              />
              <button
                onClick={sendMessage} disabled={loading || !input.trim()}
                className="p-2 rounded-lg transition-colors disabled:opacity-40 shrink-0"
                style={{ background: '#6366f1' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#818cf8' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#6366f1' }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
