# Trading — Fase B: batir al mercado por SELECCIÓN (no por timing)

> **Estado:** spec / diseño (18/07/2026). **SOLO paper, cero dinero real** hasta que el sistema
> demuestre —FUERA DE MUESTRA— que bate al mercado. La decisión de poner dinero real es de Alberto y
> tendrá su propio corte. Este doc NO cambia la regla de oro: el agente NUNCA ejecuta órdenes reales en
> IBKR (jamás `create_order_instruction`/`delete_order_instruction`); solo lectura + endpoints de plataforma.

## 0. Por qué existe esta fase (el hallazgo medido)

La Fase 1 (sistema **técnico**: momentum + reversión con gates ADX/SMA50, régimen, trailing) se validó
con **datos reales de 2 años de IBKR** sobre 7 valores + SPY. Veredicto **medido, no supuesto**:

| Métrica | Sistema técnico | Comprar-y-mantener | 
|---|---:|---:|
| Cartera (7 nombres, capital compartido, tope 20%) | **+13,7%** (maxDD 6,1%) | **+38,4%** (cesta equiponderada) |
| Referencia índice | — | SPY +30,1% |
| Nombres que baten a buy&hold (por símbolo) | **1 de 8** (COST, por poco) | — |

Fuera de muestra el patrón es demoledor: los nombres que brillan en la 1ª mitad se hunden en la 2ª
(NVDA +32,5%→−11%, META +12,5%→−11,5%) o al revés (GOOGL −5,8%→+25,8%). **Eso es azar, no habilidad.**
El *timing* técnico destruye retorno vs simplemente comprar buenas empresas y aguantar (deja ~8.300€
sobre la mesa en 2 años sobre un NAV de 33.658€). Su única virtud —drawdown bajo— no es la vara: **la
vara es batir al mercado**, y no lo hace.

**Conclusión que funda la Fase B:** el camino para batir al mercado **no es el gráfico, es la selección**
— elegir *qué* comprar (calidad + valor + a quién sigue el dinero inteligente), no *cuándo*. La
diversificación pasiva de calidad ya bate al SPY en la muestra; el reto es elegir la cesta con ventaja.

## 1. Objetivo y vara de éxito (no negociable)

- **Objetivo:** batir al mercado (SPY total return) de forma **sostenida y FUERA DE MUESTRA**.
- **Benchmark único:** SPY buy&hold en el mismo periodo. Un retorno positivo que NO bate al SPY es un
  fracaso (podríamos haber comprado el índice y listo).
- **Métrica de riesgo secundaria:** max drawdown y volatilidad — desempatan entre estrategias que baten,
  no sustituyen a batir.
- **Puerta a dinero real:** solo cuando la cartera modelo bata al SPY en walk-forward OOS con costes
  realistas durante una ventana suficiente. Primera prueba real = "un poco de dinero" (decisión de Alberto).

## 2. Las estrategias de SELECCIÓN (todas se validan igual de duro)

Cada una produce un **ranking de candidatos**; la cartera se arma con los mejores, equiponderada o con
sizing controlado, y se rebalancea con baja frecuencia (trimestral/semestral — el trading frecuente fue
justo lo que perdió).

1. **Factores (value + quality + momentum de 12 meses).** El núcleo académico robusto:
   - *Value:* EV/EBIT, P/B, FCF yield, shareholder yield (dividendos + recompras − dilución).
   - *Quality:* ROIC, margen estable, poca deuda, **Piotroski F-score** (9 puntos de salud contable),
     **magic formula** (Greenblatt: ROIC alto + earnings yield alto).
   - *Momentum:* retorno 12−1 meses (el momentum de PRECIO a medio plazo sí tiene prima; el intradía/técnico no).
   - Se combinan en un score compuesto (z-scores por factor, media). Cesta = top decil, rebalanceo trimestral.
2. **Clonar a grandes inversores (13F público).** Los fondos >100M$ publican sus posiciones cada trimestre
   (formulario 13F ante la SEC, con ~45 días de retraso). Seguir las **altas convicción / nuevas compras**
   de gestores value probados (Buffett/Berkshire, Pabrai, Greenblatt, etc.). Fuente cruda: **EDGAR** (SEC,
   gratis) o **Dataroma** (agrega los value investors, gratis). El retraso de 45 días importa poco para
   tesis de años.
3. **Compras de insiders (Form 4).** Cuando los directivos compran con su dinero (no ventas rutinarias por
   opciones), es señal. EDGAR Form 4, gratis. Overlay que sube score, no estrategia sola.
4. **Baja volatilidad / calidad defensiva.** La anomalía de baja-vol: acciones aburridas y estables baten
   ajustadas por riesgo. Útil para la pata defensiva de la cartera.

> Estas patas **se combinan** (una acción barata + de calidad + que Buffett acaba de ampliar + con compra
> de insider = lead fortísimo), no compiten. El agente las funde por símbolo como ya hace `/descubrir`.

## 3. Dónde encajan los GRÁFICOS y el análisis técnico (contestando a Alberto)

**Sí está contemplado, pero en su sitio correcto: como overlay de *timing* secundario sobre una selección
ya buena, NUNCA como señal primaria.** Figuras (taza-con-asa, cuña ascendente/descendente, banderas,
soportes/resistencias) y los indicadores actuales (ADX, SMA50/200, RSI) sirven para **afinar el momento de
entrada de un valor que la selección ya aprobó** — p.ej. no comprar un valor de calidad justo cuando pierde
su SMA200. Lo que la Fase 1 demostró es que el gráfico **por sí solo no elige ganadores**; degradarlo a
"cuándo entro en lo que ya decidí comprar" es coherente con la evidencia. Reglas:
- El técnico **nunca añade un nombre** que la selección no haya rankeado alto.
- El técnico **solo puede retrasar/escalonar** una compra ya decidida, o marcar una salida por deterioro
  estructural (rotura de tendencia de fondo). No hace trading de vaivén.
- Las figuras (cup-and-handle, cuñas) se implementan como detectores puros y testeados en `@central/module-trading`,
  y su efecto sobre el retorno se **mide** antes de fiarse (igual que todo lo demás).

## 4. Datos — GRATIS primero, PAGO solo cuando seamos rentables

Orden de Alberto: "primero configurar bien lo gratis y para ser más certeros contratar eso". Plan:

| Necesidad | Gratis (Fase B v1) | Pago (cuando el paper bata al mercado) |
|---|---|---|
| Precios históricos | IBKR `get_price_history` (2 años, ya probado) | Sharadar SEP (survivorship-bias-free, point-in-time) |
| Fundamentales | FMP plan Free (`/stable/quote`, best-effort) + EDGAR (10-K/10-Q XBRL) | **Sharadar SF1** (fundamentales point-in-time, sin sesgo de supervivencia) |
| 13F gurús | EDGAR 13F-HR + **Dataroma** (agregado) | — (gratis basta) |
| Insiders | EDGAR Form 4 | — |
| Búsqueda/relleno cualitativo | **`lib/websearch.ts::buscarWeb`** (Gemini grounding gratis + plugin web de OpenRouter de reserva) — corre desde el egress de Vercel | — |

> **Sesgo de supervivencia = el enemigo nº1 de un backtest de selección.** Un universo que solo contiene
> las empresas que HOY existen infla cualquier estrategia (los quebrados desaparecen). Por eso el salto de
> calidad de verdad (y el gasto) es **Sharadar** (universo point-in-time, incluye delistadas). Hasta
> entonces, la validación gratis se hace consciente de su límite y NO se sobre-interpreta.
>
> **Egress:** el sandbox de las sesiones Claude bloquea Yahoo/FMP/Stooq/Dataroma (403). El acceso a datos
> web va por el **egress de Vercel** (endpoints de plataforma) o por `buscarWeb`, no por WebFetch directo.

## 5. Rigor de validación (es dinero — máxima honestidad)

Toda estrategia pasa por el MISMO tribunal antes de proponerse para dinero real:

1. **Universo sin sesgo de supervivencia** (point-in-time; con datos gratis se admite el límite y no se cierra la puerta a Fase 2 solo con ellos).
2. **Datos point-in-time** — usar el fundamental que se CONOCÍA en la fecha, no el revisado a posteriori.
3. **Walk-forward OOS** — entrenar/ajustar en un tramo, validar en otro NUNCA visto (`backtestOOS` ya lo hace por mitades; ampliar a ventanas rodantes).
4. **Costes realistas** — comisión + slippage + spread. Una estrategia que solo gana sin costes está muerta.
5. **Pocos parámetros** — cada parámetro libre es una oportunidad de sobreajustar. Preferir reglas simples y estables.
6. **Benchmark = batir al SPY** — siempre reportar `retornoBuyHoldPct` + `baten` (ya en `backtestSimbolo`) y el SPY del periodo.
7. **Muestra amplia** — decenas de nombres y varios regímenes de mercado, no 3 tech de moda.

## 6. Arquitectura (reutiliza lo que ya existe)

- **`@central/module-trading`** (TS puro, testeado con `node --test`): añadir
  - `factores.ts` — cálculo de z-scores value/quality/momentum + score compuesto.
  - `piotroski.ts`, `magicFormula.ts` — deterministas, testeados.
  - `guru13f.ts` — parseo de 13F/Dataroma → ranking de convicción.
  - `figuras.ts` — detectores puros de cup-and-handle, cuñas, banderas (overlay de timing).
  - Extender `backtestCartera` a **rebalanceo periódico por ranking** (hoy entra por señal; añadir modo "top-N del score, rebalanceo trimestral").
- **`apps/plataforma`**: nuevos endpoints `/api/trading/factores`, `/api/trading/gurus`, `/api/trading/insiders`
  (auth `CRON_SECRET`), que enriquecen candidatos y alimentan el MISMO `/analizar` (torneo + barreras + paper).
- **Skill `trading-analista`**: la pasada diaria añade una fase de selección (factores/13F/insiders) ANTES
  del técnico, que queda como overlay de timing.
- **Persistencia:** tablas paper existentes (`trading_paper_*`, `trading_estrategia_stats`, `trading_tesis`)
  se reutilizan; los stats por estrategia ahora miden también las patas de selección.

## 7. Fases de ejecución

- **B0 — cerrar Fase 1 (hecho):** técnico validado y degradado a overlay. Este doc.
- **B1 — factores con datos gratis:** implementar `factores.ts` + Piotroski + magic formula; validar OOS
  contra SPY sobre la muestra ampliada de IBKR (+ los nombres del subagente). Medir si bate.
- **B2 — 13F + insiders:** `guru13f.ts` + Form 4 desde EDGAR/Dataroma; combinar con B1.
- **B3 — figuras como overlay de timing:** `figuras.ts`, medir su aporte marginal (o descartar).
- **B4 — decisión de datos de pago:** si B1–B3 baten al SPY OOS con datos gratis, contratar Sharadar para
  validar sin sesgo de supervivencia. **Solo aquí se plantea la puerta a dinero real.**

## 8. Invariantes (heredados, INVIOLABLES)

- **SOLO paper, cero órdenes reales.** El agente nunca llama a herramientas de creación/edición/borrado de
  órdenes o watchlists de IBKR. Solo lectura + endpoints de plataforma.
- **Secretos nunca en texto** (CRON_SECRET/API keys por env, jamás en prompts de triggers ni en el repo).
- **Batir al mercado FUERA DE MUESTRA es la única puerta** a proponer dinero real; esa decisión es de Alberto.
- **Formato € español** (`eur()`) en pantalla/Telegram/email; los precios de acción en USD van sin €.
