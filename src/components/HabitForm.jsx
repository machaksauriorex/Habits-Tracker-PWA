import { useState, useEffect } from 'react'
import {
  createHabitWithPhases,
  updateHabitWithPhases,
  archiveHabit,
  deleteHabit,
  getPhasesByHabit,
} from '../db/index.js'
import { HABIT_COLORS, PERIODO_LABELS } from '../utils/constants.js'
import ConfirmDialog from './ConfirmDialog.jsx'

const todayStr = () => new Date().toISOString().split('T')[0]

function makePhase() {
  return { _key: crypto.randomUUID(), startDate: todayStr(), goalType: 'min', goalValue: '' }
}

export default function HabitForm({ habit, onSave, onBack }) {
  const isEditing = !!habit

  const [form, setForm] = useState({
    nombre: habit?.nombre ?? '',
    emoji: habit?.emoji ?? '',
    color: habit?.color ?? HABIT_COLORS[0],
    tipo: habit?.tipo ?? 'boolean',
    periodo: habit?.periodo ?? 'daily',
  })
  const [phases, setPhases] = useState([makePhase()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null) // null | 'archive' | 'delete'

  useEffect(() => {
    if (isEditing) {
      getPhasesByHabit(habit.id).then(dbPhases => {
        if (dbPhases.length > 0) {
          setPhases(dbPhases.map(p => ({
            id: p.id,
            _key: p.id,
            startDate: p.startDate,
            goalType: p.goalType,
            goalValue: p.goalValue,
          })))
        }
      })
    }
  }, [isEditing, habit?.id])

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError('')
  }

  function addPhase() {
    setPhases(prev => [...prev, makePhase()])
  }

  function removePhase(key) {
    if (phases.length <= 1) return
    setPhases(prev => prev.filter(p => p._key !== key))
  }

  function updatePhaseField(key, field, value) {
    setPhases(prev => prev.map(p => p._key === key ? { ...p, [field]: value } : p))
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (form.tipo === 'quantitative') {
      for (const p of phases) {
        if (!p.goalValue || Number(p.goalValue) <= 0) {
          setError('Cada fase necesita un valor de objetivo mayor que 0.')
          return
        }
      }
    }

    setSaving(true)
    try {
      const phasesData = phases.map(p => ({
        ...(p.id ? { id: p.id } : {}),
        startDate: p.startDate,
        goalType: p.goalType,
        goalValue: form.tipo === 'boolean'
          ? (p.goalType === 'min' ? 1 : 0)
          : Number(p.goalValue),
      }))

      if (isEditing) {
        await updateHabitWithPhases(habit.id, form, phasesData)
      } else {
        await createHabitWithPhases(form, phasesData)
      }
      onSave()
    } catch {
      setError('Error al guardar. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  async function handleArchive() {
    setSaving(true)
    await archiveHabit(habit.id)
    onSave()
  }

  async function handleDelete() {
    setSaving(true)
    await deleteHabit(habit.id)
    onSave()
  }

  return (
    <div className="form-page">
      <header className="form-header">
        <button className="btn-ghost" onClick={onBack}>← Volver</button>
        <h2>{isEditing ? 'Editar hábito' : 'Nuevo hábito'}</h2>
      </header>

      <div className="form-body">

        {/* Emoji + Nombre */}
        <div className="form-row">
          <div className="form-group narrow">
            <label htmlFor="emoji">Emoji</label>
            <input
              id="emoji"
              type="text"
              value={form.emoji}
              onChange={e => setField('emoji', e.target.value)}
              placeholder="🏃"
              className="emoji-input"
            />
          </div>
          <div className="form-group grow">
            <label htmlFor="nombre">Nombre <span className="required">*</span></label>
            <input
              id="nombre"
              type="text"
              value={form.nombre}
              onChange={e => setField('nombre', e.target.value)}
              placeholder="Ej: Ejercicio"
              maxLength={50}
            />
          </div>
        </div>

        {/* Color */}
        <div className="form-group">
          <label>Color</label>
          <div className="color-picker">
            {HABIT_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className={`color-swatch${form.color === color ? ' selected' : ''}`}
                style={{ background: color }}
                onClick={() => setField('color', color)}
                aria-label={`Color ${color}`}
              />
            ))}
          </div>
        </div>

        {/* Tipo de registro */}
        <div className="form-group">
          <label>Tipo de registro</label>
          <div className={`btn-group${isEditing ? ' disabled' : ''}`}>
            <button
              type="button"
              className={form.tipo === 'boolean' ? 'active' : ''}
              onClick={() => !isEditing && setField('tipo', 'boolean')}
            >
              Sí / No
            </button>
            <button
              type="button"
              className={form.tipo === 'quantitative' ? 'active' : ''}
              onClick={() => !isEditing && setField('tipo', 'quantitative')}
            >
              Número
            </button>
          </div>
          <p className="form-hint">
            {isEditing
              ? 'El tipo de registro no cambia una vez creado el hábito.'
              : form.tipo === 'boolean'
                ? 'Marcas si lo has hecho o no.'
                : 'Introduces un número (vasos, páginas, cigarros…).'}
          </p>
        </div>

        {/* Periodo */}
        <div className="form-group">
          <label>Periodo</label>
          <div className={`btn-group${isEditing ? ' disabled' : ''}`}>
            {Object.entries(PERIODO_LABELS).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={form.periodo === val ? 'active' : ''}
                onClick={() => !isEditing && setField('periodo', val)}
              >
                {label}
              </button>
            ))}
          </div>
          {isEditing && (
            <p className="form-hint">El periodo no cambia una vez creado el hábito.</p>
          )}
        </div>

        {/* Fases / Objetivo */}
        <div className="form-group">
          <label>Objetivo{phases.length > 1 ? 's (fases)' : ''}</label>

          {phases.map((phase, idx) => (
            <div key={phase._key} className="phase-card">
              {phases.length > 1 && (
                <div className="phase-card-header">
                  <span>Fase {idx + 1}</span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => removePhase(phase._key)}
                  >
                    Eliminar
                  </button>
                </div>
              )}

              <div className="form-group-inline">
                <label>Desde</label>
                <input
                  type="date"
                  value={phase.startDate}
                  onChange={e => updatePhaseField(phase._key, 'startDate', e.target.value)}
                />
              </div>

              <div className="form-group-inline">
                <label>Tipo</label>
                <div className="btn-group">
                  <button
                    type="button"
                    className={phase.goalType === 'min' ? 'active' : ''}
                    onClick={() => updatePhaseField(phase._key, 'goalType', 'min')}
                  >
                    {form.tipo === 'boolean' ? 'Hacerlo' : 'Mínimo'}
                  </button>
                  <button
                    type="button"
                    className={phase.goalType === 'max' ? 'active' : ''}
                    onClick={() => updatePhaseField(phase._key, 'goalType', 'max')}
                  >
                    {form.tipo === 'boolean' ? 'No hacerlo' : 'Máximo'}
                  </button>
                </div>
              </div>

              {form.tipo === 'quantitative' && (
                <div className="form-group-inline">
                  <label>{phase.goalType === 'min' ? 'Al menos' : 'No más de'}</label>
                  <input
                    type="number"
                    value={phase.goalValue}
                    min={0}
                    step={1}
                    onChange={e => updatePhaseField(phase._key, 'goalValue', e.target.value)}
                    className="number-input"
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          ))}

          <button type="button" className="btn-ghost" onClick={addPhase}>
            + Añadir fase futura
          </button>
          <p className="form-hint">
            Las fases permiten cambiar el objetivo en el futuro sin borrar el historial pasado.
          </p>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear hábito'}
        </button>

        {isEditing && (
          <div className="danger-zone">
            <button
              className="btn-warning"
              onClick={() => setConfirm('archive')}
              disabled={saving}
            >
              Archivar
            </button>
            <button
              className="btn-danger"
              onClick={() => setConfirm('delete')}
              disabled={saving}
            >
              Borrar hábito
            </button>
          </div>
        )}
      </div>

      {confirm === 'archive' && (
        <ConfirmDialog
          title="Archivar hábito"
          message={`"${form.nombre}" se archivará. Su historial se conserva y puedes restaurarlo cuando quieras.`}
          confirmLabel="Archivar"
          onConfirm={handleArchive}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'delete' && (
        <ConfirmDialog
          title="Borrar hábito"
          message={`¿Borrar "${form.nombre}" definitivamente? Se elimina el hábito y TODO su historial. Esta acción no se puede deshacer.`}
          confirmLabel="Borrar definitivamente"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
