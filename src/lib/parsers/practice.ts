import type { PatternType, PracticePrompt, PatternStats } from '@/types'

// ── Tiered topic banks ────────────────────────────────────────────
// Tier reflects abstractness/complexity, not domain — every tier mixes
// daily life, work, and society so practice stays broad, not just "work talk".

type Tier = 'beginner' | 'intermediate' | 'advanced'

const PATTERN_TOPICS: Record<PatternType, Record<Tier, string[]>> = {
  PRE: {
    beginner: [
      'Why you prefer working from home',
      'Why morning routines matter',
      'Why reading beats scrolling before bed',
      'Why exercise improves your mood',
      'Why cooking at home is worth the effort',
      'Why you like (or dislike) living in a big city',
      'Why learning to say no is important',
      'Why travelling changes how you see things',
      'Why a good night\'s sleep matters more than people think',
      'Why keeping a hobby outside work is healthy',
      'Why small daily habits beat big resolutions',
      'Why you\'d recommend your favourite book or show',
    ],
    intermediate: [
      'Why you chose your current career path',
      'Why async communication beats back-to-back meetings',
      'Why mentorship accelerates growth',
      'Why side projects teach faster than courses',
      'Why feedback culture shapes a team',
      'Why learning a second language is worth the struggle',
      'Why saving early matters more than earning more',
      'Why first impressions are hard to undo',
      'Why deadlines can improve creativity',
      'Why community matters when you move somewhere new',
      'Why most New Year goals fail by February',
      'Why curiosity ages better than ambition',
    ],
    advanced: [
      'Why psychological safety predicts team performance',
      'Why optimising for optionality can be worse than committing',
      'Why the best engineers write the least code',
      'Why "strong opinions loosely held" is a flawed heuristic',
      'Why breadth and depth of skill compound differently',
      'Why convenience quietly reshapes what we value',
      'Why measuring something changes the behaviour it measures',
      'Why nostalgia distorts how we judge the present',
      'Why scarcity, not abundance, drives most innovation',
      'Why the stories a culture tells shape its economy',
      'Why expertise can make you worse at explaining',
      'Why comfort is the enemy of long-term growth',
    ],
  },
  SID: {
    beginner: [
      'Your take on remote-first companies',
      'Whether social media does more harm than good',
      'Your opinion on the four-day work week',
      'Your view on open-plan offices',
      'Whether AI will replace creative jobs',
      'Your take on tipping culture',
      'Whether it\'s better to rent or to buy',
      'Your opinion on working with friends',
      'Whether cities or the countryside suit you better',
      'Your view on giving kids smartphones early',
      'Whether breakfast is really the most important meal',
      'Your take on keeping work and personal life separate',
    ],
    intermediate: [
      'Whether generalists or specialists win in the long run',
      'Your view on hiring for potential vs. proven track record',
      'Whether code reviews slow teams down or speed them up',
      'Your take on estimating software projects',
      'Whether some technical debt is worth taking on',
      'Your view on whether money can buy happiness',
      'Whether remote work weakens company culture',
      'Your take on cancel culture',
      'Whether honesty is always the best policy at work',
      'Your view on whether talent or hard work matters more',
      'Whether competition or collaboration drives better results',
      'Your take on trading privacy for convenience',
    ],
    advanced: [
      'Whether radical transparency builds trust or noise',
      'Your view on the autonomy–alignment trade-off at scale',
      'Whether consensus decisions beat top-down ones',
      'Your take on why most productivity systems fail',
      'Whether great leaders are made or self-selected',
      'Your view on whether free will survives neuroscience',
      'Whether meritocracy is real or a comforting story',
      'Your take on whether technology is politically neutral',
      'Whether long-termism is wisdom or an excuse to avoid the present',
      'Your view on whether art needs to be useful',
      'Whether a society should optimise for fairness or growth',
      'Your take on whether ageing is a problem to be solved',
    ],
  },
  CE: {
    beginner: [
      'Why poor sleep affects your decisions',
      'How a long commute affects work-life balance',
      'Why unclear messages cause project delays',
      'How skipping breaks lowers your output',
      'Why vague goals create friction in a team',
      'How regular exercise changes your energy',
      'Why background noise affects concentration',
      'How learning to cook changes your eating habits',
      'Why a cluttered space affects your focus',
      'How saying yes too often leads to burnout',
      'Why a good playlist changes a workout',
      'How travelling alone changes your confidence',
    ],
    intermediate: [
      'How learning a language changes how you think',
      'Why early architecture decisions constrain a product for years',
      'How a culture of blame hides real problems',
      'Why misaligned incentives cause coordination failures',
      'How too many meetings erode deep work',
      'Why social comparison fuels dissatisfaction',
      'How automation reshapes which skills are valued',
      'Why anonymity changes how people behave online',
      'How your childhood environment shapes risk tolerance',
      'Why price changes how we perceive quality',
      'How remote work reshapes city economies',
      'Why small delays compound into missed deadlines',
    ],
    advanced: [
      'Why Conway\'s Law ties org structure to system design',
      'How survivorship bias distorts our models of success',
      'Why local efficiency can degrade global throughput',
      'How second-order thinking changes the problems you notice',
      'Why short feedback loops produce different behaviour than long ones',
      'How an abundance of information can reduce understanding',
      'Why incentives quietly rewrite an organisation\'s values',
      'How a metric becomes a target and then stops working',
      'Why decentralisation shifts where power actually accumulates',
      'How a generation\'s defining crisis shapes its economics',
      'Why optimising under uncertainty often increases fragility',
      'How the language available to us limits the thoughts we form',
    ],
  },
  CC: {
    beginner: [
      'In-person meetings vs. video calls',
      'Big companies vs. startups',
      'Planning carefully vs. acting quickly',
      'Texting vs. calling',
      'Specialising deeply vs. learning broadly',
      'Saving money vs. spending on experiences',
      'Living in the city vs. the countryside',
      'Working alone vs. working in a team',
      'Following a routine vs. staying flexible',
      'Buying new vs. buying second-hand',
      'Early bird vs. night owl',
      'Reading the book vs. watching the adaptation',
    ],
    intermediate: [
      'Move fast and break things vs. move deliberately',
      'Strong culture vs. maximum autonomy',
      'Building in-house vs. buying off-the-shelf',
      'Consensus vs. decisive leadership',
      'Short-term velocity vs. long-term maintainability',
      'Job security vs. high growth and high risk',
      'Optimising for happiness vs. optimising for meaning',
      'A generalist career vs. a specialist career',
      'Transparency vs. privacy in organisations',
      'Intrinsic motivation vs. external rewards',
      'A few deep friendships vs. many broad ones',
      'Discipline vs. inspiration as a creative engine',
    ],
    advanced: [
      'Explicit process vs. implicit culture as alignment',
      'Centralised platform teams vs. autonomous squads',
      'Exploring new markets vs. deepening an existing moat',
      'Hiring for culture fit vs. culture add',
      'Meritocracy as motivation vs. as justification for inequality',
      'Optimising for fairness vs. optimising for growth',
      'Individual liberty vs. collective welfare',
      'Innovation vs. regulation in emerging tech',
      'Preserving tradition vs. embracing change',
      'Centralised vs. decentralised decision-making in society',
      'Optimising the average vs. protecting the worst-off',
      'Human judgement vs. algorithmic decision-making',
    ],
  },
  HO: {
    beginner: [
      'The biggest challenge in your industry',
      'The most underrated everyday skill',
      'What makes a good friend',
      'The best way to handle a disagreement',
      'What "being productive" really means to you',
      'The most overrated piece of common advice',
      'What makes a place feel like home',
      'The best decision you\'ve made this year',
      'What you wish you\'d learned earlier',
      'The most useful habit you\'ve built',
      'What makes a good conversation',
      'The hardest part of learning a language',
    ],
    intermediate: [
      'The most important thing most people neglect at work',
      'What separates a good design from a great one',
      'The real reason most launches underperform',
      'What makes someone genuinely hard to work with',
      'The skill that matters most in a new role\'s first 90 days',
      'The most misunderstood idea in your field',
      'What money can and can\'t actually buy',
      'The biggest myth about success',
      'What makes feedback land or fail',
      'What people get wrong about motivation',
      'What separates confidence from arrogance',
      'The hardest trade-off in growing up',
    ],
    advanced: [
      'The biggest failure mode in leadership',
      'What companies get wrong about scaling culture',
      'Why the hardest problems in tech aren\'t technical',
      'What distinguishes judgement from intelligence',
      'How smart teams talk themselves into bad decisions',
      'The most dangerous assumption in your field',
      'What progress quietly costs us',
      'The limits of data in making good decisions',
      'What a society reveals by what it refuses to measure',
      'The most defensible thing you believe that others don\'t',
      'Where expertise stops helping and starts hurting',
      'What freedom actually requires to be meaningful',
    ],
  },
  UNKNOWN: {
    beginner:     ['Describe a recent challenge you overcame'],
    intermediate: ['Talk about a decision you would make differently now'],
    advanced:     ['Explain something widely believed that you think is wrong'],
  },
}

// ── Timer ─────────────────────────────────────────────────────────
// timerSeconds = per-pattern base + per-tier bonus.
//   · base reflects how much a pattern inherently needs to develop
//     (a two-sided contrast needs more room than a quick point→example).
//   · bonus grows with level, so speaking longer is the reward for
//     progressing, not a penalty.
const PATTERN_BASE_SECONDS: Record<PatternType, number> = {
  PRE: 30,   // point → reason → example (the 30s default)
  SID: 35,   // signpost → idea → detail
  CE:  30,   // cause → effect
  CC:  40,   // two sides to develop
  HO:  35,   // hedge → opinion
  UNKNOWN: 30,
}

const TIER_BONUS: Record<Tier, number> = {
  beginner:     0,
  intermediate: 25,
  advanced:     50,
}

function timerFor(pattern: PatternType, tier: Tier): number {
  return PATTERN_BASE_SECONDS[pattern] + TIER_BONUS[tier]
}

// ── Structure hints ───────────────────────────────────────────────
// One per pattern: the concrete template + connectors the scorer looks
// for, so the user knows exactly how to speak to raise the score.
const PATTERN_HINTS: Record<PatternType, string> = {
  PRE: 'Lead with your point, back it with "because…", then ground it with "For example…".',
  SID: 'Signal your stance ("Honestly," / "I think…"), state one clear idea, then add a concrete detail.',
  CE:  'Name the cause first, then drive to the effect with "…so…" or "…which means…".',
  CC:  'State one side, then pivot with "However," / "On the other hand," to the other.',
  HO:  'Soften first ("I\'d say…" / "In my view…"), then commit to a clear position.',
  UNKNOWN: 'Pick one clear structure and follow it from start to finish.',
}

// Even rotation order across all five patterns.
const ROTATION: PatternType[] = ['PRE', 'SID', 'CE', 'CC', 'HO']

// Fisher–Yates shuffle so topics differ each session.
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Difficulty determination ───────────────────────────────────────
// advanced:     avgScore >= 75 and not declining
// intermediate: avgScore >= 55 or trend is improving
// beginner:     everything else

function getDifficulty(pattern: PatternType, stats: PatternStats[]): Tier {
  const s = stats.find(p => p.pattern === pattern)
  if (!s) return 'beginner'
  if (s.avgScore >= 75 && s.trend !== 'declining') return 'advanced'
  if (s.avgScore >= 55 || s.trend === 'improving')  return 'intermediate'
  return 'beginner'
}

// ── Public API ────────────────────────────────────────────────────

// Build an even round-robin practice deck across all five patterns. Each
// pattern's topics are shuffled, then interleaved (PRE, SID, CE, CC, HO,
// PRE, …) so the user cycles through every pattern evenly and sees a fresh
// topic whenever a pattern comes back around. Difficulty — and therefore the
// timer — adapts per pattern from the user's stats.
export function generatePracticePrompts(
  patternStats: PatternStats[] = [],
): PracticePrompt[] {
  const perPattern = ROTATION.map(pattern => {
    const bank = PATTERN_TOPICS[pattern][getDifficulty(pattern, patternStats)]
    return shuffle(bank).map(topic => makePrompt(topic, pattern, patternStats))
  })

  const deck: PracticePrompt[] = []
  const maxLen = Math.max(...perPattern.map(p => p.length))
  for (let i = 0; i < maxLen; i++) {
    for (const arr of perPattern) {
      if (arr[i]) deck.push(arr[i])
    }
  }
  return deck
}

// Assemble a full prompt for a given topic + pattern, deriving the tier
// (and thus timer) from the user's stats. Used for LLM-generated follow-ups.
export function makePrompt(
  topic: string,
  pattern: PatternType,
  patternStats: PatternStats[] = [],
): PracticePrompt {
  const difficulty = getDifficulty(pattern, patternStats)
  return {
    topic,
    targetPattern: pattern,
    difficulty,
    timerSeconds: timerFor(pattern, difficulty),
    hint: PATTERN_HINTS[pattern],
  }
}

// A single fresh seed from the hardcoded bank: random pattern + random topic
// at the user's current tier. Used to cold-start and to re-broaden the thread
// every few follow-ups, plus as the safety net when the LLM is unavailable.
export function pickSeedPrompt(patternStats: PatternStats[] = []): PracticePrompt {
  const pattern = ROTATION[Math.floor(Math.random() * ROTATION.length)]
  const bank = PATTERN_TOPICS[pattern][getDifficulty(pattern, patternStats)]
  const topic = bank[Math.floor(Math.random() * bank.length)]
  return makePrompt(topic, pattern, patternStats)
}
