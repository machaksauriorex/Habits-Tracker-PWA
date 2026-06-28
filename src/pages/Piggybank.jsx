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

      {/* Blob orgánico con el saldo */}
      <div className="blob-stage">
        <div className="blob-glow" />
        <div className="blob">
          <div className="blob-fill" style={{ height: `${Math.min(fill, 1) * 100}%` }}>
            <svg className="blob-wave" viewBox="0 0 400 24" preserveAspectRatio="none">
              <path d="M0,12 C25,4 50,20 75,12 C100,4 125,20 150,12 C175,4 200,20 200,12 C225,4 250,20 275,12 C300,4 325,20 350,12 C375,4 400,12 400,12 L400,24 L0,24 Z" />
            </svg>
          </div>
          <div className="blob-content">
            <span className="blob-amount tnum">{formatNum(saldoAnim)} €</span>
            {deltaHoy > 0.0001 && <span className="blob-delta tnum">↑ +{formatNum(deltaHoy)} € hoy</span>}
          </div>
        </div>
      </div>
      <p className="blob-caption">
        {saldo > 0
          ? <>faltan <span className="tnum">{formatNum(nextMilestone - saldo)} €</span> para los {nextMilestone} €</>
          : 'Cumple un hábito y la hucha empieza a llenarse'}
      </p>

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
