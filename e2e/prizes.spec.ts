import { expect, test } from '@playwright/test'
import { resumeFixture, waitForSavedPhase } from './fixtures'
import {
  acknowledgeAuctionResult, acknowledgeInjuryNotice, advanceAfterStandings,
  completeCupDraw, confirmManagerRegistration, createNewCareer, finishRound,
  reachHalfTime, showStandings, startRound, submitAuctionOffer,
  type EngineResult, type GameState,
} from '../src/game/index.ts'
import { fastForwardSeason } from '../src/test/simulation.ts'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function firstCupResults(): GameState {
  let state = createNewCareer({ managerName: 'Prêmios QA', seed: 77 })
  for (let step = 0; step < 100; step++) {
    if (state.phase === 'competition-results') return state.injuryNoticePending ? unwrap(acknowledgeInjuryNotice(state)) : state
    const command = state.phase === 'manager-registration' ? confirmManagerRegistration
      : state.phase === 'cup-draw' ? completeCupDraw
        : state.phase === 'auction' ? state.auctionResult ? acknowledgeAuctionResult : submitAuctionOffer
          : state.phase === 'pre-round' ? startRound
            : state.phase === 'first-half' ? reachHalfTime
              : state.phase === 'half-time' ? finishRound
                : state.phase === 'second-half' ? showStandings
                  : state.phase === 'standings' ? advanceAfterStandings : undefined
    if (!command) throw new Error(`Unexpected fixture phase: ${state.phase}`)
    state = unwrap(command(state))
  }
  throw new Error('Cup fixture did not finish')
}

test('resumes cup results with the credited prize and continues to the next league round', async ({ page }, testInfo) => {
  const state = firstCupResults()
  const fixture = state.lastReport!.cupResults.find((match) => match.homeId === state.manager.clubId || match.awayId === state.manager.clubId)!
  const result = fixture.result!
  const homeWins = result.homeGoals === result.awayGoals ? result.homePenalties! > result.awayPenalties! : result.homeGoals > result.awayGoals
  const winner = homeWins ? fixture.homeId : fixture.awayId
  const amount = winner === state.manager.clubId ? 'Cr$ 50.000' : 'Cr$ 25.000'
  const errors = await resumeFixture(page, state)
  await expect(page.locator('.competition-results-title')).toHaveText('COPA DO BRASIL')
  await expect(page.locator('.competition-prize')).toHaveText(`PRÊMIO RECEBIDO: ${amount}`)
  await page.screenshot({ path: testInfo.outputPath('cup-prize.png'), fullPage: true })
  await page.getByRole('button', { name: 'Continuar depois dos resultados' }).click()
  await expect(page.locator('.original-auction')).toBeVisible()
  await expect(page.locator('.competition-prize')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('shows every season prize without clipping and starts the next season', async ({ page }, testInfo) => {
  const state = unwrap(fastForwardSeason(createNewCareer({ managerName: 'Prêmios QA', seed: 77 })))
  // Retirement and academy journeys cover their own transitions; isolate awards and signing here.
  for (const club of state.clubs) for (const player of club.players) player.age = 25
  const errors = await resumeFixture(page, state)
  await expect(page.locator('.season-banner')).toHaveText('FIM DA TEMPORADA 2026')
  await expect(page.locator('.award-amount')).toHaveText([
    'Cr$ 2.000.000', 'Cr$ 500.000', 'Cr$ 500.000', 'Cr$ 125.000',
    'Cr$ 300.000', 'Cr$ 75.000', 'Cr$ 150.000', 'Cr$ 37.500',
    'Cr$ 1.000.000', 'Cr$ 250.000', 'Cr$ 200.000', 'Cr$ 200.000', 'Cr$ 200.000',
  ])
  const fits = await page.locator('.award-row').evaluateAll((rows) => rows.every((row) => {
    const panel = row.closest('.award-panel')!.getBoundingClientRect()
    return Array.from(row.children).every((child) => {
      const rect = child.getBoundingClientRect()
      return rect.left >= panel.left && rect.right <= panel.right && rect.bottom <= panel.bottom
    })
  }))
  expect(fits).toBe(true)
  expect(await page.locator('.season-end').evaluate((section) => {
    const status = section.querySelector('.season-manager-status')!.getBoundingClientRect()
    const panels = Array.from(section.querySelectorAll('.award-panel'), (panel) => panel.getBoundingClientRect())
    return panels.every((panel) => panel.bottom <= status.top)
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('season-prizes.png'), fullPage: true })
  if (state.manager.dismissed) await page.getByRole('button', { name: /ACEITAR/ }).first().click()
  await page.getByRole('button', { name: /TEMPORADA 2027/ }).click()
  await expect(page.getByRole('region', { name: 'Propostas de patrocínio' })).toBeVisible()
  await expect(page.locator('.sponsorship-title')).toBeInViewport()
  await expect(page.getByRole('button', { name: /Assinar com/ })).toHaveCount(3)
  await expect(page.locator('.sponsorship-title')).toHaveText('PROPOSTAS DE PATROCINADOR MASTER PARA A TEMPORADA 2027')
  expect(await page.locator('.sponsorship-screen').evaluate((section) => {
    const box = section.getBoundingClientRect()
    return Array.from(section.querySelectorAll('.sponsorship-title, .sponsor-offer, .sponsor-sign')).every((element) => {
      const rect = element.getBoundingClientRect()
      return rect.left >= box.left && rect.right <= box.right && rect.bottom <= box.bottom
    })
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('sponsorship-offers.png'), fullPage: true })
  await waitForSavedPhase(page, 'sponsorship')
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(page.getByRole('button', { name: /Assinar com/ })).toHaveCount(3)
  await page.getByRole('button', { name: /Assinar com/ }).first().click()
  await expect(page.getByRole('button', { name: 'Concluir sorteio' })).toBeVisible()
  expect(errors).toEqual([])
})
