// Phrases the learner can SAY to the coach during the conversation. They are
// shown on screen (the coach's own words are not) as a safety net: if the
// learner gets lost, they can read one aloud and the coach will respond to it
// naturally — it's just another spoken turn.

export interface Hint {
  en: string
  ko: string
}

export const HINTS: Hint[] = [
  { en: 'Could you say that more slowly?', ko: '천천히 말해주세요' },
  { en: 'Sorry, could you repeat that?', ko: '다시 말해주세요' },
  { en: 'Could you say that in simpler words?', ko: '쉽게 말해주세요' },
  { en: 'What does that mean?', ko: '무슨 뜻이에요?' },
  { en: 'Let me think for a second.', ko: '잠깐 생각할게요' },
]
