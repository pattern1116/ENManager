'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PracticePrompt } from '@/types'

// How many LLM follow-ups to chain on one thread before injecting a fresh
// seed topic — keeps practice deep but stops it drifting onto one narrow theme.
const MAX_THREAD = 3

export interface NextContext {
  lastUtterance?: string   // what the learner just said (drives the follow-up)
  lastTopic?: string       // the prompt they were answering
}

export function usePracticePlan() {
  const [deck, setDeck] = useState<PracticePrompt[]>([])
  const [seedIndex, setSeedIndex] = useState(0)
  const [current, setCurrent] = useState<PracticePrompt | null>(null)
  const [threadDepth, setThreadDepth] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  // Cold start: pull the hardcoded variety deck and open with its first topic.
  useEffect(() => {
    fetch('/api/practice')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.prompts) && d.prompts.length > 0) {
          setDeck(d.prompts)
          setCurrent(d.prompts[0])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Advance to the next hardcoded seed topic and reset the thread.
  const nextSeed = useCallback(() => {
    setThreadDepth(0)
    setSeedIndex(i => {
      const ni = i + 1
      if (deck.length > 0) setCurrent(deck[ni % deck.length])
      return ni
    })
    setDismissed(false)
  }, [deck])

  // Move on. With something the learner just said (and not too deep on the
  // current thread), ask the LLM for a follow-up; otherwise pick a fresh seed.
  const next = useCallback(async (ctx?: NextContext) => {
    setDismissed(false)

    if (ctx?.lastUtterance && threadDepth < MAX_THREAD) {
      setLoading(true)
      try {
        const res = await fetch('/api/practice/next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastUtterance: ctx.lastUtterance, lastTopic: ctx.lastTopic }),
        })
        const d = await res.json()
        if (d?.prompt?.topic) {
          setCurrent(d.prompt)
          // A server-side seed fallback resets the thread; a real follow-up deepens it.
          setThreadDepth(t => (d.source === 'followup' ? t + 1 : 0))
          return
        }
      } catch {
        // fall through to a hardcoded seed
      } finally {
        setLoading(false)
      }
    }

    nextSeed()
  }, [threadDepth, nextSeed])

  // Rewrite the current topic into a concrete, self-explanatory version —
  // same theme, same pattern — for when a prompt is too abstract to start on.
  const simplify = useCallback(async () => {
    if (!current) return
    setLoading(true)
    try {
      const res = await fetch('/api/practice/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'simplify', topic: current.topic, pattern: current.targetPattern }),
      })
      const d = await res.json()
      if (d?.prompt?.topic) setCurrent(d.prompt)
    } catch {
      // keep the current prompt on failure
    } finally {
      setLoading(false)
    }
  }, [current])

  const currentPrompt: PracticePrompt | null = dismissed ? null : current

  const dismiss = useCallback(() => setDismissed(true), [])

  return { currentPrompt, next, simplify, dismiss, loading }
}
