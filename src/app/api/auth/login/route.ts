// POST /api/auth/login  { code: "0911" }
// Validates the 4-digit code and, on success, stores it as the user id
// in an httpOnly cookie.

import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, isValidCode } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const code = (body as { code?: unknown }).code

  if (!isValidCode(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, userId: code })
  res.cookies.set(AUTH_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
