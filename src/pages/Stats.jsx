import { useState, useEffect, useMemo } from 'react'
import { getHabits, getAllPhases, getAllRecords, getSettings } from '../db/index.js'
import { calcularHucha, getActivePhase } from '../utils/piggybank.js'

// ── Helpers de fecha ───────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function pad2(n) { return String(n).padStart(2, '0') }
function addDays(s, n) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}
function getMonday(s) {
  const d = new Date(s + 'T12:00:00'), dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().split('T')[0]
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate() } // m: 1-12

function formatNum(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtN(n, dec = 1) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec })
}
function fmtDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n>>16)&255}, ${(n>>8)&255}, ${n&255}, ${a})`
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DAYS   = ['L','M','X','J','V','S','D']
const PERIOD_WORD = { daily: 'día', weekly: 'sem', monthly: 'mes' }

function periodRange(sel, today) {
  const d = new Date(today + 'T12:00:00'), y = d.getFullYear(), m = d.getMonth()
  if (sel === 'week') {
    const mon = getMonday(today)
    return { start: mon, end: addDays(mon, 6), label: 'Esta semana' }
  }
  if (sel === 'month') {
    const start = `${y}-${pad2(m+1)}-01`
    const end   = `${y}-${pad2(m+1)}-${pad2(daysInMonth(y, m+1))}`
    return { start, end, label: `${MONTHS[m]} ${y}` }
  }
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) }
}

// Grid[col][row]: row 0=Lun … 6=Dom (para heatmaps)
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

// ── Lógica de cumplimiento (consistente con la hucha) ──────────────────────────

/** ¿Se cumple el objetivo en UN día? (válido para diarios y para booleanos). */
function dayMet(habit, date, phasesByHabit, recMap) {
  const v = recMap[`${habit.id}__${date}`]
  if (v === undefined) return false
  const phase = getActivePhase(phasesByHabit[habit.id] ?? [], date)
  if (!phase) return !!v
  if (habit.tipo === 'boolean') return v === true
  const n = Number(v)
  return phase.goalType === 'min' ? n >= phase.goalValue : n <= phase.goalValue
}

/** Genera los límites {start,end} de cada periodo que toca [from,to] (no diarios). */
function eachPeriod(habit, from, to) {
  const out = []
  if (habit.periodo === 'weekly') {
    let s = getMonday(from)
    while (s <= to) { out.push({ start: s, end: addDays(s, 6) }); s = addDays(s, 7) }
  } else if (habit.periodo === 'monthly') {
    const d = new Date(from + 'T12:00:00')
    let y = d.getFullYear(), m = d.getMonth() + 1
    while (true) {
      const s = `${y}-${pad2(m)}-01`
      if (s > to) break
      out.push({ start: s, end: `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}` })
      m++; if (m > 12) { m = 1; y++ }
    }
  }
  return out
}

/** Evalúa un periodo completo (misma regla que la hucha: el "máximo" exige todos
 *  los días marcados y no premia hasta el cierre). */
function periodMet(habit, pStart, pEnd, today, phasesByHabit, recMap) {
  const phase = getActivePhase(phasesByHabit[habit.id] ?? [], pStart)
  if (!phase) return null
  const trackStart = phasesByHabit[habit.id]?.[0]?.startDate ?? pStart
  let total = 0, faltan = 0, marked = 0
  let d = pStart
  while (d <= pEnd) {
    const v = recMap[`${habit.id}__${d}`]
    if (v !== undefined) { marked++; total += habit.tipo === 'boolean' ? (v ? 1 : 0) : Number(v) }
    else if (d >= trackStart && d <= today) faltan++
    d = addDays(d, 1)
  }
  const met = phase.goalType === 'max'
    ? (faltan === 0 && total <= phase.goalValue)
    : total >= phase.goalValue
  return { met, total, marked, abierto: pEnd >= today, goal: phase.goalValue, goalType: phase.goalType }
}

/** % de cumplimiento en [start,end]: por día (diarios) o por periodo cerrado. */
function compliance(habit, start, end, today, phasesByHabit, recMap) {
  const trackStart = phasesByHabit[habit.id]?.[0]?.startDate ?? start
  const from  = start < trackStart ? trackStart : start
  const clamp = end > today ? today : end
  if (from > clamp) return 0

  if (habit.periodo === 'daily') {
    let total = 0, done = 0, d = from
    while (d <= clamp) { total++; if (dayMet(habit, d, phasesByHabit, recMap)) done++; d = addDays(d, 1) }
    return total ? Math.round(done / total * 100) : 0
  }
  let total = 0, done = 0
  for (const p of eachPeriod(habit, from, clamp)) {
    const pm = periodMet(habit, p.start, p.end, today, phasesByHabit, recMap)
    if (!pm || pm.abierto) continue
    total++; if (pm.met) done++
  }
  return total ? Math.round(done / total * 100) : 0
}

// ── Color del heatmap (intensidad para numéricos) ──────────────────────────────

/** Objetivo "diario equivalente" (prorratea semanal/mensual). */
function dailyRef(habit, phase, date) {
  if (!phase) return 0
  if (habit.periodo === 'weekly')  return phase.goalValue / 7
  if (habit.periodo === 'monthly') {
    const d = new Date(date + 'T12:00:00')
    return phase.goalValue / daysInMonth(d.getFullYear(), d.getMonth() + 1)
  }
  return phase.goalValue
}

function cellColor(habit, date, today, phasesByHabit, recMap) {
  if (date > today) return 'var(--bg)'
  const v = recMap[`${habit.id}__${date}`]
  if (v === undefined) return 'var(--bg)'
  const phase = getActivePhase(phasesByHabit[habit.id] ?? [], date)

  if (habit.tipo === 'boolean') return v === true ? habit.color : hexA(habit.color, 0.18)

  const n   = Number(v)
  const ref = dailyRef(habit, phase, date)
  if (phase?.goalType === 'max') {
    // menos es mejor: dentro del límite → color del hábito; pasarse → rojo
    if (ref <= 0 || n <= ref) return hexA(habit.color, 0.45 + 0.55 * (ref > 0 ? 1 - Math.min(n / ref, 1) : 1))
    return hexA('#EF4444', 0.5 + 0.4 * Math.min((n - ref) / ref, 1))
  }
  // mínimo: más es mejor
  if (ref <= 0) return habit.color
  return hexA(habit.color, 0.22 + 0.78 * Math.min(n / ref, 1))
}

// ── Resumen numérico ───────────────────────────────────────────────────────────

function numericSummary(habit, today, phasesByHabit, recMap) {
  const trackStart = phasesByHabit[habit.id]?.[0]?.startDate

  if (habit.periodo === 'daily') {
    const win = 30
    const from = (() => {
      const w = addDays(today, -(win - 1))
      return trackStart && trackStart > w ? trackStart : w
    })()
    const elapsed = daysBetween(from, today) + 1
    let sum = 0, marked = 0, best = null, metDays = 0
    let d = from
    while (d <= today) {
      const v = recMap[`${habit.id}__${d}`]
      if (v !== undefined) {
        const n = Number(v); marked++; sum += n
        best = best == null ? n : (habit.tipo === 'quantitative'
          ? (getActivePhase(phasesByHabit[habit.id] ?? [], d)?.goalType === 'max'
              ? Math.min(best, n) : Math.max(best, n))
          : best)
        if (dayMet(habit, d, phasesByHabit, recMap)) metDays++
      }
      d = addDays(d, 1)
    }
    // Tendencia: media últimos 15 días vs. 15 anteriores
    const avgRange = (a, b) => {
      let s = 0, c = 0, dd = a
      while (dd <= b) { const v = recMap[`${habit.id}__${dd}`]; if (v !== undefined) { s += Number(v); c++ } dd = addDays(dd, 1) }
      return c ? s / c : null
    }
    const recent = avgRange(addDays(today, -14), today)
    const prev   = avgRange(addDays(today, -29), addDays(today, -15))
    return {
      mode: 'daily', media: sum / elapsed, total: sum, best, metDays, elapsed,
      goalType: getActivePhase(phasesByHabit[habit.id] ?? [], today)?.goalType ?? 'min',
      recent, prev,
    }
  }

  // No diarios: agregamos por periodo, excluyendo los anteriores al seguimiento
  const span = habit.periodo === 'weekly' ? 7 * 8 : 32 * 7
  const periods = eachPeriod(habit, addDays(today, -span), today)
    .filter(p => !trackStart || p.end >= trackStart)
    .slice(-6)
  let sum = 0, metCount = 0, closed = 0
  const closedTotals = []
  for (const p of periods) {
    const pm = periodMet(habit, p.start, p.end, today, phasesByHabit, recMap)
    if (!pm) continue
    sum += pm.total
    if (!pm.abierto) { closed++; closedTotals.push(pm.total); if (pm.met) metCount++ }
  }
  // Media y tendencia sobre periodos CERRADOS (el abierto está a medias y falsearía)
  const media  = closedTotals.length ? closedTotals.reduce((a, b) => a + b, 0) / closedTotals.length : 0
  const recent = closedTotals.length ? closedTotals[closedTotals.length - 1] : null
  const prev   = closedTotals.length > 1 ? closedTotals[closedTotals.length - 2] : null
  return {
    mode: 'period', media, total: sum, count: periods.length,
    metCount, closed, goalType: getActivePhase(phasesByHabit[habit.id] ?? [], today)?.goalType ?? 'min',
    recent, prev,
  }
}

// ── Heatmap ────────────────────────────────────────────────────────────────────

function Heatmap({ grid, getColor, today, small }) {
  const sz = small ? 9 : 12
  return (
    <div className="hm-wrap">
      <div className="hm-labels">
        {DAYS.map(l => <div key={l} className="hm-label" style={{ height: sz, lineHeight: `${sz}px` }}>{l}</div>)}
      </div>
      <div className="hm-cols" style={{ '--sz': `${sz}px` }}>
        {grid.map((week, ci) => (
          <div key={ci} className="hm-col">
            {week.map(({ date, inP }, ri) => (
              <div key={ri} className={`hm-cell${date === today ? ' hm-today' : ''}`}
                style={{ background: inP ? getColor(date) : 'transparent' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Gráfica de barras (genérica) ───────────────────────────────────────────────

function Bars({ data, goal, color, avg, showVals }) {
  const maxV = Math.max(...data.map(d => d.val ?? 0), goal ?? 0, 1)
  return (
    <div className="bars">
      {(goal != null || avg != null) && (
        <div className="bars-plot-overlay">
          {goal != null && (
            <div className="bar-line bar-line-goal" style={{ bottom: `${Math.min(goal / maxV, 1) * 100}%` }}>
              <span className="bar-line-tag">obj. {fmtN(goal, 0)}</span>
            </div>
          )}
          {avg != null && avg > 0 && (
            <div className="bar-line bar-line-avg" style={{ bottom: `${Math.min(avg / maxV, 1) * 100}%` }} />
          )}
        </div>
      )}
      <div className="bars-row">
        {data.map((d, i) => {
          const pct = d.val != null ? Math.min((d.val / maxV) * 100, 100) : 0
          return (
            <div key={i} className="bar-col">
              {showVals && d.val != null && <span className="bar-val tnum">{fmtN(d.val, 0)}</span>}
              <div className="bar-track">
                <div className="bar-fill" style={{
                  height: `${pct}%`,
                  background: d.val == null ? 'transparent' : (d.met ? color : hexA(color, 0.3)),
                }} />
              </div>
              <span className="bar-label">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function dailyBars(habit, today, phasesByHabit, recMap, n = 14) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const v = recMap[`${habit.id}__${date}`]
    const dow = new Date(date + 'T12:00:00').getDay()
    out.push({
      label: i % 2 === 0 ? DAYS[dow === 0 ? 6 : dow - 1] : '',
      val: v !== undefined ? Number(v) : null,
      met: dayMet(habit, date, phasesByHabit, recMap),
    })
  }
  return out
}

function periodBars(habit, today, phasesByHabit, recMap, n = 6) {
  const span = habit.periodo === 'weekly' ? 7 * (n + 1) : 32 * n
  const trackStart = phasesByHabit[habit.id]?.[0]?.startDate
  const periods = eachPeriod(habit, addDays(today, -span), today)
    .filter(p => !trackStart || p.end >= trackStart)
    .slice(-n)
  return periods.map(p => {
    const pm = periodMet(habit, p.start, p.end, today, phasesByHabit, recMap)
    const label = habit.periodo === 'weekly'
      ? new Date(p.start + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
      : MONTHS[new Date(p.start + 'T12:00:00').getMonth()]
    return { label, val: pm?.total ?? 0, met: !!pm?.met }
  })
}

// ── Pantalla individual ────────────────────────────────────────────────────────

function StatsHabit({ habit, phasesByHabit, recMap, movimientos, rachas, onBack, today }) {
  const sortedPhases = useMemo(() =>
    [...(phasesByHabit[habit.id] ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
  , [phasesByHabit, habit.id])

  const racha      = rachas[habit.id] ?? { actual: 0, record: 0 }
  const aportacion = useMemo(() =>
    movimientos.filter(m => m.habitId === habit.id && m.motivo === 'cumplido')
               .reduce((s, m) => s + m.cantidad, 0)
  , [movimientos, habit.id])

  const isNum  = habit.tipo === 'quantitative'
  const phase  = getActivePhase(sortedPhases, today)

  const end12   = addDays(getMonday(today), 6)
  const start12 = addDays(end12, -83) // 12 semanas
  const grid12  = useMemo(() => buildGrid(start12, end12), [start12, end12])
  const comp12  = useMemo(() => compliance(habit, start12, end12, today, phasesByHabit, recMap),
    [habit, start12, end12, today, phasesByHabit, recMap])

  const summary = useMemo(() => isNum ? numericSummary(habit, today, phasesByHabit, recMap) : null,
    [isNum, habit, today, phasesByHabit, recMap])

  const barsData = useMemo(() => {
    if (!isNum) return null
    return habit.periodo === 'daily'
      ? dailyBars(habit, today, phasesByHabit, recMap)
      : periodBars(habit, today, phasesByHabit, recMap)
  }, [isNum, habit, today, phasesByHabit, recMap])

  const earningsByPhase = useMemo(() => {
    const map = {}
    for (const mv of movimientos) {
      if (mv.habitId !== habit.id || mv.motivo !== 'cumplido') continue
      const ph = getActivePhase(sortedPhases, mv.periodo)
      if (ph) map[ph.startDate] = (map[ph.startDate] ?? 0) + mv.cantidad
    }
    return map
  }, [movimientos, habit.id, sortedPhases])

  // Tendencia (mejora si min↑ / max↓)
  const trend = useMemo(() => {
    if (!summary || summary.recent == null || summary.prev == null || summary.prev === 0) return null
    const delta = summary.recent - summary.prev
    if (Math.abs(delta) < 1e-9) return null
    const pct  = Math.round(delta / summary.prev * 100)
    const good = summary.goalType === 'max' ? delta < 0 : delta > 0
    return { pct, good, up: delta > 0 }
  }, [summary])

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
        {/* KPIs universales */}
        <div className="kpi-row">
          <div className="kpi-tile">
            <span className="kpi-label">Aportación total</span>
            <span className="kpi-value tnum">{formatNum(aportacion)}&thinsp;<span className="kpi-unit">€</span></span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Racha actual</span>
            <span className="kpi-value tnum">{racha.actual}&thinsp;<span className="kpi-unit">días</span></span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Mejor racha</span>
            <span className="kpi-value tnum">{racha.record}&thinsp;<span className="kpi-unit">días</span></span>
          </div>
        </div>

        {/* Resumen numérico */}
        {isNum && summary && (
          <section>
            <div className="stats-section-header">
              <span className="stats-section-title">
                Resumen · {summary.mode === 'daily' ? 'últimos 30 días' : `últimos ${barsData?.length ?? 6} periodos`}
              </span>
              {trend && (
                <span className={`trend-pill${trend.good ? ' good' : ' bad'}`}>
                  {trend.up ? '↑' : '↓'} {Math.abs(trend.pct)}%
                </span>
              )}
            </div>
            <div className="kpi-row">
              <div className="kpi-tile">
                <span className="kpi-label">Media</span>
                <span className="kpi-value tnum">
                  {fmtN(summary.media)}&thinsp;<span className="kpi-unit">/{PERIOD_WORD[habit.periodo]}</span>
                </span>
              </div>
              <div className="kpi-tile">
                <span className="kpi-label">Total</span>
                <span className="kpi-value tnum">{fmtN(summary.total, 0)}</span>
              </div>
              {summary.mode === 'daily' ? (
                summary.goalType === 'max' ? (
                  <div className="kpi-tile">
                    <span className="kpi-label">Días en objetivo</span>
                    <span className="kpi-value tnum">
                      {summary.metDays}<span className="kpi-unit">/{summary.elapsed}</span>
                    </span>
                  </div>
                ) : (
                  <div className="kpi-tile">
                    <span className="kpi-label">Mejor día</span>
                    <span className="kpi-value tnum">{summary.best != null ? fmtN(summary.best, 0) : '—'}</span>
                  </div>
                )
              ) : (
                <div className="kpi-tile">
                  <span className="kpi-label">Periodos cumplidos</span>
                  <span className="kpi-value tnum">{summary.metCount}<span className="kpi-unit">/{summary.closed}</span></span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Heatmap 12 semanas */}
        <section>
          <div className="stats-section-header">
            <span className="stats-section-title">Actividad · Últimas 12 semanas</span>
            <span className="stats-pct">{comp12}% cumplimiento</span>
          </div>
          <Heatmap
            grid={grid12}
            getColor={date => cellColor(habit, date, today, phasesByHabit, recMap)}
            today={today}
            small
          />
        </section>

        {/* Gráfica de barras (numéricos) */}
        {isNum && barsData && barsData.length > 0 && (
          <section>
            <div className="stats-section-header">
              <span className="stats-section-title">
                {habit.periodo === 'daily' ? 'Últimos 14 días' : 'Por periodo'}
              </span>
            </div>
            <Bars
              data={barsData}
              goal={phase?.goalValue}
              avg={habit.periodo === 'daily' && summary ? summary.media : null}
              color={habit.color}
              showVals={habit.periodo !== 'daily'}
            />
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

// ── Pantalla global ────────────────────────────────────────────────────────────

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
    const done = eligible.filter(h => dayMet(h, date, phasesByHabit, recMap)).length
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
        <section>
          <div className="stats-section-header">
            <span className="stats-section-title">Actividad diaria · {label}</span>
          </div>
          <Heatmap grid={grid} getColor={getGlobalColor} today={today} small={isYear} />
        </section>

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
                    <span className="compliance-name">{habit.emoji ? `${habit.emoji} ` : ''}{habit.nombre}</span>
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
          <div className="empty-state"><p>Aún no hay hábitos para mostrar.</p></div>
        )}
      </div>
    </div>
  )
}

// ── Entrada ────────────────────────────────────────────────────────────────────

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
