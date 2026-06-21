import { describe, it, expect } from 'vitest'
import { parseStructure, buildAnalysisPrompt } from '@/lib/parsers/structure'

describe('parseStructure — pattern detection', () => {
  it('detects PRE with high confidence (3+ markers)', () => {
    const r = parseStructure(
      'I prefer mornings because I focus better. For example, I finished early. For instance, the report was done.',
    )
    expect(r.patternDetected).toBe('PRE')
    expect(r.confidence).toBe('high')
  })

  it('detects SID', () => {
    const r = parseStructure('Actually, I believe remote work helps. Personally, it saves time.')
    expect(r.patternDetected).toBe('SID')
    expect(r.confidence).toBe('high')
  })

  it('detects CE', () => {
    const r = parseStructure(
      'The project slipped. As a result, we lost time. Therefore the launch was delayed, consequently morale dropped.',
    )
    expect(r.patternDetected).toBe('CE')
    expect(r.confidence).toBe('high')
  })

  it('detects CC', () => {
    const r = parseStructure('I like meetings. However, calls are efficient. But async is better. Although it depends.')
    expect(r.patternDetected).toBe('CC')
    expect(r.confidence).toBe('high')
  })

  it('detects HO', () => {
    const r = parseStructure("I'd say it's tricky. Maybe we should wait. Perhaps it's fine. It seems to me reasonable.")
    expect(r.patternDetected).toBe('HO')
    expect(r.confidence).toBe('high')
  })

  it('returns UNKNOWN with no markers', () => {
    const r = parseStructure('The cat sat on the mat.')
    expect(r.patternDetected).toBe('UNKNOWN')
    expect(r.confidence).toBe('low')
  })

  it('assigns medium confidence at exactly 2 markers', () => {
    const r = parseStructure('I prefer mornings because I focus. For example coffee helps.')
    expect(r.patternDetected).toBe('PRE')
    expect(r.confidence).toBe('medium')
  })

  it('assigns low confidence at a single dominant marker', () => {
    const r = parseStructure('The weather is nice, for example today.')
    expect(r.patternDetected).toBe('PRE')
    expect(r.confidence).toBe('low')
  })

  it('falls back to UNKNOWN on a tie between patterns', () => {
    // "I think" matches both SID and HO once → tie → no clear winner.
    const r = parseStructure('I think it works.')
    expect(r.patternDetected).toBe('UNKNOWN')
  })
})

describe('parseStructure — signals', () => {
  it('reports matched markers', () => {
    const r = parseStructure('I prefer mornings because I focus better. For example, I finished early.')
    expect(r.signals).toContain('because')
  })

  it('de-duplicates the same matched text from overlapping markers', () => {
    // "I think" is a marker for both SID and HO; it should appear once.
    const r = parseStructure('I think it works.')
    const occurrences = r.signals.filter(s => s.toLowerCase() === 'i think')
    expect(occurrences.length).toBe(1)
  })
})

describe('parseStructure — gap detection', () => {
  it('flags a missing example in a PRE utterance', () => {
    const r = parseStructure('I prefer mornings because it is quiet, because I focus.')
    expect(r.patternDetected).toBe('PRE')
    expect(r.potentialGaps.map(g => g.component)).toContain('example')
  })

  it('flags an unclear subject for a subjectless utterance', () => {
    const r = parseStructure('Running quickly every day.')
    expect(r.patternDetected).toBe('UNKNOWN')
    expect(r.potentialGaps.map(g => g.component)).toContain('clear subject')
  })

  it('caps gaps at 3', () => {
    const r = parseStructure('Running.')
    expect(r.potentialGaps.length).toBeLessThanOrEqual(3)
  })

  it('produces gap objects with component and description', () => {
    const r = parseStructure('Running quickly every day.')
    for (const g of r.potentialGaps) {
      expect(typeof g.component).toBe('string')
      expect(typeof g.description).toBe('string')
      expect(g.description.length).toBeGreaterThan(0)
    }
  })
})

describe('buildAnalysisPrompt', () => {
  it('embeds the utterance and the pre-analysis hint', () => {
    const text = 'I prefer mornings because I focus.'
    const prompt = buildAnalysisPrompt(text, parseStructure(text))
    expect(prompt).toContain(text)
    expect(prompt).toContain('Likely pattern: PRE')
    // Asks for strict JSON output
    expect(prompt).toContain('"patternDetected"')
  })

  it('includes the scoring rubric for consistent grading', () => {
    const text = 'The cat sat on the mat.'
    const prompt = buildAnalysisPrompt(text, parseStructure(text))
    expect(prompt).toMatch(/rubric/i)
    expect(prompt).toContain('85-100')
    expect(prompt).toMatch(/deterministic/i)
  })

  it('injects the practice target pattern when given', () => {
    const text = 'I prefer mornings because I focus.'
    const prompt = buildAnalysisPrompt(text, parseStructure(text), 'CE')
    expect(prompt).toContain('practising the CE pattern')
  })

  it('omits the target line for UNKNOWN or no target', () => {
    const text = 'I prefer mornings because I focus.'
    expect(buildAnalysisPrompt(text, parseStructure(text))).not.toMatch(/practising the/)
    expect(buildAnalysisPrompt(text, parseStructure(text), 'UNKNOWN')).not.toMatch(/practising the/)
  })
})
