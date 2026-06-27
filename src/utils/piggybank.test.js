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
    // d3 falla: NO resta nada; solo reinicia k=0 (saldo sigue 2.05)
    // d4 cumple (k=0): aportación=1; saldo=3.05, k=1
    // d5 cumple (k=1): aportación=1.05; saldo=4.10, k=2
    expect(saldo).toBeCloseTo(1 + 1.05 + 1 + 1.05, 4)
    expect(rachas['h1'].actual).toBe(2)  // racha actual tras d4+d5
    expect(rachas['h1'].record).toBe(2)  // igual de larga que la primera
    expect(rachas['h1'].k).toBe(2)
  })
})

describe('Romper la racha NO resta del saldo', () => {
  it('un día fallido deja el saldo igual (según la tabla de Excel del plan)', () => {
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

    const ganado = movimientos
      .filter(m => m.motivo === 'cumplido')
      .reduce((s, m) => s + m.cantidad, 0)

    // El día 4 (NO) no resta nada: el saldo == todo lo ganado los días 1-3
    expect(saldo).toBeCloseTo(1 + 1.05 + 1.1025, 4)
    expect(saldo).toBeCloseTo(ganado, 4)
    // Ningún movimiento es negativo
    expect(movimientos.every(m => m.cantidad >= 0)).toBe(true)
  })
})

describe('El saldo nunca baja', () => {
  it('días fallidos consecutivos no reducen el saldo acumulado', () => {
    const habitos  = [mkHabito('h1')]
    const fases    = [mkFase('h1', '2024-01-01')]
    // 1 día cumplido (saldo=1), luego 2 días fallidos
    const registros = [
      rec('h1', '2024-01-01'),
      // días 2 y 3 incumplidos
    ]

    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-04' })

    // d1 cumple → saldo=1, k=1
    // d2 falla  → saldo sigue 1, k=0
    // d3 falla  → saldo sigue 1
    expect(saldo).toBeCloseTo(1, 4)
    expect(rachas['h1'].actual).toBe(0) // racha rota
  })
})

describe('Días no consecutivos suman la base cada uno', () => {
  it('cumplir lun y mié (con hueco) suma base + base, sin racha', () => {
    // Reproduce el caso reportado por el usuario (base 0.20)
    const ajustes = { base: 0.20, incremento: 0.05 }
    const habitos = [mkHabito('h1', 'boolean', 'daily', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01')]
    const registros = [
      rec('h1', '2024-01-01'), // lun
      // mar: hueco
      rec('h1', '2024-01-03'), // mié
    ]

    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes, hoy: '2024-01-06' })

    expect(saldo).toBeCloseTo(0.20 + 0.20, 4) // 0.40 €
    expect(rachas['h1'].actual).toBe(0)       // jue/vie fallidos rompen la racha al final
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

describe('Saldo al instante (hábito diario de hoy)', () => {
  it('cumplir HOY un hábito diario suma ya a la hucha', () => {
    const habitos = [mkHabito('h1')]
    const fases   = [mkFase('h1', '2024-01-01')]
    // Solo hay un registro: el de hoy mismo
    const registros = [rec('h1', '2024-01-01')]

    const { saldo, rachas, movimientos } = calcularHucha({
      habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-01',
    })

    expect(saldo).toBeCloseTo(1, 4) // base × 1.05^0 = 1
    expect(rachas['h1'].actual).toBe(1)
    expect(movimientos).toHaveLength(1)
  })

  it('NO cumplir hoy no penaliza ni rompe la racha (queda pendiente)', () => {
    const habitos = [mkHabito('h1')]
    const fases   = [mkFase('h1', '2024-01-01')]
    // Ayer cumplido; hoy todavía sin marcar
    const registros = [rec('h1', '2024-01-01')]

    const { saldo, rachas, movimientos } = calcularHucha({
      habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-02',
    })

    // Solo cuenta ayer (1 €). Hoy queda pendiente: ni penaliza ni rompe racha.
    expect(saldo).toBeCloseTo(1, 4)
    expect(rachas['h1'].actual).toBe(1)
    expect(movimientos).toHaveLength(1)
  })
})

describe('Edición retroactiva antes de la creación', () => {
  it('marcar días anteriores a la creación del hábito cuenta en la hucha', () => {
    // Hábito creado el 05, pero el usuario rellena días anteriores
    const habitos = [mkHabito('h1', 'boolean', 'daily', { createdAt: '2024-01-05T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-05')]
    const registros = [
      rec('h1', '2024-01-02'),
      rec('h1', '2024-01-03'),
      rec('h1', '2024-01-04'),
    ]

    const { saldo, rachas } = calcularHucha({
      habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-05',
    })

    // 3 días consecutivos cumplidos usando la fase más antigua hacia atrás
    expect(saldo).toBeGreaterThan(0)
    expect(rachas['h1'].actual).toBe(3)
  })
})

describe('Máximo: un día vacío no cuenta como 0', () => {
  it('día sin marcar NO se considera cumplido (hay que marcar 0 explícito)', () => {
    const habitos = [mkHabito('h1', 'quantitative', 'daily', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'max', 3)] // máx 3 cigarros/día
    // Día 1 sin registro; hoy = 02 (día 1 ya cerrado)
    const { saldo, rachas } = calcularHucha({ habitos, fases, registros: [], ajustes: AJUSTES, hoy: '2024-01-02' })
    expect(saldo).toBe(0)
    expect(rachas['h1'].actual).toBe(0)
  })

  it('marcar 0 explícito SÍ cuenta como cumplido (max)', () => {
    const habitos = [mkHabito('h1', 'quantitative', 'daily', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'max', 3)]
    const registros = [{ habitId: 'h1', date: '2024-01-01', value: 0 }]
    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-02' })
    expect(saldo).toBeCloseTo(1, 4) // base
    expect(rachas['h1'].actual).toBe(1)
  })
})

describe('Semanal "al menos": premia al instante', () => {
  it('al alcanzar el objetivo a mitad de semana ya suma (no espera al domingo)', () => {
    // Semana L01..D07 de 2024 (01/01 es lunes); hoy = miércoles 03
    const habitos = [mkHabito('h1', 'quantitative', 'weekly', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'min', 3)] // al menos 3/semana
    const registros = [
      { habitId: 'h1', date: '2024-01-01', value: 1 },
      { habitId: 'h1', date: '2024-01-02', value: 1 },
      { habitId: 'h1', date: '2024-01-03', value: 1 }, // total 3 ≥ 3
    ]
    const { saldo } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-03' })
    // Semana cumplida vale D=7 (equivalencia con diario), k=0
    expect(saldo).toBeCloseTo((Math.pow(1.05, 7) - 1) / 0.05, 4)
  })

  it('si aún no llega al objetivo, la semana en curso no suma ni rompe la racha', () => {
    const habitos = [mkHabito('h1', 'quantitative', 'weekly', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'min', 3)]
    const registros = [{ habitId: 'h1', date: '2024-01-01', value: 1 }] // 1/3
    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-03' })
    expect(saldo).toBe(0)
    expect(rachas['h1'].actual).toBe(0)
  })
})

describe('Máximo: exige marcar TODOS los días del periodo', () => {
  it('semanal con días sin marcar NO es válido (faltan registros)', () => {
    // Semana 01-07 (cerrada, hoy=08); solo L,M,X marcados, J-D en blanco
    const habitos = [mkHabito('h1', 'quantitative', 'weekly', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'max', 5)]
    const registros = [
      { habitId: 'h1', date: '2024-01-01', value: 2 },
      { habitId: 'h1', date: '2024-01-02', value: 1 },
      { habitId: 'h1', date: '2024-01-03', value: 1 },
    ]
    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-08' })
    expect(saldo).toBe(0)
    expect(rachas['h1'].actual).toBe(0)
  })

  it('marcando todos los días (incluido 0) SÍ es válido', () => {
    const habitos = [mkHabito('h1', 'quantitative', 'weekly', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'max', 5)]
    const valores = [2, 1, 1, 0, 0, 0, 0] // total 4 ≤ 5, los 7 días marcados
    const registros = valores.map((value, i) => ({
      habitId: 'h1', date: `2024-01-0${i + 1}`, value,
    }))
    const { saldo, rachas } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-08' })
    expect(saldo).toBeGreaterThan(0)
    expect(rachas['h1'].actual).toBe(1)
  })
})

describe('Semanal "máximo": espera al cierre', () => {
  it('aunque vaya por debajo del límite, no suma hasta que cierra la semana', () => {
    const habitos = [mkHabito('h1', 'quantitative', 'weekly', { createdAt: '2024-01-01T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-01-01', 'max', 10)]
    const registros = [
      { habitId: 'h1', date: '2024-01-01', value: 2 },
      { habitId: 'h1', date: '2024-01-02', value: 1 }, // 3 ≤ 10 pero podría subir
    ]
    const { saldo } = calcularHucha({ habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-01-03' })
    expect(saldo).toBe(0) // semana abierta + máximo → pendiente
  })
})

describe('Robustez de zona horaria (regresión)', () => {
  // Bug histórico: la aritmética de fechas mezclaba medianoche local con UTC,
  // y en España (UTC+1/+2) avanzar un día devolvía el MISMO día → bucle infinito
  // que congelaba la app. Este test recorre muchos días cruzando el cambio de
  // hora de primavera (31/03/2024 en España). Con `npm run test:tz` corre en
  // Europe/Madrid: si el bug volviera, este test colgaría (timeout) o fallaría.
  it('cuenta todos los días cumplidos cruzando el cambio de hora (sin colgarse)', () => {
    const habitos = [mkHabito('h1', 'boolean', 'daily', { createdAt: '2024-03-28T00:00:00.000Z' })]
    const fases   = [mkFase('h1', '2024-03-28')]
    // Cumplido del 28/03 al 02/04 (6 días). Hoy = 03/04 → 6 periodos cerrados.
    const dias = ['2024-03-28', '2024-03-29', '2024-03-30', '2024-03-31', '2024-04-01', '2024-04-02']
    const registros = dias.map(d => rec('h1', d))

    const { saldo, rachas, movimientos } = calcularHucha({
      habitos, fases, registros, ajustes: AJUSTES, hoy: '2024-04-03',
    })

    expect(movimientos).toHaveLength(6)        // ni de menos (bucle corto) ni de más
    expect(movimientos.every(m => m.motivo === 'cumplido')).toBe(true)
    expect(rachas['h1'].actual).toBe(6)
    expect(saldo).toBeGreaterThan(0)
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
