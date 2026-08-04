import { useEffect, useState } from 'react'
import { api } from '../api'
import type { MCPTool, Policy } from '../api'
import { Shield, Wrench, BookOpen, CheckCircle, AlertCircle, Info } from 'lucide-react'

const PRIVACY_TIERS = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'All 5 providers available. Best for non-sensitive tasks.',
    color: 'border-green-500/50 bg-green-500/5',
    badge: 'bg-green-500/20 text-green-400',
  },
  {
    value: 'sensitive',
    label: 'Sensitive',
    description: 'Blocks DeepSeek and Kimi (servers in China, less transparent data retention). Recommended for proprietary code and internal docs.',
    color: 'border-yellow-500/50 bg-yellow-500/5',
    badge: 'bg-yellow-500/20 text-yellow-400',
  },
  {
    value: 'strict',
    label: 'Strict',
    description: 'Anthropic only. Best documented API data policy, no training on inputs. Use for highly sensitive or regulated data.',
    color: 'border-red-500/50 bg-red-500/5',
    badge: 'bg-red-500/20 text-red-400',
  },
]

const PROVIDER_SETUP: { id: string; name: string; envKey: string; docsUrl: string }[] = [
  { id: 'openai',    name: 'OpenAI',          envKey: 'OPENAI_API_KEY',    docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic',       envKey: 'ANTHROPIC_API_KEY', docsUrl: 'https://console.anthropic.com/keys' },
  { id: 'gemini',    name: 'Google Gemini',   envKey: 'GEMINI_API_KEY',    docsUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'deepseek',  name: 'DeepSeek',        envKey: 'DEEPSEEK_API_KEY',  docsUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'kimi',      name: 'Kimi (Moonshot)', envKey: 'KIMI_API_KEY',      docsUrl: 'https://platform.moonshot.cn/console/api-keys' },
]

export default function Settings() {
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [privacyTier, setPrivacyTier] = useState<string>('standard')
  const [blockedProviders, setBlockedProviders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.mcpTools(),
      api.policies(),
      api.dashboard(),
    ]).then(([tools, pols, dash]) => {
      setMcpTools(tools)
      setPolicies(pols)
      setConfiguredProviders(dash.configured_providers ?? [])
      setPrivacyTier(dash.privacy?.tier ?? 'standard')
      setBlockedProviders(dash.privacy?.blocked_providers ?? [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-500">Loading settings…</div>

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* -- API Key Setup --------------------------------------- */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Provider API Keys
        </h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2 text-xs text-gray-500">
            <Info size={12} />
            Keys are set in your <code className="bg-gray-800 px-1 rounded">.env</code> file and loaded at startup. Restart the backend after changes.
          </div>
          <div className="divide-y divide-gray-800">
            {PROVIDER_SETUP.map(p => {
              const configured = configuredProviders.includes(p.id)
              const blocked = blockedProviders.includes(p.id)
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {blocked && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          blocked by privacy tier
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-gray-500">{p.envKey}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    {configured ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-400">
                        <CheckCircle size={13} /> configured
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <AlertCircle size={13} /> not set
                      </span>
                    )}
                    <a
                      href={p.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400"
                    >
                      Get key ↗
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* -- Privacy Tier ---------------------------------------- */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Privacy Tier
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          Set <code className="bg-gray-800 px-1 rounded">PRIVACY_TIER</code> in your <code className="bg-gray-800 px-1 rounded">.env</code> file to change this.
        </p>
        <div className="space-y-3">
          {PRIVACY_TIERS.map(tier => {
            const active = privacyTier === tier.value
            return (
              <div
                key={tier.value}
                className={`border rounded-xl p-4 transition-all ${active ? tier.color + ' border-opacity-100' : 'border-gray-800 bg-gray-900 opacity-60'}`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <Shield size={14} className={active ? 'text-current' : 'text-gray-600'} />
                  <span className="font-medium text-sm">{tier.label}</span>
                  {active && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tier.badge}`}>active</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 ml-5">{tier.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* -- Routing Policies ------------------------------------ */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Routing Policies
        </h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {policies.map(p => (
            <div key={p.type} className="px-5 py-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium">{p.name}</span>
                <code className="text-xs text-gray-600">{p.type}</code>
              </div>
              <p className="text-xs text-gray-500">{p.description}</p>
              {p.preferred_providers.length > 0 && (
                <div className="flex gap-1.5 mt-1.5">
                  {p.preferred_providers.map(pr => (
                    <span key={pr} className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">{pr}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* -- MCP Developer Tools --------------------------------- */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Wrench size={13} /> MCP Developer Tools
          <span className="ml-auto text-xs font-normal text-gray-600 normal-case tracking-normal">{mcpTools.length} tools registered</span>
        </h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {mcpTools.map(t => (
            <div key={t.id} className="px-5 py-3 flex items-start gap-3">
              <Wrench size={13} className="text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <code className="text-xs text-gray-600">{t.id}</code>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -- About ----------------------------------------------- */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BookOpen size={13} /> About
        </h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-400 space-y-1">
          <p><span className="text-gray-200 font-medium">Cortex</span> — Multi-Model AI Agent Harness</p>
          <p>Version <span className="text-gray-200">2.0.0</span></p>
          <p className="text-xs text-gray-600 pt-2">
            Routes every request to the best AI provider based on task type, cost, latency, and your chosen policy.
            Supports OpenAI, Anthropic, Google Gemini, DeepSeek, and Kimi (Moonshot).
          </p>
        </div>
      </section>
    </div>
  )
}
