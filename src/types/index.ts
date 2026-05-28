// ─────────────────────────────────────────────────────────────────
// Core domain types for AI Speaking Coach
// ─────────────────────────────────────────────────────────────────

// ── Patterns ──────────────────────────────────────────────────────

export type PatternType = 'PRE' | 'SID' | 'CE' | 'CC' | 'HO' | 'UNKNOWN'

export const PATTERN_META: Record<PatternType, { label: string; structure: string; color: string }> = {
  PRE: {
    label: 'Point → Reason → Example',
    structure: 'Make a point, back it with a reason, ground it with an example.',
    color: 'blue',
  },
  SID: {
    label: 'Signpost → Idea → Detail',
    structure: 'Signal your stance, state the idea, support with detail.',
    color: 'teal',
  },
  CE: {
    label: 'Cause → Effect',
    structure: 'Name the cause, show the consequence.',
    color: 'amber',
  },
  CC: {
    label: 'Contrast Connector',
    structure: 'State one view, contrast with another using a connector.',
    color: 'purple',
  },
  HO: {
    label: 'Hedging + Opinion',
    structure: 'Soften your claim, then state your position clearly.',
    color: 'coral',
  },
  UNKNOWN: {
    label: 'No pattern detected',
    structure: 'The utterance does not match a known structural pattern.',
    color: 'gray',
  },
}

// ── Feedback ──────────────────────────────────────────────────────

export interface StructureGap {
  component: string        // e.g. "reason", "example", "subject"
  description: string      // human-readable explanation of what's missing
}

export interface UtteranceFeedback {
  patternDetected: PatternType
  patternConfidence: 'high' | 'medium' | 'low'
  gapsFound: StructureGap[]
  rewrite: string          // improved version of the utterance
  explanation: string      // why the rewrite is better
  score: number            // 0–100 structural clarity score
}

// ── Session / DB ──────────────────────────────────────────────────

export interface Session {
  id: number
  createdAt: string
  utteranceCount?: number
  avgScore?: number
}

export interface Utterance {
  id: number
  sessionId: number
  text: string
  structureDetected: PatternType
  gapsFound: StructureGap[]
  rewriteShown: string
  patternUsed: PatternType
  score: number
  createdAt: string
}

// ── Recording state ───────────────────────────────────────────────

export type RecordingState = 'idle' | 'recording' | 'processing' | 'done' | 'error'

export interface RecordingResult {
  transcript: string
  audioBlob: Blob
  durationMs: number
}

// ── API payloads ──────────────────────────────────────────────────

export interface AnalyzeRequest {
  text: string
  sessionId?: number
}

export interface AnalyzeResponse {
  utteranceId: number
  sessionId: number
  transcript: string
  feedback: UtteranceFeedback
}

export interface TranscribeRequest {
  audio: FormData  // contains 'file' field
}

export interface TranscribeResponse {
  transcript: string
  durationMs: number
}

// ── Progress / stats ──────────────────────────────────────────────

export interface PatternStats {
  pattern: PatternType
  count: number
  avgScore: number
  trend: 'improving' | 'declining' | 'stable'
}

export interface WeakPoint {
  pattern: PatternType
  gapComponent: string
  occurrences: number
}

export interface ProgressReport {
  totalSessions: number
  totalUtterances: number
  overallAvgScore: number
  patternStats: PatternStats[]
  top3WeakPoints: WeakPoint[]
  recentImprovement: number   // score delta over last 7 days
}

// ── LLM / STT provider interfaces ────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMProvider {
  complete(messages: Message[], system: string): Promise<string>
  readonly name: string
}

export interface STTProvider {
  transcribe(audioBlob: Blob): Promise<string>
  readonly name: string
}

// ── Practice prompt (Phase 3/4) ───────────────────────────────────

export interface PracticePrompt {
  topic: string
  targetPattern: PatternType
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  timerSeconds: number
  hint?: string
}
