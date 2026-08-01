import { FolderOpen, Search, GitBranch, Bot, AlertCircle } from 'lucide-react'

const PANELS = [
  { id: 'files',    icon: FolderOpen,    title: 'Explorer'  },
  { id: 'search',   icon: Search,        title: 'Search'    },
  { id: 'git',      icon: GitBranch,     title: 'Source Control' },
  { id: 'agents',   icon: Bot,           title: 'Agents'    },
  { id: 'problems', icon: AlertCircle,   title: 'Problems'  },
]

interface Props { active: string; onChange: (id: string) => void; problemCount?: number }

export default function ActivityBar({ active, onChange, problemCount = 0 }: Props) {
  return (
    <div className="flex flex-col items-center py-2 gap-0.5 select-none"
      style={{ width: 44, background: '#0d0d0f', borderRight: '1px solid #1e1e24' }}>
      {PANELS.map(({ id, icon: Icon, title }) => (
        <button
          key={id}
          title={title}
          onClick={() => onChange(active === id ? '' : id)}
          className="relative flex items-center justify-center rounded w-9 h-9 transition-colors"
          style={{
            color: active === id ? '#e4e4e7' : '#52525b',
            background: active === id ? '#1e1e2e' : 'transparent',
          }}
          onMouseEnter={e => { if (active !== id) (e.currentTarget as HTMLElement).style.color = '#a1a1aa' }}
          onMouseLeave={e => { if (active !== id) (e.currentTarget as HTMLElement).style.color = '#52525b' }}
        >
          {active === id && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r" style={{ background: '#6366f1' }} />
          )}
          <Icon size={18} />
          {id === 'problems' && problemCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 rounded-full text-[9px] flex items-center justify-center font-bold"
              style={{ background: '#ef4444', color: '#fff' }}>
              {problemCount > 99 ? '99+' : problemCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
