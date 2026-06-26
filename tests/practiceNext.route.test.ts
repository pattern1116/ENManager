import { describe, it, expect, beforeAll, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

// Isolate the DB before anything imports it.
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-next-')), 'test.db')

// Mock the LLM provider so we can drive both the follow-up and fallback paths.
let fakeName = 'test'
let fakeComplete: () => Promise<string> = async () => '{}'
vi.mock('@/lib/providers/llm', () => ({
  getLLMProvider: () => ({
    get name() { return fakeName },
    complete: () => fakeComplete(),
  }),
}))

// The route resolves the user from the auth cookie (next/headers), absent in a
// bare unit-test request — stand in with a fixed id.
vi.mock('@/lib/currentUser', () => ({ currentUserId: () => '1234' }))

import { POST } from '@/app/api/practice/next/route'
import { resetDB } from '@/lib/db'

const PATTERNS = ['PRE', 'SID', 'CE', 'CC', 'HO']

function post(body: unknown) {
  const req = new Request('http://localhost/api/practice/next', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req as any)
}

beforeAll(() => resetDB())

describe('POST /api/practice/next', () => {
  it('generates an LLM follow-up using the chosen pattern', async () => {
    fakeName = 'test'
    fakeComplete = async () =>
      JSON.stringify({ topic: 'What would change your mind about that?', pattern: 'HO' })

    const res = await post({ lastUtterance: 'I think remote work is better.', lastTopic: 'Remote work' })
    const data = await res.json()

    expect(data.source).toBe('followup')
    expect(data.prompt.topic).toBe('What would change your mind about that?')
    expect(data.prompt.targetPattern).toBe('HO')
    expect(typeof data.prompt.timerSeconds).toBe('number')
    expect(data.prompt.hint).toBeTruthy()
  })

  it('tolerates JSON wrapped in prose / code fences', async () => {
    fakeName = 'test'
    fakeComplete = async () =>
      'Sure! ```json\n{"topic": "Why does that matter to you?", "pattern": "CE"}\n``` hope that helps'

    const res = await post({ lastUtterance: 'Sleep affects my focus.' })
    const data = await res.json()
    expect(data.source).toBe('followup')
    expect(data.prompt.targetPattern).toBe('CE')
  })

  it('falls back to a seed when there is no utterance to follow up on', async () => {
    fakeName = 'test'
    const res = await post({})
    const data = await res.json()
    expect(data.source).toBe('seed')
    expect(PATTERNS).toContain(data.prompt.targetPattern)
    expect(data.prompt.hint).toBeTruthy()
  })

  it('falls back to a seed when the LLM is the mock provider', async () => {
    fakeName = 'mock'
    const res = await post({ lastUtterance: 'Something I just said.' })
    const data = await res.json()
    expect(data.source).toBe('seed')
    expect(PATTERNS).toContain(data.prompt.targetPattern)
  })

  it('falls back to a seed when the LLM output is unparseable', async () => {
    fakeName = 'test'
    fakeComplete = async () => 'sorry, I cannot do that'

    const res = await post({ lastUtterance: 'Anything.' })
    const data = await res.json()
    expect(data.source).toBe('seed')
    expect(PATTERNS).toContain(data.prompt.targetPattern)
  })

  it('falls back to a seed when the LLM picks an invalid pattern', async () => {
    fakeName = 'test'
    fakeComplete = async () => JSON.stringify({ topic: 'Tell me more.', pattern: 'XYZ' })

    const res = await post({ lastUtterance: 'Anything.' })
    const data = await res.json()
    expect(data.source).toBe('seed')
  })

  describe('mode: simplify', () => {
    it('rewrites the topic concretely, keeping the same pattern', async () => {
      fakeName = 'test'
      fakeComplete = async () =>
        JSON.stringify({ topic: 'Do you feel your choices are truly your own? Why?' })

      const res = await post({
        mode: 'simplify',
        topic: 'Your view on whether free will survives neuroscience',
        pattern: 'SID',
      })
      const data = await res.json()
      expect(data.source).toBe('simplify')
      expect(data.prompt.topic).toBe('Do you feel your choices are truly your own? Why?')
      expect(data.prompt.targetPattern).toBe('SID') // pattern preserved
      expect(data.prompt.hint).toBeTruthy()
    })

    it('falls back to a seed when there is no topic to simplify', async () => {
      fakeName = 'test'
      const res = await post({ mode: 'simplify', pattern: 'SID' })
      const data = await res.json()
      expect(data.source).toBe('seed')
    })

    it('keeps the original prompt (never seeds a new one) when the LLM is the mock provider', async () => {
      // Simplify must never swap the question out: with the mock provider we
      // can't rewrite, so we hand back the SAME topic/pattern rather than
      // seeding a brand-new prompt.
      fakeName = 'mock'
      const res = await post({ mode: 'simplify', topic: 'Something abstract', pattern: 'CC' })
      const data = await res.json()
      expect(data.source).toBe('simplify')
      expect(data.prompt.topic).toBe('Something abstract')
      expect(data.prompt.targetPattern).toBe('CC')
    })
  })
})
