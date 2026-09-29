import { expandClubStadium, repairClubStadium } from './clubOperations'
import { prepareMarket } from './market'
import {
  BEST_ATTACK_PRIZE,
  BEST_DEFENCE_PRIZE,
  CUP_AFTER_ROUNDS,
  CUP_ROUND_PRIZES,
  DIVISION_PRIZE,
  DIVISION_RUNNER_UP_SHARE,
  LIBERTADORES_GROUP_AFTER_ROUNDS,
  LIBERTADORES_KNOCKOUT_AFTER_ROUNDS,
  LIBERTADORES_KNOCKOUT_ROUND_NAMES,
  LIBERTADORES_PRIZE,
  MATCHDAY_GATE_SHARE,
  TACTICS,
  TOP_SCORER_PRIZE,
} from './constants'
import { isSaleProtected, setPlayerContract, tickPlayerContract } from './contracts'
import { agePlayer, developAfterMatch } from './development'
import { calculatePlayerValue, updateSupportersAfterMatch } from './economy'
import { createJobOffers } from './jobs'
import { buildLibertadoresQuarterfinals, buildNextLibertadoresRound, createLibertadores } from './libertadores'
import { autoPickLineup, getAvailableTactics, replaceStarter, validateLineup } from './lineup'
import { beginPreseason, renewSquads } from './lifecycle'
import { simulateFirstHalf, simulateSecondHalf } from './match'
import { random, randomInt } from './rng'
import { buildNextCupRound, createAllLeagues, createCup } from './schedule'
import { getAttendanceLeaguePosition, getClub, getCompetitionClub, getManagerClub, getTable } from './selectors'
import { cloneState } from './setup'
import { advanceBettingRegulation, bestSafeSponsorship, bettingRegulationNotice, createSponsorshipProposal, createSponsorshipState, getAvailableSponsorshipProposal, getSponsorBrand, signSponsorship, sponsorshipPayment } from './sponsorship'
import { evaluateSalaryDemands, getAuctionBidEligibilityError, getContractSalaryDemand, resolveAuctionListing, sellPlayerToAi } from './transfer'
import type {
  Club,
  Competition,
  CompetitionEvent,
  Division,
  EngineResult,
  Fixture,
  FormResult,
  GameState,
  MatchResult,
  MatchEvent,
  PendingMatch,
  PrizeAward,
  RoundReport,
  SeasonAwards,
  TacticId,
} from './types'

function success(state: GameState, message?: string): EngineResult {
  state.revision += 1
  return { ok: true, state, message }
}

function failure(error: string): EngineResult {
  return { ok: false, error }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getMutableFixture(state: GameState, fixtureId: string): Fixture {
  const fixtures = [
    ...state.leagues.flatMap((league) => league.rounds.flat()),
    ...state.cup.rounds.flatMap((round) => round.matches),
    ...(state.libertadores?.groups.flatMap((group) => group.rounds.flat()) ?? []),
    ...(state.libertadores?.knockoutRounds.flatMap((round) => round.matches) ?? []),
  ]
  const fixture = fixtures.find((candidate) => candidate.id === fixtureId)
  if (!fixture) throw new Error(`Partida desconhecida: ${fixtureId}`)
  return fixture
}

function formFor(result: MatchResult, home: boolean): FormResult {
  const own = home ? result.homeGoals : result.awayGoals
  const rival = home ? result.awayGoals : result.homeGoals
  return own > rival ? 'V' : own < rival ? 'D' : 'E'
}

function applyEventConsequences(club: Club, result: MatchResult): void {
  for (const event of result.events.filter((candidate) => candidate.clubId === club.id)) {
    const player = club.players.find((candidate) => candidate.id === event.playerId)
    if (!player) continue
    if (event.type === 'goal') player.goals += 1
    if (event.type === 'yellow') {
      player.yellowCards += 1
      if (player.yellowCards > 0 && player.yellowCards % 3 === 0) player.suspensionRounds = Math.max(player.suspensionRounds, 1)
    }
    if (event.type === 'red') player.suspensionRounds = Math.max(player.suspensionRounds, 1)
    if (event.type === 'injury') player.injuryRounds = Math.max(player.injuryRounds, event.durationRounds ?? 1)
  }
}

function applyPlayerLoad(club: Club, lineupIds: string[], outcome: FormResult): void {
  for (const player of club.players) {
    if (lineupIds.includes(player.id)) {
      player.appearances += 1
      player.fitness = clamp(player.fitness - 8 - Math.max(0, player.age - 32) * 0.25, 20, 100)
      player.morale = clamp(player.morale + (outcome === 'V' ? 4 : outcome === 'D' ? -3 : 1), 20, 100)
    } else {
      player.fitness = clamp(player.fitness + 6, 20, 100)
      player.morale = clamp(player.morale - (player.strength >= club.rating + 3 ? 1 : 0) + 1, 20, 100)
    }
  }
}

function addLedger(state: GameState, clubId: string, type: Parameters<GameState['ledger']['push']>[0]['type'], amount: number, description: string, prize?: PrizeAward): void {
  state.ledger.push({
    id: `ledger-${state.season}-${state.currentRound}-${state.ledger.length + 1}`,
    season: state.season,
    round: state.currentRound,
    clubId,
    type,
    amount: Math.round(amount),
    description,
    ...(prize ? { prize } : {}),
  })
}

function payPrize(state: GameState, club: Club, amount: number, description: string, prize: PrizeAward): void {
  club.cash += amount
  addLedger(state, club.id, 'prize', amount, description, prize)
}

function applyResult(
  state: GameState,
  home: Club,
  away: Club,
  result: MatchResult,
  homeLineup: string[],
  awayLineup: string[],
  competition: Competition,
): void {
  const homeForm = formFor(result, true)
  const awayForm = formFor(result, false)
  home.form = [...home.form, homeForm].slice(-5)
  away.form = [...away.form, awayForm].slice(-5)
  applyPlayerLoad(home, homeLineup, homeForm)
  applyPlayerLoad(away, awayLineup, awayForm)
  applyEventConsequences(home, result)
  applyEventConsequences(away, result)
  state.rngState = developAfterMatch(state.rngState, home, away, homeLineup, awayLineup)

  for (const [club, opponent, outcome, margin] of [[home, away, homeForm, result.homeGoals - result.awayGoals], [away, home, awayForm, result.awayGoals - result.homeGoals]] as const) {
    const previousSupporters = club.supporters
    club.supporters = updateSupportersAfterMatch(previousSupporters, club.rating, opponent.rating, outcome, margin, competition, club.form)
    club.lastSupporterChange = club.supporters - previousSupporters
  }

  const gate = Math.round(result.attendance * home.ticketPrice * MATCHDAY_GATE_SHARE)
  home.cash += gate
  const competitionName = competition === 'cup' ? 'Copa' : competition === 'libertadores' ? 'Libertadores' : 'Liga'
  addLedger(state, home.id, 'tickets', gate, `${competitionName}: bilheteira líquida de ${result.attendance.toLocaleString('pt-BR')} espectadores`)

  const managerClubId = state.manager.clubId
  if (home.id === managerClubId || away.id === managerClubId) {
    const humanHome = home.id === managerClubId
    const human = humanHome ? home : away
    const opponent = humanHome ? away : home
    const outcome = humanHome ? homeForm : awayForm
    const expected = human.rating - opponent.rating
    const reputationDelta = outcome === 'V' ? 2 + (expected < -3 ? 2 : 0) : outcome === 'D' ? -2 - (expected > 4 ? 2 : 0) : expected < -5 ? 1 : 0
    state.manager.reputation = clamp(state.manager.reputation + reputationDelta, 10, 100)
    state.manager.boardConfidence = clamp(state.manager.boardConfidence + (outcome === 'V' ? 5 : outcome === 'D' ? -5 : 1), 0, 100)
  }
}

function tickUnavailablePlayers(clubs: readonly Club[]): void {
  for (const player of clubs.flatMap((club) => club.players)) {
    player.injuryRounds = Math.max(0, player.injuryRounds - 1)
    player.suspensionRounds = Math.max(0, player.suspensionRounds - 1)
  }
}

function processRoundFinances(state: GameState, results: readonly Fixture[]): void {
  for (const club of state.clubs) {
    const wages = club.players.reduce((sum, player) => sum + player.salary, 0)
    const maintenance = Math.round(club.stadium.capacity * 0.12)
    const fixture = results.find((match) => match.homeId === club.id || match.awayId === club.id)
    const outcome = fixture?.result ? formFor(fixture.result, fixture.homeId === club.id) : undefined
    const sponsorIncome = sponsorshipPayment(state, club, outcome)
    const sponsor = club.sponsorship
    const description = !sponsor ? 'Patrocínio da jornada'
      : sponsorIncome === 0 ? `${getSponsorBrand(sponsor.brandId).name}: patrocínio suspenso`
        : `${getSponsorBrand(sponsor.brandId).name}: base ${sponsor.basePerRound} + bônus ${sponsorIncome - sponsor.basePerRound}`
    club.cash += sponsorIncome - wages - maintenance
    addLedger(state, club.id, 'sponsor', sponsorIncome, description)
    addLedger(state, club.id, 'wages', -wages, 'Ordenados do plantel')
    addLedger(state, club.id, 'maintenance', -maintenance, `Manutenção do ${club.stadium.name}`)
    club.stadium.condition = clamp(club.stadium.condition - 0.65, 35, 100)
    for (const player of club.players) tickPlayerContract(player)
    if (club.stadium.expansionRounds > 0) {
      club.stadium.expansionRounds -= 1
      if (club.stadium.expansionRounds === 0) {
        club.stadium.capacity += club.stadium.expansionSeats
        state.news.unshift(`${club.name} concluiu a ampliação do ${club.stadium.name} para ${club.stadium.capacity.toLocaleString('pt-BR')} lugares.`)
        club.stadium.expansionSeats = 0
      }
    }
  }
  const managerClub = getManagerClub(state)
  if (managerClub.cash < 0) state.manager.boardConfidence = clamp(state.manager.boardConfidence - 3, 0, 100)
}

function automaticInjurySubstitution(club: Club, events: MatchEvent[]): void {
  for (const event of events.filter((candidate) => candidate.type === 'injury' && candidate.clubId === club.id)) {
    const injured = club.players.find((player) => player.id === event.playerId)
    if (!injured) continue
    injured.injuryRounds = Math.max(injured.injuryRounds, event.durationRounds ?? 1)
    if (!club.lineup.includes(injured.id)) continue
    const candidates = club.players
      .filter((player) => player.id !== injured.id && player.injuryRounds === 0 && player.suspensionRounds === 0 && !club.lineup.includes(player.id))
      .sort((a, b) => Number(b.position === injured.position) - Number(a.position === injured.position) || b.strength - a.strength || b.fitness - a.fitness)
    const substitute = candidates[0]
    if (!substitute) continue
    Object.assign(club, replaceStarter(club, injured.id, substitute.id))
    events.push({
      minute: event.minute,
      type: 'substitution',
      clubId: club.id,
      playerId: substitute.id,
      playerName: substitute.name,
      detail: `entra por ${injured.name} (lesão)`,
    })
  }
  const eventOrder = (event: MatchEvent) => event.type === 'injury' ? 0 : event.type === 'substitution' ? 1 : 2
  events.sort((a, b) => a.minute - b.minute || eventOrder(a) - eventOrder(b))
}

function applyAutomaticInjurySubstitutions(home: Club, away: Club, events: MatchEvent[]): void {
  automaticInjurySubstitution(home, events)
  automaticInjurySubstitution(away, events)
}

function injuryMessages(state: GameState, fixtures: readonly Fixture[], managedClubIds: readonly string[]): string[] {
  const managedClubs = new Set(managedClubIds)
  return fixtures.flatMap((fixture) => (fixture.result?.events ?? [])
    .filter((event) => event.type === 'injury' && managedClubs.has(event.clubId))
    .map((event) => `${getCompetitionClub(state, event.clubId).name.toUpperCase()}: ${event.playerName.toUpperCase()} [+] — fora por ${event.durationRounds ?? 1} jogo${(event.durationRounds ?? 1) === 1 ? '' : 's'}.`))
}

function ensureLibertadores(state: GameState): void {
  if (state.libertadores) return
  const qualifiers = state.clubs
    .filter((club) => club.division === 1)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 4)
    .map((club) => club.id)
  const created = createLibertadores(state.rngState, state.season, qualifiers)
  state.libertadores = created.libertadores
  state.rngState = created.rngState
}

function competitionFixtures(state: GameState, event: CompetitionEvent): Fixture[] {
  if (event.competition === 'cup') return state.cup.rounds[event.roundIndex]?.matches ?? []
  ensureLibertadores(state)
  if (event.stage === 'group') return state.libertadores?.groups.flatMap((group) => group.rounds[event.roundIndex] ?? []) ?? []
  return state.libertadores?.knockoutRounds[event.roundIndex]?.matches ?? []
}

function knockoutWinnerId(fixture: Fixture): string {
  const result = fixture.result
  if (!result) throw new Error(`Partida sem resultado: ${fixture.id}`)
  if (result.homeGoals !== result.awayGoals) return result.homeGoals > result.awayGoals ? fixture.homeId : fixture.awayId
  return (result.homePenalties ?? 0) > (result.awayPenalties ?? 0) ? fixture.homeId : fixture.awayId
}

function addKnockoutPenalties(state: GameState, result: MatchResult): MatchResult {
  if (result.homeGoals !== result.awayGoals) return result
  const homePens = randomInt(state.rngState, 3, 5)
  state.rngState = homePens.state
  const awayPens = randomInt(state.rngState, 2, 5)
  state.rngState = awayPens.state
  let homePenalties = homePens.value
  let awayPenalties = awayPens.value
  if (homePenalties === awayPenalties) {
    const suddenDeath = random(state.rngState)
    state.rngState = suddenDeath.state
    if (suddenDeath.value < 0.5) homePenalties += 1
    else awayPenalties += 1
  }
  return { ...result, homePenalties, awayPenalties }
}

function completeCompetitionRound(state: GameState, event: CompetitionEvent, fixtures: Fixture[]): void {
  if (event.competition === 'cup') {
    const winners = fixtures.map(knockoutWinnerId)
    const cupRound = state.cup.rounds[event.roundIndex]
    const prize = CUP_ROUND_PRIZES[event.roundIndex] ?? CUP_ROUND_PRIZES.at(-1)!
    for (const [index, fixture] of fixtures.entries()) {
      const winnerId = winners[index]
      const loserId = fixture.homeId === winnerId ? fixture.awayId : fixture.homeId
      const award: PrizeAward = { kind: 'cup', roundIndex: event.roundIndex }
      payPrize(state, getClub(state, winnerId), prize, `Prêmio da ${cupRound.name}`, award)
      payPrize(state, getClub(state, loserId), prize / 2, `Prêmio da ${cupRound.name} — eliminado`, award)
    }
    state.cup = buildNextCupRound(state.cup, winners)
    if (state.cup.championId) {
      const champion = getClub(state, state.cup.championId)
      state.news.unshift(`${champion.name} conquistou a Copa do Brasil!`)
    }
    return
  }

  ensureLibertadores(state)
  const libertadores = state.libertadores
  if (!libertadores) return
  if (event.stage === 'group') {
    libertadores.groupRoundIndex = event.roundIndex + 1
    if (libertadores.groupRoundIndex === 6) {
      state.libertadores = buildLibertadoresQuarterfinals(libertadores, (clubId) => getCompetitionClub(state, clubId).name)
    }
    return
  }

  const winners = fixtures.map(knockoutWinnerId)
  state.libertadores = buildNextLibertadoresRound(libertadores, winners)
  if (state.libertadores.championId) {
    const champion = getCompetitionClub(state, state.libertadores.championId)
    payPrize(state, champion, LIBERTADORES_PRIZE, 'Campeão da Libertadores', { kind: 'libertadores' })
    state.news.unshift(`${champion.name} conquistou a Taça Libertadores da América!`)
  }
}

function updateCompetitionReport(state: GameState, event: CompetitionEvent, fixtures: Fixture[], managedClubIds: readonly string[]): void {
  const base: RoundReport = state.lastReport ?? { leagueResults: [], cupResults: [], libertadoresResults: [], transferMessages: [], headlines: [] }
  const relevantInjuries = injuryMessages(state, fixtures, managedClubIds)
  state.lastReport = event.competition === 'cup'
    ? { ...base, cupResults: fixtures.map((fixture) => structuredClone(fixture)), injuryMessages: relevantInjuries }
    : { ...base, libertadoresResults: fixtures.map((fixture) => structuredClone(fixture)), injuryMessages: relevantInjuries }
  state.injuryNoticePending = relevantInjuries.length > 0 || undefined
}

function simulateCompetitionRoundFast(state: GameState, event: CompetitionEvent): Fixture[] {
  const fixtures = competitionFixtures(state, event)
  for (const fixture of fixtures) {
    const home = getCompetitionClub(state, fixture.homeId)
    const away = getCompetitionClub(state, fixture.awayId)
    Object.assign(home, autoPickLineup(home))
    Object.assign(away, autoPickLineup(away))
    tickUnavailablePlayers([home, away])
    const homeLineup = [...home.lineup]
    const awayLineup = [...away.lineup]
    const first = simulateFirstHalf(state.rngState, home, away, getAttendanceLeaguePosition(state, home))
    applyAutomaticInjurySubstitutions(home, away, first.pending.events)
    const second = simulateSecondHalf(first.rngState, home, away, first.pending)
    state.rngState = second.rngState
    fixture.result = event.stage === 'knockout' ? addKnockoutPenalties(state, second.result) : second.result
    applyAutomaticInjurySubstitutions(home, away, fixture.result.events)
    applyResult(state, home, away, fixture.result, [...new Set([...homeLineup, ...home.lineup])], [...new Set([...awayLineup, ...away.lineup])], event.competition)
    Object.assign(home, autoPickLineup(home))
    Object.assign(away, autoPickLineup(away))
  }
  completeCompetitionRound(state, event, fixtures)
  const completed = fixtures.map((fixture) => structuredClone(fixture))
  updateCompetitionReport(state, event, completed, [])
  return completed
}

function scheduledCompetitionEvents(state: GameState): CompetitionEvent[] {
  ensureLibertadores(state)
  const events: CompetitionEvent[] = []
  const cupIndex = state.cup.nextRoundIndex
  if (!state.cup.championId && CUP_AFTER_ROUNDS[cupIndex] === state.currentRound) {
    const roundName = state.cup.rounds[cupIndex]?.name ?? 'COPA DO BRASIL'
    events.push({ competition: 'cup', stage: 'knockout', roundIndex: cupIndex, title: 'COPA DO BRASIL', roundName })
  }
  const libertadores = state.libertadores
  if (!libertadores?.championId && libertadores) {
    if (libertadores.groupRoundIndex < 6 && LIBERTADORES_GROUP_AFTER_ROUNDS[libertadores.groupRoundIndex] === state.currentRound) {
      events.push({ competition: 'libertadores', stage: 'group', roundIndex: libertadores.groupRoundIndex, title: 'TAÇA LIBERTADORES DA AMÉRICA', roundName: `${libertadores.groupRoundIndex + 1}ª JORNADA DOS GRUPOS` })
    } else if (libertadores.groupRoundIndex >= 6 && LIBERTADORES_KNOCKOUT_AFTER_ROUNDS[libertadores.nextKnockoutRoundIndex] === state.currentRound) {
      events.push({
        competition: 'libertadores',
        stage: 'knockout',
        roundIndex: libertadores.nextKnockoutRoundIndex,
        title: 'TAÇA LIBERTADORES DA AMÉRICA',
        roundName: LIBERTADORES_KNOCKOUT_ROUND_NAMES[libertadores.nextKnockoutRoundIndex],
      })
    }
  }
  return events
}

function finalizeSeason(state: GameState): void {
  const champions: Record<string, string> = {}
  const runnersUp: Record<string, string> = {}
  const tableEntries = []
  for (const division of [1, 2, 3, 4] as Division[]) {
    const table = getTable(state, division)
    tableEntries.push(...table)
    champions[String(division)] = table[0].clubId
    runnersUp[String(division)] = table[1].clubId
    const champion = getClub(state, table[0].clubId)
    payPrize(state, champion, DIVISION_PRIZE[division], `Campeão da ${division}ª divisão`, { kind: 'division', division })
    payPrize(state, getClub(state, table[1].clubId), DIVISION_PRIZE[division] * DIVISION_RUNNER_UP_SHARE,
      `Vice-campeão da ${division}ª divisão`, { kind: 'division-runner-up', division })
  }
  const topScorer = state.clubs.flatMap((club) => club.players).sort((a, b) => b.goals - a.goals || b.strength - a.strength)[0]
  const scorerClub = state.clubs.find((club) => club.players.some((player) => player.id === topScorer.id))!
  const bestAttack = [...tableEntries].sort((a, b) => b.goalsFor - a.goalsFor || a.clubId.localeCompare(b.clubId))[0]
  const bestDefence = [...tableEntries].sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.clubId.localeCompare(b.clubId))[0]
  const bestAttackClub = getClub(state, bestAttack.clubId)
  const bestDefenceClub = getClub(state, bestDefence.clubId)
  payPrize(state, scorerClub, TOP_SCORER_PRIZE, `Prêmio de artilheiro: ${topScorer.name}`, { kind: 'top-scorer' })
  payPrize(state, bestAttackClub, BEST_ATTACK_PRIZE, 'Melhor ataque da temporada', { kind: 'best-attack' })
  payPrize(state, bestDefenceClub, BEST_DEFENCE_PRIZE, 'Melhor defesa da temporada', { kind: 'best-defence' })
  const managerClub = getManagerClub(state)
  const managerPosition = getTable(state, managerClub.division).findIndex((entry) => entry.clubId === managerClub.id) + 1
  const cupChampionId = state.cup.championId ?? champions['1']
  const libertadoresChampionId = state.libertadores?.championId
  const libertadoresQualifiedIds = getTable(state, 1).slice(0, 4).map((entry) => entry.clubId)
  const award: SeasonAwards = {
    season: state.season,
    champions,
    runnersUp,
    cupChampionId,
    libertadoresChampionId,
    libertadoresQualifiedIds,
    topScorerId: topScorer.id,
    topScorerGoals: topScorer.goals,
    bestAttackClubId: bestAttack.clubId,
    bestAttackGoals: bestAttack.goalsFor,
    bestDefenceClubId: bestDefence.clubId,
    bestDefenceGoalsAgainst: bestDefence.goalsAgainst,
    managerClubId: managerClub.id,
    managerPosition,
  }
  state.awards.push(award)
  state.manager.history.push({
    season: state.season,
    clubId: managerClub.id,
    division: managerClub.division,
    position: managerPosition,
    note: managerPosition <= 2 ? 'Acesso ou título' : managerPosition >= 7 ? 'Rebaixamento' : 'Permanência',
  })
  if (champions[String(managerClub.division)] === managerClub.id) {
    state.manager.trophies += 1
    state.manager.reputation = clamp(state.manager.reputation + 8, 10, 100)
  }
  if (cupChampionId === managerClub.id) {
    state.manager.trophies += 1
    state.manager.reputation = clamp(state.manager.reputation + 10, 10, 100)
  }
  if (libertadoresChampionId === managerClub.id) {
    state.manager.trophies += 1
    state.manager.reputation = clamp(state.manager.reputation + 12, 10, 100)
  }

  state.manager.dismissed = state.manager.boardConfidence < 25 || managerClub.cash < -2_500_000
  state.manager.offers = createJobOffers(state)
  state.phase = 'season-end'
  state.news.unshift(`Fim da temporada ${state.season}: ${getClub(state, champions['1']).name} é campeão da 1ª divisão.`)
  if (state.manager.dismissed) state.news.unshift(`Chicotada psicológica: a diretoria do ${managerClub.name} demitiu ${state.manager.name}.`)
}

function startRoundForClubIds(original: GameState, managedClubIds: readonly string[]): EngineResult {
  if (original.phase !== 'pre-round') return failure('A jornada não pode começar agora.')
  if (original.currentRound < 1 || original.currentRound > 14) return failure('Não há jornada disponível.')
  for (const clubId of managedClubIds) {
    const lineupError = validateLineup(getClub(original, clubId))
    if (lineupError) return failure(lineupError)
  }
  const state = cloneState(original)
  const managedClubs = new Set(managedClubIds)
  const allClubs = [...state.clubs, ...(state.libertadores?.invitedClubs ?? [])]
  for (const club of allClubs) {
    if (!managedClubs.has(club.id)) Object.assign(club, autoPickLineup(club))
  }
  const event = state.activeCompetition
  const competition: Competition = event?.competition ?? 'league'
  const fixtures = event
    ? competitionFixtures(state, event)
    : state.leagues.flatMap((league) => league.rounds[state.currentRound - 1] ?? [])
  const participatingClubs = fixtures.flatMap((fixture) => [getCompetitionClub(state, fixture.homeId), getCompetitionClub(state, fixture.awayId)])
  tickUnavailablePlayers(participatingClubs)
  const matches: PendingMatch[] = []
  for (const fixture of fixtures) {
    const home = getCompetitionClub(state, fixture.homeId)
    const away = getCompetitionClub(state, fixture.awayId)
    const simulated = simulateFirstHalf(state.rngState, home, away, getAttendanceLeaguePosition(state, home))
    state.rngState = simulated.rngState
    applyAutomaticInjurySubstitutions(home, away, simulated.pending.events)
    matches.push({ ...simulated.pending, fixtureId: fixture.id })
  }
  state.pendingMatchDay = {
    round: state.currentRound,
    competition,
    title: event?.title ?? 'CAMPEONATO BRASILEIRO',
    roundName: event?.roundName ?? `${state.currentRound}ª JORNADA`,
    matches,
    substitutionsUsed: 0,
    substitutionsByClub: Object.fromEntries(managedClubIds.map((clubId) => [clubId, 0])),
  }
  state.phase = 'first-half'
  return success(state)
}

export function startRound(original: GameState): EngineResult {
  return startRoundForClubIds(original, [original.manager.clubId])
}

export function startRoundForManagedClubs(original: GameState, managedClubIds: readonly string[]): EngineResult {
  return startRoundForClubIds(original, managedClubIds)
}

export function confirmManagerRegistration(original: GameState): EngineResult {
  if (original.phase !== 'manager-registration') return failure('Os treinadores já foram confirmados.')
  const state = cloneState(original)
  state.phase = 'cup-draw'
  return success(state)
}

export function completeCupDraw(original: GameState): EngineResult {
  if (original.phase !== 'cup-draw') return failure('O sorteio da Copa não está em curso.')
  const state = cloneState(original)
  state.phase = state.market.length > 0 ? 'auction' : 'pre-round'
  return success(state)
}

export function submitAuctionOffer(original: GameState, salary?: number): EngineResult {
  if (original.phase !== 'auction') return failure('O leilão de ordenados não está aberto.')
  if (original.auctionResult) return failure('Confirme primeiro o resultado deste leilão.')
  const listing = original.market[0]
  if (!listing) return failure('Não existem jogadores em leilão.')
  if (salary !== undefined && (!Number.isFinite(salary) || salary < listing.minimumSalary || salary > 64_000)) {
    return failure(`O ordenado deve ficar entre ${listing.minimumSalary} e 64000.`)
  }
  if (salary !== undefined) {
    const eligibilityError = getAuctionBidEligibilityError(original, listing, original.manager.clubId)
    if (eligibilityError) return failure(eligibilityError)
  }
  const state = cloneState(original)
  state.auctionResult = resolveAuctionListing(state, listing.id, salary)
  state.market = state.market.slice(1)
  state.bid = undefined
  return success(state)
}

export function acknowledgeAuctionResult(original: GameState): EngineResult {
  if (original.phase !== 'auction' || !original.auctionResult) return failure('Não existe resultado para confirmar.')
  const state = cloneState(original)
  state.auctionResult = undefined
  if (state.market.length === 0) state.phase = 'pre-round'
  return success(state)
}

export function reachHalfTime(original: GameState): EngineResult {
  if (original.phase !== 'first-half') return failure('A primeira parte não está em curso.')
  const state = cloneState(original)
  state.phase = 'half-time'
  return success(state)
}

function finishRoundForClubIds(original: GameState, managedClubIds: readonly string[]): EngineResult {
  if (original.phase !== 'half-time' || !original.pendingMatchDay) return failure('Não existe uma jornada no intervalo.')
  for (const clubId of managedClubIds) {
    const lineupError = validateLineup(getClub(original, clubId))
    if (lineupError) return failure(lineupError)
  }
  const state = cloneState(original)
  const competition = state.pendingMatchDay?.competition ?? 'league'
  const completedResults: Fixture[] = []
  for (const pending of state.pendingMatchDay?.matches ?? []) {
    const home = getCompetitionClub(state, pending.homeId)
    const away = getCompetitionClub(state, pending.awayId)
    const simulation = simulateSecondHalf(state.rngState, home, away, pending)
    state.rngState = simulation.rngState
    applyAutomaticInjurySubstitutions(home, away, simulation.result.events)
    const fixture = getMutableFixture(state, pending.fixtureId)
    fixture.result = state.activeCompetition?.stage === 'knockout' ? addKnockoutPenalties(state, simulation.result) : simulation.result
    completedResults.push(structuredClone(fixture))
    applyResult(state, home, away, fixture.result, [...new Set([...pending.homeLineup, ...home.lineup])], [...new Set([...pending.awayLineup, ...away.lineup])], competition)
  }
  if (competition === 'league') {
    const bettingRegulationChange = advanceBettingRegulation(state)
    processRoundFinances(state, completedResults)
    const transferMessages: RoundReport['transferMessages'] = []
    const headlines = [...state.news.slice(0, 2)]
    const relevantInjuries = injuryMessages(state, completedResults, managedClubIds)
    state.lastReport = { leagueResults: completedResults, cupResults: [], libertadoresResults: [], transferMessages, headlines, injuryMessages: relevantInjuries,
      ...(bettingRegulationChange ? { bettingRegulationChange } : {}) }
    state.injuryNoticePending = relevantInjuries.length > 0 || undefined
  } else if (state.activeCompetition) {
    completeCompetitionRound(state, state.activeCompetition, completedResults.map((result) => getMutableFixture(state, result.id)))
    updateCompetitionReport(state, state.activeCompetition, completedResults, managedClubIds)
  }

  for (const club of [...state.clubs, ...(state.libertadores?.invitedClubs ?? [])]) Object.assign(club, autoPickLineup(club))
  state.phase = 'second-half'
  return success(state)
}

export function finishRound(original: GameState): EngineResult {
  return finishRoundForClubIds(original, [original.manager.clubId])
}

export function finishRoundForManagedClubs(original: GameState, managedClubIds: readonly string[]): EngineResult {
  return finishRoundForClubIds(original, managedClubIds)
}

export function showStandings(original: GameState): EngineResult {
  if (original.phase !== 'second-half') return failure('A segunda parte ainda não terminou.')
  const state = cloneState(original)
  state.phase = (state.pendingMatchDay?.competition ?? 'league') === 'league' ? 'standings' : 'competition-results'
  state.pendingMatchDay = undefined
  return success(state)
}

export function acknowledgeInjuryNotice(original: GameState): EngineResult {
  if (!original.injuryNoticePending) return failure('Não existem lesões para confirmar.')
  const state = cloneState(original)
  state.injuryNoticePending = undefined
  return success(state)
}

function prepareNextLeagueRound(state: GameState, managedClubIds: readonly string[]): void {
  state.activeCompetition = undefined
  state.competitionQueue = []
  if (state.currentRound === 14) {
    finalizeSeason(state)
    return
  }
  state.currentRound += 1
  evaluateSalaryDemands(state, managedClubIds)
  prepareMarket(state, managedClubIds)
  state.auctionResult = undefined
  state.phase = state.market.length > 0 ? 'auction' : 'pre-round'
}

function advanceCompetitionQueue(state: GameState, managedClubIds: readonly string[]): void {
  const managed = new Set(managedClubIds)
  while ((state.competitionQueue?.length ?? 0) > 0) {
    const event = state.competitionQueue?.shift()
    if (!event) break
    const fixtures = competitionFixtures(state, event)
    const managedParticipates = fixtures.some((fixture) => managed.has(fixture.homeId) || managed.has(fixture.awayId))
    if (managedParticipates) {
      state.activeCompetition = event
      state.phase = 'pre-round'
      return
    }
    simulateCompetitionRoundFast(state, event)
  }
  prepareNextLeagueRound(state, managedClubIds)
}

function advanceAfterStandingsForClubIds(original: GameState, managedClubIds: readonly string[]): EngineResult {
  if (original.phase !== 'standings') return failure('A classificação não está aberta.')
  const state = cloneState(original)
  if (managedClubIds.some((clubId) => bettingRegulationNotice(state, clubId))) {
    state.phase = 'sponsorship-notice'
    return success(state)
  }
  state.competitionQueue = scheduledCompetitionEvents(state)
  advanceCompetitionQueue(state, managedClubIds)
  return success(state)
}

export function advanceAfterStandings(original: GameState): EngineResult {
  return advanceAfterStandingsForClubIds(original, [original.manager.clubId])
}

export function advanceAfterStandingsForManagedClubs(original: GameState, managedClubIds: readonly string[]): EngineResult {
  return advanceAfterStandingsForClubIds(original, managedClubIds)
}

export function acknowledgeSponsorshipNotice(original: GameState, managedClubIds: readonly string[] = [original.manager.clubId]): EngineResult {
  if (original.phase !== 'sponsorship-notice') return failure('Não há comunicado de patrocínio aberto.')
  const state = cloneState(original)
  state.competitionQueue = scheduledCompetitionEvents(state)
  advanceCompetitionQueue(state, managedClubIds)
  return success(state)
}

function advanceAfterCompetitionResultsForClubIds(original: GameState, managedClubIds: readonly string[]): EngineResult {
  if (original.phase !== 'competition-results') return failure('Os resultados da competição não estão abertos.')
  const state = cloneState(original)
  state.activeCompetition = undefined
  advanceCompetitionQueue(state, managedClubIds)
  return success(state)
}

export function advanceAfterCompetitionResults(original: GameState): EngineResult {
  return advanceAfterCompetitionResultsForClubIds(original, [original.manager.clubId])
}

export function advanceAfterCompetitionResultsForManagedClubs(original: GameState, managedClubIds: readonly string[]): EngineResult {
  return advanceAfterCompetitionResultsForClubIds(original, managedClubIds)
}

export function chooseTacticAndStart(original: GameState, tactic: TacticId): EngineResult {
  const tactical = setTactic(original, tactic)
  return tactical.ok ? startRound(tactical.state) : tactical
}

export function setTactic(original: GameState, tactic: TacticId): EngineResult {
  if (!TACTICS.some((candidate) => candidate.id === tactic)) return failure('Tática inválida.')
  if (original.phase === 'season-end') return failure('Inicie a nova temporada antes de alterar a tática.')
  if (!getAvailableTactics(getManagerClub(original)).some((candidate) => candidate.id === tactic)) {
    return failure('Não há jogadores disponíveis para esta tática.')
  }
  const state = cloneState(original)
  const club = getManagerClub(state)
  club.tactic = tactic
  if (state.phase === 'pre-round') Object.assign(club, autoPickLineup(club, tactic))
  return success(state)
}

export function swapStarter(original: GameState, outId: string, inId: string): EngineResult {
  if (original.phase !== 'pre-round') return failure('Use a substituição do intervalo durante a partida.')
  const state = cloneState(original)
  const club = getManagerClub(state)
  const changed = replaceStarter(club, outId, inId)
  const error = validateLineup(changed)
  if (error) return failure(error)
  Object.assign(club, changed)
  return success(state)
}

export function makeHalfTimeSubstitution(original: GameState, outId: string, inId: string): EngineResult {
  if (original.phase !== 'half-time' || !original.pendingMatchDay) return failure('As substituições só podem ser feitas no intervalo.')
  const managerClubId = original.manager.clubId
  const substitutionsUsed = original.pendingMatchDay.substitutionsByClub?.[managerClubId]
    ?? original.pendingMatchDay.substitutionsUsed
  if (substitutionsUsed >= 3) return failure('As três substituições do intervalo já foram usadas.')
  const state = cloneState(original)
  const club = getManagerClub(state)
  const outgoing = club.players.find((player) => player.id === outId)
  const incoming = club.players.find((player) => player.id === inId)
  if (!outgoing || !incoming) return failure('Escolha dois jogadores válidos.')
  const changed = replaceStarter(club, outId, inId)
  const error = validateLineup(changed)
  if (error) return failure(error)
  Object.assign(club, changed)
  state.pendingMatchDay!.substitutionsUsed = substitutionsUsed + 1
  state.pendingMatchDay!.substitutionsByClub = {
    ...state.pendingMatchDay!.substitutionsByClub,
    [club.id]: substitutionsUsed + 1,
  }
  const managerMatch = state.pendingMatchDay!.matches.find((match) => match.homeId === club.id || match.awayId === club.id)
  managerMatch?.events.push({ minute: 46, type: 'substitution', clubId: club.id, playerId: inId, playerName: incoming.name, detail: `entra por ${outgoing.name}` })
  return success(state)
}

export function placeTransferBid(original: GameState, listingId: string, salary: number): EngineResult {
  if (original.phase !== 'auction' && original.phase !== 'pre-round') return failure('O leilão está fechado durante a partida.')
  const listing = original.market.find((candidate) => candidate.id === listingId)
  if (!listing) return failure('Jogador não está mais no mercado.')
  const club = getManagerClub(original)
  const eligibilityError = getAuctionBidEligibilityError(original, listing, club.id)
  if (eligibilityError) return failure(eligibilityError)
  if (!Number.isFinite(salary) || salary < listing.minimumSalary || salary > 64_000) return failure(`O ordenado deve ficar entre Cr$ ${listing.minimumSalary.toLocaleString('pt-BR')} e Cr$ 64.000.`)
  const state = cloneState(original)
  state.bid = { listingId, salary: Math.round(salary / 50) * 50 }
  return success(state)
}

export function sellPlayer(original: GameState, playerId: string, managedClubIds: readonly string[] = []): EngineResult {
  if (original.phase !== 'pre-round') return failure('Negocie jogadores antes da jornada.')
  const state = cloneState(original)
  const result = sellPlayerToAi(state, playerId, managedClubIds)
  if (!result.ok) return failure(result.error)
  state.playerSaleResults = {
    ...state.playerSaleResults,
    [state.manager.clubId]: result.result,
  }
  state.news.unshift(result.message)
  return success(state, result.message)
}

export function acknowledgePlayerSale(original: GameState): EngineResult {
  if (!original.playerSaleResults?.[original.manager.clubId]) return failure('Não existe uma venda para confirmar.')
  const state = cloneState(original)
  delete state.playerSaleResults?.[state.manager.clubId]
  if (state.playerSaleResults && Object.keys(state.playerSaleResults).length === 0) state.playerSaleResults = undefined
  return success(state)
}

export function renewPlayerContract(original: GameState, playerId: string, offeredSalary: number): EngineResult {
  if (original.phase !== 'pre-round') return failure('Renove contratos antes da jornada.')
  const currentClub = getManagerClub(original)
  const currentPlayer = currentClub.players.find((player) => player.id === playerId)
  if (!currentPlayer) return failure('Jogador não encontrado no plantel.')
  if (isSaleProtected(currentPlayer)) return failure(`${currentPlayer.name} já está protegido por contrato.`)
  const minimumSalary = getContractSalaryDemand(currentPlayer)
  if (!Number.isFinite(offeredSalary) || offeredSalary < minimumSalary || offeredSalary > 64_000) {
    return failure(`${currentPlayer.name} pede entre Cr$ ${minimumSalary.toLocaleString('pt-BR')} e Cr$ 64.000.`)
  }

  const state = cloneState(original)
  const player = getManagerClub(state).players.find((candidate) => candidate.id === playerId)
  if (!player) return failure('Jogador não encontrado no plantel.')
  player.salary = Math.round(offeredSalary / 50) * 50
  setPlayerContract(player)
  player.morale = clamp(player.morale + 6, 20, 100)
  state.market = state.market.filter((listing) => listing.playerId !== player.id)
  const message = `${player.name.toUpperCase()} RENOVOU POR 1 ANO. NOVO ORDENADO: Cr$ ${player.salary.toLocaleString('pt-BR')}.`
  state.news.unshift(message)
  return success(state, message)
}

export function setTicketPrice(original: GameState, price: number): EngineResult {
  if (!Number.isFinite(price) || price < 5 || price > 100) return failure('O ingresso deve custar entre Cr$ 5 e Cr$ 100.')
  const state = cloneState(original)
  getManagerClub(state).ticketPrice = Math.round(price)
  return success(state)
}

export function repairStadium(original: GameState): EngineResult {
  const state = cloneState(original)
  const error = repairClubStadium(state, getManagerClub(state))
  return error ? failure(error) : success(state)
}

export function expandStadium(original: GameState, seats: 1000 | 5000): EngineResult {
  const state = cloneState(original)
  const error = expandClubStadium(state, getManagerClub(state), seats)
  return error ? failure(error) : success(state)
}

export function acceptJobOffer(original: GameState, clubId: string): EngineResult {
  if (original.phase !== 'season-end') return failure('Não há propostas disponíveis agora.')
  if (!original.manager.offers.some((offer) => offer.clubId === clubId)) return failure('Essa proposta não está disponível.')
  const state = cloneState(original)
  const oldClub = getManagerClub(state)
  const newClub = getClub(state, clubId)
  state.manager.clubId = clubId
  state.manager.dismissed = false
  state.manager.boardConfidence = 62
  state.news.unshift(`${state.manager.name} deixa o ${oldClub.name} e assume o ${newClub.name}.`)
  return success(state)
}

function applyPromotionsAndRelegations(state: GameState): void {
  const nextDivision = new Map<string, Division>()
  for (const club of state.clubs) nextDivision.set(club.id, club.division)
  for (const division of [1, 2, 3, 4] as Division[]) {
    const table = getTable(state, division)
    if (division > 1) {
      for (const entry of table.slice(0, 2)) nextDivision.set(entry.clubId, (division - 1) as Division)
    }
    if (division < 4) {
      for (const entry of table.slice(-2)) nextDivision.set(entry.clubId, (division + 1) as Division)
    }
  }
  const managerClub = getManagerClub(state)
  const promoted = (nextDivision.get(managerClub.id) ?? managerClub.division) < managerClub.division
  if (promoted) state.manager.promotions += 1
  for (const club of state.clubs) club.division = nextDivision.get(club.id) ?? club.division
}

function developPlayers(state: GameState): void {
  for (const club of state.clubs) {
    for (const player of club.players) {
      agePlayer(player)
      player.fitness = 100
      player.morale = 72
      player.goals = 0
      player.appearances = 0
      player.yellowCards = 0
      player.injuryRounds = 0
      player.suspensionRounds = 0
      player.value = calculatePlayerValue(player.strength, player.age)
    }
    club.form = []
    Object.assign(club, autoPickLineup(club))
  }
}

export function startNextSeason(original: GameState, managedClubIds: readonly string[] = [original.manager.clubId]): EngineResult {
  if (original.phase !== 'season-end') return failure('A temporada atual ainda não terminou.')
  if (original.manager.dismissed) return failure('Escolha uma das propostas antes de continuar.')
  const state = cloneState(original)
  const qualifiedForLibertadores = state.awards.at(-1)?.libertadoresQualifiedIds
    ?? getTable(state, 1).slice(0, 4).map((entry) => entry.clubId)
  applyPromotionsAndRelegations(state)
  const sponsorship = state.sponsorship ??= createSponsorshipState(state.seed)
  sponsorship.proposals = Object.fromEntries(state.clubs.map((club) => [club.id, createSponsorshipProposal(original, club)]))
  sponsorship.pendingClubIds = [...new Set(managedClubIds)]
  for (const club of state.clubs) {
    if (managedClubIds.includes(club.id)) {
      club.sponsorship = undefined
      club.sponsorPerRound = 0
    } else signSponsorship(club, bestSafeSponsorship(sponsorship.proposals[club.id]))
  }
  developPlayers(state)
  state.season += 1
  renewSquads(state, managedClubIds)
  state.currentRound = 1
  state.leagues = createAllLeagues(state.clubs)
  const cup = createCup(state.rngState, state.clubs.map((club) => club.id))
  state.cup = cup.cup
  state.rngState = cup.rngState
  const libertadores = createLibertadores(state.rngState, state.season, qualifiedForLibertadores)
  state.libertadores = libertadores.libertadores
  state.rngState = libertadores.rngState
  evaluateSalaryDemands(state, managedClubIds)
  prepareMarket(state, managedClubIds)
  state.manager.offers = []
  state.manager.boardConfidence = clamp(state.manager.boardConfidence + 12, 35, 80)
  state.auctionResult = undefined
  state.activeCompetition = undefined
  state.competitionQueue = []
  state.pendingMatchDay = undefined
  beginPreseason(state)
  if (sponsorship.pendingClubIds.length > 0) state.phase = 'sponsorship'
  state.lastReport = undefined
  state.news.unshift(`Começa a temporada ${state.season}. O mercado e a Copa do Brasil foram sorteados.`)
  return success(state)
}

export function acceptSponsorshipOffer(original: GameState, offerId: string): EngineResult {
  if (original.phase !== 'sponsorship' || !original.sponsorship?.pendingClubIds.includes(original.manager.clubId)) {
    return failure('Não há contrato de patrocínio para escolher agora.')
  }
  const proposal = getAvailableSponsorshipProposal(original, original.manager.clubId)
  const offer = proposal?.offers.find((candidate) => candidate.id === offerId && candidate.season === original.season)
  if (!offer) return failure('Essa proposta de patrocínio não está disponível para o seu clube.')
  const state = cloneState(original)
  const club = getManagerClub(state)
  state.sponsorship!.proposals[club.id] = structuredClone(proposal!)
  signSponsorship(club, offer)
  state.sponsorship!.pendingClubIds = state.sponsorship!.pendingClubIds.filter((id) => id !== club.id)
  if (state.sponsorship!.pendingClubIds.length === 0) beginPreseason(state)
  return success(state, `Patrocínio de ${getSponsorBrand(offer.brandId).name} assinado até o fim de ${state.season}.`)
}
