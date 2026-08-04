# Retrovisor del radar: backtest punto-en-el-tiempo + gurús bajo la lupa (SOLO paper)

**Fecha:** 2026-07-19 · **Aprobado por:** Alberto ("lo veo bien, así comparar con la acumulación
de datos y los gurús actuales, e ir viendo por qué los gurús se posicionan en esas empresas")

## Problema
El radar (PR #1017) acaba de nacer: su track record honesto (forward) tarda semanas/meses en
acumularse. Alberto quiere una señal ANTES: ¿el modelo de factores habría batido a SPY estos
últimos 2 años? Y entender el pilar gurús: ¿las posiciones de convicción de Dataroma puntúan
alto en el modelo (calidad/valor/momentum) o los gurús ven algo que los ratios no capturan?

## Qué es (y qué NO es)
- **Backtest INDICATIVO**, bien etiquetado: solo factores (sin gurús — Dataroma no da histórico
  de carteras), punto-en-el-tiempo estricto con la fecha `filed` real de cada 10-K (sin
  look-ahead). **NO sustituye al forward**: la decisión de dinero real sigue dependiendo SOLO
  del track record forward (mediana, sostenido, por cohortes).
- **NO toca las tablas honestas** (`trading_ranking`, `trading_paper_track`): los datos van a
  una tabla propia `trading_backtest`.

## Diseño
**Recolección (Vercel, donde hay red):** ruta `/api/cron/trading-backtest` (Bearer
`CRON_SECRET`, manual — NO entra en los crons de vercel.json):
- `?accion=lote` (default): siembra `trading_backtest` con los símbolos de `trading_universo`
  + `SPY`, procesa los ~40 más rancios: 1 companyfacts (por CIK) + 1 histórico de precios
  (~34 meses, Stooq→Yahoo **con fechas**). Por cada **fecha de snapshot** (día 1 de cada mes,
  desde hace 24 meses hasta hace ~14 semanas): factores conocidos EN ESA FECHA (piotroski,
  roic, EY, momentum 12-1, precio) usando SOLO los FY con `filed <= fecha`, y retornos
  forward a 28/56/91 días. Se guarda `datos.porFecha` (jsonb pequeño) por símbolo.
- `?accion=gurus`: convicciones actuales de Dataroma (GESTORES_DEFECTO) cruzadas con los
  factores actuales de la caché → fila especial `simbolo='_GURUS_'` (la radiografía "por qué
  compran lo que compran").

**Punto-en-el-tiempo sin duplicar parsers:** nueva función pura `recortarFactsHasta(cf, fecha)`
en `edgar.ts` filtra el companyfacts a los puntos con `filed <= fecha`; después se reutiliza
`extraerFundamentales` tal cual. Nuevo `puntosDiarios` en `precios-stooq.ts` (variante con
fechas de `cierresDiarios`, mismo fallback Stooq→Yahoo).

**Disparo:** workflow `trading-backtest.yml` (workflow_dispatch, mismos secrets que
`trading-warmup.yml`), inputs `lotes` (default 14) y `gurus` (si/no). Secuenciado DESPUÉS del
warmup (no solapar contra la SEC).

**Análisis (sesión Claude, local):** los datos se leen por Supabase MCP y el ranking/agregado
se calcula localmente reutilizando `rankearFactores` del módulo (mismo blend que el radar).
Informe en `docs/TRADING-RETROVISOR-2026-07.md`: por fecha de snapshot, top-10 vs SPY por
MEDIANA en 28/56/91d; % de ventanas batidas; drawdown de la estrategia mensual; y la lupa de
gurús (perfil de factores de cada posición de convicción, qué explica el modelo y qué no).

## Criterio de éxito
Alberto puede leer HOY: "el top-10 por factores batió a SPY por mediana en X de Y ventanas
(28/56/91d) en 2024-2026, con drawdown Z" + una tabla de convicciones de gurús con su
radiografía de factores. Todo etiquetado como indicativo; el forward sigue mandando.

## Tests
Puros con `node --test --experimental-strip-types`: `recortarFactsHasta` (excluye filed
posterior), `fechasSnapshot` (mensuales, tope hoy−98d), `retornosForward` (usa el primer
cierre ≥ fecha objetivo; null si se sale de la serie), `puntosDiarios` parse con fechas.
