import { useState, useEffect } from 'react'
import { testWrite, testRead } from './db/index.js'
import './App.css'

export default function App() {
  const [contador, setContador] = useState(null)
  const [log, setLog] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    testRead('contador').then(registro => {
      setContador(registro?.value ?? 0)
      setCargando(false)
      añadirLog('IndexedDB abierta correctamente')
    })
  }, [])

  function añadirLog(msg) {
    const hora = new Date().toLocaleTimeString('es-ES')
    setLog(prev => [`[${hora}] ${msg}`, ...prev].slice(0, 5))
  }

  async function incrementar() {
    const nuevo = (contador ?? 0) + 1
    await testWrite('contador', nuevo)
    setContador(nuevo)
    añadirLog(`Escritura OK → contador = ${nuevo}`)
  }

  async function resetear() {
    await testWrite('contador', 0)
    setContador(0)
    añadirLog('Contador reseteado a 0')
  }

  return (
    <div className="test-page">
      <header className="test-header">
        <span className="test-logo">🐷</span>
        <div>
          <h1>Hábitos con Hucha</h1>
          <p className="test-sub">Fase 0 — Prueba de IndexedDB</p>
        </div>
      </header>

      <div className="test-card">
        <p className="test-label">Contador persistente</p>
        {cargando ? (
          <p className="test-loading">Abriendo base de datos…</p>
        ) : (
          <p className="test-valor">{contador}</p>
        )}
        <p className="test-hint">
          Este número se guarda en <strong>IndexedDB</strong>.
          Recarga la página y comprueba que persiste.
        </p>
        <div className="test-acciones">
          <button onClick={incrementar} disabled={cargando}>
            Sumar +1
          </button>
          <button onClick={resetear} disabled={cargando} className="secondary">
            Resetear
          </button>
        </div>
      </div>

      <div className="test-log">
        <p className="test-label">Registro de operaciones</p>
        {log.length === 0 ? (
          <p className="test-hint">Sin operaciones aún…</p>
        ) : (
          log.map((linea, i) => (
            <p key={i} className="test-log-line">{linea}</p>
          ))
        )}
      </div>
    </div>
  )
}
