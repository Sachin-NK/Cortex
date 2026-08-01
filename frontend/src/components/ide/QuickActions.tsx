import { Loader2 } from 'lucide-react'

const ACTIONS = [
  { id: 'explain',   label: 'Explain',    color: '#6366f1' },
  { id: 'refactor',  label: 'Refactor',   color: '#22c55e' },
  { id: 'fix',       label: 'Fix Bug',    color: '#ef4444' },
  { id: 'test',      label: 'Write Tests',color: '#f59e0b' },
  { id: 'document',  label: 'Add Docs',   color: '#06b6d4' },
  { id: 'complete',  label: 'Complete',   color: '#a855f7' },
]

interface Props {
  onAction: (action: string) => void
  loading: string | null
  lastProvider?: string
  disabled?: boolean
}

export default function QuickActions({ onAction, loading, lastProvider, disabled }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-1 shrink-0 overflow-x-auto"
      style={{ background: '#111114', borderBottom: '1px solid #1e1e24', minHeight: 32 }}>
      {ACTIONS.map(a => {
        const isLoading = loading === a.id
        return (
          <button key={a.id} onClick={() => !disabled && !loading && onAction(a.id)}
            disabled={!!disabled || !!loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors shrink-0"
            style={{
              background: `${a.color}18`,
              color: isLoading ? a.color : `${a.color}cc`,
              border: `1px solid ${a.color}30`,
              opacity: disabled || (loading && !isLoading) ? 0.4 : 1,
            }}
            onMouseEnter={e => {
              if (!disabled && !loading) {
                ;(e.currentTarget as HTMLElement).style.background = `${a.color}30`
                ;(e.currentTarget as HTMLElement).style.color = a.color
              }
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLElement).style.background = `${a.color}18`
              ;(e.currentTarget as HTMLElement).style.color = `${a.color}cc`
            }}>
            {isLoading && <Loader2 size={10} className="animate-spin" />}
            {a.label}
          </button>
        )
      })}
      {lastProvider && (
        <span className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded"
          style={{ background: '#1e1e2e', color: '#6366f1' }}>
          via {lastProvider}
        </span>
      )}
    </div>
  )
}
