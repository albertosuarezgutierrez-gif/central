# Trading-analista — Infra, forward paper, radar y avisos

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
- **🩹 Recuperar una pasada que NO llegó a arrancar (caso real 14/08/2026):** el trigger disparó
  (`last_fired_at` 20:15:38) pero la sesión murió sin dejar NI UNA huella (ni saldo, ni Telegram, ni
  bitácora) — fallo transitorio de arranque de la plataforma, no de la config (entorno activo, otras
  rutinas corrieron bien horas después). **La pasada perdida SE PUEDE recuperar desde cualquier sesión
  con el conector IBKR** mientras el mercado no haya vuelto a abrir: se corre entera (NAV→saldo,
  watchlist, velas, `/analizar`, `/puntuar`, Telegram) con **`fecha`/`hoy` = la SESIÓN de mercado de los
  cierres** (p. ej. recuperada en sábado → `fecha` del viernes; ponerle la fecha del sábado sería la
  etiqueta corrida de `pasada-diaria.md`). Así el contador `trading_pasadas` cae en el día correcto y el
  contraste casa con su sesión (saldrá `desfasados` si la 2ª fuente aún no publicó ese cierre — declarado,
  no veta). Con muchos símbolos, delega la bajada de velas a subagentes que escriban `velas/<SIM>.json`
  UNO A UNO (protocolo anti-barajado) y ensambla el payload desde ficheros, sin datos por el contexto.
  ⚠️ Los triggers creados desde la UI de claude.ai NO se pueden disparar ni editar por MCP
  (`fire_trigger`/`update_trigger` los rechazan), y los creados por MCP no llevan conectores en esta org:
  los cambios de la Rutina van siempre por la UI (o Claude Chrome). **✅ Desde el 15/08/2026 la Rutina
  dispara DOS veces (`15 20,23 * * 1-5`) con PASO 0 de huella: el disparo de las 23:15 es la repesca y
  se apaga solo si la de las 20:15 dejó huella** — sigue siendo UNA sola Rutina; no crear otra. Si aun
  así un día mueren los dos disparos, el watchdog lo caza a la mañana siguiente y la recuperación es
  manual con este procedimiento.
- **🐕 Watchdog, 3 tramos (06/08/2026)** — cron `/api/cron/trading-watchdog` (`30 6 * * 2-6`, mar-sáb
  08:30 CEST) comprueba que la pasada nocturna dejó "anoche" sus TRES huellas: 1) el NAV de IBKR en
  `broker_saldos` (lectura del bróker), 2) el latido `trading_analizar` (análisis, `/analizar`), y 3) el
  latido `trading_puntuar` en `agente_latidos` (cierre, `/puntuar` — no escribe tabla de negocio si no hay
  tesis vencidas ni stops, por eso necesita un latido explícito). Vigilar solo el NAV dejaba un hueco: si
  IBKR da el saldo pero `/analizar` o `/puntuar` petan a medias, el watchdog callaba con el fallo tapado
  (caso real 06/08: NAV+64 tesis pero `/puntuar` nunca se llamó → stops y walk-forward congelados en
  silencio). Si falta cualquiera de las tres, avisa por Telegram (rutina borrada/pausada · IBKR caído ·
  `ALERTA_TOKEN` 401 sin redeploy). Lógica pura en `apps/plataforma/lib/trading/watchdog.ts`
  (`evaluarWatchdog`/`seEsperaRefresco`). Es la red que caza que esta pasada deje de correr.
  - **🚨 LANDMINE — una tabla IDEMPOTENTE no sirve de huella de frescura (07/08/2026, PR #1291).** El
    tramo 2 medía `max(trading_tesis.created_at)`, pero desde #1271 esa tabla tiene único
    `(simbolo,fecha,estrategia)` + `skipDuplicates`: la SEGUNDA pasada del mismo día no inserta ni una
    fila y el reloj se queda clavado en la PRIMERA. El 06/08 `/analizar` corrió a las 09:34 UTC (repaso
    manual) y otra vez esa noche → la nocturna fue un no-op en datos y a la mañana siguiente saltó
    «21 h sin refrescarse» con la pasada completa (NAV 10 h, `/puntuar` 9,9 h). Ahora la huella es el
    latido **`trading_analizar`** que escribe `/analizar` siempre, con las tesis de respaldo (`GREATEST`,
    que en Postgres ignora los NULL). Regla: si el trabajo puede ser un no-op legítimo, su huella es un
    latido, nunca la tabla de negocio. Segundo fallo del mismo aviso: el motivo llevaba «el NAV de IBKR»
    cableado para los tres tramos → decía «Análisis/tesis: el NAV de IBKR lleva 21 h…» y mandaba a mirar
    IBKR y la rutina. `evaluarWatchdog` recibe ahora `etiqueta` por tramo (con test que lo fija).

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
  `/api/trading/seleccion`. El digest recuerda cuándo toca. **Desde la cohorte 3 (17/08/2026, H5 ejecutada,
  PR #1460) la congelación es DOBLE:** además de la combinada se congela una entrada APARTE **factores-solo**
  (`simbolosFactores` de la respuesta sp500: top-10 por score de factores puros, `rankearUniverso` sin gurús
  ni puerta de calidad) — la tercera pata de atribución (gurús-solo / gurús∩calidad / factores-solo).
  Las cohortes se congelan desde el universo amplio (`{"universo":"sp500"}`), no desde la watchlist.
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
  **Veredicto detallado (15/08/2026): `docs/TRADING-FUENTES-PAGO.md`** — las fuentes de pago NO acortan el
  camino al dinero real (el reloj es el forward, no los datos); el único gasto que protege dinero real de forma
  directa es el calendario de earnings fiable + datos de mercado IBKR, y solo al abrir el Tramo 1.
- **🛑 Regla de APAGADO (firmada 15/08/2026, pre-registro):** la contraparte de la escalera — con la cesta más
  vieja a ≥365 días y ≥3 cestas distintas, si baten al SPY por mediana menos de 2/3 → capital a ETF global y
  escalera cerrada. La mide `evaluarApagado` (`puerta-fase2.ts`) y la pinta el digest semanal (línea 🛑). El
  veredicto se emite en la PRIMERA evaluación que cumpla condiciones y no se re-litiga; ejecutarlo es decisión
  de Alberto. El digest lleva además la **correlación media de cada cesta** (contexto, nunca filtro).
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
- **⚠️ `actualizado_en` en epoch NO significa «pendiente de procesar» (medido 26/08/2026).** El lote
  se elige con `WHERE simbolo IN (lista actual de la SEC)` (`universo.ts`), a propósito, para no
  arrastrar símbolos que salieron del corte. Consecuencia: una fila sembrada cuando el símbolo SÍ
  estaba en la lista y que luego cae fuera **queda con `actualizadoEn = new Date(0)` para siempre**,
  porque el `findMany` ya no la selecciona nunca. Son HUÉRFANAS, no cola de trabajo.
  Caso: `trading_universo` tenía 1248 filas para un universo de 1200; ACT, EPRT y WEX llevaban horas
  «pendientes» y estaban en las posiciones **1205, 1206 y 1214** del fichero real de la SEC (medido con
  `net.http_get` vía pg_net replicando el filtro+dedupe de `listaUniverso`; el sandbox no sale a
  internet — 403 del proxy). **Para vigilar el avance real del refresco, la condición correcta NO es
  `actualizado_en < '2000-01-01'`**, que se queda en rojo eternamente: hay que cruzar contra la lista
  viva o mirar `con_datos` sobre el tamaño del universo. Un contador que nunca puede llegar a cero
  entrena a ignorarlo.
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
- **🔭 Retrovisor (backtest INDICATIVO):** tabla `trading_backtest` — **1.018 símbolos × 178 snapshots
  mensuales** punto-en-el-tiempo por `filed` (+ SPY y lupa `_GURUS_`). **Ventana de 15 AÑOS desde el
  08/08/2026** (`MESES_RETROVISOR = 180` en `backtest-puro.ts`, subida desde 24 meses): cubre 2011-2026
  —euro, selloff 2015-16, Q4-2018, COVID, oso de 2022, ciclo actual— porque con un solo régimen H8 daba
  un resultado que se invertía de signo entre mitades y no había forma de saber cuál era el mundo.
  Cron `trading-backtest`, lote con **presupuesto de 240 s** (cada símbolo hace ~8× más CPU que con la
  ventana corta; lo que no entra conserva su `actualizadoEn` y encabeza la pasada siguiente).
  - **🚨 SESGO DE SUPERVIVENCIA, y a 15 años es severo:** el universo son los símbolos que existen HOY.
    El **nivel absoluto de retorno está inflado y NO se usa para nada**; lo válido es la comparación
    CRUZADA dentro de cada fecha (capitula vs no, con salida vs sin, quintil alto vs bajo), donde ambos
    brazos cargan el mismo sesgo. Responde «¿la señal cambia de signo según el régimen?», no «¿cuánto
    se gana?». Ningún tramo de la escalera de capital se mueve con datos de aquí.
  - **Fundamentales solo desde ~2010** (mandato XBRL de la SEC): los snapshots anteriores llevan
    piotroski/roic/ey/fcfy a `null`. Al reportar un FACTOR hay que decir sobre cuántos años se midió —
    no son los 15 que sí cubren precio y volumen.
  - **Reporte SIEMPRE partido por subperiodo, nunca solo agregado** (lección de la resolución de H8:
    un criterio de una sola cifra sobre el agregado no ve la inversión de signo).
  - Informe histórico de la ventana corta: `docs/TRADING-RETROVISOR-2026-07.md` (top-10 batió a SPY
    17/22 a 91d; momentum el único factor con spread positivo en 2024-26). Queda como registro de lo
    que se creía con 22 snapshots — **no se cita como estado del arte**.
  - NO cambiar pesos del blend por este backtest: solo si el FORWARD lo confirma.
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
No proponer ejecución real **a escala** hasta que `trading_estrategia_stats` muestre rentabilidad
sostenida y FUERA DE MUESTRA (walk-forward). Esa decisión es de Alberto y tendrá su propio spec.
⚠️ **«Solo paper» ya NO describe el estado:** la escalera de aquí abajo es precisamente el permiso
para meter dinero real ANTES de esa puerta, y **su Tramo 1 (1.000€) está abierto desde el 25/08/2026
en CVX**. Lo que la puerta de Fase 2 sigue bloqueando es pasar del techo de 6.000€, no que haya
capital real desplegado.
- **🪜 Escalera de tramos FIRMADA** (05/08/2026, `docs/TRADING-HIPOTESIS-PREREGISTRO.md` §«Plan de
  despliegue de capital REAL» + enmienda de operacionalización): 1.000€ → +2.000€ → +3.000€, techo
  6.000€ hasta validar. **SIN fecha objetivo: la suben las señales, no el calendario** (Alberto). El
  semáforo vive en `lib/trading/puerta-fase2.ts::evaluarEscalera` (puro, testeado), se pinta en
  `/trading` (🪜) y en el digest semanal del paper-tracker. No inventar criterios nuevos ni fechas.
- **Anti-duplicados (05/08/2026):** `/analizar` y `/puntuar` son idempotentes (únicos
  `trading_tesis(simbolo,fecha,estrategia)` y `trading_paper_orden(simbolo,lado,fecha)`; «posición ya
  abierta» es barrera y deja `motivo_bloqueo`). `trading_pasadas` cuenta ejecuciones/día y avisa por
  Telegram si la pasada corre 2 veces. `trading_paper_orden.precio_dia_siguiente` = deslizamiento
  (lo rellena `/puntuar`); NULL = sin dato, no 0.

- **🛡️ Higiene del precio en los endpoints (08/08/2026, PRs #1315 y #1317).** Ni `/analizar` ni
  `/puntuar` se creen ya los precios que manda la sesión. Dos filtros en cadena, ambos con la regla de
  tres estados (sin con qué comparar → NO se juzga y el precio pasa):
  1. **Guardia del ×2** (`lib/trading/precios-guardia.ts::filtrarPreciosAnomalos`) contra el último
     `precio_ref` ANTERIOR a hoy — nunca el de hoy, que vendría envenenado por las dos puntas.
  2. **Contraste con 2ª fuente** (`contrastarFuentes` + `precios-contraste.ts`): el MISMO cierre pedido
     a Stooq→Yahoo, tolerancia 2%, presupuesto de tiempo y concurrencia 8. **Solo vale el cierre de la
     MISMA sesión** (`juzgarPuntos`): si la fuente aún publica el de ayer sale en `desfasados`, y eso
     NO veta — es un «no lo sé», y se canta en el latido. Hasta el 10/08/2026 se aceptaba cualquier
     cierre de los últimos 5 días y se usaba *como si* fuera el de hoy: esa noche la pasada corrió a las
     20:33 UTC, Stooq todavía daba el cierre del viernes 07/08 y la guardia leyó el hueco del fin de
     semana como divergencia → **8 de 21 símbolos vetados en `/analizar` y 5 precios descartados en
     `/puntuar`, ninguno mal** (PR #1363). A la hora de la pasada la fuente casi nunca tiene el cierre
     del día, así que este contraste del MISMO día está inerte casi todas las noches y el latido lo dice.
  3. **Contraste DIFERIDO** (`juzgarDiferido` + `/puntuar`, decisión de Alberto del 11/08/2026 frente a
     un cron aparte): lo que la fuente SÍ publica es el cierre de la sesión ANTERIOR, y de esa sesión ya
     tenemos nuestro `precio_ref`. Se comparan las últimas **3 sesiones** por símbolo; lo que la fuente
     desmiente >2% **anula la tesis y su resultado** (marcadas con el motivo, nunca borradas) ANTES de
     recalcular `trading_estrategia_stats`. Va lo PRIMERO de la ruta: un `precio_ref` que se acaba de
     declarar falso no puede servir de referencia a las guardias 1 y 2 de esa misma pasada. **NO toca
     `trading_paper_orden`** — la compra paper ocurrió. Dos frenos, ambos testeados:
     · **split/ajuste ≠ precio malo** — si TODAS las sesiones de la ventana están desplazadas por el
       MISMO factor (±1%), es un reescalado del histórico y no se anula nada (con una sola sesión no hay
       forma de distinguirlo, y ahí sí se anula: perder una tesis cuesta un dato, conservar una
       envenenada mueve el torneo);
     · **fuente rota ≠ corpus envenenado** — si discrepa en más de la mitad de los símbolos (con ≥4
       símbolos con dato; con menos la fracción no significa nada) no se anula NADA y se avisa.
     · **etiqueta corrida ≠ precio malo** (`ETIQUETA_TOL`, PR #1382) — una pasada ejecutada ANTES del
       cierre guarda bajo la fecha de hoy el cierre de AYER. La firma: el ref se parece al cierre de la
       sesión anterior mucho más que al de la suya. Se aparta como no juzgable y NO se anula. Caso real
       verificado contra IBKR: el repaso manual del 06/08/2026 (09:34 UTC) dejó MSFT en 487,46 con cierre
       real 499,86 (−2,48%, por encima del umbral) y 487,46 = cierre exacto del 05/08.
     Todo se canta por Telegram y en el latido, incluso cuando la decisión es no anular.
     **Estado en vivo (11/08/2026, primera pasada con el arreglo):** 22 símbolos analizados (13 la
     víspera), **0 vetados**, 0 anulados, y el latido cantando «2ª fuente aún sin el cierre de hoy
     (22 símbolos con dato de 2026-08-10): sin contrastar, no vetado».
  4. **Rescate de TESIS HUÉRFANAS** (`juzgarHuerfana` + `/puntuar`, 12/08/2026). No es una guardia del
     precio sino del **sesgo de supervivencia**: `/puntuar` solo sabía puntuar con el precio que trae la
     pasada, así que una tesis cuyo símbolo SALIÓ del universo se quedaba `resultado: null` para siempre,
     sin contar y sin salir en ningún recuento. Encontradas **16** así (CEG, ISRG, SYM, UEC — tesis del
     18/07 vencidas el 28/07) al verificar la pasada del 12/08. Ahora, pasada la gracia de 3 días desde el
     vencimiento, se piden a la 2ª fuente y se puntúan con **el cierre de su sesión de vencimiento** (no
     con el de hoy: medir una ventana de 10 días con el precio de 25 días después es el error de periodo
     de siempre), con `precio_fuente='contraste'`. Dos guardas:
     · **ancla** — el `precio_ref` debe cuadrar (±2%) con una de las DOS últimas sesiones que la fuente
       publica hasta la fecha de la tesis. Valida escala (la fuente publica histórico AJUSTADO por
       splits; nuestro ref es sin ajustar) e identidad (ticker reciclado). 🚨 **NO puede pedir la fecha
       exacta**: la fecha de una tesis es la de la PASADA y las pasadas no siempre caen en sesión — las 16
       reales son de un SÁBADO y sus cuatro refs son, al céntimo, el cierre del viernes anterior
       (verificado contra IBKR). La 2ª candidata cubre además la etiqueta corrida del punto 3.
     · **ventana** — vale el primer cierre en o tras el vencimiento y solo dentro de 5 días naturales;
       más tarde mediría deriva, no la ventana (mismo corte que el proxy de deslizamiento).
     Tras 60 días se deja de reintentar pero **se sigue contando**: el hueco se declara, no se olvida.
     Telegram solo cuando se escribe en el track record o un hueco queda cerrado para siempre; el estado
     permanente vive en el latido y en `huerfanas` de la respuesta.
  En `/puntuar` se contrastan solo los símbolos que se van a usar; en `/analizar`, el universo, y el
  símbolo divergente **se salta ENTERO** porque sus velas contaminan EMA/MACD/RSI/ADX. Las respuestas
  traen `vetados`/`descartados`/`divergentes`/`contraste.sinJuzgar`/`huerfanas` y **hay que cantarlo en
  el Telegram**.
  Origen: el 03/08 entró `CVX = 590,17$` (cierre real 193,18$), puntuó 12 tesis —tres a +205 pp— y movió
  `trading_estrategia_stats`: momentum de **−0,40 pp a +7,18 pp** de media, con `ajustesDeStats` activo
  (n=81) inclinando el torneo cinco días.
- **`trading_tesis.precio_fuente` / `trading_tesis_resultado.precio_fuente`** (default `'sesion'`):
  procedencia del precio, patrón `market_rates.fuente`. Un cierre de IBKR y uno de Stooq no son el mismo
  dato. Es el requisito que faltaba para poder recuperar `/puntuar` sin la sesión (los `body.precios` son
  cierres y el servidor tiene fuente propia; `/saldo` y `/analizar` NO son recuperables porque dependen
  del NAV, que solo existe en el MCP de IBKR).
- **`ventana_dias` = días REALES transcurridos**, no el horizonte declarado: si una pasada no corre o la
  guardia difiere el scoring, etiquetar 13 días como 10 sería leer un dato bueno con el periodo malo.
- **Salto del NAV >15% → aviso por Telegram, sin bloquear** (`/api/trading/saldo`). Puede ser un ingreso
  real de Alberto o una lectura rota, y el servidor no puede distinguirlos; con el NAV se dimensiona cada
  posición, así que la pregunta la contesta él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
