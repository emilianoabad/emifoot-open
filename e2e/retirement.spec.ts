import { expect, test } from '@playwright/test'
import { createNewCareer, getManagerClub } from '../src/game/index.ts'
import { resumeFixture } from './fixtures'

test('keeps all retirement names readable and resumes before continuing', async ({ page }, testInfo) => {
  const state = createNewCareer({ managerName: 'Aposentadorias QA', seed: 7 })
  const club = getManagerClub(state)
  state.season += 1
  state.phase = 'retirement-notice'
  state.offseason = {
    season: state.season, targetPlayerCount: state.clubs.reduce((sum, team) => sum + team.players.length, 0),
    retirementPendingClubIds: [club.id],
    plans: { [club.id]: {
      retired: Array.from({ length: 24 }, (_, i) => ({ ...club.players[i % club.players.length],
        id: `retired-${i}`, name: i === 0 ? 'Alexandre Henrique de Souza' : `Veterano ${i + 1}`, age: 34 + i % 8 })),
      candidates: [], required: { G: 0, D: 0, M: 0, A: 0 }, promotedIds: [],
    } },
  }
  const errors = await resumeFixture(page, state)
  await expect(page.getByRole('heading', { name: 'APOSENTADORIAS · 2026' })).toBeVisible()
  await expect(page.getByText('Alexandre Henrique de Souza')).toBeVisible()
  const list = page.getByRole('region', { name: 'Jogadores aposentados' })
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByText('Veterano 24').scrollIntoViewIfNeeded()
  await expect(page.getByText('Veterano 24')).toBeInViewport()
  const next = page.getByRole('button', { name: 'Continuar após aposentadorias' })
  await expect(next).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('retirement-list.png'), fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(page.getByRole('heading', { name: 'APOSENTADORIAS · 2026' })).toBeVisible()
  await expect(page.getByText('Alexandre Henrique de Souza')).toBeVisible()
  await next.click()
  await expect(page.locator('.retirement-screen')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Concluir sorteio' })).toBeVisible()
  expect(errors).toEqual([])
})
