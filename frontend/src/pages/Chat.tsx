import { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import type { PolicyType, ChatResponse } from '../api'
import { Send, Loader2, ChevronDown, Zap } from 'lucide-react'

const POLICIES: { value: PolicyType; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'maximum_quality', label: 'Maximum Quality' },
  { value: 'lowest_cost', label: 'Lowest Cost' },
  { value: 'lowest_latency', label: 'Lowest Latency' },
  { value: 'privacy_first', label: 'Privacy First' },
  { value: 'energy_efficient', label: 'Energy Efficient' },
]

interface Msg {
  role: 'user' | 'assistant'
  content: string
  meta?: ChatResponse
  streaming?: boolean
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [policy, setPolicy] = useState<PolicyType>('balanced')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [streamMode, setStreamMode] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendStreaming = async (userInput: string) => {
    // Add a placeholder assistant message we'll update chunk by chunk
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: userInput, policy, stream: true }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error(await res.text())
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let provider = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.chunk) {
              accumulated += parsed.chunk
              provider = parsed.provider || provider
              // Update the streaming message in place
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: accumulated,
                  streaming: true,
                }
                return updated
              })
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }

      // Finalize — mark streaming done, attach provider metadata
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: accumulated,
          streaming: false,
          meta: {
            session_id: sessionId || '',
            trace_id: '',
            response: accumulated,
            classification: { task_type: '', complexity: '', requires_code: false, requires_vision: false },
            routing: { provider, model: '', reason: 'streamed', fallback_chain: [] },
            usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 0 },
            validation: { output_valid: true, no_secrets: true },
            session_stats: { total_cost_usd: 0, total_tokens: 0, providers_used: [provider], message_count: 0 },
          } as ChatResponse,
        }
        return updated
      })
    } catch (e: any) {
      if (e.name === 'AbortError') return
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${e.message}` }
        return updated
      })
    }
  }

  const sendRegular = async (userInput: string) => {
    try {
      const res = await api.chat({ session_id: sessionId, message: userInput, policy })
      setSessionId(res.session_id)
      setMessages(prev => [...prev, { role: 'assistant', content: res.response, meta: res }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    }
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userInput = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: userInput }])
    setInput('')
    setLoading(true)
    try {
      if (streamMode) {
        await sendStreaming(userInput)
      } else {
        await sendRegular(userInput)
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <span className="text-sm text-gray-400">Policy:</span>
        <div className="relative">
          <select
            value={policy}
            onChange={e => setPolicy(e.target.value as PolicyType)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm appearance-none pr-7 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {POLICIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>

        {/* Stream toggle */}
        <button
          onClick={() => setStreamMode(s => !s)}
          title="Toggle streaming mode"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
            streamMode
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Zap size={12} />
          Stream
        </button>

        {sessionId && (
          <span className="ml-auto text-xs text-gray-600">
            session: {sessionId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-24">
            <p className="text-4xl mb-3">🤖</p>
            <p className="text-lg font-medium">Ask anything</p>
            <p className="text-sm mt-1">Cortex routes your request to the best model automatically</p>
            <p className="text-xs mt-2 text-gray-700">Toggle Stream for real-time token-by-token output</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-2xl ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              } rounded-2xl px-4 py-3 text-sm`}
            >
              <p className="whitespace-pre-wrap">
                {msg.content}
                {/* Blinking cursor while streaming */}
                {msg.streaming && (
                  <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </p>
              {msg.meta && !msg.streaming && (
                <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
                  <span>via {msg.meta.routing.provider}{msg.meta.routing.model ? ` / ${msg.meta.routing.model}` : ''}</span>
                  {msg.meta.usage.latency_ms > 0 && <span>{msg.meta.usage.latency_ms}ms</span>}
                  {msg.meta.usage.cost_usd > 0 && <span>${msg.meta.usage.cost_usd.toFixed(5)}</span>}
                  {msg.meta.usage.input_tokens > 0 && (
                    <span>{msg.meta.usage.input_tokens + msg.meta.usage.output_tokens} tokens</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && !streamMode && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Routing…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-800 bg-gray-900 shrink-0">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {loading && streamMode ? (
            <button
              onClick={stop}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl transition-colors"
              title="Stop generation"
            >
              <span className="w-3 h-3 block bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
