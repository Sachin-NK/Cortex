import { useEffect, useRef, useState } from 'react'
import { X, Terminal as TerminalIcon, Circle } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

interface TerminalPanelProps {
  onClose: () => void
}

const WS_URL = 'ws://localhost:8000/terminal'

export default function TerminalPanel({ onClose }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = () => {
    if (!mountedRef.current) return
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      termRef.current?.write('\r\n\x1b[32mConnected to terminal\x1b[0m\r\n')
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      const data = typeof e.data === 'string' ? e.data : ''
      termRef.current?.write(data)
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      termRef.current?.write('\r\n\x1b[31mDisconnected. Reconnecting in 3s…\x1b[0m\r\n')
      reconnectTimer.current = setTimeout(() => { if (mountedRef.current) connect() }, 3000)
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      termRef.current?.write('\r\n\x1b[31mConnection error\x1b[0m\r\n')
    }
  }

  useEffect(() => {
    mountedRef.current = true

    const term = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e5e7eb',
        cursor: '#818cf8',
        selectionBackground: '#3730a3',
        black: '#1f2937',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#818cf8',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f3f4f6',
        brightBlack: '#374151',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#a5b4fc',
        brightMagenta: '#c084fc',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    termRef.current = term
    fitRef.current = fitAddon

    if (containerRef.current) {
      term.open(containerRef.current)
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
    }

    // Send keystrokes to backend
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data)
      }
    })

    connect()

    // Handle resize
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (mountedRef.current) fitAddon.fit()
      })
    })
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      observer.disconnect()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-60 bg-[#0a0a0f] border-t border-gray-800 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 shrink-0 bg-gray-900">
        <div className="flex items-center gap-2">
          <TerminalIcon size={13} className="text-gray-400" />
          <span className="text-xs font-medium text-gray-400">Terminal</span>
          <span className="flex items-center gap-1 text-xs">
            <Circle size={6} className={connected ? 'text-green-400 fill-green-400' : 'text-red-400 fill-red-400'} />
            <span className={connected ? 'text-green-500' : 'text-red-500'}>{connected ? 'connected' : 'disconnected'}</span>
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300">
          <X size={13} />
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 min-h-0 px-1 py-1 overflow-hidden" />
    </div>
  )
}
