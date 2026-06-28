# 🐷 Hábitos con Hucha

Una **PWA** para seguir tus hábitos diarios donde cada hábito cumplido **llena una hucha virtual en euros**. Cuanto más constante eres, más crece la recompensa.

**▶️ Demo en vivo:** https://machaksauriorex.github.io/Habits-Tracker-PWA/

> Funciona sin conexión y se instala en el móvil como una app más (Añadir a pantalla de inicio). Todos los datos se guardan **en tu dispositivo**; no hay servidor ni cuentas.

---

## ✨ Características

- **Hábitos flexibles**: de tipo Sí/No (lo hiciste o no) o numéricos (páginas, vasos, cigarros…), con unidad opcional.
- **Objetivos por periodo**: diario, semanal o mensual, con meta de **mínimo** (hacer al menos X) o **máximo** (no pasar de X).
- **Fases**: cambia el objetivo a futuro sin perder el historial pasado.
- **Hucha virtual**: cada cumplimiento aporta una base que **crece con la racha**. Romper la racha no resta lo ya ahorrado, solo reinicia el incremento.
- **Pantalla Hoy**: marca la semana visible de un vistazo, navega entre semanas y **reordena los hábitos arrastrando** (mantén pulsado).
- **Estadísticas**: heatmap de actividad (semana/mes/año), % de cumplimiento, mejores rachas y, por hábito, métricas relevantes para numéricos (media, total, tendencia, gráfica con línea de objetivo).
- **Copia de seguridad**: exporta e importa todos tus datos en JSON.
- **Diseño cuidado**: tema oscuro, tipografía Space Grotesk, contador animado del saldo y animaciones suaves (respeta *prefers-reduced-motion*).

---

## 📸 Capturas

> Coloca tus capturas en `docs/screenshots/` con estos nombres y se mostrarán aquí.

| Hoy | Hucha | Estadísticas | Ajustes |
|-----|-------|--------------|---------|
| ![Hoy](docs/screenshots/hoy.png) | ![Hucha](docs/screenshots/hucha.png) | ![Estadísticas](docs/screenshots/estadisticas.png) | ![Ajustes](docs/screenshots/ajustes.png) |

---

## 💰 Cómo funciona la hucha

Cada día (o periodo) cumplido aporta una cantidad **base** que aumenta un **porcentaje por racha** mientras no falles:

```
aportación del día k de la racha = base × (1 + r)^k
```

- **Base diaria** e **incremento por racha (r)** se configuran en *Ajustes*.
- Fallar un periodo **reinicia la racha** (el siguiente cumplimiento vuelve a la base), pero **nunca resta** del saldo acumulado.
- El cálculo es una **función pura** (`calcularHucha`): recibe todo el historial y devuelve saldo, rachas y movimientos, así que editar días pasados recalcula todo de forma coherente.

---

## 🛠️ Tecnología

- **React 19** + **Vite**
- **IndexedDB** (vía [`idb`](https://github.com/jakearchibald/idb)) para almacenamiento local
- **vite-plugin-pwa** (manifest + Service Worker, offline e instalable)
- **@dnd-kit** para reordenar arrastrando
- **Vitest** para los tests de la lógica de la hucha
- **oxlint** como linter

---

## 🚀 Desarrollo

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm run build      # build de producción
npm run preview    # previsualizar el build
npm run lint       # linter

npm run test       # tests (zona horaria UTC)
npm run test:tz    # tests en Europe/Madrid (detecta bugs de zona horaria)
npm run test:all   # ambos
```

---

## 📁 Estructura

```
src/
├─ pages/
│  ├─ Today.jsx        # pantalla principal: marcado diario + reordenar
│  ├─ Piggybank.jsx    # la hucha (blob animado, movimientos)
│  ├─ Stats.jsx        # estadísticas globales e individuales
│  └─ Settings.jsx     # ajustes, gestión de hábitos, backup
├─ components/         # BottomNav, HabitForm, HabitList, ConfirmDialog
├─ hooks/useCountUp.js # contador animado
├─ utils/piggybank.js  # función pura de la hucha (+ tests)
└─ db/index.js         # acceso a IndexedDB (hábitos, fases, registros, ajustes)
```

---

## 🌐 Despliegue

Cada push a `main` despliega automáticamente en **GitHub Pages** mediante GitHub Actions (`.github/workflows/deploy.yml`).

---

## 🔒 Privacidad

100% local: tus hábitos y tu historial viven solo en tu navegador/dispositivo (IndexedDB). No se envía nada a ningún servidor. Para mover tus datos a otro dispositivo, usa **Exportar / Importar** en Ajustes.
