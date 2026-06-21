'use client'

// FeedbackPanel is a pure display component for now.
// In Phase 3+, it will receive live data via context/zustand.
// For now it reads from a shared state via the coach context (stub).

import { PATTERN_META } from '@/types'
import type { UtteranceFeedback, PatternType } from '@/types'
import { useCoach } from '@/components/coach/CoachContext'

// ── Placeholder data while no result ─────────────────────────────

const EMPTY_STATE = (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
    <div className="w-12 h-12 rounded-full bg-bg-card border border-line flex items-center justify-center">
      <svg className="w-5 h-5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
    <p className="text-sm text-muted max-w-[200px]">
      Feedback will appear here after you speak.
    </p>
  </div>
)

// ── Pattern pill ──────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-950/60 border-blue-800/50 text-blue-300',
  teal:   'bg-teal-950/60 border-teal-800/50 text-teal-300',
  amber:  'bg-amber-950/60 border-amber-800/50 text-amber-300',
  purple: 'bg-purple-950/60 border-purple-800/50 text-purple-300',
  coral:  'bg-rose-950/60 border-rose-800/50 text-rose-300',
  gray:   'bg-gray-900/60 border-gray-700/50 text-gray-400',
}

function PatternBadge({ pattern }: { pattern: PatternType }) {
  // Defend against an unexpected pattern value slipping through
  // (e.g. an LLM enum drift that bypassed coercion): fall back to
  // the UNKNOWN meta instead of crashing on meta.color.
  const meta = PATTERN_META[pattern] ?? PATTERN_META.UNKNOWN
  const color = COLOR_MAP[meta.color] ?? COLOR_MAP.gray
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${color}`}>
      <span className="font-mono font-bold">{pattern}</span>
      <span className="opacity-70">·</span>
      <span>{meta.label}</span>
    </span>
  )
}

// ── Score bar ─────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-green-500' :
    score >= 50 ? 'bg-yellow-500' :
    'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-bg-hover overflow-hidden">
        <div
          className={`h-full rounded-full score-bar ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-mono font-medium tabular-nums w-8 text-right">
        {score}
      </span>
    </div>
  )
}

// ── Gap item ──────────────────────────────────────────────────────

function GapItem({ component, description }: { component: string; description: string }) {
  return (
    <div className="flex gap-3 py-2.5">
      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
      <div>
        <p className="text-xs font-medium text-amber-300 capitalize">{component}</p>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────

export default function FeedbackPanel() {
  const { result } = useCoach()
  const feedback: UtteranceFeedback | undefined = result?.feedback
  if (!feedback) return EMPTY_STATE

  return (
    <div className="flex flex-col gap-5 fade-up">

      {/* Pattern */}
      <section>
        <p className="text-xs text-muted uppercase tracking-wide mb-2">Pattern</p>
        <PatternBadge pattern={feedback.patternDetected} />
        {feedback.patternConfidence !== 'high' && (
          <p className="text-xs text-muted mt-1.5">
            Confidence: {feedback.patternConfidence}
          </p>
        )}
      </section>

      {/* Score */}
      <section>
        <p className="text-xs text-muted uppercase tracking-wide mb-2">Clarity score</p>
        <ScoreBar score={feedback.score} />
      </section>

      {/* Gaps */}
      {feedback.gapsFound.length > 0 && (
        <section>
          <p className="text-xs text-muted uppercase tracking-wide mb-1">Missing elements</p>
          <div className="rounded-lg bg-amber-950/20 border border-amber-900/30 px-3 divide-y divide-amber-900/20">
            {feedback.gapsFound.map((gap, i) => (
              <GapItem key={i} {...gap} />
            ))}
          </div>
        </section>
      )}

      {/* Rewrite */}
      {feedback.rewrite && (
        <section>
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Suggested rewrite</p>
          <div className="rounded-lg bg-bg-card border border-line p-4">
            <p className="text-sm text-text-primary leading-relaxed italic">
              "{feedback.rewrite}"
            </p>
          </div>
        </section>
      )}

      {/* Explanation */}
      {feedback.explanation && (
        <section>
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Why</p>
          <p className="text-sm text-muted leading-relaxed">
            {feedback.explanation}
          </p>
        </section>
      )}
    </div>
  )
}
