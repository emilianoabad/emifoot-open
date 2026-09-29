import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewCareer, getManagerClub, submitAuctionOffer } from '../game'
import { drawInternationalArrival } from '../game/international'
import { AuctionScreen } from './AuctionScreen'
import { MarketScreen } from './screens'

afterEach(cleanup)

function internationalAuction() {
  const state = createNewCareer({ managerName: 'Exterior', seed: 7 })
  state.phase = 'auction'
  getManagerClub(state).cash = 10_000_000
  const players = state.clubs.flatMap((club) => club.players)
  for (let seed = 1; seed <= 1000; seed++) {
    const arrival = drawInternationalArrival(undefined, state.season, state.currentRound, seed, players, players.length)
    if (!arrival.listing) continue
    state.market = [arrival.listing]
    state.internationalMarket = arrival.state
    return { state, player: arrival.listing.internationalPlayer }
  }
  throw new Error('No international fixture generated')
}

describe('international player auction screens', () => {
  it('uses the normal auction and salary input for a real player arriving from abroad', () => {
    const { state, player } = internationalAuction()
    render(<AuctionScreen state={state} message="" command={vi.fn()} />)
    expect(screen.getByText('VENDA PELA MELHOR OFERTA DE ORDENADO')).toBeVisible()
    expect(screen.getByText(player.name)).toBeVisible()
    expect(screen.getByText('EXTERIOR')).toBeVisible()
    expect(screen.getByLabelText('Oferta de ordenado')).toBeVisible()
    expect(screen.queryByText(/EXTRA|RODADA ADICIONAL/i)).not.toBeInTheDocument()
  })

  it('keeps the external seller and player details after a completed auction has left the market', () => {
    const { state, player } = internationalAuction()
    const result = submitAuctionOffer(state, 64_000)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.auctionResult?.clubId).toBe(state.manager.clubId)
    expect(result.state.market).toHaveLength(0)
    render(<AuctionScreen state={result.state} message="" command={vi.fn()} />)
    expect(screen.getByText(player.name)).toBeVisible()
    expect(screen.getByText('EXTERIOR')).toBeVisible()
    expect(screen.getByRole('button', { name: /TRANSFERIDO PARA/ })).toBeVisible()
    expect(screen.queryByLabelText('Oferta de ordenado')).not.toBeInTheDocument()
  })

  it('also shows the external player in the market list and bid details', () => {
    const { state, player } = internationalAuction()
    render(<MarketScreen state={state} command={vi.fn()} />)
    expect(screen.getByRole('button', { name: new RegExp(player.name.slice(0, 18)) })).toHaveTextContent('EXTERIOR')
    expect(screen.getByText(`JOGADOR ${player.name}`)).toBeVisible()
    expect(screen.getByText('EQUIPA EXTERIOR')).toBeVisible()
    expect(screen.getByLabelText('Oferta de ordenado')).toBeVisible()
  })
})
