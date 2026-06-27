import { openDB } from 'idb'

const DB_NAME = 'habitos-db'
const DB_VERSION = 3

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('test', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          const habitsStore = db.createObjectStore('habits', { keyPath: 'id' })
          habitsStore.createIndex('by-status', 'status')

          const phasesStore = db.createObjectStore('phases', { keyPath: 'id' })
          phasesStore.createIndex('by-habit', 'habitId')
        }
        if (oldVersion < 3) {
          // Clave compuesta [habitId, date] → un único registro por hábito y día
          db.createObjectStore('records', { keyPath: ['habitId', 'date'] })
          // Ajustes globales (base e incremento de la hucha)
          db.createObjectStore('settings', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

// ── Habits ──────────────────────────────────────────────────────

export async function getHabits() {
  const db = await getDB()
  return db.getAll('habits')
}

export async function createHabitWithPhases(habitData, phasesData) {
  const db = await getDB()
  const now = new Date().toISOString()
  const habitId = crypto.randomUUID()

  const habit = { id: habitId, ...habitData, status: 'active', createdAt: now }
  const phases = phasesData.map(p => ({
    id: crypto.randomUUID(),
    habitId,
    ...p,
    createdAt: now,
  }))

  const tx = db.transaction(['habits', 'phases'], 'readwrite')
  await tx.objectStore('habits').put(habit)
  for (const phase of phases) {
    await tx.objectStore('phases').put(phase)
  }
  await tx.done

  return { habit, phases }
}

export async function updateHabitWithPhases(habitId, habitData, phasesData) {
  const db = await getDB()
  const now = new Date().toISOString()

  const tx = db.transaction(['habits', 'phases'], 'readwrite')

  const existingHabit = await tx.objectStore('habits').get(habitId)
  const existingPhases = await tx.objectStore('phases').index('by-habit').getAll(habitId)
  const existingPhaseMap = new Map(existingPhases.map(p => [p.id, p]))
  const incomingIds = new Set(phasesData.filter(p => p.id).map(p => p.id))

  await tx.objectStore('habits').put({ ...existingHabit, ...habitData, updatedAt: now })

  for (const ep of existingPhases) {
    if (!incomingIds.has(ep.id)) {
      await tx.objectStore('phases').delete(ep.id)
    }
  }

  for (const pd of phasesData) {
    if (pd.id && existingPhaseMap.has(pd.id)) {
      await tx.objectStore('phases').put({ ...existingPhaseMap.get(pd.id), ...pd })
    } else {
      await tx.objectStore('phases').put({
        id: crypto.randomUUID(),
        habitId,
        ...pd,
        createdAt: now,
      })
    }
  }

  await tx.done
}

export async function archiveHabit(habitId) {
  const db = await getDB()
  const habit = await db.get('habits', habitId)
  await db.put('habits', { ...habit, status: 'archived', archivedAt: new Date().toISOString() })
}

export async function restoreHabit(habitId) {
  const db = await getDB()
  const habit = await db.get('habits', habitId)
  await db.put('habits', { ...habit, status: 'active', archivedAt: null })
}

export async function deleteHabit(habitId) {
  const db = await getDB()
  const tx = db.transaction(['habits', 'phases'], 'readwrite')
  const phases = await tx.objectStore('phases').index('by-habit').getAll(habitId)
  for (const phase of phases) {
    await tx.objectStore('phases').delete(phase.id)
  }
  await tx.objectStore('habits').delete(habitId)
  await tx.done
}

// ── Phases ──────────────────────────────────────────────────────

export async function getPhasesByHabit(habitId) {
  const db = await getDB()
  const phases = await db.getAllFromIndex('phases', 'by-habit', habitId)
  return phases.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export async function getAllPhases() {
  const db = await getDB()
  return db.getAll('phases')
}

// ── Records ──────────────────────────────────────────────────────

export async function getAllRecords() {
  const db = await getDB()
  return db.getAll('records')
}

/** Crea o actualiza el registro de un hábito en una fecha. */
export async function upsertRecord(habitId, date, value) {
  const db = await getDB()
  const record = { habitId, date, value }
  await db.put('records', record)
  return record
}

/** Borra el registro de un hábito en una fecha (equivale a "no marcado"). */
export async function deleteRecord(habitId, date) {
  const db = await getDB()
  await db.delete('records', [habitId, date])
}

// ── Settings ─────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { id: 'piggybank', base: 0.20, incremento: 0.05 }

export async function getSettings() {
  const db = await getDB()
  return (await db.get('settings', 'piggybank')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(data) {
  const db = await getDB()
  await db.put('settings', { id: 'piggybank', ...data })
}
