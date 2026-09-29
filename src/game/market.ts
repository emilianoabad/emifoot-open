import { runAiClubOperations } from './clubOperations'
import { drawInternationalArrival } from './international'
import { createMarketListings, rebalanceAiSquads } from './transfer'
import type { GameState } from './types'

/** Domestic auctions come first; any arrival from abroad closes the same queue. */
export function prepareMarket(state: GameState, managedClubIds: readonly string[]): void {
  const previous = state.internationalMarket
  if (previous && (state.season < previous.lastSeason
    || (state.season === previous.lastSeason && state.currentRound <= previous.lastRound))) return
  runAiClubOperations(state, managedClubIds)
  rebalanceAiSquads(state, managedClubIds)
  const market = createMarketListings(state.rngState, state.clubs, managedClubIds, state.currentRound)
  const domesticPlayers = state.clubs.flatMap((club) => club.players)
  const arrival = drawInternationalArrival(
    state.internationalMarket, state.season, state.currentRound, state.seed,
    [...domesticPlayers, ...(state.libertadores?.invitedClubs ?? []).flatMap((club) => club.players)],
    state.offseason?.targetPlayerCount ?? domesticPlayers.length,
  )
  state.internationalMarket = arrival.state
  state.market = [...market.listings, ...(arrival.listing ? [arrival.listing] : [])]
  state.rngState = market.rngState
}
