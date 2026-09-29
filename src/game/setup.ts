import { REAL_VETERANS } from '../data/international-veterans'
import { RAW_CLUBS, ROSTER_SNAPSHOT_ID } from '../data/rosters.generated'
import { DEFAULT_TICKET_PRICE, ECONOMY_MODEL_VERSION, MAX_SQUAD_SIZE, SAVE_SCHEMA_VERSION } from './constants'
import { ageStrengthFactor, createDevelopment, initialPotential, PLAYER_MODEL_VERSION } from './development'
import { isNeymarEasterEgg } from './easterEggs'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue, calculateRegularAuctionMinimum, initialSupporters, sponsorPerRound, startingClubCash } from './economy'
import { autoPickLineup } from './lineup'
import { createLibertadores } from './libertadores'
import { createRandomSeed, hashText, normalizeSeed, randomInt } from './rng'
import { createAllLeagues, createCup } from './schedule'
import { getContractSalaryDemand, getMarketPlayer } from './transfer'
import { prepareMarket } from './market'
import { createSponsorshipState } from './sponsorship'
import type { Club, Division, GameState, NewCareerInput, Player, Position } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const DIVISION_STRENGTH_BASE: Record<Division, number> = { 1: 30, 2: 23, 3: 16, 4: 10 }
const DIVISION_RATING_BASE: Record<Division, number> = { 1: 43, 2: 40, 3: 34, 4: 30 }

function calculateStrength(
  clubId: string,
  clubRating: number,
  division: Division,
  player: { name: string; age: number },
  positionRank: number,
): number {
  const variation = (hashText(`${clubId}:${player.name}`) % 5) - 2
  const roleBonus = Math.max(-5, 3 - positionRank)
  const eliteBonus = division === 1 ? (positionRank === 0 ? 4 : positionRank === 1 ? 2 : 0) : division === 2 && positionRank === 0 ? 2 : 0
  const clubBonus = Math.round((clubRating - DIVISION_RATING_BASE[division]) / 2)
  const ageAdjustment = player.age < 21 ? -2 : player.age > 34 ? -2 : player.age >= 27 && player.age <= 31 ? 1 : 0
  return clamp(DIVISION_STRENGTH_BASE[division] + clubBonus + roleBonus + eliteBonus + variation + ageAdjustment, 1, 50)
}

function buildPlayer(
  clubId: string,
  clubRating: number,
  division: Division,
  raw: { sourceId: string; name: string; position: string; age: number; nationality: string },
  positionRank: number,
): Player {
  const neymar = raw.sourceId === 'espn-132948'
  const development = createDevelopment(neymar ? 50 : initialPotential(clubId, clubRating, division, raw.name, positionRank), raw.age)
  const strength = Math.round(development.ability)
  return {
    id: `${clubId}:${raw.sourceId}`,
    sourceId: raw.sourceId,
    name: raw.name,
    position: raw.position as Position,
    age: raw.age,
    nationality: raw.nationality,
    strength,
    development,
    fitness: 100,
    morale: 75,
    salary: calculatePlayerSalary(strength, raw.age),
    value: calculatePlayerValue(strength, raw.age),
    contractRounds: 0,
    contractSeasons: 0,
    goals: 0,
    appearances: 0,
    yellowCards: 0,
    suspensionRounds: 0,
    injuryRounds: 0,
    injuryProneness: 0.65 + (hashText(`${raw.sourceId}:injury`) % 101) / 100,
    listed: false,
    ...(neymar ? { neymarAuctionPending: true } : {}),
  }
}

function buildClub(raw: (typeof RAW_CLUBS)[number]): Club {
  const division = raw.division as Division
  const ranks: Record<Position, number> = { G: 0, D: 0, M: 0, A: 0 }
  const players = raw.players.map((player) => {
    const position = player.position as Position
    const rank = ranks[position]
    ranks[position] += 1
    return buildPlayer(raw.id, raw.rating, division, player, rank)
  })
  const club: Club = {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName,
    city: raw.city,
    state: raw.state,
    division,
    rating: raw.rating,
    primary: raw.primary,
    secondary: raw.secondary,
    source: raw.source,
    players,
    lineup: [],
    bench: [],
    tactic: '4-4-2',
    cash: startingClubCash(raw.rating, division),
    supporters: initialSupporters(raw.capacity, raw.rating),
    ticketPrice: DEFAULT_TICKET_PRICE,
    sponsorPerRound: sponsorPerRound(raw.rating, division),
    stadium: {
      name: raw.stadium,
      capacity: raw.capacity,
      condition: 92,
      expansionSeats: 0,
      expansionRounds: 0,
    },
    form: [],
  }
  return { ...club, ...autoPickLineup(club) }
}

export function createNewCareer(input: NewCareerInput): GameState {
  const managerName = input.managerName.trim()
  if (!managerName) throw new Error('Informe o nome do treinador.')
  const clubs = RAW_CLUBS.map(buildClub)
  const seed = input.seed === undefined ? createRandomSeed() : normalizeSeed(input.seed)
  const fourthDivision = clubs.filter((club) => club.division === 4)
  const assignment = randomInt(seed, 0, fourthDivision.length - 1)
  const managerClub = fourthDivision[assignment.value] as Club
  const cupResult = createCup(assignment.state, clubs.map((club) => club.id))
  const initialLibertadoresClubs = clubs
    .filter((club) => club.division === 1)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 4)
    .map((club) => club.id)
  const libertadoresResult = createLibertadores(cupResult.rngState, 2026, initialLibertadoresClubs)
  const state: GameState = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    economyModelVersion: ECONOMY_MODEL_VERSION,
    playerModelVersion: PLAYER_MODEL_VERSION,
    rosterSnapshotId: ROSTER_SNAPSHOT_ID,
    id: `local-${seed.toString(16)}-${managerClub.id}`,
    revision: 0,
    seed,
    rngState: libertadoresResult.rngState,
    phase: 'manager-registration',
    season: 2026,
    currentRound: 1,
    clubs,
    sponsorship: createSponsorshipState(seed),
    leagues: createAllLeagues(clubs),
    cup: cupResult.cup,
    libertadores: libertadoresResult.libertadores,
    manager: {
      name: managerName,
      clubId: managerClub.id,
      reputation: clamp(managerClub.rating + 8, 25, 70),
      boardConfidence: 65,
      trophies: 0,
      promotions: 0,
      dismissed: false,
      history: [],
      offers: [],
    },
    market: [],
    ledger: [],
    awards: [],
    news: [
      `${managerName} assume o comando do ${managerClub.name}.`,
      `Temporada ${2026}: objetivo da diretoria é terminar entre os quatro primeiros.`,
    ],
  }
  prepareMarket(state, [managerClub.id])
  return state
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state)
}

export function migrateRosterBalance(original: GameState): GameState {
  if (original.rosterSnapshotId === ROSTER_SNAPSHOT_ID) return original
  const state = cloneState(original)
  // The r3 roster only restores Neymar; preserve r2 career development and wages.
  if (original.rosterSnapshotId !== 'BRA-2026-08-30-r2') {
    for (const club of state.clubs) {
      const ranks: Record<Position, number> = { G: 0, D: 0, M: 0, A: 0 }
      for (const player of club.players) {
        const rank = ranks[player.position]
        ranks[player.position] += 1
        player.strength = isNeymarEasterEgg(player) ? 50 : calculateStrength(club.id, club.rating, club.division, player, rank)
        player.salary = calculatePlayerSalary(player.strength, player.age)
        player.value = calculatePlayerValue(player.strength, player.age)
      }
      Object.assign(club, autoPickLineup(club))
    }
    state.rosterSnapshotId = 'BRA-2026-08-30-r2'
  }
  const santos = state.clubs.find((club) => club.id === 'santos')
  if (!state.clubs.some((club) => club.players.some(isNeymarEasterEgg)) && santos) {
    // Never remove a purchased player or exceed the save's squad limit.
    if (santos.players.length >= MAX_SQUAD_SIZE) return state
    const raw = RAW_CLUBS.find((club) => club.id === 'santos')!.players.find((player) => player.sourceId === 'espn-132948')!
    santos.players.push(buildPlayer(santos.id, santos.rating, santos.division, { ...raw, age: Math.min(70, raw.age + Math.max(0, state.season - 2026)) }, 0))
  }
  state.rosterSnapshotId = ROSTER_SNAPSHOT_ID
  return state
}

/** Rebase old, flattened careers once using each player's original identity, not their current division. */
export function migratePlayerDevelopment(original: GameState): GameState {
  if ((original.playerModelVersion ?? 0) >= PLAYER_MODEL_VERSION) return original
  const state = cloneState(original)
  const potentials = new Map(RAW_CLUBS.flatMap((raw) => buildClub(raw).players.map((player) => [player.sourceId, player.development!.potential] as const)))
  for (const veteran of REAL_VETERANS) potentials.set(`international-${veteran.id}`, veteran.strength)
  const players = [
    ...state.clubs.flatMap((club) => club.players),
    ...(state.libertadores?.invitedClubs ?? []).flatMap((club) => club.players),
    ...state.market.flatMap((listing) => listing.internationalPlayer ? [listing.internationalPlayer] : []),
    ...Object.values(state.offseason?.plans ?? {}).flatMap((plan) => [...plan.retired, ...plan.candidates]),
  ]
  for (const player of players) {
    // Old academy records have no birth-division field and had no age curve.
    // Fit the old 8/14/22/30 scale to the new 16/26/36/46 peak scale instead
    // of mistaking the origin club's current or 2026 division for its history.
    const legacyTalent = player.sourceId.startsWith('academy-') ? 6.5 + player.strength * 4 / 3
      : player.strength / Math.max(0.01, ageStrengthFactor(player.age))
    const potential = potentials.get(player.sourceId) ?? legacyTalent
    player.development = createDevelopment(potential, player.age)
    player.strength = Math.round(player.development.ability)
    player.value = calculatePlayerValue(player.strength, player.age)
  }
  for (const listing of state.market) {
    const player = getMarketPlayer(state, listing)
    if (!player || listing.fee === 0) continue
    const fee = calculateAuctionFee(player.value)
    if (fee !== listing.fee && state.bid?.listingId === listing.id) {
      state.bid = undefined
      state.news.unshift('OFERTA CANCELADA: O PREÇO DA TRANSFERÊNCIA FOI ATUALIZADO. CONFIRA O MERCADO ANTES DE LICITAR.')
    }
    listing.fee = fee
  }
  state.playerModelVersion = PLAYER_MODEL_VERSION
  return state
}

export function migrateEconomyBalance(original: GameState): GameState {
  if (original.economyModelVersion >= ECONOMY_MODEL_VERSION) return original
  const state = cloneState(original)
  const clubs = [...state.clubs, ...(state.libertadores?.invitedClubs ?? [])]
  for (const player of clubs.flatMap((club) => club.players)) {
    if (original.economyModelVersion < 3) {
      player.salary = Math.min(player.salary, calculatePlayerSalary(player.strength, player.age))
    }
    player.value = calculatePlayerValue(player.strength, player.age)
  }
  for (const listing of state.market) {
    const player = getMarketPlayer(state, listing)
    if (!player) continue
    if (original.economyModelVersion < 3) {
      listing.minimumSalary = listing.fee === 0
        ? getContractSalaryDemand(player)
        : calculateRegularAuctionMinimum(player.salary)
    }
    if (listing.fee > 0) {
      const fee = calculateAuctionFee(player.value)
      if (fee !== listing.fee && state.bid?.listingId === listing.id) {
        state.bid = undefined
        state.news.unshift('OFERTA CANCELADA: O PREÇO DA TRANSFERÊNCIA FOI ATUALIZADO. CONFIRA O MERCADO ANTES DE LICITAR.')
      }
      listing.fee = fee
    }
  }
  state.economyModelVersion = ECONOMY_MODEL_VERSION
  return state
}

export function migrateLeagueVenueBalance(original: GameState): GameState {
  const state = cloneState(original)
  const correctedLeagues = createAllLeagues(state.clubs)
  let changed = false

  for (const league of state.leagues) {
    const corrected = correctedLeagues.find((candidate) => candidate.division === league.division)
    if (!corrected) continue
    for (const fixtures of league.rounds) {
      for (const fixture of fixtures) {
        const correctedFixture = corrected.rounds[fixture.round - 1]?.find((candidate) => candidate.id === fixture.id)
        const currentRoundInProgress = state.pendingMatchDay?.round === fixture.round
        const alreadyPlayed = Boolean(fixture.result) || fixture.round < state.currentRound
        if (!correctedFixture || currentRoundInProgress || alreadyPlayed) continue
        if (fixture.homeId === correctedFixture.homeId && fixture.awayId === correctedFixture.awayId) continue
        fixture.homeId = correctedFixture.homeId
        fixture.awayId = correctedFixture.awayId
        changed = true
      }
    }
  }

  return changed ? state : original
}
