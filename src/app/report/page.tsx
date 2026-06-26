'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { PATTERN_META } from '@/types'
import type { PatternType, PatternStats, WeakPoint } from '@/types'

// ── Types (mirror WeeklyReportData from db) ───────────────────────

interface DayScore  { date: string; avgScore: number; count: number }
interface ScoreBucket { date: string; avgScore: number; count: number }
interface ScoreTrends { daily: ScoreBucket[]; weekly: ScoreBucket[]; monthly: ScoreBucket[] }
interface WeekSummary { avgScore: number; utteranceCount: number; sessionCount: number }
interface ReportData {
  thisWeek: WeekSummary
  lastWeek: WeekSummary
  scoreDelta: number
  dailyScores: DayScore[]
  trends: ScoreTrends
  patternStats: PatternStats[]
  top3WeakPoints: WeakPoint[]
  focusPattern: PatternType | null
}

type Granularity = 'daily' | 'weekly' | 'monthly'

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

// ── Score trend (line chart) ──────────────────────────────────────
// Averaged into day / week / month buckets the user can toggle between.

function bandColor(score: number): string {
  return score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444'
}

function bucketLabel(date: string, g: Granularity): string {
  const d = new Date(date + 'T00:00:00')
  if (g === 'monthly') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  if (g === 'weekly')  return 'wk ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function bucketTooltip(date: string, b: ScoreBucket | null, g: Granularity): string {
  const span = g === 'monthly' ? 'month' : g === 'weekly' ? 'week' : 'day'
  if (!b) return `${bucketLabel(date, g)} · no practice this ${span}`
  return `${bucketLabel(date, g)} · avg ${b.avgScore} · ${b.count}× (${span})`
}

// How many continuous buckets to show per granularity, so the axis spans a
// fixed window (e.g. 14 days) with empty buckets shown as gaps — not just the
// handful of buckets that happen to have data.
const WINDOW: Record<Granularity, number> = { daily: 14, weekly: 8, monthly: 6 }

const DAY_MS = 86_400_000
const utcKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Continuous bucket-start keys (UTC, matching the server's date() buckets).
function buildSlots(g: Granularity): string[] {
  const now = new Date()
  const keys: string[] = []
  const n = WINDOW[g]
  if (g === 'monthly') {
    for (let i = n - 1; i >= 0; i--) {
      keys.push(utcKey(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)))
    }
    return keys
  }
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (g === 'weekly') {
    const sundayMs = todayMs - now.getUTCDay() * DAY_MS  // back to this week's Sunday
    for (let i = n - 1; i >= 0; i--) keys.push(utcKey(sundayMs - i * 7 * DAY_MS))
  } else {
    for (let i = n - 1; i >= 0; i--) keys.push(utcKey(todayMs - i * DAY_MS))
  }
  return keys
}

function ScoreTrendChart({ buckets, granularity }: { buckets: ScoreBucket[]; granularity: Granularity }) {
  const slots = buildSlots(granularity)
  const byDate = new Map(buckets.map(b => [b.date, b]))
  const points = slots.map(date => ({ date, b: byDate.get(date) ?? null }))
  const n = points.length

  if (buckets.length === 0) {
    return <p className="text-xs text-muted text-center py-6">No data in this range yet — keep practicing.</p>
  }

  const W = 600, H = 150
  const padL = 26, padR = 10, padT = 12, padB = 20
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const x = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW)
  const y = (s: number) => padT + (1 - Math.max(0, Math.min(100, s)) / 100) * innerH

  // Line connects only the buckets that have data (skipping empty days).
  const linePath = points
    .map((p, i) => (p.b ? `${x(i).toFixed(1)},${y(p.b.avgScore).toFixed(1)}` : null))
    .filter(Boolean)
    .join(' ')

  // Show at most ~6 x-axis labels so they don't overlap.
  const labelStep = Math.max(1, Math.ceil(n / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 150 }}>
      {/* Gridlines + y labels at 0/50/75/100 */}
      {[0, 50, 75, 100].map(v => (
        <g key={v}>
          <line
            x1={padL} x2={W - padR} y1={y(v)} y2={y(v)}
            stroke="currentColor" className="text-line" strokeWidth={1}
            strokeDasharray={v === 0 || v === 100 ? '0' : '3 3'}
          />
          <text x={padL - 6} y={y(v) + 3} textAnchor="end" fill="currentColor" className="text-text-secondary" fontSize={9}>{v}</text>
        </g>
      ))}

      {/* Trend line through the days that have data */}
      <polyline points={linePath} fill="none" stroke="#3b82f6" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Points + x labels across the full window */}
      {points.map((p, i) => (
        <g key={i}>
          {p.b && (
            <circle cx={x(i)} cy={y(p.b.avgScore)} r={2.5} fill={bandColor(p.b.avgScore)}>
              <title>{bucketTooltip(p.date, p.b, granularity)}</title>
            </circle>
          )}
          {(i % labelStep === 0 || i === n - 1) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" fill="currentColor" className="text-muted" fontSize={8}>
              {bucketLabel(p.date, granularity)}
            </text>
          )}
        </g>
      ))}
    </svg>
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

// ── Page ──────────────────────────────────────────────────────────

export default function ReportPage() {
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('daily')

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

              {/* Score trend — day / week / month */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted uppercase tracking-wide">Score trend</p>
                  <div className="flex items-center gap-1 text-[10px]">
                    {([['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month']] as const).map(([g, label]) => (
                      <button
                        key={g}
                        onClick={() => setGranularity(g)}
                        className={`px-2 py-0.5 rounded-full border transition-colors ${
                          granularity === g
                            ? 'border-blue-800/50 bg-blue-950/40 text-blue-300'
                            : 'border-line text-muted hover:text-text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-bg-card border border-line p-4">
                  <ScoreTrendChart buckets={data.trends[granularity]} granularity={granularity} />
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
