import { CUP_ROUND_NAMES } from './constants'
import { shuffle } from './rng'
import type { Club, CupState, Division, Fixture, LeagueState } from './types'

// Berger-style venue pattern for the seven first-leg rounds of an eight-team
// league. Each bit swaps one of the four circle-method pairings. This keeps
// every club to three or four first-leg home matches and prevents runs longer
// than two at the same venue across the complete mirrored season.
const EIGHT_TEAM_VENUE_SWAP_MASKS = [
  0b0000,
  0b0101,
  0b0001,
  0b1110,
  0b0001,
  0b0110,
  0b0000,
] as const

export function createLeagueSchedule(division: Division, clubIds: string[]): LeagueState {
  if (clubIds.length !== 8) throw new Error(`Division ${division} requires exactly eight clubs`)
  const rotating = [...clubIds]
  const firstLeg: Fixture[][] = []

  for (let round = 1; round <= 7; round += 1) {
    const fixtures: Fixture[] = []
    for (let index = 0; index < 4; index += 1) {
      const left = rotating[index]
      const right = rotating[7 - index]
      const swap = Boolean(EIGHT_TEAM_VENUE_SWAP_MASKS[round - 1] & (1 << index))
      fixtures.push({
        id: `liga-${division}-${round}-${index + 1}`,
        competition: 'league',
        division,
        round,
        homeId: swap ? right : left,
        awayId: swap ? left : right,
      })
    }
    firstLeg.push(fixtures)
    rotating.splice(1, 0, rotating.pop() as string)
  }

  const secondLeg = firstLeg.map((fixtures, index) => fixtures.map((fixture, matchIndex) => ({
    ...fixture,
    id: `liga-${division}-${index + 8}-${matchIndex + 1}`,
    round: index + 8,
    homeId: fixture.awayId,
    awayId: fixture.homeId,
  })))

  return { division, rounds: [...firstLeg, ...secondLeg] }
}

export function createAllLeagues(clubs: Club[]): LeagueState[] {
  return ([1, 2, 3, 4] as Division[]).map((division) =>
    createLeagueSchedule(division, clubs.filter((club) => club.division === division).map((club) => club.id)),
  )
}

export function createCup(state: number, clubIds: string[]): { cup: CupState; rngState: number } {
  const shuffled = shuffle(state, clubIds)
  const matches: Fixture[] = []
  for (let index = 0; index < shuffled.value.length; index += 2) {
    matches.push({
      id: `taca-1-${index / 2 + 1}`,
      competition: 'cup',
      round: 1,
      homeId: shuffled.value[index],
      awayId: shuffled.value[index + 1],
    })
  }
  return {
    cup: { rounds: [{ name: CUP_ROUND_NAMES[0], matches }], nextRoundIndex: 0 },
    rngState: shuffled.state,
  }
}

export function buildNextCupRound(cup: CupState, winnerIds: string[]): CupState {
  const nextIndex = cup.nextRoundIndex + 1
  if (winnerIds.length === 1) return { ...cup, nextRoundIndex: nextIndex, championId: winnerIds[0] }
  const matches: Fixture[] = []
  for (let index = 0; index < winnerIds.length; index += 2) {
    matches.push({
      id: `taca-${nextIndex + 1}-${index / 2 + 1}`,
      competition: 'cup',
      round: nextIndex + 1,
      homeId: winnerIds[index],
      awayId: winnerIds[index + 1],
    })
  }
  return {
    ...cup,
    nextRoundIndex: nextIndex,
    rounds: [...cup.rounds, { name: CUP_ROUND_NAMES[nextIndex], matches }],
  }
}
