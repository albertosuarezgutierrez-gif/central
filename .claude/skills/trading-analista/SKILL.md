---
name: trading-analista
description: Pasada diaria del agente de inversión sobre Interactive Brokers (Fase 1: paper + Tramo 1 de 1.000€ REALES ya desplegado en CVX; el agente nunca ejecuta, Alberto confirma). Lee cartera real + watchlist, tira precios (IBKR) y fundamentales por MCP, llama a /api/trading/analizar y /api/trading/puntuar de plataforma, y resume por Telegram. Copiloto de órdenes: solo INSTRUCCIONES que Alberto confirma en IBKR, y solo si él las pide. NUNCA ejecuta órdenes reales.
---

# Trading-analista (Fase 1 · paper + Tramo 1 real) — router

## Qué hace la pasada diaria
Lee el NAV de IBKR (`get_account_summary`) y lo empuja a `/api/trading/saldo`; lee las
posiciones reales (`get_account_positions`) y las empuja a `/api/trading/cartera` (la sección
«💼 Cartera real» de `/trading` SOLO se refresca por ahí, 17/08/2026); carga la
watchlist activa, baja velas diarias por símbolo (IBKR) y fundamentales (FMP best-effort);
llama a `POST /api/trading/analizar` (torneo + barreras + aperturas paper) y a
`POST /api/trading/puntuar` (walk-forward + stops paper); resume por Telegram (importes
en formato español) y, los lunes, comenta el radar/satélite 🚀 del snapshot semanal.
Detalle paso a paso en `references/pasada-diaria.md`.

## 🚨 No romper / crítico
- **Regla de oro: NO ejecutar NINGUNA orden real en IBKR.** Solo lectura (`get_account_*`,
  `get_price_history`, `get_price_snapshot`, `get_watchlist`) y endpoints de plataforma.
  Si dudas, no operas. Aplica también a la cartera de estudio (30.000€ SIMULADOS) y a la
  cartera cohetes: cero órdenes reales, siempre.
  🚨 **«El agente no ejecuta» ≠ «no hay dinero real».** Desde el 25/08/2026 hay **capital real
  desplegado por recomendación del agente**: el **Tramo 1 de la escalera (1.000€) está abierto en
  CVX**, confirmado a mano por Alberto. Lo que sigue simulado es TODO lo demás, y es así porque
  **el tramo está consumido**, no porque el sistema sea solo-paper. No le digas a Alberto que su
  cartera real «no compra porque todo es paper» (pasó el 31/08/2026, con CVX en cartera).
  Escalera y estado de cada tramo: `references/copiloto-ordenes.md`.
  **Matiz copiloto (15/08/2026, decidido por Alberto):** `create_order_instruction` NO crea
  una orden viva — crea un borrador que Alberto revisa y envía él mismo en IBKR. Está
  permitido SOLO cuando Alberto pide esa instrucción concreta en conversación; la Rutina
  programada JAMÁS crea instrucciones por su cuenta en Fase 1. Contrato completo, doctrina
  núcleo-satélite (⛔ nunca proponer vender el ETF núcleo para financiar una señal) y
  alertas en `references/copiloto-ordenes.md`.
- **Autonomía = DESCUBRIR, no ejecutar.** La cantera decide qué estudiar; todo sigue en paper.
- **Puerta a Fase 2:** no proponer ejecución real hasta rentabilidad sostenida y fuera de
  muestra en `trading_estrategia_stats`. Esa decisión es de Alberto.
- **Prohibido** pasar cohetes a cohortes o tocar pesos del blend por tu cuenta. **Todo cambio
  del modelo pasa por `docs/TRADING-HIPOTESIS-PREREGISTRO.md`** (condiciones firmadas antes de
  ver los datos). El criterio cohetes NO se auto-modifica (H7).
- **✅ H8 (capitulación) y H9 (salidas) están RESUELTAS y NINGUNA se cabla (08/08/2026).** No
  propongas entradas «porque capituló» ni pongas stops: se midieron sobre 21.321 observaciones y
  fallaron. **H9:** las tres reglas fallan su criterio; stop −20% y trailing −15% EMPEORAN los
  batacazos (15,6% y 12,1% frente al 10,4% de la salida por tiempo) — un stop convierte un susto
  temporal en pérdida cerrada. **H8:** el agregado cruzaba el umbral (+2,34 pp) pero el signo se
  INVIERTE entre mitades (+6,85 pp en ago24-jul25, −2,24 pp en ago25-may26). `capitulacionMes/Sem`
  se siguen recolectando como CONTEXTO, igual que las noticias. Detalle en el pre-registro.
- **⛔ INTRADÍA, objetivo diario fijo y cruces de medias: DESCARTADOS con datos (12/08/2026,
  re-verificado 13/08).** No propongas operativa intradía, ni un objetivo de «X% al día», ni
  entradas por cruce de medias. Medido sobre las 227 ejecuciones REALES de la cuenta en 2026
  (173 round-trips FIFO): **el intradía es el peor tramo, −1,88% de media sobre n=106**, y son el
  61% de las operaciones — la operativa que se propondría escalar es la que más ha perdido. Esa es
  la cifra que puedes citar. **NO cites el «+1,16% a >10 días»**: son 7 round-trips y su mediana es
  NEGATIVA (−0,32%); no sostiene nada, y este mismo repo descarta por «muestra sin valor» tamaños
  así cuando salen a favor. El cruce de medias YA está en el torneo (`momentum` = EMA12/26 + MACD)
  y es la PEOR de las cuatro estrategias: hit 24,1%, retorno medio **−0,63%** (n=116) — ojo, el
  `0.000000` de `valor` y `catalizador` en esa tabla es un centinela «sin calcular», no un cero
  medido. Cruce y MACD **no son dos señales**: la línea MACD ES ema12−ema26 (ver
  `estrategias.ts:10-12`), así que «confirmar» una con otra es contarse la misma señal dos veces.
  Backtest propio sobre SPY 30 min / 77 sesiones: ninguna variante bate a comprar y no tocar
  (+8,72%), y forzar el cierre diario destruye del 80% al 100% del retorno de la misma señal; lo
  mejor del intradía sale a 0,016%/día, entre 31 y 61 veces por debajo de un objetivo de 0,5-1%.
  **Veredicto completo, método y errata del 13/08 en `docs/INVERSION-VEREDICTO-2026-08.md`.**
- **🧱 «Base» y ruptura de base: MEDIDAS y DESCARTADAS (26/08/2026).** No propongas entradas «porque está
  haciendo una base perfecta» ni «porque rompe con volumen». Umbral firmado antes de mirar y medido sobre
  177.282 observaciones del retrovisor: estar en la base (pegado a máximos + volumen seco + sobre la media)
  **resta 1,64 pp** de `ret91` y lo hace en las DOS mitades; la ruptura con volumen **invierte el signo**
  (+1,44 pp en 2011-18, −2,72 pp en 2019-26, n=1.257) — el modo de muerte de H8 — y su `ret28` es menos de
  la mitad que el del universo en ambas mitades. Matiz que SÍ puedes decir: lo descartado es la BASE; la
  **acumulación por picos de volumen (📊↑) sigue sin medir** (necesita serie diaria, que el retrovisor no
  guarda) y sigue siendo CONTEXTO, nunca filtro. Detalle en `docs/TRADING-HIPOTESIS-PREREGISTRO.md`.
- **🛡️ Los endpoints VETAN precios que no se creen — hay que CANTARLO en el resumen (08/08/2026).**
  `/analizar` y `/puntuar` ya no se tragan `precios[simbolo]` a ciegas: cada precio pasa una guardia de
  ×2 contra el último `precio_ref` y un CONTRASTE contra la fuente propia del servidor (Stooq/Yahoo,
  tolerancia 2%). Lo que no cuadra se descarta y, en `/analizar`, el símbolo se salta ENTERO (sus velas
  contaminan EMA/MACD/RSI/ADX). Las respuestas traen `vetados`, `descartados`, `divergentes` y
  `contraste.sinJuzgar`: **si vienen con contenido, dilo en el Telegram**. Un símbolo que desaparece en
  silencio es indistinguible de uno que hoy no dio señal — exactamente cómo el CVX de 590,17$ del 03/08
  envenenó 12 resultados (momentum pasó de −0,40 pp a +7,18 pp de media) sin que nadie mirara. Si un día
  salen MUCHAS divergencias, el dato a revisar es **a qué hora corrió la pasada**: con el mercado abierto
  IBKR da precio vivo y Stooq el cierre anterior, y mezclar intradía con cierres es el error de periodo
  de siempre.
- **🔀 El fallo más caro NO es un precio absurdo: es un precio REAL de OTRA empresa (08/08/2026).**
  Los `get_price_history` que pides en paralelo vuelven en orden de FINALIZACIÓN, y transcribirlos por
  posición baraja los símbolos. Ha pasado TRES veces (verificado contra IBKR): `17/07` META←MSFT,
  MSFT←SPOT, SPOT←NFLX, NFLX←LLY · `03/08` LLY←CVX, META←LLY · `04/08` NFLX←PLTR. Ningún umbral de
  plausibilidad lo ve, porque el número es un cierre verdadero. Ahora lo veta `detectarSuplantaciones()`
  (precio idéntico a otro de la misma pasada, o que cuadra con la referencia de otro y no con la suya) y
  viaja en `suplantados` — **cántalo en el Telegram y arregla tu transcripción, no es un fallo del
  servidor**. Guarda cada respuesta con el nombre de su símbolo NADA MÁS recibirla; nunca acumules
  respuestas paralelas para transcribirlas al final. Hueco conocido: la PRIMERA pasada de un símbolo
  (sin referencia) barajada sin duplicar a nadie solo la ve el contraste con la 2ª fuente.
- **📅 La fecha de EARNINGS se persiste desde el 27/08/2026 — y hay que seguir mandándola.** Nuevas
  columnas `trading_tesis.proximo_earnings`/`earnings_estado`, las mismas en `trading_paper_posicion`
  (congeladas al abrir) y `evento_dentro` en las SELL de `trading_paper_orden` (única huella que
  sobrevive al cierre: la fila de la posición se borra). `/puntuar` devuelve `atribucionEvento`
  (retorno medio CON evento dentro de la ventana vs SIN, más cuántos **no se han podido comprobar**):
  **cántalo en el Telegram**, es lo que impide que un hueco de resultados se contabilice como puntería
  de una estrategia. Origen: NVDA acabó en verde por un hueco del +6,79% el 27/08 sobre una posición
  que la víspera estaba en pérdida y a ~3% del stop — ver `docs/TRADING-POSTMORTEM-NVDA-2026-08.md`.
  📌 Estado del backfill (27/08/2026, medido en producción): **44 tesis y 2 posiciones** quedaron en
  `reconstruido` (NVDA y SQM) y **2.016 tesis siguen en `sin_consultar`** — eso NO es un fallo, es que
  de esas filas no había registro. La atribución las cuenta aparte y nunca las mete en una media.
  🚨 Tres estados: `sin_consultar` ≠ `sin_fecha`, y `reconstruido` marca lo deducido a posteriori del
  texto de `rationale` (no es una medición). Esto solo ETIQUETA: no veta, no dimensiona y no toca
  `trading_estrategia_stats` — usarlo para decidir sería modelo → preregistro.
- **⚖️ «Batió» NO es un dato fiable ni a posteriori (27/08/2026).** Del mismo trimestre de NVDA,
  Financial Datasets da BEAT +33,0% (GAAP 2,46 $ vs 1,85 $) y Alpha Vantage MISS −52,6% (0,99 $ vs
  2,09 $): es GAAP contra non-GAAP (el 8-K declara non-GAAP 1,01 $ frente a GAAP 2,46 $). **No
  cablees ninguna regla del tipo «comprar si bate»** — la decidiría el parser, no la empresa. Y batir
  es la base, no la noticia: NVDA batió en los 12 trimestres anteriores.
- **Una tesis anulada no existe** (`trading_tesis.anulado`, 28 filas del saneo del 08/08). Se construyó
  con la serie de velas de otra empresa, así que su dirección y su confianza no hablan de ese símbolo:
  ni se puntúa, ni sirve de referencia de precio, ni sale en el panel. **No propongas «recuperarlas»
  poniéndoles el precio bueno** — eso fabricaría el veredicto de una señal que nunca se emitió. Distinto
  es un RESULTADO cuyo `precio_despues` vino cambiado con la tesis sana: eso sí se re-puntúa con el
  cierre real y se marca `precio_fuente='manual'` (24 filas LLY/META del 03/08).
- **💰 Un salto del NAV >15% avisa por Telegram y NO se bloquea.** Puede ser un ingreso tuyo o una
  lectura rota, y el servidor no puede distinguirlos. Si el aviso salta y tú no has movido dinero, la
  lectura del NAV viene mal y con ella se dimensionan TODAS las compras.
- **📰 Noticias, 🌅 premarket, 🧑‍💼 insiders, 📊 volumen, medias móviles = CONTEXTO, nunca
  filtro:** jamás cambian ranking, pesos ni cestas; ninguna cifra de noticia entra en BD/modelo.
- **Congelar cohortes = AÑADIR entrada a `COHORTES_PAPER`, nunca editar una existente** (no
  romper el out-of-sample). No cambiar pesos del blend por el retrovisor: solo si el FORWARD
  lo confirma.
- **🚨 LANDMINE — el screener de pago (`screen_stocks`) trae tres trampas medidas (21/08/2026):**
  ordena por **ABECEDARIO** y sin paginación (`limit: 25` = los 25 primeros por la A, no los mejores);
  devuelve **ROIC de 668%** cuando el capital invertido es ≈ 0 (pasa un gate `roic ≥ 0,10` justo al
  revés de lo que quieres); y **solo trae los campos por los que filtras**. Pásalo SIEMPRE por
  `traducirScreener` (`@central/module-trading::screenerMercado.ts`, 11 tests) y lee
  `references/seleccion-y-senales.md`. Hermano: **`get_institutional_holdings` tiene el `value_usd`
  ×1.000 en algunos declarantes** — comprueba `shares × reported_price` o usa Dataroma, que es gratis.
- **📈 Alpha Vantage (conector MCP, 22/08/2026) — para lo que EL BRÓKER NO DA.** IBKR sirve precio y
  cartera; su `get_price_snapshot` tiene el enum CERRADO, así que no hay fundamentales por ahí. Alpha
  Vantage cubre tres huecos que sí importan al cuadre:
  - **`SPLITS`** — obligatorio antes de tocar el FIFO de un símbolo. Sin ajustar, una compra de 100 a
    178,04 y una venta de 1.000 a 17,80 emparejan mal y sale **una plusvalía inventada, sin ningún
    hueco que la delate**. Pásalo por `parseSplits`/`ajustarSimbolo` (`@central/module-trading::splits.ts`).
    🚨 `splits === null` = «no consultado», que NO es «no tiene splits» — el estado viaja con el
    resultado precisamente para poder decir «sin revisar».
  - **`FX_DAILY` (EUR/USD)** — el cambio del DÍA de cada operación, no el de hoy. Va por
    `parseFxDailyCsv`/`resolverTipoCambio`/`usdAEur` (`…::divisa.ts`): retrocede hasta 7 días
    naturales buscando la última sesión, **nunca mira hacia delante** (sería información que ese día
    no existía) y devuelve `null` antes que un cambio a mano. Contraste de cordura: el cambio
    ejecutado por el bróker debe caer en el `low`–`high` del día (`dentroDelRango`).
  - **`INSIDER_TRANSACTIONS` / `INSTITUTIONAL_HOLDINGS`** — segunda fuente para lo que ya tenemos
    gratis (Form 4 / Dataroma); úsalo para contrastar, no para sustituir.
  **Barrido hecho (22/08/2026):** los 18 símbolos del libro con más de 30 días de recorrido, uno a
  uno. Un solo split cae DENTRO de la ventana del libro — **NFLX 10:1 del 17/11/2025** — y la
  posición estaba **plana al cruzarlo** (última operación el 03/11, la siguiente el 17/12), así que
  el FIFO no está tocado. Los de NVDA/SMCI/NVO/NKE/COST son anteriores a la ventana;
  PLTR/META/LLY/SPOT/CRWV/APP/PAY/BRZE/HOOD/BABA/PDD/DASH no tienen. Esto **caduca**: vuelve a
  barrer antes del próximo cierre fiscal o al abrir un símbolo nuevo.
  **Backfill hecho (22/08/2026):** `trading_operaciones.tipo_cambio` ya está en **568/568, 0
  pendientes** (`tc_fuente='alpha_vantage:FX_DAILY:EUR/USD'`, `tc_fecha` = sesión usada; las 110
  fechas del libro son todas sesión, cero retrocesos). 🚨 Es el **CIERRE del día**, no el cambio
  intradía de cada orden: aproximación declarada en `tc_fuente`, **no la presentes como exacta**.
  Con eso el libro habla en euros: realizado **−1.620,94€** (2025) y **−16.053,40€** (2026);
  comisiones 451,01€. Toda operación NUEVA debe traer su `tipo_cambio` — si entra a NULL, la cifra
  en euros vuelve a ser incalculable para esa fila y el agregado miente por omisión.
  **Límite del plan del conector: no comprobado en sesión.** Si empieza a devolver avisos de cuota,
  es eso — no lo des por ilimitado ni lo metas en el bucle de la pasada diaria.
- **🚨 LANDMINE — los fundamentales de EDGAR mienten en silencio si el parser se despista
  (31/07/2026, PR #1189).** Salió mirando ORCL: la ficha daba **FCF yield +3,49%** cuando el flujo
  libre real de FY2026 era **−23.700 M$ (−6,99%)**. Cuatro fallos, todos del mismo tipo — el dato
  malo era *creíble*, así que ninguna guarda saltó. Las tres reglas que NO se pueden volver a romper
  en `lib/trading/edgar.ts`:
  1. **`fy`/`fp` identifican el INFORME, no el periodo del dato** (ese lo dan `start`/`end`). Un 10-K
     trae 2-3 comparativos con el MISMO `fy` y `filed`. Indexar por `fy` se quedaba con el más viejo
     → resultado 2 años atrasado, balance 1, y ratios cruzando ambos. **Se indexa por `end`.**
  2. **Una sola divisa por empresa.** Recorrer todas las unidades mezclaba yenes/rupias/pesos con una
     capitalización en dólares (TLK: FCF yield 2.679%; AMX: EY 9,14% que parecía normal). Gana la
     divisa con el ejercicio más reciente, USD solo desempata (Toyota arrastra una traducción de
     conveniencia de 2013). Si no es USD → EY y FCF yield a **null**; los ratios internos sí valen.
  3. **Dato ausente = `null`, jamás 0.** Capex ausente dejaba FCF ≡ CFO; deuda ausente dejaba el EV
     sin deuda. Los alias de concepto se amplían **mirando companyfacts reales**, no adivinando
     nombres (AVGO cambió de `LongTermDebtNoncurrent` a `…AndCapitalLeaseObligations` tras FY2021).
  **Cómo verificar sin credenciales:** el sandbox de las sesiones no alcanza `data.sec.gov` (403 del
  proxy), pero **`pg_net` desde Supabase sí** — `net.http_get` a `companyconcept`/`companyfacts` con
  el User-Agent de contacto y luego SQL sobre `net._http_response`. Y antes de dar por bueno un
  cambio del parser, **córrelo contra companyfacts reales**, no solo contra los fixtures: la
  regresión de la divisa (Toyota anclada a 2013) los tests sintéticos no la veían.
- **Cambiar cómo PUNTÚA el modelo ≠ arreglar el dato que entra.** Que el Piotroski siga siendo sobre
  9 aunque una señal sea incalculable es una decisión del MODELO → preregistro
  (`docs/TRADING-HIPOTESIS-PREREGISTRO.md`). Hacer que esa señal sea calculable para más empresas es
  un arreglo de DATOS y va por PR normal. No confundir los dos carriles.
- **Secretos:** usa `ALERTA_TOKEN` (bajo privilegio), nunca `CRON_SECRET` en el prompt del
  trigger, nunca inventes el token, nunca literales — por env.
- **Preflight al ARRANCAR:** `GET /api/internal/alerta` (Bearer `ALERTA_TOKEN`). Con `401`,
  protocolo `docs/AVISOS-AGENTES.md` (push nativo `🔇 SIN TELEGRAM (401):` + bitácora).
  **Nunca falles en silencio.**
- **UNA sola Rutina** ejecuta esta pasada — no recrear una segunda; si detectas dos, deja una y avisa.
- **Panel `/trading`:** ideas de compra = solo `alcista AND operada=true`; NO volver a listar
  señales sin operar. No re-añadir las secciones eliminadas de la página simplificada.
- Auth de `/api/trading/analisis-simbolo`: `accesoTrading` o token de rutina — NO volver a
  `isTradingLecturaAutorizado` ahí.

## Índice de references/ — lee SOLO el archivo que necesite la tarea
- **`references/pasada-diaria.md`** — la pasada nocturna normal: orden exacto de los 7 pasos
  (NAV→saldo, watchlist, velas, analizar, puntuar, Telegram, radar de los lunes) y las reglas
  del panel `/trading`. Léelo al ejecutar la pasada diaria del trigger.
- **`references/seleccion-y-senales.md`** — descubrimiento/cantera (capa C), señales y barreras
  del torneo (ADX, SMA50, earnings, régimen), backtest honesto, selección por factores Fase B
  (endpoints `/factores`, `/gurus`, `/fundamentales`, `/insiders`, `/seleccion`, `/validar-oos`)
  y RVOL. Léelo para explorar candidatos nuevos, tocar señales o validar selección.
- **`references/infra-forward-radar.md`** — fuentes/envs y auth de endpoints, rutina única +
  watchdog, forward paper (cohortes, curva, riesgo, atribución), radar del universo EEUU
  (crons, ranking, retrovisor, satélite 🚀, cartera cohetes), puerta a Fase 2 y protocolo del
  canal de aviso. Léelo para infra/auth, crons, el forward paper o si algo falla (401, mudo).
- **`references/copiloto-ordenes.md`** — copiloto con confirmación humana (15/08/2026):
  doctrina núcleo-satélite (ETF núcleo intocable, satélite en paper hasta Tramo 2), cuándo
  sí/no crear `create_order_instruction`, el bloque 💼 Cartera real de la pasada diaria y
  las alertas de precio, y **la distancia mínima de stop y el tamaño máximo medidos con
  `riesgo-hueco` de `@central/module-trading`** (20/08/2026: 109 de las 116 ventas de 2026
  fueron stops y perdieron 21.692,60 USD; los valores no eran el problema, la distancia sí).
  Léelo si Alberto pide preparar una orden/alerta o al montar el bloque de cartera real.
