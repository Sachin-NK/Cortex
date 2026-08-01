import { useEffect, useState } from 'react'
import { api } from '../api'
import type { UserProvider, UserProviderConfig } from '../api'
import {
  Key, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink,
  Save, Trash2, Loader2, Check, AlertTriangle, Circle,
} from 'lucide-react'

// ── Privacy tier selector ────────────────────────────────────────────────────
const TIERS = [
  { id: 'standard',  label: 'Standard',  desc: 'All providers enabled. Best quality and lowest cost.' },
  { id: 'sensitive', label: 'Sensitive', desc: 'Only GDPR-compliant providers. No OpenAI.' },
  { id: 'strict',    label: 'Strict',    desc: 'Local/on-premise providers only. Maximum privacy.' },
]

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-500',
  anthropic: 'bg-orange-500',
  gemini: 'bg-blue-500',
  deepseek: 'bg-purple-500',
  kimi: 'bg-cyan-500',
  openrouter: 'bg-pink-500',
}

function HealthDot({ status }: { status: string }) {
  const color = status === 'healthy' ? 'text-green-400 fill-green-400'
    : status === 'degraded' ? 'text-yellow-400 fill-yellow-400'
    : 'text-gray-600 fill-gray-600'
  return <Circle size={8} className={color} />
}

function StatusBadge({ provider }: { provider: UserProvider }) {
  if (provider.is_active) return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">Active</span>
  )
  if (provider.is_configured) return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Configured</span>
  )
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-500 border border-gray-700">Not configured</span>
  )
}

// ── Per-provider card ────────────────────────────────────────────────────────
function ProviderCard({
  provider, taskTypesList, onSaved, onDeleted,
}: {
  provider: UserProvider
  taskTypesList: string[]
  onSaved: () => void
  onDeleted: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)

  const blank: UserProviderConfig = {
    enabled: true, api_key: '', default_model: provider.models[0] ?? '',
    max_tokens_per_call: 0, max_cost_per_day_usd: 0, monthly_budget_usd: 0,
    allowed_task_types: [], blocked_task_types: [], notes: '',
  }
  const [cfg, setCfg] = useState<UserProviderConfig>(provider.config ?? blank)

  // Sync when provider changes from parent reload
  useEffect(() => { setCfg(provider.config ?? blank) }, [provider.id])

  const update = (patch: Partial<UserProviderConfig>) => setCfg(c => ({ ...c, ...patch }))

  const toggleTaskType = (list: 'allowed_task_types' | 'blocked_task_types', tt: string) => {
    setCfg(c => {
      const current = c[list]
      return { ...c, [list]: current.includes(tt) ? current.filter(x => x !== tt) : [...current, tt] }
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.saveUserProvider(provider.id, cfg)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  const deleteConfig = async () => {
    if (!confirm(`Delete user config for ${provider.name}?`)) return
    setDeleting(true)
    try { await api.deleteUserProvider(provider.id); onDeleted() }
    catch (e: any) { alert(e.message) }
    finally { setDeleting(false) }
  }

  const colorBar = PROVIDER_COLORS[provider.id] ?? 'bg-gray-600'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Clickable header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className={`w-2.5 h-8 rounded-full ${colorBar} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{provider.name}</span>
            <StatusBadge provider={provider} />
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <HealthDot status={provider.health} /> {provider.health}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {provider.key_source === 'env' ? 'Key from .env' : provider.key_source === 'user' ? 'User-supplied key' : 'No key set'}
            {' · '}{provider.models.length} models
          </p>
        </div>
        {expanded ? <ChevronUp size={15} className="text-gray-500 shrink-0" /> : <ChevronDown size={15} className="text-gray-500 shrink-0" />}
      </button>

      {/* Anthropic warning */}
      {provider.id === 'anthropic' && expanded && (
        <div className="mx-4 mb-3 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-2">
          <AlertTriangle size={14} className="text-orange-400 mt-0.5 shrink-0" />
          <p className="text-xs text-orange-300">
            Claude is the orchestrator. Limit its usage via the Claude Budget in routing settings, not by disabling it entirely.
          </p>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Enabled</label>
            <button
              onClick={() => update({ enabled: !cfg.enabled })}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${cfg.enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${cfg.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">API Key</label>
              {provider.docs_url && (
                <a href={provider.docs_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  Get key <ExternalLink size={10} />
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={cfg.api_key}
                onChange={e => update({ api_key: e.target.value })}
                placeholder={provider.has_env_key ? '(using .env key)' : provider.has_user_key ? '(user key set)' : 'sk-…'}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <button onClick={() => setShowKey(s => !s)} className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700">
                {showKey ? <EyeOff size={15} className="text-gray-400" /> : <Eye size={15} className="text-gray-400" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-600">Source: {provider.env_key_name} · {provider.key_source}</p>
          </div>

          {/* Default model */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Default Model</label>
            <select
              value={cfg.default_model}
              onChange={e => update({ default_model: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Usage limits */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Usage Limits</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: 'max_tokens_per_call' as const, label: 'Max tokens/call', hint: '0 = unlimited' },
                { key: 'max_cost_per_day_usd' as const, label: 'Max cost/day ($)', hint: '0 = unlimited' },
                { key: 'monthly_budget_usd' as const, label: 'Monthly budget ($)', hint: '0 = unlimited' },
              ] as const).map(({ key, label, hint }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    type="number" min="0" step={key === 'max_tokens_per_call' ? '1000' : '0.01'}
                    value={cfg[key]}
                    onChange={e => update({ [key]: parseFloat(e.target.value) || 0 } as any)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-700 mt-0.5">{hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Task routing */}
          {taskTypesList.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {([
                { key: 'allowed_task_types' as const, label: 'Allowed task types', hint: 'empty = all allowed' },
                { key: 'blocked_task_types' as const, label: 'Blocked task types', hint: 'explicitly blocked' },
              ] as const).map(({ key, label, hint }) => (
                <div key={key}>
                  <p className="text-xs font-medium text-gray-400 mb-1">{label} <span className="text-gray-600">({hint})</span></p>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
                    {taskTypesList.map(tt => (
                      <label key={tt} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cfg[key].includes(tt)}
                          onChange={() => toggleTaskType(key, tt)}
                          className="rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500"
                        />
                        {tt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notes</label>
            <textarea
              value={cfg.notes}
              onChange={e => update({ notes: e.target.value })}
              rows={2}
              placeholder="Optional notes about this provider config…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} className="text-green-300" /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save'}
            </button>
            {provider.config && (
              <button
                onClick={deleteConfig}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-900/40 hover:bg-red-900/70 border border-red-800/50 rounded-lg text-sm text-red-400 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete config
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function KeysSettings() {
  const [providers, setProviders] = useState<UserProvider[]>([])
  const [taskTypes, setTaskTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState('standard')

  const load = async () => {
    setLoading(true)
    try {
      const [p, tt] = await Promise.all([api.userProviders(), api.taskTypes()])
      setProviders(p)
      setTaskTypes(tt)
    } catch (e: any) {
      console.error('Failed to load providers:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Key size={20} className="text-indigo-400" />
          <h2 className="text-2xl font-bold">API Keys &amp; Providers</h2>
        </div>
        <p className="text-sm text-gray-500">Configure your AI provider keys and usage limits</p>
      </div>

      {/* Privacy tier */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Privacy Tier</p>
        <div className="grid grid-cols-3 gap-3">
          {TIERS.map(t => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className={`px-3 py-2.5 rounded-lg text-sm text-left transition-colors border ${
                tier === t.id
                  ? 'bg-indigo-600/20 border-indigo-600 text-indigo-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <p className="font-medium">{t.label}</p>
              <p className="text-xs mt-0.5 opacity-70">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Provider cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span>Loading providers…</span>
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center text-gray-600 py-8">
          <p>No providers found. Ensure the backend is running.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              taskTypesList={taskTypes}
              onSaved={load}
              onDeleted={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
