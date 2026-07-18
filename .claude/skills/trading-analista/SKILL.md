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
1. Leer NAV: `get_account_summary` → `net_liquidation` (EUR). **Empújalo también a la vista 💶 Dinero**
   de plataforma para que el saldo del bróker salga como una tarjeta más (junto a BBVA/Kutxabank) y sume
   al «Saldo total del grupo»: `POST {PLATAFORMA_URL}/api/trading/saldo` con `{ saldo: <net_liquidation>,
   divisa: 'EUR' }` (Bearer `ALERTA_TOKEN`). La app en Vercel no habla con IBKR, así que este empujón del
   agente es la ÚNICA vía por la que ese saldo se refresca. Es solo lectura de IBKR → no rompe la regla de oro.
2. Cargar la watchlist activa (tabla `trading_watchlist`, capas A/B/C; ver spec). En Fase 1 la lista
   inicial se siembra con `apps/plataforma/prisma/sql/trading_watchlist_seed.sql`.
3. Por símbolo: `get_price_history` (diario, ~120 velas) → mapear a `Vela[]`
   (`{ fecha, apertura, alto, bajo, cierre, volumen }`); si FMP está conectado, traer
   PER/deuda/margen/próximo earnings → `Fundamentales`.
4. `POST {PLATAFORMA_URL}/api/trading/analizar` con `{ fecha, nav, simbolos: [...] }`
   (Bearer `ALERTA_TOKEN`). Devuelve el `top` de ideas.
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
   `{ simbolos: [...] }` (Bearer `ALERTA_TOKEN`) — pásale los símbolos que sacaste de los TEMAS de IBKR y los
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
   (Bearer `ALERTA_TOKEN`). Funde por símbolo (coincidir en varias fuentes = mejor lead), **descarta la
   lotería** (por defecto `maxVolAnual: 0.8` — la lección de la cartera real: los nombres de vol 90%+
   AI/growth fueron los que más daño hicieron) y ordena por score. Devuelve la `seleccion`.
5. Los seleccionados entran al **mismo `/api/trading/analizar`** (torneo + barreras + paper) igual que
   la watchlist. El overlay de **volumen** (rvol + confirmación) viaja en la respuesta de `/analizar`
   y marca las señales con volumen flojo como dudosas.

> **Autonomía = DESCUBRIR, no ejecutar.** El agente decide SOLO qué estudiar (temas, screener, volumen),
> pero la operativa sigue siendo 100% paper hasta la puerta de rentabilidad. Nunca órdenes reales.

## Señales y barreras (lo que refina el torneo)
- **ADX (fuerza de tendencia)** — `indicadoresDe` calcula `adx14` (Wilder, ≥25 = tendencia fuerte, ≥20 = suelo
  operable). Dos usos: (1) el **momentum SOLO opera con ADX≥20** — por debajo (o sin ADX en series cortas) es
  ruido lateral y `evaluarMomentum` devuelve neutral (el cruce EMA/MACD es casi la misma condición y disparaba
  entradas de baja calidad); (2) la **reversión NO fadea una tendencia fuerte** (RSI extremo + ADX≥25 = cuchillo
  cayendo → neutral, la lección de ISRG). Con ADX≥20 el momentum sube confianza a 78 si además ADX≥25.
- **Gate de tendencia de fondo (SMA50)** — `bajoTendencia(precio, sma50)` **veta abrir cualquier largo por
  debajo de la SMA50**: comprar "barato" en un valor que baja de forma persistente (la reversión sobre UEC,
  −41% en el backtest) es el patrón que más pierde. Actúa en `/api/trading/analizar` (barrera) y en el backtest
  (filtro de entrada). Junto al suelo de ADX del momentum, estos dos gates llevaron el backtest de −52% a
  breakeven — **medido, no supuesto** (`backtestSimbolo` compara siempre contra buy-and-hold: `retornoBuyHoldPct`
  + `baten`; `backtestOOS` valida fuera de muestra). Batir a comprar-y-mantener es la vara, no el signo del retorno.
- **Guarda de earnings** — `/api/trading/analizar` **veta abrir un largo si los resultados caen dentro de 3
  días** (`earningsInminente`): el gap puede saltarse el stop. Puebla `fundamentales.proximoEarnings` desde FMP
  (`fmpProximoEarnings`, best-effort) para que actúe; sin fecha, no veta (degrada).
- **Fuerza relativa vs índice** — `fuerzaRelativa(cierresActivo, cierresSPY)` (baja SPY de IBKR): en un mercado
  que cae, prefiere lo que aguanta mejor. Úsala para ordenar la cantera.
- **Régimen de mercado (SPY>SMA200)** — `regimenMercado(cierresSPY)`: si el índice está risk-off (bajo su
  SMA200), `/api/trading/analizar` **veta abrir cualquier largo nuevo** ('régimen bajista'). Pásale el SPY en
  `indice:{cierres}` (el mismo que ya bajas para la fuerza relativa); sin él, degrada a risk-on. Es el filtro que
  más drawdown quita de un long-only.
- **Bucle de aprendizaje** — `/api/trading/analizar` lee `trading_estrategia_stats` y **modula la confianza de
  cada estrategia por su rendimiento real** (`ajustesDeStats` → `torneo(…, ajustes)`): sube lo que acierta, baja
  lo que falla, acotado a ±20 y SOLO con muestra suficiente (≥20 resultados; sin historial no toca nada). Cierra
  el lazo medir→decidir.
- **Barrera de sobre-operar** — `superaLimiteOps` recibe las ops REALES por nombre de los últimos 30 días
  (`trading_paper_orden`), no un 0 fijo.
- **Rotación sectorial** — `rankearSectores([{nombre, cierres}])` ordena los sectores por momentum; baja de IBKR
  los ETFs sectoriales (XLK tech, XLE energía, XLF banca, XLV salud, XLI industria, XLU utilities, XLY consumo,
  XLP básico, XLB materiales, XLRE inmobiliario, XLC comunicación) y pásalos como `cierres`. `inclinacionSector(sectorDelCandidato, ranking)`
  devuelve +1 (líder), −1 (rezagado en negativo) o 0 → súmalo al score de la cantera: "barata **Y** en un sector
  que sube" > "solo barata". El sector del candidato viene del tema IBKR o del `sector` de FMP.

`/api/trading/screener` sigue disponible para el filtrado simple de una lista ya montada; `/descubrir`
es el flujo autónomo multi-fuente con dedup + guarda de volatilidad.

## Backtest y evaluación honesta (medir antes de fiarse)
- `backtestSimbolo(velas, {trailing?, horizonteDias?, atrMult?})` — walk-forward por símbolo. Reporta
  **`retornoBuyHoldPct` + `baten`**: batir a comprar-y-mantener es la vara, no el signo del retorno. `trailing:true`
  usa stop de arrastre (chandelier) para no cortar las ganadoras tan pronto.
- `backtestOOS(velas)` — parte el histórico en dos y corre cada mitad: si el borde solo aparece "en muestra", es
  sobreajuste.
- `backtestCartera(activos, {navInicial, riesgoPct, maxPeso, indiceCierres?})` — varios nombres compiten por el
  MISMO capital (sizing al 1%, tope 20%, sin apalancar, filtro de régimen opcional). Devuelve la curva de equity y
  el **`maxDrawdownPct`** — la métrica que de verdad decide la puerta a Fase 2. Sobre 6m reales el sistema queda
  PLANO a nivel cartera (≈0% con drawdown bajo): las cifras por-símbolo sobreestiman al asumir 100% invertido.
- **Pendiente clave:** un backtest con **2 años y ~20 nombres que incluyan ganadores** (SPY/AAPL/MSFT…) para
  calibrar/validar sin el sesgo de universo. Necesita bajar ese histórico de IBKR.

## Fuentes / envs (solo nombres)
- MCP: Interactive Brokers (debe estar ENCENDIDO en el chat/sesión del agente), FMP (opcional Fase 1,
  necesario para la cantera y para la estrategia `valor`).
- Endpoints: `PLATAFORMA_URL` + **`ALERTA_TOKEN`** (token DEDICADO de bajo privilegio; los endpoints
  `/api/trading/*` lo aceptan vía `isRoutineAuthorized`). Se usa `ALERTA_TOKEN` en vez del `CRON_SECRET`
  maestro **a propósito**: el entorno de la rutina de Claude Code es de texto plano visible («no metas
  secretos»), así que la rutina solo lleva el token de bajo privilegio (si se filtra: empujar un saldo o
  disparar una pasada paper — nunca dinero real). `CRON_SECRET` sigue valiendo por compatibilidad.
  Ambos, nunca literal en el prompt del trigger — pásalos por env.
- Telegram: bot único del monorepo (`@central/core-telegram`).

## Puerta a Fase 2
No proponer ejecución real hasta que `trading_estrategia_stats` muestre rentabilidad sostenida y FUERA
DE MUESTRA (walk-forward). Esa decisión es de Alberto y tendrá su propio spec. Hasta entonces: solo paper.
