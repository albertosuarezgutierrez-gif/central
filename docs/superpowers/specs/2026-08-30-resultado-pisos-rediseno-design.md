# Rediseño `/sivra/resultado-pisos` — rendimiento, previsiones y seguimiento (30/08/2026)

Aprobado por Alberto (30/08/2026, preguntas en sesión). La página pasa de «P&L de UN mes»
a cuadro de rendimiento de los pisos con intervalo de fechas, previsión y seguimiento.

## Decisiones de Alberto
- **Previsión = confirmado + estimado, SIEMPRE por separado** (nunca fusionados en un solo número).
- **Seguimiento de previsiones**: guardar cada previsión y contrastarla contra lo real cuando el
  mes cierra — objetivo: saber si sirve como previsión de tesorería.
- **Una sola página con selector de intervalo** (patrón /banca), no pestañas.
- **Comparativa interanual** en KPIs y gráficas.
- **Extras aprobados**: ritmo de reservas (pace), mix de canales y comisiones, cancelaciones del
  periodo, heatmap de estacionalidad, alerta Telegram de previsión floja, export CSV.

## Arquitectura

### Rango (granularidad = MES, deliberado)
El P&L es de **caja del mes** (`getPLMensual`: lavandería repartida por mes, facturas de Sique
Brilla por caja). Un rango por días partiría gastos mensuales y mentiría → el selector va de mes
a mes (presets: mes / trimestre / año / últimos 12 meses / rango libre), estado en la URL
(`?desde=YYYY-MM&hasta=YYYY-MM&piso=`). Tope 24 meses por petición.

- `lib/sivra/pl-rango-logica.ts` (PURO, testeado): `mesesDelRango`, `agregarPisos`,
  `variacionPct` (null cuando no hay base — nunca un 0 inventado).
- `lib/sivra/pl-rango.ts` (BD): `getPLRango(desde,hasta)` = `getPLMensual` por mes con
  concurrencia acotada + agregado + mismo rango del año anterior (solo agregado).
- `GET /api/sivra/pl-rango` (sesión). La página conserva la tabla actual (agregada al rango) y el
  desglose de limpieza SOLO en vista de un mes (es específico del mes).

### Previsión (mes en curso + 2 siguientes, por piso)
- **Confirmado** = `incomes` con check-in en el mes futuro (dinero apalabrado, medido).
- **Estimado adicional** = `max(0, ingresos del MISMO mes del año anterior − confirmado)`,
  etiquetado «si repites el año pasado». **Sin base histórica → `null` = «sin base»**, jamás 0.
- **Gastos previstos** = media de los últimos 3 meses CERRADOS del piso (método declarado en UI).
- `lib/sivra/prevision-logica.ts` (PURO, testeado) + `lib/sivra/prevision-pisos.ts` (BD).

### Pace (ritmo de reservas)
`incomes.reserved_at` (fecha REAL de reserva, la rellena el sync de Smoobu). Para el mes M:
confirmado HOY vs lo que había confirmado en la misma fecha relativa del año pasado para M−12
(`reserved_at <= hoy − 1 año`). Las reservas del año pasado con `reserved_at` NULL se CUENTAN y
se declaran («N reservas sin fecha de reserva conocida») — excluirlas en silencio infravalora la
base y el pace saldría engañosamente bueno.

### Seguimiento de previsiones
- Tabla nueva **`pisos_previsiones`** (`prisma/sql/2026-08-30_pisos_previsiones.sql`):
  `(fecha snapshot, mes, property_id, confirmado, estimado, gastos_estimados)`,
  `UNIQUE(fecha, mes, property_id)`.
- Cron diario **`/api/cron/prevision-pisos`** (fila en `CRON_JOBS`, ~05:50 UTC): snapshot de mes
  en curso + 2 siguientes; latido `sivra_prevision` (`AGENTES_VIGILADOS` + `PROBES` en el mismo
  PR — landmine 16/08).
- UI «Seguimiento»: para meses cerrados con snapshot, previsto (último snapshot ANTES de empezar
  el mes) vs real, con desviación %. Sin snapshots previos al estreno: se declara «sin registro
  antes del 30/08/2026», no «acertó/falló».

### Alerta Telegram «previsión floja»
En el cron: para el mes SIGUIENTE, a 28–32 días de su inicio, si confirmado < 40% del total real
del mismo mes del año anterior (y ese total ≥ 500€), un aviso con ambos números (Alberto juzga).
Dedupe en `pisos_previsiones_avisos (mes, property_id, tipo)` — una vez por mes y piso. Umbral
heurístico v1; cuando los snapshots acumulen un año, el pace histórico propio lo sustituirá.

### Canales y cancelaciones
- Canales: `incomes` GROUP BY `portal` en el rango; **comisión = `amount_gross − amount` REAL**
  (donde gross exista; filas sin gross → «comisión no consta», no 0).
- Cancelaciones: `reservas_canceladas` en el rango; `amount_gross`/`nights` NULL se cuentan
  aparte. Si el rango empieza antes del 12/08/2026 se declara «registro solo desde 12/08/2026».

### Heatmap estacionalidad
Piso × mes (24 meses) con margen coloreado. Endpoint propio perezoso (`/api/sivra/pl-heatmap`,
caché en memoria 1h) — se monta solo al abrir su `<details>` (regla de rendimiento UI).

### Gráficas (Recharts, patrón `banca/ResumenPeriodo.tsx`)
Evolución mensual ingresos/gastos/resultado + línea año anterior atenuada · barras por piso ·
dona de gastos por categoría · previsión con confirmado sólido / estimado atenuado.

## Reglas que aplican
`eur()` en todo importe · responsive ≥320px · tres estados (null ≠ 0) en toda columna derivada ·
la lógica de titulares en helpers puros testeados, no en el JSX.
