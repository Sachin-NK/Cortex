import { X } from 'lucide-react'

export interface TabItem { path: string; name: string; modified: boolean; language: string }

const LANG_COLORS: Record<string, string> = {
  typescript: '#3b82f6', javascript: '#f59e0b', python: '#22c55e',
  json: '#f97316', markdown: '#a78bfa', css: '#06b6d4', html: '#ef4444',
  rust: '#f87171', go: '#67e8f9', shell: '#4ade80', sql: '#fb923c',
}

interface Props {
  tabs: TabItem[]
  active: string
  onActivate: (path: string) => void
  onClose: (path: string, e: React.MouseEvent) => void
}

export default function EditorTabs({ tabs, active, onActivate, onClose }: Props) {
  if (tabs.length === 0) return null
  return (
    <div className="flex items-end overflow-x-auto shrink-0 gap-0"
      style={{ background: '#0d0d0f', borderBottom: '1px solid #1e1e24', minHeight: 36 }}>
      {tabs.map(tab => {
        const isActive = tab.path === active
        const langColor = LANG_COLORS[tab.language] ?? '#71717a'
        return (
          <div key={tab.path} onClick={() => onActivate(tab.path)}
            className="flex items-center gap-1.5 px-3 py-2 cursor-pointer select-none shrink-0 whitespace-nowrap transition-colors group relative"
            style={{
              background: isActive ? '#1a1a1f' : 'transparent',
              borderRight: '1px solid #1e1e24',
              borderTop: isActive ? `2px solid ${langColor}` : '2px solid transparent',
              color: isActive ? '#e4e4e7' : '#71717a',
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#a1a1aa' }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#71717a' }}>
            {/* Language dot */}
            <span className="w-2 h-2 rounded-full shrink-0 opacity-70"
              style={{ background: langColor }} />
            <span className="text-xs">{tab.name}</span>
            {tab.modified && !isActive && (
              <span className="text-xs shrink-0" style={{ color: '#f59e0b' }}>●</span>
            )}
            <button
              onClick={e => onClose(tab.path, e)}
              className="w-4 h-4 flex items-center justify-center rounded shrink-0 transition-colors"
              style={{ color: 'transparent' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'transparent'}
              // Show on tab hover
              onFocus={() => {}}>
              {tab.modified
                ? <span className="text-xs" style={{ color: '#f59e0b' }}>●</span>
                : <X size={11} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
