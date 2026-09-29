import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewCareer, getManagerClub } from '../game'
import { StadiumScreen } from './screens'

afterEach(cleanup)

describe('stadium member movement', () => {
  it('shows the latest member gain or loss and supports older saves without that field', () => {
    const state = createNewCareer({ managerName: 'Torcida', seed: 84 })
    const club = getManagerClub(state)
    club.supporters = 12_350
    club.lastSupporterChange = 250
    const view = render(<StadiumScreen state={state} command={vi.fn()} />)
    expect(screen.getByText('SÓCIOS: 12.350 (+250 NO ÚLTIMO JOGO)')).toBeInTheDocument()
    club.lastSupporterChange = -75
    view.rerender(<StadiumScreen state={state} command={vi.fn()} />)
    expect(screen.getByText('SÓCIOS: 12.350 (-75 NO ÚLTIMO JOGO)')).toBeInTheDocument()
    delete club.lastSupporterChange
    view.rerender(<StadiumScreen state={state} command={vi.fn()} />)
    expect(screen.getByText('SÓCIOS: 12.350')).toBeInTheDocument()
  })
})
