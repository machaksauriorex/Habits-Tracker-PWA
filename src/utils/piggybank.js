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

function pad2(n) {
  return String(n).padStart(2, '0')
}

// ── Generadores de periodos ──────────────────────────────────────────────────

/**
 * Devuelve los periodos del hábito hasta `hoy`, incluido el periodo EN CURSO
 * (marcado con `abierto: true`). Un periodo abierto premia al instante si el
 * objetivo es "al menos" y ya se cumple, pero nunca penaliza hasta que se cierra.
 * `start` es la fecha de inicio del seguimiento (puede ser anterior a la creación
 * si hay registros retroactivos). Cada periodo: { startDate, endDate, days, abierto }.
 * `days` (D) es el nº de días ACTIVOS del periodo completo (no se recorta a hoy):
 * una semana/mes cumplido vale el periodo entero aunque se complete antes de tiempo.
 */
function getPeriods(habito, hoy, start) {
  const archivedEnd = habito.archivedAt ? habito.archivedAt.split('T')[0] : null
  const end = archivedEnd ?? hoy // tope del diario (hoy si está activo)
  const periods = []

  if (habito.periodo === 'daily') {
    // Un periodo por día desde `start` hasta hoy incluido (hoy = abierto)
    let d = start
    while (d <= hoy && d <= end) {
      periods.push({ startDate: d, endDate: d, days: 1, abierto: d === hoy })
      d = addDays(d, 1)
    }

  } else if (habito.periodo === 'weekly') {
    // Semanas L–D, incluida la que contiene hoy (abierta).
    let weekStart = getMonday(start)
    while (weekStart <= hoy) {
      if (archivedEnd && weekStart > archivedEnd) break

      const weekEnd  = addDays(weekStart, 6)
      const effStart = weekStart < start ? start : weekStart
      const effEnd   = archivedEnd && archivedEnd < weekEnd ? archivedEnd : weekEnd
      const days     = daysBetween(effStart, effEnd) + 1
      const abierto  = weekEnd >= hoy

      periods.push({ startDate: effStart, endDate: weekEnd, days, abierto })
      weekStart = addDays(weekStart, 7)
    }

  } else if (habito.periodo === 'monthly') {
    const startD = new Date(start + 'T00:00:00Z')
    let year  = startD.getUTCFullYear()
    let month = startD.getUTCMonth() + 1 // 1-12

    while (true) {
      const dim    = daysInMonth(year, month)
      const mStart = `${year}-${pad2(month)}-01`
      const mEnd   = `${year}-${pad2(month)}-${pad2(dim)}`

      if (mStart > hoy) break                        // mes futuro
      if (archivedEnd && mStart > archivedEnd) break // archivado antes de este mes

      const effStart = mStart < start ? start : mStart
      const effEnd   = archivedEnd && archivedEnd < mEnd ? archivedEnd : mEnd
      const days     = daysBetween(effStart, effEnd) + 1
      const abierto  = mEnd >= hoy

      periods.push({ startDate: effStart, endDate: mEnd, days, abierto })

      month++
      if (month > 12) { month = 1; year++ }
    }
  }

  return periods
}

// ── Evaluación de un periodo ──────────────────────────────────────────────────

/**
 * Agrega los registros del periodo y decide si está cumplido.
 * Objetivo "max" (límite, p.ej. máx 3 cigarros): TODOS los días activos ya pasados
 * deben estar registrados explícitamente (aunque sea 0); si falta alguno, el
 * periodo NO es válido (un día en blanco es ambiguo). Objetivo "min": basta con
 * alcanzar el total (los días sin marcar cuentan como 0).
 * `days` (opcional) acota el rango activo a [startDate, startDate+days-1].
 */
function evalPeriodo(habito, period, recMap, phase, hoy) {
  const lastActive = period.days != null
    ? addDays(period.startDate, period.days - 1)
    : period.endDate
  let total = 0
  let faltan = 0 // días activos ya pasados SIN registrar (relevante para "max")
  let d = period.startDate
  while (d <= lastActive) {
    const val = recMap[`${habito.id}__${d}`]
    if (val !== undefined) {
      total += habito.tipo === 'boolean' ? (val ? 1 : 0) : Number(val)
    } else if (!hoy || d <= hoy) {
      faltan++
    }
    d = addDays(d, 1)
  }
  const cumplido = phase.goalType === 'max'
    ? (faltan === 0 && total <= phase.goalValue)
    : total >= phase.goalValue
  return { cumplido, total, faltan }
}

// ── Info del periodo para la UI ───────────────────────────────────────────────

/**
 * Info del periodo (semana/mes) que CONTIENE `refDate`, para hábitos no diarios:
 * { total, goal, cumplido, goalType, periodStart, periodEnd }.
 * Permite a la pantalla "Hoy" mostrar el progreso de la semana VISIBLE (no siempre
 * la actual) y pintar todos los días del periodo cuando ya está cumplido.
 */
export function getPeriodInfo(habito, phases, recMap, refDate, hoy) {
  if (habito.periodo === 'daily') return null
  const today = hoy ?? new Date().toISOString().split('T')[0]
  const sortedPhases = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const phase = getActivePhase(sortedPhases, refDate)
  if (!phase) return null

  let periodStart, periodEnd
  if (habito.periodo === 'weekly') {
    periodStart = getMonday(refDate)
    periodEnd   = addDays(periodStart, 6)
  } else { // monthly
    const d = new Date(refDate + 'T00:00:00Z')
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
    periodStart = `${y}-${pad2(m)}-01`
    periodEnd   = `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`
  }

  // Acota el inicio activo al comienzo del seguimiento (primera fase): no se
  // exigen días anteriores a que existiera el hábito.
  const trackingStart = sortedPhases[0].startDate
  const activeStart = periodStart < trackingStart ? trackingStart : periodStart

  const { cumplido, total, faltan } = evalPeriodo(
    habito, { startDate: activeStart, endDate: periodEnd }, recMap, phase, today)
  const abierto = periodEnd >= today
  // El "cumplido visual" sigue la misma regla que la hucha: el "máximo" no se da
  // por cumplido hasta cerrar el periodo (aún podría superarse).
  const cumplidoVisual = cumplido && (phase.goalType === 'min' || !abierto)
  return { total, goal: phase.goalValue, cumplido: cumplidoVisual, goalType: phase.goalType, abierto, faltan, periodStart, periodEnd }
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

    const { cumplido } = evalPeriodo(habito, period, recMap, phase, hoy)
    const D            = period.days

    // Un periodo en curso (abierto) solo premia al instante si el objetivo es
    // "al menos" (min) y ya se ha alcanzado; los de "máximo" esperan al cierre
    // (aún podrían superarse). Diario, semanal y mensual comparten esta regla.
    const premiaAhora = cumplido && (!period.abierto || phase.goalType === 'min')

    if (premiaAhora) {
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
