'use client'

import { useState } from 'react'
import type { SmallTalkSession, SmallTalkTurn } from '@/types'

// The post-conversation review: the whole chat laid out as bubbles. Tapping a
// user bubble reveals a level-preserving "revised" version, fetched lazily.
export default function ReviewChat({
  session,
  onRestart,
}: {
  session: SmallTalkSession
  onRestart: () => void
}) {
  return (
    <div className="w-full max-w-2xl fade-up">
      <div className="text-center mb-2">
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          대화 다시보기
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          주제: {session.topic} · 내 말풍선을 누르면 더 자연스러운 표현을 볼 수 있어요
        </p>
      </div>

      <div className="space-y-3 my-8">
        {session.turns.map(turn =>
          turn.role === 'assistant' ? (
            <CoachBubble key={turn.id} text={turn.text} />
          ) : (
            <UserBubble key={turn.id} turn={turn} />
          ),
        )}
      </div>

      <div className="text-center">
        <button
          onClick={onRestart}
          className="px-6 py-3 rounded-full font-medium text-white hover:opacity-90 transition-opacity"
          style={{ background: 'var(--accent)' }}
        >
          Start a new Small Talk
        </button>
      </div>
    </div>
  )
}

function CoachBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      >
        {text}
      </div>
    </div>
  )
}

function UserBubble({ turn }: { turn: SmallTalkTurn }) {
  const [revised, setRevised] = useState<string | null>(turn.revised)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const handleClick = async () => {
    setOpen(o => !o)
    if (revised || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/small-talk/revise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ turnId: turn.id }),
      })
      const data = await res.json()
      if (res.ok) setRevised(data.revised)
    } finally {
      setLoading(false)
    }
  }

  const changed = revised && revised.trim() !== turn.text.trim()

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleClick}
        className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-sm text-left text-white hover:opacity-95 transition-opacity cursor-pointer"
        style={{ background: 'var(--accent)' }}
        title="Tap to see a more natural version"
      >
        {turn.text}
        <span className="block text-[11px] mt-1 opacity-75">
          {open ? '▲ Hide natural version' : '▼ See a more natural version'}
        </span>
      </button>

      {open && (
        <div
          className="max-w-[80%] mt-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--bg-card)', border: '1px dashed var(--accent)', color: 'var(--text-primary)' }}
        >
          {loading && <span style={{ color: 'var(--text-muted)' }}>다듬는 중…</span>}
          {!loading && revised && (
            <>
              <span className="block text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>
                이렇게 말하면 더 자연스러워요
              </span>
              {revised}
              {!changed && (
                <span className="block text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  이미 자연스럽게 말했어요 👍
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
