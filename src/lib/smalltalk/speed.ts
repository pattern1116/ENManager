// Detect, from what the learner just said, whether they asked the coach to
// change its speaking pace — and return the new sticky speed multiplier.
//
// The transcript is matched directly (no LLM), so the request always lands the
// moment it's heard. Speed is a multiplier on Kokoro's normal pace: 1 = normal,
// lower = slower. It's clamped to [SLOWEST, 1] and steps by STEP so repeated
// "even slower" requests keep slowing down. "faster" / "normal speed" walk it
// back toward 1. When no pace request is heard, `current` is returned unchanged.

export const NORMAL_SPEED = 1
export const SLOWEST_SPEED = 0.5
const STEP = 0.25

// "slower", "say slowly", "could you say slowly", "slow down", "too fast", 천천히 …
// The speak/say/talk branch allows a few words in between ("say it more slowly",
// "could you talk a bit slower") so natural phrasings still land.
const SLOWER =
  /\b(?:slower|slowly|slow down)\b|(?:speak|talk|say)(?:\s+\w+){0,3}\s+slow(?:ly|er)?\b|\btoo fast\b|\bnot so fast\b|천천히|느리게/i

// "faster", "speed up", "normal speed", "speak normally", "too slow", 빠르게 …
const FASTER =
  /\b(?:faster|speed up|too slow|normal speed|normal pace|(?:speak|talk)\s+normally)\b|빠르게|정상 속도|원래 속도/i

export function nextSpeed(transcript: string, current: number): number {
  if (!transcript) return current
  const t = transcript.toLowerCase()
  // Check "faster" first so phrases like "too slow" resolve to speeding up.
  if (FASTER.test(t)) return Math.min(NORMAL_SPEED, round(current + STEP))
  if (SLOWER.test(t)) return Math.max(SLOWEST_SPEED, round(current - STEP))
  return current
}

// Keep values clean (avoid 0.7499999…) so they're tidy in the request body.
function round(n: number): number {
  return Math.round(n * 100) / 100
}
