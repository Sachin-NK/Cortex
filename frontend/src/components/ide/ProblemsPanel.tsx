import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'

export interface Problem { file: string; line: number; col?: number; message: string; severity: 'error' | 'warning' | 'info' }

interface Props {
  problems: Problem[]
  onJumpTo: (file: string, line: number) => void
}

const ICONS = {
  error:   { icon: AlertCircle,  color: '#ef4444' },
  warning: { icon: AlertTriangle, color: '#f59e0b' },
  info:    { icon: Info,          color: '#3b82f6' },
}

export default function ProblemsPanel({ problems, onJumpTo }: Props) {
  const errors   = problems.filter(p => p.severity === 'error').length
  const warnings = problems.filter(p => p.severity === 'warning').length

  return (
    <div className="flex flex-col h-full" style={{ color: '#d4d4d8' }}>
      <div className="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid #1e1e24' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>Problems</span>
        {errors > 0 && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
            <AlertCircle size={12} /> {errors}
          </span>
        )}
        {warnings > 0 && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={12} /> {warnings}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {problems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CheckCircle size={28} style={{ color: '#22c55e', opacity: 0.4 }} />
            <p className="text-xs" style={{ color: '#52525b' }}>No problems detected</p>
          </div>
        ) : problems.map((p, i) => {
          const { icon: Icon, color } = ICONS[p.severity] ?? ICONS.info
          return (
            <button key={i} onClick={() => onJumpTo(p.file, p.line)}
              className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
              style={{ borderBottom: '1px solid #1e1e24' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1e1e24'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              <Icon size={13} style={{ color, flexShrink: 0, marginTop: 1 }} />
              <div className="min-w-0">
                <p className="text-xs truncate" style={{ color: '#e4e4e7' }}>{p.message}</p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: '#52525b' }}>
                  {p.file.split('/').pop()} · Line {p.line}{p.col ? `:${p.col}` : ''}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
