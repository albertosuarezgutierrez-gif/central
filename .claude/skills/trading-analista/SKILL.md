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
   **Nota:** cada COMPRA paper ya dispara un aviso inmediato por Telegram desde el propio
   `/api/trading/analizar` (`mensajeCompraPaper`, solo en aperturas nuevas) — el resumen es complementario,
   no la única vía. Deja claro «SOLO simulado, ninguna orden real».
7. **Radar + satélite 🚀 (los LUNES):** comprueba por Supabase que existe el snapshot de hoy en
   `trading_ranking` (el cron corre a las 09:00; si a tu pasada no está, avísalo — el digest lo manda el
   cron, no lo dupliques). En tu resumen menciona en 1-2 líneas los cambios del top-10 y si el satélite 🚀
   tiene confirmados (columna `cohetes`). Cuando el forward acumule ≥4 semanas, CONTRASTA sus ventanas
   contra las tablas del retrovisor (`docs/TRADING-RETROVISOR-2026-07.md`) y di si confirma o desmiente.
   **Prohibido**: proponer pasar cohetes a cohortes o tocar pesos del blend por tu cuenta — eso se decide
   con Alberto y con datos forward. **Todo cambio del modelo pasa por `docs/TRADING-HIPOTESIS-PREREGISTRO.md`**
   (condiciones firmadas ANTES de ver los datos; H1-H6 con fechas de evaluación — en esas fechas, evalúa y
   reporta contra lo firmado, sin mover la portería). El digest lleva línea de RÉGIMEN (SPY vs media 10
   meses): si cruza a 🔴 bajista, pide re-medir el retrovisor (H6). **Cohorte 3 (~15-18/08): congelar DOBLE**
   — combinada + factores-solo desde `{"universo":"sp500"}` sin gurús (H5, atribución completa).
   **📰 Noticias corporativas = CONTEXTO, nunca filtro:** el digest del cron YA lleva una línea
   «📰 Eventos 8-K» automática (20/07/2026: `radar.ts` + `extraerEventos8K` de `edgar.ts` — 8-K de la
   SEC de los últimos 7 días de los picks, solo items materiales; también en `salud.eventos` del
   snapshot). Tu papel es COMPLEMENTARIO: si al comentar el top/cartera detectas (búsqueda web) un
   evento gordo que el 8-K aún no recoge — un rumor de OPA, una investigación — menciónalo en 1 línea
   con 📰 y la fuente. El modelo de factores NO ve estos eventos (caso Stripe+Advent→PayPal 15/07/2026,
   oferta de 53,4 mM$ que el blend no podía anticipar); la noticia informa a Alberto, JAMÁS cambia el
   ranking, los pesos ni la composición de cestas (mismo estatus que las medias móviles: INFO visual).
   Ninguna cifra de noticia entra en la BD ni en el modelo. El **🌅 premarket** tiene el mismo estatus:
   el cron `trading-premarket` (L-V 13:00 UTC) ya vigila gaps ≥3% del top del snapshot vía Yahoo
   `includePrePost` y avisa por Telegram con el 8-K al lado — no dupliques ese aviso; y OJO: en un
   modelo value un gap-up gordo suele ser el precio escapándose de la entrada, no un «compra ya».
   El digest semanal lleva además (20/07): **🧑‍💼 Insiders Form 4** (compras/ventas P/S de directivos,
   7 días, de los picks — `salud.insiders`) y **📊↑/↓ volumen** por entry del top-20 (acumulación/
   distribución institucional por picos de volumen, `volumen.ts`; la huella de los fondos entrando).
   TODO ello mismo estatus: contexto, jamás filtro/peso (promoverlo a factor = hipótesis pre-registrada).
   **💼 Cartera de estudio (20/07):** 30.000€ SIMULADOS (parámetro `CAPITAL_ESTUDIO_EUR`, no se lee el
   bróker) POR CADA cohorte congelada, en euros con FX real + curva semanal — card en /trading + líneas 💼
   del digest del paper-tracker. Es la MISMA medición del forward expresada en dinero; no dupliques el
   cálculo ni propongas "ejecutarla": cero órdenes reales, siempre.
   **Tres capas más del digest (20/07 tarde, todas deterministas y contexto-nunca-filtro):**
   🛡️ **guardián de calidad de datos** (`calidad-datos.ts` — antes de cada ranking escanea la caché
   buscando IMPOSIBLES tipo el caso MCD y NEUTRALIZA a null los campos envenenados: esa empresa no puntúa
   ese factor esa semana; los extremos REALES como la manía de memoria NO saltan; línea 🛡️ solo si hay
   algo); ⚖️ **concentración del top-10** (`concentracion.ts` — correlación media de retornos diarios 60
   sesiones; ≥0,7 = el top es UNA sola apuesta y la diversificación es ilusoria — con la manía de memoria
   esto importa); 📅 **resultados PRONTO estimados** (`estimarProximoInforme` en edgar.ts — patrón de
   10-Q/10-K del año pasado +365d, ventana 10 días; SIEMPRE decir «estimado», la SEC no publica fechas
   futuras). Todo persiste en `salud` (anomalias/correlacionTop/resultadosProximos). Si el digest trae
   línea 🛡️, comenta la anomalía; si ⚖️ está en 🔴, recuérdale a Alberto el riesgo de concentración.
   **🔍 Buscador «Analiza una acción» (20/07):** `/trading` tiene card de análisis a demanda por ticker
   O NOMBRE (`GET /api/trading/analisis-simbolo?simbolo=X` — factores+puesto en el blend, técnico, 📊,
   💪 fuerza relativa en caídas, 📰/🧑‍💼 a 30 días, 📅). Acepta «PayPal» además de «PYPL»: resuelve
   contra el universo con `buscar-simbolo.ts::buscarCandidatos` (puro; ticker exacto gana, nombre/prefijo
   sugiere ordenado por capitalización) y si hay varias candidatas devuelve `{sugerencias}` (la UI pinta
   chips «¿Cuál de estas?»). Si Alberto te pide "analiza X", usa ESE endpoint como base determinista y
   complementa con tu lectura — no recalcules a mano lo que ya da. **⚠️ Auth del endpoint:** el MISMO
   acceso que la página (`accesoTrading`: sesión normal o cookie invitado) o token de rutina — el bug del
   estreno (20/07) fue exigir cookie SUPERADMIN (caduca a las 8h) y la card decía «no encuentro el
   ticker» con PYPL perfectamente en caché; NO volver a `isTradingLecturaAutorizado` aquí. **💪 Fuerza
   relativa en caídas** (`fuerza-relativa.ts`): en los días de caída del SPY, `resiste`/`acompaña`/
   `sufre` — resiste = compradores defendiéndola (idea de Alberto). Contexto, nunca filtro.
   **Página simplificada (20/07, petición de Alberto «más simple y corta»):** el grid «Pulso» de 4
   contadores se ELIMINÓ; «📊 Rendimiento por estrategia» y «👀 Watchlist» van PLEGADOS en `<details>`;
   la sección de tesis es «💡 Ideas de compra del agente» — SOLO alcistas, máx. 8, sin columna Dirección
   (el histórico completo con bajistas/neutrales sigue en `trading_tesis`). No re-añadir esas secciones.
   **Auditoría 21/07/2026 — el panel muestra SOLO COMPRAS REALES (`trading_tesis.operada=true`), no señales
   en bruto.** Antes filtraba solo `direccion='alcista'` y listaba TODA señal alcista del torneo (persistida
   antes de las barreras y sin saber cuál ganó), así que salían nombres cuyo torneo ganó BAJISTA (p.ej. CVX
   con RSI 81: reversión sobrecompra/70 gana al momentum/68) o que las barreras vetaron → contradecía la
   tarjeta «Analiza una acción» (que a esos mismos los marcaba calidad débil / técnico «en espera»). La
   columna `operada` la pone `/api/trading/analizar` en la señal ganadora que abre posición en paper; el
   panel filtra `alcista AND operada`. NO volver a listar señales sin operar como «ideas de compra».

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
- **Hallazgo medido (18/07/2026):** validado con 2 años reales de IBKR (7 valores + SPY) el sistema **TÉCNICO
  NO bate a comprar-y-mantener** (cartera +13,7% vs cesta equiponderada +38,4% / SPY +30,1%; solo 1 de 8 bate
  por-símbolo; fuera de muestra los bordes se dan la vuelta = azar). Conclusión: el timing técnico se **degrada a
  overlay** y la ventaja se busca en la **SELECCIÓN** (ver Fase B abajo). Sigue pendiente ampliar la muestra a
  ~15 nombres con calidad/valor (JPM/JNJ/XOM/KO…) para cerrar sin sesgo — bloqueado por caídas del conector IBKR.

## Selección por FACTORES (Fase B) — batir al mercado eligiendo QUÉ, no CUÁNDO
> Spec completo: `docs/TRADING-FASE-B-spec.md`. **SOLO paper** hasta batir al SPY fuera de muestra.
- **`POST {PLATAFORMA_URL}/api/trading/factores`** con `{ universo: MetricasFactor[], pesos?, magic?, top? }`
  (Bearer `ALERTA_TOKEN`). Rankea el universo por **value+quality+momentum** con `rankearFactores` (z-scores
  cross-seccionales: "barato/sano vs sus pares", ausente=neutral, deuda invertida, pesos por defecto 0,4/0,4/0,2)
  y, si pasas las patas `magic` (EBIT/EV + ROIC), también devuelve la **fórmula mágica** de Greenblatt. NO opera
  ni persiste: prioriza QUÉ estudiar; los mejores entran al mismo `/analizar` (torneo + barreras + paper).
- Piezas puras en `@central/module-trading`: `rankearFactores`/`zscores`/`momentum12_1` (`factores.ts`),
  `piotroskiFScore` (`piotroski.ts`, F-score 0..9 salud contable), `rankearMagicFormula` (`magicFormula.ts`),
  clonado de gurús `conviccionGurus`/`agregarConviccion`/`clasificarMovimiento` (`guru13f.ts`), y convicción de
  insiders `agregarInsiders` (`insiders.ts`, cluster buy de Form 4).
- **`POST {PLATAFORMA_URL}/api/trading/gurus`** con `{ gestores?: string[], top? }` (Bearer `ALERTA_TOKEN`):
  descarga la actividad 13F de gestores value desde **Dataroma** (corre en el egress de Vercel; el sandbox de
  las sesiones Claude da 403) y devuelve la **convicción por símbolo** — lo que VARIOS gestores abren/amplían a
  la vez sube. Parser puro testeado (`lib/trading/dataroma.ts`); si `gestoresConDatos` viene vacío en producción,
  revisar los códigos de gestor y el markup. NO opera; los mejores entran al mismo `/analizar`.
- **`POST {PLATAFORMA_URL}/api/trading/fundamentales`** con `{ simbolos: string[], ev?: {SYM:number} }` (Bearer
  `ALERTA_TOKEN`): fundamentales **GRATIS de EDGAR** (SEC XBRL `companyfacts`). Por símbolo descarga los 2 últimos
  ejercicios y devuelve el **Piotroski F-score** (0..9) + **ROIC**; si pasas el Enterprise Value por símbolo (`ev`),
  cierra la **fórmula mágica** (earnings yield = EBIT/EV) y la rankea (`rankingMagic`). Parser puro testeado
  (`lib/trading/edgar.ts`: `extraerFundamentales`/`serieAnual`/`mapaTickers`); corre en el egress de Vercel. Si
  `conDatos` viene 0 en producción, revisar el User-Agent SEC y el resolver de CIK. NO opera; alimenta `/analizar`.
- **`POST {PLATAFORMA_URL}/api/trading/insiders`** con `{ simbolos?: string[], limite?, soloCompras? }` (Bearer
  `ALERTA_TOKEN`): escanea los **Form 4** más recientes de la SEC y devuelve la convicción por símbolo — el
  **CLUSTER BUY** (varios directivos DISTINTOS comprando a la vez) sube; las ventas restan. Por defecto solo el
  lado compra (`soloCompras:false` incluye ventas); `simbolos` filtra a tu universo. Parser puro testeado
  (`lib/trading/form4.ts`: `parseForm4Xml`/`extraerEntradasAtom`/`elegirDocForm4` + `agregarInsiders` del módulo).
  Corre en Vercel (2 hops por filing → `limite` bajo, default 40). Si `transacciones` viene 0, revisar el feed
  getcurrent / User-Agent. NO opera; alimenta `/analizar`.
- El agente reúne además el **momentum de precio** con `momentum12_1(cierres)` de las velas de IBKR y puede seguir
  usando FMP (plan Free `/stable`) como fuente alternativa de fundamentales.
- **`POST {PLATAFORMA_URL}/api/trading/seleccion`** con `{ gestores?, minPiotroski?, minRoic?, tam?, maxFundamentales? }`
  (Bearer `ALERTA_TOKEN` o sesión superadmin): **SELECCIÓN COMBINADA** — cruza la convicción de gurús (Dataroma) ×
  la CALIDAD fundamental (Piotroski+ROIC de EDGAR). Los gurús dicen QUÉ mirar; la calidad es la PUERTA (solo pasan
  negocios sólidos: piotroski ≥ `minPiotroski` (def 6) y roic ≥ `minRoic` (def 0,10)). Devuelve una **cesta
  DIVERSIFICADA equiponderada** (`tam` def 25, cap de concentración implícito) + `simbolos` listos para `/validar-oos`.
  Pieza pura testeada: `seleccionCombinada` (`@central/module-trading::seleccion.ts`). **Nació de la lección del
  test gurús-solo (18/07/2026): su alpha (+316 pts) estaba dominado por UN nombre (APP ×39); en MEDIANA la cesta
  empataba con el SPY.** Por eso: diversificar + gate de calidad, y validar mirando la **MEDIANA**, no la media.
- **`POST {PLATAFORMA_URL}/api/trading/validar-oos`** con `{ universo: string[], top?, desde?, hasta?, benchmark? }`
  (Bearer `ALERTA_TOKEN`): **valida la SELECCIÓN vs el mercado SIN IBKR**. Toma un universo YA RANKEADO (el
  `ranking` de `/factores`, `/gurus`, `/fundamentales` o `/insiders`), coge el top-N, baja sus cierres diarios
  **gratis de Stooq** + los del benchmark (SPY por defecto) y devuelve el **retorno de la cesta equiponderada
  (buy & hold) vs el índice** (`alpha`, `bate`, `ganadoresVsBench`, `porSimbolo`). Piezas puras testeadas:
  `evaluarCestaVsBench`/`retornoTotal` (`@central/module-trading::seleccionEval.ts`) + `lib/trading/precios-stooq.ts`
  (`parseStooqCsv`/`cierresStooq`). Corre en Vercel. **⚠️ v1 = sanity check, NO OOS point-in-time** (selección de
  hoy sobre precios pasados → posible look-ahead): un `alpha>0` es NECESARIO pero no suficiente. La prueba
  DEFINITIVA es el **forward en paper de IBKR** (Opción B, pendiente de montar: IB Gateway + IBC en host siempre
  encendido). Flujo recomendado: rankear con los pilares de selección → `/validar-oos` → si bate al SPY, forward paper.
- **Barrera de selección en `/analizar`** — pásale por símbolo el `factorScore` (el `score` que devuelve
  `/factores`) y un `minFactorScore` global (p.ej. `0` = al menos la media de su universo): `/analizar` **veta
  abrir un largo en un nombre con factor flojo** (`factorFlojo`) aunque el gráfico dé señal alcista. Es la
  materialización de "la selección FILTRA al timing". Degrada (no veta) si no aportas factores → compat con el
  flujo técnico actual. El `factorScore` viaja en cada idea de la respuesta para trazabilidad.
- **El técnico (ADX/SMA/rsi/volumen) es un overlay de TIMING de la entrada, nunca la señal primaria.** Los
  gráficos (taza-con-asa, cuñas) solo afinan CUÁNDO entrar en un valor ya seleccionado.

## Volumen relativo (RVOL) — confirmación, no disparador
- `rvol(volumenes)` = volumen de hoy ÷ volumen **típico** de las 20 sesiones previas. Baseline = **MEDIANA**
  (robusta: un día de earnings ×5 no deprime el rvol de los días siguientes, cosa que sí hacía la media).
- `confirmaVolumen(direccion, rvol)`: `confirma` solo con **≥1,5×** (convicción real; 1,15× era casi un día
  normal), `normal` ≥0,9×, `flojo` por debajo. Es un filtro que **confirma** una señal de precio existente —
  NUNCA el motivo para comprar. `volumenInusual` (rvol≥2) marca `fuentes:['volumen']` en la cantera.

## Fuentes / envs (solo nombres)
- MCP: Interactive Brokers (debe estar ENCENDIDO en el chat/sesión del agente), FMP (opcional Fase 1,
  necesario para la cantera y para la estrategia `valor`).
- Endpoints: `PLATAFORMA_URL` + **`ALERTA_TOKEN`** (token DEDICADO de bajo privilegio; los endpoints
  `/api/trading/*` lo aceptan vía `isRoutineAuthorized`). Se usa `ALERTA_TOKEN` en vez del `CRON_SECRET`
  maestro **a propósito**: el entorno de la rutina de Claude Code es de texto plano visible («no metas
  secretos»), así que la rutina solo lleva el token de bajo privilegio (si se filtra: empujar un saldo o
  disparar una pasada paper — nunca dinero real). `CRON_SECRET` sigue valiendo por compatibilidad.
  Ambos, nunca literal en el prompt del trigger — pásalos por env.
  - **Los endpoints de SOLO LECTURA (selección/validación: `/factores`, `/gurus`, `/fundamentales`,
    `/insiders`, `/validar-oos`) aceptan ADEMÁS la sesión de SUPERADMIN** (cookie `plataforma_admin`, vía
    `lib/trading/auth.ts::isTradingLecturaAutorizado`) → se pueden verificar desde el navegador ya logueado
    (o desde Claude para Chrome) SIN pegar ningún secreto en consola. `/analizar` (y los que operan/avisan)
    siguen SOLO con token (`isRoutineAuthorized`) — no session-gated a propósito.
- Telegram: bot único del monorepo (`@central/core-telegram`).

## Rutina única + perro guardián (21/07/2026)
- **UNA sola Rutina de Claude Code** ejecuta esta pasada: «Agente trading-analista — pasada nocturna (SOLO
  paper)» (L-V ~22:15 CEST, conector IBKR ON, repo `central`, entorno Default con `plataforma-…vercel.app` en
  el allowlist de red, usa `ALERTA_TOKEN`). Hubo una duplicada («Agente inversión») que se BORRÓ — no recrear
  una segunda rutina que cargue esta skill (toda la inteligencia ya está aquí; un prompt largo en el trigger
  solo se queda caduco). Si detectas dos, deja una y avisa.
- **🐕 Watchdog** — cron `/api/cron/trading-watchdog` (`30 6 * * 2-6`, mar-sáb 08:30 CEST) comprueba que el
  NAV de IBKR en `broker_saldos` se refrescó "anoche" (umbral 18 h) y, si no, avisa por Telegram (rutina
  borrada/pausada · IBKR caído · `ALERTA_TOKEN` 401 sin redeploy). Lógica pura en `apps/plataforma/lib/trading/
  watchdog.ts` (`evaluarWatchdog`/`seEsperaRefresco`). Es la red que caza que esta pasada deje de correr.

## Forward paper (la prueba limpia que decide el dinero real)
- **`GET/POST {PLATAFORMA_URL}/api/trading/paper`** (Bearer `ALERTA_TOKEN` o sesión superadmin): mide el
  rendimiento REAL **hacia delante y SIN look-ahead** de las cestas de selección combinada **CONGELADAS** en
  `lib/trading/paper-cartera.ts` (`COHORTES_PAPER`), contra el SPY, con precios gratis (Stooq→Yahoo). Como las
  cestas se fijaron ANTES, aquí no hay sesgo de supervivencia. Devuelve `cohortes[]` (cada una con `resultado`
  media + **`medianaCesta`** robusta + **`riesgo`** drawdown/vol/TE + **`resultadoBase`** atribución) y, con
  `?curva=1|<cohorte>`, la curva persistida. **Es la única prueba sin sesgo**: el backtest hacia atrás siempre
  tiene look-ahead.
- **COHORTES (robustez idea 1):** en vez de una sola cesta se congela una NUEVA cada ~30 días
  (`DIAS_ENTRE_COHORTES`). Cada cohorte = muestra independiente; batir al SPY repetido entre cohortes es mucho
  más difícil por suerte. **Congelar = AÑADIR una entrada a `COHORTES_PAPER`** (nunca editar una existente →
  no rompe el out-of-sample). Copia `simbolos` (combinada) **y** `simbolosBase` (gurús-solo) que devuelve
  `/api/trading/seleccion`. El digest recuerda cuándo toca.
- **CURVA persistida (idea 2):** el cron guarda un snapshot por cohorte en `trading_paper_track` (tabla ya
  aplicada en la Supabase compartida; el tracker es best-effort si no existe). Da la trayectoria, no solo el
  número de hoy.
- **RIESGO (idea 3):** batir con más riesgo no es batir. El digest y la BD llevan caída máxima, volatilidad
  anualizada y tracking error de la cesta vs el SPY (`@central/module-trading::metricasRiesgoCesta`).
- **ATRIBUCIÓN (idea 4):** 2º benchmark = cesta **gurús-solo** (sin el filtro Piotroski/ROIC,
  `seleccionSoloGurus`). Si la combinada no bate a la base, el filtro de calidad NO aporta. El digest muestra
  «filtro aporta +X%».
- **Regla:** no leer como veredicto hasta acumular semanas/meses; si la MEDIANA bate al SPY **sostenida,
  repetida entre cohortes y ajustada a riesgo** → recién ahí la conversación de dinero real.
  **Cron SEMANAL** `/api/cron/paper-tracker` (lunes 10:00, `lib/trading/paper-tracker.ts::enviarPaperTracker`)
  manda el avance por **Telegram**.
- **VISIBLE en `/trading`** (sección 🧪 Forward paper): lee los snapshots persistidos (`trading_paper_track`) y
  pinta, por cohorte, la MEDIANA vs SPY + riesgo + atribución + una **mini-curva SVG** (cesta vs SPY). Empieza
  vacía (mensaje que lo explica) hasta el primer snapshot del cron. Es la superficie de navegador del test
  (antes solo llegaba por Telegram).
- 🧭 **Datos de pago (EODHD MCP u otros): decisión APLAZADA** — no meter en el camino crítico; reevaluar solo con
  resultados reales (si Stooq+Yahoo caen a la vez → EODHD como 3er fallback de precios; al abrir Opción B/IBKR →
  EODHD por MCP para fundamentales/noticias). Plan de pago solo si el track record demuestra que aporta.
- ✅ **RESUELTO (19/07/2026) — la rutina YA llega a Vercel.** Hubo DOS bloqueadores encadenados, arreglados:
  (1) **egress 403** en el túnel CONNECT hacia `plataforma-ten-flame.vercel.app` → se añadió ese host al
  **allowlist de red** del entorno "Default" de la rutina (Network access: Trusted → Custom, con el dominio +
  "incluir gestores de paquetes"). (2) Al abrirse el egress afloró un **401** de autorización: el `ALERTA_TOKEN`
  del entorno de la rutina y el del proyecto Vercel `plataforma` estaban desincronizados. Se **rotó** (mismo
  valor nuevo en ambos) **y se redesplegó plataforma** (las envs de Vercel no surten efecto sin redeploy — era
  el eslabón que faltaba). Verificado end-to-end: `POST /api/trading/saldo` devolvió 200 y `broker_saldos`
  se refrescó (NAV €33.658,82). El mismo arreglo desbloquea a `auditoria-diaria` si comparte el entorno "Default".
  ⚠️ Si vuelve a dar 401 tras cambiar el token: casi siempre es que **no se redesplegó plataforma** o los dos
  valores no son idénticos byte a byte.

## Radar del universo EEUU (Fase 1 — las ~500 mayores, PR #1017)
- **Qué es:** el agente ya no mira solo la watchlist de 13: rankea las **~550 mayores de EEUU** con el
  modelo de factores (Piotroski + ROIC + earnings yield + momentum) cruzado con gurús. **La selección
  elige el QUÉ; el técnico (SMA50+RSI del top-20) solo confirma el CUÁNDO** — lección del backtest −52%.
- **Datos:** caché incremental `trading_universo` (tabla aplicada) — cron **`/api/cron/trading-universo`**
  (`20 */6 * * *`, lotes de 50, SEC companyfacts + histórico Stooq→Yahoo por símbolo, ritmo suave ~4 req/s).
  Universo desde `company_tickers.json` (ticker+**nombre**); semilla de respaldo en `universo-semilla.ts`.
- **Ranking:** cron **`/api/cron/trading-ranking`** (lunes 09:00) — lee caché (cero llamadas SEC), rankea,
  persiste snapshot en `trading_ranking` y manda **digest Telegram** (top-10 con `TICKER — Nombre`,
  etiqueta 🟢fuerte/🟡media/⚪débil, badges 🏆 gurús / 📈 técnico, cambios vs semana anterior, **track
  record** de los tops de hace ~4/8/13 semanas vs SPY por MEDIANA, y salud de datos). Si la cobertura de
  la caché <50% avisa en vez de rankear. UI: sección **🌎 Radar del mercado** en `/trading` — desde el
  20/07 (PR #1033) es **UNA sola tabla «Ranking + explorador»**: el score del blend se calcula para TODO
  el universo elegible (mismo `rankearUniverso` del cron) y la tabla se ordena por score por defecto (las
  primeras filas SON el top del radar), con buscador + filtros (Piotroski/ROIC/momentum/calidad/gurús) y
  ordenación por columna. Las señales 🏆/📈/⏳ solo existen para el top-20 del snapshot semanal (el
  técnico no se calcula para las 550). Ya NO hay tabla top-20 separada — no la busques ni la re-crees.
- **Cohortes:** `/api/trading/seleccion` acepta `{"universo":"sp500"}` → candidatos desde la caché del
  radar (las cohortes futuras del forward paper se congelan desde el universo amplio).
- **Fase 1.5 (cola):** Russell 1000 · avisos por cambio material · ADX (el volumen del parser YA está:
  `parseStooqCsvVol`/`parseYahooChartVol`/`puntosDiariosVol` + señal 📊 `volumen.ts`, 20/07) · pilar 4 =
  fondos vía conector MCP **Morningstar** (screener+holdings; evaluar datos en una
  pasada exploratoria antes de diseñar). La **capa informativa 📰** ya está MONTADA (20/07): línea
  «Eventos 8-K» en el digest desde la SEC (contexto, nunca filtro; nació de la oferta
  Stripe+Advent→PayPal). El **🌅 vigía del premarket** también (20/07): `lib/trading/premarket.ts`
  (puro) + `premarket-aviso.ts` + cron `trading-premarket` L-V 13:00 UTC — gap ≥3% del top del
  snapshot (Yahoo `includePrePost`, gratis; Finviz descartado: premarket solo en Elite de pago y
  bloquea bots), aviso Telegram con 📰 al lado, silencio si no hay movimiento. Contexto, nunca
  filtro. Fase 2 global = datos de pago, solo si el forward paper valida.
- **🔭 Retrovisor (backtest INDICATIVO, 19/07):** tabla `trading_backtest` (546 empresas × 22 snapshots
  mensuales punto-en-el-tiempo por `filed` + SPY + lupa `_GURUS_`; re-poblable con el workflow
  `trading-backtest.yml`). Informe: **`docs/TRADING-RETROVISOR-2026-07.md`** — top-10 batió a SPY 17/22
  a 91d (alpha mediano +8,5 pp); momentum = único factor con spread positivo en 2024-26 (régimen junk
  rally); calidad/valor = freno de caídas >15%; gurús = calidad a precio razonable comprada contra el
  momentum. OJO sesgo: membresía del universo NO es histórica (lista de hoy retro-aplicada). NO cambiar
  pesos del blend por este backtest — solo si el FORWARD lo confirma con 2-3 meses.
- **🚀 Satélite caza-cohetes (19/07, dentro del ranking semanal):** lista APARTE de ≤5 nombres con perfil
  lotería (momentum>30% + ROIC<0 ∨ Piotroski≤4; 13% acaba +50%/3m según el retrovisor). Las medias
  multi-marco (SMA30 semanal / SMA12 mensual) se muestran como INFORMACIÓN (✓/✗), **NO como filtro**: la
  medición del 19/07 (retrovisor §4-bis) no les encontró señal en el perfil cohete (sobre ambas: caza
  12,4% y batacazo 13,5% vs 14,0%/8,4% bajo alguna) — no proponer usarlas para incluir/excluir. Columna
  `trading_ranking.cohetes` + track record propio (`trackRecord.cohetes`). **NUNCA entra en
  cohortes/cesta núcleo** — es un experimento con su propio marcador: si en meses no bate, se retira con datos.
  **🚀 Cartera cohetes (paper, 23/07/2026):** bolsillo APARTE de 30.000€ simulados (`CAPITAL_COHETES_EUR`)
  que ROTA cada lunes a los cohetes confirmados (equiponderado) y se VALORA a diario vs SPY — libro
  `trading_cohetes_rebalanceo` + curva `trading_cohetes_track`, crons `trading-cohetes-rebalanceo`
  (L 09:30) y `trading-cohetes-track` (mar-sáb 07:00). Pieza pura `@central/module-trading::carteraCohetes`,
  IO `lib/trading/cartera-cohetes-io.ts`, UI en `/trading`, bloque en el digest del paper-tracker.
  **NUNCA entra en cohortes/núcleo; el criterio NO se auto-modifica** (H7 pre-registrada, eval 2026-10-15).
  SOLO paper.

## Puerta a Fase 2
No proponer ejecución real hasta que `trading_estrategia_stats` muestre rentabilidad sostenida y FUERA
DE MUESTRA (walk-forward). Esa decisión es de Alberto y tendrá su propio spec. Hasta entonces: solo paper.
