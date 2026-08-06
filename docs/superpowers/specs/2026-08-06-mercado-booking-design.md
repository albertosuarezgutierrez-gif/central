# Mercado real por fecha para SIVRA — rutina de Booking → `market_rates`

**Fecha:** 06/08/2026 · **Decisión de:** Alberto ("lo que veas mejor y más completo, no podemos fallar")

## El problema

El barrido automático de comparables (`/api/sivra/mercado/sweep`, búsqueda web vía Serper) quedó
mecánicamente **perfecto** tras los PRs #1227/#1241/#1253/#1255: la pasada del 06/08 cubrió el plan
entero (120/120 ventanas, ronda base completa, 339 comps, 0 errores). Y aun así su latido sigue —
correctamente — en rojo, porque el gate de «medianas clonadas» detecta que el corpus no describe
temporada.

Auditado el corpus del 06/08, la causa no es el código: **los precios que devuelven los snippets de
búsqueda son de anuncio y vienen SIN fecha.** Cada comparable sale al mismo precio en todos los meses
(Vincci ≈305€, Smartr ≈93€, Genteel ≈259€ en agosto, noviembre y marzo por igual).

Contrastado el mismo día contra el conector de Booking, para el Dúplex (aforo 4):

| Ventana | Serper (lo que usa el motor) | Booking real | Desvío |
|---|---|---|---|
| Viernes 4-sep-2026 | **p50 171€** (bucket del mes, elegible) | **p50 129€** (10 comps, 98-177) | **+33%** |
| Noviembre 2026 | 305€ | ~160€/noche | +90% |
| Feria (16-abr-2027) | — | 344-838€/noche | — |

Serper no solo es plano: es plano **y alto** (recoge anuncios/hoteles caros sin fecha). El motor
tarifica septiembre entero con 171€ de referencia contra un mercado de 129€.

## Decisión

Booking pasa a ser la fuente del corpus **por fecha**; Serper queda para retirar. En **dos fases**,
porque el orden importa: hoy TODO el corpus por piso (`scenario LIKE 'prop_%'`) lo escribe solo el
sweep (el cron diario escribe `scenario='normal'`), y el motor tiene `MAX_MARKET_AGE_DAYS = 7`.
Apagar Serper antes de que Booking alimente dejaría el pricing ciego en una semana.

### Fase 1 (este PR)

| Pieza | Qué es | Por qué |
|---|---|---|
| `market_rates.fuente` | Columna `serper` \| `booking_mcp` \| `manual`, `DEFAULT 'serper'` | Los tres caminos de escritura ponían `portal='booking'` y eran indistinguibles. Sin marca no se puede medir cobertura fiable, ni retirar una fuente sin heurísticas de fechas. El default conservador marca como no fiable todo lo anterior. |
| `GET /api/sivra/mercado/plan` | Devuelve las N ventanas (fecha × aforo) más urgentes, con sus pisos | El plan de fechas sigue viviendo en `ventanasDelBarrido` (una sola fuente). Si estuviera en el prompt de la rutina, divergiría al primer cambio. |
| `lib/sivra/mercado-cobertura.ts` | Helper PURO: `ventanasQuePedir` + `detalleIngesta`/`ingestaFiable` | La urgencia se decide con lógica testeable, no en un prompt. `FUENTES_FIABLES` excluye `serper` a propósito. |
| `POST /api/sivra/mercado/ingest` | Acepta y valida `fuente` | Una fuente desconocida se rechaza en vez de colarse como fiable. En conflicto, la medición real **pisa** el precio de anuncio del mismo día. |
| `POST /api/internal/latido` | Huella para agentes que son RUTINAS, con allowlist | El vigía solo sabía de crons: una rutina que dejara de dispararse no encendía ninguna luz (el agujero de `facturas-scan` antes del 30/07). |
| `sivra_mercado_booking` en el vigía | Entrada + sonda, umbral 30 h | Igual que los demás: `ultimo_ok_at` manda, y el detalle dice qué mitad falló. |
| Skill `mercado-booking` | Manual de la rutina diaria | Con la trampa de unidad en grande: `price.book` es el TOTAL de la estancia, no la noche. |

**Prioridad de las ventanas** (en `ventanasQuePedir`): nunca medida antes que vieja → entre vírgenes
manda la ronda (base → evento → profundidad) → a igualdad, la fecha más cercana. Así la rutina no
necesita recordar por dónde iba: si una pasada se corta, la siguiente retoma lo más urgente sola.

**Cadencia:** diaria, 12 ventanas de ~96. La cobertura se acumula (el motor mira 120 días atrás), así
que el plan entero se cubre en 3-4 pasadas y luego se auto-refresca por antigüedad.

### Fase 2 (cuando Booking tenga ≥3 fechas por mes, verificado)

1. Retirar `/api/sivra/mercado/sweep` de `CRON_JOBS` (ahorra ~120 búsquedas de pago al día).
2. Neutralizar las filas `fuente='serper'` de fechas lejanas para que el motor deje de tarificar
   meses con precios de anuncio.
3. Retirar el latido `sivra_mercado_sweep`.

**Gate explícito:** el bucket mensual del motor exige ≥3 fechas distintas por mes. Hoy septiembre
tiene 3 fechas de Serper y 1 de Booking: si se neutralizara Serper ahora, el bucket dejaría de ser
elegible y el motor caería al ancla global. La fase 2 no se ejecuta antes de comprobarlo por mes.

**Actualización tras #1282 (mismo día, otro carril):** la columna `market_rates.corpus_clonado` y los
dos filtros `AND NOT m.corpus_clonado` de `pricing/apply` **ya adelantan el punto 2 para las pasadas
NUEVAS**: el sweep marca su propia pasada cuando la guardia de medianas clonadas salta, así que desde
el 05/08 sus filas (401 filas / 30 fechas) no entran en el bucket por mes ni en el de fecha exacta.
Lo que sigue pendiente en la fase 2, comprobado en BD el 06/08:
- **1.466 filas `serper` anteriores al 05/08 (55 fechas) siguen sin marcar** y sí alimentan el bucket
  mensual (su ventana es de 120 días de `search_date`, no de 7). Son las que hay que neutralizar.
- **El ancla global NO se filtra a propósito** (decisión de #1282: ahí el mercado de hoy es el dato
  correcto), así que retirar el sweep del `CRON_JOBS` sigue dejando el ancla sin fuente diaria mientras
  Booking no cubra el calendario. El gate de ≥3 fechas/mes con `fuente='booking_mcp'` se mantiene tal cual.

## Lo que queda fuera (YAGNI)

- **Filtrar por `fuente` en el motor.** Tocar las 3 consultas de `pricing/apply` es más riesgo que
  neutralizar las filas malas en la fase 2, y el resultado es el mismo. *(Superado en parte por #1282:
  el motor sí filtra ya por `corpus_clonado` en los buckets por mes y por fecha — pero por «pasada que
  la guardia declaró clonada», no por `fuente`. Las dos columnas conviven: `corpus_clonado` es el
  veredicto de una pasada, `fuente` es la procedencia de la fila.)*
- **Otros portales** (Expedia, Trivago): el conector de Booking ya cubre el mercado de referencia de
  los 4 pisos. Añadir fuentes multiplica ventanas sin mejorar la señal de temporada.
- **Que la rutina decida precios.** Eso es del agente de pricing, por los raíles de
  `aplicar-propuesta` (suelo de coste, tope ±%/día, circuit-breaker).

## Verificación hecha (con datos reales, no fixtures)

1. Migración aplicada en la BD compartida; cobertura fiable de partida = 0 (conservador).
2. Ventana real medida con el conector (4-6 sep, aforo 4): 10 comparables, p50 **129€/noche**.
3. Escritos con el SQL exacto del `ingest` (`fuente='booking_mcp'`) → la consulta de cobertura del
   endpoint `/plan` los ve: `2026-09-04 · 4p · 10 comps · medida hoy`.
4. Bucket mensual del motor para 2026-09 (query real de `pricing/apply`): solo-Serper **171€** ·
   solo-Booking **129€** · mezclado 142€.
5. Priorización con la cobertura real: el plan siguiente **no repite** la ventana recién medida y
   sigue por los otros aforos de esa fecha y por octubre/noviembre (ronda base primero).
6. `tsc` 0 · tests `node --test` (13 nuevos del helper) · `next build` OK.

**Sin probar hasta la primera pasada real de la rutina:** el transporte HTTP con `ALERTA_TOKEN` (el
contenedor de la sesión no tiene el token; la prueba de datos se hizo por Supabase MCP con el mismo
SQL). Lo valida la primera ejecución, y su latido lo delata si falla.
