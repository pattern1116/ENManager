'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { PATTERN_META } from '@/types'
import type { PatternType, PatternStats, WeakPoint } from '@/types'

// ── Types (mirror WeeklyReportData from db) ───────────────────────

interface DayScore  { date: string; avgScore: number; count: number }
interface WeekSummary { avgScore: number; utteranceCount: number; sessionCount: number }
interface ReportData {
  thisWeek: WeekSummary
  lastWeek: WeekSummary
  scoreDelta: number
  dailyScores: DayScore[]
  patternStats: PatternStats[]
  top3WeakPoints: WeakPoint[]
  focusPattern: PatternType | null
}

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-muted">no change</span>
  const up    = delta > 0
  const color = up ? 'text-green-400' : 'text-red-400'
  return <span className={`text-xs font-mono font-medium ${color}`}>{up ? '+' : ''}{delta} pts</span>
}

// ── Summary card ──────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string | number; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-card border border-line p-5 flex flex-col gap-1">
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-mono font-medium">{value || '—'}</p>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Daily score bar chart ─────────────────────────────────────────

function ScoreChart({ days }: { days: DayScore[] }) {
  if (days.length === 0) {
    return (
      <p className="text-xs text-muted text-center py-6">No data yet — start practicing.</p>
    )
  }

  // Fill all 14 calendar days so gaps show as empty
  const today = new Date()
  const slots: (DayScore | null)[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    const key = d.toISOString().slice(0, 10)
    return days.find(r => r.date === key) ?? null
  })

  const max = Math.max(...days.map(d => d.avgScore), 1)

  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {slots.map((slot, i) => {
        const isThisWeek = i >= 7
        if (!slot) {
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full rounded-sm bg-bg-hover" style={{ height: '4px' }} />
              {i === 0 || i === 7 ? (
                <span className="text-[9px] text-muted rotate-0 whitespace-nowrap">
                  {fmtDate((() => { const d = new Date(today); d.setDate(d.getDate() - (13 - i)); return d.toISOString().slice(0, 10) })())}
                </span>
              ) : <span className="text-[9px] text-transparent">·</span>}
            </div>
          )
        }
        const pct  = slot.avgScore / max
        const h    = Math.max(8, Math.round(pct * 88))
        const color = slot.avgScore >= 75 ? 'bg-green-500' : slot.avgScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
        const opacity = isThisWeek ? 'opacity-100' : 'opacity-40'
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
              <div className="bg-bg-surface border border-line rounded px-2 py-1 text-[10px] whitespace-nowrap">
                <span className="text-text-primary font-mono">{slot.avgScore}</span>
                <span className="text-muted ml-1">({slot.count}×)</span>
              </div>
            </div>
            <div
              className={`w-full rounded-t-sm ${color} ${opacity} transition-all`}
              style={{ height: `${h}px` }}
            />
            {i === 0 || i === 7 ? (
              <span className="text-[9px] text-muted whitespace-nowrap">{fmtDate(slot.date)}</span>
            ) : <span className="text-[9px] text-transparent">·</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Pattern health row ────────────────────────────────────────────

function PatternHealthRow({ ps }: { ps: PatternStats }) {
  const meta      = PATTERN_META[ps.pattern]
  const trendIcon = ps.trend === 'improving' ? '↑' : ps.trend === 'declining' ? '↓' : '→'
  const trendColor = ps.trend === 'improving' ? 'text-green-400' : ps.trend === 'declining' ? 'text-red-400' : 'text-muted'
  const barColor  = ps.avgScore >= 75 ? 'bg-green-500' : ps.avgScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="font-mono text-xs font-bold w-10 text-text-primary">{ps.pattern}</span>
      <span className="text-xs text-muted w-36 hidden sm:block truncate">{meta.label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-bg-hover overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${ps.avgScore}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right text-text-primary">{ps.avgScore}</span>
      <span className={`text-xs w-4 text-center ${trendColor}`}>{trendIcon}</span>
      <span className="text-xs text-muted w-8 text-right">{ps.count}×</span>
    </div>
  )
}

// ── Focus box ─────────────────────────────────────────────────────

function FocusBox({ pattern, weakPoints }: { pattern: PatternType; weakPoints: WeakPoint[] }) {
  const meta = PATTERN_META[pattern]
  const gaps = weakPoints.filter(w => w.pattern === pattern)
  return (
    <div className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-blue-400 uppercase tracking-wider">Focus next week</span>
        <span className="font-mono text-xs font-bold text-blue-300 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded-full">
          {pattern}
        </span>
      </div>
      <p className="text-sm font-medium text-text-primary">{meta.label}</p>
      <p className="text-xs text-muted leading-relaxed">{meta.structure}</p>
      {gaps.length > 0 && (
        <p className="text-xs text-amber-400/80 mt-1">
          Recurring gap: <span className="font-medium capitalize">{gaps[0].gapComponent}</span>
          {' '}({gaps[0].occurrences}× missed)
        </p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function ReportPage() {
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/report')
      .then(r => { if (!r.ok) throw new Error('Failed to load report'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const weekLabel = (() => {
    const d = new Date()
    const start = new Date(d); start.setDate(d.getDate() - 6)
    return `${fmtDate(start.toISOString().slice(0, 10))} – ${fmtDate(d.toISOString().slice(0, 10))}`
  })()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-line flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h1 className="text-sm font-medium text-muted tracking-wide uppercase">Weekly Report</h1>
          <span className="text-xs text-muted ml-auto">{weekLabel}</span>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto flex flex-col gap-6">

            {error && (
              <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-400">{error}</div>
            )}

            {loading && (
              <p className="text-sm text-muted text-center py-12">Loading…</p>
            )}

            {data && <>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <SummaryCard
                  label="This week avg"
                  value={data.thisWeek.avgScore || '—'}
                  sub={<DeltaBadge delta={data.scoreDelta} />}
                />
                <SummaryCard
                  label="Utterances"
                  value={data.thisWeek.utteranceCount}
                  sub={
                    data.lastWeek.utteranceCount > 0
                      ? <span className="text-xs text-muted">vs {data.lastWeek.utteranceCount} last week</span>
                      : undefined
                  }
                />
                <SummaryCard
                  label="Sessions"
                  value={data.thisWeek.sessionCount}
                  sub={
                    data.lastWeek.sessionCount > 0
                      ? <span className="text-xs text-muted">vs {data.lastWeek.sessionCount} last week</span>
                      : undefined
                  }
                />
              </div>

              {/* Daily chart */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted uppercase tracking-wide">Score trend — 14 days</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted">
                    <span className="opacity-40">■ last week</span>
                    <span>■ this week</span>
                  </div>
                </div>
                <div className="rounded-xl bg-bg-card border border-line p-4">
                  <ScoreChart days={data.dailyScores} />
                </div>
              </section>

              {/* Pattern health */}
              {data.patternStats.length > 0 && (
                <section>
                  <p className="text-xs text-muted uppercase tracking-wide mb-3">Pattern health</p>
                  <div className="rounded-xl bg-bg-card border border-line divide-y divide-line overflow-hidden">
                    {data.patternStats.map(ps => <PatternHealthRow key={ps.pattern} ps={ps} />)}
                  </div>
                </section>
              )}

              {/* Top gaps */}
              {data.top3WeakPoints.length > 0 && (
                <section>
                  <p className="text-xs text-muted uppercase tracking-wide mb-3">Recurring gaps</p>
                  <div className="rounded-xl bg-bg-card border border-line divide-y divide-line overflow-hidden">
                    {data.top3WeakPoints.map((wp, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <span className="font-mono text-xs font-bold text-text-primary w-10">{wp.pattern}</span>
                        <span className="text-xs text-amber-400/90 flex-1 capitalize">{wp.gapComponent}</span>
                        <span className="text-xs text-muted">{wp.occurrences}× missed</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Focus recommendation */}
              {data.focusPattern && (
                <FocusBox pattern={data.focusPattern} weakPoints={data.top3WeakPoints} />
              )}

              {/* Empty state */}
              {data.thisWeek.utteranceCount === 0 && data.lastWeek.utteranceCount === 0 && (
                <div className="rounded-xl bg-bg-card border border-line p-8 text-center">
                  <p className="text-sm text-muted">No practice data yet. Start speaking to see your report.</p>
                </div>
              )}

            </>}

          </div>
        </div>
      </main>
    </div>
  )
}
