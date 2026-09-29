import { expect, test } from '@playwright/test'
import { createNewCareer, getManagerClub } from '../src/game/index.ts'
import { drawInternationalArrival } from '../src/game/international.ts'
import { resumeFixture } from './fixtures'

test('shows and resumes a normal auction and transfer result for a real player from abroad', async ({ page }, testInfo) => {
  const state = createNewCareer({ managerName: 'Exterior QA', seed: 7 })
  state.phase = 'auction'
  getManagerClub(state).cash = 10_000_000
  const players = state.clubs.flatMap((club) => club.players)
  for (let seed = 1; seed <= 1000; seed++) {
    const arrival = drawInternationalArrival(undefined, state.season, state.currentRound, seed, players, players.length)
    if (!arrival.listing) continue
    state.market = [arrival.listing]
    state.internationalMarket = arrival.state
    break
  }
  const player = state.market[0].internationalPlayer!
  expect(player).toBeDefined()
  await page.clock.install({ time: new Date('2026-09-28T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-09-28T01:00:00Z'))
  const errors = await resumeFixture(page, state)
  await expect(page.getByText('VENDA PELA MELHOR OFERTA DE ORDENADO')).toBeVisible()
  await expect(page.getByText(player.name, { exact: true })).toBeVisible()
  await expect(page.getByText('EXTERIOR', { exact: true })).toBeVisible()
  await expect(page.locator('.original-auction')).not.toContainText(/EXTRA|RODADA ADICIONAL/i)
  await page.screenshot({ path: testInfo.outputPath('international-auction.png'), fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(page.getByText(player.name, { exact: true })).toBeVisible()
  await page.getByLabel('Oferta de ordenado').fill('64000')
  await page.getByRole('button', { name: 'Enviar oferta' }).click()
  await expect(page.getByRole('button', { name: /TRANSFERIDO PARA/ })).toBeVisible()
  await expect(page.getByText('EXTERIOR', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => new Promise<string | undefined>((resolve, reject) => {
    const request = indexedDB.open('emifoot', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const saved = db.transaction('saves').objectStore('saves').get('career')
      saved.onsuccess = () => { db.close(); resolve(saved.result?.state?.auctionResult?.auction?.playerName) }
      saved.onerror = () => { db.close(); reject(saved.error) }
    }
  }))).toBe(player.name)
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(page.getByRole('button', { name: /TRANSFERIDO PARA/ })).toBeVisible()
  await expect(page.getByText(player.name, { exact: true })).toBeVisible()
  await expect(page.getByText('EXTERIOR', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('international-auction-result.png'), fullPage: true })
  await page.getByRole('button', { name: /TRANSFERIDO PARA/ }).click()
  await expect(page.locator('.original-manager-layout')).toBeVisible()
  expect(errors).toEqual([])
})
