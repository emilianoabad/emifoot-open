import { describe, expect, it } from 'vitest'
import { RAW_CLUBS, ROSTER_FETCHED_AT, ROSTER_SNAPSHOT_ID } from './rosters.generated'

describe('current Brazilian roster snapshot', () => {
  it('contains four divisions of eight unique clubs', () => {
    expect(ROSTER_SNAPSHOT_ID).toBe('BRA-2026-08-30-r3')
    expect(ROSTER_FETCHED_AT).toBe('2026-08-30')
    expect(RAW_CLUBS).toHaveLength(32)
    expect(new Set(RAW_CLUBS.map((club) => club.id))).toHaveProperty('size', 32)
    for (const division of [1, 2, 3, 4]) {
      expect(RAW_CLUBS.filter((club) => club.division === division)).toHaveLength(8)
    }
  })

  it('keeps Neymar in the Santos forward quota', () => {
    expect(RAW_CLUBS.find((club) => club.id === 'santos')?.players).toContainEqual({ sourceId: 'espn-132948', name: 'Neymar', position: 'A', age: 34, nationality: 'BRA' })
  })

  it('ships exactly 18 sourced, positionally viable current players per club', () => {
    for (const club of RAW_CLUBS) {
      expect(club.players, club.name).toHaveLength(18)
      expect(new Set(club.players.map((player) => player.sourceId)).size, club.name).toBe(18)
      expect(club.players.some((player) => player.position === 'G'), club.name).toBe(true)
      expect(club.players.filter((player) => player.position === 'D').length, club.name).toBeGreaterThanOrEqual(3)
      expect(club.players.filter((player) => player.position === 'M').length, club.name).toBeGreaterThanOrEqual(2)
      expect(club.players.every((player) => player.name.length > 1 && player.age >= 15), club.name).toBe(true)
      expect(club.source).toMatch(/ESPN|GE/)
    }
  })
})
