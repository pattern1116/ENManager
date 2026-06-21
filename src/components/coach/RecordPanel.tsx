'use client'

import { useState, useCallback, useEffect } from 'react'
import { useCoach } from '@/components/coach/CoachContext'
import { usePracticePlan } from '@/hooks/usePracticePlan'
import { PATTERN_META } from '@/types'
import type { RecordingState } from '@/types'

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

const STATE_LABELS: Record<RecordingState, string> = {
  idle:       'Tap to speak',
  recording:  'Recording…',
  processing: 'Analysing…',
  done:       'Done',
  error:      'Error',
}

// ── Practice prompt card ──────────────────────────────────────────

function PracticeCard({
  topic,
  targetPattern,
  timerSeconds,
  hint,
  onNext,
  onDismiss,
}: {
  topic: string
  targetPattern: string
  timerSeconds: number
  hint?: string
  onNext: () => void
  onDismiss: () => void
}) {
  const meta = PATTERN_META[targetPattern as keyof typeof PATTERN_META]
  return (
    <div className="w-full rounded-xl bg-bg-card border border-line p-5 fade-up flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted uppercase tracking-wider">Today's prompt</span>
            <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded-full">
              {targetPattern}
            </span>
            <span className="text-[10px] text-muted">{timerSeconds}s</span>
          </div>
          <p className="text-sm font-medium text-text-primary leading-snug">{topic}</p>
          {meta && (
            <p className="text-xs text-muted">{meta.structure}</p>
          )}
        </div>
      </div>

      {hint && (
        <p className="text-xs text-blue-300/80 bg-blue-950/20 border border-blue-900/30 rounded-lg px-3 py-2 leading-relaxed">
          Tip: {hint}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onNext}
          className="text-xs text-muted hover:text-text-primary transition-colors"
        >
          Next topic →
        </button>
        <span className="text-muted text-xs">·</span>
        <button
          onClick={onDismiss}
          className="text-xs text-muted hover:text-text-primary transition-colors"
        >
          Free practice
        </button>
      </div>
    </div>
  )
}

// ── Countdown ring ────────────────────────────────────────────────

function CountdownRing({ timeLeftS, totalS }: { timeLeftS: number; totalS: number }) {
  const pct = totalS > 0 ? timeLeftS / totalS : 0
  const radius = 52
  const circ = 2 * Math.PI * radius
  const dash = circ * pct
  const isUrgent = timeLeftS <= 5
  const color = isUrgent ? '#ef4444' : '#3b82f6'

  return (
    <svg
      className="absolute inset-0 -rotate-90 pointer-events-none"
      width="96" height="96"
      viewBox="0 0 96 96"
    >
      <circle cx="48" cy="48" r={radius} fill="none" stroke="currentColor"
        className="text-bg-hover" strokeWidth="3" />
      <circle cx="48" cy="48" r={radius} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.1s linear, stroke 0.3s' }}
      />
    </svg>
  )
}

// ── Main panel ────────────────────────────────────────────────────

export default function RecordPanel() {
  const {
    recordingState,
    durationMs,
    transcript,
    result,
    error,
    sessionId,
    startRecording,
    stopRecording,
    reset,
    endSession,
    submitText,
  } = useCoach()

  const { currentPrompt, next, dismiss } = usePracticePlan()

  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)

  const isRecording  = recordingState === 'recording'
  const isProcessing = recordingState === 'processing'
  const isDone       = recordingState === 'done'
  const isIdle       = recordingState === 'idle'

  // Auto-stop when countdown hits zero
  useEffect(() => {
    if (isRecording && currentPrompt && durationMs >= currentPrompt.timerSeconds * 1000) {
      stopRecording()
    }
  }, [isRecording, durationMs, currentPrompt, stopRecording])

  const timeLeftS = isRecording && currentPrompt
    ? Math.max(0, Math.ceil((currentPrompt.timerSeconds * 1000 - durationMs) / 1000))
    : null

  const handleMicClick = useCallback(() => {
    if (recordingState === 'idle') startRecording(currentPrompt?.targetPattern ?? null)
    else if (recordingState === 'recording') stopRecording()
  }, [recordingState, startRecording, stopRecording, currentPrompt])

  const handleTextSubmit = useCallback(() => {
    if (textInput.trim()) {
      submitText(textInput.trim(), currentPrompt?.targetPattern ?? null)
      setTextInput('')
    }
  }, [textInput, submitText, currentPrompt])

  const handleNext = useCallback(() => {
    reset()
    next()
  }, [reset, next])

  return (
    <div className="w-full max-w-lg flex flex-col items-center gap-8">

      {/* Practice prompt card — shown when idle, no result yet */}
      {isIdle && !transcript && currentPrompt && (
        <PracticeCard
          topic={currentPrompt.topic}
          targetPattern={currentPrompt.targetPattern}
          timerSeconds={currentPrompt.timerSeconds}
          hint={currentPrompt.hint}
          onNext={next}
          onDismiss={dismiss}
        />
      )}

      {/* Mic button */}
      <div className="relative flex items-center justify-center w-24 h-24">
        {isRecording && currentPrompt && timeLeftS !== null && (
          <CountdownRing timeLeftS={timeLeftS} totalS={currentPrompt.timerSeconds} />
        )}
        {isRecording && !currentPrompt && (
          <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-40" />
        )}
        <button
          onClick={handleMicClick}
          disabled={isProcessing}
          aria-label={STATE_LABELS[recordingState]}
          className={[
            'relative w-24 h-24 rounded-full flex items-center justify-center',
            'transition-all duration-200 focus:outline-none',
            isRecording
              ? 'bg-red-500 shadow-[0_0_32px_rgba(239,68,68,0.4)] scale-110'
              : isProcessing
              ? 'bg-bg-card cursor-not-allowed opacity-60'
              : 'bg-bg-card border border-line hover:border-accent hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] hover:scale-105',
          ].join(' ')}
        >
          {isProcessing ? (
            <svg className="w-8 h-8 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" />
            </svg>
          ) : isRecording ? (
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0014 0M12 21v-4M8 21h8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Status label + timer */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm text-muted">
          {STATE_LABELS[recordingState]}
        </span>
        {isRecording && (
          <span className={[
            'font-mono text-xl tabular-nums transition-colors',
            timeLeftS !== null && timeLeftS <= 5 ? 'text-red-400' : 'text-red-400',
          ].join(' ')}>
            {timeLeftS !== null ? `${timeLeftS}s` : formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="w-full rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-400 fade-up">
          {error}
        </div>
      )}

      {/* Transcript display */}
      {transcript && (
        <div className="w-full rounded-xl bg-bg-card border border-line p-5 fade-up">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Transcript</p>
          <p className="text-text-primary leading-relaxed">{transcript}</p>
        </div>
      )}

      {/* Reset / next buttons */}
      {(isDone || error) && (
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg border border-line text-sm text-muted hover:text-text-primary hover:border-accent transition-colors"
          >
            Try again
          </button>
          {currentPrompt && (
            <button
              onClick={handleNext}
              className="px-6 py-2 rounded-lg border border-blue-800/50 bg-blue-950/30 text-sm text-blue-400 hover:bg-blue-950/50 transition-colors"
            >
              Next prompt →
            </button>
          )}
        </div>
      )}

      {/* Text input fallback */}
      {isIdle && (
        <div className="w-full">
          {!showTextInput ? (
            <button
              onClick={() => setShowTextInput(true)}
              className="text-xs text-muted hover:text-text-primary transition-colors underline underline-offset-2"
            >
              Type instead
            </button>
          ) : (
            <div className="flex flex-col gap-2 fade-up">
              <textarea
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleTextSubmit()
                }}
                placeholder={currentPrompt ? `"${currentPrompt.topic}"` : 'Type a sentence to analyze…'}
                rows={3}
                className="w-full rounded-lg bg-bg-card border border-line px-4 py-3 text-sm text-text-primary placeholder:text-muted resize-none focus:outline-none focus:border-accent transition-colors"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowTextInput(false)}
                  className="px-4 py-1.5 text-xs text-muted hover:text-text-primary border border-line rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="px-4 py-1.5 text-xs bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-blue-500 transition-colors"
                >
                  Analyse ⌘↵
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session indicator — utterances group into one session until ended */}
      {isIdle && sessionId != null && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
          <span className="font-mono">Session #{sessionId}</span>
          <span>·</span>
          <button
            onClick={endSession}
            className="hover:text-text-primary transition-colors underline underline-offset-2"
          >
            New session
          </button>
        </div>
      )}
    </div>
  )
}
