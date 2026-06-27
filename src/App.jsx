import { useState } from 'react'
import HabitList from './components/HabitList.jsx'
import HabitForm from './components/HabitForm.jsx'
import './App.css'

export default function App() {
  const [view, setView] = useState('list') // 'list' | 'form'
  const [editingHabit, setEditingHabit] = useState(null)

  function openCreate() {
    setEditingHabit(null)
    setView('form')
  }

  function openEdit(habit) {
    setEditingHabit(habit)
    setView('form')
  }

  function goToList() {
    setEditingHabit(null)
    setView('list')
  }

  if (view === 'form') {
    return <HabitForm habit={editingHabit} onSave={goToList} onBack={goToList} />
  }

  return <HabitList onNew={openCreate} onEdit={openEdit} />
}
