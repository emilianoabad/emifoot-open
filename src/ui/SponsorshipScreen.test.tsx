import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { acknowledgeSponsorshipNotice, createNewCareer, getAvailableSponsorshipProposal, getManagerClub, getSponsorBrand, startNextSeason, type GameState } from '../game'
import { fastForwardSeason } from '../test/simulation'
import { FinanceScreen } from './screens'
import { SponsorshipScreen } from './SponsorshipScreen'
import { SponsorshipNoticeScreen } from './SponsorshipNoticeScreen'
import { StandingsScreen } from './StandingsScreen'

afterEach(cleanup)

function Negotiation({ initial }: { initial: GameState }) {
  const [state, setState] = useState(initial)
  return state.phase === 'sponsorship'
    ? <SponsorshipScreen state={state} command={(run) => { const result = run(state); if (result.ok) setState(result.state) }} />
    : <div>Contrato: {getSponsorBrand(getManagerClub(state).sponsorship!.brandId).name} · Sorteio da Copa</div>
}

describe('sponsorship selection and notices', () => {
  let state: GameState
  beforeAll(() => {
    const completed = fastForwardSeason(createNewCareer({ managerName: 'Marca', seed: 77 }))
    if (!completed.ok) throw new Error(completed.error)
    completed.state.manager.dismissed = false
    const next = startNextSeason(completed.state)
    if (!next.ok) throw new Error(next.error)
    state = next.state
  })

  it.each([true, false])('shows only offer terms without criteria, forecasts or government status (allowed: %s)', (allowed) => {
    const offers = structuredClone(state)
    offers.sponsorship!.bettingAllowed = allowed
    render(<SponsorshipScreen state={offers} command={vi.fn()} />)
    expect(screen.getByText('PROPOSTAS DE PATROCINADOR MASTER PARA A TEMPORADA 2027')).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Assinar com/ })).toHaveLength(3)
    for (const offer of getAvailableSponsorshipProposal(offers, offers.manager.clubId)!.offers) {
      expect(screen.getByText(getSponsorBrand(offer.brandId).description)).toBeVisible()
    }
    if (!allowed) expect(screen.queryByText(/apostas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/governo|proibidas|liberadas|risco|previsão|estimativas|fixo anual|sócios|última temporada|mais garantia|mais por resultado/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('FIXO / JORNADA')).toHaveLength(3)
    expect(screen.getAllByText('POR VITÓRIA')).toHaveLength(3)
    expect(screen.getAllByText('POR EMPATE')).toHaveLength(3)
  })

  it('signs the numbered keyboard choice once and continues to the cup draw', async () => {
    render(<Negotiation initial={state} />)
    await userEvent.setup().keyboard('2')
    expect(screen.getByText(/Sorteio da Copa/)).toHaveTextContent(getSponsorBrand(state.sponsorship!.proposals[state.manager.clubId].offers[1].brandId).name)
  })

  it('signs the replacement third offer from an old pending save during a ban', async () => {
    const banned = structuredClone(state)
    banned.sponsorship!.bettingAllowed = false
    const replacement = getAvailableSponsorshipProposal(banned, banned.manager.clubId)!.offers[2]
    render(<Negotiation initial={banned} />)
    await userEvent.setup().keyboard('3')
    expect(screen.getByText(/Sorteio da Copa/)).toHaveTextContent(getSponsorBrand(replacement.brandId).name)
  })

  it('sends only the selected offer id in multiplayer and disables an already signed contract', async () => {
    const onChoice = vi.fn()
    const command = vi.fn()
    const offer = state.sponsorship!.proposals[state.manager.clubId].offers[2]
    const { rerender } = render(<SponsorshipScreen state={state} command={command} onNetworkChoice={onChoice} />)
    await userEvent.setup().click(screen.getByRole('button', { name: `Assinar com ${getSponsorBrand(offer.brandId).name}` }))
    expect(onChoice).toHaveBeenCalledExactlyOnceWith(offer.id)
    expect(command).not.toHaveBeenCalled()
    const waiting = structuredClone(state)
    waiting.sponsorship!.pendingClubIds = []
    getManagerClub(waiting).sponsorship = offer
    rerender(<SponsorshipScreen state={waiting} command={command} onNetworkChoice={onChoice} />)
    expect(screen.getByText('ASSINADO')).toBeVisible()
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true)
  })

  it.each([true, false])('shows a changed government decision separately after standings, only for a current betting sponsor (allowed: %s)', async (allowed) => {
    const report = structuredClone(state)
    report.phase = 'standings'
    report.lastReport = { leagueResults: [], cupResults: [], transferMessages: [], headlines: [], bettingRegulationChange: { allowed } }
    getManagerClub(report).sponsorship = report.sponsorship!.proposals[report.manager.clubId].offers[2]
    const command = vi.fn()
    const { rerender } = render(<StandingsScreen state={report} command={command} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    report.phase = 'sponsorship-notice'
    rerender(<SponsorshipNoticeScreen state={report} command={command} />)
    expect(screen.getByRole('status')).toHaveTextContent(allowed ? 'APOSTAS LIBERADAS' : 'Medida Provisória')
    await userEvent.setup().keyboard('{Enter}')
    expect(command).toHaveBeenCalledExactlyOnceWith(acknowledgeSponsorshipNotice)
    getManagerClub(report).sponsorship = report.sponsorship!.proposals[report.manager.clubId].offers[0]
    rerender(<SponsorshipNoticeScreen state={report} command={command} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    getManagerClub(report).sponsorship = report.sponsorship!.proposals[report.manager.clubId].offers[2]
    delete report.lastReport.bettingRegulationChange
    rerender(<SponsorshipNoticeScreen state={report} command={command} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows zero guaranteed income and the suspended contract in finances', () => {
    const banned = structuredClone(state)
    banned.sponsorship!.bettingAllowed = false
    getManagerClub(banned).sponsorship = banned.sponsorship!.proposals[banned.manager.clubId].offers[2]
    render(<FinanceScreen state={banned} command={vi.fn()} />)
    expect(screen.getByText(/SUSPENSO: APOSTAS PROIBIDAS/)).toBeVisible()
    expect(within(screen.getByText('PATROCÍNIO FIXO / JORNADA').parentElement!).getByText('Cr$ 0')).toBeVisible()
  })
})
