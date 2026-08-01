import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, Terminal as TermIcon, Circle } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

interface TermInstance { id: string; label: string }

function TermPane({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mountedRef = useRef(true)
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const ws = new WebSocket('ws://localhost:8000/terminal')
    wsRef.current = ws
    ws.onopen = () => { if (mountedRef.current) setConnected(true) }
    ws.onmessage = e => termRef.current?.write(typeof e.data === 'string' ? e.data : '')
    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      termRef.current?.write('\r\n\x1b[31mDisconnected. Reconnecting…\x1b[0m\r\n')
      setTimeout(() => { if (mountedRef.current) connect() }, 3000)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const term = new Terminal({
      theme: { background: '#0d0d0f', foreground: '#e4e4e7', cursor: '#6366f1', selectionBackground: '#3730a3',
        black: '#1e1e24', red: '#ef4444', green: '#22c55e', yellow: '#f59e0b', blue: '#6366f1',
        magenta: '#a855f7', cyan: '#06b6d4', white: '#e4e4e7',
        brightBlack: '#2a2a35', brightRed: '#f87171', brightGreen: '#4ade80',
        brightYellow: '#fbbf24', brightBlue: '#818cf8', brightMagenta: '#c084fc',
        brightCyan: '#67e8f9', brightWhite: '#ffffff',
      },
      fontFamily: '"Cascadia Code","Fira Code",Consolas,monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    termRef.current = term
    fitRef.current = fit
    if (containerRef.current) {
      term.open(containerRef.current)
      requestAnimationFrame(() => fit.fit())
    }
    term.onData(d => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(d))
    connect()
    const obs = new ResizeObserver(() => requestAnimationFrame(() => mountedRef.current && fit.fit()))
    if (containerRef.current) obs.observe(containerRef.current)
    return () => { mountedRef.current = false; wsRef.current?.close(); obs.disconnect(); term.dispose() }
  }, [connect])

  useEffect(() => { if (active) requestAnimationFrame(() => fitRef.current?.fit()) }, [active])

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ display: active ? 'flex' : 'none' }}>
      <div ref={containerRef} className="flex-1 min-h-0 px-1 py-1" />
    </div>
  )
}

interface Props { height: number; onHeightChange: (h: number) => void; onClose: () => void }

export default function TerminalTabs({ height, onHeightChange, onClose }: Props) {
  const [tabs, setTabs] = useState<TermInstance[]>([{ id: '1', label: 'Terminal 1' }])
  const [active, setActive] = useState('1')
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const addTab = () => {
    const id = String(Date.now())
    setTabs(ts => [...ts, { id, label: `Terminal ${ts.length + 1}` }])
    setActive(id)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = tabs.filter(t => t.id !== id)
    setTabs(next)
    if (active === id) setActive(next[next.length - 1]?.id ?? '')
    if (next.length === 0) onClose()
  }

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: height }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      onHeightChange(Math.max(100, Math.min(600, dragRef.current.startH + delta)))
    }
    const onUp = () => { dragRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col shrink-0" style={{ height, borderTop: '1px solid #1e1e24' }}>
      {/* Resize handle */}
      <div className="h-1 cursor-ns-resize shrink-0 hover:bg-indigo-500/30 transition-colors"
        style={{ background: '#1e1e24' }} onMouseDown={onDragStart} />
      {/* Tab bar */}
      <div className="flex items-center shrink-0" style={{ background: '#111114', borderBottom: '1px solid #1e1e24', height: 32 }}>
        {tabs.map(tab => (
          <div key={tab.id} onClick={() => setActive(tab.id)}
            className="flex items-center gap-2 px-3 cursor-pointer text-xs shrink-0"
            style={{ height: 32, background: active === tab.id ? '#0d0d0f' : 'transparent',
              color: active === tab.id ? '#e4e4e7' : '#71717a',
              borderRight: '1px solid #1e1e24' }}>
            <TermIcon size={12} />
            {tab.label}
            <button onClick={e => closeTab(tab.id, e)} className="ml-1"
              style={{ color: '#52525b' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
              <X size={11} />
            </button>
          </div>
        ))}
        <button onClick={addTab} className="px-2 flex items-center"
          style={{ color: '#52525b', height: 32 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
          <Plus size={13} />
        </button>
        <button onClick={onClose} className="ml-auto px-2 flex items-center"
          style={{ color: '#52525b', height: 32 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
          <X size={13} />
        </button>
      </div>
      {/* Terminal panes */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{ background: '#0d0d0f' }}>
        {tabs.map(tab => <TermPane key={tab.id} active={active === tab.id} />)}
      </div>
    </div>
  )
}
