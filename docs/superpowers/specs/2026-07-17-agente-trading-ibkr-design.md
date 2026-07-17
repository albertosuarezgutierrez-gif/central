# Agente `trading-analista` — inversión asistida sobre Interactive Brokers

> Fecha: 2026-07-17 · Ámbito: transversal (finanzas del grupo) · Branch: `claude/interactive-brokers-mcp-hbww2h`
> Patrón de referencia: `pricing-agente` de SIVRA (sesión Claude programada, memoria = BD, no la sesión).

## Problema / idea (qué dispara esto)

Alberto tiene cuenta en **Interactive Brokers** y acceso al **MCP oficial de IBKR** (conector de
claude.ai; instalado pero **apagado en el chat** — `enabledInChat: false`). La idea: un agente que
analice el mercado (técnico + fundamental), estudie **qué métodos de inversión son rentables**, aprenda
de su propio track record y, solo cuando lo demuestre, ayude a operar.

**Principio innegociable acordado con Alberto:** el agente **NO tiene autonomía hasta que sea rentable**.
Arranca en **paper trading** (cuenta/cartera simulada), acumula un historial medible, y solo tras cruzar
una **puerta de rentabilidad honesta** se le da ejecución real — y aun entonces, **orden a orden con OK
por Telegram**, nunca solo.

**Verdad de fondo (sin humo):** un LLM no "bate el mercado" por arte de magia. Lo que este agente sí
hace es medible y auditable: emite tesis con razonamiento y confianza, mide después si acertó, y pondera
hacia lo que funciona. Es un **copiloto de decisión que aprende de su historial**, no una máquina de
imprimir dinero.

## Decisiones de alcance (cerradas en el brainstorming)

| Decisión | Elección | Motivo |
|---|---|---|
| Autonomía | Por fases con **puerta de rentabilidad**; Fase 1 = 0 ejecución real | Principio de Alberto |
| Horizonte | **Swing / posición** (días–semanas) | Único horizonte viable por MCP; intradía irreal (latencia LLM) |
| Dónde vive | **Sesión Claude programada** (trigger diario a cierre de mercado) | Es lo único que alcanza el MCP de IBKR (vive en Claude, no en un cron de Vercel) |
| Memoria | **BD compartida** (Supabase), no la sesión efímera | Igual que `pricing-agente` (`pricing_aprendizaje`) |
| Stack de datos | IBKR (gratis) + **FMP free**; extras por interruptor | Arranca a **0 €/mes**; se paga más solo si las métricas lo piden |

## Fases y la 🚪 puerta

- **Fase 1 (este spec)** — Análisis + tesis + **paper trading** con torneo de estrategias. Registra cada
  decisión y mide acierto/rentabilidad en BD. **Cero riesgo, cero ejecución real.**
- **🚪 Puerta** — solo si en paper demuestra **rentabilidad sostenida y honesta** (métricas fuera de
  muestra: P&L, hit-rate, Sharpe por régimen; sin cherry-picking).
- **Fase 2 (spec futuro, NO aquí)** — Ejecución real, **orden a orden con confirmación por Telegram**.

---

## Fase 1 — Arquitectura

Agente programado `trading-analista` (trigger diario ~cierre de mercado US). En cada pasada:

1. **Lee estado** — cartera IBKR (`get_account_positions`, `get_account_balances`, `get_account_summary`)
   + una **watchlist configurable** en BD.
2. **Reúne señales por símbolo** — histórico de precio (`get_price_history` / `get_price_snapshot`) →
   **indicadores técnicos** (SMA/EMA y sus cruces, RSI, MACD, ATR); y **fundamentales** vía FMP (PER,
   deuda/ratios, márgenes, próximos earnings). Noticias/catalizadores por búsqueda web general (sin
   conector de pago en Fase 1).
3. **Torneo de estrategias** — evalúa cada símbolo bajo varias **familias de señal** (ver abajo); cada
   una emite su propia tesis y confianza.
4. **Tesis por símbolo** — dirección (alcista/bajista/neutral), confianza (0–100), horizonte, precio de
   referencia y **rationale**. **No opera nada real.**
5. **Paper trade** — actualiza una **cartera simulada** en BD según las tesis de mayor confianza (reglas
   fijas de tamaño/stop), acumulando P&L.
6. **Persistencia + aviso** — guarda todo en BD y manda a **Telegram** (bot único del monorepo) un
   resumen: las 2–3 ideas de mayor confianza + pulso de la cartera paper.

### Torneo de estrategias (familias de señal)

Cada familia es un "competidor" cuyo rendimiento se mide por separado en BD:

- **Momentum / tendencia** — cruces de medias, rupturas.
- **Reversión a la media** — RSI extremo, bandas de Bollinger.
- **Valor / fundamental** — PER bajo + balance sano (FMP).
- **Catalizador / earnings** — deriva post-resultados, calendario de earnings (FMP).
- *(Fase 2, gated por métricas: sentimiento social — LunarCrush; rotación macro — Oxford.)*

## Fase 1 — El aprendizaje (parte honesta)

- Cada tesis se guarda con su snapshot de señales. Un **segundo pase** (días después, según horizonte de
  la tesis) **puntúa el resultado**: ¿el precio hizo lo que la tesis decía?
- Se agrega por familia de estrategia y **régimen de mercado** → hit-rate, retorno medio, Sharpe.
- Ese track record **se reinyecta en el prompt** de la siguiente pasada ("en cruces de medias tu acierto
  es X%; en RSI extremo Y%"), y el paper-portfolio pondera hacia lo que funciona.

**Regla de diseño innegociable — walk-forward / fuera de muestra:** el agente decide con datos **pasados**
y se mide con datos que **no vio**. Sin esta disciplina el torneo se sobreajusta y el resultado es
autoengaño. Es condición para que la puerta de rentabilidad signifique algo.

## Modelo de datos (BD compartida)

Tablas nuevas (nombres provisionales; schema/rol exacto a confirmar en el plan — la BD es compartida):

- **`trading_watchlist`** — símbolos a vigilar + config (horizonte, activo/inactivo).
- **`trading_tesis`** — una fila por (símbolo, fecha, estrategia): dirección, confianza, horizonte,
  `precio_ref`, `snapshot_senales` (JSON), rationale.
- **`trading_tesis_resultado`** — puntuación posterior: `precio_despues`, ventana, retorno, `acierto`.
- **`trading_paper_ordenes`** / **`trading_paper_posiciones`** — cartera simulada + P&L.
- **`trading_estrategia_stats`** — agregado por estrategia × régimen (hit-rate, retorno, Sharpe).

## Componentes y límites

- **Sesión/trigger del agente** — orquesta la pasada; llama a MCP IBKR + FMP; escribe BD; avisa Telegram.
  Igual filosofía que los agentes programados existentes (memoria en BD, no en la sesión).
- **Lógica pura de indicadores y veredicto** (`lib/…`, testeable sin red/BD) — SMA/EMA/RSI/MACD, tamaño
  de posición paper, puntuación de resultado. Que se pueda testear en aislamiento.
- **Migración BD** — las tablas de arriba.
- **UI (opcional, Fase 1.5)** — tarjeta de "Inversión / paper trading" en `apps/plataforma` (`/finanzas`):
  cartera paper, curva de P&L, ranking de estrategias. Si se hace, **responsive + montaje perezoso**
  (reglas globales del repo) e importes en **formato español** (`eur()` de `apps/plataforma/lib/dinero.ts`).

## Prerrequisitos (de infra, no de código)

- **Encender el MCP de IBKR** en la sesión/chat del agente (hoy `enabledInChat: false`).
- **Conectar FMP** (plan free, 250 llamadas/día) para fundamentales + earnings.
- Datos de mercado IBKR: el **real-time gratis de Cboe One/IEX basta** para swing/EOD (0 €).

## Coste (real, jul-2026)

- **Arranque (Fase 1, paper): 0 €/mes** — IBKR gratis + FMP free.
- Si se queda corto: FMP Starter ~**15 $/mes**. LunarCrush ~**90 $/mes** solo en Fase 2 y **solo si el
  track record demuestra que aporta**.
- Coste oculto real: **tokens de Claude** de la pasada diaria (dentro del plan si es Max).
- Fuentes institucionales (MT Newswires, Morningstar, S&P, Moody's, Oxford) = **precio a medida / caras**
  → descartadas para particular en Fase 1.

## Lo que NO se hace (YAGNI / seguridad)

- **Ninguna ejecución real** en Fase 1 (ni con flags). Eso es Fase 2, con spec propio y OK por orden.
- No se conectan fuentes de pago hasta que las métricas lo justifiquen.
- No se promete rentabilidad: la puerta la decide el track record fuera de muestra, no una corazonada.
- Secretos (API keys) por env / `requireSecret` — **nunca literal en repo** (guardián `regression-secrets`).
  Las API keys de servicios externos pueden caer a `|| ''` (solo rompen la llamada saliente).

## Verificación

- Lógica de indicadores: tests unitarios (una serie conocida → SMA/RSI/MACD esperados).
- Puntuación de resultado: test del caso "tesis alcista + precio subió → acierto" y su contrario.
- Walk-forward: comprobar que la puntuación usa **solo** datos posteriores al `precio_ref`.
- Pasada real en dry-run contra IBKR (con MCP encendido) antes de programar el trigger diario.
- Formato € español y responsive si se añade la tarjeta en `/finanzas`.

## Preguntas abiertas para el plan

1. Schema/rol de Supabase para las tablas `trading_*` (BD compartida — ¿`public`? ¿rol propio?).
2. Watchlist inicial: ¿solo posiciones IBKR actuales, o lista fija de valores/ETFs a vigilar?
3. ¿Se incluye la tarjeta UI en `/finanzas` ya en Fase 1, o el agente arranca "headless" (solo Telegram + BD)?
