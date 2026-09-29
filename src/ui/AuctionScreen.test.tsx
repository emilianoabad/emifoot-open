import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewCareer, getManagerClub } from '../game'
import { AuctionScreen } from './AuctionScreen'

afterEach(cleanup)

describe('available auction cash', () => {
  it('describes the salary input with the current viewer’s cash and updates after a snapshot', () => {
    const state = createNewCareer({ managerName: 'Caixa', seed: 71 })
    getManagerClub(state).cash = 123_456
    const view = render(<AuctionScreen state={state} message="" command={vi.fn()} />)
    expect(screen.getByLabelText('Oferta de ordenado')).toHaveAccessibleDescription('DINHEIRO DISPONÍVEL: Cr$ 123.456')
    const personalized = structuredClone(state)
    personalized.manager.clubId = personalized.clubs.find((club) => club.id !== state.market[0].sellerId && club.id !== state.manager.clubId)!.id
    getManagerClub(personalized).cash = 654_321
    view.rerender(<AuctionScreen state={personalized} message="" command={vi.fn()} onNetworkOffer={vi.fn()} />)
    expect(screen.getByLabelText('Oferta de ordenado')).toHaveAccessibleDescription('DINHEIRO DISPONÍVEL: Cr$ 654.321')
    expect(screen.queryByText(/123.456/)).not.toBeInTheDocument()
  })

  it('still shows the exact balance when the club cannot afford the player', () => {
    const state = createNewCareer({ managerName: 'Caixa', seed: 72 })
    getManagerClub(state).cash = -1_250
    render(<AuctionScreen state={state} message="" command={vi.fn()} />)
    expect(screen.queryByLabelText('Oferta de ordenado')).not.toBeInTheDocument()
    expect(screen.getByText('DINHEIRO DISPONÍVEL: -Cr$ 1.250')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('DINHEIRO INSUFICIENTE')
  })
})
