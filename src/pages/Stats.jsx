import { useState, useEffect, useMemo } from 'react'
import { getHabits, getAllPhases, getAllRecords, getSettings } from '../db/index.js'
import { calcularHucha, getActivePhase } from '../utils/piggybank.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(s, n) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]
}
function getMonday(s) {
  const d = new Date(s + 'T12:00:00'), dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().split('T')[0]
}
function formatNum(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DAYS   = ['L','M','X','J','V','S','D']

function periodRange(sel, today) {
  const d = new Date(today + 'T12:00:00'), y = d.getFullYear(), m = d.getMonth()
  if (sel === 'week') {
    const mon = getMonday(today)
    return { start: mon, end: addDays(mon, 6), label: 'Esta semana' }
  }
  if (sel === 'month') {
    const start = `${y}-${String(m+1).padStart(2,'0')}-01`
    const dim   = new Date(y, m+1, 0).getDate()
    const end   = `${y}-${String(m+1).padStart(2,'0')}-${String(dim).padStart(2,'0')}`
    return { start, end, label: `${MONTHS[m]} ${y}` }
  }
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) }
}

// Grid[col][row]: row 0=Lun … 6=Dom
function buildGrid(start, end) {
  const grid = []
  let cur = getMonday(start)
  while (cur <= end) {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push({ date: cur, inP: cur >= start && cur <= end })
      cur = addDays(cur, 1)
    }
    grid.push(week)
  }
  return grid
}

function isDone(habit, date, phasesByHabit, recMap) {
  const val = recMap[`${habit.id}__${date}`]
  if (val === undefined) return false
  const phase = getActivePhase(phasesByHabit[habit.id] ?? [], date)
  if (!phase) return !!val
  if (habit.tipo === 'boolean') return val === true
  const v = Number(val)
  return phase.goalType === 'min' ? v >= phase.goalValue : v <= phase.goalValue
}

function compliance(habit, start, end, today, phasesByHabit, recMap) {
  const trackStart = phasesByHabit[habit.id]?.[0]?.startDate ?? start
  let total = 0, done = 0
  let d = start < trackStart ? trackStart : start
  while (d <= end && d <= today) {
    total++
    if (isDone(habit, d, phasesByHabit, recMap)) done++
    d = addDays(d, 1)
  }
  return total > 0 ? Math.round(done / total * 100) : 0
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function Heatmap({ grid, getColor, today, small }) {
  const sz = small ? 9 : 12
  return (
    <div className="hm-wrap">
      <div className="hm-labels">
        {DAYS.map(l => <div key={l} className="hm-label">{l}</div>)}
      </div>
      <div className="hm-cols" style={{ '--sz': `${sz}px` }}>
        {grid.map((week, ci) => (
          <div key={ci} className="hm-col">
            {week.map(({ date, inP }, ri) => (
              <div
                key={ri}
                className={`hm-cell${date === today ? ' hm-today' : ''}`}
                style={{ background: inP ? getColor(date) : 'transparent' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BarChart (últimos 7 días, solo cuantitativos) ─────────────────────────────

function BarChart({ habit, phasesByHabit, recMap, today }) {
  const days  = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const vals  = days.map(d => ({ date: d, val: recMap[`${habit.id}__${d}`] ?? null }))
  const maxV  = Math.max(...vals.map(v => v.val ?? 0), 1)
  const phase = getActivePhase(phasesByHabit[habit.id] ?? [], today)
  const goal  = phase?.goalValue ?? 0

  return (
    <div className="bar-chart">
      {vals.map(({ date, val }) => {
        const pct  = val != null ? Math.min((Number(val) / maxV) * 100, 100) : 0
        const done = val != null && phase &&
          (phase.goalType === 'min' ? Number(val) >= goal : Number(val) <= goal)
        const dow  = new Date(date + 'T12:00:00').getDay()
        return (
          <div key={date} className="bar-col">
            <div className="bar-track">
              {goal > 0 && (
                <div className="bar-goal-line"
                  style={{ bottom: `${Math.min((goal/maxV)*100, 100)}%` }} />
              )}
              <div className="bar-fill"
                style={{ height: `${pct}%`, background: done ? habit.color : 'rgba(138,144,156,.35)' }} />
            </div>
            <div className="bar-label">{DAYS[dow === 0 ? 6 : dow - 1]}</div>
            {val != null && <div className="bar-val tnum">{val}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Pantalla individual de hábito ─────────────────────────────────────────────

function StatsHabit({ habit, phasesByHabit, recMap, movimientos, rachas, onBack, today }) {
  const sortedPhases = useMemo(() =>
    [...(phasesByHabit[habit.id] ?? [])].sort((a,b) => a.startDate.localeCompare(b.startDate))
  , [phasesByHabit, habit.id])

  const racha      = rachas[habit.id] ?? { actual: 0, record: 0 }
  const aportacion = useMemo(() =>
    movimientos.filter(m => m.habitId === habit.id && m.motivo === 'cumplido')
               .reduce((s, m) => s + m.cantidad, 0)
  , [movimientos, habit.id])

  const end12   = addDays(getMonday(today), 6)
  const start12 = addDays(end12, -83) // 12 semanas
  const grid12  = useMemo(() => buildGrid(start12, end12), [start12, end12])

  const compliance12 = useMemo(() => {
    const ts = sortedPhases[0]?.startDate
    let done = 0, total = 0
    let d = start12
    while (d <= today && d <= end12) {
      if (!ts || d >= ts) { total++; if (isDone(habit, d, phasesByHabit, recMap)) done++ }
      d = addDays(d, 1)
    }
    return total > 0 ? Math.round(done / total * 100) : 0
  }, [habit, phasesByHabit, recMap, today, start12, end12, sortedPhases])

  const earningsByPhase = useMemo(() => {
    const map = {}
    for (const mv of movimientos) {
      if (mv.habitId !== habit.id || mv.motivo !== 'cumplido') continue
      const ph = getActivePhase(sortedPhases, mv.periodo)
      if (ph) map[ph.startDate] = (map[ph.startDate] ?? 0) + mv.cantidad
    }
    return map
  }, [movimientos, habit.id, sortedPhases])

  return (
    <div className="stats-page">
      <header className="stats-habit-header">
        <button className="stats-back" onClick={onBack}>
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6,1 1,6 6,11" />
          </svg>
          Estadísticas
        </button>
        <div className="stats-habit-title">
          <span className="stats-habit-bar" style={{ background: habit.color }} />
          <h2>{habit.emoji ? `${habit.emoji} ` : ''}{habit.nombre}</h2>
        </div>
      </header>

      <div className="stats-body">
        {/* KPIs */}
        <div className="kpi-row">
          <div className="kpi-tile">
            <span className="kpi-label">Aportación total</span>
            <span className="kpi-value tnum">{formatNum(aportacion)}&thinsp;<span className="kpi-unit">€</span></span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Racha actual</span>
            <span className="kpi-value">{racha.actual}&thinsp;<span className="kpi-unit">días</span></span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Mejor racha</span>
            <span className="kpi-value">{racha.record}&thinsp;<span className="kpi-unit">días</span></span>
          </div>
        </div>

        {/* Heatmap 12 semanas */}
        <section>
          <div className="stats-section-header">
            <span className="stats-section-title">Actividad · Últimas 12 semanas</span>
            <span className="stats-pct">{compliance12}% cumplimiento</span>
          </div>
          <Heatmap
            grid={grid12}
            getColor={date => {
              if (date > today) return 'var(--bg)'
              if (isDone(habit, date, phasesByHabit, recMap)) return habit.color
              if (recMap[`${habit.id}__${date}`] !== undefined) return `${habit.color}44`
              return 'var(--bg)'
            }}
            today={today}
            small
          />
        </section>

        {/* Barra últimos 7 días (cuantitativos) */}
        {habit.tipo === 'quantitative' && (
          <section>
            <div className="stats-section-header">
              <span className="stats-section-title">Últimos 7 días</span>
            </div>
            <BarChart habit={habit} phasesByHabit={phasesByHabit} recMap={recMap} today={today} />
          </section>
        )}

        {/* Fases */}
        {sortedPhases.length > 0 && (
          <section>
            <div className="stats-section-header">
              <span className="stats-section-title">Fases</span>
            </div>
            <div className="phases-list">
              {sortedPhases.map((ph, i) => {
                const isActive = ph.startDate <= today &&
                  (i === sortedPhases.length - 1 || sortedPhases[i+1].startDate > today)
                const earned = earningsByPhase[ph.startDate] ?? 0
                const until = sortedPhases[i+1]
                  ? `hasta ${fmtDate(addDays(sortedPhases[i+1].startDate, -1))}`
                  : isActive ? 'hasta hoy' : 'próxima'
                return (
                  <div key={ph.startDate} className={`phase-stat-row${isActive ? ' phase-active' : ''}`}>
                    <div className="phase-stat-left">
                      <span className="phase-stat-name">
                        Fase {i+1}{isActive ? ' — actual' : sortedPhases[i+1] ? '' : ' — próxima'}
                      </span>
                      <span className="phase-stat-desc">
                        desde {fmtDate(ph.startDate)} · {ph.goalType === 'max' ? 'máx.' : 'mín.'} {ph.goalValue}
                        {' · '}{until}
                      </span>
                    </div>
                    {earned > 0 && <span className="phase-stat-earned tnum">{formatNum(earned)} €</span>}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Pantalla global de estadísticas ──────────────────────────────────────────

function StatsGlobal({ habits, phasesByHabit, recMap, rachas, onHabitClick, today }) {
  const [period, setPeriod] = useState('month')
  const { start, end, label } = useMemo(() => periodRange(period, today), [period, today])
  const grid    = useMemo(() => buildGrid(start, end), [start, end])
  const clamped = end > today ? today : end
  const isYear  = period === 'year'

  const getGlobalColor = (date) => {
    if (date > today) return 'var(--bg)'
    const eligible = habits.filter(h =>
      h.periodo === 'daily' && (phasesByHabit[h.id]?.[0]?.startDate ?? '9999') <= date
    )
    if (!eligible.length) return 'var(--surface)'
    const done = eligible.filter(h => isDone(h, date, phasesByHabit, recMap)).length
    const rate = done / eligible.length
    if (rate === 0) return 'var(--bg)'
    return `rgba(233,196,106,${(0.15 + rate * 0.85).toFixed(2)})`
  }

  const complianceList = useMemo(() =>
    habits
      .map(h => ({ habit: h, pct: compliance(h, start, clamped, today, phasesByHabit, recMap) }))
      .sort((a, b) => b.pct - a.pct)
  , [habits, start, clamped, today, phasesByHabit, recMap])

  const topRachas = useMemo(() =>
    habits
      .filter(h => (rachas[h.id]?.record ?? 0) > 0)
      .map(h => ({ habit: h, record: rachas[h.id].record, actual: rachas[h.id].actual }))
      .sort((a, b) => b.record - a.record)
      .slice(0, 5)
  , [habits, rachas])

  const maxRecord = topRachas[0]?.record ?? 1

  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1 className="stats-title">Estadísticas</h1>
        <div className="period-tabs">
          {[['week','Sem'],['month','Mes'],['year','Año']].map(([k,l]) => (
            <button key={k} className={`period-tab${period===k?' active':''}`} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
      </header>

      <div className="stats-body">
        {/* Heatmap actividad */}
        <section>
          <div className="stats-section-header">
            <span className="stats-section-title">Actividad diaria · {label}</span>
          </div>
          <Heatmap grid={grid} getColor={getGlobalColor} today={today} small={isYear} />
        </section>

        {/* Cumplimiento */}
        {complianceList.length > 0 && (
          <section>
            <div className="stats-section-header">
              <span className="stats-section-title">
                Cumplimiento {period === 'month' ? 'mensual' : period === 'week' ? 'semanal' : 'anual'}
              </span>
            </div>
            <div className="compliance-list">
              {complianceList.map(({ habit, pct }) => (
                <button key={habit.id} className="compliance-row" onClick={() => onHabitClick(habit)}>
                  <div className="compliance-top">
                    <span className="compliance-dot" style={{ background: habit.color }} />
                    <span className="compliance-name">
                      {habit.emoji ? `${habit.emoji} ` : ''}{habit.nombre}
                    </span>
                    <span className="compliance-pct tnum">{pct}%</span>
                  </div>
                  <div className="compliance-bar-track">
                    <div className="compliance-bar-fill" style={{ width: `${pct}%`, background: habit.color }} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Mejores rachas */}
        {topRachas.length > 0 && (
          <section>
            <div className="stats-section-header">
              <span className="stats-section-title">Mejores rachas</span>
            </div>
            <div className="rachas-list">
              {topRachas.map(({ habit, record, actual }) => (
                <button key={habit.id} className="racha-row" onClick={() => onHabitClick(habit)}>
                  <div className="racha-bar-track">
                    <div className="racha-bar-fill"
                      style={{ width: `${(record/maxRecord)*100}%`, background: habit.color }}>
                      <span className="racha-bar-num">{record}</span>
                    </div>
                  </div>
                  <span className="racha-name">
                    {habit.emoji ? `${habit.emoji} ` : ''}{habit.nombre}
                    {actual > 0 && actual === record && <span className="racha-active-badge"> · activa</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {habits.length === 0 && (
          <div className="empty-state">
            <p>Aún no hay hábitos para mostrar.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stats (entrada) ───────────────────────────────────────────────────────────

export default function Stats() {
  const [habits,   setHabits]   = useState([])
  const [phases,   setPhases]   = useState([])
  const [recMap,   setRecMap]   = useState({})
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const today = todayStr()

  useEffect(() => {
    async function load() {
      const [h, ph, recs, cfg] = await Promise.all([
        getHabits(), getAllPhases(), getAllRecords(), getSettings(),
      ])
      const map = {}
      for (const r of recs) map[`${r.habitId}__${r.date}`] = r.value
      setHabits(h); setPhases(ph); setRecMap(map); setSettings(cfg)
      setLoading(false)
    }
    load()
  }, [])

  const phasesByHabit = useMemo(() => {
    const map = {}
    for (const p of phases) (map[p.habitId] ??= []).push(p)
    for (const k of Object.keys(map)) map[k].sort((a,b) => a.startDate.localeCompare(b.startDate))
    return map
  }, [phases])

  const registros = useMemo(() =>
    Object.entries(recMap).map(([key, value]) => {
      const [habitId, date] = key.split('__'); return { habitId, date, value }
    })
  , [recMap])

  const { rachas, movimientos } = useMemo(() => {
    if (!settings) return { rachas: {}, movimientos: [] }
    return calcularHucha({ habitos: habits, fases: phases, registros, ajustes: settings, hoy: today })
  }, [habits, phases, registros, settings, today])

  if (loading) return <div className="stats-page"><p className="loading-text">Cargando…</p></div>

  const activeHabits = habits.filter(h => h.status === 'active')

  if (selected) {
    return (
      <StatsHabit
        habit={selected}
        phasesByHabit={phasesByHabit}
        recMap={recMap}
        movimientos={movimientos}
        rachas={rachas}
        onBack={() => setSelected(null)}
        today={today}
      />
    )
  }

  return (
    <StatsGlobal
      habits={activeHabits}
      phasesByHabit={phasesByHabit}
      recMap={recMap}
      rachas={rachas}
      onHabitClick={setSelected}
      today={today}
    />
  )
}
