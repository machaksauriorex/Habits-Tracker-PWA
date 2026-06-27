import { describe, it, expect } from 'vitest'
import { calcularHucha } from './piggybank.js'

// Datos fijos para todos los tests
const AJUSTES = { base: 1, incremento: 0.05 }

// Crea un hábito mínimo
function mkHabito(id, tipo = 'boolean', periodo = 'daily', extra = {}) {
  return { id, nombre: id, tipo, periodo, status: 'active', createdAt: '2024-01-01T00:00:00.000Z', ...extra }
}

// Crea una fase mínima
function mkFase(habitId, startDate, goalType = 'min', goalValue = 1) {
  return { id: `fase-${habitId}`, habitId, startDate, goalType, goalValue }
}

// Crea un registro booleano
function rec(habitId, date, value = true) {
  return { habitId, date, value }
}

// ────────────────────────────────────────────────────────────────────────────

describe('Racha que crece', () => {
  it('saldo aumenta cada día con factor geométrico 1.05^k', () => {
    // Días 01–05 cumplidos; hoy = 06/01
    const habitos  = [mkHabito('h1')]
    const fases    = [mkFase('h1', '2024-01-01')]
    const registros = [
      rec('h1', '2024-01-01'),
      rec('h1', '2024-01-02'),
      rec('h1', '2024-01-03'),
      rec('h1', '2024-01-04'),
      rec('h1', '2024-01-05'),
    ]

    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-06' })

    // Día 1: 1×1.05^0=1, Día2: 1×1.05^1=1.05, Día3: 1.1025, Día4: 1.157625, Día5: 1.21550625
    const esperado = 1 + 1.05 + 1.1025 + 1.157625 + 1.21550625
    expect(saldo).toBeCloseTo(esperado, 4)
    expect(rachas['h1'].actual).toBe(5)
    expect(rachas['h1'].k).toBe(5)
  })
})

describe('Racha que se rompe', () => {
  it('k se reinicia a 0 tras incumplir', () => {
    const habitos  = [mkHabito('h1')]
    const fases    = [mkFase('h1', '2024-01-01')]
    // Días 1–2 cumplidos, día 3 falla, días 4–5 cumplidos
    const registros = [
      rec('h1', '2024-01-01'),
      rec('h1', '2024-01-02'),
      // día 3 vacío → incumplido
      rec('h1', '2024-01-04'),
      rec('h1', '2024-01-05'),
    ]

    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-06' })

    // Tras cumplir d1+d2: saldo=2.05, k=2
    // d3 falla: penalización=1×1.05^2×(1.05^1-1)/0.05=1.1025; saldo=max(0,2.05-1.1025)=0.9475, k=0
    // d4 cumple (k=0): aportación=1; saldo=1.9475, k=1
    // d5 cumple (k=1): aportación=1.05; saldo=2.9975, k=2
    expect(saldo).toBeCloseTo(0.9475 + 1 + 1.05, 3)
    expect(rachas['h1'].actual).toBe(2)  // racha actual tras d4+d5
    expect(rachas['h1'].record).toBe(2)  // igual de larga que la primera
    expect(rachas['h1'].k).toBe(2)
  })
})

describe('Penalización simétrica', () => {
  it('penalización iguala exactamente lo que se habría ganado', () => {
    const habitos  = [mkHabito('h1')]
    const fases    = [mkFase('h1', '2024-01-01')]
    // 3 días cumplidos, luego fallo
    const registros = [
      rec('h1', '2024-01-01'),
      rec('h1', '2024-01-02'),
      rec('h1', '2024-01-03'),
      // día 4: incumplido
    ]

    const { saldo, movimientos } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-05' })

    const mov = movimientos
    const ganado    = mov.filter(m => m.motivo === 'cumplido').reduce((s, m) => s + m.cantidad, 0)
    const perdido   = mov.filter(m => m.motivo === 'incumplido').reduce((s, m) => s + m.cantidad, 0)
    const penalizacion = -perdido

    // La penalización del día 4 = 1×1.05^3×(1.05-1)/0.05 = 1.157625
    // El ganado = 1 + 1.05 + 1.1025 = 3.1525
    // El saldo = 3.1525 - 1.157625 = 1.994875
    expect(penalizacion).toBeCloseTo(1 * Math.pow(1.05, 3), 4)
    expect(saldo).toBeCloseTo(ganado - penalizacion, 4)
  })
})

describe('Suelo en 0', () => {
  it('el saldo nunca baja de 0 aunque la penalización supere el saldo', () => {
    const habitos  = [mkHabito('h1')]
    const fases    = [mkFase('h1', '2024-01-01')]
    // 1 día cumplido (saldo=1), luego 2 días de racha + fallo
    // La penalización tras 1 día de racha = 1.05, que supera el saldo de 1
    const registros = [
      rec('h1', '2024-01-01'),
      // días 2 y 3 incumplidos
    ]

    const { saldo } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-04' })

    // d1 cumple → saldo=1, k=1
    // d2 falla  → penalización=1.05^1=1.05 > saldo=1 → saldo=0
    // d3 falla  → penalización=0 (k=0) → saldo=0
    expect(saldo).toBe(0)
  })
})

describe('Equivalencia diario / semanal / mensual', () => {
  it('una semana diaria cumplida vale igual que una semana semanal cumplida', () => {
    const semana = ['2024-01-01','2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-06','2024-01-07']

    // Hábito diario: marcado todos los días de la semana
    const diario = mkHabito('d', 'boolean', 'daily')
    const fDiario = mkFase('d', '2024-01-01')
    const recsDiario = semana.map(date => rec('d', date))

    const { saldo: saldoDiario } = calcularHucha({
      habitos: [diario], fases: [fDiario], registros: recsDiario, ajustes: AJUSTES, hoy: '2024-01-08',
    })

    // Hábito semanal: marcado los 7 días (la suma de la semana ≥ goalValue=1)
    const semanal = mkHabito('s', 'boolean', 'weekly')
    const fSemanal = mkFase('s', '2024-01-01', 'min', 1)
    const recsSemanal = semana.map(date => rec('s', date))

    const { saldo: saldoSemanal } = calcularHucha({
      habitos: [semanal], fases: [fSemanal], registros: recsSemanal, ajustes: AJUSTES, hoy: '2024-01-08',
    })

    expect(saldoSemanal).toBeCloseTo(saldoDiario, 4)
  })
})

describe('Recálculo tras edición retroactiva', () => {
  it('rellenar un día olvidado aumenta el saldo y restaura la racha', () => {
    const habitos  = [mkHabito('h1')]
    const fases    = [mkFase('h1', '2024-01-01')]
    // Días 1 y 3 marcados; día 2 olvidado → racha rota
    const recsConHueco = [rec('h1', '2024-01-01'), rec('h1', '2024-01-03')]
    const { saldo: saldoConHueco } = calcularHucha({
      habitos, fases, registros: recsConHueco, ajustes: AJUSTES, hoy: '2024-01-04',
    })

    // Ahora "rellena" el día 2
    const recsCompleto = [...recsConHueco, rec('h1', '2024-01-02')]
    const { saldo: saldoCompleto, rachas } = calcularHucha({
      habitos, fases, registros: recsCompleto, ajustes: AJUSTES, hoy: '2024-01-04',
    })

    expect(saldoCompleto).toBeGreaterThan(saldoConHueco)
    expect(rachas['h1'].actual).toBe(3) // racha de 3 días consecutivos
  })
})
