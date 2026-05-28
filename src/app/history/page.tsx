'use client'

import { useEffect, useState, useCallback } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { PATTERN_META } from '@/types'
import type { Session, Utterance, ProgressReport, PracticePrompt } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function ScorePill({ score }: { score?: number }) {
  if (score == null) return <span className="text-muted text-xs">—</span>
  const color = score >= 75 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-xs font-mono font-medium ${color}`}>{score}</span>
}

// ── Stat card ─────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-bg-card border border-line p-5">
      <p className="text-xs text-muted uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-mono font-medium">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

// ── Practice card ─────────────────────────────────────────────────

const DIFFICULTY_COLORS = {
  beginner:     'text-green-400 border-green-800/40 bg-green-950/30',
  intermediate: 'text-yellow-400 border-yellow-800/40 bg-yellow-950/30',
  advanced:     'text-red-400 border-red-800/40 bg-red-950/30',
}

function PracticeCard({ prompt }: { prompt: PracticePrompt }) {
  const meta = PATTERN_META[prompt.targetPattern]
  const diffColor = DIFFICULTY_COLORS[prompt.difficulty]
  return (
    <div className="rounded-lg bg-bg-card border border-line p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold text-text-primary">{prompt.targetPattern}</span>
        <span className="text-xs text-muted">·</span>
        <span className="text-xs text-muted">{meta.label}</span>
        <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border ${diffColor}`}>
          {prompt.difficulty}
        </span>
      </div>
      <p className="text-sm text-text-primary">{prompt.topic}</p>
      {prompt.hint && (
        <p className="text-xs text-muted leading-relaxed border-t border-line pt-2">
          Tip: {prompt.hint}
        </p>
      )}
      <p className="text-[10px] text-muted">{prompt.timerSeconds}s</p>
    </div>
  )
}

// ── Utterance detail ──────────────────────────────────────────────

function UtteranceRow({ u }: { u: Utterance }) {
  const meta = PATTERN_META[u.patternUsed]
  const scoreColor = u.score >= 75 ? 'text-green-400' : u.score >= 50 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="flex flex-col gap-2 py-3 px-4 border-b border-line last:border-0">
      {/* Top row: pattern + score */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-1.5 py-0.5 rounded-full">
          {u.patternUsed}
        </span>
        <span className="text-[10px] text-muted flex-1">{meta?.label}</span>
        <span className={`text-xs font-mono font-medium ${scoreColor}`}>{u.score}</span>
      </div>

      {/* Original text */}
      <p className="text-sm text-text-primary leading-relaxed">{u.text}</p>

      {/* Gaps */}
      {u.gapsFound.length > 0 && (
        <div className="flex flex-col gap-1">
          {u.gapsFound.map((g, i) => (
            <p key={i} className="text-xs text-amber-400/80">
              <span className="font-medium capitalize">{g.component}:</span>{' '}
              <span className="text-muted">{g.description}</span>
            </p>
          ))}
        </div>
      )}

      {/* Rewrite */}
      {u.rewriteShown && (
        <p className="text-xs text-muted italic border-l-2 border-line pl-3 leading-relaxed">
          "{u.rewriteShown}"
        </p>
      )}
    </div>
  )
}

// ── Session row (expandable) ──────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const [utterances, setUtterances] = useState<Utterance[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (utterances !== null) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}`)
      const data = await res.json()
      setUtterances(data.utterances ?? [])
    } catch {
      setUtterances([])
    } finally {
      setLoading(false)
    }
  }, [open, utterances, session.id])

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-hover transition-colors text-left"
      >
        <span className="text-xs text-muted font-mono w-6">#{session.id}</span>
        <span className="text-xs text-text-primary flex-1">{fmt(session.createdAt)}</span>
        <span className="text-xs text-muted">{session.utteranceCount ?? 0} utterances</span>
        <ScorePill score={session.avgScore} />
        <svg
          className={`w-3.5 h-3.5 text-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-line bg-bg-surface fade-up">
          {loading ? (
            <p className="text-xs text-muted px-4 py-3">Loading…</p>
          ) : !utterances || utterances.length === 0 ? (
            <p className="text-xs text-muted px-4 py-3">No utterances recorded.</p>
          ) : (
            utterances.map(u => <UtteranceRow key={u.id} u={u} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [progress, setProgress] = useState<ProgressReport | null>(null)
  const [practice, setPractice] = useState<PracticePrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [sessRes, pracRes] = await Promise.all([
          fetch('/api/sessions'),
          fetch('/api/practice'),
        ])
        if (!sessRes.ok) throw new Error('Failed to load sessions')
        const sessData = await sessRes.json()
        setSessions(sessData.sessions ?? [])
        setProgress(sessData.progress ?? null)

        if (pracRes.ok) {
          const pracData = await pracRes.json()
          setPractice(pracData.prompts ?? [])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-line flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h1 className="text-sm font-medium text-muted tracking-wide uppercase">History</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto flex flex-col gap-6">

            {error && (
              <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Sessions" value={loading ? '…' : (progress?.totalSessions ?? 0)} />
              <StatCard label="Utterances" value={loading ? '…' : (progress?.totalUtterances ?? 0)} />
              <StatCard
                label="Avg score"
                value={loading ? '…' : (progress?.overallAvgScore ?? '—')}
                sub={
                  progress?.recentImprovement
                    ? `${progress.recentImprovement > 0 ? '+' : ''}${progress.recentImprovement} this week`
                    : undefined
                }
              />
            </div>

            {/* Practice prompts */}
            {!loading && practice.length > 0 && (
              <section>
                <p className="text-xs text-muted uppercase tracking-wide mb-3">
                  Practice — based on your weak spots
                </p>
                <div className="flex flex-col gap-2">
                  {practice.map((p, i) => <PracticeCard key={i} prompt={p} />)}
                </div>
              </section>
            )}

            {/* Pattern breakdown */}
            {!loading && progress && progress.patternStats.length > 0 && (
              <section>
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Pattern breakdown</p>
                <div className="rounded-xl bg-bg-card border border-line divide-y divide-line overflow-hidden">
                  {progress.patternStats.map(ps => {
                    const meta = PATTERN_META[ps.pattern]
                    const trendIcon = ps.trend === 'improving' ? '↑' : ps.trend === 'declining' ? '↓' : '→'
                    const trendColor = ps.trend === 'improving' ? 'text-green-400' : ps.trend === 'declining' ? 'text-red-400' : 'text-muted'
                    return (
                      <div key={ps.pattern} className="flex items-center gap-3 px-4 py-3">
                        <span className="font-mono text-xs font-bold w-10">{ps.pattern}</span>
                        <span className="text-xs text-muted flex-1">{meta.label}</span>
                        <span className="text-xs text-muted">{ps.count}×</span>
                        <span className="text-xs font-mono w-8 text-right">{ps.avgScore}</span>
                        <span className={`text-xs w-4 text-center ${trendColor}`}>{trendIcon}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Session list */}
            <section>
              <p className="text-xs text-muted uppercase tracking-wide mb-3">Sessions</p>
              {loading ? (
                <div className="rounded-xl bg-bg-card border border-line p-6">
                  <p className="text-sm text-muted text-center">Loading…</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-xl bg-bg-card border border-line p-6">
                  <p className="text-sm text-muted text-center py-4">
                    No sessions yet. Start practicing to see your history.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-bg-card border border-line overflow-hidden divide-y divide-line">
                  {sessions.map(s => <SessionRow key={s.id} session={s} />)}
                </div>
              )}
            </section>

          </div>
        </div>
      </main>
    </div>
  )
}
