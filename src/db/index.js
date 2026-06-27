import { openDB } from 'idb'

const DB_NAME = 'habitos-db'
const DB_VERSION = 2

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
