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

## Fuentes / envs (solo nombres)
- MCP: Interactive Brokers (debe estar ENCENDIDO en el chat/sesión del agente), FMP (opcional Fase 1).
- Endpoints: `PLATAFORMA_URL` + `CRON_SECRET` (nunca literal en el prompt del trigger — pásalo por env).
- Telegram: bot único del monorepo (`@central/core-telegram`).

## Puerta a Fase 2
No proponer ejecución real hasta que `trading_estrategia_stats` muestre rentabilidad sostenida y FUERA
DE MUESTRA (walk-forward). Esa decisión es de Alberto y tendrá su propio spec. Hasta entonces: solo paper.
