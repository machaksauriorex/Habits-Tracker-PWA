import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import Today from './pages/Today.jsx'
import HabitForm from './components/HabitForm.jsx'
import Stats from './pages/Stats.jsx'
import Piggybank from './pages/Piggybank.jsx'
import Settings from './pages/Settings.jsx'
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
        <div className="page-fade" key={tab}>
          {tab === 'today'     && <Today onNew={openCreate} />}
          {tab === 'stats'     && <Stats />}
          {tab === 'piggybank' && <Piggybank />}
          {tab === 'settings'  && <Settings onNew={openCreate} onEdit={openEdit} />}
        </div>
      </div>
      <BottomNav current={tab} onChange={setTab} />
    </div>
  )
}
