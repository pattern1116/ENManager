// GET /api/auth/me — returns the current user id (the entered code).
// Reachable only when the middleware has let the request through, but we
// re-validate defensively.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { AUTH_COOKIE, isValidCode } from '@/lib/auth'

export async function GET() {
  const code = cookies().get(AUTH_COOKIE)?.value
  if (!isValidCode(code)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ userId: code })
}
