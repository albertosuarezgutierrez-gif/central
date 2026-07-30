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
`BancaClient.tsx`) abre un bottom-sheet (negocio/deducible/factura + 🤖 ¿Qué es?). **Conmutador PEREZOSO por
navegación** (`banca/SegTabs.tsx`, dos `next/link` con prefetch): `page.tsx` ramifica por `?tab` → cada
pestaña computa SOLO sus datos (Dinero no toca el holding y viceversa; sin render-both). Trade-off: cambiar
de pestaña es navegación (no conserva los filtros del libro). ⚠️ La sección de abajo describe el estado
ANTERIOR del dashboard (ya solo redirige); su lógica de widgets vive ahora en `NegociosResumen`.

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

## Sistema de diseño "paquete moderno" — `dashboard/ui.tsx` (02/07/2026)
Primitivas Tremor-look compartidas y **server-safe** (sin hooks): `cardStyle`, `CardHeader`, `Stat`
(con `DeltaBadge` ▲/▼), `ThinBar`, `BarListRow`, `LegendDot`, `EMERALD`/`ROSE`. Patrón a copiar
al tocar cualquier otra página de plataforma. Va con una pasada transversal de identidad visual:
**Inter** vía `next/font` (`var(--font-inter)`), **tokens semánticos** (`--positive/--negative/--warning/--info`
+ variantes `-bg`, cero hex inline), **modo oscuro automático** (`prefers-color-scheme: dark` +
`ThemeToggle.tsx` en el pie del sidebar — 🌗 Auto → ☀️ Claro → 🌙 Oscuro, `localStorage('theme')` +
`html[data-theme]`, script anti-parpadeo en `layout.tsx`) y **veto al oscurecimiento forzado del
navegador** (`[data-theme="light"] { color-scheme: only light }` — sin esto, Chrome/Samsung Internet
en ahorro de batería repintan a oscuro aunque el usuario elija Claro). Recharts adaptado por CSS
(`.recharts-cartesian-grid line` / `.recharts-cartesian-axis-tick text`) para que la rejilla siga
los tokens en oscuro. **plataforma NO usa Tailwind** (CSS vars) — este sistema es propio, no Tremor
copy-paste; sivra/ialimp/rrhh/ia-rest sí tienen Tailwind y ahí Tremor entraría literal. Adopción por
goteo: traer el patrón cuando una pantalla lo necesite, no migrar todo de golpe.

<!-- verificado: 2026-07-29 -->

