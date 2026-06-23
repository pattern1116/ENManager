import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const ORIG = { ...process.env }
afterEach(() => { process.env = { ...ORIG } })

// Build a NextRequest. The proxied case sets x-forwarded-* the way a tunnel
// (e.g. Cloudflare → http://localhost:<port>) does: the socket host is
// localhost, but the externally-visible host lives in the forwarded headers.
function req(
  path: string,
  opts: { cookie?: string; headers?: Record<string, string>; host?: string } = {},
) {
  const origin = opts.host ?? 'http://localhost:7191'
  const headers = new Headers(opts.headers ?? {})
  if (opts.cookie) headers.set('cookie', opts.cookie)
  return new NextRequest(new URL(path, origin), { headers })
}

const AUTHED = 'coach_uid=0911'

describe('middleware — auth gate', () => {
  it('redirects an unauthed page request to /login', () => {
    const res = middleware(req('/history'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('preserves the externally-visible host on redirect (tunnel fix)', () => {
    // Socket host is localhost, but the tunnel forwards the real host/proto.
    const res = middleware(req('/history', {
      headers: {
        'x-forwarded-host': 'en-manager.matildabc.com',
        'x-forwarded-proto': 'https',
      },
    }))
    const loc = new URL(res.headers.get('location')!)
    expect(loc.host).toBe('en-manager.matildabc.com')
    expect(loc.protocol).toBe('https:')
    expect(loc.pathname).toBe('/login')
  })

  it('falls back to the Host header when x-forwarded-host is absent', () => {
    const res = middleware(req('/history', { headers: { host: 'example.test' } }))
    expect(new URL(res.headers.get('location')!).host).toBe('example.test')
  })

  it('returns 401 JSON (no redirect) for an unauthed API request', async () => {
    const res = middleware(req('/api/sessions'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('lets /api/auth/* through unauthenticated so login is reachable', () => {
    const res = middleware(req('/api/auth/login'))
    // next() — passes through, not a redirect/401.
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).toBe(200)
  })

  it('lets the /login page through when unauthed', () => {
    const res = middleware(req('/login'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).toBe(200)
  })

  it('redirects an authed user away from /login, keeping the external host', () => {
    const res = middleware(req('/login', {
      cookie: AUTHED,
      headers: { 'x-forwarded-host': 'en-manager.matildabc.com', 'x-forwarded-proto': 'https' },
    }))
    const loc = new URL(res.headers.get('location')!)
    expect(loc.host).toBe('en-manager.matildabc.com')
    expect(loc.pathname).toBe('/')
  })

  it('lets an authed page request through', () => {
    const res = middleware(req('/history', { cookie: AUTHED }))
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).toBe(200)
  })

  it('treats a cookie with a non-allowlisted code as unauthed', () => {
    const res = middleware(req('/history', { cookie: 'coach_uid=1234' }))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })
})
