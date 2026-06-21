'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export default function LoginPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = useCallback(async (value: string) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      })
      if (!res.ok) {
        setError('Wrong code')
        setCode('')
        inputRef.current?.focus()
        return
      }
      // Full reload so middleware picks up the new cookie.
      window.location.assign('/')
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }, [])

  const onChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    setCode(digits)
    setError(null)
    if (digits.length === 4) submit(digits)
  }, [submit])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
          <span className="text-accent text-sm font-bold">SC</span>
        </div>
        <h1 className="text-sm font-medium text-muted tracking-wide uppercase">Speaking Coach</h1>
        <p className="text-xs text-muted">Enter your 4-digit code</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <input
          ref={inputRef}
          value={code}
          onChange={e => onChange(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          disabled={submitting}
          aria-label="4-digit code"
          className={[
            'w-44 text-center font-mono text-3xl tracking-[0.5em] tabular-nums',
            'bg-bg-card border rounded-xl py-4 pl-4 outline-none transition-colors',
            error ? 'border-red-500/60 text-red-400' : 'border-line focus:border-accent text-text-primary',
            submitting ? 'opacity-50' : '',
          ].join(' ')}
          placeholder="••••"
        />
        <span className={`text-xs h-4 ${error ? 'text-red-400' : 'text-muted'}`}>
          {error ?? (submitting ? 'Checking…' : ' ')}
        </span>
      </div>
    </div>
  )
}
