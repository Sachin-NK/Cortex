import { useEffect, useRef } from 'react'
import { FilePlus, FolderPlus, Edit2, Trash2, Copy, Clipboard } from 'lucide-react'

export interface ContextMenuItem {
  label: string
  icon?: any
  onClick: () => void
  danger?: boolean
  separator?: boolean
}

interface Props {
  x: number; y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => {
      document.addEventListener('mousedown', handler)
      document.addEventListener('keydown', escape)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  // Keep menu inside viewport
  const menuW = 200, menuH = items.length * 32
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top  = Math.min(y, window.innerHeight - menuH - 8)

  return (
    <div ref={ref} className="fixed z-[999] py-1 rounded-lg shadow-2xl"
      style={{ left, top, width: menuW, background: '#1a1a1f', border: '1px solid #2a2a35' }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 mx-3" style={{ borderTop: '1px solid #2a2a35' }} />
        ) : (
          <button key={i}
            onClick={() => { item.onClick(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left"
            style={{ color: item.danger ? '#f87171' : '#d4d4d8' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#2a2a35'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            {item.icon && <item.icon size={13} style={{ opacity: 0.7 }} />}
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
