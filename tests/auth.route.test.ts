import { describe, it, expect, afterEach } from 'vitest'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { AUTH_COOKIE } from '@/lib/auth'

const ORIG = { ...process.env }
afterEach(() => { process.env = { ...ORIG } })

function post(body: unknown) {
  const req = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return login(req as any)
}

describe('POST /api/auth/login', () => {
  it('sets the PIN cookie for a valid allowlisted code', async () => {
    process.env.AUTH_CODES = '1234'
    const res = await post({ code: '1234' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, userId: '1234' })

    const cookie = res.cookies.get(AUTH_COOKIE)
    expect(cookie?.value).toBe('1234')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.path).toBe('/')
  })

  it('rejects a non-allowlisted code with 401 and no cookie', async () => {
    process.env.AUTH_CODES = '1234'
    const res = await post({ code: '5678' })
    expect(res.status).toBe(401)
    expect(res.cookies.get(AUTH_COOKIE)).toBeUndefined()
  })

  it('rejects malformed input with 401', async () => {
    process.env.AUTH_CODES = '1234'
    expect((await post({ code: 'abcd' })).status).toBe(401)
    expect((await post({ code: 1234 })).status).toBe(401)
    expect((await post({})).status).toBe(401)
  })

  it('honours a custom AUTH_CODES allowlist', async () => {
    process.env.AUTH_CODES = '1234,5678'
    expect((await post({ code: '1234' })).status).toBe(200)
    expect((await post({ code: '9999' })).status).toBe(401)
  })

  it('denies every code when AUTH_CODES is unset', async () => {
    delete process.env.AUTH_CODES
    expect((await post({ code: '1234' })).status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the PIN cookie', async () => {
    const res = await logout()
    expect(res.status).toBe(200)
    const cookie = res.cookies.get(AUTH_COOKIE)
    expect(cookie?.value).toBe('')
    expect(cookie?.maxAge).toBe(0)
  })
})
