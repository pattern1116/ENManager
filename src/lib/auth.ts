// ─────────────────────────────────────────────────────────────────
// PIN auth — a 4-digit access code gate.
//
// The code the user types becomes their user id and is stored in an
// httpOnly cookie. Middleware validates the cookie against the allowlist
// on every request. This is a lightweight gate (the 4-digit code IS the
// credential), not strong auth — it just keeps the app off the open web.
//
// Codes live ONLY in AUTH_CODES (env, comma-separated) — e.g.
//   AUTH_CODES=1234,5678
// There is no hardcoded default: with AUTH_CODES unset the allowlist is
// empty and nobody can log in. Never commit a real code to the repo.
// ─────────────────────────────────────────────────────────────────

export const AUTH_COOKIE = 'coach_uid'

export function allowedCodes(): string[] {
  const env = process.env.AUTH_CODES
  return env
    ? env.split(',').map(s => s.trim()).filter(Boolean)
    : []
}

// A valid code is exactly 4 digits AND on the allowlist.
export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{4}$/.test(code) && allowedCodes().includes(code)
}
