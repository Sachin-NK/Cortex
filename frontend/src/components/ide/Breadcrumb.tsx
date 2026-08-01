import { ChevronRight } from 'lucide-react'

interface Props { path: string; language: string }

export default function Breadcrumb({ path, language }: Props) {
  if (!path) return null
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)

  return (
    <div className="flex items-center px-3 py-1 text-xs shrink-0 overflow-x-auto"
      style={{ background: '#111114', borderBottom: '1px solid #1e1e24', color: '#52525b', minHeight: 26 }}>
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1 shrink-0">
          {i > 0 && <ChevronRight size={10} style={{ opacity: 0.4 }} />}
          <span style={{ color: i === parts.length - 1 ? '#a1a1aa' : '#52525b' }}>{part}</span>
        </span>
      ))}
      {language && (
        <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: '#1e1e24', color: '#6366f1' }}>
          {language}
        </span>
      )}
    </div>
  )
}
