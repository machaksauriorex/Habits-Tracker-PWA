import { useState, useEffect, useMemo, useCallback } from 'react'
import { getHabits, getAllPhases, getAllRecords, getSettings, upsertRecord, deleteRecord } from '../db/index.js'
import { calcularHucha, getActivePhase, getPeriodInfo } from '../utils/piggybank.js'
import { PERIODO_LABELS } from '../utils/constants.js'
import { useCountUp } from '../hooks/useCountUp.js'

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

function formatNum(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Helpers de color ──────────────────────────────────────────────────────────

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Tinta legible (oscura o clara) según la luminancia del color de fondo. */
function contrastInk(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? 'rgba(8,18,28,.8)' : '#FFFFFF'
}

function Check({ ink }) {
  return (
    <svg width="12" height="9" viewBox="0 0 14 10" fill="none" stroke={ink}
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,5 5,9 13,1" />
    </svg>
  )
}

// ── Componente de entrada numérica ───────────────────────────────────────────

function NumberModal({ habit, date, current, onSave, onCancel }) {
  const [val, setVal] = useState(current != null ? String(current) : '')
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3>{habit.nombre}</h3>
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

export default function Today({ onNew }) {
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

  const registros = useMemo(
    () => Object.entries(recMap).map(([key, value]) => {
      const [habitId, date] = key.split('__')
      return { habitId, date, value }
    }),
    [recMap],
  )

  // Hucha calculada
  const hucha = useMemo(() => {
    if (!settings) return { saldo: 0, rachas: {}, movimientos: [] }
    return calcularHucha({ habitos: allHabits, fases: phases, registros, ajustes: settings, hoy })
  }, [allHabits, phases, registros, settings, hoy])
  const saldo = hucha.saldo
  const saldoAnim = useCountUp(saldo)

  // Aportación de HOY: cuánto suma la hucha gracias a lo marcado hoy
  const deltaHoy = useMemo(() => {
    if (!settings) return 0
    const sinHoy = registros.filter(r => r.date !== hoy)
    const saldoSinHoy = calcularHucha({ habitos: allHabits, fases: phases, registros: sinHoy, ajustes: settings, hoy }).saldo
    return saldo - saldoSinHoy
  }, [saldo, allHabits, phases, registros, settings, hoy])

  // Aportación de ESTA SEMANA: cuánto suma la hucha gracias a lo marcado esta semana
  const deltaSemana = useMemo(() => {
    if (!settings) return 0
    const semana = new Set(getWeekDays(0))
    const sinSemana = registros.filter(r => !semana.has(r.date))
    const saldoSinSemana = calcularHucha({ habitos: allHabits, fases: phases, registros: sinSemana, ajustes: settings, hoy }).saldo
    return saldo - saldoSinSemana
  }, [saldo, allHabits, phases, registros, settings, hoy])

  // Mejor racha actual entre los hábitos
  const mejorRacha = useMemo(
    () => Object.values(hucha.rachas).reduce((mx, r) => Math.max(mx, r.actual), 0),
    [hucha.rachas],
  )

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
    // Hábitos de "máximo": cada día pasado debe marcarse (aunque sea 0); un día en
    // blanco invalida la racha, así que se señala para que el usuario lo rellene.
    const missing = phase?.goalType === 'max'
      && !hasVal && !isFuture && !!trackingStart && date >= trackingStart

    let done = false
    if (habit.periodo === 'daily') {
      if (hasVal && phase) {
        done = phase.goalType === 'min' ? value >= phase.goalValue : value <= phase.goalValue
      }
    } else {
      const info = getPeriodInfo(habit, ps, recMap, date, hoy)
      done = !!info?.cumplido
    }

    return { value, hasVal, done, isFuture, missing }
  }

  function habitSubtitle(habit, activePhase, periodInfo) {
    const u = habit.unidad ? ` ${habit.unidad}` : ''
    if (habit.periodo !== 'daily' && periodInfo) {
      const lim = periodInfo.goalType === 'max' ? '≤' : ''
      return `${lim}${periodInfo.total}/${periodInfo.goal}${u} ${PERIODO_LABELS[habit.periodo].toLowerCase()}`
    }
    if (habit.tipo === 'boolean') return 'Diario'
    if (!activePhase) return 'Diario'
    return `${activePhase.goalType === 'max' ? 'máx.' : 'mín.'} ${activePhase.goalValue}${u}`
  }

  const activeHabits = allHabits.filter(h => h.status === 'active')

  if (loading) {
    return <div className="today-page"><p className="loading-text">Cargando…</p></div>
  }

  if (dbError) {
    return (
      <div className="today-page">
        <p className="loading-text" style={{ color: 'var(--warn)' }}>{dbError}</p>
      </div>
    )
  }

  return (
    <div className="today-page">
      {/* Cabecera con saldo (héroe) */}
      <header className="today-header">
        <p className="saldo-label">Saldo acumulado</p>
        <div className="saldo-amount">
          <span className="saldo-num tnum">{formatNum(saldoAnim)}</span>
          <span className="saldo-cur">€</span>
        </div>
        {(() => {
          const parts = []
          if (deltaHoy > 0.0001) {
            parts.push(<span key="h" className="saldo-delta tnum">↑ +{formatNum(deltaHoy)} € hoy</span>)
          }
          if (deltaSemana > 0.0001) {
            parts.push(<span key="w" className="saldo-week tnum">+{formatNum(deltaSemana)} € esta semana</span>)
          }
          if (mejorRacha > 0) {
            parts.push(<span key="r" className="saldo-racha">racha · {mejorRacha} {mejorRacha === 1 ? 'día' : 'días'}</span>)
          }
          if (!parts.length) return null
          return (
            <div className="saldo-sub">
              {parts.flatMap((p, i) => i === 0 ? [p] : [<span key={`dot${i}`} className="saldo-dot" />, p])}
            </div>
          )
        })()}
      </header>

      {/* Cabecera de días con navegación discreta de semana */}
      <div className="grid-header">
        <div className="week-stepper">
          <button className="week-arrow" onClick={() => setWeekOffset(o => o - 1)} aria-label="Semana anterior">‹</button>
          <span className="week-label">
            {weekOffset === 0 ? 'Esta semana' : formatWeekLabel(weekDays)}
          </span>
          <button
            className="week-arrow"
            onClick={() => setWeekOffset(o => o + 1)}
            disabled={weekOffset >= 0}
            aria-label="Semana siguiente"
          >
            ›
          </button>
        </div>
        <div className="day-track">
          {weekDays.map(date => (
            <div key={date} className={`day-col-header${date === hoy ? ' today' : ''}`}>
              {DAY_INITIALS[new Date(date + 'T12:00:00').getDay()]}
            </div>
          ))}
        </div>
      </div>

      {/* Lista de hábitos */}
      {activeHabits.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 24px' }}>
          <p>Aún no hay hábitos.</p>
          <p>Toca el botón <strong>+</strong> para crear el primero.</p>
        </div>
      ) : (
        <ul className="habit-list">
          {activeHabits.map(habit => {
            const ps = phasesByHabit[habit.id] ?? []
            const activePhase = getActivePhase(ps, hoy)
            const periodInfo = habit.periodo !== 'daily'
              ? getPeriodInfo(habit, ps, recMap, weekDays[0], hoy)
              : null
            const subtitle = habitSubtitle(habit, activePhase, periodInfo)
            // Máximo superado en la semana visible → se marca la semana como incumplida
            const failed = !!periodInfo && periodInfo.goalType === 'max' && periodInfo.total > periodInfo.goal

            return (
              <li key={habit.id} className="habit-card">
                <span className="habit-bar" style={{ background: habit.color }} />
                <div className="habit-label-col">
                  <div className="habit-row-text">
                    <span className="habit-row-name">{habit.nombre}</span>
                    <span className="habit-row-sub">{subtitle}</span>
                  </div>
                </div>

                {/* Celdas de días */}
                <div className={`day-track${failed ? ' failed' : ''}`}>
                  {weekDays.map(date => {
                    const { value, hasVal, done, isFuture, missing } = cellInfo(habit, date)
                    const color = habit.color
                    const isBool = habit.tipo === 'boolean'

                    let variant = 'empty'
                    let style
                    let content = null

                    if (isFuture) {
                      variant = 'future'
                    } else if (done) {
                      variant = 'done'
                      style = { background: color, borderColor: color }
                      content = isBool
                        ? <Check ink={contrastInk(color)} />
                        : <span style={{ color: contrastInk(color) }}>{value}</span>
                    } else if (hasVal) {
                      variant = 'partial'
                      style = { background: hexA(color, 0.30), borderColor: 'transparent' }
                      content = isBool ? null : <span style={{ color: 'rgba(255,255,255,.78)' }}>{value}</span>
                    } else if (missing) {
                      variant = 'missing'
                      content = '0?'
                    }

                    return (
                      <button
                        key={date}
                        className={[
                          'day-cell', variant,
                          date === hoy ? 'today' : '',
                        ].filter(Boolean).join(' ')}
                        style={style}
                        onClick={() => !isFuture && handleCellTap(habit, date)}
                        disabled={isFuture}
                      >
                        {content}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Botón flotante para crear hábito */}
      {onNew && (
        <button className="fab" onClick={onNew} aria-label="Nuevo hábito">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#14161A"
            strokeWidth="2.5" strokeLinecap="round">
            <line x1="11" y1="3" x2="11" y2="19" />
            <line x1="3" y1="11" x2="19" y2="11" />
          </svg>
        </button>
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
