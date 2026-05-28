'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PracticePrompt } from '@/types'

export function usePracticePlan() {
  const [prompts, setPrompts] = useState<PracticePrompt[]>([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/practice')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.prompts)) setPrompts(d.prompts) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const currentPrompt: PracticePrompt | null =
    dismissed || prompts.length === 0 ? null : prompts[index % prompts.length]

  const next = useCallback(() => {
    setIndex(i => i + 1)
    setDismissed(false)
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  return { currentPrompt, next, dismiss, loading }
}
