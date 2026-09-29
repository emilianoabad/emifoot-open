import { openDB } from 'idb'

export async function clearAllSavesForTesting(): Promise<void> {
  const db = await openDB('emifoot', 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('saves')) database.createObjectStore('saves', { keyPath: 'slotId' })
    },
  })
  try {
    await db.clear('saves')
  } finally {
    db.close()
  }
}
