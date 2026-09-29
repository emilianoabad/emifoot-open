import { expect, test } from '@playwright/test'
import { autoPickLineup, createNewCareer, getManagerClub, type Position } from '../src/game/index.ts'
import { resumeFixture } from './fixtures'

test('selects the required academy players from a scrollable pool that survives reloads', async ({ page }, testInfo) => {
  const state = createNewCareer({ managerName: 'Base QA', seed: 7 })
  const club = getManagerClub(state)
  const required = { G: 2, D: 8, M: 8, A: 6 }
  const candidates = (['G', 'D', 'M', 'A'] as Position[]).flatMap((position) => Array.from({ length: required[position] + 2 }, (_, i) => ({
    ...club.players[0], id: `base-${position}-${i}`, sourceId: `base-${position}-${i}`, position,
    name: i === 0 && position === 'G' ? 'Alexandre Henrique de Souza' : `Base ${position}${i + 1}`,
    age: 17 + i % 4, nationality: 'BRA', strength: 8 + i, salary: 300 + i * 100,
  })))
  const promoted = candidates.filter((player) => Number(player.id.split('-')[2]) < required[player.position])
  club.players = promoted
  Object.assign(club, autoPickLineup(club))
  state.season += 1
  state.phase = 'academy'
  state.offseason = {
    season: state.season, targetPlayerCount: state.clubs.reduce((sum, team) => sum + team.players.length, 0),
    retirementPendingClubIds: [], pendingAcademyClubIds: [club.id],
    plans: { [club.id]: { retired: [], candidates, required, promotedIds: promoted.map((player) => player.id) } },
  }
  const errors = await resumeFixture(page, state)
  await expect(page.getByRole('heading', { name: 'PROMOÇÃO DA BASE · 2027' })).toBeVisible()
  await expect(page.getByText('ESCOLHA 24 JOGADORES')).toBeVisible()
  const list = page.getByRole('group', { name: 'Jogadores da base' })
  const confirm = page.getByRole('button', { name: /PROMOVER/ })
  await expect(list.getByRole('button')).toHaveCount(32)
  await expect(confirm).toBeDisabled()
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('button', { name: /Alexandre Henrique de Souza,/ }).click()
  await expect(page.getByLabel('Vagas por posição')).toContainText('G 1/2')
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(list.getByRole('button')).toHaveCount(32)
  await expect(page.getByLabel('Vagas por posição')).toContainText('G 0/2')
  for (const player of promoted) await page.getByRole('button', { name: new RegExp(`^${player.name},`) }).click()
  await expect(confirm).toBeEnabled()
  await expect(page.getByLabel('Vagas por posição')).toContainText('A 6/6')
  await page.screenshot({ path: testInfo.outputPath('academy-selection.png'), fullPage: true })
  await confirm.click()
  await expect(page.locator('.academy-screen')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Concluir sorteio' })).toBeVisible()
  expect(errors).toEqual([])
})
