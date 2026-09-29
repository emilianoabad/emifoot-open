import { describe, expect, it } from 'vitest'
import { validateLineup } from './lineup'
import {
  acknowledgeAuctionResult,
  acknowledgeInjuryNotice,
  acknowledgePlayerSale,
  advanceAfterCompetitionResults,
  advanceAfterStandings,
  advanceAfterStandingsForManagedClubs,
  calculateAiAuctionSalary,
  completeCupDraw,
  confirmManagerRegistration,
  canPlayerDemandRaise,
  contractMarker,
  createMarketListings,
  createNewCareer,
  evaluateSalaryDemands,
  expandStadium,
  finishRound,
  getContractSalaryDemand,
  getPlayerSaleQuote,
  getManagerClub,
  getClub,
  getTable,
  isSaleProtected,
  placeTransferBid,
  random,
  reachHalfTime,
  renewPlayerContract,
  setTactic,
  sellPlayer,
  setPlayerContract,
  showStandings,
  startRound,
  submitAuctionOffer,
  type EngineResult,
  type GameState,
} from './index'

function unwrap(result: EngineResult): GameState {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function readyToPlay(initial: GameState): GameState {
  let state = unwrap(confirmManagerRegistration(initial))
  state = unwrap(completeCupDraw(state))
  while (state.phase === 'auction') {
    state = unwrap(submitAuctionOffer(state))
    state = unwrap(acknowledgeAuctionResult(state))
  }
  return state
}

function playToStandings(initial: GameState): GameState {
  const started = unwrap(startRound(initial))
  const halfTime = unwrap(reachHalfTime(started))
  const secondHalf = unwrap(finishRound(halfTime))
  return unwrap(showStandings(secondHalf))
}

function clearAuctions(initial: GameState): GameState {
  let state = initial
  while (state.phase === 'auction') {
    state = unwrap(submitAuctionOffer(state))
    state = unwrap(acknowledgeAuctionResult(state))
  }
  return state
}

describe('game commands', () => {
  it('uses a clear strength ladder instead of giving fourth-division squads elite ratings', () => {
    const state = createNewCareer({ managerName: 'Escala', seed: 11 })
    const fourthDivision = state.clubs.filter((club) => club.division === 4).flatMap((club) => club.players)
    const firstDivision = state.clubs.filter((club) => club.division === 1).flatMap((club) => club.players)
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

    expect(Math.max(...fourthDivision.map((player) => player.strength))).toBeLessThanOrEqual(23)
    expect(average(firstDivision.map((player) => player.strength))).toBeGreaterThan(average(fourthDivision.map((player) => player.strength)) + 15)
  })

  it('assigns a fourth-division club and plays the complete deterministic round sequence', () => {
    const initial = createNewCareer({ managerName: 'Emiliano', seed: 20260830 })
    expect(getManagerClub(initial).division).toBe(4)
    const ready = readyToPlay(initial)
    const supporterCounts = new Map(ready.clubs.map((club) => [club.id, club.supporters]))
    const started = unwrap(startRound(ready))
    expect(started.phase).toBe('first-half')
    expect(started.pendingMatchDay?.matches).toHaveLength(16)
    expect(ready.phase).toBe('pre-round')

    const halfTime = unwrap(reachHalfTime(started))
    expect(halfTime.phase).toBe('half-time')
    const secondHalf = unwrap(finishRound(halfTime))
    expect(secondHalf.phase).toBe('second-half')
    expect(secondHalf.lastReport?.leagueResults).toHaveLength(16)
    expect(getTable(secondHalf, 4).every((entry) => entry.played === 1)).toBe(true)
    expect(secondHalf.clubs.every((club) => club.supporters !== supporterCounts.get(club.id))).toBe(true)
    expect(secondHalf.clubs.every((club) => club.lastSupporterChange === club.supporters - supporterCounts.get(club.id)!)).toBe(true)

    const standings = unwrap(showStandings(secondHalf))
    expect(standings.phase).toBe('standings')
    expect(getTable(standings, 4).every((entry) => entry.points === entry.wins * 3 + entry.draws)).toBe(true)
    const next = unwrap(advanceAfterStandings(standings))
    expect(next.currentRound).toBe(2)
    expect(['auction', 'pre-round']).toContain(next.phase)

    const replayStarted = startRound(readyToPlay(createNewCareer({ managerName: 'Emiliano', seed: 20260830 })))
    expect(replayStarted).toEqual(startRound(ready))
  })

  it('supports tactics, transfer bids, and stadium construction without mutating input', () => {
    const registered = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Ana', seed: 7 })))
    const initial = unwrap(completeCupDraw(registered))
    const tactical = unwrap(setTactic(initial, '3-4-3'))
    expect(getManagerClub(tactical).tactic).toBe('3-4-3')
    expect(getManagerClub(initial).tactic).toBe('4-4-2')

    const funded = structuredClone(tactical)
    getManagerClub(funded).cash = 100_000_000
    const listing = funded.market[0]
    const bid = unwrap(placeTransferBid(funded, listing.id, listing.minimumSalary + 10_000))
    expect(bid.bid?.listingId).toBe(listing.id)

    const expanded = unwrap(expandStadium(bid, 1000))
    expect(getManagerClub(expanded).stadium.expansionRounds).toBe(2)
    expect(getManagerClub(expanded).stadium.expansionSeats).toBe(1000)
  })

  it('plays Copa do Brasil rounds normally when the manager participates', () => {
    let state = readyToPlay(createNewCareer({ managerName: 'Copa', seed: 77 }))
    state = clearAuctions(unwrap(advanceAfterStandings(playToStandings(state))))
    expect(state.currentRound).toBe(2)

    const afterSecondLeagueRound = playToStandings(state)
    const cupDecision = unwrap(advanceAfterStandings(afterSecondLeagueRound))
    expect(cupDecision.phase).toBe('pre-round')
    expect(cupDecision.activeCompetition?.competition).toBe('cup')

    const cupFirstHalf = unwrap(startRound(cupDecision))
    expect(cupFirstHalf.pendingMatchDay?.competition).toBe('cup')
    expect(cupFirstHalf.pendingMatchDay?.matches).toHaveLength(16)
    const cupHalfTime = unwrap(reachHalfTime(cupFirstHalf))
    const cupSecondHalf = unwrap(finishRound(cupHalfTime))
    expect(cupSecondHalf.lastReport?.cupResults).toHaveLength(16)
    const firstRoundCupPrizes = cupSecondHalf.ledger.filter((entry) => entry.type === 'prize' && entry.description.includes(cupSecondHalf.cup.rounds[0].name))
    expect(firstRoundCupPrizes).toHaveLength(32)
    expect(firstRoundCupPrizes.filter((entry) => entry.amount === 50_000)).toHaveLength(16)
    expect(firstRoundCupPrizes.filter((entry) => entry.amount === 25_000)).toHaveLength(16)
    expect(new Set(firstRoundCupPrizes.map((entry) => entry.clubId)).size).toBe(32)
    for (const club of cupSecondHalf.clubs) {
      const payments = cupSecondHalf.ledger.slice(cupHalfTime.ledger.length).filter((entry) => entry.clubId === club.id)
      expect(club.cash - getClub(cupHalfTime, club.id).cash).toBe(payments.reduce((sum, entry) => sum + entry.amount, 0))
    }
    expect(finishRound(cupSecondHalf).ok).toBe(false)
    const cupResults = unwrap(showStandings(cupSecondHalf))
    expect(cupResults.phase).toBe('competition-results')
    const resumedLeague = unwrap(advanceAfterCompetitionResults(cupResults))
    expect(resumedLeague.currentRound).toBe(3)
    expect(resumedLeague.ledger.filter((entry) => entry.prize?.kind === 'cup')).toEqual(firstRoundCupPrizes)
  })

  it('resolves a cup date immediately when no managed club participates', () => {
    let state = readyToPlay(createNewCareer({ managerName: 'Simulação', seed: 81 }))
    state = clearAuctions(unwrap(advanceAfterStandingsForManagedClubs(playToStandings(state), [])))
    const secondRoundStandings = playToStandings(state)
    const advanced = unwrap(advanceAfterStandingsForManagedClubs(secondRoundStandings, []))

    expect(advanced.currentRound).toBe(3)
    expect(advanced.activeCompetition).toBeUndefined()
    expect(advanced.cup.rounds[0]?.matches.every((fixture) => fixture.result)).toBe(true)
  })

  it('plays a Libertadores group date normally when the manager participates', () => {
    let state = readyToPlay(createNewCareer({ managerName: 'Libertadores', seed: 93 }))
    const qualifiedClubId = state.libertadores?.brazilianClubIds[0]
    if (!qualifiedClubId) throw new Error('Expected a Brazilian Libertadores qualifier')
    state.manager.clubId = qualifiedClubId

    const leagueStandings = playToStandings(state)
    const continentalDecision = unwrap(advanceAfterStandings(leagueStandings))
    expect(continentalDecision.phase).toBe('pre-round')
    expect(continentalDecision.activeCompetition).toMatchObject({ competition: 'libertadores', stage: 'group', roundIndex: 0 })

    const firstHalf = unwrap(startRound(continentalDecision))
    expect(firstHalf.pendingMatchDay?.competition).toBe('libertadores')
    expect(firstHalf.pendingMatchDay?.matches).toHaveLength(8)
    const halfTime = unwrap(reachHalfTime(firstHalf))
    const secondHalf = unwrap(finishRound(halfTime))
    expect(secondHalf.lastReport?.libertadoresResults).toHaveLength(8)
    expect(unwrap(showStandings(secondHalf)).phase).toBe('competition-results')
  })

  it('quotes the buyer and exact fee before selling a player', () => {
    const initial = readyToPlay(createNewCareer({ managerName: 'Vendas', seed: 17 }))
    const managerClub = getManagerClub(initial)
    const player = managerClub.players.find((candidate) => getPlayerSaleQuote(initial, candidate.id).ok)
    if (!player) throw new Error('Expected a player with a valid offer')
    const quote = getPlayerSaleQuote(initial, player.id)
    if (!quote.ok) throw new Error(quote.error)
    const buyer = initial.clubs.find((club) => club.id === quote.buyerId)
    if (!buyer) throw new Error('Expected the quoted buyer')

    const result = sellPlayer(initial, player.id)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.message).toContain(`VENDIDO AO ${buyer.name.toUpperCase()}`)
    expect(result.message).toContain(quote.fee.toLocaleString('pt-BR'))
    expect(getManagerClub(initial).players.some((candidate) => candidate.id === player.id)).toBe(true)
    expect(getManagerClub(result.state).players.some((candidate) => candidate.id === player.id)).toBe(false)
    expect(result.state.clubs.find((club) => club.id === buyer.id)?.players.some((candidate) => candidate.id === player.id)).toBe(true)
    expect(result.state.playerSaleResults?.[managerClub.id]).toMatchObject({
      clubId: buyer.id,
      auction: { playerName: player.name, sellerId: managerClub.id, fee: quote.fee },
    })

    const acknowledged = unwrap(acknowledgePlayerSale(result.state))
    expect(acknowledged.playerSaleResults?.[managerClub.id]).toBeUndefined()
  })

  it('renews a current player for one year at the accepted salary', () => {
    const initial = readyToPlay(createNewCareer({ managerName: 'Contratos', seed: 23 }))
    const player = getManagerClub(initial).players.find((candidate) => !isSaleProtected(candidate))
    if (!player) throw new Error('Expected a player eligible for renewal')
    const requestedSalary = getContractSalaryDemand(player)
    const renewed = unwrap(renewPlayerContract(initial, player.id, requestedSalary))
    const renewedPlayer = getManagerClub(renewed).players.find((candidate) => candidate.id === player.id)

    expect(renewedPlayer?.salary).toBe(requestedSalary)
    expect(renewedPlayer?.contractSeasons).toBe(1)
    expect(renewedPlayer?.contractRounds).toBe(14)
    expect(renewedPlayer?.listed).toBe(false)
    expect(getManagerClub(initial).players.find((candidate) => candidate.id === player.id)?.salary).toBe(player.salary)
  })

  it('gives every player bought at auction a one-year contract', () => {
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Compras', seed: 29 })))
    state = unwrap(completeCupDraw(state))
    const listing = state.market[0]
    const playerId = listing.playerId
    getManagerClub(state).cash = 100_000_000

    const result = unwrap(submitAuctionOffer(state, 64_000))
    expect(result.auctionResult?.success).toBe(true)
    expect(getManagerClub(result).players.find((player) => player.id === playerId)?.contractSeasons).toBe(1)
    expect(getManagerClub(result).players.find((player) => player.id === playerId)?.contractRounds).toBe(14)
  })

  it('lets a valid 9,000 bid beat a 7,200 AI offer for an elite goalkeeper', () => {
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Oferta alta', seed: 37 })))
    state = unwrap(completeCupDraw(state))
    const listing = state.market[0]
    const seller = getClub(state, listing.sellerId)
    const player = seller.players.find((candidate) => candidate.id === listing.playerId)
    if (!player) throw new Error('Expected auction player')
    player.position = 'G'
    player.strength = 47
    listing.minimumSalary = 5_000
    state.rngState = 3
    getManagerClub(state).cash = 100_000_000
    expect(calculateAiAuctionSalary(listing.minimumSalary, random(state.rngState).value)).toBe(7_200)

    const result = unwrap(submitAuctionOffer(state, 9_000))

    expect(result.auctionResult).toMatchObject({ success: true, clubId: result.manager.clubId })
    expect(result.auctionResult?.text).toContain('9.000')
    expect(getManagerClub(result).players.some((candidate) => candidate.id === player.id)).toBe(true)
  })

  it('rejects an auction offer before resolution when the transfer cannot be completed', () => {
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Sem verba', seed: 39 })))
    state = unwrap(completeCupDraw(state))
    const listing = state.market[0]
    const managerClub = getManagerClub(state)
    managerClub.cash = Math.max(0, listing.fee - 1)
    const offeredSalary = Math.max(9_000, listing.minimumSalary)

    const result = submitAuctionOffer(state, offeredSalary)

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Dinheiro insuficiente') })
    expect(state.market[0]?.id).toBe(listing.id)
    expect(state.auctionResult).toBeUndefined()
  })

  it('lets an unprotected, underpaid player request a raise and put himself in the market', () => {
    const state = readyToPlay(createNewCareer({ managerName: 'Mercado', seed: 31 }))
    const managerClub = getManagerClub(state)
    for (const player of managerClub.players) {
      player.contractRounds = 14
      player.contractSeasons = 1
      player.listed = false
    }
    const unhappyPlayer = managerClub.players.find((player) => player.position !== 'G') ?? managerClub.players[0]
    unhappyPlayer.contractRounds = 0
    unhappyPlayer.contractSeasons = 0
    unhappyPlayer.salary = 500
    unhappyPlayer.morale = 20
    let rngState = 1
    while (random(rngState).value >= 0.42) rngState += 1
    state.rngState = rngState

    const messages = evaluateSalaryDemands(state)
    const market = createMarketListings(state.rngState, state.clubs, state.manager.clubId, state.currentRound)
    const ownListing = market.listings.find((listing) => listing.playerId === unhappyPlayer.id)

    expect(unhappyPlayer.listed).toBe(true)
    expect(messages.join(' ')).toContain(unhappyPlayer.name)
    expect(ownListing?.sellerId).toBe(state.manager.clubId)
    expect(ownListing?.fee).toBe(0)
  })

  it('protects starred contracts, allows dotted sales, and occasionally offers elite players', () => {
    const state = readyToPlay(createNewCareer({ managerName: 'Marcadores', seed: 41 }))
    const club = getManagerClub(state)
    const candidate = club.players.find((player) => player.position !== 'G') ?? club.players[0]
    candidate.contractRounds = 14
    candidate.contractSeasons = 1
    expect(contractMarker(candidate)).toBe('*')
    expect(canPlayerDemandRaise(candidate)).toBe(false)
    expect(getPlayerSaleQuote(state, candidate.id)).toEqual({ ok: false, error: 'Jogador protegido por contrato.' })
    candidate.contractRounds = 1
    expect(contractMarker(candidate)).toBe('.')
    expect(canPlayerDemandRaise(candidate)).toBe(false)
    expect(getPlayerSaleQuote(state, candidate.id).ok).toBe(true)
    setPlayerContract(candidate, 100)
    expect(candidate.contractRounds).toBe(14)
    candidate.contractRounds = 0
    expect(canPlayerDemandRaise(candidate)).toBe(true)

    const eliteSeen = Array.from({ length: 200 }, (_, index) => createMarketListings(index + 1, state.clubs, state.manager.clubId, 2).listings)
      .flat()
      .some((listing) => getClub(state, listing.sellerId).players.find((player) => player.id === listing.playerId)!.strength >= 40)
    expect(eliteSeen).toBe(true)
  })

  it('automatically replaces an injured player and only opens a notice for managed clubs', () => {
    const state = createNewCareer({ managerName: 'Lesões', seed: 37 })
    state.phase = 'pre-round'
    state.market = []
    const started = unwrap(startRound(state))
    const managedId = started.manager.clubId
    const managedMatch = started.pendingMatchDay?.matches.find((match) => match.homeId === managedId || match.awayId === managedId)
    const aiMatch = started.pendingMatchDay?.matches.find((match) => match.homeId !== managedId && match.awayId !== managedId)
    if (!managedMatch || !aiMatch) throw new Error('Expected managed and AI fixtures')
    const managedClub = getClub(started, managedId)
    const managedPlayer = managedClub.players.find((player) => managedClub.lineup.includes(player.id))
    const aiClub = getClub(started, aiMatch.homeId)
    const aiPlayer = aiClub.players.find((player) => aiClub.lineup.includes(player.id))
    if (!managedPlayer || !aiPlayer) throw new Error('Expected starting players')
    managedMatch.events.push({ minute: 40, type: 'injury', clubId: managedId, playerId: managedPlayer.id, playerName: managedPlayer.name, durationRounds: 3 })
    aiMatch.events.push({ minute: 41, type: 'injury', clubId: aiClub.id, playerId: aiPlayer.id, playerName: aiPlayer.name, durationRounds: 4 })

    const completed = unwrap(finishRound(unwrap(reachHalfTime(started))))
    expect(getClub(completed, managedId).lineup).not.toContain(managedPlayer.id)
    expect(getClub(completed, managedId).players.find((player) => player.id === managedPlayer.id)?.injuryRounds).toBe(3)
    expect(completed.lastReport?.injuryMessages?.join(' ')).toContain(managedPlayer.name.toUpperCase())
    expect(completed.lastReport?.injuryMessages?.join(' ')).not.toContain(aiPlayer.name.toUpperCase())
    expect(completed.injuryNoticePending).toBe(true)

    const standings = unwrap(showStandings(completed))
    expect(standings.injuryNoticePending).toBe(true)
    const acknowledged = unwrap(acknowledgeInjuryNotice(standings))
    expect(acknowledged.injuryNoticePending).toBeUndefined()
  })

  it.each(['G', 'A'] as const)('keeps exactly one keeper when no legal injury replacement exists for %s', (position) => {
    const state = createNewCareer({ managerName: 'Reserva', seed: 37 })
    state.phase = 'pre-round'
    state.market = []
    const started = unwrap(startRound(state))
    const club = getManagerClub(started)
    for (const player of club.players.filter((candidate) => !club.lineup.includes(candidate.id))) {
      player.injuryRounds = (player.position === 'G') === (position === 'G') ? 4 : 0
      player.suspensionRounds = 0
    }
    const injured = club.players.find((player) => player.position === position && club.lineup.includes(player.id))!
    expect(validateLineup({ ...club, players: club.players.map((player) => player.id === injured.id
      ? { ...player, injuryRounds: 3 } : player) })).toBeUndefined()
    const fixture = started.pendingMatchDay!.matches.find((match) => match.homeId === club.id || match.awayId === club.id)!
    fixture.events.push({ minute: 40, type: 'injury', clubId: club.id, playerId: injured.id, playerName: injured.name, durationRounds: 3 })
    const completed = unwrap(finishRound(unwrap(reachHalfTime(started))))
    const updated = getManagerClub(completed)
    expect(updated.players.filter((player) => player.position === 'G' && updated.lineup.includes(player.id))).toHaveLength(1)
    const result = completed.lastReport!.leagueResults.find((match) => match.id === fixture.fixtureId)!.result!
    expect(result.events.some((event) => event.type === 'substitution' && event.clubId === club.id
      && event.detail === `entra por ${injured.name} (lesão)`)).toBe(false)
  })
})
