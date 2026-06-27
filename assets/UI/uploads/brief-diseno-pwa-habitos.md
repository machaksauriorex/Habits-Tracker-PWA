# Brief de diseño — PWA de hábitos con "hucha virtual"

Documento de dirección visual e interacción para **Claude Design**. La lógica funcional completa (modelo de datos, mecánica de la hucha, estadísticas) vive en el documento de plan del proyecto; aquí solo se trata el **diseño visual y la interacción**. Cuando haya dudas funcionales, este brief manda en lo estético y el plan manda en lo funcional.

---

## 1. Qué es y para quién

App **personal, de un solo usuario**, para seguir hábitos diarios/semanales/mensuales. Cada hábito cumplido alimenta una **hucha virtual** (dinero simbólico en €) que crece con la constancia; fallar resta. El usuario la usa **solo en el móvil**, a diario, en momentos rápidos (marcar lo del día) y en momentos de revisión (mirar progreso y hucha).

El trabajo emocional del diseño: que **marcar un hábito sea satisfactorio** y que **ver crecer la hucha enganche**. Es una app de constancia y recompensa; debe sentirse calmada pero gratificante, nunca agresiva ni "gamificada infantil".

**Idioma:** español de España. **Formato:** € con coma decimal ("12,25 €"), fechas DD/MM, semana de lunes a domingo.

---

## 2. Principios de diseño

1. **Moderno y minimalista de verdad.** Minimalismo es precisión, no vacío: jerarquía tipográfica clara, espaciado generoso y consistente, cero decoración que no aporte. Si un elemento no ayuda a entender o actuar, fuera.
2. **Modo oscuro nativo** (no un tema claro "apagado"). Diseñar el oscuro como la experiencia principal y única en la v1.
3. **Animaciones orgánicas e interesantes.** Movimiento con física natural (muelles/spring, no lineal), que refuerce la sensación de "algo se llena, algo crece". El movimiento debe servir a la recompensa, no ser ruido. Respetar `prefers-reduced-motion`.
4. **Pulgar primero.** Todo lo frecuente (marcar el día, ver la hucha) al alcance del pulgar; navegación inferior.
5. **El color es información.** Cada hábito tiene un color elegido por el usuario que funciona como su identidad/categoría y se reutiliza en estadísticas. La paleta base de la app debe ser neutra para que **esos colores de hábito sean los protagonistas cromáticos**.

---

## 3. Dirección visual propuesta (punto de partida, puedes elevarla)

No es una plantilla cerrada: es una base con personalidad para que no caiga en el "near-black + un acento ácido" genérico. Siéntete libre de refinarla, pero mantén la intención.

**Concepto:** "hucha de cristal en la noche". Superficie oscura, profunda y cálida (no negro puro frío), sobre la que los hábitos aportan color como gotas, y la hucha se llena con un líquido luminoso. Materialidad sutil: profundidad por capas y luz, no por sombras duras.

**Paleta base (neutra, modo oscuro) — propuesta de tokens:**
- `--bg`: #14161A (fondo profundo, ligeramente cálido/azulado, no #000).
- `--surface`: #1C1F25 (tarjetas y superficies elevadas).
- `--surface-2`: #242832 (elevación mayor, hojas/modales).
- `--text`: #ECEEF2 (texto principal, blanco roto, no #FFF puro).
- `--text-muted`: #8A909C (secundario, etiquetas, captions).
- `--hairline`: #2C313B (separadores finísimos, 1px).
- **Acento del sistema** (solo para la hucha y acciones primarias, NO para los hábitos): un tono que evoque "valor/luz líquida" — propuesta `--accent`: #E9C46A cálido dorado, o una alternativa verde-menta luminosa #5BD6A6. Elegir uno y usarlo con disciplina. Los **colores de hábito** los pone el usuario y conviven sobre este neutro.

**Tipografía:** elegir una pareja con carácter, no la fuente por defecto de cualquier app.
- *Display / cifras de la hucha:* una face con personalidad para los números grandes (el saldo es el héroe visual). Considerar una grotesca de carácter o una con números tabulares bonitos. Las cifras de dinero son protagonistas: trátalas como tipografía de exhibición.
- *Cuerpo / UI:* una sans limpia y legible a tamaños pequeños (nombres de hábito, etiquetas).
- *Datos / captions:* misma familia de cuerpo en peso/anchura de utilidad, números tabulares para que las cuadrículas cuadren.
- Escala tipográfica clara y con saltos intencionados; usar peso y espaciado, no solo tamaño, para la jerarquía.

**Forma y espaciado:** esquinas redondeadas coherentes (sugerencia: radios medios, 12–16px en tarjetas, formas más circulares en las celdas de día). Sistema de espaciado en múltiplos de 4. Aire entre secciones. Hairlines de 1px en `--hairline` en vez de cajas pesadas.

**Iconografía:** los hábitos usan **emoji** elegidos por el usuario (no inventar un set de iconos para ellos). Los iconos del sistema (navegación, ajustes) deben ser un set lineal coherente y discreto.

---

## 4. Animaciones y microinteracciones (lo que pide el usuario)

Pauta general: **spring/easing orgánico** (nada de `linear`), duraciones cortas (≈150–350ms para microinteracciones, algo más para momentos "héroe"). El movimiento siempre comunica algo. Lista priorizada:

1. **Marcar un hábito (la interacción estrella).** Al tocar la celda del día: relleno orgánico del color del hábito (no un simple cambio de estado), con un pequeño rebote/asentamiento tipo muelle y, opcionalmente, una onda/partículas muy sutiles. Debe sentirse "jugoso" pero milisegundos, no espectáculo.
2. **La hucha llenándose.** Cuando una acción añade dinero, el saldo de la cabecera debe **animar el número** (count-up con desaceleración) y la representación de la hucha (ver §6) debe reaccionar: subida de nivel de líquido con física de fluido suave. Es el momento de recompensa principal; aquí se puede gastar algo más de "presupuesto" de animación.
3. **Penalización.** Cuando se resta, el feedback debe ser claro pero **no humillante**: un descenso suave, quizá un leve tono de aviso, sin sonidos/colores alarmistas. Recordar que el saldo nunca baja de 0.
4. **Transiciones entre pestañas/pantallas.** Continuidad espacial (elementos compartidos que se transforman, p. ej. el saldo de la cabecera "Hoy" hacia la pantalla "Hucha"). Que no haya cortes secos.
5. **Reveal de estadísticas.** Las gráficas y el heatmap se dibujan/entran de forma escalonada al abrir la pantalla (stagger), una vez, con gusto.
6. **Estados de carga/recálculo.** Como la hucha se recalcula del historial, si hay algún instante de cálculo, usar microtransiciones suaves en lugar de spinners bruscos.

**Restricción de calidad:** menos es más. Evitar que cada elemento se mueva; un par de momentos orquestados y memorables valen más que animación dispersa por todas partes (eso delata diseño "auto-generado"). Respetar `prefers-reduced-motion` desactivando los movimientos no esenciales.

---

## 5. Pantallas a diseñar

La app tiene **navegación inferior de 4 pestañas**: **Hoy · Estadísticas · Hucha · Ajustes**. Diseñar todas, más los flujos de crear/editar hábito y el detalle de hábito.

### 5.1 Hoy (pantalla principal)
- **Cabecera con el saldo de la hucha siempre visible** arriba (héroe: cifra grande con la tipografía de display). Debajo, la lista de hábitos.
- **Lista de hábitos estilo Loop Habit Tracker:** cada hábito es una fila → a la izquierda emoji + color + nombre; a la derecha, una **cuadrícula de días en columnas** con sus iniciales (L M X J V S D) mostrando los últimos ~5 días (los visibles en el ancho del móvil). Se **toca la celda de cada día** para marcarlo, sin entrar en el hábito. La cuadrícula se **desplaza horizontalmente** hacia atrás para días antiguos.
  - Booleano: celda = marcado/no marcado; el color del hábito rellena la celda al cumplir.
  - Cuantitativo: la celda **muestra el número** (ej. "6") y un toque permite editarlo; el color indica si llegó al objetivo (p. ej. relleno completo vs parcial).
  - Semanal/mensual: se marca **por día** igual que el diario; en la fila se muestra el **progreso del periodo** (ej. "2/3 esta semana") como resumen discreto.
- Pensar el diseño de la **celda de día** como componente clave y reutilizable (es lo que más se toca en toda la app).

### 5.2 Crear / editar hábito
Formulario claro, paso a paso o en una hoja (bottom sheet) bien jerarquizada. Campos:
- Nombre.
- **Emoji** (selector) y **color** (paleta de colores de hábito).
- **Tipo de registro:** booleano (sí/no) o cuantitativo (número).
- **Periodo:** diario / semanal / mensual.
- **Objetivo:** tipo mínimo o máximo + valor numérico (ej. "mínimo 8", "máximo 5").
- **Fases:** un hábito puede tener varias fases con distinto objetivo y **fecha de inicio** (ej. fase 1 "leer 10 págs", fase 2 "leer 20"). Diseñar cómo se ve y se añade una fase nueva sin que abrume; la fase activa es la más reciente.
- Acciones: guardar; archivar (conserva historial) vs borrar (elimina todo) — **diferenciar visualmente** estas dos para evitar borrados accidentales (borrar pide confirmación destructiva).

### 5.3 Estadísticas
Dos niveles:
- **Global:** evolución de la hucha (gráfica de línea del saldo en el tiempo), % de cumplimiento global, **heatmap global** (estilo "contribuciones de GitHub", intensidad = cuántos hábitos se cumplieron ese día), comparación entre hábitos (ranking/barras por % de cumplimiento, cada barra con el color del hábito) y agregado por color/categoría. **Récords:** racha actual y racha más larga por hábito, % total, € aportado por cada hábito, mejor semana y mejor mes. Diseñar las **tarjetas de récord** como un componente atractivo.
- **Por hábito** (al tocar uno): heatmap del hábito en su color, % de cumplimiento, racha actual y récord, € aportados.
- **Selector de rango temporal** (semana / mes / año) + vista de histórico completo. Diseñar ese selector de forma elegante y no intrusiva.

### 5.4 Hucha
- El **saldo como protagonista absoluto** (cifra enorme, tipografía de display). 
- Una **representación visual de la hucha llenándose** (ver §6) que sea el "signature element" de la app.
- **Histórico de movimientos:** lista de aportaciones/penalizaciones (fecha, hábito con su emoji/color, cantidad con signo, motivo). Limpia y escaneable, números tabulares.

### 5.5 Ajustes
- Parámetros de la hucha: **base** e **incremento** (con explicación breve y, a poder ser, una mini-previsualización de cómo afecta).
- **Exportar** (descarga un backup JSON completo) e **importar** (selecciona un JSON y restaura **reemplazando todo**, con confirmación destructiva).
- Info de la app. (El tema es oscuro fijo en la v1, no hace falta conmutador.)

---

## 6. Signature element: la hucha

Es el elemento que debe hacer memorable la app. Propuesta: una **hucha/recipiente que se llena con un líquido luminoso** cuyo nivel sube con el saldo, con física de fluido suave y un brillo interno que crece con la cantidad. Alternativas válidas si encuentras algo mejor: una forma que acumula "gotas" del color de los hábitos que la han alimentado, de modo que la hucha refleje **de qué** se ha llenado (mezcla de los colores de hábito). Sea cual sea, debe:
- Reaccionar en vivo cuando entra/sale dinero (vínculo directo con marcar hábitos).
- Sentirse premium y orgánica, no un termómetro plano.
- Funcionar bien tanto casi vacía (estado inicial) como muy llena.

Gasta aquí la audacia; mantén el resto de la interfaz disciplinada y silenciosa alrededor.

---

## 7. Estados a no olvidar

- **Primer uso / vacío:** sin hábitos aún. La pantalla "Hoy" vacía debe invitar a crear el primer hábito (copy en la voz de la interfaz, directo, no motivacional cursi). La hucha a 0 debe verse como "lista para llenarse", no triste.
- **Confirmaciones destructivas:** borrar hábito e importar backup. Claras, con la acción nombrada igual que el botón.
- **Accesibilidad mínima:** foco de teclado visible, contraste suficiente del texto sobre el oscuro, objetivos táctiles cómodos, `prefers-reduced-motion` respetado.

---

## 8. Restricciones técnicas (para que el diseño sea construible)

- **PWA móvil**, se implementará en **React**. Pensar a ancho de móvil (~380px) primero.
- **Modo oscuro único** en la v1.
- Sin dependencias de almacenamiento del navegador para el diseño (los datos van en IndexedDB; el diseño no necesita saberlo).
- Entregar idealmente: sistema de tokens (color, tipografía, espaciado, radios), los componentes clave (celda de día, fila de hábito, cabecera de hucha, tarjeta de récord, heatmap, gráfica) y las pantallas de §5, con las animaciones de §4 especificadas o prototipadas.

---

## 9. Qué evitar

- El look genérico "casi negro + un acento ácido y nada más": aquí el color lo ponen los hábitos del usuario; el sistema es neutro cálido con UN acento disciplinado.
- Sobrecargar de animación cada elemento. Dos o tres momentos memorables, el resto quieto.
- Gamificación infantil (insignias chillonas, confeti excesivo). El tono es adulto, calmado y satisfactorio.
- Tipografía neutra por defecto. Las cifras de la hucha merecen una face con carácter.
