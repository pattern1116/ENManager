import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, isValidCode } from '@/lib/auth'

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
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Already logged in — skip the login page.
  if (pathname === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Everything except Next internals + static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
