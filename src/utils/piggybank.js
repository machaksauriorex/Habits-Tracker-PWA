// ─── Función pura de la hucha ───────────────────────────────────────────────
// Recibe el historial completo; devuelve { saldo, rachas, movimientos }.
// No muta ningún estado: llamar de nuevo con datos distintos recalcula todo.

// ── Helpers internos ────────────────────────────────────────────────────────

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z') // UTC: evita el desfase de zona horaria
  d.setUTCDate(d.getUTCDate() + n)
  return toDateStr(d)
}

function daysBetween(a, b) {
  return Math.round(
    (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000
  )
}

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay() // 0=Dom
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return toDateStr(d)
}

function daysInMonth(year, month) { // month: 1-12
  return new Date(year, month, 0).getDate()
}

/** Fase vigente en una fecha dada (la más reciente con startDate ≤ date). */
export function getActivePhase(phases, date) {
  if (!phases?.length) return null
  let active = null
  for (const p of phases) {
    if (p.startDate <= date) active = p
    else break // phases están ordenadas por startDate ASC
  }
  // Para fechas anteriores a la primera fase (edición retroactiva de días previos
  // a la creación), se aplica la fase más antigua hacia atrás.
  return active ?? phases[0]
}

/** Aportación geométrica para D días a partir del día-hueco k, con tasa r. */
function calcAportacion(base, r, k, D) {
  if (Math.abs(r) < 1e-10) return base * D
  return base * Math.pow(1 + r, k) * (Math.pow(1 + r, D) - 1) / r
}

/** ¿Cumple el valor el objetivo? */
function esCumplido(value, goalType, goalValue) {
  return goalType === 'min' ? value >= goalValue : value <= goalValue
}

// ── Generadores de periodos ──────────────────────────────────────────────────

/**
 * Devuelve los periodos del hábito hasta `hoy`.
 * - Diario: incluye HOY como periodo "abierto" (premia al instante si se cumple,
 *   pero no penaliza hasta que el día se cierra).
 * - Semanal/mensual: solo periodos CERRADOS (el actual solo muestra progreso).
 * `start` es la fecha de inicio del seguimiento (puede ser anterior a la
 * creación si hay registros retroactivos). Cada periodo: { startDate, endDate, days, abierto }
 */
function getPeriods(habito, hoy, start) {
  const end = habito.archivedAt ? habito.archivedAt.split('T')[0] : hoy
  const periods = []

  if (habito.periodo === 'daily') {
    // Un periodo por día desde `start` hasta hoy incluido (hoy = abierto)
    let d = start
    while (d <= hoy && d <= end) {
      periods.push({ startDate: d, endDate: d, days: 1, abierto: d === hoy })
      d = addDays(d, 1)
    }

  } else if (habito.periodo === 'weekly') {
    // Semanas L–D. La semana actual (contiene hoy) no se evalúa aún.
    let weekStart = getMonday(start)
    while (true) {
      const weekEnd = addDays(weekStart, 6)
      if (weekEnd >= hoy) break           // semana no cerrada aún
      if (weekStart > end) break

      const effStart = weekStart < start ? start : weekStart
      const effEnd   = weekEnd   > end   ? end   : weekEnd
      const days = daysBetween(effStart, effEnd) + 1

      periods.push({ startDate: effStart, endDate: weekEnd, days })
      weekStart = addDays(weekStart, 7)
    }

  } else if (habito.periodo === 'monthly') {
    const startD = new Date(start + 'T00:00:00Z')
    let year  = startD.getUTCFullYear()
    let month = startD.getUTCMonth() + 1 // 1-12

    while (true) {
      const dim    = daysInMonth(year, month)
      const mStart = `${year}-${String(month).padStart(2, '0')}-01`
      const mEnd   = `${year}-${String(month).padStart(2, '0')}-${String(dim).padStart(2, '0')}`

      if (mEnd >= hoy) break
      if (mStart > end) break

      const effStart = mStart < start ? start : mStart
      const effEnd   = mEnd   > end   ? end   : mEnd
      const days = daysBetween(effStart, effEnd) + 1

      periods.push({ startDate: effStart, endDate: mEnd, days })

      month++
      if (month > 12) { month = 1; year++ }
    }
  }

  return periods
}

// ── Valor agregado de un periodo ─────────────────────────────────────────────

function getAggregateValue(habito, period, recMap) {
  let total = 0
  let d = period.startDate
  while (d <= period.endDate) {
    const val = recMap[`${habito.id}__${d}`]
    if (val !== undefined) {
      total += habito.tipo === 'boolean' ? (val ? 1 : 0) : Number(val)
    }
    d = addDays(d, 1)
  }
  return total
}

// ── Progreso del periodo actual (para la UI) ──────────────────────────────────

/**
 * Para hábitos semanales/mensuales: devuelve { actual, goal } del periodo en curso.
 */
export function getCurrentPeriodProgress(habito, phases, recMap, hoy) {
  const sortedPhases = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const phase = getActivePhase(sortedPhases, hoy)
  if (!phase) return null

  let periodStart
  if (habito.periodo === 'weekly') {
    periodStart = getMonday(hoy)
  } else if (habito.periodo === 'monthly') {
    const d = new Date(hoy + 'T00:00:00Z')
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
    periodStart = `${y}-${String(m).padStart(2, '0')}-01`
  } else {
    return null // daily no necesita progreso de periodo
  }

  const value = getAggregateValue(habito, { startDate: periodStart, endDate: hoy }, recMap)
  return { actual: value, goal: phase.goalValue }
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {Array}  params.habitos   - todos los hábitos (activos + archivados; NO borrados)
 * @param {Array}  params.fases     - todas las fases
 * @param {Array}  params.registros - todos los registros { habitId, date, value }
 * @param {object} params.ajustes   - { base, incremento }
 * @param {string} [params.hoy]     - fecha ISO para tests (default: hoy real)
 * @returns {{ saldo: number, rachas: object, movimientos: Array }}
 */
export function calcularHucha({ habitos, fases, registros, ajustes, hoy: hoyParam }) {
  const hoy  = hoyParam ?? new Date().toISOString().split('T')[0]
  const base = ajustes?.base       ?? 0.20
  const r    = ajustes?.incremento ?? 0.05

  // Índices para acceso O(1)
  const phasesByHabit = {}
  for (const f of fases) {
    (phasesByHabit[f.habitId] ??= []).push(f)
  }
  for (const key of Object.keys(phasesByHabit)) {
    phasesByHabit[key].sort((a, b) => a.startDate.localeCompare(b.startDate))
  }

  const recMap = {}
  const firstRecByHabit = {} // fecha del registro más antiguo de cada hábito
  for (const rec of registros) {
    recMap[`${rec.habitId}__${rec.date}`] = rec.value
    if (!firstRecByHabit[rec.habitId] || rec.date < firstRecByHabit[rec.habitId]) {
      firstRecByHabit[rec.habitId] = rec.date
    }
  }

  // Recoge TODOS los eventos de todos los hábitos y los ordena cronológicamente
  const allEvents = []
  for (const habito of habitos) {
    const phases = phasesByHabit[habito.id]
    if (!phases?.length) continue
    // El seguimiento empieza en la primera fase, o antes si hay registros previos
    // (edición retroactiva de días anteriores a la creación del hábito).
    let start = phases[0].startDate
    const firstRec = firstRecByHabit[habito.id]
    if (firstRec && firstRec < start) start = firstRec
    for (const period of getPeriods(habito, hoy, start)) {
      allEvents.push({ habito, phases, period })
    }
  }
  allEvents.sort((a, b) => a.period.endDate.localeCompare(b.period.endDate))

  // Estado por hábito
  const habitState = {}
  for (const habito of habitos) {
    habitState[habito.id] = { k: 0, rachaActual: 0, rachaRecord: 0 }
  }

  let saldo = 0
  const movimientos = []

  for (const { habito, phases, period } of allEvents) {
    const st    = habitState[habito.id]
    const phase = getActivePhase(phases, period.startDate)
    if (!phase) continue

    const value    = getAggregateValue(habito, period, recMap)
    const cumplido = esCumplido(value, phase.goalType, phase.goalValue)
    const D        = period.days

    if (cumplido) {
      const aportacion = calcAportacion(base, r, st.k, D)
      saldo += aportacion
      movimientos.push({
        fecha:    period.endDate,
        habitId:  habito.id,
        periodo:  period.startDate,
        cantidad: +aportacion.toFixed(6),
        motivo:   'cumplido',
      })
      st.k += D
      st.rachaActual  += 1
      st.rachaRecord   = Math.max(st.rachaRecord, st.rachaActual)
    } else if (period.abierto) {
      // Periodo en curso (hoy) aún no cumplido: queda pendiente.
      // Ni premia ni rompe la racha hasta que el día se cierre.
      continue
    } else {
      // Periodo cerrado incumplido: se ROMPE la racha (k y racha → 0), pero
      // NO se resta nada del saldo (según la tabla de Excel del plan: un día "NO"
      // deja el total igual). Romper la racha solo hace que el próximo día
      // cumplido vuelva a sumar la base, no toca el histórico acumulado.
      movimientos.push({
        fecha:    period.endDate,
        habitId:  habito.id,
        periodo:  period.startDate,
        cantidad: 0,
        motivo:   'incumplido',
      })
      st.k           = 0
      st.rachaActual = 0
    }
  }

  const rachas = {}
  for (const [id, st] of Object.entries(habitState)) {
    rachas[id] = { actual: st.rachaActual, record: st.rachaRecord, k: st.k }
  }

  return { saldo: +saldo.toFixed(6), rachas, movimientos }
}
