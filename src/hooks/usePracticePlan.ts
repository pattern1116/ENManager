'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PracticePrompt } from '@/types'

// How many LLM follow-ups to chain on one thread before injecting a fresh
// seed topic — keeps practice deep but stops it drifting onto one narrow theme.
const MAX_THREAD = 3

// Round-robin order we drive the follow-up pattern through, so every pattern
// (including CE/CC, which the LLM rarely picks on its own) gets its turn
// instead of the thread skewing to PRE/SID/HO.
const PATTERN_ROTATION = ['PRE', 'SID', 'CE', 'CC', 'HO'] as const

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
  // Where we are in the follow-up pattern rotation. Start at a random offset so
  // sessions don't all open on the same pattern.
  const [patternCursor, setPatternCursor] = useState(() =>
    Math.floor(Math.random() * PATTERN_ROTATION.length),
  )

  // Cold start: pull the hardcoded variety deck and open at a random position
  // so we don't always start on the same pattern (the deck is PRE-first).
  useEffect(() => {
    fetch('/api/practice')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.prompts) && d.prompts.length > 0) {
          const start = Math.floor(Math.random() * d.prompts.length)
          setDeck(d.prompts)
          setSeedIndex(start)
          setCurrent(d.prompts[start])
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
  // current thread), ask the LLM for a follow-up; otherwise ask the server
  // for a fresh seed so difficulty/timer reflect the latest stats (the local
  // `deck` is only snapshotted once at mount and goes stale within a session).
  const next = useCallback(async (ctx?: NextContext) => {
    setDismissed(false)
    setLoading(true)

    const wantFollowup = !!ctx?.lastUtterance && threadDepth < MAX_THREAD
    // Drive the follow-up toward the next pattern in the rotation, then
    // advance the cursor so the next prompt targets a different one.
    const targetPattern = wantFollowup ? PATTERN_ROTATION[patternCursor % PATTERN_ROTATION.length] : undefined
    if (wantFollowup) setPatternCursor(c => c + 1)

    try {
      const res = await fetch('/api/practice/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          wantFollowup ? { lastUtterance: ctx!.lastUtterance, lastTopic: ctx!.lastTopic, targetPattern } : {},
        ),
      })
      const d = await res.json()
      if (d?.prompt?.topic) {
        setCurrent(d.prompt)
        // A server-side seed fallback resets the thread; a real follow-up deepens it.
        setThreadDepth(t => (d.source === 'followup' ? t + 1 : 0))
        return
      }
    } catch {
      // network failure — fall back to the locally cached deck so practice never breaks
    } finally {
      setLoading(false)
    }

    nextSeed()
  }, [threadDepth, nextSeed, patternCursor])

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

  // Let the learner pick a specific prompt (from the "choose a prompt" modal)
  // and start on it — fresh thread, no longer dismissed.
  const choosePrompt = useCallback((p: PracticePrompt) => {
    setCurrent(p)
    setThreadDepth(0)
    setDismissed(false)
  }, [])

  return { currentPrompt, deck, choosePrompt, next, simplify, dismiss, loading }
}
