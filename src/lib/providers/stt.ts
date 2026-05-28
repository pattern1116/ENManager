// ─────────────────────────────────────────────────────────────────
// STT (Speech-to-Text) Provider Abstraction Layer
//
// Switch with one .env line:
//   STT_PROVIDER=local | openai-api | mock
// ─────────────────────────────────────────────────────────────────

import type { STTProvider } from '@/types'

// ── Local Whisper (faster-whisper Python server) ───────────────────

class WhisperLocalProvider implements STTProvider {
  readonly name = 'whisper-local'
  private baseUrl: string
  private model: string

  constructor() {
    this.baseUrl = (process.env.STT_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')
    this.model = process.env.STT_MODEL ?? 'small'
  }

  async transcribe(audioBlob: Blob): Promise<string> {
    const form = new FormData()
    form.append('file', audioBlob, 'audio.webm')
    form.append('model', this.model)
    form.append('language', 'en')

    const res = await fetch(`${this.baseUrl}/transcribe`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error(`Whisper local error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return (data.text ?? data.transcript ?? '') as string
  }
}

// ── OpenAI Whisper API ────────────────────────────────────────────

class WhisperAPIProvider implements STTProvider {
  readonly name = 'whisper-api'
  private apiKey: string

  constructor() {
    this.apiKey = process.env.STT_API_KEY ?? process.env.LLM_API_KEY ?? ''
  }

  async transcribe(audioBlob: Blob): Promise<string> {
    const form = new FormData()
    form.append('file', audioBlob, 'audio.webm')
    form.append('model', 'whisper-1')
    form.append('language', 'en')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    })
    if (!res.ok) throw new Error(`OpenAI Whisper error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.text as string
  }
}

// ── Mock (dev / testing — no model needed) ────────────────────────

class MockSTTProvider implements STTProvider {
  readonly name = 'mock'

  private samples = [
    "I prefer working in the mornings because I focus better. For example, I finished that report in one hour.",
    "Actually, I think remote work is more productive. People save commute time and can design their own schedule.",
    "I didn't prepare enough notes, so I struggled to explain the concept clearly during the presentation.",
    "I enjoy in-person meetings for complex topics. However, video calls are much more efficient for quick check-ins.",
    "I'd say the biggest challenge is communication — keeping everyone aligned when teams are spread across time zones.",
    "The project failed because we underestimated the technical debt. As a result, the team spent three weeks just on fixes.",
  ]

  async transcribe(_audioBlob: Blob): Promise<string> {
    await new Promise(r => setTimeout(r, 800))  // simulate processing time
    return this.samples[Math.floor(Math.random() * this.samples.length)]
  }
}

// ── Factory ───────────────────────────────────────────────────────

export function createSTTProvider(): STTProvider {
  const provider = process.env.STT_PROVIDER ?? 'mock'

  switch (provider) {
    case 'local':
      return new WhisperLocalProvider()
    case 'openai-api':
      return new WhisperAPIProvider()
    case 'mock':
    default:
      return new MockSTTProvider()
  }
}

let _sttInstance: STTProvider | null = null
export function getSTTProvider(): STTProvider {
  if (!_sttInstance) _sttInstance = createSTTProvider()
  return _sttInstance
}
