export interface RandomResult<T> {
  value: T
  state: number
}

export function normalizeSeed(seed: number): number {
  const normalized = Math.floor(Math.abs(seed)) >>> 0
  return normalized === 0 ? 0x6d2b79f5 : normalized
}

export function createRandomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const value = new Uint32Array(1)
    crypto.getRandomValues(value)
    return normalizeSeed(value[0])
  }
  return normalizeSeed(Date.now() ^ Math.floor(Math.random() * 0x1_0000_0000))
}

export function random(state: number): RandomResult<number> {
  let next = (state + 0x6d2b79f5) >>> 0
  let value = next
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return { value: ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296, state: next }
}

export function randomInt(state: number, min: number, max: number): RandomResult<number> {
  const result = random(state)
  return {
    value: Math.floor(result.value * (max - min + 1)) + min,
    state: result.state,
  }
}

export function shuffle<T>(state: number, values: readonly T[]): RandomResult<T[]> {
  const copy = [...values]
  let nextState = state
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const result = randomInt(nextState, 0, index)
    nextState = result.state
    ;[copy[index], copy[result.value]] = [copy[result.value], copy[index]]
  }
  return { value: copy, state: nextState }
}

export function hashText(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}
