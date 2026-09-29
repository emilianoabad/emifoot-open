import { expect, test } from '@playwright/test'
import { createNewCareer, getManagerClub } from '../src/game/index.ts'
import { resumeFixture } from './fixtures'

test('offers only playable formations and ignores hidden formation shortcuts', async ({ page }, testInfo) => {
  const state = createNewCareer({ managerName: 'Táticas QA', seed: 7 })
  state.phase = 'pre-round'
  getManagerClub(state).players.filter((player) => player.position === 'A').slice(2)
    .forEach((player) => { player.injuryRounds = 1 })
  await page.clock.install()
  const errors = await resumeFixture(page, state)
  await expect(page.getByRole('button', { name: /4-3-3|3-4-3|5-2-3/ })).toHaveCount(0)
  const available = page.getByRole('button', { name: /4-4-2/ })
  await expect(available).toBeVisible()
  await page.keyboard.press('2')
  await page.clock.fastForward(1000)
  await expect(page.locator('.original-manager-layout')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('available-tactics.png'), fullPage: true })
  await available.click()
  await page.clock.fastForward(1000)
  await expect(page.locator('.original-matchday')).toBeVisible()
  expect(errors).toEqual([])
})
