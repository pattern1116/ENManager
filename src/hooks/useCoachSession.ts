'use client'

// ─────────────────────────────────────────────────────────────────
// useCoachSession — full pipeline hook
//
// recording → transcribe (/api/transcribe) → analyze (/api/analyze)
//
// Session semantics: one practice "sitting" = one session. The sessionId
// is kept across utterances and persisted to localStorage so a reload (or
// a trip to History and back) continues the same session. After SESSION_IDLE_MS
// of inactivity, or an explicit endSession(), the next utterance opens a new one.
// ─────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react'
import { useRecorder } from './useRecorder'
import type { AnalyzeResponse, RecordingState } from '@/types'

const SESSION_STORE_KEY = 'coach.session'
const SESSION_IDLE_MS = 30 * 60 * 1000 // 30 min of inactivity → new session

function loadStoredSession(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_STORE_KEY)
    if (!raw) return null
    const { id, ts } = JSON.parse(raw)
    if (typeof id !== 'number' || typeof ts !== 'number') return null
    if (Date.now() - ts > SESSION_IDLE_MS) return null
    return id
  } catch {
    return null
  }
}

function storeSession(id: number | null): void {
  if (typeof window === 'undefined') return
  try {
    if (id == null) localStorage.removeItem(SESSION_STORE_KEY)
    else localStorage.setItem(SESSION_STORE_KEY, JSON.stringify({ id, ts: Date.now() }))
  } catch {
    /* ignore quota / disabled storage */
  }
}

interface CoachSessionState {
  recordingState: RecordingState
  durationMs: number
  transcript: string | null
  result: AnalyzeResponse | null
  error: string | null
  sessionId: number | null
}

interface UseCoachSessionReturn extends CoachSessionState {
  startRecording: () => Promise<void>
  stopRecording: () => void
  reset: () => void                            // clear utterance state, keep session
  endSession: () => void                       // close session; next utterance opens a new one
  submitText: (text: string) => Promise<void>  // for text-input fallback
}

async function apiPost<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useCoachSession(): UseCoachSessionReturn {
  const [transcript, setTranscript] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Restore an in-progress session after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    const stored = loadStoredSession()
    if (stored != null) setSessionId(stored)
  }, [])

  // Adopt the session the server used and refresh its idle timer.
  const commitSession = useCallback((id: number) => {
    storeSession(id)
    setSessionId(prev => (prev === id ? prev : id))
  }, [])

  const runAnalysis = useCallback(
    async (blob: Blob, _durationMs: number) => {
      setIsProcessing(true)
      setPipelineError(null)

      try {
        // Step 1: transcribe
        const form = new FormData()
        form.append('audio', blob, 'recording.webm')
        const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: form })
        if (!transcribeRes.ok) {
          const e = await transcribeRes.json().catch(() => ({}))
          throw new Error(e.error ?? 'Transcription failed')
        }
        const { transcript: text } = await transcribeRes.json()
        setTranscript(text)

        // Step 2: analyze
        const analyzeRes: AnalyzeResponse = await apiPost('/api/analyze', {
          text,
          sessionId: sessionId ?? undefined,
        })
        setResult(analyzeRes)
        commitSession(analyzeRes.sessionId)
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsProcessing(false)
      }
    },
    [sessionId, commitSession],
  )

  const recorder = useRecorder(runAnalysis)

  // Clear utterance-level state but keep the session open for the next utterance.
  const reset = useCallback(() => {
    recorder.reset()
    setTranscript(null)
    setResult(null)
    setPipelineError(null)
    setIsProcessing(false)
  }, [recorder])

  // Explicitly close the current session.
  const endSession = useCallback(() => {
    reset()
    setSessionId(null)
    storeSession(null)
  }, [reset])

  const submitText = useCallback(
    async (text: string) => {
      setIsProcessing(true)
      setPipelineError(null)
      setTranscript(text)
      try {
        const analyzeRes: AnalyzeResponse = await apiPost('/api/analyze', {
          text,
          sessionId: sessionId ?? undefined,
        })
        setResult(analyzeRes)
        commitSession(analyzeRes.sessionId)
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsProcessing(false)
      }
    },
    [sessionId, commitSession],
  )

  // Derive recording state: if post-recording we're processing, override state
  const effectiveState: RecordingState = isProcessing
    ? 'processing'
    : result
    ? 'done'
    : recorder.state

  return {
    recordingState: effectiveState,
    durationMs: recorder.durationMs,
    transcript,
    result,
    error: recorder.error ?? pipelineError,
    sessionId,
    startRecording: recorder.start,
    stopRecording: recorder.stop,
    reset,
    endSession,
    submitText,
  }
}
