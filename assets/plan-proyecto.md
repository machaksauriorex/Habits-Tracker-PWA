# Plan de proyecto: PWA de seguimiento de hábitos con "hucha virtual"

Documento de referencia para desarrollar la app con **Claude Code**. La dirección visual e interacción se detalla en un documento de diseño aparte (el *brief* para Claude Design).

---

## 1. Contexto y objetivo

PWA **personal, de un solo usuario**, para seguir hábitos. Cada hábito cumplido suma a una **hucha virtual** (dinero simbólico en €) y cada incumplido resta, como mecánica de motivación basada en la constancia.

El desarrollador es **principiante total** en programación. Claude Code asume el peso técnico y explica lo importante (decisiones de arquitectura, conceptos como React, Service Workers o IndexedDB) sin detenerse en cada detalle de sintaxis.

**Alcance de la v1 (resumen):** CRUD de hábitos con fases · marcado diario con edición retroactiva · hucha virtual con rachas · estadísticas (globales y por hábito) · backup/restore en JSON · instalable como PWA offline. El detalle de cada punto está en las secciones siguientes.

---

## 2. Arquitectura y alcance técnico

**Patrón: aplicación 100% local en el móvil, sin servidor.**

- **Uso exclusivo desde el móvil.** No se necesita ver la app desde el PC.
- **Frontend = toda la app.** Framework **React** (elegido por el estado complejo: muchos hábitos, gráficas y calendarios; vanilla JS no escalaría bien aquí).
- **Almacenamiento: IndexedDB** (vía librería ligera tipo `idb`), única fuente de datos. Todo vive en el móvil.
- **Service Worker + manifest:** hacen la app instalable ("Añadir a pantalla de inicio") y funcional sin conexión. Al no haber servidor, el offline es casi automático.
- **Sin backend, sin sincronización, sin deploy.** Una vez instalada como PWA, funciona fuera de casa sin conexión.

**Riesgo asumido:** si se desinstala la app, se borran los datos del navegador o se cambia de móvil, los datos se pierden salvo que se haya hecho un backup manual (sección 7). Es aceptable a cambio de la simplicidad.

**Evolución futura (NO implementar en v1):** si algún día se quisiera backup automático o multidispositivo, se valoraría un servicio en la nube (Supabase/Firebase) o un backend propio en la Raspberry Pi vía Tailscale (que el usuario ya tiene). Se descarta conscientemente para la v1.

---

## 3. Modelo de datos

### Hábito
- `id`, `nombre`
- `color` (elegible; hace de categoría visual, ver sección 5). **Sin emoji:** los hábitos se identifican solo por nombre y color.
- `tipo de registro`: **booleano** (sí/no) o **cuantitativo** (número: vasos, páginas, cigarros…). Fijo, no cambia entre fases.
- `periodo`: **diario**, **semanal** (semana natural L–D) o **mensual** (mes natural). Fijo, no cambia entre fases.
- `fecha de creación`, estado `activo/archivado`

### Fase de hábito
Permite que el objetivo evolucione en el tiempo sin alterar el pasado (ej. "leer 10 págs" → más adelante "leer 20 págs").
- `id`, `id del hábito`
- `fecha de inicio` (elegible por el usuario, no necesariamente hoy)
- `tipo de objetivo`: **mínimo** (cumplido al alcanzar/superar X) o **máximo** (cumplido al no superar X). El máximo permite hábitos de límite: fumar, refrescos…
- `valor objetivo`: número (en booleano diario es implícitamente 1)
- La **fase activa** es la de fecha de inicio más reciente ya iniciada. Cada registro se evalúa contra la fase vigente en su fecha, así que **crear una fase nueva nunca recalcula el historial pasado.**

### Registro de cumplimiento
- `id`, `id del hábito`, `fecha`
- `valor`: booleano (sí/no) o número (cuantitativo)
- **Editable retroactivamente sin límite de tiempo.** Corregir un día pasado recalcula la hucha automáticamente (sección 4).

### Evaluación de un periodo (cumplido / incumplido)
Regla única usada tanto por las estadísticas como por la hucha:
- **Diario:** el día se cumple si el valor de ese día satisface el objetivo de la fase vigente.
- **Semanal / mensual:** se agregan los registros del periodo natural y se comparan con el objetivo. Se evalúa **al cerrarse el periodo**; el periodo en curso solo muestra el contador de progreso (ej. "2/3"), sin avisos de "vas mal".
- Un periodo solo se evalúa si el hábito estaba activo en él (entre creación y archivado/borrado).

### Borrado vs. archivado
- **Borrar** elimina el hábito, sus fases y todo su historial (no queda nada en estadísticas). Pide confirmación.
- **Archivar** deja de seguir el hábito pero conserva el historial.
La interfaz debe diferenciar claramente ambas acciones.

### Hucha (almacenamiento)
- **El saldo y las rachas NO se almacenan**: se recalculan del historial completo (sección 4).
- Se guardan: el **histórico de movimientos** (fecha, hábito, periodo, cantidad con signo, motivo) y los parámetros globales `base` e `incremento`.

---

## 4. Mecánica de la hucha virtual

**Una única hucha global** (un saldo en €) que sube al cumplir y baja al incumplir. La aportación crece con la racha de cada hábito, como refuerzo a la constancia.

### Parámetros configurables (globales)
- `base`: aportación del primer día de una racha (ej. 0,20 €). Se fija pequeña a propósito para que un "día perfecto" con todos los hábitos sume una cantidad razonable, sin dividir entre el número de hábitos.
- `incremento` (porcentaje): factor de crecimiento **geométrico** por cada día-hueco consecutivo de racha (ej. 5 %). La aportación se **multiplica** por `(1 + incremento)` en cada día, no se suma una cantidad fija.
- No hay un valor de penalización configurable: la penalización es **simétrica** (abajo).

### Racha por hábito
Cada hábito lleva **su propia racha**; fallar uno no afecta a los demás (así se evita el efecto "ya me da igual"). Dos contadores relacionados:
- **Racha (para el usuario y récords):** nº de **periodos** consecutivos cumplidos (días, semanas o meses según el hábito).
- **`k` (interno, para el dinero):** nº de **días-hueco** que cubre la racha actual. Empieza en 0 y se reinicia a 0 al romperse.

### Modelo "día-equivalente"
La aportación se calcula **por días**, no por periodo, y la rampa de incremento **continúa de un periodo al siguiente**. El crecimiento es **geométrico**: cada día-hueco multiplica la aportación por `(1 + r)`, donde `r` es el porcentaje de incremento.

Sea `D` los días del periodo cumplido (diario `D=1`, semanal `D=7`, mensual `D=` días reales del mes), `k` el número de días-hueco cubiertos por la racha antes de este periodo, y `r` el incremento porcentual:

```
aportación_día_i = base × (1 + r)^(k + i)        para i = 0, 1, …, D−1

aportación_periodo = base × (1 + r)^k × [ (1 + r)^D − 1 ] / r
```

Tras cumplir, `k ← k + D`.

**Verificación contra el Excel** (base = 1, r = 5 % = 0,05):

| Día | SI/NO | k antes | Aportación del día        | Total acumulado |
|-----|-------|---------|---------------------------|-----------------|
| 1   | SI    | 0       | 1 × 1,05⁰ = **1,00 €**   | 1,00 €          |
| 2   | SI    | 1       | 1 × 1,05¹ = **1,05 €**   | 2,05 €          |
| 3   | NO    | —       | penalización / racha=0    | 2,05 €          |
| 4   | SI    | 0       | 1 × 1,05⁰ = **1,00 €**   | 3,05 €          |
| 5   | SI    | 1       | 1 × 1,05¹ = **1,05 €**   | 4,10 €          |
| 6   | SI    | 2       | 1 × 1,05² = **1,10 €**   | 5,20 €          |
| 7   | SI    | 3       | 1 × 1,05³ = **1,16 €**   | 6,36 €          |
| 8   | SI    | 4       | 1 × 1,05⁴ = **1,22 €**   | 7,58 €          |
| 9   | NO    | —       | penalización / racha=0    | 7,58 €          |
| 10  | SI    | 0       | 1 × 1,05⁰ = **1,00 €**   | 8,58 €          |
| 11  | SI    | 1       | 1 × 1,05¹ = **1,05 €**   | 9,63 €          |
| 12  | SI    | 2       | 1 × 1,05² = **1,10 €**   | 10,73 €         |

*La tabla replica exactamente el Excel adjunto al documento.*

**Consecuencia del modelo:** un hábito semanal o mensual cumplido vale exactamente lo mismo que su equivalente diario cumplido todos los días del periodo (misma fórmula, distinto `D`).

### Penalización simétrica
Al incumplir un periodo se resta **exactamente lo que se habría ganado** con el `k` de ese momento (misma fórmula de arriba) y **`k` se reinicia a 0**. Es brusca a propósito: cuanto más larga la racha, más duele fallar, lo que incentiva proteger las rachas largas (decisión consciente del usuario).

### Cuándo se resuelve cada hábito
Al **cerrarse su periodo**: el diario cada día (hoy queda pendiente hasta que el día pasa); el semanal al acabar la semana; el mensual al acabar el mes. La evaluación cumplido/incumplido sigue la regla de la sección 3.

### Saldo mínimo 0
El saldo **nunca baja de 0** en ningún momento: si una penalización lo llevaría por debajo, se queda en 0 (no existe "deuda").

### Implementación (clave para Claude Code)
El saldo, las rachas y los movimientos se obtienen de una **función pura** que recibe el historial completo (hábitos + fases + registros) y devuelve `{ saldo, rachas por hábito, movimientos }`. **No usar un contador mutable.** Así, editar un día pasado recalcula todo solo (ej.: rellenar un día olvidado recompone la racha y reajusta el saldo).

### Caso borde
Si un hábito se crea a mitad de semana/mes, ese primer periodo parcial cuenta solo los días activos (`D` = días activos en el periodo). El detalle fino (si el objetivo se prorratea o no) se concreta en implementación.

---

## 5. Experiencia de usuario (UX)

- **Navegación:** barra de pestañas inferior — **Hoy · Estadísticas · Hucha · Ajustes**.
- **Pantalla inicial:** directamente "Hoy", sin bienvenida.
- **Cabecera de "Hoy":** saldo de la hucha siempre visible arriba.

**Pantalla "Hoy" (estilo Loop Habit Tracker):** lista plana de hábitos, uno por fila (color + nombre a la izquierda). A la derecha, **siempre los 7 días de la semana actual (L M X J V S D)**. Se **toca la celda de cada día** para marcarlo, sin entrar en el hábito; se desplaza **semana a semana** hacia atrás para días antiguos (esa es también la vía de edición retroactiva).
- **Booleano:** la celda alterna hecho/no hecho; el color indica cumplido.
- **Cuantitativo:** la celda muestra el número; un toque lo edita; el color indica si llegó al objetivo.
- **Semanal/mensual:** se marca por día igual que el diario; la fila muestra el progreso del periodo (ej. "2/3 esta semana") como resumen.

- **Color = categoría.** No hay categorías con nombre propio: el color del hábito agrupa visualmente y se reutiliza en las estadísticas (ej. ver de un vistazo "lo verde" frente a "lo azul").
- **Tema:** oscuro.
- **Formato España:** español; € con coma decimal ("12,25 €"); fechas DD/MM; semana L–D.
- **Nombre e icono de la app:** los propone Claude Code (concepto hábitos + hucha/ahorro), a confirmar por el usuario.

---

## 6. Estadísticas

Dos niveles, con **selector de rango** (semana / mes / año) y **vista de histórico completo**. Los récords se calculan siempre sobre todo el histórico.

**Globales:**
- Evolución de la hucha (gráfica de línea del saldo en el tiempo).
- % de cumplimiento global.
- Heatmap global (estilo "contribuciones de GitHub"; intensidad = cuántos hábitos se cumplieron cada día).
- Comparación entre hábitos: ranking/barras por % de cumplimiento (cada barra con el color del hábito) **y** agregado por color/categoría.
- Récords: racha actual y racha más larga por hábito, % de cumplimiento total, € aportado por cada hábito, mejor semana y mejor mes.

**Por hábito** (al tocarlo): heatmap en su color, % de cumplimiento (rango y total), racha actual y récord, € aportados a la hucha.

*% de cumplimiento* = periodos cumplidos / periodos evaluables del rango, según el objetivo de la fase vigente en cada periodo.

---

## 7. Importación y exportación

- **Exportar:** un botón en Ajustes genera un **backup JSON completo** (hábitos, fases, registros, parámetros de la hucha y ajustes) y lo descarga al dispositivo. No hay CSV en la v1.
- **Importar:** seleccionar un JSON **restaura reemplazando todo** lo actual. Pide **confirmación destructiva** explícita.
- **Lanzamiento:** siempre manual. Sin backups automáticos ni recordatorios en la v1.

---

## 8. Fuera de alcance (v1)

Notificaciones/recordatorios · multiusuario o login · backend, sincronización o uso desde PC.

---

## 9. Cómo trabajar con Claude Code

- **Nivel de explicación "mezcla":** explicar lo importante, sin pararse en cada detalle.
- **Por fases incrementales** (sección 10). Cada fase termina en algo **estable y usable** que el usuario pueda probar, antes de avanzar.
- **Lógica primero, diseño escalonado:** las fases 0–2 son funcionales pero feas. Los tokens base (paleta, tipografía, espaciado) se aplican en la Fase 2.5 para que la instalación en el móvil ya tenga aspecto de app real. El diseño fino de pantallas complejas y las animaciones se completan en las fases 5 y 6.
- **Git + GitHub desde la Fase 0:** cada fase cierra con un commit subido a GitHub (copia de seguridad del código).

---

## 10. Roadmap por fases

**Fase 0 — Entorno y herramientas**
Instalar Node.js y crear el proyecto con Vite + React. Configurar Git y GitHub desde cero (Claude Code explica qué son y los comandos básicos; crea el repositorio). Estructura de carpetas, incluyendo una carpeta `assets/` en la raíz del repositorio donde se depositarán desde el principio el plan de proyecto y el diseño de UI generado con Claude Design. Instalar y probar IndexedDB (`idb`).
→ *Resultado:* pantalla "Hola mundo" en el navegador del PC que lee/escribe en IndexedDB. Carpeta `assets/` lista con el plan y el diseño de referencia.

**Fase 1 — CRUD de hábitos**
Formulario completo (nombre, color, tipo de registro, periodo, objetivo mínimo/máximo y valor). Sistema de fases (objetivo + fecha de inicio; la fase activa es la más reciente). Archivar vs. borrar diferenciados, con confirmación al borrar. Persistencia en IndexedDB.
→ *Resultado:* crear, editar, archivar y borrar hábitos. Sin marcado aún.

**Fase 2 — Marcado diario + hucha (lógica core)**
Pantalla "Hoy" con la cuadrícula de 7 días estilo Loop (funcional, sin pulir), con marcado booleano, cuantitativo y semanal/mensual, y edición retroactiva. **Función pura de la hucha** según la sección 4 (saldo, rachas, penalización simétrica, día-equivalente, suelo en 0). **Tests automáticos** de esa función antes de seguir: racha que crece, racha que se rompe, equivalencia diario/semanal/mensual, penalización simétrica, suelo en 0 y recálculo tras edición retroactiva. Cabecera con el saldo (número, sin diseño).
→ *Resultado:* marcar un hábito y ver el saldo cambiar al instante.

**Fase 2.5 — Tokens de diseño base**
**⚑ Primer uso del diseño** disponible en `assets/`. Se aplican únicamente los tokens globales: paleta oscura, tipografía (incluyendo la fuente con carácter para las cifras de la hucha), espaciado y radios. La cabecera del saldo se convierte ya en el elemento hero. Sin tocar la lógica ni entrar en componentes complejos (las estadísticas aún no existen).
→ *Resultado:* la pantalla "Hoy" y la hucha ya tienen aspecto de app real antes de instalarla en el móvil.

**Fase 3 — PWA instalable**
`manifest.json` (nombre, icono, colores, `standalone`) y Service Worker (cacheo offline). Probar instalación en el móvil real y verificar que todo lo anterior sigue funcionando.
→ *Resultado:* icono en la pantalla de inicio; abre sin navegador, funciona sin wifi y ya se ve bien.

**Fase 4 — Estadísticas y backup**
Estadísticas globales y por hábito de la sección 6 (gráficas, heatmaps, comparativas, récords) con selector de rango. Exportar a JSON e importar con restauración (sección 7). El estilo de estas pantallas es funcional pero sin pulir todavía.
→ *Resultado:* estadísticas completas y backup/restore funcionando.

**Fase 5 — Diseño completo de pantallas**
Aplicar el diseño de `assets/` a todas las pantallas restantes: estadísticas (gráficas, heatmaps, comparativas), pantalla de hucha y ajustes. El componente **celda de día** recibe su forma definitiva. Sin tocar la lógica.
→ *Resultado:* la app adopta su identidad visual completa en todas las pantallas.

**Fase 6 — Animaciones y pulido**
Animación de marcado (relleno orgánico con física de muelle), de la hucha (count-up + llenado), de penalización (descenso suave). Transiciones entre pestañas, reveal de estadísticas con stagger, `prefers-reduced-motion` respetado. Pulido final: estados vacíos, copy, confirmaciones destructivas, accesibilidad (contraste, objetivos táctiles).
→ *Resultado:* la app completa, con su identidad y animaciones.

---

*Punto de partida para Claude Code. La arquitectura, el modelo de datos y la mecánica de la hucha están cerrados; los detalles finos de implementación (librerías concretas, estructura exacta de pantallas) se concretan en cada fase.*
