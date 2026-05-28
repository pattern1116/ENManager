import type { PatternType, PracticePrompt, WeakPoint, PatternStats } from '@/types'

// ── Tiered topic banks ────────────────────────────────────────────

type Tier = 'beginner' | 'intermediate' | 'advanced'

const PATTERN_TOPICS: Record<PatternType, Record<Tier, string[]>> = {
  PRE: {
    beginner: [
      'Why you prefer working from home',
      'Why morning routines matter',
      'Why reading is valuable in a digital age',
      'Why exercise improves mental focus',
      'Why sleep affects your mood',
    ],
    intermediate: [
      'Why you chose your current career path',
      'Why async communication beats meetings for deep work',
      'Why mentorship accelerates career growth',
      'Why side projects build skills faster than courses',
      'Why feedback culture determines team output',
    ],
    advanced: [
      'Why psychological safety is the leading predictor of team performance',
      'Why optimising for optionality is often worse than committing early',
      'Why the best engineers write the least code',
      'Why strong opinions loosely held is a flawed heuristic',
      'Why skill breadth compounds differently than depth',
    ],
  },
  SID: {
    beginner: [
      'Your take on remote-first companies',
      'Whether social media does more harm than good',
      'Your opinion on four-day work weeks',
      'Your view on open-plan offices',
      'Whether AI will replace creative jobs',
    ],
    intermediate: [
      'Whether generalist or specialist career paths pay off more',
      'Your view on hiring for potential vs. proven track record',
      'Whether code reviews slow teams down or make them faster',
      'Your take on estimation in software projects',
      'Whether technical debt is ever worth accumulating intentionally',
    ],
    advanced: [
      'Whether radical transparency in organisations creates trust or noise',
      'Your view on the trade-off between autonomy and alignment at scale',
      'Whether consensus-driven decisions outperform top-down ones in engineering',
      'Your take on why most productivity systems eventually fail',
      'Whether the best leaders are made or self-selected',
    ],
  },
  CE: {
    beginner: [
      'Why poor sleep affects decision-making',
      'How commute time affects work-life balance',
      'Why unclear communication causes project delays',
      'How skipping breaks reduces output quality',
      'Why unclear goals increase team friction',
    ],
    intermediate: [
      'How learning a new language changes how you think',
      'Why early architectural decisions constrain a product for years',
      'How a culture of blame leads to under-reporting of problems',
      'Why misaligned incentives cause coordination failures',
      'How excessive meetings erode deep-work capacity',
    ],
    advanced: [
      'Why Conway\'s Law means org structure determines system architecture',
      'How survivorship bias distorts our models of success',
      'Why optimising local efficiency often degrades global throughput',
      'How second-order thinking changes the kind of problems you notice',
      'Why short feedback loops produce fundamentally different behaviour than long ones',
    ],
  },
  CC: {
    beginner: [
      'In-person meetings vs. video calls',
      'Big companies vs. startups',
      'Planning carefully vs. acting quickly',
      'Written communication vs. verbal communication',
      'Specialising deeply vs. learning broadly',
    ],
    intermediate: [
      'Moving fast and breaking things vs. moving deliberately and safely',
      'Strong company culture vs. maximum individual autonomy',
      'Building in-house vs. buying off-the-shelf',
      'Optimising for team consensus vs. decisive leadership',
      'Short-term velocity vs. long-term maintainability',
    ],
    advanced: [
      'Explicit process vs. implicit culture as an alignment mechanism',
      'Centralised platform teams vs. fully autonomous product squads',
      'Exploring new markets vs. deepening an existing moat',
      'Hiring for culture fit vs. hiring for culture add',
      'Meritocracy as motivation vs. meritocracy as justification for inequality',
    ],
  },
  HO: {
    beginner: [
      'The single biggest challenge in your industry',
      'The most underrated professional skill',
      'What makes a good manager',
      'The best way to handle conflict at work',
      'What productivity actually means',
    ],
    intermediate: [
      'The most important thing most engineers neglect',
      'What separates a good system design from a great one',
      'The real reason most product launches underperform',
      'What makes someone genuinely difficult to work with',
      'The skill that matters most in the first 90 days of a new role',
    ],
    advanced: [
      'The single biggest failure mode in engineering leadership',
      'What most companies get wrong about scaling culture',
      'Why the hardest problems in tech are not technical',
      'What distinguishes judgment from intelligence in senior roles',
      'The most common way smart teams make bad decisions together',
    ],
  },
  UNKNOWN: {
    beginner:     ['Describe a recent challenge you overcame'],
    intermediate: ['Talk about a decision you would make differently now'],
    advanced:     ['Explain something widely believed that you think is wrong'],
  },
}

const TIMER_SECONDS: Record<Tier, number> = {
  beginner:     45,
  intermediate: 30,
  advanced:     20,
}

// ── Gap hints (only shown at beginner / intermediate) ─────────────

const GAP_HINTS: Record<string, Record<'beginner' | 'intermediate', string>> = {
  example: {
    beginner:     'After your reason, add "For instance…" or "For example…"',
    intermediate: 'Ground your claim with a concrete example',
  },
  reason: {
    beginner:     'After your point, add "because…" or "The reason is…"',
    intermediate: 'Back your claim with a specific reason',
  },
  point: {
    beginner:     'Start with your main claim before explaining',
    intermediate: 'Lead with the point, then support it',
  },
  detail: {
    beginner:     'Add a specific detail or statistic to support your idea',
    intermediate: 'Sharpen the idea with a precise supporting detail',
  },
  signpost: {
    beginner:     'Open with "Actually," "Honestly," or "I think…"',
    intermediate: 'Signal your stance before the idea',
  },
  idea: {
    beginner:     'State your idea clearly before going into details',
    intermediate: 'One clear idea first, then the detail',
  },
  cause: {
    beginner:     'Name the cause first: "The reason this happened is…"',
    intermediate: 'Establish the cause before tracing the effect',
  },
  effect: {
    beginner:     'Show the consequence: "…which means that…" or "…so…"',
    intermediate: 'Drive to the consequence explicitly',
  },
  contrast: {
    beginner:     'Use "However," "On the other hand," or "That said,"',
    intermediate: 'Use a precise contrast connector',
  },
  connector: {
    beginner:     'Use a contrast word to link the two views',
    intermediate: 'Connect the contrast with a single pivot word',
  },
  hedge: {
    beginner:     'Soften with "I\'d say…" or "In my view…"',
    intermediate: 'Hedge before committing to your position',
  },
  opinion: {
    beginner:     'Make your position clear after the hedge',
    intermediate: 'State your view precisely after hedging',
  },
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

export function generatePracticePrompts(
  weakPoints: WeakPoint[],
  patternStats: PatternStats[] = [],
): PracticePrompt[] {
  return weakPoints.map((wp, i) => {
    const difficulty = getDifficulty(wp.pattern, patternStats)
    const bank = PATTERN_TOPICS[wp.pattern]?.[difficulty] ?? PATTERN_TOPICS.UNKNOWN[difficulty]
    const topic = bank[i % bank.length]
    const gapKey = wp.gapComponent.toLowerCase()
    const hint = difficulty !== 'advanced'
      ? GAP_HINTS[gapKey]?.[difficulty]
      : undefined

    return {
      topic,
      targetPattern: wp.pattern,
      difficulty,
      timerSeconds: TIMER_SECONDS[difficulty],
      hint,
    }
  })
}
