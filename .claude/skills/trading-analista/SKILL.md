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

## Descubrimiento autónomo / cantera (capa C) — el agente busca solo dónde invertir
Además de la watchlist fija (A+B), el agente **explora el mercado por su cuenta** y propone valores
nuevos para estudiar (siempre en paper). Fases de una pasada de descubrimiento:
1. **Explora temas con IBKR** (`search_investment_topics` → `get_theme_details`): sectores/tendencias
   (Nuclear, Quantum, Defensa, Robótica…) → empresas centrales con `contract_id`. Cada una nace con
   `fuentes: ['tema:<nombre>']`.
2. **Enriquecer con FMP** (plan FREE, host `/stable`): `POST {PLATAFORMA_URL}/api/trading/fmp` con
   `{ simbolos: [...] }` (Bearer `CRON_SECRET`) — pásale los símbolos que sacaste de los TEMAS de IBKR y los
   enriquece con la **cotización gratis** (`/stable/quote`): precio, **posición en el rango de 52 semanas**
   (`posRango52`, proxy libre de "por debajo de valor": 0 = pegado a mínimos anuales = barata) y **tendencia**
   por medias 50/200. Devuelve `Candidato[]` con `fuentes:['fmp:quote']`. ⚠️ **El screener por parámetros
   NO está en el plan Free** (`/api/v3` es legacy muerto; `/stable/company-screener` es de pago): si mandas
   `{ criterios }` el endpoint responde `total:0` con nota. Los fundamentales (PER/PB/DCF) se piden best-effort
   y degradan a vacío si el plan no los cubre. Requiere `FMP_API_KEY` + `FMP_API_VER=stable` en Vercel
   plataforma (sin key → `disponible:false`, la cantera cae a solo temas+volumen). Alternativa: el agente
   llama a `/stable/quote` por WebFetch con su propia key.
3. Por candidato, con IBKR: `get_price_history` → **rvol** (volumen hoy vs media) y
   `get_price_snapshot` (`historical_vol`) → **`volAnual`** (volatilidad anualizada, el RIESGO del
   nombre). Un pico de volumen añade `fuentes: ['volumen']`.
4. `POST {PLATAFORMA_URL}/api/trading/descubrir` con `{ candidatos: [...], criterios: { maxVolAnual, rvolMin, maxPosRango52, perMax, descuentoMinVsValor } }`
   (en Free, `maxPosRango52` p.ej. 0.5 es el filtro de "barata" utilizable; `perMax`/`descuentoMinVsValor` solo si el plan trae fundamentales)
   (Bearer `CRON_SECRET`). Funde por símbolo (coincidir en varias fuentes = mejor lead), **descarta la
   lotería** (por defecto `maxVolAnual: 0.8` — la lección de la cartera real: los nombres de vol 90%+
   AI/growth fueron los que más daño hicieron) y ordena por score. Devuelve la `seleccion`.
5. Los seleccionados entran al **mismo `/api/trading/analizar`** (torneo + barreras + paper) igual que
   la watchlist. El overlay de **volumen** (rvol + confirmación) viaja en la respuesta de `/analizar`
   y marca las señales con volumen flojo como dudosas.

> **Autonomía = DESCUBRIR, no ejecutar.** El agente decide SOLO qué estudiar (temas, screener, volumen),
> pero la operativa sigue siendo 100% paper hasta la puerta de rentabilidad. Nunca órdenes reales.

`/api/trading/screener` sigue disponible para el filtrado simple de una lista ya montada; `/descubrir`
es el flujo autónomo multi-fuente con dedup + guarda de volatilidad.

## Fuentes / envs (solo nombres)
- MCP: Interactive Brokers (debe estar ENCENDIDO en el chat/sesión del agente), FMP (opcional Fase 1,
  necesario para la cantera y para la estrategia `valor`).
- Endpoints: `PLATAFORMA_URL` + `CRON_SECRET` (nunca literal en el prompt del trigger — pásalo por env).
- Telegram: bot único del monorepo (`@central/core-telegram`).

## Puerta a Fase 2
No proponer ejecución real hasta que `trading_estrategia_stats` muestre rentabilidad sostenida y FUERA
DE MUESTRA (walk-forward). Esa decisión es de Alberto y tendrá su propio spec. Hasta entonces: solo paper.
