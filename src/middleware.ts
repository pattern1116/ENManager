import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, isValidCode } from '@/lib/auth'

// Build a redirect URL that keeps the externally-visible host. Behind a
// reverse proxy / tunnel (e.g. Cloudflare → http://localhost:<port>),
// req.nextUrl reflects the internal localhost host, so a naive redirect
// would bounce the browser to localhost. Honor the forwarded headers.
function externalUrl(req: NextRequest, pathname: string) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(/:$/, '')
  return new URL(pathname, `${proto}://${host}`)
}

// Gate every page + API route behind the 4-digit PIN, except the auth
// endpoints and the login page itself.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Auth endpoints must stay reachable to log in / out.
  if (pathname.startsWith('/api/auth')) return NextResponse.next()

  const authed = isValidCode(req.cookies.get(AUTH_COOKIE)?.value)

  if (!authed) {
    if (pathname === '/login') return NextResponse.next()
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(externalUrl(req, '/login'))
  }

  // Already logged in — skip the login page.
  if (pathname === '/login') {
    return NextResponse.redirect(externalUrl(req, '/'))
  }

  return NextResponse.next()
}

export const config = {
  // Everything except Next internals + static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
