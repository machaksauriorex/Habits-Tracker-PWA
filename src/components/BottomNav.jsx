// Iconos de línea (set coherente y discreto, según el diseño)
const ICONS = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>
  ),
  piggybank: (
    <path d="M12 3C8.5 7 6 11 6 14.5C6 18.09 8.686 21 12 21C15.314 21 18 18.09 18 14.5C18 11 15.5 7 12 3Z" />
  ),
  stats: (
    <>
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </>
  ),
  settings: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2.2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2.2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="18" r="2.2" />
    </>
  ),
}

const TABS = [
  { id: 'today',     label: 'Hoy' },
  { id: 'piggybank', label: 'Hucha' },
  { id: 'stats',     label: 'Estadísticas' },
  { id: 'settings',  label: 'Ajustes' },
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
          <svg
            className="bottom-nav-icon"
            width="22" height="22" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            {ICONS[tab.id]}
          </svg>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
