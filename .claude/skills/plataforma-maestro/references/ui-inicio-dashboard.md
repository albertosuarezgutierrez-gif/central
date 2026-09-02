# PLATAFORMA — UI: Inicio único, dashboard y sistema de diseño

## 🏠 Inicio único = Resumen + Banca FUSIONADOS (16/07/2026, Fase 2; segmento Fiscal 18/07/2026; segmento Personal 18/07/2026)
Alberto: "Resumen y Banca hacían prácticamente lo mismo". **`/banca` es ahora la home unificada** con un
control segmentado por navegación **`app/(usuario)/banca/SegTabs.tsx`**: **💶 Dinero** (el cuerpo de
banca — saldos + movimientos + IA, segmento por defecto) · **🏢 Negocios** (la foto del holding — negocios
con resultado + consolidado intercompany + Modelo 130 + alertas) · **🧾 Fiscal** (previsión de la
declaración de la renta — `banca/FiscalResumen.tsx`: «Mi declaración» Hoy/Fin de año, Solo yo/Conjunta con
Pilar, palanca de gasto, tramos IRPF; enlace a `/finanzas/fiscal` para detalle+deducciones; `tab==='fiscal'`
en `page.tsx` con carga perezosa, año completo, reusa `getResumenFinanciero`+`calcularEstadoDeclaracion`) ·
**🏠 Personal** (desglose de gasto personal por categoría/comercio — `tab==='personal'` monta **tal cual**
`../finanzas/CategoriasTab.tsx`, sin reimplementar nada; el componente gestiona su propio filtro de fechas).
La fiscalidad había quedado huérfana al fusionar (la radiografía —que tenía la lente fiscal— redirige a
`/banca`); el 3er segmento la reintegra al Inicio, y el 4º (Personal) le da acceso directo a una vista que
ya existía completa en `/finanzas?tab=categorias` pero se había quedado sin entrada en el menú. El contenido de Negocios se **movió** del
antiguo dashboard a **`banca/NegociosResumen.tsx`** (server component autocontenido, `safe()`).
**`dashboard/page.tsx` ya solo REDIRIGE** a `/banca?tab=negocios` (se conserva por ser destino de
login/register y de ~15 `redirect('/dashboard')` de operador). Aterrizajes (`app/page.tsx`/login/register/
CommandPalette) → `/banca`. **Sidebar:** una sola entrada **🏠 Inicio** (`UserSidebar.tsx`, fusiona
Resumen+Banca). **Ficha de movimiento (PR2):** tocar el concepto de una fila del libro (`MovimientosTabla`,
`BancaClient.tsx`) abre un bottom-sheet (negocio/deducible/factura + 🤖 ¿Qué es?). **Chip de negocio en
móvil (05/08/2026, PR #1267):** la fila apilada de `/banca` en ≤768px ocultaba el select de negocio, así
que un gasto ✅ deducible no decía a qué negocio estaba asignado (correduría/pisos/Dúplex) — chip con el
`DESTINO_LABEL` junto al badge ✅, solo en móvil (en escritorio el select ya lo muestra). **Conmutador PEREZOSO por
navegación** (`banca/SegTabs.tsx`, dos `next/link` con prefetch): `page.tsx` ramifica por `?tab` → cada
pestaña computa SOLO sus datos (Dinero no toca el holding y viceversa; sin render-both). Trade-off: cambiar
de pestaña es navegación (no conserva los filtros del libro). ⚠️ La sección de abajo describe el estado
ANTERIOR del dashboard (ya solo redirige); su lógica de widgets vive ahora en `NegociosResumen`.

## 👁️ Botón «ocultar saldo» del Inicio (27/08/2026, PR #1783)
Alberto enseña el panel a gente: junto al **«Saldo total del grupo»** de `/banca` hay un botón 👁/🙈
(`app/(usuario)/banca/SaldoTotal.tsx`, cliente) que **desenfoca** la cifra. Piezas:
- **CSS** `globals.css`: `.saldo-privado` + `html[data-saldo-oculto='1'] .saldo-privado { filter: blur(10px) }`.
  Se desenfoca, NO se sustituye por `••••`: así el bloque no salta de ancho al alternar.
- **Estado**: `localStorage('saldo-oculto')`, y lo aplica el **script anti-parpadeo de `app/layout.tsx`**
  (el mismo del tema) **antes del primer pintado**. Si se aplicara al hidratar, cada recarga enseñaría un
  fotograma con el saldo legible — que es justo lo que hace inútil el botón. Cualquier ampliación futura
  debe mantener esa vía, no un `useEffect`.
- **Alcance actual: SOLO el saldo total** (decisión de Alberto). Extenderlo a los importes de los
  movimientos = añadir la clase `saldo-privado`, sin tocar lógica.
- ⚠️ Ocultación **visual**, no de seguridad: el importe sigue en el HTML servido.

## Home `/dashboard` = RESUMEN de verdad (02/07/2026 — ⚠️ SUPERADO por la fusión del 16/07/2026, ver arriba)
Decisión de Alberto: la home había acumulado 10+ widgets que duplicaban páginas dedicadas
("no mucha información, sino un resumen de mis negocios y cuentas bancarias"). **Todos los
widgets de detalle del PR #523 se ELIMINARON** (incl. `CobrosPisosChart.tsx` y
`EvolucionChart.tsx`, archivos borrados): strip Hoy, Correduría, Apartamentos, Pendiente
cobrar OTA, Top gastos del mes, Reservas ±7d, Comparativa mes vs anterior, Gastos por
categoría. Cada uno vive ahora SOLO en su página dedicada (`/correduria`, `/apartamentos`,
`/finanzas/gastos`, `/sivra/calendario`…).
**Lo que queda** en `app/(usuario)/dashboard/page.tsx` (Server Component): KPI bar
(Ingresos/Resultado/Negocios/Saldo del grupo) · consolidado intercompany (`getConsolidadoIntercompany`,
solo si hay operaciones internas) · aviso Modelo 130 (`getAvisoModelo130`/`getResumenPilar`) ·
`AlertasBanner` (accionables) · **Saldo por cuenta SOLO saldos** (`getCuentasConMovimientos(id, 0)`,
sin movimientos — el detalle vive en `/banca`; excluye `titular='conyuge'` y cuentas ocultas) ·
tarjetas Sociedades+Negocios. El `Promise.all` de datos pasó de 16 fetches a 5.
**⚠️ NO volver a añadir widgets de detalle a la home** — enlazar a la página dedicada en su lugar.
Funciones `lib/banca.ts` sin consumidor tras el recorte (`getCobradoPisos`, `getSerieCobrosPisos`,
`getTopGastosMes`, `getEvolucionMensual`, `getComparativaMensual`, `getGastosPorCategoria`) se
dejaron sin borrar, a la espera de la Fase 2 de des-duplicación (ver `docs/CONTEXTO-SESIONES.md`).
**Icono deducibilidad IRPF en movimientos (PR #655, 02/07/2026):** función pura
`iconoDeducible(destino,importe)` — ✅ (deducible: `seguros`/`turistico_*`/`actividad_pilar`) o
❌ (no deducible: `personal`) en cada gasto de `MovRow`. Ingresos y `traspaso_interno` sin icono.
**LANDMINE (igual que el resto de widgets):** las funciones `getResumen*`/`getAviso*` del dashboard
deben replicar la lógica de las páginas/APIs correspondientes; no simplificar con SQL puro.

## Sistema de diseño — `components/ui.tsx` (02/09/2026; nació como `dashboard/ui.tsx` el 02/07/2026)

🚨 **Se MOVIÓ y se AMPLIÓ.** Vivía en `app/(usuario)/dashboard/ui.tsx`, pero `/dashboard` acabó siendo una
página que solo redirige a `/banca`: el sistema de diseño colgaba de una ruta muerta. Y al auditarlo el
02/09/2026, **NINGÚN archivo lo importaba** — existía como documento, no como código, mientras las pantallas
se escribían con ~4.900 `style={{}}` a mano y 223 verdes/rojos en hex fijo (ilegibles en oscuro). Ahora vive
en **`apps/plataforma/components/ui.tsx`** (`@/components/ui`) y `/banca` es su implementación de referencia.

**Primitivas nuevas** (además de las de abajo): `Pagina` (ancho por tipo de contenido: `lectura` 960 /
`tabla` 1400 — sustituye al `maxWidth:'960px'` copiado en 14 páginas) · `PageHeader` · `KpiCard` (icono en
pastilla tintada) · `Badge` · `btnStyle`/`BtnLink` (se exporta el ESTILO, no un componente con `onClick`:
el archivo es server-safe y un handler obligaría a `'use client'` en cada consumidor) · `TablaScroll` ·
`colorImporte` · y **`Dato`/`Pendiente`**, que son los tres estados de un valor.

**`Dato` — la regla del NULL, por construcción.** La regla raíz «dato que NO hay ≠ dato que NO se ha
mirado» se cumplía por VIGILANCIA. La lógica pura vive en **`lib/dato.ts`** (`estadoDato`, `esPendiente`,
`colorImporte`) con guardián en `test/regression-dato-tres-estados.test.ts`: `null`/`undefined` =
«pendiente» · `[]`/`''` = «revisado, no hay» · **el `0` es un VALOR** (el error simétrico, el que aparece al
arreglar el primero: «0 €» es una afirmación legítima que alguien comprobó). `Pendiente` lo pinta con borde
**discontinuo** si se rellenará y **continuo** si la fuente no lo va a traer nunca.

**CSS fuera de las páginas:** el padding responsive de `.pagina` y la cabecera `.page-header` viven en
`globals.css`. Un estilo inline no admite media queries, y ese era justo el motivo de que 47 páginas
acabaran con un bloque `<style>{`…`}</style>` incrustado (201 `!important` entre todas).

### Lo que ya había (sigue vigente)
Primitivas Tremor-look compartidas y **server-safe** (sin hooks): `cardStyle`, `CardHeader`, `Stat`
(con `DeltaBadge` ▲/▼), `ThinBar`, `BarListRow`, `LegendDot`, `EMERALD`/`ROSE`. Patrón a copiar
al tocar cualquier otra página de plataforma. Va con una pasada transversal de identidad visual:
**Inter** vía `next/font` (`var(--font-inter)`), **tokens semánticos** (`--positive/--negative/--warning/--info`
+ variantes `-bg`, cero hex inline), **modo oscuro SOLO A MANO** (ver 🚨 justo debajo). Recharts adaptado por CSS
(`.recharts-cartesian-grid line` / `.recharts-cartesian-axis-tick text`) para que la rejilla siga
los tokens en oscuro. **plataforma NO usa Tailwind** (CSS vars) — este sistema es propio, no Tremor
copy-paste; sivra/ialimp/rrhh/ia-rest sí tienen Tailwind y ahí Tremor entraría literal. Adopción por
goteo: traer el patrón cuando una pantalla lo necesite, no migrar todo de golpe.

🚨 **CORREGIDO el 02/09/2026 — este documento describía el modo oscuro AL REVÉS, y describía justo el bug.**
Decía «modo oscuro automático (`prefers-color-scheme: dark`)» y un toggle de TRES estados
«🌗 Auto → ☀️ Claro → 🌙 Oscuro». Las dos cosas son falsas desde el **PR #707 (03/07/2026)**, y lo que
describía es exactamente la causa del fallo que Alberto reportó con captura: el ahorro de batería del móvil
ponía el sistema en oscuro y **el panel se oscurecía solo**. Medido contra el código el 02/09/2026:
- `grep prefers-color-scheme apps/plataforma/app/globals.css` → **cero coincidencias**.
- `:root` lleva **`color-scheme: only light`** (el `only` VETA además el oscurecimiento forzado de
  Chrome/Samsung Internet con batería baja); el bloque oscuro vive solo en `[data-theme="dark"]`.
- `ThemeToggle.tsx` es **BINARIO**: `type Tema = 'light' | 'dark'`, sin ningún estado «Auto».
⚠️ **NO reintroducir un modo que siga al sistema ni media queries de `prefers-color-scheme`**: fue la causa
del bug. Y la lección de método: **una skill puede contradecir al `CLAUDE.md` de su propia app durante dos
meses sin que nada falle** — ni `tsc` ni los tests leen prosa. Antes de dar por buena una afirmación de este
documento sobre comportamiento, cotéjala con el código (un `grep` basta).

## El CUERPO del Inicio, migrado (02/09/2026, PR #2024)

El lote #2011→#2018 tocó el **chrome** de `/banca` (pestañas, migas, ancho, cabecera del libro) y Alberto
respondió **«no está terminado, ¿no?»**. Tenía razón: **el cuerpo de la página no lo tocó nadie**, y el
cuerpo es lo que se ve al abrir. Su captura además iba desplazada hacia abajo — el sidebar es fijo, así que
las pestañas nuevas quedaban por encima del recorte.

🚨 **El defecto de fondo, que ya se había cometido una vez el MISMO día:** #2011 diagnosticó que el
`ui.tsx` viejo «existía como documento, no como código» porque nadie lo importaba… y publicó cuatro
primitivas nuevas (`PageHeader`, `KpiCard`, `Badge`, `btnStyle`) **también sin ningún consumidor**. Por eso
Alberto no vio ni un píxel de cambio. Medido antes de #2024: **7 primitivas a cero consumidores**, y
`ResumenPeriodo.tsx` con su propia `card`, su propio `Kpi` y su propio `<style>` incrustado.

**Estado tras #2024** (`/banca` sigue siendo la implementación de referencia):
- Usan el sistema: `banca/ResumenPeriodo.tsx`, `banca/NegociosResumen.tsx`, `banca/page.tsx`.
- `IntervaloSelector.tsx` (compartido con `/finanzas`): segmentado + chips ligeros en vez de quince
  pastillas con borde. Un control de navegación no puede pesar como el contenido que filtra.
- Rejillas (`.bk-kpis`, `.bk-neg`, `.bk-graf`, `.neg-grid`) en `globals.css`. Los `!important` que
  llevaban solo existían para ganarle al estilo EN LÍNEA; sin él, sobran.
- `DeltaBadge` con `bueno`: colorea por **significado**, no por signo (gastar menos = verde).

🚨 **Una exención del guardián de tokens puede llevar un motivo FALSO y sobrevivir POR ESO.** Las barras del
`ComposedChart` estaban exentas de `test/regression-tokens-color.test.ts` con el motivo escrito «son series
de recharts, no estados». Falso: **ingreso y gasto SON el par semántico**, y el hex no cambiaba en modo
oscuro. Sobrevivió al barrido de ~734 hex precisamente porque su justificación tenía buena pinta.
Convertidas a `var(--positive)`/`var(--negative)` y exención retirada; la dona sí sigue en paleta
CATEGÓRICA (ahí el motivo se sostiene: teñir una categoría de rojo diría que ese gasto está mal).

⏸️ **PENDIENTE DE DECISIÓN DE ALBERTO — no lo resuelvas por tu cuenta:**
1. **`PageHeader`, `BtnLink`, `BarListRow`, `ThinBar` y `LegendDot` siguen a CERO consumidores.** NO se
   enchufaron a la fuerza: hacerlo sería repetir el defecto que este lote arregla. En `/banca` el hueco de
   `PageHeader` ya lo ocupan las migas + el saldo con su botón 👁, y forzarlo empeoraría la pantalla.
   O se usan donde encajen de verdad, o se borran.
2. **`banca/page.tsx:221` pinta «último mov. ninguno» sobre un `ultimoMov` NULL** (`lib/psd2-estado.ts`):
   un «no se ha podido leer» servido como afirmación, contra la regla del NULL. Sin tocar porque cambia un
   texto que Alberto lee a diario.

⚠️ **Ninguna de estas pantallas se ha visto renderizada** (las apps llevan `--sin-previews` y la sesión no
tiene navegador): alineaciones y espaciados están razonados sobre el código, no medidos.

<!-- verificado: 2026-09-02 -->
