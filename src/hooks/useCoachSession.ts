'use client'

// ─────────────────────────────────────────────────────────────────
// useCoachSession — full pipeline hook
//
// recording → transcribe (/api/transcribe) → analyze (/api/analyze)
// ─────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { useRecorder } from './useRecorder'
import type { AnalyzeResponse, RecordingState } from '@/types'

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
  reset: () => void
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
        if (!sessionId) setSessionId(analyzeRes.sessionId)
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsProcessing(false)
      }
    },
    [sessionId],
  )

  const recorder = useRecorder(runAnalysis)

  const reset = useCallback(() => {
    recorder.reset()
    setTranscript(null)
    setResult(null)
    setPipelineError(null)
    setIsProcessing(false)
    setSessionId(null)
  }, [recorder])

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
        if (!sessionId) setSessionId(analyzeRes.sessionId)
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsProcessing(false)
      }
    },
    [sessionId],
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
    submitText,
  }
}
