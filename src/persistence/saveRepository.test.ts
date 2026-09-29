import { clearAllSavesForTesting } from '../test/saves'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  acknowledgeAuctionResult,
  acceptSponsorshipOffer,
  autoPickLineup,
  validateLineup,
  completeCupDraw,
  confirmManagerRegistration,
  createNewCareer,
  createMarketListings,
  reachHalfTime,
  startRound,
  startNextSeason,
  submitAuctionOffer,
  sellPlayerToAi,
  calculatePlayerSalary,
  calculatePlayerValue,
  calculateAuctionFee,
  ECONOMY_MODEL_VERSION,
  type EngineResult,
  type GameState,
} from '../game'
import { listSaves, loadGame, saveGame } from './saveRepository'
import { parseGameState } from './schema'
import { ROSTER_SNAPSHOT_ID } from '../data/rosters.generated'
import { isNeymarEasterEgg } from '../game/easterEggs'
import { fastForwardSeason } from '../test/simulation'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function reachFirstHalf(initial: GameState): GameState {
  let state = unwrap(confirmManagerRegistration(initial))
  state = unwrap(completeCupDraw(state))
  while (state.phase === 'auction') {
    state = unwrap(submitAuctionOffer(state))
    state = unwrap(acknowledgeAuctionResult(state))
  }
  return unwrap(startRound(state))
}

describe('versioned IndexedDB saves', () => {
  beforeEach(async () => {
    await clearAllSavesForTesting()
  })

  it('persists pending offers, the signed contract and the exact government RNG without rerolling', async () => {
    const completed = unwrap(fastForwardSeason(createNewCareer({ managerName: 'Patrocínio', seed: 77 })))
    completed.manager.dismissed = false
    const pending = unwrap(startNextSeason(completed))
    await saveGame('career', pending.manager.name, pending)
    expect(await loadGame('career')).toEqual(pending)
    const signed = unwrap(acceptSponsorshipOffer(pending, pending.sponsorship!.proposals[pending.manager.clubId].offers[2].id))
    signed.sponsorship!.bettingAllowed = false
    await saveGame('career', signed.manager.name, signed)
    expect(await loadGame('career')).toEqual(signed)
  })

  it('round-trips a live half-time game without loss', async () => {
    const initial = createNewCareer({ managerName: 'Emiliano', seed: 42 })
    const started = reachFirstHalf(initial)
    const halfTime = unwrap(reachHalfTime(started))
    await saveGame('career', 'Emiliano', halfTime)
    const loaded = await loadGame('career')
    expect(loaded).toEqual(halfTime)
    expect((await listSaves())[0]).toMatchObject({ slotId: 'career', season: 2026, clubId: initial.manager.clubId })
  })

  it('rejects structurally corrupt snapshots', () => {
    const state = createNewCareer({ managerName: 'Teste', seed: 1 })
    expect(() => parseGameState({ ...state, currentRound: 99 })).toThrow()
    expect(() => parseGameState({ ...state, clubs: [] })).toThrow()
  })

  it('keeps long careers loadable when players pass the former age-70 limit', async () => {
    const state = createNewCareer({ managerName: 'Longa carreira', seed: 42 })
    state.season += 50
    for (const club of state.clubs) for (const player of club.players) player.age += 50
    await saveGame('career', state.manager.name, state)
    expect(await loadGame('career')).toEqual(state)
  })

  it('saves an injury-depleted AI selection without relaxing the human kickoff rules', async () => {
    const state = createNewCareer({ managerName: 'Lesões', seed: 42 })
    const club = state.clubs.find((candidate) => candidate.id !== state.manager.clubId)!
    club.players.forEach((player, index) => { player.injuryRounds = index >= 10 ? 2 : 0 })
    Object.assign(club, autoPickLineup(club))
    expect(club.lineup.length).toBeLessThan(11)
    expect(validateLineup(club)).toContain('11 jogadores')
    await saveGame('career', state.manager.name, state)
    expect(await loadGame('career')).toEqual(state)
  })

  it('restores the missing Santos player in r2 saves without resetting career progress', async () => {
    const legacy = createNewCareer({ managerName: 'Santos', seed: 51 })
    legacy.rosterSnapshotId = 'BRA-2026-08-30-r2'
    const santos = legacy.clubs.find((club) => club.id === 'santos')!
    const neymar = santos.players.find(isNeymarEasterEgg)!
    const standIn = { ...neymar, id: 'santos:legacy-forward', sourceId: 'legacy-forward', name: 'Existing forward', strength: 31 }
    delete standIn.neymarAuctionPending
    santos.players = santos.players.map((player) => player.id === neymar.id ? standIn : player)
    santos.lineup = santos.lineup.map((id) => id === neymar.id ? standIn.id : id)
    legacy.clubs[0].players[0].strength = 49
    legacy.clubs[0].players[0].salary = 12_350
    await saveGame('career', 'Santos', legacy)
    const loaded = (await loadGame('career'))!
    expect(loaded.rosterSnapshotId).toBe(ROSTER_SNAPSHOT_ID)
    expect(loaded.clubs[0]).toEqual(legacy.clubs[0])
    const restored = loaded.clubs.find((club) => club.id === 'santos')!
    expect(restored.players.filter((player) => !isNeymarEasterEgg(player))).toEqual(santos.players)
    expect(restored.lineup).toEqual(santos.lineup)
    expect(restored.players.find(isNeymarEasterEgg)).toMatchObject({ strength: 48, neymarAuctionPending: true })
    await saveGame('career', 'Santos', loaded)
    expect(await loadGame('career')).toEqual(loaded)
  })

  it('preserves Neymar transfer, injury and auction state through save/load', async () => {
    const state = createNewCareer({ managerName: 'Transferido', seed: 52 })
    const santos = state.clubs.find((club) => club.id === 'santos')!
    const neymar = santos.players.find(isNeymarEasterEgg)!
    // Exchange two players to retain valid lineups while modelling a transfer.
    const buyer = state.clubs[0]
    const other = buyer.players[0]
    santos.players = santos.players.map((player) => player.id === neymar.id ? other : player)
    santos.lineup = santos.lineup.map((id) => id === neymar.id ? other.id : id)
    buyer.players[0] = { ...neymar, neymarAuctionPending: false, injuryRounds: 3 }
    buyer.lineup = buyer.lineup.map((id) => id === other.id ? neymar.id : id)
    await saveGame('career', 'Transferido', state)
    expect(await loadGame('career')).toEqual(state)
  })

  it('migrates old browser players to one-year contracts and default injury proneness', () => {
    const legacy = structuredClone(createNewCareer({ managerName: 'Legado', seed: 9 }))
    const legacyPlayers = legacy.clubs.flatMap((club) => club.players) as unknown as Array<Record<string, unknown>>
    for (const player of legacyPlayers) {
      delete player.contractRounds
      delete player.injuryProneness
    }
    legacyPlayers[0].contractSeasons = 3
    legacyPlayers[1].contractSeasons = 0

    const migrated = parseGameState(legacy)
    expect(migrated.clubs[0].players[0].contractRounds).toBe(14)
    expect(migrated.clubs[0].players[0].contractSeasons).toBe(1)
    expect(migrated.clubs[0].players[1].contractRounds).toBe(0)
    expect(migrated.clubs[0].players.every((player) => player.injuryProneness === 1)).toBe(true)
  })

  it('rebalances an existing browser career created before the strength fix', async () => {
    const legacy = createNewCareer({ managerName: 'Legado', seed: 19 })
    legacy.rosterSnapshotId = 'BRA-2026-08-30'
    for (const club of legacy.clubs) for (const player of club.players) player.strength = 35
    await saveGame('career', 'Legado', legacy)

    const migrated = await loadGame('career')
    expect(migrated?.rosterSnapshotId).toBe(ROSTER_SNAPSHOT_ID)
    const fourthDivision = migrated!.clubs.filter((club) => club.division === 4).flatMap((club) => club.players)
    expect(Math.max(...fourthDivision.map((player) => player.strength))).toBeLessThanOrEqual(18)
  })

  it('deflates salaries and auction minimums saved with the ballooned model', async () => {
    const legacy = createNewCareer({ managerName: 'Ordenados', seed: 27 })
    delete (legacy as unknown as Record<string, unknown>).economyModelVersion
    for (const player of legacy.clubs.flatMap((club) => club.players)) player.salary = 42_000
    for (const listing of legacy.market) listing.minimumSalary = 40_000
    await saveGame('career', 'Ordenados', legacy)

    const migrated = await loadGame('career')
    expect(migrated?.economyModelVersion).toBe(ECONOMY_MODEL_VERSION)
    expect(migrated?.clubs.every((club) => club.players.every((player) => player.salary <= calculatePlayerSalary(player.strength, player.age)))).toBe(true)
    expect(Math.max(...(migrated?.market.map((listing) => listing.minimumSalary) ?? []))).toBeLessThan(15_000)
    for (const listing of migrated!.market) {
      const player = migrated!.clubs.find((club) => club.id === listing.sellerId)!.players.find((player) => player.id === listing.playerId)!
      expect(listing.fee).toBe(calculateAuctionFee(player.value))
    }
  })

  it('repairs cash-capped quotes once while preserving wages, cash, completed trades and free salary demands', async () => {
    const legacy = createNewCareer({ managerName: 'Preço justo', seed: 27 })
    legacy.economyModelVersion = 3
    for (const club of legacy.clubs) club.cash = 4_000
    legacy.clubs[0].players[0].salary = 42_000
    for (const listing of legacy.market) listing.fee = 1_000
    legacy.market[1].fee = 0
    legacy.bid = { listingId: legacy.market[0].id, salary: 12_000 }
    legacy.auctionResult = { id: 'completed', success: true, text: 'VENDA CONCLUÍDA', auction: { sellerId: 'santos', playerName: 'Anterior', nationality: 'BRA', position: 'A', strength: 30, fee: 1_000, minimumSalary: 3_000 } }
    await saveGame('career', 'Preço justo', legacy)

    const loaded = (await loadGame('career'))!
    expect(loaded.clubs).toEqual(legacy.clubs)
    expect(loaded.ledger).toEqual(legacy.ledger)
    expect(loaded.auctionResult).toEqual(legacy.auctionResult)
    expect(loaded.bid).toBeUndefined()
    expect(loaded.news[0]).toContain('OFERTA CANCELADA')
    expect(loaded.market[1]).toEqual(legacy.market[1])
    for (const listing of loaded.market.filter((listing) => listing.fee > 0)) {
      const player = loaded.clubs.find((club) => club.id === listing.sellerId)!.players.find((player) => player.id === listing.playerId)!
      expect(listing.fee).toBe(calculateAuctionFee(player.value))
    }
    await saveGame('career', 'Preço justo', loaded)
    expect(await loadGame('career')).toEqual(loaded)
  })

  it('reprices cubic-era valuations and pending auctions without changing career progress or completed transactions', async () => {
    const legacy = createNewCareer({ managerName: 'Reforços', seed: 82 })
    legacy.economyModelVersion = 4
    const developed = legacy.clubs[0].players[0]
    Object.assign(developed, { strength: 46, age: 31, salary: 18_500, goals: 7, appearances: 16, contractRounds: 8, contractSeasons: 1 })
    const clubs = [...legacy.clubs, ...legacy.libertadores!.invitedClubs]
    for (const player of clubs.flatMap((club) => club.players)) {
      const ageFactor = Math.max(0.55, 1.35 - Math.max(0, player.age - 24) * 0.045)
      player.value = Math.max(1_000, Math.round(player.strength ** 3 * ageFactor * 4 / 1_000) * 1_000)
    }
    const manager = legacy.clubs.find((club) => club.id === legacy.manager.clubId)!
    const sale = sellPlayerToAi(legacy, manager.players.find((player) => player.position !== 'G')!.id)
    if (!sale.ok) throw new Error(sale.error)
    legacy.auctionResult = sale.result
    legacy.currentRound = 3
    const market = createMarketListings(legacy.rngState, legacy.clubs, legacy.manager.clubId, legacy.currentRound)
    legacy.market = market.listings
    legacy.rngState = market.rngState
    legacy.market[1].fee = 0
    legacy.bid = { listingId: legacy.market[0].id, salary: 12_000 }
    const firstPlayer = legacy.clubs.find((club) => club.id === legacy.market[0].sellerId)!.players.find((player) => player.id === legacy.market[0].playerId)!
    expect(legacy.market[0].fee).not.toBe(calculateAuctionFee(calculatePlayerValue(firstPlayer.strength, firstPlayer.age)))
    await saveGame('career', 'Reforços', legacy)

    const loaded = (await loadGame('career'))!
    const repriced = (club: typeof clubs[number]) => ({
      ...club, players: club.players.map((player) => ({ ...player, value: calculatePlayerValue(player.strength, player.age) })),
    })
    expect(loaded.clubs).toEqual(legacy.clubs.map(repriced))
    expect(loaded.libertadores).toEqual({ ...legacy.libertadores, invitedClubs: legacy.libertadores!.invitedClubs.map(repriced) })
    expect(loaded.manager).toEqual(legacy.manager)
    expect(loaded.ledger).toHaveLength(2)
    expect(loaded.ledger).toEqual(legacy.ledger)
    expect(loaded.auctionResult).toEqual(legacy.auctionResult)
    expect(loaded.leagues).toEqual(legacy.leagues)
    expect(loaded.economyModelVersion).toBe(ECONOMY_MODEL_VERSION)
    expect(loaded.bid).toBeUndefined()
    expect(loaded.market[1]).toEqual(legacy.market[1])
    for (const listing of loaded.market.filter((listing) => listing.fee > 0)) {
      const player = loaded.clubs.find((club) => club.id === listing.sellerId)!.players.find((player) => player.id === listing.playerId)!
      expect(listing.fee).toBe(calculateAuctionFee(player.value))
      expect(listing.minimumSalary).toBe(legacy.market.find((old) => old.id === listing.id)!.minimumSalary)
    }
    await saveGame('career', 'Reforços', loaded)
    expect(await loadGame('career')).toEqual(loaded)
  })

  it('repairs unplayed home and away fixtures in an existing browser career', async () => {
    const legacy = createNewCareer({ managerName: 'Calendário', seed: 37 })
    legacy.currentRound = 3
    const expected = structuredClone(legacy.leagues)
    for (const fixture of legacy.leagues.flatMap((league) => league.rounds.slice(2).flat())) {
      const oldHomeId = fixture.homeId
      fixture.homeId = fixture.awayId
      fixture.awayId = oldHomeId
    }
    const pastFixtures = structuredClone(legacy.leagues.flatMap((league) => league.rounds.slice(0, 2).flat()))
    await saveGame('career', 'Calendário', legacy)

    const migrated = await loadGame('career')
    expect(migrated?.leagues.flatMap((league) => league.rounds.slice(0, 2).flat())).toEqual(pastFixtures)
    expect(migrated?.leagues.flatMap((league) => league.rounds.slice(2).flat())).toEqual(
      expected.flatMap((league) => league.rounds.slice(2).flat()),
    )
  })
})
