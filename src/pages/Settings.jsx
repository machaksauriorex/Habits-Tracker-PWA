import { useState, useEffect, useRef } from 'react'
import { getSettings, saveSettings, getHabits, exportData, importData } from '../db/index.js'
import HabitList from '../components/HabitList.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const APP_VERSION = '1.0'

function formatNum(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Proyección: suma geométrica de N días seguidos × nº de hábitos activos
function proyeccion(base, r, dias, habitos) {
  const aport = Math.abs(r) < 1e-10 ? base * dias : base * (Math.pow(1 + r, dias) - 1) / r
  return aport * habitos
}

// ── Modal para editar un parámetro numérico ────────────────────────────────────

function EditModal({ title, hint, value, suffix, step, onSave, onCancel }) {
  const [val, setVal] = useState(String(value))
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{hint}</p>
        <div className="edit-field">
          <input
            type="number" value={val} min={0} step={step} autoFocus
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSave(val)}
          />
          <span className="edit-suffix">{suffix}</span>
        </div>
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSave(val)}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

// ── Ajustes ────────────────────────────────────────────────────────────────────

export default function Settings({ onNew, onEdit }) {
  const [settings, setSettings] = useState(null)
  const [activeCount, setActiveCount] = useState(0)
  const [edit, setEdit] = useState(null)      // 'base' | 'incremento' | null
  const [confirmImport, setConfirmImport] = useState(null) // datos pendientes
  const [toast, setToast] = useState(null)
  const fileRef = useRef(null)

  async function load() {
    const [cfg, habits] = await Promise.all([getSettings(), getHabits()])
    setSettings(cfg)
    setActiveCount(habits.filter(h => h.status === 'active').length)
  }
  useEffect(() => { load() }, [])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2600) }

  async function saveParam(key, raw) {
    const num = parseFloat(String(raw).replace(',', '.'))
    if (isNaN(num) || num < 0) { setEdit(null); return }
    const value = key === 'incremento' ? num / 100 : num // % → fracción
    const next = { ...settings, [key]: value }
    setSettings(next)
    await saveSettings(next)
    setEdit(null)
  }

  async function handleExport() {
    const data = await exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `habitos-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Backup descargado')
  }

  function handleFilePick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-elegir el mismo archivo
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        setConfirmImport(data)
      } catch {
        flash('El archivo no es un JSON válido')
      }
    }
    reader.readAsText(file)
  }

  async function doImport() {
    try {
      await importData(confirmImport)
      setConfirmImport(null)
      flash('Datos importados · recargando…')
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      setConfirmImport(null)
      flash(err.message ?? 'Error al importar')
    }
  }

  if (!settings) return <div className="stats-page"><p className="loading-text">Cargando…</p></div>

  const base = settings.base ?? 0.20
  const r    = settings.incremento ?? 0.05
  const proj = proyeccion(base, r, 30, Math.max(activeCount, 1))

  return (
    <div className="settings-page">
      <header className="settings-header"><h1>Ajustes</h1></header>

      {/* Hucha */}
      <div className="settings-section-label">Hucha</div>
      <div className="settings-card">
        <button className="settings-row" onClick={() => setEdit('base')}>
          <div className="settings-row-text">
            <span className="settings-row-title">Base diaria</span>
            <span className="settings-row-sub">Cantidad base por hábito cumplido</span>
          </div>
          <div className="settings-row-value">
            <span className="tnum">{formatNum(base)} €</span>
            <Chevron />
          </div>
        </button>
        <button className="settings-row" onClick={() => setEdit('incremento')}>
          <div className="settings-row-text">
            <span className="settings-row-title">Incremento por racha</span>
            <span className="settings-row-sub">Cada día seguido la aportación crece este %</span>
          </div>
          <div className="settings-row-value">
            <span className="tnum">{formatNum(r * 100)} %</span>
            <Chevron />
          </div>
        </button>
      </div>
      <div className="settings-note">
        A los 30 días con {Math.max(activeCount, 1)} hábito{activeCount === 1 ? '' : 's'} →{' '}
        <span className="settings-note-strong tnum">aprox. {formatNum(proj)} €</span>
      </div>

      {/* Hábitos */}
      <div className="settings-section-label">Hábitos</div>
      <div className="settings-habitlist">
        <HabitList onNew={onNew} onEdit={onEdit} embedded />
      </div>

      {/* Datos */}
      <div className="settings-section-label">Datos</div>
      <div className="settings-card">
        <button className="settings-row" onClick={handleExport}>
          <div className="settings-row-text">
            <span className="settings-row-title">Exportar datos</span>
            <span className="settings-row-sub">Descarga un backup JSON completo</span>
          </div>
          <DownloadIcon dir="down" />
        </button>
        <button className="settings-row" onClick={() => fileRef.current?.click()}>
          <div className="settings-row-text">
            <span className="settings-row-title settings-danger">Importar datos</span>
            <span className="settings-row-sub">Reemplaza TODO el historial actual</span>
          </div>
          <DownloadIcon dir="up" />
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json"
          onChange={handleFilePick} style={{ display: 'none' }} />
      </div>

      {/* Info */}
      <div className="settings-section-label">Info</div>
      <div className="settings-card">
        <div className="settings-row settings-row--static">
          <span className="settings-row-title">Versión</span>
          <span className="settings-row-value tnum">{APP_VERSION}</span>
        </div>
      </div>

      {edit === 'base' && (
        <EditModal
          title="Base diaria"
          hint="Cantidad que suma cada hábito cumplido el primer día (en euros)."
          value={base} suffix="€" step="0.05"
          onSave={v => saveParam('base', v)} onCancel={() => setEdit(null)}
        />
      )}
      {edit === 'incremento' && (
        <EditModal
          title="Incremento por racha"
          hint="Porcentaje que crece la aportación por cada día seguido cumpliendo."
          value={r * 100} suffix="%" step="1"
          onSave={v => saveParam('incremento', v)} onCancel={() => setEdit(null)}
        />
      )}

      {confirmImport && (
        <ConfirmDialog
          title="Importar datos"
          message="Esto BORRARÁ todos tus hábitos e historial actuales y los reemplazará por los del archivo. Esta acción no se puede deshacer."
          confirmLabel="Reemplazar todo"
          destructive
          onConfirm={doImport}
          onCancel={() => setConfirmImport(null)}
        />
      )}

      {toast && <div className="settings-toast">{toast}</div>}
    </div>
  )
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-muted)"
      strokeWidth="1.5" strokeLinecap="round"><polyline points="5,3 9,7 5,11" /></svg>
  )
}

function DownloadIcon({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--text-muted)"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'down'
        ? <path d="M9 2 L9 12 M5 8 L9 12 L13 8" />
        : <path d="M9 12 L9 2 M5 6 L9 2 L13 6" />}
      <path d="M3 14 L15 14" />
    </svg>
  )
}
