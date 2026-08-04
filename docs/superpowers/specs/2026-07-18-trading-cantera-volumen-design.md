# Cantera (buscador por parámetros) + overlay de volumen — trading-analista

> Fecha: 2026-07-18 · Vertical: transversal (finanzas) · Módulo: `@central/module-trading` + `apps/plataforma`
> Extiende: `docs/superpowers/specs/2026-07-17-agente-trading-ibkr-design.md` (Fase 1, paper)

## Problema / motivación
La watchlist es fija (capas A ETFs + B valores conocidos). Alberto pidió un **buscador de acciones
por parámetros** — ejemplo: "una acción a la que le ha entrado **volumen inusual** y que está
**por debajo de su valor**". Es la **capa C / cantera de descubrimiento** que el diseño ya preveía,
pero sin implementar. Además, el volumen no se usaba en ninguna decisión (las velas lo traían pero
se ignoraba), pese a ser una señal clásica de calidad: un movimiento con volumen por encima de la
media es más fiable que uno con volumen flojo.

## Alcance (Fase 1.5, aditivo, sigue siendo SOLO paper)

### A. Overlay de volumen (`packages/module-trading/src/volumen.ts`, puro + tests)
- `rvol(volumenes, ventana=20)` — volumen de la última sesión ÷ media previa (volumen relativo).
- `tendenciaVolumen(volumenes, corta=5, larga=20)` — si el interés crece o se seca.
- `volumenInusual(volumenes, umbral=2)` — pico (rvol ≥ 2).
- `confirmaVolumen(direccion, rvol)` — `confirma | normal | flojo | na`: ¿el volumen acompaña al
  movimiento? El endpoint `/api/trading/analizar` ya devuelve `rvol` + `volConfirma` por idea, de modo
  que una señal alcista con volumen flojo se marca como dudosa (NO cambia la decisión — es lente).

### B. Cantera / screener (`packages/module-trading/src/screener.ts`, puro + tests)
- `infravalorada(f, precio, margen=0.15)` — barata por **descuento vs valor razonable (DCF)** o por
  **múltiplos** (PER < 15 **y** PB < 3).
- `pasaScreener(candidato, criterios)` — aplica solo los criterios presentes (rvol mínimo, PER/PB
  máximos, descuento mínimo vs valor, rango de precio) → `{ pasa, motivos }`.
- `puntuarCandidato` / `rankearCantera` — filtra y ordena por score (premia volumen inusual + descuento).
- Endpoint **`POST /api/trading/screener`** (Bearer `CRON_SECRET`): el agente trae candidatos de FMP
  (screener por volumen/PER/PB + DCF) con el `rvol` calculado por IBKR, y el endpoint los filtra y
  rankea. NO persiste ni opera: los seleccionados pasan al **mismo `/api/trading/analizar`** (torneo +
  barreras + paper).

## De dónde salen los datos
- **Volumen / precios:** IBKR MCP (`get_price_history`). El MCP de IBKR **no tiene scanner de mercado**.
- **Universo + fundamentales (PER, PB, DCF/valor razonable):** **API de FMP (plan free)**, cuyo
  *stock screener* filtra por volumen, market cap, sector, ratios, y expone el **DCF**. Sin FMP, la
  cantera y la estrategia `valor` quedan inertes (degradan, no rompen) — como en la Fase 1 técnica pura.

## Lo que NO se hace (YAGNI / invariante)
- Cero ejecución real: la cantera solo AMPLÍA lo que se estudia en paper. La puerta a Fase 2 no se toca.
- No se cablea un cliente HTTP de FMP en el repo todavía: el contrato es puro (candidatos entran por el
  endpoint). El agente (sesión Claude) es quien llama a FMP y arma el payload. Cuando se decida el plan
  FMP, se añade el cliente + la env `FMP_API_KEY` (fallback `|| ''`, solo rompe la llamada saliente).

## Verificación
- `packages/module-trading`: `node --test test/*.test.ts` → 33/33 (9 nuevos: volumen 4, screener 5).
- `apps/plataforma`: `npx tsc --noEmit` → 0 errores.
- Dry-run real (18/07/2026): sobre 13 símbolos con datos IBKR en vivo, el overlay marcó **NFLX rvol 3,05**
  (104M vs 34M de media, +37% de tendencia) como pico de volumen inusual, y **PLTR rvol 0,66** como señal
  alcista con "volumen flojo (dudoso)". El screener puro filtra/ordena esa lista por los criterios dados.
