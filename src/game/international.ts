import { REAL_VETERANS } from '../data/international-veterans'
import { createDevelopment } from './development'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue, calculateRegularAuctionMinimum } from './economy'
import { hashText, random, randomInt } from './rng'
import type { MarketListing, Player } from './types'

export const INTERNATIONAL_SELLER_ID = 'international-market'
export const INTERNATIONAL_ARRIVAL_PROBABILITY = 1 / 14
const BRAZILIAN_RETURN_PROBABILITY = 0.75

export interface InternationalMarketState {
  rngState: number
  offeredIds: string[]
  lastSeason: number
  lastRound: number
  targetPlayerCount: number
}

export interface InternationalListing extends MarketListing {
  internationalPlayer: Player
}

function normalizedName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function abbreviatedName(name: string): string {
  const parts = name.trim().split(/\s+/).map(normalizedName)
  return parts.length > 1 ? `${parts[0][0]} ${parts.slice(1).join(' ')}` : parts[0]
}

/** Independent annual-round draws: usually zero to three arrivals, with no season cap. */
export function drawInternationalArrival(
  previous: InternationalMarketState | undefined,
  season: number,
  round: number,
  seed: number,
  currentPlayers: readonly Player[],
  targetPlayerCount: number,
): { state: InternationalMarketState; listing?: InternationalListing } {
  if (previous && (season < previous.lastSeason || (season === previous.lastSeason && round <= previous.lastRound))) {
    return { state: previous }
  }
  const arrival = random(previous?.rngState ?? hashText(`${seed}:international-arrivals`))
  const state: InternationalMarketState = {
    rngState: arrival.state,
    offeredIds: [...(previous?.offeredIds ?? [])],
    lastSeason: season,
    lastRound: round,
    targetPlayerCount: previous?.targetPlayerCount ?? targetPlayerCount,
  }
  if (arrival.value >= INTERNATIONAL_ARRIVAL_PROBABILITY) return { state }

  const offered = new Set(state.offeredIds)
  const existingIds = new Set(currentPlayers.flatMap((player) => [player.id, player.sourceId]))
  const existingNames = new Set(currentPlayers.flatMap((player) => [normalizedName(player.name), abbreviatedName(player.name)]))
  const candidates = REAL_VETERANS.filter((player) => {
    const age = season - player.birthYear
    return age >= 31 && age <= 38 && !offered.has(player.id)
      && !existingIds.has(player.id) && !existingIds.has(`international-${player.id}`)
      && !existingNames.has(normalizedName(player.name)) && !existingNames.has(abbreviatedName(player.name))
  })
  if (candidates.length === 0) return { state }

  const category = random(state.rngState)
  const brazilian = category.value < BRAZILIAN_RETURN_PROBABILITY
  const preferred = candidates.filter((player) => (player.nationality === 'BRA') === brazilian)
  const pool = preferred.length ? preferred : candidates
  const selection = randomInt(category.state, 0, pool.length - 1)
  state.rngState = selection.state
  const veteran = pool[selection.value]
  const age = season - veteran.birthYear
  const development = createDevelopment(veteran.strength, age)
  const strength = Math.round(development.ability)
  const id = `international-${veteran.id}`
  const player: Player = {
    id, sourceId: id, name: veteran.name, position: veteran.position, age, nationality: veteran.nationality,
    strength, development, salary: calculatePlayerSalary(strength, age), value: calculatePlayerValue(strength, age),
    fitness: 100, morale: 75, contractRounds: 14, contractSeasons: 1,
    goals: 0, appearances: 0, yellowCards: 0, suspensionRounds: 0, injuryRounds: 0, injuryProneness: 1, listed: false,
  }
  state.offeredIds.push(veteran.id)
  return { state, listing: {
    id: `international-${season}-${round}-${veteran.id}`, sellerId: INTERNATIONAL_SELLER_ID, playerId: id,
    fee: calculateAuctionFee(player.value), minimumSalary: calculateRegularAuctionMinimum(player.salary),
    expiresAfterRound: round, internationalPlayer: player,
  } }
}
