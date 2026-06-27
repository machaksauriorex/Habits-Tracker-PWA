const TABS = [
  { id: 'today',      label: 'Hoy',          icon: '☀️' },
  { id: 'stats',      label: 'Estadísticas',  icon: '📊' },
  { id: 'piggybank',  label: 'Hucha',         icon: '🐷' },
  { id: 'settings',   label: 'Ajustes',       icon: '⚙️' },
]

export default function BottomNav({ current, onChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`bottom-nav-item${current === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="bottom-nav-icon">{tab.icon}</span>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
