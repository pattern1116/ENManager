import { describe, it, expect, afterEach } from 'vitest'
import { isValidCode, allowedCodes, AUTH_COOKIE } from '@/lib/auth'

const ORIG = { ...process.env }
afterEach(() => { process.env = { ...ORIG } })

describe('auth — code validation', () => {
  it('accepts an allowlisted code from AUTH_CODES', () => {
    process.env.AUTH_CODES = '1234'
    expect(isValidCode('1234')).toBe(true)
  })

  it('rejects a 4-digit code that is not allowlisted', () => {
    process.env.AUTH_CODES = '1234'
    expect(isValidCode('5678')).toBe(false)
  })

  it('rejects non-4-digit and non-string input', () => {
    process.env.AUTH_CODES = '1234'
    expect(isValidCode('123')).toBe(false)    // too short
    expect(isValidCode('12345')).toBe(false)  // too long
    expect(isValidCode('abcd')).toBe(false)   // not digits
    expect(isValidCode(1234)).toBe(false)     // not a string
    expect(isValidCode(null)).toBe(false)
    expect(isValidCode(undefined)).toBe(false)
  })

  it('honours AUTH_CODES env (comma-separated allowlist)', () => {
    process.env.AUTH_CODES = '1234, 5678'
    expect(allowedCodes()).toEqual(['1234', '5678'])
    expect(isValidCode('1234')).toBe(true)
    expect(isValidCode('5678')).toBe(true)
    expect(isValidCode('9999')).toBe(false)
  })

  it('defaults to an empty allowlist (no access) when AUTH_CODES is unset', () => {
    delete process.env.AUTH_CODES
    expect(allowedCodes()).toEqual([])
    expect(isValidCode('1234')).toBe(false)
  })

  it('exposes a stable cookie name', () => {
    expect(AUTH_COOKIE).toBe('coach_uid')
  })
})
