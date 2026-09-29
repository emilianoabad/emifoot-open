import { describe, expect, it } from 'vitest'
import { getMatchPacing, isLocalFastMode } from './localFastMode'

describe('local fast mode', () => {
  it('can only be enabled by the explicit development flag', () => {
    expect(isLocalFastMode({ DEV: true, MODE: 'development', VITE_LOCAL_FAST_MODE: 'true' })).toBe(true)
    expect(isLocalFastMode({ DEV: true, MODE: 'development', VITE_LOCAL_FAST_MODE: 'false' })).toBe(false)
    expect(isLocalFastMode({ DEV: false, MODE: 'production', VITE_LOCAL_FAST_MODE: 'true' })).toBe(false)
    expect(isLocalFastMode({ DEV: true, MODE: 'test', VITE_LOCAL_FAST_MODE: 'true' })).toBe(false)
  })

  it('plays each half in one second, excluding the halftime decision', () => {
    const pacing = getMatchPacing(true)
    for (const minutes of [45, 44]) {
      const ticksPerHalf = Math.ceil(minutes / pacing.minuteStep) + 1
      expect(ticksPerHalf * pacing.minuteIntervalMs + pacing.phaseEndDelayMs).toBe(1_000)
    }
  })
})
