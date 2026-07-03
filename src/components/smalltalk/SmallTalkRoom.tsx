'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRecorder } from '@/hooks/useRecorder'
import { speak, stopSpeaking } from './speak'
import { nextSpeed, NORMAL_SPEED } from '@/lib/smalltalk/speed'
import { HINTS } from './hints'
import ReviewChat from './ReviewChat'
import type { SmallTalkSession } from '@/types'

// Lightweight past-conversation summary from GET /api/small-talk (no turns).
type StSummary = {
  id: number
  topic: string
  status: 'active' | 'done'
  createdAt: string
  userTurns: number
  preview: string
}

// The live conversation is deliberately text-free: the learner only listens,
// so the coach's words never appear. The screen state is a small machine. The
// "am I recording?" sub-state is read straight from the recorder (not tracked
// here) so the mic button can never get out of sync with the actual mic.
type Phase =
  | 'idle' // start screen
  | 'speaking' // coach audio playing — listen only
  | 'awaiting' // learner's turn (recording or not — see recorder.state)
  | 'thinking' // transcribing + generating reply
  | 'review' // conversation finished, show transcript
  | 'error'

export default function SmallTalkRoom() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  // A gentle "I didn't catch that" message shown on the learner's turn when a
  // recording came back empty — so an unheard answer never looks like the app
  // just ignored them. Cleared the moment they start speaking again.
  const [notice, setNotice] = useState<string | null>(null)
  const [reviewSession, setReviewSession] = useState<SmallTalkSession | null>(null)
  // Past conversations, shown on the idle screen so finished chats can be
  // reopened and reviewed later like a message history.
  const [history, setHistory] = useState<StSummary[]>([])
  // Live caption of the learner's speech. TEMPORARILY DISABLED: the growing-
  // audio re-transcription hammered the single-threaded STT server (its
  // /transcribe blocks the event loop), which delayed the real transcription
  // and the reply. Kept as '' so the caption block stays hidden; will be
  // re-enabled with a design that doesn't contend with the final transcribe.
  const [liveText, setLiveText] = useState('')

  const sessionIdRef = useRef<number | null>(null)
  // Sticky speaking pace for the coach. The learner can ask out loud to slow
  // down ("speak slower") or speed back up; we detect it from each transcript
  // and keep the chosen pace for the rest of the session.
  const speedRef = useRef<number>(NORMAL_SPEED)
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/small-talk')
      const data = await res.json()
      if (res.ok) setHistory(data.sessions ?? [])
    } catch {
      // A missing history list is non-fatal — the learner can still start a chat.
    }
  }, [])

  // Populate the list on first load; resetAll refreshes it after each chat.
  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const loadReview = useCallback(async (id: number) => {
    const res = await fetch(`/api/small-talk/${id}`)
    const data = await res.json()
    if (res.ok && data.session) {
      setReviewSession(data.session)
      setPhase('review')
    } else {
      setError(data.error ?? 'Could not load the conversation.')
      setPhase('error')
    }
  }, [])

  // Recorder fires this with the finished audio blob. Transcribe → reply.
  const handleAudio = useCallback(
    async (blob: Blob) => {
      const sessionId = sessionIdRef.current
      if (sessionId == null) return
      setPhase('thinking')
      setLiveText('')
      try {
        const fd = new FormData()
        fd.append('audio', blob, 'turn.webm')
        const tRes = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const tData = await tRes.json().catch(() => ({}))
        const userText: string = (tData.transcript ?? '').trim()
        if (!tRes.ok) {
          // Transcription itself failed — tell them, don't fail the session.
          setNotice('지금 잘 안 들렸어요. 잠시 후 다시 말해 주세요.')
          setPhase('awaiting')
          return
        }
        if (!userText) {
          // Heard nothing usable — likely too quiet/short. Ask for a retry.
          setNotice('못 알아들었어요 — 버튼을 누르고 조금 더 또렷하게 다시 말해 주세요.')
          setPhase('awaiting')
          return
        }
        setNotice(null)

        // Did they ask the coach to change pace? Apply it to this reply onward.
        speedRef.current = nextSpeed(userText, speedRef.current)

        const rRes = await fetch('/api/small-talk/reply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, userText }),
        })
        const rData = await rRes.json()
        if (!rRes.ok) {
          setError(rData.error ?? 'Something went wrong.')
          setPhase('error')
          return
        }

        setPhase('speaking')
        await speak(rData.text, speedRef.current)

        if (rData.done) {
          await loadReview(sessionId)
        } else {
          setPhase('awaiting')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        setPhase('error')
      }
    },
    [loadReview],
  )

  const recorder = useRecorder(handleAudio)
  const recording = recorder.state === 'recording'

  // Keep refs in sync for the (window-level) key handler.
  const recordingRef = useRef(recording)
  recordingRef.current = recording

  // Surface a mic failure instead of leaving the learner on a dead screen.
  useEffect(() => {
    if (recorder.state === 'error' && phaseRef.current === 'awaiting') {
      setError(recorder.error ?? '마이크를 사용할 수 없어요. 권한을 확인해 주세요.')
      setPhase('error')
    }
  }, [recorder.state, recorder.error])

  const handleStart = useCallback(async () => {
    setError(null)
    setNotice(null)
    speedRef.current = NORMAL_SPEED
    setPhase('speaking')
    try {
      const res = await fetch('/api/small-talk/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not start.')
        setPhase('error')
        return
      }
      sessionIdRef.current = data.sessionId
      await speak(data.text)
      setPhase('awaiting')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start.')
      setPhase('error')
    }
  }, [])

  const startRecording = useCallback(() => {
    setError(null)
    setNotice(null)
    setLiveText('')
    void recorder.start()
  }, [recorder])

  const stopRecording = useCallback(() => {
    recorder.stop()
    // handleAudio drives the next phase once the blob arrives.
  }, [recorder])

  // Spacebar: start talking when it's your turn, stop when you're recording.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (phaseRef.current !== 'awaiting') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      e.preventDefault()
      if (recordingRef.current) stopRecording()
      else startRecording()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startRecording, stopRecording])

  // Stop any audio if the user leaves the page.
  useEffect(() => () => stopSpeaking(), [])

  const resetAll = useCallback(() => {
    stopSpeaking()
    recorder.reset()
    sessionIdRef.current = null
    speedRef.current = NORMAL_SPEED
    setReviewSession(null)
    setError(null)
    setNotice(null)
    setLiveText('')
    setPhase('idle')
    void loadHistory()
  }, [recorder, loadHistory])

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        >
          ← Back to Coach
        </Link>
        <span
          className="text-sm font-semibold tracking-wide uppercase"
          style={{ color: 'var(--accent)' }}
        >
          Small Talk
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        {phase === 'idle' && (
          <IdleScreen onStart={handleStart} history={history} onOpen={loadReview} />
        )}

        {(phase === 'speaking' || phase === 'awaiting' || phase === 'thinking') && (
          <LiveScreen
            phase={phase}
            recording={recording}
            notice={phase === 'awaiting' ? notice : null}
            liveText={recording ? liveText : ''}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
          />
        )}

        {phase === 'review' && reviewSession && (
          <ReviewChat session={reviewSession} onRestart={resetAll} />
        )}

        {phase === 'error' && (
          <div className="text-center max-w-md">
            <p className="mb-6" style={{ color: 'var(--danger)' }}>
              {error ?? '문제가 발생했어요.'}
            </p>
            <button
              onClick={resetAll}
              className="px-6 py-3 rounded-full font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              Start over
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Sub-screens ────────────────────────────────────────────────────

function IdleScreen({
  onStart,
  history,
  onOpen,
}: {
  onStart: () => void
  history: StSummary[]
  onOpen: (id: number) => void
}) {
  return (
    <div className="text-center max-w-lg fade-up">
      <div
        className="w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center text-4xl"
        style={{ background: 'var(--bg-hover)' }}
      >
        ☕️
      </div>
      <h1 className="text-3xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        스몰톡 연습
      </h1>
      <p className="mb-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        시작 버튼을 누르면 코치가 가벼운 주제로 말을 걸어요.
        <br />
        화면에는 아무것도 나오지 않아요 — <b>듣기만 하세요.</b>
      </p>
      <p className="mb-10 text-sm" style={{ color: 'var(--text-muted)' }}>
        다 들은 뒤 자연스럽게 영어로 대답하면 됩니다.
      </p>
      <button
        onClick={onStart}
        className="px-8 py-4 rounded-full font-semibold text-white text-lg shadow-lg hover:opacity-90 transition-opacity"
        style={{ background: 'var(--accent)' }}
      >
        Start Small Talk
      </button>

      {history.length > 0 && <HistoryList history={history} onOpen={onOpen} />}
    </div>
  )
}

// Past conversations, newest first — tap to reopen the full transcript.
function HistoryList({
  history,
  onOpen,
}: {
  history: StSummary[]
  onOpen: (id: number) => void
}) {
  return (
    <div className="mt-12 text-left">
      <p
        className="text-xs uppercase tracking-wide mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        지난 대화
      </p>
      <div className="space-y-2">
        {history.map(s => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className="w-full text-left px-4 py-3 rounded-xl hover:opacity-90 transition-opacity"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {s.topic || 'small talk'}
              </span>
              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                {formatDate(s.createdAt)}
              </span>
            </div>
            {s.preview && (
              <p className="text-sm mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                {s.preview}
              </p>
            )}
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {s.userTurns}턴{s.status === 'active' ? ' · 미완료' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// The DB stores UTC datetimes ("YYYY-MM-DD HH:MM:SS"); render as local date.
function formatDate(raw: string): string {
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function LiveScreen({
  phase,
  recording,
  notice,
  liveText,
  onStartRecording,
  onStopRecording,
}: {
  phase: 'speaking' | 'awaiting' | 'thinking'
  recording: boolean
  notice: string | null
  liveText: string
  onStartRecording: () => void
  onStopRecording: () => void
}) {
  const label =
    phase === 'speaking'
      ? '코치가 말하고 있어요 — 잘 들어보세요'
      : phase === 'thinking'
        ? '생각하는 중…'
        : recording
          ? '듣는 중… 다 말했으면 멈추기를 누르세요'
          : notice
            ? notice
            : '이제 영어로 대답해 보세요'

  const orbColor = recording ? 'var(--danger)' : 'var(--accent)'
  const orbIcon =
    phase === 'speaking' ? '🔊' : phase === 'thinking' ? '…' : recording ? '🎙️' : '👂'

  return (
    <div className="w-full max-w-xl flex flex-col items-center fade-up">
      {/* Listening / speaking orb */}
      <div className="relative w-40 h-40 flex items-center justify-center mb-8">
        <div
          className={phase === 'thinking' ? '' : 'listen-orb'}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: orbColor,
            opacity: 0.18,
          }}
        />
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center text-3xl"
          style={{ background: 'var(--bg-card)', color: orbColor, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}
        >
          {orbIcon}
        </div>
      </div>

      <p
        className="text-lg font-medium mb-8 text-center"
        style={{ color: notice && !recording ? 'var(--danger)' : 'var(--text-primary)' }}
      >
        {label}
      </p>

      {/* Live caption of the learner's own speech while recording (disabled) */}
      {recording && liveText && (
        <div className="w-full max-w-lg min-h-[3.5rem] mb-8 px-4 text-center">
          <p
            className="text-xl leading-relaxed"
            style={{ color: liveText ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {liveText || '말하는 내용이 여기에 실시간으로 표시돼요…'}
          </p>
        </div>
      )}

      {/* Mic control — only on the learner's turn */}
      {phase === 'awaiting' && !recording && (
        <button
          onClick={onStartRecording}
          className="px-8 py-4 rounded-full font-semibold text-white shadow-lg hover:opacity-90 transition-opacity mb-10"
          style={{ background: 'var(--accent)' }}
        >
          Start speaking <span className="opacity-70 text-sm">(or Space)</span>
        </button>
      )}
      {phase === 'awaiting' && recording && (
        <button
          onClick={onStopRecording}
          className="px-8 py-4 rounded-full font-semibold text-white shadow-lg hover:opacity-90 transition-opacity mb-10"
          style={{ background: 'var(--danger)' }}
        >
          Stop <span className="opacity-70 text-sm">(or Space)</span>
        </button>
      )}
      {(phase === 'speaking' || phase === 'thinking') && <div className="mb-10 h-[60px]" />}

      {/* Hint phrases the learner can say */}
      <div className="w-full">
        <p className="text-xs uppercase tracking-wide mb-3 text-center" style={{ color: 'var(--text-muted)' }}>
          막히면 이렇게 말해보세요
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {HINTS.map(h => (
            <div
              key={h.en}
              className="px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              title={h.ko}
            >
              <span style={{ color: 'var(--text-primary)' }}>{h.en}</span>
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {h.ko}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
