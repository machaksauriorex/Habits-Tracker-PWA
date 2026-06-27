import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import Today from './pages/Today.jsx'
import HabitList from './components/HabitList.jsx'
import HabitForm from './components/HabitForm.jsx'
import './App.css'

export default function App() {
  const [tab,    setTab]    = useState('today')
  const [form,   setForm]   = useState(null) // null | { habit: obj|null }

  function openCreate() { setForm({ habit: null }) }
  function openEdit(habit) { setForm({ habit }) }
  function closeForm() { setForm(null) }

  // El formulario de hábito es un overlay sobre cualquier pestaña
  if (form) {
    return <HabitForm habit={form.habit} onSave={closeForm} onBack={closeForm} />
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        {tab === 'today'     && <Today />}
        {tab === 'stats'     && <PlaceholderPage title="Estadísticas" emoji="📊" fase="4" />}
        {tab === 'piggybank' && <PlaceholderPage title="Hucha" emoji="🐷" fase="2+" />}
        {tab === 'settings'  && (
          <HabitList onNew={openCreate} onEdit={openEdit} />
        )}
      </div>
      <BottomNav current={tab} onChange={setTab} />
    </div>
  )
}

function PlaceholderPage({ title, emoji, fase }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: 48 }}>{emoji}</p>
      <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>{title}</p>
      <p>Disponible en la Fase {fase}</p>
    </div>
  )
}
