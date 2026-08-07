// -- Key storage (localStorage only - keys never sent to server except as headers) --
const KEY_STORAGE_PREFIX = 'cortex_key_'

export const PROVIDER_DEFS = [
  { id: 'openai',     name: 'OpenAI',           header: 'X-OpenAI-Key',     models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3'],                              docsUrl: 'https://platform.openai.com/api-keys',          color: '#22c55e', hint: 'sk-proj-...' },
  { id: 'anthropic',  name: 'Anthropic (Claude)',header: 'X-Anthropic-Key',  models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],        docsUrl: 'https://console.anthropic.com/keys',            color: '#f97316', hint: 'sk-ant-...' },
  { id: 'gemini',     name: 'Google Gemini',     header: 'X-Gemini-Key',     models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],          docsUrl: 'https://aistudio.google.com/app/apikey',       color: '#3b82f6', hint: 'AIza...' },
  { id: 'deepseek',   name: 'DeepSeek',          header: 'X-Deepseek-Key',   models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],            docsUrl: 'https://platform.deepseek.com/api_keys',       color: '#a855f7', hint: 'sk-...' },
  { id: 'kimi',       name: 'Kimi (Moonshot)',   header: 'X-Kimi-Key',       models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],          docsUrl: 'https://platform.moonshot.cn/console/api-keys', color: '#06b6d4', hint: 'sk-...' },
  { id: 'openrouter', name: 'OpenRouter',        header: 'X-Openrouter-Key', models: ['openai/gpt-4o', 'anthropic/claude-opus-4-5', 'google/gemini-1.5-pro', 'deepseek/deepseek-chat', 'meta-llama/llama-3.1-70b-instruct'], docsUrl: 'https://openrouter.ai/keys', color: '#ec4899', hint: 'sk-or-v1-...' },
]

export interface StoredKey {
  key: string
  enabled: boolean
  addedAt: string
}

export const keyStore = {
  get(providerId: string): StoredKey | null {
    try {
      const raw = localStorage.getItem(KEY_STORAGE_PREFIX + providerId)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },
  set(providerId: string, key: string): void {
    const entry: StoredKey = { key, enabled: true, addedAt: new Date().toISOString() }
    localStorage.setItem(KEY_STORAGE_PREFIX + providerId, JSON.stringify(entry))
  },
  setEnabled(providerId: string, enabled: boolean): void {
    const entry = keyStore.get(providerId)
    if (entry) {
      entry.enabled = enabled
      localStorage.setItem(KEY_STORAGE_PREFIX + providerId, JSON.stringify(entry))
    }
  },
  remove(providerId: string): void {
    localStorage.removeItem(KEY_STORAGE_PREFIX + providerId)
  },
  getAll(): Record<string, StoredKey> {
    const result: Record<string, StoredKey> = {}
    for (const p of PROVIDER_DEFS) {
      const entry = keyStore.get(p.id)
      if (entry) result[p.id] = entry
    }
    return result
  },
  hasAny(): boolean {
    return PROVIDER_DEFS.some(p => {
      const e = keyStore.get(p.id)
      return e && e.key && e.enabled
    })
  },
}

// Build headers with all enabled user keys from localStorage
function buildKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const p of PROVIDER_DEFS) {
    const entry = keyStore.get(p.id)
    if (entry && entry.key && entry.enabled) {
      headers[p.header] = entry.key
    }
  }
  return headers
}

// -- Base URL ------------------------------------------------------------------
// Always /api - works both locally (Vite dev proxy) and on Vercel (rewrite rule).
// On Vercel, /api/* is rewritten to the backend service, stripping /api prefix.
const BASE = '/api'

// -- HTTP helpers (all include user key headers) --------------------------------
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...buildKeyHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildKeyHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { ...buildKeyHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// -- Types ---------------------------------------------------------------------

export type PolicyType =
  | 'balanced' | 'maximum_quality' | 'lowest_cost'
  | 'lowest_latency' | 'privacy_first' | 'energy_efficient'

export interface FileEntry { name: string; path: string; is_dir: boolean; size: number; children?: FileEntry[] }
export interface SearchResult { file: string; line: number; text: string }

export interface UserProviderConfig {
  enabled: boolean; api_key: string; default_model: string
  max_tokens_per_call: number; max_cost_per_day_usd: number; monthly_budget_usd: number
  allowed_task_types: string[]; blocked_task_types: string[]; notes: string
}
export interface UserProvider {
  id: string; name: string; models: string[]; docs_url: string
  env_key_name: string; has_env_key: boolean; has_user_key: boolean
  key_source: string; is_configured: boolean; is_active: boolean; health: string
  config: UserProviderConfig | null
}

export interface OptimizationConfig {
  orchestrator: string; orchestrator_role: string
  worker_roles: Record<string, string>; optimize_for: string
  budget_policy: { enabled: boolean; max_calls_per_workflow: number; max_input_tokens_per_call: number; allowed_tasks: string[] }
  available_providers: string[]
  provider_info: Record<string, { name: string; models: string[]; cost_per_1k_input: number; cost_per_1k_output: number; capabilities: { code: boolean; reasoning: boolean; vision: boolean; long_context: boolean } }>
}

export interface OptimizationReport {
  orchestrator: string; optimize_for: string
  orchestrator_usage: { calls: number; tokens: number; cost_usd: number; percentage_of_total: number }
  workers: Record<string, { input_tokens: number; output_tokens: number; cost_usd: number; calls: number; percentage: number }>
  delegation: { tasks_delegated_away_from_orchestrator: number; estimated_savings_usd: number; total_cost_usd: number; total_tokens: number }
}

export interface ChatResponse {
  session_id: string; trace_id: string; response: string
  classification: { task_type: string; complexity: string; requires_code: boolean; requires_vision: boolean }
  routing: { provider: string; model: string; reason: string; fallback_chain: string[] }
  usage: { input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number }
  validation: { output_valid: boolean; no_secrets: boolean }
  session_stats: { total_cost_usd: number; total_tokens: number; providers_used: string[]; message_count: number }
}

export interface Provider {
  id: string; name: string; models: string[]; status: string
  cost_per_1k_input: number; cost_per_1k_output: number; avg_latency_ms: number
  capabilities: { vision: boolean; code: boolean; reasoning: boolean; long_context: boolean; function_calling: boolean; max_context_tokens: number }
}

export interface Agent { id: string; name: string; description: string; tags: string[]; steps: number }

export interface RunStep { status: string; provider: string; model: string; tokens: number; cost_usd: number; error?: string; output?: string }

export interface RunStatus {
  run_id: string; workflow_id: string; status: string
  total_cost_usd: number; total_tokens: number; approval_queue: string[]
  steps: Record<string, RunStep>
}

export interface Dashboard {
  active_sessions: number; total_cost_usd: number; total_tokens: number; active_runs: number
  provider_health: Record<string, string>; available_agents: number; mcp_tools: number
  configured_providers: string[]
  privacy: { tier: string; description: string; blocked_providers: string[]; allowed_providers: string[] }
  claude_efficiency: { calls: number; total_tokens: number; percentage_of_total: number; estimated_savings_usd: number }
}

export interface Session { id: string; created_at: string; message_count: number; total_tokens: number; total_cost_usd: number; providers_used: string[] }

export interface TraceEvent { event_type: string; timestamp: string; agent: string; provider: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number; status: string; message: string }

export interface Trace { trace_id: string; workflow_id: string; user_request: string; started_at: string; completed_at: string | null; final_status: string; total_events: number; total_cost_usd: number; total_tokens: number; events: TraceEvent[] }

export interface CostReport {
  total_input_tokens: number; total_output_tokens: number; total_tokens: number; total_cost_usd: number
  by_provider: Record<string, { input_tokens: number; output_tokens: number; cost_usd: number; calls: number }>
  by_agent: Record<string, { tokens: number; cost_usd: number; calls: number }>
  claude_efficiency: { calls: number; input_tokens: number; output_tokens: number; total_tokens: number; percentage_of_total: number; tasks_delegated_away_from_claude: number; estimated_savings_usd: number }
}

export interface MCPTool { id: string; name: string; description: string }

export interface Policy { type: string; name: string; description: string; preferred_providers: string[] }

// -- API client ----------------------------------------------------------------
export const api = {
  chat: (body: { session_id?: string; message: string; policy: PolicyType; provider_override?: string; stream?: boolean }) =>
    post<ChatResponse>('/chat', body),

  providers: () => get<Provider[]>('/providers'),
  models: () => get<unknown[]>('/models'),
  policies: () => get<Policy[]>('/policies'),

  agents: (tag?: string) => get<Agent[]>(`/agents${tag ? `?tag=${tag}` : ''}`),
  runAgent: (agent_id: string, input: string, policy: PolicyType) =>
    post<{ run_id: string; trace_id: string; status: string; agent: string }>('/agents/run', { agent_id, input, policy }),
  runStatus: (run_id: string) => get<RunStatus>(`/agents/runs/${run_id}`),
  runOutput: (run_id: string) => get<{ final_output: string; step_outputs: Record<string, string> }>(`/agents/runs/${run_id}/output`),
  approveStep: (run_id: string, step_id: string) =>
    post<{ approved: boolean }>('/agents/runs/approve', { run_id, step_id }),

  mcpTools: () => get<MCPTool[]>('/mcp/tools'),
  invokeTool: (tool_id: string, args: Record<string, unknown>) =>
    post<{ tool_id: string; success: boolean; output: unknown; error?: string }>(`/mcp/invoke/${tool_id}`, args),

  sessions: () => get<Session[]>('/sessions'),
  deleteSession: (session_id: string) => del<{ deleted: boolean }>(`/sessions/${session_id}`),

  writeMemory: (body: { key: string; value: string; scope?: string; provenance?: string; is_assumption?: boolean; ttl_seconds?: number }) =>
    post<{ id: string; key: string; scope: string }>('/memory', body),
  readMemory: (scope: string) => get<unknown[]>(`/memory/${scope}`),

  traces: () => get<Trace[]>('/traces'),
  trace: (trace_id: string) => get<Trace>(`/traces/${trace_id}`),

  costs: (workflow_id?: string) => get<CostReport>(`/costs${workflow_id ? `?workflow_id=${workflow_id}` : ''}`),
  dashboard: () => get<Dashboard>('/dashboard'),

  listFiles: (path?: string, depth?: number) => get<FileEntry[]>(`/files?path=${path ?? ''}&depth=${depth ?? 4}`),
  readFile: (path: string) => get<{ path: string; content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) => post<{ path: string; size: number }>(`/files/write?path=${encodeURIComponent(path)}`, { content }),
  createFile: (path: string, is_dir = false) => post<any>(`/files/create?path=${encodeURIComponent(path)}`, { is_dir }),
  deleteFile: (path: string) => del<any>(`/files/delete?path=${encodeURIComponent(path)}`),
  renameFile: (path: string, new_name: string) => post<any>(`/files/rename?path=${encodeURIComponent(path)}`, { new_name }),
  searchFiles: (query: string, path?: string) => post<SearchResult[]>('/files/search', { query, path: path ?? '' }),
  workspace: () => get<{ workspace: string }>('/files/workspace'),

  codeAction: (body: { action: string; code?: string; language?: string; file_path?: string; file_context?: string; error_context?: string; user_message?: string; policy?: string }) =>
    post<{ result: string; provider: string; model: string; tokens: number; cost_usd: number; task_type: string }>('/ide/action', body),

  userProviders: () => get<UserProvider[]>('/user/providers'),
  saveUserProvider: (id: string, cfg: Partial<UserProviderConfig>) => post<any>(`/user/providers/${id}`, cfg),
  deleteUserProvider: (id: string) => del<any>(`/user/providers/${id}`),
  taskTypes: () => get<string[]>('/user/task-types'),

  setWorkspace: (path: string) => post<{ workspace: string; status: string }>('/workspace/set', { path }),
  listDrives: () => get<{ path: string; label: string }[]>('/workspace/drives'),
  browseDir: (path: string) => get<{ path: string; entries: FileEntry[] }>(`/workspace/browse?path=${encodeURIComponent(path)}`),

  getOptimizationConfig: () => get<OptimizationConfig>('/optimization/config'),
  saveOptimizationConfig: (cfg: Partial<OptimizationConfig>) => post<{ saved: boolean; orchestrator: string }>('/optimization/config', cfg),
  getOptimizationReport: () => get<OptimizationReport>('/optimization/report'),

  health: () => get<{ status: string; version: string; providers_configured: number }>('/health'),
}
