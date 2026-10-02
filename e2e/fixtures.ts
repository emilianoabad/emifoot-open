import { expect, type Page } from '@playwright/test'
import type { GameState } from '../src/game/types'

export async function waitForSavedPhase(page: Page, phase: GameState['phase']): Promise<void> {
  await expect.poll(() => page.evaluate(() => new Promise<string | undefined>((resolve, reject) => {
    const request = indexedDB.open('emifoot', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('saves').objectStore('saves').get('career')
      read.onsuccess = () => { db.close(); resolve(read.result?.state.phase) }
      read.onerror = () => { db.close(); reject(read.error) }
    }
  }))).toBe(phase)
}

export async function resumeFixture(page: Page, state: GameState): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('./')
  await expect(page).toHaveTitle(/Emifoot/)
  // Only this isolated test browser receives the fixture; the local playtest save is untouched.
  await page.evaluate(async (game) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('emifoot', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'slotId' })
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('saves', 'readwrite')
        transaction.objectStore('saves').put({ slotId: 'career', name: game.manager.name, savedAt: new Date().toISOString(), state: game })
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      }
    })
  }, state)
  await page.reload()
  await page.getByRole('button', { name: /CONTINUAR CARREIRA/ }).click()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  return errors
}
