// ─────────────────────────────────────────────────────────────────
// Core domain types for AI Speaking Coach
// ─────────────────────────────────────────────────────────────────

// ── Patterns ──────────────────────────────────────────────────────

export type PatternType = 'PRE' | 'SID' | 'CE' | 'CC' | 'HO' | 'UNKNOWN'

export const PATTERN_META: Record<PatternType, {
  label: string         // the step sequence, e.g. "Signpost → Idea → Detail"
  structure: string     // one-line summary
  color: string
  steps: string[]       // each step, with a short gloss
  example: string       // a worked example sentence
}> = {
  PRE: {
    label: 'Point → Reason → Example',
    structure: 'Make a point, back it with a reason, ground it with an example.',
    color: 'blue',
    steps: [
      'Point — state your claim up front',
      'Reason — say why ("because…")',
      'Example — make it concrete ("For example…")',
    ],
    example: 'Remote work suits me better. Because I focus best without interruptions. For example, I finished a whole report in one quiet morning.',
  },
  SID: {
    label: 'Signpost → Idea → Detail',
    structure: 'Signal your stance, state the idea, support with detail.',
    color: 'teal',
    steps: [
      'Signpost — flag what\'s coming ("Honestly," / "I think…")',
      'Idea — state one clear idea',
      'Detail — add a specific supporting detail',
    ],
    example: 'Honestly, I think meetings are overused. Most of what we cover could be a two-line message.',
  },
  CE: {
    label: 'Cause → Effect',
    structure: 'Name the cause, show the consequence.',
    color: 'amber',
    steps: [
      'Cause — name what happened',
      'Effect — show the consequence ("…so…" / "…which means…")',
    ],
    example: 'Because I slept badly, I made careless decisions all afternoon.',
  },
  CC: {
    label: 'Contrast Connector',
    structure: 'State one view, contrast with another using a connector.',
    color: 'purple',
    steps: [
      'First view — state one side',
      'Connector — pivot ("However," / "On the other hand,")',
      'Second view — state the contrasting side',
    ],
    example: 'Startups move fast. However, big companies offer far more stability.',
  },
  HO: {
    label: 'Hedging + Opinion',
    structure: 'Soften your claim, then state your position clearly.',
    color: 'coral',
    steps: [
      'Hedge — soften first ("I\'d say…" / "In my view…")',
      'Opinion — then commit to a clear position',
    ],
    example: 'I\'d say the biggest problem is unclear ownership — no one knows who decides.',
  },
  UNKNOWN: {
    label: 'No pattern detected',
    structure: 'The utterance does not match a known structural pattern.',
    color: 'gray',
    steps: ['Pick one clear structure and follow it from start to finish.'],
    example: '',
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
  targetPattern?: PatternType   // when the utterance answers a practice prompt
}

// Result of comparing a practice utterance against its target pattern.
export interface PracticeResult {
  targetPattern: PatternType
  detectedPattern: PatternType
  hit: boolean              // did the detected pattern match the target?
  message: string          // short, human-readable verdict
}

export interface AnalyzeResponse {
  utteranceId: number
  sessionId: number
  transcript: string
  feedback: UtteranceFeedback
  practiceResult?: PracticeResult | null   // present only for practice utterances
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

export interface CompletionOptions {
  temperature?: number
}

export interface LLMProvider {
  complete(messages: Message[], system: string, opts?: CompletionOptions): Promise<string>
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
