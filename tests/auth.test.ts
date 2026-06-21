import { describe, it, expect, afterEach } from 'vitest'
import { isValidCode, allowedCodes, AUTH_COOKIE } from '@/lib/auth'

const ORIG = { ...process.env }
afterEach(() => { process.env = { ...ORIG } })

describe('auth — code validation', () => {
  it('accepts the default allowlisted code 0911', () => {
    delete process.env.AUTH_CODES
    expect(isValidCode('0911')).toBe(true)
  })

  it('rejects a 4-digit code that is not allowlisted', () => {
    delete process.env.AUTH_CODES
    expect(isValidCode('1234')).toBe(false)
  })

  it('rejects non-4-digit and non-string input', () => {
    delete process.env.AUTH_CODES
    expect(isValidCode('091')).toBe(false)    // too short
    expect(isValidCode('09111')).toBe(false)  // too long
    expect(isValidCode('abcd')).toBe(false)   // not digits
    expect(isValidCode(911)).toBe(false)      // not a string
    expect(isValidCode(null)).toBe(false)
    expect(isValidCode(undefined)).toBe(false)
  })

  it('honours AUTH_CODES env (comma-separated allowlist)', () => {
    process.env.AUTH_CODES = '0911, 1234'
    expect(allowedCodes()).toEqual(['0911', '1234'])
    expect(isValidCode('1234')).toBe(true)
    expect(isValidCode('0911')).toBe(true)
    expect(isValidCode('5678')).toBe(false)
  })

  it('defaults to only 0911 when AUTH_CODES is unset', () => {
    delete process.env.AUTH_CODES
    expect(allowedCodes()).toEqual(['0911'])
  })

  it('exposes a stable cookie name', () => {
    expect(AUTH_COOKIE).toBe('coach_uid')
  })
})
