# TRADING-SETUP — activar el agente de inversión (Fase 1, SOLO paper)

> Guía de puesta en marcha del agente `trading-analista`. **Todo es simulado (paper): ninguna orden
> real en Interactive Brokers.** La puerta a operar de verdad no se abre hasta que
> `trading_estrategia_stats` muestre rentabilidad sostenida FUERA DE MUESTRA (walk-forward). Es un
> laboratorio: se ve crecer en la pantalla `/trading` (*Mi negocio → 📈 Inversión*).

## Qué está ya en producción (PRs #974 + #979)
- Módulo puro `@central/module-trading`: indicadores (SMA/EMA/RSI/MACD/ATR/**ADX**), estrategias
  (momentum/reversión/valor/catalizador) + **torneo**, barreras de riesgo (concentración 20%, no
  promediar perdedores, límite de ops, **guarda de earnings**), volumen (`rvol`), cantera
  (`screener`/`descubrir` con guarda anti-lotería `maxVolAnual`), señales de mercado
  (`posicionRango52`, `tendenciaMedias`, `fuerzaRelativa`, **rotación sectorial**), y **backtest**
  walk-forward por símbolo.
- Endpoints en `apps/plataforma`: `/api/trading/{analizar,puntuar,screener,descubrir,fmp}`.
- Cliente FMP (plan Free, host `/stable`): `fmpQuote`/`fmpEnriquecer`/`fmpProximoEarnings`.
- Pantalla `/trading` + onboarding.

## Paso 1 — Conectar FMP (~2 min)
1. `financialmodelingprep.com` → Dashboard → copia tu **API key**.
2. Vercel → proyecto **plataforma** → **Settings → Environment Variables** → añade:
   - `FMP_API_KEY` = *(tu key)*
   - `FMP_API_VER` = `stable`   *(la cuenta nueva usa el host `/stable`; `api/v3` es legacy muerto)*
   - Entorno: **Production** (+ Preview si quieres probarlo en ramas).
3. **Redeploy** de plataforma para que tome las envs.
4. Comprobación: `POST /api/trading/fmp { "simbolos":["AAPL"] }` (Bearer `CRON_SECRET`) ya no
   responde `disponible:false`.
5. (Opcional) Confirmar si el Free cubre fundamentales:
   `https://financialmodelingprep.com/stable/ratios-ttm?symbol=AAPL&apikey=TU_KEY` y
   `.../stable/discounted-cash-flow?symbol=AAPL&apikey=TU_KEY`. Si devuelven PER/PB y `dcf`, el
   agente puntúa además por múltiplos y valor razonable; si dicen "Restricted", se queda con
   `posRango52` (proxy libre de "por debajo de valor"). **No hace falta compartir la key para esto.**

## Paso 2 — Trigger nocturno (sesión de Claude programada)
Es una **sesión de Claude**, NO un cron de Vercel: necesita el **MCP de Interactive Brokers ENCENDIDO**
y cargar la skill `trading-analista`.
- **Cadencia sugerida:** tras el cierre USA, p.ej. `30 23 * * 1-5` (madrugada de Madrid).
- **Requisitos de la sesión:** MCP de IBKR activo; `PLATAFORMA_URL` + `CRON_SECRET` disponibles como
  env (NUNCA en el texto del prompt).
- **Prompt del trigger:**

```
Eres el agente trading-analista (Fase 1, SOLO paper). Carga la skill `trading-analista` y haz UNA
pasada completa. Regla de oro: NUNCA ejecutes órdenes reales en IBKR (prohibido
create_order_instruction / delete_order_instruction); solo lectura + los endpoints de plataforma.
CRON_SECRET va por env, no lo escribas.

Pasos:
1. NAV: get_account_summary.
2. Watchlist (A/B) + DESCUBRIMIENTO (capa C): explora 3-4 temas con IBKR
   (search_investment_topics → get_theme_details), enriquece con FMP
   (POST {PLATAFORMA_URL}/api/trading/fmp { simbolos:[...] }), y baja los ETFs sectoriales
   (XLK/XLE/XLF/XLV/XLI/XLU/XLY/XLP/XLB/XLRE/XLC) para la rotación sectorial.
3. Por símbolo: get_price_history (diario ~130 velas) + get_price_snapshot → rvol, volAnual,
   posRango52, ADX; fuerza relativa vs SPY; inclinación por sector.
4. POST {PLATAFORMA_URL}/api/trading/descubrir { candidatos, criterios:{maxVolAnual:0.8,
   maxPosRango52:0.5, rvolMin:1.5} } → selección.
5. POST {PLATAFORMA_URL}/api/trading/analizar { fecha, nav, simbolos:[...] } (con
   fundamentales.proximoEarnings si FMP lo da) → torneo + barreras + paper.
6. POST {PLATAFORMA_URL}/api/trading/puntuar → walk-forward de las tesis vivas.
7. Resumen por Telegram: top ideas + pulso de la cartera paper. Importes en formato español.
   Todo queda visible en /trading. NINGUNA orden real.
```

## Paso 3 — La prueba de fuego (cuando IBKR esté en vivo)
Backtest de las decisiones del agente contra las **operaciones reales** (`get_account_trades`) del
año: ¿habría ganado o perdido frente a lo que se hizo? Es el juez definitivo antes de plantear Fase 2.

## Recordatorio honesto
El backtest walk-forward ya indica que **hoy NO es rentable** (probado sobre 6 meses reales de
ISRG/CEG/UEC/SYM: retornos negativos). La pasada nocturna sirve para **acumular historial y medir**
(pantalla `/trading` → rendimiento por estrategia), no para fiarse todavía. Cero autonomía real hasta
que sea rentable fuera de muestra.
