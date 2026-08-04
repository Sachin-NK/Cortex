import { useState, useEffect } from 'react'
import { Key, Eye, EyeOff, Check, Trash2, ExternalLink, AlertTriangle, Shield, Save, Circle } from 'lucide-react'
import { keyStore, PROVIDER_DEFS } from '../api'
import type { StoredKey } from '../api'

const TIERS = [
  { id: 'standard',  label: 'Standard',  desc: 'All providers available. Best for general use.' },
  { id: 'sensitive', label: 'Sensitive', desc: 'Skips DeepSeek and Kimi. Use for proprietary code.' },
  { id: 'strict',    label: 'Strict',    desc: 'Anthropic only. Best for confidential data.' },
]

function ProviderCard({ def, stored, onSave, onDelete }: {
  def: typeof PROVIDER_DEFS[0]
  stored: StoredKey | null
  onSave: (id: string, key: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [enabled, setEnabled] = useState(stored?.enabled ?? true)

  useEffect(() => {
    setEnabled(stored?.enabled ?? true)
  }, [stored])

  const save = () => {
    const k = keyInput.trim()
    if (!k) return
    onSave(def.id, k)
    setKeyInput('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    keyStore.setEnabled(def.id, next)
  }

  const masked = stored?.key ? stored.key.slice(0, 8) + '•'.repeat(12) + stored.key.slice(-4) : ''
  const isSet = !!(stored?.key)

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#111114', border: '1px solid #1e1e24' }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ background: expanded ? '#1a1a1f' : 'transparent' }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '#1a1a1f' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
        <div className="w-2.5 h-8 rounded-full shrink-0" style={{ background: def.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{def.name}</span>
            {isSet ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style={{ background: enabled ? '#14532d' : '#1c1917', color: enabled ? '#4ade80' : '#78716c', border: `1px solid ${enabled ? '#166534' : '#292524'}` }}>
                <Circle size={5} className={enabled ? 'fill-green-400' : 'fill-stone-500'} />
                {enabled ? 'Active' : 'Disabled'}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: '#1c1917', color: '#78716c', border: '1px solid #292524' }}>
                Not configured
              </span>
            )}
          </div>
          {isSet && (
            <p className="text-xs mt-0.5 font-mono" style={{ color: '#52525b' }}>{masked}</p>
          )}
        </div>
        <span className="text-xs shrink-0" style={{ color: '#52525b' }}>
          {expanded ? 'collapse' : 'configure'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-4" style={{ borderTop: '1px solid #1e1e24' }}>
          {def.id === 'anthropic' && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <AlertTriangle size={13} style={{ color: '#f97316', marginTop: 1, flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#fed7aa' }}>
                Claude is the orchestrator. Limit its usage via Optimization settings rather than disabling it.
              </p>
            </div>
          )}

          {isSet && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#a1a1aa' }}>Enable this provider</span>
              <button onClick={toggleEnabled}
                className="relative inline-flex h-5 w-9 rounded-full transition-colors"
                style={{ background: enabled ? '#6366f1' : '#3f3f46' }}>
                <span className="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5"
                  style={{ transform: enabled ? 'translateX(16px)' : 'translateX(2px)' }} />
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs" style={{ color: '#71717a' }}>
                {isSet ? 'Replace API key' : 'API Key'}
              </label>
              <a href={def.docsUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs transition-colors"
                style={{ color: '#6366f1' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#818cf8'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#6366f1'}>
                Get key <ExternalLink size={10} />
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder={def.hint}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none"
                style={{ background: '#0d0d0f', border: '1px solid #2a2a35', color: '#e4e4e7' }}
                onFocus={e => (e.target as HTMLElement).style.borderColor = '#6366f1'}
                onBlur={e => (e.target as HTMLElement).style.borderColor = '#2a2a35'}
              />
              <button onClick={() => setShowKey(s => !s)}
                className="px-2.5 rounded-lg transition-colors"
                style={{ background: '#1a1a1f', border: '1px solid #2a2a35', color: '#71717a' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#71717a'}>
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button onClick={save} disabled={!keyInput.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: keyInput.trim() ? '#6366f1' : '#1a1a1f', color: keyInput.trim() ? '#fff' : '#52525b' }}
                onMouseEnter={e => { if (keyInput.trim()) (e.currentTarget as HTMLElement).style.background = '#4f46e5' }}
                onMouseLeave={e => { if (keyInput.trim()) (e.currentTarget as HTMLElement).style.background = '#6366f1' }}>
                {saved ? <Check size={14} style={{ color: '#4ade80' }} /> : <Save size={14} />}
                {saved ? 'Saved!' : 'Save'}
              </button>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: '#3f3f46' }}>
              Stored in your browser only. Never sent to our servers. Used as a request header per call.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {def.models.slice(0, 4).map(m => (
              <span key={m} className="px-2 py-0.5 rounded text-xs font-mono"
                style={{ background: '#1a1a1f', color: '#71717a', border: '1px solid #2a2a35' }}>
                {m.split('/').pop()}
              </span>
            ))}
          </div>

          {isSet && (
            <button onClick={() => { onDelete(def.id); setExpanded(false) }}
              className="flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded"
              style={{ color: '#ef4444' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              <Trash2 size={12} /> Remove key
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function KeysSettings() {
  const [keys, setKeys] = useState<Record<string, StoredKey | null>>({})
  const [tier, setTier] = useState(() => localStorage.getItem('cortex_privacy_tier') ?? 'standard')

  const reload = () => {
    const result: Record<string, StoredKey | null> = {}
    for (const p of PROVIDER_DEFS) result[p.id] = keyStore.get(p.id)
    setKeys(result)
  }

  useEffect(() => { reload() }, [])

  const handleSave = (id: string, key: string) => {
    keyStore.set(id, key)
    reload()
  }

  const handleDelete = (id: string) => {
    keyStore.remove(id)
    reload()
  }

  const handleTier = (t: string) => {
    setTier(t)
    localStorage.setItem('cortex_privacy_tier', t)
  }

  const configuredCount = PROVIDER_DEFS.filter(p => keys[p.id]?.key).length

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1.5">
          <Key size={20} style={{ color: '#6366f1' }} />
          <h2 className="text-2xl font-bold" style={{ color: '#e4e4e7' }}>API Keys</h2>
        </div>
        <p className="text-sm" style={{ color: '#71717a' }}>
          Your keys are stored in your browser only and sent directly to AI providers.
          They never touch our servers except as request headers.
        </p>
        {configuredCount === 0 && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <AlertTriangle size={14} style={{ color: '#818cf8', marginTop: 1, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: '#a5b4fc' }}>
              No keys configured yet. Add at least one to start using Cortex.
              OpenRouter gives access to 100+ models with a single key.
            </p>
          </div>
        )}
        {configuredCount > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: '#0d1f14', border: '1px solid #166534' }}>
            <Check size={13} style={{ color: '#4ade80' }} />
            <p className="text-xs" style={{ color: '#86efac' }}>
              {configuredCount} provider{configuredCount > 1 ? 's' : ''} configured. Cortex is ready.
            </p>
          </div>
        )}
      </div>

      {/* Privacy tier */}
      <div className="rounded-xl p-4 mb-6" style={{ background: '#111114', border: '1px solid #1e1e24' }}>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={14} style={{ color: '#6366f1' }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>Privacy Tier</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map(t => (
            <button key={t.id} onClick={() => handleTier(t.id)}
              className="px-3 py-2.5 rounded-lg text-left text-sm transition-colors"
              style={{
                background: tier === t.id ? 'rgba(99,102,241,0.15)' : '#0d0d0f',
                border: `1px solid ${tier === t.id ? '#6366f1' : '#2a2a35'}`,
                color: tier === t.id ? '#c7d2fe' : '#71717a',
              }}>
              <p className="font-medium text-xs">{t.label}</p>
              <p className="text-xs mt-0.5 opacity-70 leading-tight">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-2">
        {PROVIDER_DEFS.map(def => (
          <ProviderCard key={def.id} def={def} stored={keys[def.id] ?? null}
            onSave={handleSave} onDelete={handleDelete} />
        ))}
      </div>

      <div className="mt-6 px-4 py-3 rounded-xl text-xs leading-relaxed"
        style={{ background: '#0d0d0f', border: '1px solid #1e1e24', color: '#52525b' }}>
        Keys are saved using <code style={{ color: '#71717a' }}>localStorage</code> in your browser.
        They are sent as HTTP headers with each request so the backend can use them to call AI providers directly.
        Clearing your browser data will remove them.
      </div>
    </div>
  )
}
