import { openDB } from 'idb'
import type { GameState } from '../game/types'
import { migratePlayerDevelopment, migrateEconomyBalance, migrateLeagueVenueBalance, migrateRosterBalance } from '../game/setup'
import { parseGameState } from './schema'

const DATABASE_NAME = 'emifoot'
const STORE_NAME = 'saves'
const DATABASE_VERSION = 1

export interface SaveRecord {
  slotId: string
  name: string
  savedAt: string
  state: GameState
}

async function database() {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'slotId' })
    },
  })
}

export async function saveGame(slotId: string, name: string, state: GameState): Promise<SaveRecord> {
  const parsed = parseGameState(structuredClone(state))
  const record: SaveRecord = { slotId, name, savedAt: new Date().toISOString(), state: parsed }
  const db = await database()
  try {
    await db.put(STORE_NAME, record)
  } finally {
    db.close()
  }
  return record
}

export async function loadGame(slotId: string): Promise<GameState | undefined> {
  const db = await database()
  try {
    const record = await db.get(STORE_NAME, slotId) as SaveRecord | undefined
    if (!record) return undefined
    return migrateLeagueVenueBalance(migrateEconomyBalance(migratePlayerDevelopment(migrateRosterBalance(parseGameState(record.state)))))
  } finally {
    db.close()
  }
}

export async function listSaves(): Promise<Array<Omit<SaveRecord, 'state'> & { season: number; clubId: string }>> {
  const db = await database()
  try {
    const records = await db.getAll(STORE_NAME) as SaveRecord[]
    return records
      .map((record) => ({
        slotId: record.slotId,
        name: record.name,
        savedAt: record.savedAt,
        season: record.state.season,
        clubId: record.state.manager.clubId,
      }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } finally {
    db.close()
  }
}
