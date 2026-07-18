---
name: trading-analista
description: Pasada diaria del agente de inversión sobre Interactive Brokers (Fase 1, SOLO paper). Lee cartera + watchlist, tira precios (IBKR) y fundamentales (FMP) por MCP, llama a /api/trading/analizar y /api/trading/puntuar de plataforma, y resume por Telegram. NUNCA ejecuta órdenes reales.
---

# Trading-analista (Fase 1 · paper)

## Regla de oro
NO ejecutar NINGUNA orden real en IBKR. Solo lectura (get_account_*, get_price_history,
get_price_snapshot, get_watchlist) y llamadas a los endpoints de plataforma. La operativa es 100%
simulada en BD. Esta invariante protege todo lo demás: si dudas, no operas.

## Pasada (orden exacto)
1. Leer NAV: `get_account_summary` → `net_liquidation` (EUR).
2. Cargar la watchlist activa (tabla `trading_watchlist`, capas A/B/C; ver spec). En Fase 1 la lista
   inicial se siembra con `apps/plataforma/prisma/sql/trading_watchlist_seed.sql`.
3. Por símbolo: `get_price_history` (diario, ~120 velas) → mapear a `Vela[]`
   (`{ fecha, apertura, alto, bajo, cierre, volumen }`); si FMP está conectado, traer
   PER/deuda/margen/próximo earnings → `Fundamentales`.
4. `POST {PLATAFORMA_URL}/api/trading/analizar` con `{ fecha, nav, simbolos: [...] }`
   (Bearer `CRON_SECRET`). Devuelve el `top` de ideas.
5. `POST {PLATAFORMA_URL}/api/trading/puntuar` con `{ hoy, precios }` (snapshot de cada símbolo con
   posición/tesis viva). Puntúa walk-forward, actualiza stats y aplica stops paper.
6. Enviar por Telegram el resumen (usa `resumenPasada(...)` de `apps/plataforma/lib/trading-notify.ts`
   o deja que plataforma lo mande): top ideas + pulso de la cartera paper. Importes en formato español.

## Cantera / buscador por parámetros (capa C · opcional)
Además de la watchlist fija (A+B), la CANTERA descubre valores fuera de ella por parámetros
—p.ej. **volumen inusual** (rvol ≥ 2) y/o **cotizando por debajo de su valor** (PER/PB bajos o
descuento vs valor razonable/DCF):
1. Trae candidatos del **screener de FMP** (plan free): filtra por volumen, precio, sector, PER/PB,
   y su endpoint de **DCF (valor razonable)**. Añade el **rvol** con IBKR (`get_price_history` →
   volumen de hoy vs media).
2. `POST {PLATAFORMA_URL}/api/trading/screener` con `{ candidatos: [...], criterios: { rvolMin, perMax, pbMax, descuentoMinVsValor } }`
   (Bearer `CRON_SECRET`) → devuelve la `seleccion` ordenada.
3. Los seleccionados entran al **mismo `/api/trading/analizar`** (torneo + barreras + paper). Cero
   autonomía: se estudian igual que la watchlist. El overlay de **volumen** (rvol + confirmación)
   ya viaja en la respuesta de `/analizar` para marcar señales con volumen flojo como dudosas.

## Fuentes / envs (solo nombres)
- MCP: Interactive Brokers (debe estar ENCENDIDO en el chat/sesión del agente), FMP (opcional Fase 1,
  necesario para la cantera y para la estrategia `valor`).
- Endpoints: `PLATAFORMA_URL` + `CRON_SECRET` (nunca literal en el prompt del trigger — pásalo por env).
- Telegram: bot único del monorepo (`@central/core-telegram`).

## Puerta a Fase 2
No proponer ejecución real hasta que `trading_estrategia_stats` muestre rentabilidad sostenida y FUERA
DE MUESTRA (walk-forward). Esa decisión es de Alberto y tendrá su propio spec. Hasta entonces: solo paper.
