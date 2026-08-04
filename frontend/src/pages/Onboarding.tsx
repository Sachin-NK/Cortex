import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, Eye, EyeOff, Check, ExternalLink, ArrowRight, Sparkles, Code2, Bot, Terminal } from 'lucide-react'
import { keyStore, PROVIDER_DEFS } from '../api'

const QUICK_PROVIDERS = ['openrouter', 'openai', 'gemini', 'deepseek', 'anthropic', 'kimi']

export default function Onboarding() {
  const navigate = useNavigate()
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)

  const handleKey = (id: string, val: string) => setKeys(k => ({ ...k, [id]: val }))
  const toggleShow = (id: string) => setShow(s => ({ ...s, [id]: !s[id] }))

  const filledCount = Object.values(keys).filter(v => v.trim()).length

  const saveAndContinue = () => {
    let count = 0
    for (const [id, key] of Object.entries(keys)) {
      if (key.trim()) { keyStore.set(id, key.trim()); count++ }
    }
    if (count > 0) { setSaved(true); setTimeout(() => navigate('/ide'), 800) }
    else navigate('/ide')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: '#0d0d0f', color: '#e4e4e7' }}>

      {/* Hero */}
      <div className="text-center mb-10 max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 rounded-2xl" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <Sparkles size={28} style={{ color: '#818cf8' }} />
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-3" style={{ color: '#f4f4f5' }}>Welcome to Cortex IDE</h1>
        <p className="text-base leading-relaxed" style={{ color: '#71717a' }}>
          A multi-model AI coding IDE that routes every task to the right model automatically.
          Add your API keys to get started — they stay in your browser, never on our servers.
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2 justify-center mb-10">
        {[
          { icon: Code2,    label: 'Monaco Editor' },
          { icon: Bot,      label: 'Multi-Model AI' },
          { icon: Terminal, label: 'Integrated Terminal' },
          { icon: Sparkles, label: 'Smart Routing' },
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
            style={{ background: '#111114', border: '1px solid #1e1e24', color: '#a1a1aa' }}>
            <Icon size={13} style={{ color: '#6366f1' }} /> {label}
          </span>
        ))}
      </div>

      {/* Key entry */}
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#111114', border: '1px solid #1e1e24' }}>

        <div className="px-6 py-4" style={{ borderBottom: '1px solid #1e1e24' }}>
          <div className="flex items-center gap-2">
            <Key size={16} style={{ color: '#6366f1' }} />
            <span className="font-semibold">Add your API keys</span>
          </div>
          <p className="text-xs mt-1" style={{ color: '#52525b' }}>
            Add at least one. OpenRouter gives 100+ models with a single key.
          </p>
        </div>

        <div className="px-6 py-4 space-y-3">
          {QUICK_PROVIDERS.map(id => {
            const def = PROVIDER_DEFS.find(p => p.id === id)!
            const val = keys[id] ?? ''
            const isSet = val.trim().length > 0
            return (
              <div key={id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: def.color }} />
                    <span className="text-xs font-medium" style={{ color: '#a1a1aa' }}>{def.name}</span>
                  </div>
                  <a href={def.docsUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-0.5 text-xs transition-colors"
                    style={{ color: '#52525b' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#6366f1'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
                    Get key <ExternalLink size={9} />
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={show[id] ? 'text' : 'password'}
                    value={val}
                    onChange={e => handleKey(id, e.target.value)}
                    placeholder={def.hint}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-mono outline-none"
                    style={{ background: '#0d0d0f', border: `1px solid ${isSet ? def.color + '60' : '#2a2a35'}`, color: '#e4e4e7' }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = def.color + '80'}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = isSet ? def.color + '60' : '#2a2a35'}
                  />
                  <button onClick={() => toggleShow(id)}
                    className="px-2 rounded-lg" style={{ background: '#1a1a1f', border: '1px solid #2a2a35', color: '#71717a' }}>
                    {show[id] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {isSet && <div className="flex items-center px-2"><Check size={14} style={{ color: '#4ade80' }} /></div>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button onClick={saveAndContinue}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: filledCount > 0 ? '#6366f1' : '#1a1a1f',
              color: filledCount > 0 ? '#fff' : '#52525b',
              border: `1px solid ${filledCount > 0 ? '#6366f1' : '#2a2a35'}`,
            }}
            onMouseEnter={e => { if (filledCount > 0) (e.currentTarget as HTMLElement).style.background = '#4f46e5' }}
            onMouseLeave={e => { if (filledCount > 0) (e.currentTarget as HTMLElement).style.background = '#6366f1' }}>
            {saved
              ? <><Check size={16} /> Saved! Opening IDE…</>
              : filledCount > 0
                ? <><ArrowRight size={16} /> Save {filledCount} key{filledCount > 1 ? 's' : ''} and open IDE</>
                : <><ArrowRight size={16} /> Skip for now — open IDE</>}
          </button>
          <p className="text-center text-xs mt-3" style={{ color: '#3f3f46' }}>
            Keys are stored in your browser only. You can add or change them anytime in Settings.
          </p>
        </div>
      </div>

      {/* Security note */}
      <div className="mt-6 max-w-md text-center">
        <p className="text-xs leading-relaxed" style={{ color: '#3f3f46' }}>
          Keys are saved to <code>localStorage</code> and sent as HTTP headers directly to AI providers.
          No key ever touches Cortex servers in storage — only in transit for your requests.
        </p>
      </div>
    </div>
  )
}
