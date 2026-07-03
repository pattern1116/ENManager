// ─────────────────────────────────────────────────────────────────
// Small Talk prompts
//
// Three LLM jobs, each returning a small JSON object:
//   1. opener   — invent a fresh everyday topic + a spoken opening line
//   2. reply    — continue the conversation, decide when to wrap up
//   3. revise   — rewrite ONE user turn, preserving their level + intent
//
// Everything the assistant says is read aloud by TTS and never shown on
// screen during the live conversation, so replies must sound natural when
// spoken: short, warm, one idea at a time, ending on a question until it's
// time to close.
// ─────────────────────────────────────────────────────────────────

import type { SmallTalkTurn } from '@/types'

// A light, consistent persona so the coach can hold up its own side of the
// chat — share opinions, react, and introduce itself by name — instead of only
// interviewing the learner. Kept minimal (just a name) so the local model
// doesn't invent contradictory life details across turns.
export const COACH_NAME = 'Alex'
const PERSONA = `You are ${COACH_NAME}, a warm, friendly native English speaker`

// Pull the first balanced {...} object out of a model response. The local
// Gemma sometimes wraps JSON in prose or ```json fences; this tolerates both.
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    // fall through to brace scan
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function coerceText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

// Does the learner's turn signal they want to end the conversation? The local
// model is unreliable about honouring "wrap up when they say goodbye", so the
// route uses this as a safety net to force a warm closing regardless. Phrase
// patterns (not lone words like "go") keep false positives low.
// "go" not followed by a phrasal continuation ("go over/through/on/ahead/back"
// = reviewing/continuing, not leaving) so "I need to go over my notes" is kept.
const GO = String.raw`go(?!\s+(?:over|through|on|ahead|back))`
const FAREWELL_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bi (?:have|need|gotta|have got|'?ve got) to (?:${GO}|leave|run|head (?:off|out)|get going)\b`),
  new RegExp(String.raw`\bi (?:should|better|gotta|need to|have to) (?:${GO}|leave|get going|be going|head (?:off|out))\b`),
  new RegExp(String.raw`\bi'?m (?:gonna|going to) (?:${GO}|leave|head (?:off|out)|get going)\b`),
  /\bgotta (?:go|run|leave)\b/,
  /\b(?:let'?s|we should|can we) (?:stop|wrap (?:this |it )?up|end|finish)(?: (?:here|now|up))?\b/,
  /\bthat'?s (?:all|it)(?: for (?:now|today))?\b/,
  /\b(?:bye|goodbye|good bye|see you(?: later)?|see ya|talk (?:to you )?later|catch you later|take care)\b/,
  /\bi'?m done\b/,
  /\bnice (?:talking|chatting|speaking) (?:to|with) you\b/,
]

export function wantsToEnd(userText: string): boolean {
  const t = userText.toLowerCase()
  return FAREWELL_PATTERNS.some(re => re.test(t))
}

// Roughly how many user replies a natural small-talk exchange aims for before
// it starts winding down. The model is told to head toward this but may close
// earlier if the conversation naturally reaches an end.
export const TARGET_USER_TURNS = 8

// Hard ceiling on user turns. The model's own `done` flag is unreliable (the
// local Gemma often keeps asking questions forever), so once the learner has
// spoken this many times we force a warm closing on the next reply regardless
// of what the model returns. Keeps every conversation to a finite, reviewable
// length instead of running on indefinitely.
export const MAX_USER_TURNS = 10

// ── 1. Opener ─────────────────────────────────────────────────────

export function buildOpenerPrompt(): { system: string; user: string } {
  const system = `${PERSONA} making small talk with someone who is practising their spoken English. You are about to start a brand-new casual conversation.

Pick ONE light, everyday small-talk topic (e.g. weekend plans, the weather, coffee, a hobby, weekend, food, holidays, pets, music). Avoid anything heavy, political, or personal-sensitive.

Then write a short spoken opening line: a friendly greeting plus ONE simple question to get them talking. You may briefly mention your own name or share a tiny bit about yourself if it feels natural. Keep it natural and easy — about the level of an everyday chat between acquaintances. One or two sentences, no more.

Respond with ONLY a JSON object, no other text:
{"topic": "<2-4 word label of the topic>", "opening": "<the spoken opening line>"}`
  const user = 'Start a new small-talk conversation.'
  return { system, user }
}

// ── 2. Reply ──────────────────────────────────────────────────────

// Render the running conversation as plain dialogue for the prompt context.
function renderHistory(turns: SmallTalkTurn[]): string {
  return turns
    .map(t => `${t.role === 'assistant' ? 'You' : 'Them'}: ${t.text}`)
    .join('\n')
}

export function buildReplyPrompt(
  topic: string,
  turns: SmallTalkTurn[],
  // When true this is the final exchange (the hard turn cap was reached): the
  // reply must be a warm closing with no new question, and the route forces
  // `done` regardless of what the model returns.
  finalTurn = false,
): { system: string; user: string } {
  const userTurnCount = turns.filter(t => t.role === 'user').length

  const pacing = finalTurn
    ? `- This is the FINAL exchange — the conversation has run its natural course. Give a warm, natural closing line that wraps things up nicely. Do NOT ask another question. Set "done" to true.`
    : `- A natural small talk lasts only a handful of exchanges. They have spoken ${userTurnCount} time(s) so far; head toward wrapping up around ${TARGET_USER_TURNS} turns.
- If the learner signals they want to leave or end the chat (e.g. "I have to go", "gotta go", "let's stop", "bye", "nice talking to you"), immediately give a warm, brief farewell with NO new question and set "done" to true — even if it's early.
- When it feels like a natural stopping point, give a warm closing line (no new question) and set "done" to true. Otherwise set "done" to false.`

  const system = `${PERSONA} having a casual small-talk conversation with someone practising spoken English. The topic is "${topic}".

Guidelines:
- Keep every reply SHORT and natural for speaking aloud — one or two sentences.
- Have a real TWO-WAY chat, not an interview. React to what they said AND share a little about yourself — your own opinion, feeling, or a small everyday experience. Talk like a person, not a question machine.
- Do NOT ask a question every turn. Often just respond or share something of your own; ask a follow-up only when it feels natural. Keep it balanced.
- Reciprocate what they share: if they tell you their name, introduce yourself as ${COACH_NAME}; if they share something personal, share something of your own back.
- Match their level: mirror roughly how simple or advanced their English is. If they speak simply, keep your words simple too. Never lecture or correct them.
- This is small talk, so stay light and friendly.
${pacing}

Respond with ONLY a JSON object, no other text:
{"reply": "<your spoken reply>", "done": <true or false>}`

  const user = `Conversation so far:\n${renderHistory(turns)}\n\nWrite your next reply as JSON.`
  return { system, user }
}

// ── 3. Revise ─────────────────────────────────────────────────────

export function buildRevisePrompt(
  userText: string,
  precedingAssistantText: string | null,
): { system: string; user: string } {
  const system = `You help an English learner by gently improving ONE thing they said in a small-talk conversation. Their words came through speech-to-text, so there may be small transcription glitches.

Produce a corrected, natural-sounding version of THEIR sentence that:
- Keeps their original meaning and what they were clearly trying to say.
- PRESERVES THEIR LEVEL. If they spoke at a simple (A2) level, the fix stays simple and everyday — do NOT rewrite it into advanced (C1/C2) English. Only fix grammar, word choice, and awkward phrasing so it sounds like a natural but still-simple version of what they said.
- Makes the smallest changes needed. If it was already fine, return it nearly unchanged.

Respond with ONLY a JSON object, no other text:
{"revised": "<the improved version of their sentence>"}`

  const context = precedingAssistantText
    ? `The other person had just said: "${precedingAssistantText}"\n\n`
    : ''
  const user = `${context}The learner said: "${userText}"\n\nReturn the improved version as JSON.`
  return { system, user }
}
