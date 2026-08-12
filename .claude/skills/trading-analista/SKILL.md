---
name: trading-analista
description: Pasada diaria del agente de inversión sobre Interactive Brokers (Fase 1, SOLO paper). Lee cartera + watchlist, tira precios (IBKR) y fundamentales (FMP) por MCP, llama a /api/trading/analizar y /api/trading/puntuar de plataforma, y resume por Telegram. NUNCA ejecuta órdenes reales.
---

# Trading-analista (Fase 1 · paper) — router

## Qué hace la pasada diaria
Lee el NAV de IBKR (`get_account_summary`) y lo empuja a `/api/trading/saldo`; carga la
watchlist activa, baja velas diarias por símbolo (IBKR) y fundamentales (FMP best-effort);
llama a `POST /api/trading/analizar` (torneo + barreras + aperturas paper) y a
`POST /api/trading/puntuar` (walk-forward + stops paper); resume por Telegram (importes
en formato español) y, los lunes, comenta el radar/satélite 🚀 del snapshot semanal.
Detalle paso a paso en `references/pasada-diaria.md`.

## 🚨 No romper / crítico
- **Regla de oro: NO ejecutar NINGUNA orden real en IBKR.** Solo lectura (`get_account_*`,
  `get_price_history`, `get_price_snapshot`, `get_watchlist`) y endpoints de plataforma.
  Operativa 100% simulada en BD. Si dudas, no operas. Aplica también a la cartera de
  estudio (30.000€ SIMULADOS) y a la cartera cohetes: cero órdenes reales, siempre.
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
- **⛔ INTRADÍA, objetivo diario fijo y cruces de medias: DESCARTADOS con datos (12/08/2026).** No
  propongas operativa intradía, ni un objetivo de «X% al día», ni entradas por cruce de medias.
  Medido sobre las 227 ejecuciones REALES de la cuenta en 2026: cuanto más corto el horizonte, peor
  el retorno, de forma monótona — **−1,88% de media a <1 día (n=106) frente a +1,16% a >10 días**.
  El cruce de medias YA está en el torneo (`momentum` = EMA12/26 + MACD) y es la PEOR de las cuatro
  estrategias: hit 24,1%, retorno medio **−0,63%** (n=116). Cruce y MACD **no son dos señales**: la
  línea MACD ES ema12−ema26 (ver `estrategias.ts:10-12`), así que «confirmar» una con otra es
  contarse la misma señal dos veces. Backtest propio sobre SPY 30 min / 77 sesiones: ninguna
  variante bate a comprar y no tocar, y forzar el cierre diario destruye del 65% al 100% del
  retorno de la misma señal. **Veredicto completo y método en `docs/INVERSION-VEREDICTO-2026-08.md`.**
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
