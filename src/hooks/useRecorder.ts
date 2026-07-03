'use client'

// ─────────────────────────────────────────────────────────────────
// useRecorder — MediaRecorder API hook
//
// Handles: permission request, recording, chunking, stop, cleanup.
// Returns a blob when recording ends.
// ─────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react'
import type { RecordingState } from '@/types'

interface UseRecorderReturn {
  state: RecordingState
  durationMs: number
  start: () => Promise<void>
  stop: () => void
  reset: () => void
  error: string | null
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

function getSupportedMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''  // let browser pick
}

// How often to hand the caller the audio-so-far for live transcription. The
// accumulated blob always starts at chunk 0 (which carries the webm header) so
// each snapshot is independently decodable by the STT server.
const PARTIAL_INTERVAL_MS = 900

export function useRecorder(
  onComplete: (blob: Blob, durationMs: number) => void,
  // Optional: called every ~900ms while recording with the growing audio, so a
  // caller can show live captions of what's being said. The main coach flow
  // omits it and behaves exactly as before.
  onPartial?: (blob: Blob) => void,
): UseRecorderReturn {
  const [state, setState] = useState<RecordingState>('idle')
  const [durationMs, setDurationMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const partialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Set when stop() is pressed before getUserMedia has resolved (the mic is
  // still opening). The pending start() checks this and bails out cleanly
  // instead of leaving the recorder "recording" with no way to stop it.
  const stopRequestedRef = useRef(false)

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (partialTimerRef.current) clearInterval(partialTimerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setState('recording')
    stopRequestedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Stop was pressed while the mic was still opening — tear down and bail
      // so we don't strand a recorder the user already tried to stop.
      if (stopRequestedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        setState('idle')
        return
      }
      streamRef.current = stream

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      startTimeRef.current = Date.now()

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const elapsed = Date.now() - startTimeRef.current
        setDurationMs(elapsed)

        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        })
        cleanup()
        onComplete(blob, elapsed)
      }

      recorder.onerror = () => {
        setError('Recording error — please try again.')
        setState('error')
        cleanup()
      }

      // Collect chunks every 250ms so we get data even on short recordings
      recorder.start(250)

      // Update elapsed time every 100ms
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current)
      }, 100)

      // Live captions: periodically hand back the audio-so-far. Concatenating
      // from chunk 0 keeps the webm header, so the snapshot stays decodable.
      if (onPartial) {
        partialTimerRef.current = setInterval(() => {
          if (chunksRef.current.length === 0) return
          onPartial(new Blob(chunksRef.current, { type: mimeType || 'audio/webm' }))
        }, PARTIAL_INTERVAL_MS)
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow mic access and try again.'
          : err instanceof Error
          ? err.message
          : 'Could not start recording.'
      setError(msg)
      setState('error')
      cleanup()
    }
  }, [cleanup, onComplete, onPartial])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      setState('processing')
      mediaRecorderRef.current.stop()
    } else {
      // Recorder not live yet (mic still opening). Flag it so the in-flight
      // start() aborts, and drop back to idle so the UI never gets stuck.
      stopRequestedRef.current = true
      setState('idle')
    }
    if (timerRef.current) clearInterval(timerRef.current)
    if (partialTimerRef.current) clearInterval(partialTimerRef.current)
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setState('idle')
    setDurationMs(0)
    setError(null)
  }, [cleanup])

  return { state, durationMs, start, stop, reset, error }
}
