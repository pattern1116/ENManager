'use client'

// Wrap any text so a learner can double-click a word to look up its meaning.
// The double-click selects the word (native browser behaviour); we read the
// selection, fetch /api/define, and float a small popup under it.

import { useCallback, useEffect, useState } from 'react'

interface DefineEntry {
  partOfSpeech?: string
  definition: string
  example?: string
}
interface DefineData {
  word: string
  phonetic?: string
  entries: DefineEntry[]
  source: 'dictionary' | 'llm'
}

interface PopupState {
  x: number
  y: number
  word: string
}

export function Definable({
  children,
  className,
  as: Tag = 'span',
}: {
  children: React.ReactNode
  className?: string
  as?: 'span' | 'p' | 'div'
}) {
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [data, setData] = useState<DefineData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const lookup = useCallback(async () => {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const word = (sel?.toString() ?? '').trim().replace(/[^A-Za-z'-]/g, '')
    if (!word || word.length < 2) return

    const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null
    setPopup({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.bottom + 6 : 80,
      word,
    })
    setData(null)
    setErr(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/define?word=${encodeURIComponent(word)}`)
      const d = await res.json()
      if (res.ok && Array.isArray(d.entries) && d.entries.length > 0) setData(d)
      else setErr('No definition found.')
    } catch {
      setErr('Lookup failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Close on Escape.
  useEffect(() => {
    if (!popup) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopup(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popup])

  return (
    <>
      <Tag className={className} onDoubleClick={lookup}>
        {children}
      </Tag>
      {popup && (
        <WordPopup
          x={popup.x}
          y={popup.y}
          word={popup.word}
          loading={loading}
          data={data}
          err={err}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  )
}

function WordPopup({
  x,
  y,
  word,
  loading,
  data,
  err,
  onClose,
}: {
  x: number
  y: number
  word: string
  loading: boolean
  data: DefineData | null
  err: string | null
  onClose: () => void
}) {
  // Clamp horizontally so a word near the edge doesn't overflow the viewport.
  const W = 288
  const left =
    typeof window !== 'undefined'
      ? Math.min(Math.max(8, x - W / 2), window.innerWidth - W - 8)
      : x - W / 2

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-72 rounded-xl bg-bg-surface border border-line shadow-xl p-4 fade-up"
        style={{ left, top: y }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold text-text-primary truncate">{word}</span>
            {data?.phonetic && <span className="text-xs text-muted">{data.phonetic}</span>}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text-primary text-xs flex-shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-xs text-muted py-2">Looking up…</p>}
        {!loading && err && <p className="text-xs text-muted py-2">{err}</p>}
        {!loading && data && (
          <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto">
            {data.entries.map((e, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                {e.partOfSpeech && (
                  <span className="text-[10px] text-blue-400 italic">{e.partOfSpeech}</span>
                )}
                <p className="text-xs text-text-primary leading-relaxed">{e.definition}</p>
                {e.example && (
                  <p className="text-xs text-muted italic leading-relaxed">“{e.example}”</p>
                )}
              </div>
            ))}
            <p className="text-[10px] text-muted/70 pt-1 border-t border-line">
              {data.source === 'llm' ? 'AI definition' : 'dictionaryapi.dev'}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
