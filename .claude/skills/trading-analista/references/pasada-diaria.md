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
