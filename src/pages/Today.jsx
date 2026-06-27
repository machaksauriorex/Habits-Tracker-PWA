import { useState, useEffect, useMemo, useCallback } from 'react'
import { getHabits, getAllPhases, getAllRecords, getSettings, upsertRecord, deleteRecord } from '../db/index.js'
import { calcularHucha, getActivePhase, getPeriodInfo } from '../utils/piggybank.js'
import { PERIODO_LABELS } from '../utils/constants.js'

// ── Helpers de fecha ─────────────────────────────────────────────────────────

const DAY_INITIALS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] // 0=Dom…6=Sáb

function todayStr() {
  // Fecha LOCAL (no UTC): evita que de madrugada se considere "hoy" el día anterior
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().split('T')[0]
}

function getWeekDays(offset) {
  const monday = addDays(getMonday(todayStr()), offset * 7)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

function formatWeekLabel(days) {
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  return `${fmt(days[0])} – ${fmt(days[6])}`
}

function formatSaldo(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── Componente de entrada numérica ───────────────────────────────────────────

function NumberModal({ habit, date, current, onSave, onCancel }) {
  const [val, setVal] = useState(current != null ? String(current) : '')
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3>{habit.emoji} {habit.nombre}</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 16px', fontSize: 13 }}>
          {new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <input
          type="number"
          value={val}
          min={0}
          step={1}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave(val)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px',
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            borderRadius: 10, color: 'var(--text)', fontSize: 24, textAlign: 'center',
            marginBottom: 16,
          }}
        />
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSave(val)}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Today ────────────────────────────────────────────────────────────────────

export default function Today() {
  const [allHabits,  setAllHabits]  = useState([])
  const [phases,     setPhases]     = useState([])
  const [recMap,     setRecMap]     = useState({}) // 'habitId__date' → value
  const [settings,   setSettings]   = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [dbError,    setDbError]    = useState(null)
  const [numModal,   setNumModal]   = useState(null) // { habit, date, current }

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const hoy      = todayStr()

  // Carga inicial de todos los datos
  async function loadAll() {
    try {
      const [habits, allPhases, records, cfg] = await Promise.all([
        getHabits(), getAllPhases(), getAllRecords(), getSettings(),
      ])
      const map = {}
      for (const r of records) map[`${r.habitId}__${r.date}`] = r.value
      setAllHabits(habits)
      setPhases(allPhases)
      setRecMap(map)
      setSettings(cfg)
      setLoading(false)
    } catch (err) {
      console.error('Error cargando datos:', err)
      setDbError('No se pudieron cargar los datos. Recarga la página.')
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Índice de fases por hábito (ordenadas por startDate ASC)
  const phasesByHabit = useMemo(() => {
    const map = {}
    for (const p of phases) (map[p.habitId] ??= []).push(p)
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.startDate.localeCompare(b.startDate))
    return map
  }, [phases])

  // Hucha calculada
  const { saldo } = useMemo(() => {
    if (!settings) return { saldo: 0 }
    const registros = Object.entries(recMap).map(([key, value]) => {
      const [habitId, date] = key.split('__')
      return { habitId, date, value }
    })
    return calcularHucha({ habitos: allHabits, fases: phases, registros, ajustes: settings, hoy })
  }, [allHabits, phases, recMap, settings, hoy])

  // ── Acciones sobre registros ───────────────────────────────────────────────

  const toggleBoolean = useCallback(async (habit, date) => {
    const key = `${habit.id}__${date}`
    const existing = recMap[key]
    if (existing) {
      await deleteRecord(habit.id, date)
      setRecMap(prev => { const n = { ...prev }; delete n[key]; return n })
    } else {
      await upsertRecord(habit.id, date, true)
      setRecMap(prev => ({ ...prev, [key]: true }))
    }
  }, [recMap])

  const saveNumber = useCallback(async (habitId, date, rawVal) => {
    const value = parseFloat(rawVal)
    if (isNaN(value) || value < 0) { setNumModal(null); return }
    await upsertRecord(habitId, date, value)
    setRecMap(prev => ({ ...prev, [`${habitId}__${date}`]: value }))
    setNumModal(null)
  }, [])

  const handleCellTap = useCallback((habit, date) => {
    if (date > hoy) return // no se puede marcar el futuro
    if (habit.tipo === 'boolean') {
      toggleBoolean(habit, date)
    } else {
      const current = recMap[`${habit.id}__${date}`]
      setNumModal({ habit, date, current: current ?? null })
    }
  }, [hoy, recMap, toggleBoolean])

  // ── Render de celdas ──────────────────────────────────────────────────────

  function cellInfo(habit, date) {
    const ps      = phasesByHabit[habit.id] ?? []
    const value   = recMap[`${habit.id}__${date}`]
    const hasVal  = value !== undefined && value !== null
    const isFuture = date > hoy

    const phase = getActivePhase(ps, date)
    const trackingStart = ps[0]?.startDate
    // Hábitos de "máximo": cada día ya pasado debe marcarse (aunque sea 0). Un día
    // en blanco invalida la racha, así que se señala para que el usuario lo rellene.
    const missing = phase?.goalType === 'max'
      && !hasVal && !isFuture && !!trackingStart && date >= trackingStart

    let done = false
    if (habit.periodo === 'daily') {
      // Diario: el día se cumple comparando su propio valor con el objetivo.
      if (hasVal && phase) {
        done = phase.goalType === 'min' ? value >= phase.goalValue : value <= phase.goalValue
      }
    } else {
      // Semanal/mensual: el día se pinta "cumplido" cuando TODO el periodo
      // (la semana/el mes que lo contiene) ya está cumplido.
      const info = getPeriodInfo(habit, ps, recMap, date, hoy)
      done = !!info?.cumplido
    }

    return { value, hasVal, done, isFuture, missing }
  }

  const activeHabits = allHabits.filter(h => h.status === 'active')

  if (loading) {
    return <div className="today-page"><p className="loading-text">Cargando…</p></div>
  }

  if (dbError) {
    return (
      <div className="today-page">
        <p className="loading-text" style={{ color: '#ef4444' }}>{dbError}</p>
      </div>
    )
  }

  return (
    <div className="today-page">
      {/* Cabecera con saldo */}
      <header className="today-header">
        <div>
          <p className="saldo-label">Hucha</p>
          <p className="saldo-valor">{formatSaldo(saldo)}</p>
        </div>
      </header>

      {/* Navegación de semana */}
      <div className="week-nav">
        <button className="btn-ghost btn-sm" onClick={() => setWeekOffset(o => o - 1)}>←</button>
        <span className="week-label">
          {weekOffset === 0 ? 'Esta semana' : formatWeekLabel(weekDays)}
        </span>
        <button
          className="btn-ghost btn-sm"
          onClick={() => setWeekOffset(o => o + 1)}
          disabled={weekOffset >= 0}
        >
          →
        </button>
      </div>

      {/* Cabecera de días */}
      <div className="grid-header">
        <div className="habit-label-col" />
        {weekDays.map(date => (
          <div key={date} className={`day-col-header${date === hoy ? ' today' : ''}`}>
            {DAY_INITIALS[new Date(date + 'T12:00:00').getDay()]}
          </div>
        ))}
      </div>

      {/* Lista de hábitos */}
      {activeHabits.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 24px' }}>
          <p>No tienes hábitos activos.</p>
          <p>Ve a <strong>Ajustes</strong> para crear el primero.</p>
        </div>
      ) : (
        <ul className="habit-rows">
          {activeHabits.map(habit => {
            const ps = phasesByHabit[habit.id] ?? []
            // Progreso del periodo de la SEMANA VISIBLE (no siempre la actual)
            const progress = habit.periodo !== 'daily'
              ? getPeriodInfo(habit, ps, recMap, weekDays[0], hoy)
              : null

            return (
              <li key={habit.id} className="habit-row">
                {/* Nombre del hábito */}
                <div className="habit-label-col">
                  <span className="habit-row-dot" style={{ background: habit.color }} />
                  <div className="habit-row-text">
                    <span className="habit-row-name">
                      {habit.emoji ? `${habit.emoji} ${habit.nombre}` : habit.nombre}
                    </span>
                    {progress && (
                      <span className="period-progress">
                        {progress.goalType === 'max' ? '≤' : ''}{progress.total}/{progress.goal} {PERIODO_LABELS[habit.periodo].toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Celdas de días */}
                {weekDays.map(date => {
                  const { value, hasVal, done, isFuture, missing } = cellInfo(habit, date)

                  return (
                    <button
                      key={date}
                      className={[
                        'day-cell',
                        done ? 'done' : hasVal ? 'partial' : missing ? 'missing' : '',
                        date === hoy ? 'today' : '',
                        isFuture ? 'inactive' : '',
                      ].filter(Boolean).join(' ')}
                      style={done ? { background: habit.color, borderColor: habit.color } : missing ? undefined : { borderColor: habit.color + '55' }}
                      onClick={() => !isFuture && handleCellTap(habit, date)}
                      disabled={isFuture}
                    >
                      {habit.tipo === 'quantitative' && hasVal ? value : missing ? '0?' : ''}
                    </button>
                  )
                })}
              </li>
            )
          })}
        </ul>
      )}

      {numModal && (
        <NumberModal
          habit={numModal.habit}
          date={numModal.date}
          current={numModal.current}
          onSave={(val) => saveNumber(numModal.habit.id, numModal.date, val)}
          onCancel={() => setNumModal(null)}
        />
      )}
    </div>
  )
}
