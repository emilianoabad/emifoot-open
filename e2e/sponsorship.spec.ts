import { expect, test } from '@playwright/test'
import { resumeFixture, waitForSavedPhase } from './fixtures'
import {
  acceptSponsorshipOffer, createNewCareer, finishRoundForManagedClubs, getSponsorBrand, nextBettingRegulation,
  reachHalfTime, showStandings, startNextSeason, startRoundForManagedClubs,
  type EngineResult, type GameState,
} from '../src/game/index.ts'
import { fastForwardSeason } from '../src/test/simulation.ts'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function governmentChange(allowed: boolean): GameState {
  const completed = unwrap(fastForwardSeason(createNewCareer({ managerName: 'Patrocínio QA', seed: 77 })))
  completed.manager.dismissed = false
  let state = unwrap(startNextSeason(completed))
  state = unwrap(acceptSponsorshipOffer(state, state.sponsorship!.proposals[state.manager.clubId].offers[2].id))
  state.sponsorship!.bettingAllowed = !allowed
  let seed = 1
  while (nextBettingRegulation(seed, !allowed).allowed !== allowed) seed++
  state.sponsorship!.rngState = seed
  state.phase = 'pre-round'
  state = unwrap(startRoundForManagedClubs(state, []))
  state = unwrap(reachHalfTime(state))
  state = unwrap(finishRoundForManagedClubs(state, []))
  state = unwrap(showStandings(state))
  state.injuryNoticePending = undefined
  return state
}

for (const allowed of [false, true]) {
  test(`shows and resumes the government's ${allowed ? 'reinstatement' : 'ban'} on a separate screen after standings`, async ({ page }, testInfo) => {
    const state = governmentChange(allowed)
    const errors = await resumeFixture(page, state)
    await expect(page.locator('.standings-title')).toContainText('CLASSIFICAÇÃO')
    await expect(page.locator('.sponsorship-notice-screen')).toHaveCount(0)
    await expect(page.locator('.original-standings')).not.toContainText(/apostas|bets|governo/i)
    const receipts = state.ledger.filter((entry) => entry.season === state.season && entry.clubId === state.manager.clubId && entry.type === 'sponsor')
    expect(receipts).toHaveLength(1)
    if (allowed) expect(receipts[0].amount).toBeGreaterThan(0)
    else expect(receipts[0].amount).toBe(0)
    expect(await page.locator('.original-standings').evaluate((section) => {
      const box = section.getBoundingClientRect()
      const tables = Array.from(section.querySelectorAll('.division-table'), (element) => element.getBoundingClientRect())
      return tables.every((table) => table.left >= box.left && table.right <= box.right && table.bottom <= box.bottom)
    })).toBe(true)
    await page.getByRole('button', { name: 'Continuar após classificação' }).click()
    await expect(page.locator('.original-standings')).toHaveCount(0)
    await expect(page.locator('.sponsorship-notice-message')).toContainText(allowed ? 'APOSTAS LIBERADAS' : 'Medida Provisória')
    await expect(page.locator('.sponsorship-notice-title')).toBeInViewport()
    await expect(page.locator('.sponsorship-notice-continue')).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(allowed ? 'betting-resumed.png' : 'betting-suspended.png'), fullPage: true })
    await waitForSavedPhase(page, 'sponsorship-notice')
    await page.reload()
    await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
    await expect(page.locator('.sponsorship-notice-message')).toContainText(allowed ? 'APOSTAS LIBERADAS' : 'Medida Provisória')
    await expect(page.locator('.original-standings')).toHaveCount(0)
    await page.getByRole('button', { name: 'Continuar após comunicado de patrocínio' }).click()
    await expect(page.locator('.original-auction')).toBeVisible()
    await expect(page.locator('.sponsorship-notice-screen')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test(`shows the ${allowed ? 'active' : 'suspended'} contract and keeps the full finance ledger accessible`, async ({ page }, testInfo) => {
    const state = governmentChange(allowed)
    state.phase = 'pre-round'
    const errors = await resumeFixture(page, state)
    await page.getByRole('button', { name: 'Próximo menu' }).click()
    await page.getByRole('button', { name: 'Próximo menu' }).click()
    await page.getByRole('button', { name: /F.*FINANÇAS/ }).click()
    await expect(page.locator('.finance-sponsor-contract')).toContainText(allowed ? 'vitória +' : 'SUSPENSO: APOSTAS PROIBIDAS')
    expect(await page.locator('.finance-screen').evaluate((section) => {
      const frame = section.getBoundingClientRect()
      const ledger = section.querySelector('.ledger-table')!
      const bounds = ledger.getBoundingClientRect()
      const rows = Array.from(ledger.querySelectorAll('.ledger-row'))
      const first = rows[0].getBoundingClientRect()
      const last = rows.at(-1)!.getBoundingClientRect()
      return bounds.bottom <= frame.bottom && (last.bottom <= bounds.bottom || getComputedStyle(ledger).overflowY === 'auto')
        && first.top >= bounds.top && section.querySelector('.finance-sponsor-contract')!.getBoundingClientRect().bottom <= bounds.top
    })).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('sponsorship-finances.png'), fullPage: true })
    await page.locator('.ledger-row').last().scrollIntoViewIfNeeded()
    await expect(page.locator('.ledger-row').last()).toBeInViewport()
    expect(errors).toEqual([])
  })
}

for (const allowed of [true, false]) test(`shows three sponsor offers and signs the ${allowed ? 'betting' : 'non-betting replacement'} deal`, async ({ page }, testInfo) => {
  const completed = unwrap(fastForwardSeason(createNewCareer({ managerName: 'Patrocínio QA', seed: 77 })))
  const awards = completed.awards.at(-1)!
  const club = completed.clubs.find((candidate) => candidate.id === awards.champions['1'])!
  completed.manager.clubId = club.id
  completed.manager.dismissed = false
  club.supporters = 1_000_000
  Object.assign(awards, { cupChampionId: club.id, libertadoresChampionId: club.id,
    bestAttackClubId: club.id, bestDefenceClubId: club.id, topScorerId: club.players[0].id })
  completed.sponsorship!.bettingAllowed = allowed
  // This journey isolates signing; retirement and academy transitions have their own journeys.
  for (const team of completed.clubs) for (const player of team.players) player.age = 25
  const state = unwrap(startNextSeason(completed))
  expect(state.sponsorship!.proposals[club.id].achievements).toHaveLength(6)
  const offers = state.sponsorship!.proposals[club.id].offers
  expect(offers.filter((offer) => getSponsorBrand(offer.brandId).betting)).toHaveLength(allowed ? 1 : 0)
  const errors = await resumeFixture(page, state)
  await expect(page.locator('.sponsorship-title')).toHaveText('PROPOSTAS DE PATROCINADOR MASTER PARA A TEMPORADA 2027')
  await expect(page.getByRole('button', { name: /Assinar com/ })).toHaveCount(3)
  await expect(page.locator('.sponsorship-screen')).not.toContainText(/proibidas|liberadas|risco|previsão|estimativas|sócios|campeão/i)
  if (!allowed) await expect(page.locator('.sponsorship-screen')).not.toContainText(/apostas/i)
  expect(await page.locator('.sponsorship-screen').evaluate((section) => {
    const frame = section.getBoundingClientRect()
    const title = section.querySelector('.sponsorship-title')!
    const contents = Array.from(section.querySelectorAll('.sponsorship-title, .sponsor-offer, .sponsor-sign'))
    const textFits = Array.from(section.querySelectorAll('.sponsor-offer')).every((card) => {
      const bounds = card.getBoundingClientRect()
      return Array.from(card.querySelectorAll('dt, dd, .sponsor-brand, .sponsor-description')).every((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left >= bounds.left && rect.right <= bounds.right && element.scrollWidth <= element.clientWidth
      })
    })
    return textFits && title.scrollWidth <= title.clientWidth && title.scrollHeight <= title.clientHeight && contents.every((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= frame.left && box.right <= frame.right && box.bottom <= frame.bottom
    })
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('champion-sponsorship-offers.png'), fullPage: true })
  await page.getByRole('button', { name: /Assinar com/ }).nth(2).click()
  await expect(page.getByRole('button', { name: 'Concluir sorteio' })).toBeVisible()
  expect(errors).toEqual([])
})
