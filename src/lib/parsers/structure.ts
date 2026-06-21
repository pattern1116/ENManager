// ─────────────────────────────────────────────────────────────────
// Sentence Structure Parser
//
// Rule-based pre-analysis layer that runs BEFORE the LLM call.
// Gives the LLM a head start and lets us do quick local checks
// without a round-trip.
// ─────────────────────────────────────────────────────────────────

import type { PatternType, StructureGap } from '@/types'

// ── Keyword signals per pattern ───────────────────────────────────

const SIGNALS: Record<PatternType, { markers: RegExp[]; weight: number }> = {
  PRE: {
    markers: [
      /\bbecause\b/i,
      /\bfor example\b/i,
      /\bfor instance\b/i,
      /\bsuch as\b/i,
      /\bto illustrate\b/i,
      /\bspecifically\b/i,
    ],
    weight: 1,
  },
  SID: {
    markers: [
      /\bactually\b/i,
      /\bhonestly\b/i,
      /\bto be honest\b/i,
      /\bi think\b/i,
      /\bi believe\b/i,
      /\bin my opinion\b/i,
      /\bpersonally\b/i,
    ],
    weight: 1,
  },
  CE: {
    markers: [
      /\bso\b/i,
      /\btherefore\b/i,
      /\bas a result\b/i,
      /\bconsequently\b/i,
      /\bwhich means\b/i,
      /\bthis led to\b/i,
      /\bbecause of (this|that)\b/i,
    ],
    weight: 1,
  },
  CC: {
    markers: [
      /\bhowever\b/i,
      /\bon the other hand\b/i,
      /\balthough\b/i,
      /\bdespite\b/i,
      /\bwhile\b/i,
      /\beven though\b/i,
      /\bin contrast\b/i,
      /\bbut\b/i,
    ],
    weight: 1,
  },
  HO: {
    markers: [
      /\bi('d| would) say\b/i,
      /\bi think\b/i,
      /\bit seems (to me)?\b/i,
      /\bprobably\b/i,
      /\bmaybe\b/i,
      /\bperhaps\b/i,
      /\bkind of\b/i,
      /\bsort of\b/i,
    ],
    weight: 1,
  },
  UNKNOWN: { markers: [], weight: 0 },
}

// ── Gap detection heuristics ──────────────────────────────────────

const GAP_CHECKS: {
  pattern: PatternType
  component: string
  description: string
  isMissing: (text: string) => boolean
}[] = [
  // PRE gaps
  {
    pattern: 'PRE',
    component: 'reason',
    description: 'No reason is given for your point. Try adding "because…"',
    isMissing: t => !/\bbecause\b/i.test(t),
  },
  {
    pattern: 'PRE',
    component: 'example',
    description: 'No example is given. Try "For example…" or "For instance…"',
    isMissing: t =>
      !/\b(for example|for instance|such as|like|e\.g\.)\b/i.test(t),
  },
  // SID gaps
  {
    pattern: 'SID',
    component: 'signpost',
    description: 'No signpost phrase to flag your opinion. Try "Actually…" or "In my view…"',
    isMissing: t =>
      !/\b(actually|honestly|i think|i believe|in my|personally)\b/i.test(t),
  },
  {
    pattern: 'SID',
    component: 'detail',
    description: 'The idea is stated but not developed. Add a supporting detail.',
    isMissing: t => t.split(/[.!?]+/).filter(s => s.trim().length > 10).length < 2,
  },
  // CE gaps
  {
    pattern: 'CE',
    component: 'cause',
    description: 'The cause is unclear. What triggered the effect you described?',
    isMissing: t =>
      !/\b(because|due to|since|as a result of)\b/i.test(t) &&
      !/\b(so|therefore|consequently)\b/i.test(t),
  },
  // CC gaps
  {
    pattern: 'CC',
    component: 'contrast connector',
    description: 'No contrast connector found. Try "However," or "On the other hand,"',
    isMissing: t =>
      !/\b(however|but|although|on the other hand|in contrast|despite)\b/i.test(t),
  },
  // HO gaps
  {
    pattern: 'HO',
    component: 'hedge',
    description: 'The opinion lacks hedging. Soften it with "I\'d say…" or "It seems to me…"',
    isMissing: t =>
      !/\b(i('d| would) say|it seems|probably|maybe|perhaps|kind of)\b/i.test(t),
  },
  // Generic
  {
    pattern: 'UNKNOWN',
    component: 'clear subject',
    description: 'The sentence subject is unclear. Who or what is this about?',
    isMissing: t =>
      !/\b(i|we|they|it|he|she|the [a-z]+)\b/i.test(t.split(/[.!?]/)[0] ?? ''),
  },
]

// ── Main parser ───────────────────────────────────────────────────

export interface ParseResult {
  patternDetected: PatternType
  confidence: 'high' | 'medium' | 'low'
  signals: string[]            // which markers matched
  potentialGaps: StructureGap[]
}

export function parseStructure(text: string): ParseResult {
  const scores: Record<PatternType, number> = {
    PRE: 0,
    SID: 0,
    CE: 0,
    CC: 0,
    HO: 0,
    UNKNOWN: 0,
  }
  const matchedSignals: string[] = []

  for (const [pattern, { markers, weight }] of Object.entries(SIGNALS) as [PatternType, typeof SIGNALS[PatternType]][]) {
    for (const regex of markers) {
      const match = text.match(regex)
      if (match) {
        scores[pattern] += weight
        matchedSignals.push(match[0])
      }
    }
  }

  // Pick the winner
  const sorted = (Object.entries(scores) as [PatternType, number][])
    .filter(([p]) => p !== 'UNKNOWN')
    .sort(([, a], [, b]) => b - a)

  const [topPattern, topScore] = sorted[0]
  const [, secondScore] = sorted[1] ?? [null, 0]

  let patternDetected: PatternType = 'UNKNOWN'
  let confidence: ParseResult['confidence'] = 'low'

  if (topScore >= 2) {
    patternDetected = topPattern
    confidence = topScore >= 3 ? 'high' : 'medium'
  } else if (topScore === 1 && topScore > secondScore) {
    patternDetected = topPattern
    confidence = 'low'
  }

  // Gap detection
  const potentialGaps: StructureGap[] = GAP_CHECKS
    .filter(c => c.pattern === patternDetected || c.pattern === 'UNKNOWN')
    .filter(c => c.isMissing(text))
    .map(c => ({ component: c.component, description: c.description }))
    .slice(0, 3)  // max 3 gaps per utterance

  return { patternDetected, confidence, signals: [...new Set(matchedSignals)], potentialGaps }
}

// ── System prompt builder ─────────────────────────────────────────

export function buildAnalysisPrompt(
  text: string,
  parseResult: ParseResult,
  targetPattern?: PatternType,
): string {
  // When the utterance answers a practice prompt we tell the model which
  // structure the speaker was *aiming* for, so scoring/detection stays
  // anchored to the practice goal instead of drifting.
  const targetLine =
    targetPattern && targetPattern !== 'UNKNOWN'
      ? `\nThe speaker was practising the ${targetPattern} pattern — judge whether they actually used it.\n`
      : ''

  return `You are a speaking coach that analyzes English speech structure.

The user said: "${text}"
${targetLine}
Pre-analysis hints (may be wrong — override if needed):
- Likely pattern: ${parseResult.patternDetected} (confidence: ${parseResult.confidence})
- Signals found: ${parseResult.signals.join(', ') || 'none'}
- Potential gaps: ${parseResult.potentialGaps.map(g => g.component).join(', ') || 'none'}

Patterns to recognize:
- PRE: Point → Reason ("because") → Example ("for example")
- SID: Signpost ("actually", "I think") → Idea → Detail
- CE:  Cause → Effect ("so", "therefore", "as a result")
- CC:  Contrast Connector ("however", "although", "on the other hand")
- HO:  Hedging ("I'd say", "maybe") + Opinion
- UNKNOWN: doesn't fit any pattern

Scoring rubric — score the STRUCTURE, not the topic or vocabulary. Apply it consistently:
- 85-100: all components of the pattern are present, ordered, and clearly connected.
- 65-84:  the pattern is recognisable but one component is weak or implicit.
- 40-64:  a component is missing or the ordering is muddled.
- 0-39:   no usable structure; rambling or a single bare claim.
Be deterministic: the same utterance must always receive the same score.

Respond ONLY with a JSON object — no markdown, no preamble:
{
  "patternDetected": "PRE|SID|CE|CC|HO|UNKNOWN",
  "patternConfidence": "high|medium|low",
  "gapsFound": [
    { "component": "string", "description": "string" }
  ],
  "rewrite": "improved version of the utterance",
  "explanation": "1-2 sentences on what changed and why",
  "score": 0-100
}`
}
