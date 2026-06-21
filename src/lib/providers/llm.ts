// ─────────────────────────────────────────────────────────────────
// LLM Provider Abstraction Layer
//
// Switch providers with one .env line:
//   LLM_PROVIDER=claude | openai | ollama | lmstudio | openai-compat
// ─────────────────────────────────────────────────────────────────

import type { LLMProvider, Message, CompletionOptions } from '@/types'

// ── Claude (Anthropic) ────────────────────────────────────────────

class ClaudeProvider implements LLMProvider {
  readonly name = 'claude'
  private apiKey: string
  private model: string

  constructor() {
    this.apiKey = process.env.LLM_API_KEY ?? ''
    this.model = process.env.LLM_MODEL ?? 'claude-3-5-haiku-20241022'
  }

  async complete(messages: Message[], system: string, opts?: CompletionOptions): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: messages.filter(m => m.role !== 'system'),
        ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.content[0].text as string
  }
}

// ── OpenAI ────────────────────────────────────────────────────────

class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  private apiKey: string
  private model: string

  constructor() {
    this.apiKey = process.env.LLM_API_KEY ?? ''
    this.model = process.env.LLM_MODEL ?? 'gpt-4o-mini'
  }

  async complete(messages: Message[], system: string, opts?: CompletionOptions): Promise<string> {
    const allMessages = [{ role: 'system' as const, content: system }, ...messages]
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        max_tokens: 1024,
        ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.choices[0].message.content as string
  }
}

// ── OpenAI-compatible (Ollama / LM Studio / vLLM) ─────────────────

class OpenAICompatProvider implements LLMProvider {
  readonly name: string
  private baseUrl: string
  private model: string
  private apiKey: string

  constructor(name: string) {
    this.name = name
    this.baseUrl = (process.env.LLM_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')
    this.model = process.env.LLM_MODEL ?? 'llama3.2'
    this.apiKey = process.env.LLM_API_KEY ?? 'ollama'  // Ollama accepts any non-empty string
  }

  async complete(messages: Message[], system: string, opts?: CompletionOptions): Promise<string> {
    const allMessages = [{ role: 'system' as const, content: system }, ...messages]
    // Ollama uses /api/chat, LM Studio + vLLM use OpenAI-compatible /v1/chat/completions
    const endpoint = this.name === 'ollama'
      ? `${this.baseUrl}/api/chat`
      : `${this.baseUrl}/v1/chat/completions`

    // Ollama nests sampling params under `options`; OpenAI-compat takes them top-level.
    const temperature = opts?.temperature
    const tempBody =
      temperature == null
        ? {}
        : this.name === 'ollama'
        ? { options: { temperature } }
        : { temperature }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages: allMessages, stream: false, ...tempBody }),
    })
    if (!res.ok) throw new Error(`${this.name} error: ${res.status} ${await res.text()}`)
    const data = await res.json()

    // Ollama wraps differently from OpenAI compat
    if (this.name === 'ollama') {
      return data.message?.content as string
    }
    return data.choices[0].message.content as string
  }
}

// ── Mock (dev / testing — no model needed) ────────────────────────

class MockLLMProvider implements LLMProvider {
  readonly name = 'mock'

  async complete(_messages: Message[], _system: string, _opts?: CompletionOptions): Promise<string> {
    // Returns a realistic-looking JSON feedback object for UI development
    await new Promise(r => setTimeout(r, 600))  // simulate latency

    return JSON.stringify({
      patternDetected: 'PRE',
      patternConfidence: 'medium',
      gapsFound: [
        {
          component: 'example',
          description: 'A concrete example would make your reason more convincing.',
        },
      ],
      rewrite:
        'I prefer working in the mornings because my focus is sharper then. For instance, I finished a full report in 90 minutes this morning — something that would take me twice as long in the afternoon.',
      explanation:
        'Your original had a clear point and reason (PRE pattern started well), but stopped before the example. Adding "For instance…" completes the PRE loop and makes the claim feel earned.',
      score: 62,
    })
  }
}

// ── Factory ───────────────────────────────────────────────────────

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? 'mock'

  switch (provider) {
    case 'claude':
      return new ClaudeProvider()
    case 'openai':
      return new OpenAIProvider()
    case 'ollama':
      return new OpenAICompatProvider('ollama')
    case 'lmstudio':
      return new OpenAICompatProvider('lmstudio')
    case 'openai-compat':
      return new OpenAICompatProvider('openai-compat')
    case 'mock':
    default:
      return new MockLLMProvider()
  }
}

// Singleton for server-side use (Next.js API routes)
let _llmInstance: LLMProvider | null = null
export function getLLMProvider(): LLMProvider {
  if (!_llmInstance) _llmInstance = createLLMProvider()
  return _llmInstance
}
