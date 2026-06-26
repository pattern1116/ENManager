'use client'

import { useState, useCallback, useEffect } from 'react'
import { useCoach } from '@/components/coach/CoachContext'
import { usePracticePlan } from '@/hooks/usePracticePlan'
import { Definable } from '@/components/coach/Definable'
import { PATTERN_META } from '@/types'
import type { RecordingState, PracticePrompt } from '@/types'

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
  loading,
  onNext,
  onSimplify,
  onDismiss,
}: {
  topic: string
  targetPattern: string
  timerSeconds: number
  hint?: string
  loading?: boolean
  onNext: () => void
  onSimplify: () => void
  onDismiss: () => void
}) {
  const meta = PATTERN_META[targetPattern as keyof typeof PATTERN_META]
  const [showGuide, setShowGuide] = useState(false)
  return (
    <div className="w-full rounded-xl bg-bg-card border border-line p-5 fade-up flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted uppercase tracking-wider">Today's prompt</span>
            {/* Tap the badge to learn what this pattern is */}
            <button
              onClick={() => setShowGuide(v => !v)}
              aria-expanded={showGuide}
              title={`What is ${targetPattern}?`}
              className="font-mono text-xs font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded-full hover:bg-blue-950/70 transition-colors"
            >
              {targetPattern} {showGuide ? '▾' : 'ⓘ'}
            </button>
            <span className="text-[10px] text-muted">{timerSeconds}s</span>
          </div>
          <Definable as="p" className="text-sm font-medium text-text-primary leading-snug select-text">{topic}</Definable>
          {meta && (
            <button
              onClick={() => setShowGuide(v => !v)}
              className="text-xs text-muted hover:text-text-primary text-left transition-colors"
            >
              {meta.structure} <span className="text-blue-400">{showGuide ? '' : `· What is ${targetPattern}?`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Pattern guide — step breakdown + worked example */}
      {showGuide && meta && (
        <div className="text-xs bg-bg-hover/50 border border-line rounded-lg px-3 py-3 flex flex-col gap-2">
          <p className="font-medium text-text-primary">{meta.label}</p>
          <ol className="flex flex-col gap-1 list-decimal list-inside text-muted">
            {meta.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {meta.example && (
            <p className="text-text-primary/90 leading-relaxed border-l-2 border-blue-800/50 pl-3 italic">
              {meta.example}
            </p>
          )}
        </div>
      )}

      {hint && (
        <p className="text-xs text-blue-300/80 bg-blue-950/20 border border-blue-900/30 rounded-lg px-3 py-2 leading-relaxed">
          Tip: {hint}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onNext}
          disabled={loading}
          className="text-xs text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        >
          {loading ? 'Thinking…' : 'Next topic →'}
        </button>
        <span className="text-muted text-xs">·</span>
        <button
          onClick={onSimplify}
          disabled={loading}
          title="Rewrite this topic to be more concrete"
          className="text-xs text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        >
          Make it concrete
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

// ── Prompt picker modal ───────────────────────────────────────────
// A quick "choose a prompt" sheet: one fresh topic per pattern so the learner
// picks from a few varied options instead of scrolling a long list.

function sampleOnePerPattern(deck: PracticePrompt[]): PracticePrompt[] {
  const byPattern = new Map<string, PracticePrompt[]>()
  for (const p of deck) {
    const list = byPattern.get(p.targetPattern) ?? []
    list.push(p)
    byPattern.set(p.targetPattern, list)
  }
  return [...byPattern.values()].map(list => list[Math.floor(Math.random() * list.length)])
}

function PromptPickerModal({
  deck,
  onPick,
  onClose,
}: {
  deck: PracticePrompt[]
  onPick: (p: PracticePrompt) => void
  onClose: () => void
}) {
  const [choices, setChoices] = useState<PracticePrompt[]>(() => sampleOnePerPattern(deck))

  // Deck arrives async on first load — seed choices once it's there.
  useEffect(() => {
    if (deck.length > 0) setChoices(sampleOnePerPattern(deck))
  }, [deck])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-surface border border-line shadow-xl p-5 fade-up">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-text-primary">Choose a prompt</p>
          <button onClick={onClose} className="text-muted hover:text-text-primary text-sm" aria-label="Close">✕</button>
        </div>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {choices.map((p, i) => {
            const meta = PATTERN_META[p.targetPattern as keyof typeof PATTERN_META]
            return (
              <button
                key={i}
                onClick={() => onPick(p)}
                className="text-left rounded-lg border border-line bg-bg-card p-3 hover:border-accent transition-colors flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-1.5 py-0.5 rounded-full">
                    {p.targetPattern}
                  </span>
                  {meta && <span className="text-[10px] text-muted">{meta.label}</span>}
                  <span className="ml-auto text-[10px] text-muted">{p.timerSeconds}s</span>
                </div>
                <span className="text-sm text-text-primary leading-snug">{p.topic}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setChoices(sampleOnePerPattern(deck))}
          className="mt-3 w-full text-xs text-muted hover:text-text-primary border border-line rounded-lg py-2 transition-colors"
        >
          ↻ Show different prompts
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

  const { currentPrompt, deck, choosePrompt, next, simplify, dismiss, loading: planLoading } = usePracticePlan()

  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

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
    // Capture what they just said before reset() clears it — it drives the
    // LLM follow-up ("tail topic") for the next prompt.
    const lastUtterance = transcript ?? undefined
    const lastTopic = currentPrompt?.topic
    reset()
    next({ lastUtterance, lastTopic })
  }, [reset, next, transcript, currentPrompt])

  return (
    <div className="w-full max-w-lg flex flex-col items-center gap-8">

      {/* Practice prompt card — shown when idle, no result yet */}
      {isIdle && !transcript && currentPrompt && (
        <PracticeCard
          topic={currentPrompt.topic}
          targetPattern={currentPrompt.targetPattern}
          timerSeconds={currentPrompt.timerSeconds}
          hint={currentPrompt.hint}
          loading={planLoading}
          onNext={next}
          onSimplify={simplify}
          onDismiss={dismiss}
        />
      )}

      {/* Choose a prompt — quick picker so the learner can swap to a topic
          they'd rather answer without scrolling a long list */}
      {isIdle && !transcript && deck.length > 0 && (
        <button
          onClick={() => setShowPicker(true)}
          className="text-xs text-muted hover:text-text-primary transition-colors underline underline-offset-2"
        >
          Choose a prompt
        </button>
      )}

      {showPicker && (
        <PromptPickerModal
          deck={deck}
          onPick={p => { choosePrompt(p); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
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
              disabled={planLoading}
              className="px-6 py-2 rounded-lg border border-blue-800/50 bg-blue-950/30 text-sm text-blue-400 hover:bg-blue-950/50 transition-colors disabled:opacity-50"
            >
              {planLoading ? 'Thinking of a follow-up…' : 'Next prompt →'}
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
