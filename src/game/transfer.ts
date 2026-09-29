import { seasonOperatingReserve } from './clubOperations'
import { AFFORDABLE_AUCTION_FEE, MAX_SQUAD_SIZE, MIN_SQUAD_SIZE, TACTICS } from './constants'
import { canPlayerDemandRaise, isSaleProtected, setPlayerContract } from './contracts'
import { calculateAiAuctionSalary, calculateAuctionFee, calculatePlayerSalary, calculateRegularAuctionMinimum, normalizeSalaryOffer } from './economy'
import { isNeymarEasterEgg } from './easterEggs'
import { INTERNATIONAL_SELLER_ID } from './international'
import { autoPickLineup } from './lineup'
import { random, shuffle } from './rng'
import type { Club, GameState, MarketListing, Player, Position, TransferMessage } from './types'

export type PlayerSaleQuote =
  | { ok: true; buyerId: string; fee: number; nextRngState: number }
  | { ok: false; error: string }

export type PlayerSaleResult =
  | { ok: true; message: string; result: TransferMessage }
  | { ok: false; error: string }

export function getAuctionSeller(state: GameState, sellerId: string): Pick<Club, 'id' | 'name' | 'shortName' | 'primary' | 'secondary'> | undefined {
  if (sellerId === INTERNATIONAL_SELLER_ID) return { id: sellerId, name: 'EXTERIOR', shortName: 'EXTERIOR', primary: '#ffffff', secondary: '#000000' }
  return state.clubs.find((club) => club.id === sellerId)
}

export function getMarketPlayer(state: GameState, listing: MarketListing): Player | undefined {
  if (listing.sellerId !== INTERNATIONAL_SELLER_ID) {
    return state.clubs.find((club) => club.id === listing.sellerId)?.players.find((player) => player.id === listing.playerId)
  }
  const player = listing.internationalPlayer
  if (!player || player.id !== listing.playerId) return undefined
  const clubs = [...state.clubs, ...(state.libertadores?.invitedClubs ?? [])]
  if (clubs.some((club) => club.players.some((current) => current.id === player.id || current.sourceId === player.sourceId))) return undefined
  return player
}

export function getAuctionBidEligibilityError(state: GameState, listing: MarketListing, clubId: string): string | undefined {
  const club = state.clubs.find((candidate) => candidate.id === clubId)
  if (!club) return 'Clube não encontrado.'
  if (listing.sellerId === club.id) return undefined
  if (club.players.length >= MAX_SQUAD_SIZE) return `Plantel cheio (${MAX_SQUAD_SIZE} jogadores). Venda alguém antes de licitar.`
  if (club.cash < listing.fee) {
    return `Dinheiro insuficiente: preço Cr$ ${listing.fee.toLocaleString('pt-BR')}; caixa Cr$ ${club.cash.toLocaleString('pt-BR')}.`
  }
  return undefined
}

export function getContractSalaryDemand(player: Player): number {
  const fairSalary = calculatePlayerSalary(player.strength, player.age)
  const requestedSalary = Math.max(fairSalary, player.salary * 1.1)
  return Math.min(64_000, Math.max(player.salary + 50, Math.round(requestedSalary / 50) * 50))
}

export function canLeaveClub(club: Club, player: Player): boolean {
  const reserved = !player.neymarAuctionPending && club.players.some((candidate) => candidate.neymarAuctionPending) ? 1 : 0
  if (club.players.length <= MIN_SQUAD_SIZE + reserved) return false
  return player.position !== 'G' || club.players.filter((candidate) => candidate.position === 'G').length > 1
}

export function recordTransferPayment(state: GameState, seller: Club, buyer: Club, player: Player, fee: number): void {
  seller.cash += fee
  buyer.cash -= fee
  const id = `ledger-transfer-${state.season}-${state.currentRound}-${state.ledger.length}`
  state.ledger.push(
    { id: `${id}-buy`, season: state.season, round: state.currentRound, clubId: buyer.id, type: 'transfer', amount: -fee, description: `Compra de ${player.name} ao ${seller.name}` },
    { id: `${id}-sell`, season: state.season, round: state.currentRound, clubId: seller.id, type: 'transfer', amount: fee, description: `Venda de ${player.name} ao ${buyer.name}` },
  )
}

/** Commit an already validated auction winner in either the solo or shared room engine. */
export function completeAuctionTransfer(state: GameState, listing: MarketListing, player: Player, buyer: Club, salary: number): void {
  const seller = state.clubs.find((club) => club.id === listing.sellerId)
  if (getMarketPlayer(state, listing)?.id !== player.id || (!seller && listing.sellerId !== INTERNATIONAL_SELLER_ID)) {
    throw new Error('A proposta deixou de estar disponível.')
  }
  const transferred = { ...player, salary, listed: false, morale: 78 }
  setPlayerContract(transferred)
  if (seller) {
    seller.players = seller.players.filter((candidate) => candidate.id !== player.id)
    recordTransferPayment(state, seller, buyer, player, listing.fee)
    Object.assign(seller, autoPickLineup(seller))
  } else {
    buyer.cash -= listing.fee
    state.ledger.push({
      id: `ledger-transfer-${state.season}-${state.currentRound}-${state.ledger.length}-buy`,
      season: state.season, round: state.currentRound, clubId: buyer.id, type: 'transfer', amount: -listing.fee,
      description: `Compra de ${player.name} do exterior`, externalTransfer: true,
    })
  }
  buyer.players.push(transferred)
  Object.assign(buyer, autoPickLineup(buyer))
}

export function canAiAffordTransfer(club: Club, fee: number, salary: number): boolean {
  return club.players.length < MAX_SQUAD_SIZE && club.cash - fee >= seasonOperatingReserve(club, salary)
}

function startingPlaces(club: Club, position: Position): number {
  const tactic = TACTICS.find((candidate) => candidate.id === club.tactic)!
  return position === 'G' ? 1 : position === 'D' ? tactic.defenders : position === 'M' ? tactic.midfielders : tactic.attackers
}

/** Sporting need is independent of cash: cash only decides whether a deal is affordable. */
export function getAiTransferInterest(club: Club, player: Player): number {
  const starters = startingPlaces(club, player.position)
  if (starters === 0) return 0
  const depth = starters + (player.position === 'G' ? 1 : 2)
  const teammates = club.players.filter((candidate) => candidate.position === player.position)
    .sort((left, right) => right.strength - left.strength)
  const target = 55 - club.division * 10
  const starterStrength = teammates[starters - 1]?.strength ?? Math.min(target - 10, teammates[0]?.strength ?? 0)
  const reserveStrength = teammates[depth - 1]?.strength
  const starterImprovement = Math.max(0, player.strength - starterStrength)
  const depthImprovement = reserveStrength === undefined
    ? Math.max(0, player.strength - Math.min(target - 12, starterStrength - 8))
    : Math.max(0, player.strength - reserveStrength - 2)
  const tierFit = Math.exp(-(((player.strength - target) / 12) ** 2))
  return (starterImprovement * 3 + depthImprovement) * tierFit
}

export function getAiAuctionCandidates(
  state: GameState,
  listing: MarketListing,
  player: Player,
  salary: number,
  managedClubIds: readonly string[] = [state.manager.clubId],
): Club[] {
  if (salary < listing.minimumSalary) return []
  return state.clubs.filter((club) => club.id !== listing.sellerId
    && !managedClubIds.includes(club.id)
    && canAiAffordTransfer(club, listing.fee, salary)
    && getAiTransferInterest(club, player) > 0)
    .sort((left, right) => getAiTransferInterest(right, player) - getAiTransferInterest(left, player) || left.id.localeCompare(right.id))
}

function chooseInterestedBuyer(rngState: number, candidates: Club[], player: Player): { buyer?: Club; rngState: number } {
  const weights = candidates.map((club) => getAiTransferInterest(club, player))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return { rngState }
  const roll = random(rngState)
  let threshold = roll.value * total
  for (let index = 0; index < candidates.length; index++) {
    threshold -= weights[index]
    if (threshold < 0) return { buyer: candidates[index], rngState: roll.state }
  }
  return { buyer: candidates.at(-1), rngState: roll.state }
}

export function selectAiTransferBuyer(state: GameState, candidates: Club[], player: Player): Club | undefined {
  const selected = chooseInterestedBuyer(state.rngState, candidates, player)
  state.rngState = selected.rngState
  return selected.buyer
}

/** Move unwanted AI depth to clubs that can use it, making space for future reinforcements. */
export function rebalanceAiSquads(state: GameState, managedClubIds: readonly string[] = [state.manager.clubId]): void {
  const protectedClubs = new Set(managedClubIds)
  const queuedPlayers = new Set(state.market.map((listing) => listing.playerId))
  const sellers = state.clubs.filter((club) => !protectedClubs.has(club.id))
    .sort((left, right) => right.players.length - left.players.length || left.id.localeCompare(right.id))
  for (const seller of sellers) {
    if (seller.players.length <= 18) continue
    const surplus = [...seller.players].sort((left, right) => left.strength - right.strength || right.age - left.age || left.id.localeCompare(right.id))
    for (const player of surplus) {
      if (seller.players.length <= 18) break
      if (player.neymarAuctionPending || player.listed || isSaleProtected(player) || queuedPlayers.has(player.id) || !canLeaveClub(seller, player)) continue
      const positionPlayers = seller.players.filter((candidate) => candidate.position === player.position)
        .sort((left, right) => right.strength - left.strength || left.id.localeCompare(right.id))
      // Keep the starting side and a reserve in every position the tactic uses.
      if (positionPlayers.findIndex((candidate) => candidate.id === player.id) < startingPlaces(seller, player.position) + 1) continue
      const salary = calculatePlayerSalary(player.strength, player.age)
      const listing: MarketListing = {
        id: `ai-transfer-${state.season}-${state.currentRound}-${player.id}`, sellerId: seller.id, playerId: player.id,
        fee: calculateAuctionFee(player.value), minimumSalary: salary, expiresAfterRound: state.currentRound,
      }
      const buyer = selectAiTransferBuyer(state, getAiAuctionCandidates(state, listing, player, salary, managedClubIds), player)
      if (buyer) completeAuctionTransfer(state, listing, player, buyer, salary)
    }
  }
}

export function createMarketListings(
  rngState: number,
  clubs: Club[],
  protectedClubIds: string | readonly string[],
  round: number,
): { listings: MarketListing[]; rngState: number } {
  const protectedClubs = new Set(Array.isArray(protectedClubIds) ? protectedClubIds : [protectedClubIds])
  const selfListedCandidates = clubs
    .flatMap((club) => club.players
      .filter((player) => !player.neymarAuctionPending && canPlayerDemandRaise(player) && player.listed && canLeaveClub(club, player))
      .map((player) => ({ club, player, selfListed: true })))
  const regularCandidates = clubs
    .filter((club) => !protectedClubs.has(club.id))
    .flatMap((club) => club.players
      .filter((player) => (!player.neymarAuctionPending || round === 3) && !isSaleProtected(player) && !player.listed && canLeaveClub(club, player))
      .map((player) => ({ club, player, selfListed: false })))
  // Prefer players another squad can use. Interest uses talent needs only, so
  // neither rich nor indebted managers change the market's prices or supply.
  const hasDemand = ({ club: seller, player }: (typeof regularCandidates)[number]): boolean => clubs.some((club) => club.id !== seller.id && club.players.length < MAX_SQUAD_SIZE && getAiTransferInterest(club, player) > 0)
  const listedShuffle = shuffle(rngState, selfListedCandidates)
  const regularShuffle = shuffle(listedShuffle.state, regularCandidates)
  const demand = new Set(regularCandidates.filter(hasDemand).map(({ player }) => player.id))
  const usefulRegulars = regularShuffle.value.filter(({ player }) => demand.has(player.id))
  const eliteCandidates = [...listedShuffle.value, ...regularShuffle.value].filter(({ player }) => player.strength >= 40)
  const eliteRoll = random(regularShuffle.state)
  const elite = eliteCandidates[Math.floor(eliteRoll.value * eliteCandidates.length)]
  const ordered = [...listedShuffle.value, ...usefulRegulars]
  const neymar = round === 3 ? regularShuffle.value.find(({ player }) => isNeymarEasterEgg(player) && player.neymarAuctionPending) : undefined
  const secondElite = eliteCandidates.find(({ player }) => player.id !== elite?.player.id && player.id !== neymar?.player.id)
  const featured = [
    ...(neymar ? [neymar] : []),
    ...(elite && elite.player.id !== neymar?.player.id ? [elite] : []),
    ...(secondElite ? [secondElite] : []),
  ].slice(0, 2)
  const remaining = ordered.filter(({ player }) => !featured.some((candidate) => candidate.player.id === player.id))
  // Two affordable places leave room for stars and mid-level reinforcements,
  // instead of funneling most auctions into the poorest division's budgets.
  const affordable = remaining.filter(({ player, selfListed }) => selfListed || calculateAuctionFee(player.value) <= AFFORDABLE_AUCTION_FEE).slice(0, 2)
  const candidates = [...featured, ...affordable, ...remaining.filter(({ player }) => !affordable.some((candidate) => candidate.player.id === player.id))].slice(0, 6)
  const listings = candidates.map(({ club, player, selfListed }, index) => {
    return {
      id: `mercado-${round}-${index + 1}-${player.id}`,
      sellerId: club.id,
      playerId: player.id,
      fee: selfListed ? 0 : calculateAuctionFee(player.value),
      minimumSalary: selfListed ? getContractSalaryDemand(player) : calculateRegularAuctionMinimum(player.salary),
      expiresAfterRound: round,
    }
  })
  return { listings, rngState: eliteRoll.state }
}

export function resolveAuctionListing(
  state: GameState,
  listingId: string,
  offeredSalary?: number,
): TransferMessage {
  const listing = state.market.find((candidate) => candidate.id === listingId)
  const seller = listing ? state.clubs.find((club) => club.id === listing.sellerId) : undefined
  const player = listing ? getMarketPlayer(state, listing) : undefined
  if (!listing || !player || (seller && !canLeaveClub(seller, player))) {
    return { id: `transfer-${state.revision}`, success: false, text: 'A TRANSFERÊNCIA FOI CANCELADA' }
  }
  if (player.neymarAuctionPending) player.neymarAuctionPending = false
  const auction = {
    sellerId: listing.sellerId,
    playerName: player.name,
    nationality: player.nationality,
    position: player.position,
    strength: player.strength,
    fee: listing.fee,
    minimumSalary: listing.minimumSalary,
  }

  const salaryRoll = random(state.rngState)
  state.rngState = salaryRoll.state
  const winningSalary = calculateAiAuctionSalary(listing.minimumSalary, salaryRoll.value, calculatePlayerSalary(player.strength, player.age))
  const normalizedOffer = offeredSalary === undefined ? undefined : normalizeSalaryOffer(offeredSalary)
  const managerClub = state.clubs.find((club) => club.id === state.manager.clubId)
  const managerIsSeller = managerClub?.id === listing.sellerId
  const eligibilityError = managerClub ? getAuctionBidEligibilityError(state, listing, managerClub.id) : 'Clube não encontrado.'
  const aiCandidates = getAiAuctionCandidates(state, listing, player, winningSalary)
  const humanWins = normalizedOffer !== undefined
    && normalizedOffer >= listing.minimumSalary
    && (aiCandidates.length === 0 || normalizedOffer >= winningSalary)
    && Boolean(managerClub)
    && (managerIsSeller || !eligibilityError)

  const buyer = humanWins ? managerClub : selectAiTransferBuyer(state, aiCandidates, player)

  if (!buyer) {
    return { id: `transfer-${state.revision}`, success: false, text: `${player.name.toUpperCase()} NÃO FOI TRANSFERIDO`, auction }
  }

  const salary = humanWins ? normalizedOffer! : winningSalary
  if (seller && buyer.id === seller.id) {
    player.salary = salary
    setPlayerContract(player)
    player.morale = 78
    return {
      id: `transfer-${state.revision}-${player.id}`,
      success: true,
      clubId: seller.id,
      auction,
      text: `${player.name.toUpperCase()} RENOVOU COM O ${seller.name.toUpperCase()}\nNOVO ORDENADO : ${salary.toLocaleString('pt-BR')}`,
    }
  }

  completeAuctionTransfer(state, listing, player, buyer, salary)

  return {
    id: `transfer-${state.revision}-${player.id}`,
    success: humanWins,
    clubId: buyer.id,
    auction,
    text: `TRANSFERIDO PARA O ${buyer.name.toUpperCase()}\nNOVO ORDENADO : ${salary.toLocaleString('pt-BR')}`,
  }
}

export function getPlayerSaleQuote(state: GameState, playerId: string, managedClubIds: readonly string[] = []): PlayerSaleQuote {
  const seller = state.clubs.find((club) => club.id === state.manager.clubId)
  const player = seller?.players.find((candidate) => candidate.id === playerId)
  if (!seller || !player) return { ok: false, error: 'Jogador não encontrado.' }
  if (isSaleProtected(player)) return { ok: false, error: 'Jogador protegido por contrato.' }
  if (seller.players.length <= MIN_SQUAD_SIZE) return { ok: false, error: 'O plantel precisa manter pelo menos 14 jogadores.' }
  if (player.position === 'G' && seller.players.filter((candidate) => candidate.position === 'G').length <= 1) {
    return { ok: false, error: 'O clube precisa manter pelo menos um goleiro.' }
  }
  const offerRoll = random(state.rngState)
  const fee = Math.max(1_000, Math.round(player.value * (0.62 + offerRoll.value * 0.5) / 1_000) * 1_000)
  const possibleBuyers = state.clubs.filter((club) => club.id !== seller.id
    && !managedClubIds.includes(club.id)
    && player.salary <= Math.round(calculatePlayerSalary(player.strength, player.age) * 1.6 / 100) * 100
    && canAiAffordTransfer(club, fee, player.salary)
    && getAiTransferInterest(club, player) > 0)
  if (possibleBuyers.length === 0) return { ok: false, error: 'Nenhum clube apresentou proposta.' }
  const selected = chooseInterestedBuyer(offerRoll.state, possibleBuyers, player)
  return { ok: true, buyerId: selected.buyer!.id, fee, nextRngState: selected.rngState }
}

export function sellPlayerToAi(state: GameState, playerId: string, managedClubIds: readonly string[] = []): PlayerSaleResult {
  const quote = getPlayerSaleQuote(state, playerId, managedClubIds)
  if (!quote.ok) return quote
  const seller = state.clubs.find((club) => club.id === state.manager.clubId)
  const player = seller?.players.find((candidate) => candidate.id === playerId)
  const buyer = state.clubs.find((club) => club.id === quote.buyerId)
  if (!seller || !player || !buyer) return { ok: false, error: 'A proposta deixou de estar disponível.' }
  state.rngState = quote.nextRngState
  const fee = quote.fee
  seller.players = seller.players.filter((candidate) => candidate.id !== player.id)
  const transferred = { ...player, listed: false, morale: 72 }
  setPlayerContract(transferred)
  buyer.players.push(transferred)
  recordTransferPayment(state, seller, buyer, player, fee)
  Object.assign(seller, autoPickLineup(seller))
  Object.assign(buyer, autoPickLineup(buyer))
  const message = `${player.name.toUpperCase()} VENDIDO AO ${buyer.name.toUpperCase()} POR Cr$ ${fee.toLocaleString('pt-BR')}.`
  return {
    ok: true,
    message,
    result: {
      id: `player-sale-${state.revision}-${player.id}`,
      success: true,
      clubId: buyer.id,
      text: message,
      auction: {
        sellerId: seller.id,
        playerName: player.name,
        nationality: player.nationality,
        position: player.position,
        strength: player.strength,
        fee,
        minimumSalary: player.salary,
      },
    },
  }
}

export function evaluateSalaryDemands(state: GameState, managedClubIds: readonly string[] = [state.manager.clubId]): string[] {
  const messages: string[] = []
  for (const club of state.clubs) {
    for (const player of club.players) {
      if (player.neymarAuctionPending || !canPlayerDemandRaise(player)) continue
      const fairSalary = calculatePlayerSalary(player.strength, player.age)
      if (!managedClubIds.includes(club.id)) {
        player.salary = fairSalary
        player.listed = false
        player.morale = Math.min(100, player.morale + 1)
        continue
      }
      if (player.listed) continue
      const salaryRatio = player.salary / Math.max(1, fairSalary)
      if (salaryRatio >= 0.82) {
        player.morale = Math.min(100, player.morale + 1)
        continue
      }
      player.morale = Math.max(20, player.morale - Math.max(2, Math.round((0.82 - salaryRatio) * 16)))
      const demand = getContractSalaryDemand(player)
      if (!canLeaveClub(club, player)) {
        player.salary = demand
        setPlayerContract(player)
        if (club.id === state.manager.clubId) messages.push(`${player.name} teve aumento obrigatório para Cr$ ${demand.toLocaleString('pt-BR')}.`)
        continue
      }
      const decision = random(state.rngState)
      state.rngState = decision.state
      const demandChance = Math.min(0.42, 0.08 + (0.82 - salaryRatio) * 0.9 + Math.max(0, 60 - player.morale) / 250)
      if (decision.value >= demandChance) continue
      player.listed = true
      const message = `${player.name} considera o ordenado injusto, pede Cr$ ${demand.toLocaleString('pt-BR')} e colocou-se no leilão.`
      if (club.id === state.manager.clubId) messages.push(message)
    }
  }
  state.news.unshift(...messages)
  return messages
}
