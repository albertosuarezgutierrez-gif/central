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
  - **🚨 LANDMINE — una tabla IDEMPOTENTE no sirve de huella de frescura (07/08/2026, PR #1290).** El
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

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
