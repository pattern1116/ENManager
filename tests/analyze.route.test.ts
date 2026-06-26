import { describe, it, expect, beforeAll, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

// Isolate the DB to a throwaway file and force the mock LLM (which returns a
// PRE-pattern JSON) BEFORE importing the route, since both read env lazily.
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-route-')), 'test.db')
process.env.LLM_PROVIDER = 'mock'

// Stand in for the authenticated user — the route reads it from the cookie via
// next/headers, which isn't available in a bare unit-test request.
vi.mock('@/lib/currentUser', () => ({ currentUserId: () => '1234' }))

import { POST } from '@/app/api/analyze/route'
import { resetDB } from '@/lib/db'

// The route types its arg as NextRequest but only calls req.json(); a plain
// Request satisfies that at runtime.
function post(body: unknown) {
  const req = new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req as any)
}

beforeAll(() => {
  resetDB()
})

describe('POST /api/analyze — practice result loop', () => {
  it('reports a hit when the spoken pattern matches the target (mock → PRE)', async () => {
    const res = await post({ text: 'I prefer mornings because I focus.', targetPattern: 'PRE' })
    const data = await res.json()
    expect(data.feedback.patternDetected).toBe('PRE')
    expect(data.practiceResult).toBeTruthy()
    expect(data.practiceResult.hit).toBe(true)
    expect(data.practiceResult.targetPattern).toBe('PRE')
  })

  it('reports a miss when the target differs from the detected pattern', async () => {
    const res = await post({ text: 'I prefer mornings because I focus.', targetPattern: 'CE' })
    const data = await res.json()
    expect(data.practiceResult.hit).toBe(false)
    expect(data.practiceResult.targetPattern).toBe('CE')
    expect(data.practiceResult.detectedPattern).toBe('PRE')
  })

  it('omits practiceResult for a free-practice (no target) utterance', async () => {
    const res = await post({ text: 'I prefer mornings because I focus.' })
    const data = await res.json()
    expect(data.practiceResult ?? null).toBeNull()
  })

  it('treats an invalid target pattern as no target', async () => {
    const res = await post({ text: 'I prefer mornings.', targetPattern: 'BOGUS' })
    const data = await res.json()
    expect(data.practiceResult ?? null).toBeNull()
  })

  it('rejects an empty utterance with 400', async () => {
    const res = await post({ text: '   ' })
    expect(res.status).toBe(400)
  })
})
