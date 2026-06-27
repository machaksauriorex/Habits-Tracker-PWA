import { openDB } from 'idb'

const DB_NAME = 'habitos-db'
const DB_VERSION = 1

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Phase 0: test store
        if (oldVersion < 1) {
          db.createObjectStore('test', { keyPath: 'id' })
        }
        // Phase 1+: real stores (se añadirán aquí en fases siguientes)
        //   habits, phases, records, settings
      },
    })
  }
  return dbPromise
}

// --- Helpers de prueba (Fase 0) ---

export async function testWrite(id, value) {
  const db = await getDB()
  await db.put('test', { id, value, updatedAt: new Date().toISOString() })
}

export async function testRead(id) {
  const db = await getDB()
  return db.get('test', id)
}

export async function testReadAll() {
  const db = await getDB()
  return db.getAll('test')
}
