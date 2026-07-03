import { describe, it, expect } from 'vitest'
import { nextSpeed, NORMAL_SPEED, SLOWEST_SPEED } from '@/lib/smalltalk/speed'

describe('nextSpeed — spoken pace requests', () => {
  it('leaves the speed unchanged when nothing pace-related is said', () => {
    expect(nextSpeed('I had a great weekend, thanks for asking', NORMAL_SPEED)).toBe(1)
    expect(nextSpeed('', 0.75)).toBe(0.75)
  })

  it('slows down on common "slower" phrasings', () => {
    for (const phrase of [
      'can you speak slower',
      'please talk more slowly',
      'slow down a bit',
      'sorry, that was too fast',
      'could you say it slower',
      'could you say slowly', // no "it"/"that" — was missed before
      'say slowly please',
      'speak slowly',
      '조금 천천히 말해줘',
    ]) {
      expect(nextSpeed(phrase, NORMAL_SPEED)).toBe(0.75)
    }
  })

  it('stacks repeated slower requests down to the floor', () => {
    let s = NORMAL_SPEED
    s = nextSpeed('slower please', s) // 0.75
    s = nextSpeed('even slower', s) // 0.5
    expect(s).toBe(0.5)
    s = nextSpeed('slow down more', s) // clamped at floor
    expect(s).toBe(SLOWEST_SPEED)
  })

  it('walks back toward normal on "faster" / "normal speed"', () => {
    expect(nextSpeed('a bit faster please', 0.5)).toBe(0.75)
    expect(nextSpeed('you can speak normally now', 0.5)).toBe(0.75)
    expect(nextSpeed('normal speed is fine', 0.75)).toBe(1)
    expect(nextSpeed('that was too slow', 0.5)).toBe(0.75)
  })

  it('never exceeds normal or drops below the floor', () => {
    expect(nextSpeed('faster!', NORMAL_SPEED)).toBe(1)
    expect(nextSpeed('slower', SLOWEST_SPEED)).toBe(0.5)
  })
})
