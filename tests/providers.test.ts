import { describe, it, expect, afterEach } from 'vitest'
import { createLLMProvider } from '@/lib/providers/llm'
import { createSTTProvider } from '@/lib/providers/stt'
import { buildFeedback } from '@/lib/feedback'
import type { UtteranceFeedback } from '@/types'

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
})

describe('createLLMProvider — factory selection', () => {
  const cases: [string, string][] = [
    ['claude', 'claude'],
    ['openai', 'openai'],
    ['ollama', 'ollama'],
    ['lmstudio', 'lmstudio'],
    ['openai-compat', 'openai-compat'],
    ['mock', 'mock'],
  ]
  for (const [env, name] of cases) {
    it(`maps LLM_PROVIDER=${env} → ${name}`, () => {
      process.env.LLM_PROVIDER = env
      expect(createLLMProvider().name).toBe(name)
    })
  }

  it('defaults to mock when unset', () => {
    delete process.env.LLM_PROVIDER
    expect(createLLMProvider().name).toBe('mock')
  })
})

describe('createSTTProvider — factory selection', () => {
  const cases: [string, string][] = [
    ['local', 'whisper-local'],
    ['openai-api', 'whisper-api'],
    ['mock', 'mock'],
  ]
  for (const [env, name] of cases) {
    it(`maps STT_PROVIDER=${env} → ${name}`, () => {
      process.env.STT_PROVIDER = env
      expect(createSTTProvider().name).toBe(name)
    })
  }

  it('defaults to mock when unset', () => {
    delete process.env.STT_PROVIDER
    expect(createSTTProvider().name).toBe('mock')
  })
})

describe('mock providers produce usable output', () => {
  it('mock LLM returns JSON that buildFeedback accepts', async () => {
    process.env.LLM_PROVIDER = 'mock'
    const raw = await createLLMProvider().complete([{ role: 'user', content: 'hi' }], 'sys')
    // A throwaway fallback distinct from the mock output, to prove parsing succeeded.
    const fallback: UtteranceFeedback = {
      patternDetected: 'UNKNOWN',
      patternConfidence: 'low',
      gapsFound: [],
      rewrite: 'FALLBACK',
      explanation: 'FALLBACK',
      score: 0,
    }
    const fb = buildFeedback(raw, fallback)
    expect(fb.rewrite).not.toBe('FALLBACK')
    expect(['PRE', 'SID', 'CE', 'CC', 'HO', 'UNKNOWN']).toContain(fb.patternDetected)
    expect(fb.score).toBeGreaterThanOrEqual(0)
    expect(fb.score).toBeLessThanOrEqual(100)
  })

  it('mock STT returns a non-empty transcript', async () => {
    process.env.STT_PROVIDER = 'mock'
    const transcript = await createSTTProvider().transcribe(new Blob(['x']))
    expect(typeof transcript).toBe('string')
    expect(transcript.length).toBeGreaterThan(0)
  })
})
