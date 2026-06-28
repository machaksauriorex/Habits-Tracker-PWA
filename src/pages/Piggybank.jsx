import { useState, useEffect, useMemo } from 'react'
import { getHabits, getAllPhases, getAllRecords, getSettings } from '../db/index.js'
import { calcularHucha } from '../utils/piggybank.js'
import { useCountUp } from '../hooks/useCountUp.js'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function formatNum(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function relDate(date, hoy) {
  if (date === hoy) return 'hoy'
  const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - 1)
  if (date === d.toISOString().split('T')[0]) return 'ayer'
  return new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export default function Piggybank() {
  const [habits, setHabits]     = useState([])
  const [phases, setPhases]     = useState([])
  const [recMap, setRecMap]     = useState({})
  const [settings, setSettings] = useState(null)
  const [loading, setLoading]   = useState(true)
  const hoy = todayStr()

  useEffect(() => {
    async function load() {
      const [h, ph, recs, cfg] = await Promise.all([
        getHabits(), getAllPhases(), getAllRecords(), getSettings(),
      ])
      const map = {}
      for (const r of recs) map[`${r.habitId}__${r.date}`] = r.value
      setHabits(h); setPhases(ph); setRecMap(map); setSettings(cfg); setLoading(false)
    }
    load()
  }, [])

  const registros = useMemo(() =>
    Object.entries(recMap).map(([key, value]) => {
      const [habitId, date] = key.split('__'); return { habitId, date, value }
    }), [recMap])

  const hucha = useMemo(() => {
    if (!settings) return { saldo: 0, rachas: {}, movimientos: [] }
    return calcularHucha({ habitos: habits, fases: phases, registros, ajustes: settings, hoy })
  }, [habits, phases, registros, settings, hoy])

  const habitMap = useMemo(() => Object.fromEntries(habits.map(h => [h.id, h])), [habits])

  const movimientos = useMemo(() =>
    hucha.movimientos
      .filter(m => m.motivo === 'cumplido' && m.cantidad > 0)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.periodo.localeCompare(a.periodo))
      .slice(0, 30)
  , [hucha.movimientos])

  const porHabito = useMemo(() => {
    const acc = {}
    for (const m of hucha.movimientos) {
      if (m.motivo !== 'cumplido') continue
      acc[m.habitId] = (acc[m.habitId] ?? 0) + m.cantidad
    }
    return Object.entries(acc)
      .map(([id, total]) => ({ habit: habitMap[id], total }))
      .filter(x => x.habit)
      .sort((a, b) => b.total - a.total)
  }, [hucha.movimientos, habitMap])

  const deltaHoy = useMemo(() =>
    hucha.movimientos
      .filter(m => m.fecha === hoy && m.motivo === 'cumplido')
      .reduce((s, m) => s + m.cantidad, 0)
  , [hucha.movimientos, hoy])

  // Burbujas (metaballs) por hábito: solo el importe. Más aportación → más
  // grande y más atraída hacia el centro (se funde con la hucha).
  const bubbles = useMemo(() => {
    const top = porHabito.slice(0, 5)
    if (!top.length) return []
    const maxC = top[0].total || 1
    const slots = [315, 135, 45, 225, 90] // grados alrededor del blob (0=este, horario)
    return top.map((item, i) => {
      const shareN = item.total / maxC          // 0..1 respecto al mayor
      const a = (slots[i % slots.length] * Math.PI) / 180
      const dd = 140 - shareN * 34              // más aportación → más cerca del centro
      const R = 16 + shareN * 16                // y más grande
      return {
        id: item.habit.id, color: item.habit.color, total: item.total,
        cx: 150 + dd * Math.cos(a), cy: 150 + dd * Math.sin(a), R,
        anim: ['floatA', 'floatB', 'floatC'][i % 3], dur: 6 + i * 0.7,
      }
    })
  }, [porHabito])

  const saldo = hucha.saldo
  const saldoAnim = useCountUp(saldo)
  // Nivel del blob: progreso hacia el siguiente múltiplo de 10 €
  const nextMilestone = (Math.floor(saldo / 10) + 1) * 10
  const fill = Math.max(0.04, (saldo - (nextMilestone - 10)) / 10) // mínimo visible

  if (loading) return <div className="pig-page"><p className="loading-text">Cargando…</p></div>

  return (
    <div className="pig-page">
      <header className="pig-header">
        <span className="pig-kicker">Hucha</span>
        <span className="pig-month">{new Date(hoy + 'T12:00:00').toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}</span>
      </header>

      {/* Hero: blob a casi pantalla completa con burbujas por hábito */}
      <div className="pig-hero">
        <div className="blob-stage">
          <div className="blob-glow" />

          {/* Burbujas metaball (se funden hacia el centro) */}
          <svg className="pig-meta" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
                <feColorMatrix in="b" type="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
              </filter>
            </defs>
            {bubbles.map(b => {
              const ix1 = b.cx + (150 - b.cx) * 0.40, iy1 = b.cy + (150 - b.cy) * 0.40
              const ix2 = b.cx + (150 - b.cx) * 0.66, iy2 = b.cy + (150 - b.cy) * 0.66
              return (
                <g key={b.id} filter="url(#goo)"
                  style={{ animation: `${b.anim} ${b.dur}s ease-in-out infinite`, transformOrigin: 'center' }}>
                  <circle cx={b.cx} cy={b.cy} r={b.R} fill={b.color} />
                  <circle cx={ix1} cy={iy1} r={b.R * 0.6} fill={b.color} />
                  <circle cx={ix2} cy={iy2} r={b.R * 0.4} fill={b.color} />
                </g>
              )
            })}
          </svg>

          {/* La hucha (blob dorado) */}
          <div className="blob">
            <div className="blob-fill" style={{ height: `${Math.min(fill, 1) * 100}%` }}>
              <svg className="blob-wave" viewBox="0 0 400 24" preserveAspectRatio="none">
                <path d="M0,12 C25,4 50,20 75,12 C100,4 125,20 150,12 C175,4 200,20 200,12 C225,4 250,20 275,12 C300,4 325,20 350,12 C375,4 400,12 400,12 L400,24 L0,24 Z" />
              </svg>
            </div>
          </div>

          {/* Saldo (encima de todo) */}
          <div className="blob-num">
            <span className="blob-amount tnum">{formatNum(saldoAnim)} €</span>
            {deltaHoy > 0.0001 && <span className="blob-delta tnum">↑ +{formatNum(deltaHoy)} € hoy</span>}
          </div>

          {/* Importe de cada burbuja */}
          {bubbles.map(b => (
            <span key={b.id} className="bubble-amt tnum"
              style={{ left: `${b.cx / 3}%`, top: `${b.cy / 3}%`, fontSize: `${11 + b.R * 0.16}px` }}>
              {formatNum(b.total)} €
            </span>
          ))}
        </div>

        <p className="blob-caption">
          {saldo > 0
            ? <>faltan <span className="tnum">{formatNum(nextMilestone - saldo)} €</span> para los {nextMilestone} €</>
            : 'Cumple un hábito y la hucha empieza a llenarse'}
        </p>
        <div className="scroll-hint">desliza para ver el detalle ↓</div>
      </div>

      {/* Aportación por hábito */}
      {porHabito.length > 0 && (
        <section className="pig-section">
          <div className="pig-section-title">Aportación por hábito</div>
          <div className="pig-breakdown">
            {porHabito.map(({ habit, total }) => (
              <div key={habit.id} className="pig-break-row">
                <span className="pig-break-dot" style={{ background: habit.color }} />
                <span className="pig-break-name">{habit.nombre}</span>
                <span className="pig-break-amt tnum">{formatNum(total)} €</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Últimos movimientos */}
      {movimientos.length > 0 && (
        <section className="pig-section">
          <div className="pig-section-title">Últimos movimientos</div>
          <div className="pig-movs">
            {movimientos.map((m, i) => {
              const h = habitMap[m.habitId]
              if (!h) return null
              return (
                <div key={`${m.habitId}-${m.periodo}-${i}`} className="pig-mov">
                  <span className="pig-mov-avatar" style={{ background: `${h.color}22`, color: h.color }}>
                    {h.nombre.charAt(0).toUpperCase()}
                  </span>
                  <div className="pig-mov-text">
                    <span className="pig-mov-name">{h.nombre}</span>
                    <span className="pig-mov-meta">{relDate(m.fecha, hoy)} · cumplido</span>
                  </div>
                  <span className="pig-mov-amt tnum">+{formatNum(m.cantidad)} €</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {porHabito.length === 0 && (
        <div className="empty-state">
          <p>Aún no hay aportaciones.</p>
          <p>Cumple un hábito en la pestaña <strong>Hoy</strong>.</p>
        </div>
      )}
    </div>
  )
}
