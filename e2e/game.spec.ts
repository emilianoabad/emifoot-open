import { expect, test, type Page } from '@playwright/test'
import { createNewCareer, getManagerClub, getManagerFixture } from '../src/game/index.ts'
import { resumeFixture } from './fixtures'

function captureErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  return errors
}

test('shows the club division and the upcoming opponent’s own standings', async ({ page }, testInfo) => {
  const state = createNewCareer({ managerName: 'Clube QA', seed: 77 })
  state.phase = 'pre-round'
  state.currentRound = 2
  const club = getManagerClub(state)
  const nextMatch = getManagerFixture(state)!
  const opponentId = nextMatch.homeId === club.id ? nextMatch.awayId : nextMatch.homeId
  const opponent = state.clubs.find((candidate) => candidate.id === opponentId)!
  const previous = state.leagues.find((league) => league.division === club.division)!.rounds[0]
    .find((fixture) => fixture.homeId === opponentId || fixture.awayId === opponentId)!
  previous.result = { homeGoals: previous.homeId === opponentId ? 2 : 0, awayGoals: previous.awayId === opponentId ? 2 : 0, attendance: 10_000, events: [] }
  const errors = await resumeFixture(page, state)
  await expect(page).toHaveURL('http://127.0.0.1:4173/qa/')
  const clubPanel = page.locator('.original-club-panel')
  const opponentPanel = page.locator('.original-next-match')
  await expect(clubPanel).toContainText('4ª divisão')
  await expect(clubPanel).toContainText('0 pontos')
  await expect(opponentPanel).toContainText(opponent.name.toUpperCase())
  await expect(opponentPanel).toContainText('1º lugar 3 pontos')
  expect(await clubPanel.evaluate((panel) => {
    const bounds = panel.getBoundingClientRect()
    const stats = panel.querySelectorAll('.original-club-data')[0].children
    return stats[0].getBoundingClientRect().right <= stats[1].getBoundingClientRect().left
      && Array.from(panel.querySelectorAll('span')).every((span) => {
        const text = document.createRange()
        text.selectNodeContents(span)
        const box = text.getBoundingClientRect()
        return box.left >= bounds.left && box.right <= bounds.right && box.bottom <= bounds.bottom
      })
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('club-summary.png'), fullPage: true })
  await page.keyboard.press('t')
  const opponentRow = page.locator('.standings-row').filter({ hasText: opponent.name })
  await expect(opponentRow.locator('span').first()).toHaveText('1')
  await expect(opponentRow.locator('span').last()).toHaveText('3')
  await page.keyboard.press('Escape')
  await expect(opponentPanel).toContainText('1º lugar 3 pontos')
  expect(errors).toEqual([])
})

test('creates, manages, saves, and resumes a solo career', async ({ page }, testInfo) => {
  const errors = captureErrors(page)
  await page.goto('./')
  await expect(page).toHaveTitle(/Emifoot/)
  const credits = page.getByLabel('Créditos e afiliação')
  await expect(credits).toContainText('Emifoot é um remake em tributo ao Elifoot II original, de André Elias.')
  await expect(credits).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  await expect(credits.getByRole('link', { name: 'site oficial do Elifoot' })).toHaveAttribute('href', 'https://www.elifoot.com/')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('title.png'), fullPage: true })
  await page.getByRole('button', { name: /CARREIRA SOLO/ }).click()
  await page.getByRole('textbox', { name: 'Nome do treinador', exact: true }).fill('Release QA')
  await page.getByRole('button', { name: 'Confirmar treinador' }).click()
  await page.getByRole('button', { name: /COMEÇAR/ }).click()
  await page.getByRole('button', { name: 'Concluir sorteio' }).click()
  // Pass through real auction screens, including unaffordable automatic passes.
  for (let step = 0; step < 30 && !(await page.locator('.original-manager-layout').isVisible()); step++) {
    const result = page.locator('.auction-result')
    const submit = page.getByRole('button', { name: 'Enviar oferta' })
    if (await result.isVisible()) await result.click()
    else if (await submit.isVisible()) await submit.click()
    else await expect.poll(async () => (await result.isVisible()) || (await submit.isVisible()) || (await page.locator('.original-manager-layout').isVisible())).toBe(true)
  }
  await expect(page.locator('.original-manager-layout')).toBeVisible()
  await page.keyboard.press('e')
  await expect(page.getByRole('button', { name: /REPARAR/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: testInfo.outputPath('squad.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /CONTINUAR CARREIRA/ })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(page.locator('.original-manager-layout')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('joins an invitation through the configured installation path', async ({ page, request }) => {
  const response = await request.get('./invite/?room=abc234')
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('http://127.0.0.1:4173/qa/og-emifoot-matchday.png')
  await page.goto('./invite/?room=abc234&creator=Unused')
  await expect(page).toHaveURL('http://127.0.0.1:4173/qa/?room=ABC234')
  await expect(page.getByText('SALA ABC234', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Nome do treinador multijogador' })).toBeVisible()
})

test('two browsers share a private league and reconnect to the same seat', async ({ page, browser }, testInfo) => {
  const errors = captureErrors(page)
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guest = await guestContext.newPage()
  const guestErrors = captureErrors(guest)
  try {
    await page.goto('./')
    await page.getByRole('button', { name: /LIGA COM AMIGOS/ }).click()
    await page.getByRole('button', { name: /CRIAR SALA/ }).click()
    await page.getByRole('textbox', { name: 'Nome do treinador multijogador' }).fill('Host QA')
    await page.getByRole('button', { name: /ENTER.*CRIAR/ }).click()
    await expect(page).toHaveURL(/room=[A-Z2-9]{6}/)
    await guest.goto(page.url())
    await guest.getByRole('textbox', { name: 'Nome do treinador multijogador' }).fill('Guest QA')
    await guest.getByRole('button', { name: /ENTER.*ENTRAR/ }).click()
    await expect(page.locator('.multiplayer-seats').getByText('GUEST QA', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /COMEÇAR|INICIAR/ }).click()
    await expect(page.getByRole('button', { name: /PAUSAR LIGA/ })).toBeVisible()
    await page.getByRole('button', { name: /PAUSAR LIGA/ }).click()
    await expect(page.getByRole('button', { name: /RETOMAR LIGA/ })).toBeVisible()
    await guest.reload()
    await expect(guest.getByRole('textbox', { name: 'Nome do treinador multijogador' })).toHaveCount(0)
    await expect(guest.getByText('Guest QA', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('multiplayer.png'), fullPage: true })
    await page.getByRole('button', { name: /RETOMAR LIGA/ }).click()
    await expect(page.getByRole('button', { name: /PAUSAR LIGA/ })).toBeVisible()
    expect(errors).toEqual([])
    expect(guestErrors).toEqual([])
  } finally {
    await guestContext.close()
  }
})
