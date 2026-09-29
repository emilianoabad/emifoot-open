import { clearAllSavesForTesting } from './test/saves'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { listSaves } from './persistence/saveRepository'

async function registerManager(user: ReturnType<typeof userEvent.setup>, name = 'Emiliano') {
  await user.click(screen.getByRole('button', { name: /CARREIRA SOLO/ }))
  const field = screen.getByLabelText('Nome do treinador')
  await user.type(field, name)
  expect(screen.queryByLabelText(/Clube inicial/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar treinador' }))
}

async function reachManagerScreen(user: ReturnType<typeof userEvent.setup>) {
  await registerManager(user)
  const assignedClub = document.querySelector('.assigned-club')?.textContent
  expect(['Criciúma', 'Juventude', 'Paraná', 'Ponte Preta', 'América-MG', 'Paysandu', 'Remo', 'Vila Nova'].map((club) => club.toUpperCase())).toContain(assignedClub)
  expect(document.querySelector('.assigned-club')?.getAttribute('style')).toContain('--team-bg:')
  expect(document.querySelector('.assigned-club')?.getAttribute('style')).toContain('--team-fg:')
  await user.click(screen.getByRole('button', { name: /ENTER.*COMEÇAR/ }))
  expect(screen.getByText(/SORTEIO DA COPA DO BRASIL/)).toBeInTheDocument()
  expect(document.querySelectorAll('.cup-pair')).toHaveLength(16)
  expect(getComputedStyle(document.querySelector('.cup-drawn-box') as HTMLElement).overflow).toBe('hidden')
  await user.click(screen.getByRole('button', { name: 'Concluir sorteio' }))
  while (screen.queryByText('VENDA PELA MELHOR OFERTA DE ORDENADO')) {
    if (screen.queryByLabelText('Oferta de ordenado')) {
      await waitFor(() => expect(screen.getByLabelText('Oferta de ordenado')).toHaveFocus())
      const managerPrompt = screen.getByLabelText('Oferta de ordenado').closest('form')
      expect(managerPrompt?.getAttribute('style')).toContain('background-color:')
      expect(managerPrompt?.getAttribute('style')).toContain('color:')
      await user.click(screen.getByRole('button', { name: 'Enviar oferta' }))
    } else {
      expect(screen.getByRole('status')).toHaveTextContent(/DINHEIRO INSUFICIENTE/)
    }
    const result = await screen.findByRole('button', { name: /TRANSFERIDO PARA|NÃO FOI TRANSFERIDO/ }, { timeout: 1_500 })
    if (result.textContent?.includes('TRANSFERIDO PARA')) {
      expect(result.getAttribute('style')).toContain('background-color:')
      expect(result.getAttribute('style')).toContain('color:')
    }
    await user.click(result)
  }
}

// These journeys include six real auction screens and their timed transitions.
// Keep their inputs reproducible and budget for slower CI CPUs, not only laptops.
describe('browser career flow', { timeout: 20_000 }, () => {
  beforeEach(async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((values) => {
      if (values instanceof Uint32Array) values.fill(42)
      return values
    })
    window.history.replaceState(null, '', '/')
    sessionStorage.clear()
    localStorage.clear()
    await clearAllSavesForTesting()
  })

  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('opens the focused online mode with Enter instead of starting a solo career', async () => {
    const user = userEvent.setup()
    render(<App />)
    screen.getByRole('button', { name: /LIGA ONLINE/ }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /BUSCAR LIGA/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do treinador multijogador')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome do treinador')).not.toBeInTheDocument()
  })

  it('opens the multiplayer room entry without changing the single-player start flow', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /LIGA COM AMIGOS/ }))
    expect(screen.getByText('EMIFOOT · LIGA COM AMIGOS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CRIAR SALA/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ENTRAR COM CÓDIGO/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /BUSCAR LIGA/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nome do treinador multijogador')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Código da sala')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ENTRAR COM CÓDIGO/ }))
    expect(screen.getByLabelText('Código da sala')).toHaveFocus()
    expect(screen.getByLabelText('Nome do treinador multijogador')).toBeInTheDocument()
  })

  it('assigns the club and follows the cup, auction, match, halftime, and table loop', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('EMIFOOT')).toBeInTheDocument()
    await reachManagerScreen(user)

    expect(screen.getByText('TÁCTICAS')).toBeInTheDocument()
    const playerNames = [...document.querySelectorAll('.original-squad-panel .original-player-row span:nth-child(2)')]
      .map((element) => element.textContent ?? '')
    expect(playerNames.some((name) => name.startsWith('* ') || name.startsWith('. '))).toBe(false)
    expect(playerNames.some((name) => /[*.](?: \[\+\])?$/.test(name))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    expect(screen.getByText('CAMPEONATO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /COPA DO BRASIL/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /COPA DO BRASIL/ }))
    expect(screen.getByText('32 CLUBES · 4 DIVISÕES · ELIMINATÓRIA')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ESC.*VOLTAR/ }))
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: /CLASSIFICAÇÃO/ }))
    expect(screen.getByText('CLASSIFICAÇÃO DO CAMPEONATO')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ESC.*VOLTAR/ }))
    await user.click(screen.getByRole('button', { name: /3.*4-4-2/ }))
    expect(document.querySelectorAll('.original-squad-panel .original-player-row')).toHaveLength(11)
    expect(screen.queryByRole('button', { name: 'ENTER JOGAR' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ir para o intervalo' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Ir para o intervalo' }))
    expect(screen.getByText('JOGADORES EM CAMPO')).toBeInTheDocument()
    const fieldStyle = screen.getByText('JOGADORES EM CAMPO').closest('.halftime-list')?.getAttribute('style')
    const benchStyle = screen.getByText('JOGADORES NO BANCO').closest('.halftime-list')?.getAttribute('style')
    expect(fieldStyle).toContain('background-color:')
    expect(fieldStyle).toContain('color:')
    expect(fieldStyle).toContain('border-color:')
    expect(benchStyle).toBe(fieldStyle)
    await user.click(screen.getByRole('button', { name: /Esc.*Fim/ }))
    await user.click(screen.getByRole('button', { name: 'Terminar partida' }))
    const injuryNotice = screen.queryByRole('button', { name: 'Confirmar lesões' })
    if (injuryNotice) await user.click(injuryNotice)
    expect(screen.getByText(/CLASSIFICAÇÃO/)).toBeInTheDocument()
  })

  it('keeps exactly one automatically updated career in the browser', async () => {
    const user = userEvent.setup()
    const app = render(<App />)
    await registerManager(user, 'Ana')
    await waitFor(async () => {
      const saves = await listSaves()
      expect(saves.filter((save) => save.slotId === 'career')).toHaveLength(1)
    })

    app.unmount()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /CONTINUAR CARREIRA/ }))
    expect(await screen.findByRole('button', { name: /ENTER.*COMEÇAR/ })).toBeInTheDocument()
  })

  it('sells from the main squad but keeps the buyer secret until confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await reachManagerScreen(user)

    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: /M.*TRANSFERÊNCIAS/ }))
    expect(screen.queryByLabelText('Jogador para vender')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ESC.*VOLTAR/ }))
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: /VENDER JOGADOR/ }))
    expect(screen.getByText('VENDER JOGADOR')).toBeInTheDocument()
    expect(screen.queryByText(/O COMPRADOR SÓ SERÁ REVELADO/)).not.toBeInTheDocument()
    expect(getComputedStyle(document.querySelector('.original-squad-panel') as HTMLElement).overflowY).toBe('auto')
    const offers = screen.getAllByRole('button', { name: /posição [GDMA], preço Cr\$/ })
    expect(offers.length).toBeGreaterThan(0)
    const offerCount = offers.length

    await user.click(offers[0])
    expect(screen.getByText('POSIÇÃO / FORÇA')).toBeInTheDocument()
    expect(screen.getByText('VALOR DA PROPOSTA')).toBeInTheDocument()
    expect(screen.queryByText('PROPOSTA DE')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Confirmar venda/ }))

    expect(await screen.findByText('VENDA DE JOGADOR')).toBeInTheDocument()
    const saleResult = screen.getByRole('button', { name: /VENDIDO AO/ })
    expect(screen.getAllByText(/VENDIDO AO/)).toHaveLength(1)
    expect(saleResult.getAttribute('style')).toContain('background-color:')
    expect(saleResult.getAttribute('style')).toContain('color:')
    await user.click(saleResult)
    expect(await screen.findByText('TÁCTICAS')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: /VENDER JOGADOR/ }))
    expect(screen.getAllByRole('button', { name: /posição [GDMA], preço Cr\$/ }).length).toBeLessThan(offerCount)
  })

  it('offers a new salary to keep a current player for one year', async () => {
    const user = userEvent.setup()
    render(<App />)
    await reachManagerScreen(user)

    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: 'Próximo menu' }))
    await user.click(screen.getByRole('button', { name: /NOVO ORDENADO/ }))
    expect(screen.getByText('RENOVAR CONTRATO')).toBeInTheDocument()
    const players = screen.getAllByRole('button', { name: /contrato .* ordenado Cr\$/ })
    await user.click(players[0])
    await waitFor(() => expect(screen.getByLabelText('Novo ordenado')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: /Renovar contrato/ }))

    expect(await screen.findByText(/RENOVOU POR 1 ANO/)).toBeInTheDocument()
  })
})
