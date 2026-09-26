import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
  warning: AlertTriangle,
}
const COLORS = {
  success: { bg: '#0d1f14', border: '#166534', icon: '#4ade80', title: '#86efac' },
  error:   { bg: '#1c0a0a', border: '#7f1d1d', icon: '#f87171', title: '#fca5a5' },
  info:    { bg: '#0d1225', border: '#1e3a8a', icon: '#818cf8', title: '#a5b4fc' },
  warning: { bg: '#1c1205', border: '#92400e', icon: '#fbbf24', title: '#fde68a' },
}

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const Icon = ICONS[t.type]
  const colors = COLORS[t.type]

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const dur = t.duration ?? 4000
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRemove(t.id), 300)
    }, dur)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onRemove])

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl pointer-events-auto transition-all duration-300"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(24px)',
        maxWidth: 380,
        minWidth: 280,
      }}>
      <Icon size={16} style={{ color: colors.icon, flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: colors.title }}>{t.title}</p>
        {t.message && (
          <p className="text-xs mt-0.5" style={{ color: '#71717a' }}>{t.message}</p>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(t.id), 300) }}
        className="shrink-0 p-0.5 rounded transition-colors"
        style={{ color: '#52525b' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
        <X size={13} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const add = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `toast_${++counterRef.current}`
    setToasts(ts => [...ts, { ...t, id }])
  }, [])

  const remove = useCallback((id: string) => {
    setToasts(ts => ts.filter(t => t.id !== id))
  }, [])

  const ctx: ToastContextValue = {
    toast:   add,
    success: (title, message) => add({ type: 'success', title, message }),
    error:   (title, message) => add({ type: 'error',   title, message }),
    info:    (title, message) => add({ type: 'info',    title, message }),
    warning: (title, message) => add({ type: 'warning', title, message }),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none"
        aria-live="polite">
        {toasts.map(t => (
          <ToastItem key={t.id} t={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// Standalone singleton for use outside React components (e.g. api.ts error handler)
let _globalToast: ToastContextValue | null = null
export function setGlobalToast(t: ToastContextValue) { _globalToast = t }
export const globalToast = {
  success: (title: string, msg?: string) => _globalToast?.success(title, msg),
  error:   (title: string, msg?: string) => _globalToast?.error(title, msg),
  info:    (title: string, msg?: string) => _globalToast?.info(title, msg),
  warning: (title: string, msg?: string) => _globalToast?.warning(title, msg),
}
