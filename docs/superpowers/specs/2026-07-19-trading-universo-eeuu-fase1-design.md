# Trading Fase 1 — Radar del universo EEUU (S&P 500) · diseño

**Fecha:** 19/07/2026 · **Estado:** aprobado por Alberto (brainstorming en sesión) · **Ámbito:** SOLO paper

## Objetivo

Ampliar el análisis del agente de trading de una watchlist de 13 nombres a **las ~500 mayores
empresas de EEUU**, rankeadas por el motor de selección que ya existe (calidad fundamental +
convicción de gurús), con el técnico SOLO como confirmación de timing. Alberto ve el resultado
en `/trading` y recibe un digest semanal por Telegram, **con medición honesta de la calidad de
las señales**. Todo con fuentes gratis (SEC EDGAR, Stooq→Yahoo, Dataroma). Cero órdenes reales.

**Principio rector (lección del backtest −52%):** la SELECCIÓN decide QUÉ comprar
(fundamentales/calidad/gurús); los indicadores técnicos solo el CUÁNDO. Nunca al revés.

## Decisiones de requisitos (con Alberto, 19/07/2026)

| Decisión | Elección |
|---|---|
| Salida | **D** — tabla en `/trading` + digest Telegram (estar al día de la evolución) |
| Calidad de señales | **A+B+C ligero** — etiqueta por pick + track record del sistema (la estrella) + salud de datos |
| Universo | **S&P 500-ish** (~550 mayores por capitalización); Russell 1000 = Fase 1.5 |
| Cadencia | **Semanal (lunes)**; avisos intra-semana por cambio material = mejora futura |
| Presentación | **Ticker + NOMBRE de la empresa** en tabla, UI y digest (`MSFT — Microsoft Corp`) |

Sobre tamaño vs rentabilidad (conversado): la prima de tamaño en bruto es débil; lo que funciona
es pequeñas+calidad. Escalera: S&P 500 (datos fiables, error barato) → Russell 1000 con la misma
puerta de calidad → global (Fase 2, requiere datos de pago, solo si el forward paper valida).

## Arquitectura (enfoque elegido: caché incremental en BD)

```
CRON DIARIO (cada 6h, lotes ~50)             CRON SEMANAL (lunes 09:00 UTC)
SEC EDGAR + precios (Stooq→Yahoo)            ranking desde caché (sin llamar a la SEC
   ──► tabla trading_universo          ───►  ni bajar 500 series de precios)
(fundamentales + precio/momentum             + técnico SOLO top-20 (Stooq→Yahoo)
 digeridos por símbolo)
                                             + cruce gurús (Dataroma)
                                             + track record de snapshots pasados vs SPY
                                             ──► snapshot en trading_ranking
                                             ──► digest Telegram (tras él, 10:00, el del forward paper)
                                                        │
                                    /trading · sección "🌎 Radar del mercado (S&P 500)"
```

Enfoques descartados: big-bang semanal (frágil: 500 companyfacts de varios MB en una función;
un timeout tira la pasada) y orquestación desde la rutina Claude (quema tokens en trabajo de
cron, no persiste → sin track record).

### Universo (lista de las ~500)
- Fuente primaria: `company_tickers.json` de la SEC (ya lo consumimos en `edgar.ts::mapaTickers`),
  que viene ~ordenado por capitalización y trae `ticker` + `title` (nombre) + CIK. Se toman los
  primeros ~550 y se filtran duplicados/clases.
- ⚠️ El orden por capitalización es una propiedad NO documentada → **lista semilla commiteada**
  en el repo como respaldo (si el archivo cambia de forma, el cron degrada a la semilla y avisa).
- Nota honesta: esto da "las ~500 mayores de EEUU", no la membresía oficial del índice S&P 500.
  Para nuestro propósito es equivalente o mejor, y gratis.

### Ritmo y límites (SEC + precios)
- Por símbolo y ciclo, el refresco hace **2 fetches**: (1) `companyfacts` de la SEC
  (fundamentales) y (2) **el histórico diario de Stooq→Yahoo en UNA petición** (el CSV de Stooq
  trae toda la serie) → de ahí salen precio actual, `momentum12_1` y los inputs de valoración.
  Así el lunes NO hay que bajar 500 series: el score entero sale de la caché.
- Rate limit SEC ~10 req/s; vamos a ~4 req/s, lotes de ~50 símbolos (~100 fetches/pasada),
  los de `actualizado_en` más antiguo primero → universo completo renovado cada ~2-3 días
  (los fundamentales cambian trimestralmente y un precio de hace 2 días vale para ratios de
  valoración; el técnico del top-20 sí usa precios frescos del lunes). `User-Agent` con
  contacto ya configurado (`SEC_UA`).
- Un fallo de símbolo se anota y no rompe el lote. Backoff si la SEC devuelve 403/429.

## Componentes

### `@central/module-trading` (puro, `node --test`)
- `universo.ts` (nuevo):
  - `rankearUniverso(empresas, opts)` — combina las piezas YA existentes (`piotroskiFScore`,
    ROIC, earnings yield/fórmula mágica, momentum vía `rankearFactores`) en un score por
    símbolo; devuelve lista rankeada con los componentes desglosados.
  - `etiquetaCalidad(item)` — **fuerte / media / débil** por regla pura: completitud+frescura de
    datos, fuerza del score, confirmaciones (gurú/técnico). Débil si faltan datos o están rancios.
  - `diffRanking(anterior, actual)` — entradas/salidas del top (para el digest y, en el futuro,
    los avisos por cambio material).
  - `resumenTrackRecord(evaluaciones)` — agrega las evaluaciones de snapshots pasados
    (mediana, aciertos, alpha) en el resumen que va al digest/UI.
- Reutiliza sin tocar: `evaluarCestaVsBench`, `metricasRiesgoCesta`, indicadores técnicos.

### `apps/plataforma` (IO)
- **Tabla `trading_universo`** (Prisma `TradingUniverso` + migración SQL, RLS como trading_*):
  `simbolo` (unique), `cik`, **`nombre`**, `sector?` (SIC de EDGAR si disponible), `piotroski`,
  `roic`, `earningsYield?` (EBIT/EV con EV = mktCap + deuda − caja), `momentum?` (12-1 desde el
  histórico cacheado), `precio?`, `mktCap?` (precio × acciones en circulación del companyfacts),
  `datos` jsonb (inputs crudos), `fuenteFecha` (cierre fiscal del dato), `precioFecha?`,
  `actualizadoEn`, `error?` (último fallo de fetch).
- **Tabla `trading_ranking`** (snapshots semanales): `fecha` (unique), `entries` jsonb (top-N
  rankeado con componentes, nombre, etiqueta, badges), `universoTotal`, `conDatos`, `createdAt`.
  Idempotente por fecha (re-ejecutar el cron no duplica).
- **Cron `/api/cron/trading-universo`** (`20 */6 * * *`, auth `CRON_SECRET`): refresca el
  siguiente lote de ~50 símbolos (upsert en `trading_universo`).
- **Cron `/api/cron/trading-ranking`** (`0 9 * * 1`, auth `CRON_SECRET`): lee caché → rankea →
  técnico del top-20 → cruce gurús → evalúa track record de los snapshots de hace ~4/~8/~13
  semanas (top-10 de cada uno + SPY vía `cierresDiarios` — coste acotado ≤ ~30 símbolos) →
  persiste snapshot → digest Telegram. `maxDuration 300`.
- **`/trading`** — nueva sección **"🌎 Radar del mercado (S&P 500)"** (server component, patrón
  de la sección 🧪): tabla top-20 con `TICKER — Nombre`, score, Piotroski, ROIC, badges
  🏆 (gurús) / 📈 (señal técnica), etiqueta de calidad; bloque de track record; línea de salud de
  datos. Estado vacío explicativo hasta el primer snapshot. Responsive (scroll horizontal).
- **Cohortes:** a partir de la cohorte de agosto, el congelado (flujo manual actual vía
  `/api/trading/seleccion`) usa este universo amplio como cantera en vez de la watchlist de 13.
  `/seleccion` gana un modo `universo:'sp500'` que lee la caché (sin más cambios de contrato).

### Digest Telegram (lunes, formato)
```
🌎 Radar del mercado — S&P 500 (SOLO paper)
Top 10: 1. MSFT — Microsoft Corp · score 8,2 · 🏆📈 · fuerte …
Cambios: entra NVDA — NVIDIA Corp · sale DAL — Delta Air Lines
Track record: picks de hace 8 semanas → mediana +X% vs SPY +Y% (baten 6/10)
Salud de datos: 94% del universo fresco (<30 días) · 3 símbolos con error
```
Las primeras semanas el track record dice "acumulando historial" (sin humo). Precios en USD
con formato es-ES (el helper `eur()` queda reservado a €, convención de `/trading`).

## Calidad de las señales (detalle)

1. **Por pick (A):** etiqueta fuerte/media/débil — regla pura y testeada, visible en tabla y digest.
2. **Del sistema (B) — la métrica que manda:** cada snapshot es una predicción fechada; el cron
   la evalúa a ~4/~8/~13 semanas vista contra el SPY con el MISMO motor del forward paper
   (mediana, no media; aciertos/N). Es walk-forward real: la predicción quedó congelada antes.
3. **De los datos (C ligero):** % de universo fresco, símbolos con error, fuente de precios caída.
   Si la cobertura de la caché < 50%, el cron **avisa en vez de rankear** con datos flojos.

## Errores
- Fetch por símbolo: best-effort, error anotado en la fila, el lote sigue.
- Ranking sin datos suficientes → digest de aviso, no ranking falso.
- Telegram best-effort (`.catch`), como el resto del monorepo.
- `company_tickers.json` con forma inesperada → degradar a la lista semilla + aviso en digest.

## Testing
- Puro (módulo): `rankearUniverso`, `etiquetaCalidad`, `diffRanking`, `resumenTrackRecord`.
- `lib/trading`: extensión del parser de EDGAR (nombre/sector/shares si aplica) con fixtures.
- `tsc --noEmit` 0 · `next build` OK · crons probables por POST manual con Bearer.

## Invariantes
SOLO paper; endpoints/crons de solo lectura+medición; NUNCA herramientas de orden de IBKR;
dinero real solo tras batir al SPY hacia delante, sostenido y ajustado a riesgo. Sin secretos
en repo/prompts.

## Fuera de alcance (fases siguientes)
- **Fase 1.5:** Russell 1000 (subir el corte del universo; misma puerta de calidad).
- **Avisos por cambio material** entre semana (umbral calibrado con datos reales).
- **Fase 2 global** (Europa/Asia): requiere datos de pago (EODHD por MCP) — decisión aplazada,
  solo si el forward paper valida el edge (disparadores anotados en memoria 18/07/2026).
