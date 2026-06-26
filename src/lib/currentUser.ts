// ─────────────────────────────────────────────────────────────────
// currentUser — resolve the authenticated user id inside a route handler.
//
// The login code (stored in the httpOnly AUTH_COOKIE) doubles as the user id
// and as the partition key for every DB query. Middleware already blocks
// unauthenticated requests, but routes re-validate defensively: a handler
// must never run a user-scoped query with a missing or invalid id.
//
// Kept separate from lib/auth.ts on purpose — auth.ts is imported by the edge
// middleware, and `next/headers` is only available in the Node route runtime.
// ─────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { AUTH_COOKIE, isValidCode } from './auth'

// The authenticated user id, or null when there is no valid session.
export function currentUserId(): string | null {
  const code = cookies().get(AUTH_COOKIE)?.value
  return isValidCode(code) ? code : null
}
