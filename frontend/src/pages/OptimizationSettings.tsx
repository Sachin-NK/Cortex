import { useEffect, useState } from 'react'
import { api } from '../api'
import type { OptimizationConfig } from '../api'
import {
  Target, Save, Loader2, Check, Info, ChevronDown, ChevronUp,
  Zap, DollarSign, Clock, BarChart3, Crown, Cpu,
} from 'lucide-react'

const OPTIMIZE_OPTIONS = [
  { id: 'cost',     label: 'Minimize Cost',    icon: DollarSign, desc: 'Route to cheapest model that can do the job' },
  { id: 'quality',  label: 'Maximum Quality',  icon: Crown,      desc: 'Always use the best capable model regardless of cost' },
  { id: 'latency',  label: 'Lowest Latency',   icon: Clock,      desc: 'Fastest response above all else' },
  { id: 'balanced', label: 'Balanced',         icon: BarChart3,  desc: 'Balance quality, cost, and speed' },
]

const TASK_TYPES = [
  'code_generation','debugging','refactoring','test_generation',
  'repository_analysis','long_context','documentation','research',
  'architecture_design','multimodal_analysis','structured_extraction',
  'security_review','final_verification','general',
]

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-500', anthropic: 'bg-orange-500', gemini: 'bg-blue-500',
  deepseek: 'bg-purple-500', kimi: 'bg-cyan-500', openrouter: 'bg-pink-500',
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-gray-700'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function OptimizationSettings() {
  const [cfg, setCfg] = useState<OptimizationConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(true)

  useEffect(() => {
    api.getOptimizationConfig()
      .then(setCfg)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const update = (patch: Partial<OptimizationConfig>) =>
    setCfg(c => c ? { ...c, ...patch } : c)

  const updateBudget = (patch: object) =>
    setCfg(c => c ? { ...c, budget_policy: { ...c.budget_policy, ...patch } } : c)

  const updateWorkerRole = (pid: string, tasks: string) =>
    setCfg(c => c ? { ...c, worker_roles: { ...c.worker_roles, [pid]: tasks } } : c)

  const toggleAllowedTask = (task: string) => {
    if (!cfg) return
    const current = cfg.budget_policy.allowed_tasks
    updateBudget({
      allowed_tasks: current.includes(task) ? current.filter(t => t !== task) : [...current, task]
    })
  }

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      await api.saveOptimizationConfig({
        orchestrator: cfg.orchestrator,
        orchestrator_role: cfg.orchestrator_role,
        worker_roles: cfg.worker_roles,
        optimize_for: cfg.optimize_for,
        budget_policy: cfg.budget_policy,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500 gap-2">
      <Loader2 size={18} className="animate-spin" /> Loading…
    </div>
  )
  if (!cfg) return <div className="p-8 text-gray-500">Failed to load config</div>

  const availableProviders = cfg.available_providers || []

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Target size={20} className="text-indigo-400" />
            <h2 className="text-2xl font-bold">Routing & Optimization</h2>
          </div>
          <p className="text-sm text-gray-500">
            Choose which LLM acts as the orchestrator, what each model handles, and what to optimize for.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} className="text-green-300" /> : <Save size={14} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Optimize for */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Optimization Goal
        </p>
        <div className="grid grid-cols-2 gap-3">
          {OPTIMIZE_OPTIONS.map(opt => {
            const Icon = opt.icon
            const active = cfg.optimize_for === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => update({ optimize_for: opt.id })}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-indigo-600/20 border-indigo-600 text-indigo-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                }`}
              >
                <Icon size={18} className={active ? 'text-indigo-400 mt-0.5 shrink-0' : 'mt-0.5 shrink-0'} />
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{opt.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Orchestrator selection */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Crown size={15} className="text-yellow-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Orchestrator (Master LLM)</p>
        </div>
        <p className="text-xs text-gray-600 mb-4">
          The orchestrator handles architecture decisions, conflict resolution, and final approval. It should be your most capable model. All other requests are delegated away from it.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {availableProviders.map(pid => {
            const info = cfg.provider_info?.[pid]
            const active = cfg.orchestrator === pid
            const bar = PROVIDER_COLORS[pid] ?? 'bg-gray-600'
            return (
              <button
                key={pid}
                onClick={() => update({ orchestrator: pid })}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-indigo-600/20 border-indigo-600'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className={`w-2 h-6 rounded-full ${bar} shrink-0`} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${active ? 'text-indigo-300' : 'text-gray-300'}`}>
                    {info?.name ?? pid}
                  </p>
                  <p className="text-xs text-gray-600">${info?.cost_per_1k_output.toFixed(4)}/1K out</p>
                </div>
                {active && <Crown size={10} className="text-yellow-400 ml-auto shrink-0" />}
              </button>
            )
          })}
          {availableProviders.length === 0 && (
            <p className="col-span-3 text-xs text-gray-600 py-2">No providers active. Add API keys first.</p>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Orchestrator Role Description</label>
          <input
            value={cfg.orchestrator_role}
            onChange={e => update({ orchestrator_role: e.target.value })}
            placeholder="e.g. Architecture approval, conflict resolution, final quality gate"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </section>

      {/* Worker roles */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Cpu size={15} className="text-blue-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Worker Roles</p>
        </div>
        <p className="text-xs text-gray-600 mb-4">
          Assign task types to each provider. The router uses these as the primary routing signal. Comma-separated task types.
        </p>
        <div className="space-y-3">
          {availableProviders.filter(pid => pid !== cfg.orchestrator).map(pid => {
            const info = cfg.provider_info?.[pid]
            const bar = PROVIDER_COLORS[pid] ?? 'bg-gray-600'
            return (
              <div key={pid} className="flex items-start gap-3">
                <div className={`w-2 h-5 rounded-full ${bar} mt-2.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-gray-300 mb-1 block">{info?.name ?? pid}</label>
                  <input
                    value={cfg.worker_roles?.[pid] ?? ''}
                    onChange={e => updateWorkerRole(pid, e.target.value)}
                    placeholder="code_generation, debugging, refactoring…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 p-3 bg-gray-800/60 rounded-lg">
          <p className="text-xs text-gray-500 font-medium mb-1">Available task types:</p>
          <p className="text-xs text-gray-600 font-mono leading-relaxed">{TASK_TYPES.join(', ')}</p>
        </div>
      </section>

      {/* Budget policy for orchestrator */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-5">
        <button
          onClick={() => setBudgetOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-yellow-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Orchestrator Budget Policy
            </p>
          </div>
          {budgetOpen ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </button>

        {budgetOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Enable budget enforcement</p>
                <p className="text-xs text-gray-600">Limit how often the orchestrator is called per workflow</p>
              </div>
              <Toggle
                value={cfg.budget_policy.enabled}
                onChange={v => updateBudget({ enabled: v })}
              />
            </div>

            {cfg.budget_policy.enabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Max calls per workflow</label>
                    <input
                      type="number" min="1" max="20"
                      value={cfg.budget_policy.max_calls_per_workflow}
                      onChange={e => updateBudget({ max_calls_per_workflow: parseInt(e.target.value) || 1 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Max input tokens per call</label>
                    <input
                      type="number" min="1000" step="1000"
                      value={cfg.budget_policy.max_input_tokens_per_call}
                      onChange={e => updateBudget({ max_input_tokens_per_call: parseInt(e.target.value) || 4000 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    Allowed task types for orchestrator <span className="text-gray-600">(uncheck to force delegation)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                    {TASK_TYPES.map(tt => (
                      <label key={tt} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={cfg.budget_policy.allowed_tasks.includes(tt)}
                          onChange={() => toggleAllowedTask(tt)}
                          className="rounded bg-gray-800 border-gray-700 text-indigo-500"
                        />
                        {tt}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Info box */}
      <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300 leading-relaxed">
          Changes take effect immediately. The router will start using the new orchestrator and worker assignments for all new requests. Existing in-flight workflows are not affected.
        </p>
      </div>
    </div>
  )
}
