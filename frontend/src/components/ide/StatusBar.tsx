import { Bot, AlertCircle, CheckCircle } from 'lucide-react'

interface Props {
  language: string
  line: number
  col: number
  wordCount: number
  hasProblems: boolean
  lastProvider?: string
  onAIToggle: () => void
}

export default function StatusBar({ language, line, col, wordCount, hasProblems, lastProvider, onAIToggle }: Props) {
  return (
    <div className="flex items-center justify-between px-3 shrink-0 select-none"
      style={{ height: 24, background: '#111114', borderTop: '1px solid #1e1e24', fontSize: 11, color: '#71717a' }}>
      <div className="flex items-center gap-4">
        {hasProblems
          ? <span className="flex items-center gap-1" style={{ color: '#ef4444' }}><AlertCircle size={11} /> Problems</span>
          : <span className="flex items-center gap-1" style={{ color: '#22c55e' }}><CheckCircle size={11} /> No problems</span>}
        {language && <span style={{ color: '#a1a1aa' }}>{language}</span>}
      </div>
      <div className="flex items-center gap-4">
        {lastProvider && (
          <span className="flex items-center gap-1" style={{ color: '#6366f1' }}>
            <Bot size={11} /> {lastProvider}
          </span>
        )}
        <span>Ln {line}, Col {col}</span>
        <span>{wordCount} words</span>
        <span>UTF-8</span>
        <button onClick={onAIToggle}
          className="flex items-center gap-1 px-2 rounded transition-colors"
          style={{ color: '#6366f1', height: 18, background: '#1e1e2e' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#2e2e3e'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#1e1e2e'}>
          <Bot size={11} /> AI
        </button>
      </div>
    </div>
  )
}
