import { describe, expect, it } from 'vitest'
import { random, shuffle } from './rng'

describe('seeded random stream', () => {
  it('replays the same stream exactly', () => {
    let first = 12345
    let second = 12345
    for (let index = 0; index < 100; index += 1) {
      const a = random(first)
      const b = random(second)
      expect(a).toEqual(b)
      first = a.state
      second = b.state
    }
  })

  it('shuffles without losing values', () => {
    const result = shuffle(99, [1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.value).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...result.value].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
