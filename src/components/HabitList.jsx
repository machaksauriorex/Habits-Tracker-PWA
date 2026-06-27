import { useState, useEffect } from 'react'
import { getHabits, deleteHabit, restoreHabit } from '../db/index.js'
import { PERIODO_LABELS } from '../utils/constants.js'
import ConfirmDialog from './ConfirmDialog.jsx'

export default function HabitList({ onNew, onEdit }) {
  const [habits, setHabits] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function load() {
    const all = await getHabits()
    // orden: por fecha de creación, más reciente al final
    all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    setHabits(all)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleRestore(habit) {
    await restoreHabit(habit.id)
    await load()
  }

  async function handleDelete() {
    await deleteHabit(confirmDelete.id)
    setConfirmDelete(null)
    await load()
  }

  const active = habits.filter(h => h.status === 'active')
  const archived = habits.filter(h => h.status === 'archived')

  if (loading) {
    return (
      <div className="habits-page">
        <p className="loading-text">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="habits-page">
      <header className="habits-header">
        <h1>Mis hábitos</h1>
        <button className="btn-fab" onClick={onNew} aria-label="Nuevo hábito">+</button>
      </header>

      {active.length === 0 ? (
        <div className="empty-state">
          <p>No tienes hábitos activos aún.</p>
          <p>Toca <strong>+</strong> para crear el primero.</p>
        </div>
      ) : (
        <ul className="habit-list">
          {active.map(habit => (
            <li key={habit.id} className="habit-item">
              <div className="habit-color-dot" style={{ background: habit.color }} />
              <div className="habit-info">
                {habit.emoji && <span className="habit-emoji">{habit.emoji}</span>}
                <span className="habit-name">{habit.nombre}</span>
                <span className="period-badge">{PERIODO_LABELS[habit.periodo]}</span>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => onEdit(habit)}>
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="archived-section">
          <button
            className="btn-ghost archived-toggle"
            onClick={() => setShowArchived(v => !v)}
          >
            {showArchived ? '▲' : '▼'} Archivados ({archived.length})
          </button>
          {showArchived && (
            <ul className="habit-list">
              {archived.map(habit => (
                <li key={habit.id} className="habit-item habit-item--archived">
                  <div className="habit-color-dot" style={{ background: habit.color, opacity: 0.4 }} />
                  <div className="habit-info">
                    {habit.emoji && <span className="habit-emoji">{habit.emoji}</span>}
                    <span className="habit-name" style={{ opacity: 0.5 }}>{habit.nombre}</span>
                  </div>
                  <div className="archived-actions">
                    <button className="btn-ghost btn-sm" onClick={() => handleRestore(habit)}>
                      Restaurar
                    </button>
                    <button
                      className="btn-ghost btn-sm btn-ghost--danger"
                      onClick={() => setConfirmDelete(habit)}
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar hábito archivado"
          message={`¿Borrar "${confirmDelete.nombre}" definitivamente? Se elimina el hábito y TODO su historial. Esta acción no se puede deshacer.`}
          confirmLabel="Borrar definitivamente"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
