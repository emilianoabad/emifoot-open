import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acknowledgeInjuryNotice, createNewCareer } from '../game'
import { InjuryScreen } from './InjuryScreen'

afterEach(() => cleanup())

describe('injury notice screen', () => {
  it('shows managed-team injuries away from the standings table', async () => {
    const state = createNewCareer({ managerName: 'Médico', seed: 9 })
    state.phase = 'standings'
    state.injuryNoticePending = true
    state.lastReport = {
      leagueResults: [],
      cupResults: [],
      libertadoresResults: [],
      transferMessages: [],
      headlines: [],
      injuryMessages: ['PONTE PRETA: JOÃO [+] — fora por 2 jogos.'],
    }
    const command = vi.fn()
    const user = userEvent.setup()

    render(<InjuryScreen state={state} command={command} />)

    expect(screen.getByText('LESÕES')).toBeInTheDocument()
    expect(screen.getByText(/PONTE PRETA: JOÃO/)).toBeInTheDocument()
    expect(document.querySelector('.standings-grid')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar lesões' }))
    expect(command).toHaveBeenCalledWith(acknowledgeInjuryNotice)
  })
})
