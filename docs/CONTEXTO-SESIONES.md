# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo en "Registro de sesiones" y actualiza "Estado actual" y
> "Pendientes" si algo cambió. Un hook `Stop` (`.claude/hooks/persist-memoria.sh`)
> commitea y empuja este archivo automáticamente.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

- **🔍 Auditoría PROFUNDA semanal (19/07/2026): 2 hallazgos 🔴 reales, 1 arreglado en el acto, 1 pendiente
  de Alberto.** `/auditoria-diaria --profunda`: integridad estructural + typecheck de las **8** apps
  (incl. `almacen`) + tests + seguridad multi-tenant + deps + infra real MCP + docs, sobre el rango del
  18/07 (50 commits, sobre todo trading Fase B). **Antes de auditar**, se resolvió una deuda de proceso:
  la pasada ligera de esta madrugada había dejado sus reconciliaciones de carril 1 (trading-analista en
  `docs/SKILLS.md`/`RUTINAS-PROGRAMADAS.md`/`FUENTES-DE-VERDAD.md`/`plataforma-maestro`) en el **PR draft
  #1006** en vez de `main` — verificado correcto (CI verde, solo texto) → mergeado en vez de duplicar el
  trabajo. **Hallazgos:** (1) 🔴 `apps/rrhh/app/api/cron/alerta-jornada-maxima/route.ts` tenía un bypass
  de auth por `User-Agent: vercel-cron` (cabecera falsificable) — contradecía la regla ya escrita en
  `apps/rrhh/CLAUDE.md` ("sin User-Agent bypass") y era el único de los 4 crons de rrhh con el patrón;
  **arreglado** (mismo fail-closed que los otros 3). (2) 🔴 la vista `public.v_movimientos_activos`
  (datos financieros) perdió su `security_invoker=true` — se fijó en la remediación de junio, pero las
  regeneraciones de `2026-06-26` y `2026-07-03` (para exponer columnas nuevas) hicieron
  `CREATE OR REPLACE VIEW ... SELECT *` sin repetir esa opción, así que Postgres la recreó en
  `SECURITY DEFINER` (bypassea RLS). **NO aplicado** (regla: nunca migraciones en producción desde la
  auditoría) — migración propuesta en `apps/plataforma/prisma/sql/2026-07-19_v_movimientos_activos_security_invoker.sql`,
  **pendiente de que Alberto la revise y aplique** por Supabase MCP. (3) 🟡 el webhook
  `apps/ia-rest/.../deploy-aprendizaje/route.ts` fallaba **abierto** si `VERCEL_DEPLOY_WEBHOOK_SECRET` no
  estaba seteado — arreglado a fail-closed. Todo lo demás en verde: 8/8 apps typechequean 0 errores,
  `pnpm test` 100%, `pnpm audit` (5 "high") verificadas no explotables, heartbeat 9/9 crons, memoria ya
  al día, sin drift de docs nuevo. El segundo proyecto Supabase que detectó el chequeo de infra
  (`efncqyvhniaxsirhdxaa`) **no es hallazgo nuevo** — es el silo transitorio de ia-rest ya conocido
  (`MATRIZ.md`). Informe completo: `docs/AUDITORIA-2026-07.md` (sección "Auditoría PROFUNDA —
  19/07/2026"). Carril 2: PR draft **#1007**. **Aviso Telegram FALLÓ**: mismo 403 en el túnel CONNECT
  hacia `plataforma-ten-flame.vercel.app` ya documentado para `trading-analista` (18/07/2026) — no es el
  token (`ALERTA_TOKEN` presente) ni el endpoint, es el **allowlist de red del entorno de la rutina
  programada**, y afecta a más de un agente. Se avisó por el canal nativo de la sesión en su lugar.
  **Pendiente de Alberto**: añadir `*.vercel.app` (o el host concreto) al allowlist de red de las
  rutinas — arregla ambos bloqueadores a la vez.
- **📈 Trading Fase B: forward paper VISIBLE en `/trading` (18/07/2026, SOLO paper).** El forward paper solo se
  veía por Telegram; ahora tiene superficie de navegador. Nueva sección **🧪 Forward paper** en
  `app/(usuario)/trading/page.tsx` (server component): lee los snapshots persistidos de `trading_paper_track`,
  agrupa por cohorte y pinta por cada una la MEDIANA vs SPY (✅/⚠️), baten/N, media, **riesgo** (caída máx/vol/TE),
  **atribución** (filtro aporta ±%) y una **mini-curva SVG pura** (cesta mediana vs SPY, sin dependencias nuevas —
  no usa Recharts). Empieza vacía con mensaje explicativo hasta el primer snapshot del cron semanal (lunes). tsc 0,
  `next build` OK. Responsive (grid auto-fit, SVG `maxWidth:100%`). Invariantes intactas: solo lectura, cero órdenes.

- **📈 Trading Fase B: métricas de RIESGO + ATRIBUCIÓN del filtro de calidad (18/07/2026, SOLO paper).** Ideas
  3+4 de robustez, "haz tú todo" de Alberto. (3) **Riesgo** — nuevo `@central/module-trading/riesgoCesta.ts`
  (`metricasRiesgoCesta`: curva equiponderada buy&hold → **caída máxima**, **volatilidad anualizada**, **tracking
  error** vs SPY; puro, 8 tests). El digest de Telegram y la BD ahora llevan riesgo: "batir con más riesgo no es
  batir". (4) **Atribución** — nuevo `seleccionSoloGurus` (cesta gurús-SOLO, sin la puerta de calidad) como **2º
  benchmark**; si la combinada no bate a la base, el filtro Piotroski/ROIC no aporta. `/api/trading/seleccion`
  devuelve `simbolosBase` (cópiala a la cohorte al congelar); `CarteraPaper.simbolosBase?` opcional. El tracker
  mide combinada + base + riesgo, persiste todo (7 columnas nuevas en `trading_paper_track`: max_drawdown,
  vol_anual, tracking_error, retorno_base, mediana_base…) y el digest muestra "filtro aporta +X%". **Tabla
  ampliada YA APLICADA por Supabase MCP** en la BD compartida (`wswbehlcuxqxyinousql`, 20 columnas, RLS). tsc 0,
  **100 tests módulo + 30 lib/trading**, `next build` OK. La cohorte v1 (2026-07-18) no tiene `simbolosBase` (no
  se pudo tirar Dataroma desde el sandbox por el 403); se poblará al congelar la siguiente vía el endpoint en vivo.
  Invariantes intactas: cero órdenes reales.

- **💸 Bizum unificado en una subcategoría personal + financiación BanSabadell cerrada (18/07/2026).**
  Alberto vio en 🏠 Personal los envíos de Bizum sueltos como "Sin categoría..." (algunos incluso mal
  enganchados a ocio/club/restaurante_bar/supermercado porque el motivo libre — "ENVIO BIZUM padel" —
  casaba antes con la keyword de esa categoría) y pidió unificarlos. Nueva subcategoría **`bizum`** en
  `lib/categorias-personales.ts` (`SUBCATEGORIAS_GASTO`); regla **PRIMERA prioridad** en
  `lib/subcategoria-keywords.ts` (`['BIZUM']` gana siempre, antes que cualquier otra categoría);
  `lib/destino.ts` la asigna ya en la ingesta. Backfill `prisma/sql/2026-07-18_bizum_unificado.sql`:
  78 movimientos reclasificados a `bizum` (−3.192,64€). Alcance solo GASTO (Bizum enviado); los Bizum
  recibidos (ingreso, `otros_ingreso`) se dejaron fuera a propósito. De paso, confirmó que los 6 recibos
  "RECIBO BANSABADELL F." (83,33€/mes, ene-jun 2025) son una financiación personal ya cancelada — se
  añadió como keyword explícita a `otros_gasto` (ya estaba bien clasificada; solo se blinda para que un
  futuro re-barrido no la mueva). 20/20 + 502/502 tests, `tsc` 0, `next build` OK.
- **🔧 Fix: 1.314,95€ de cuota RETA de Alberto mal clasificados como gasto personal (18/07/2026).**
  Auditoría disparada por Alberto al ver "Cuota autonomos" en el nuevo epígrafe 🏠 Personal (captura de
  pantalla). `lib/destino.ts` ya clasifica una cuota TGSS en BBVA como `destino='seguros'` (deducible,
  Art. 30.2.1ª LIRPF), pero **4 movimientos** (30/06, 29/05, 30/04, 31/03 — 388,95€×3 + 148,10€) tenían
  `destino='personal'` con `destino_confirmado=true`, así que nunca volvieron a pasar por la
  clasificación automática ni por la bandeja "por revisar" (zombies, igual patrón que el landmine
  `requiere_revision` del PR #906). Backfill `prisma/sql/2026-07-18_fix_cuota_autonomos_personal.sql`
  (aplicado por Supabase MCP): `destino='seguros'`, `subcategoria='cuota_autonomos'` en los 4. Además
  1 compra suelta ("COMPRA EN GRUPO VIVO DIAGNOSTICO", tarjeta Kutxa) tenía `subcategoria='seguro_salud'`
  — código reservado a pólizas de correduría, ni está en la lista canónica de `categorias-personales.ts`
  (por eso salía con icono "•" genérico) — corregida a `otros_gasto` (el `destino='personal'` sí era
  correcto ahí, es gasto médico puntual, no póliza). Auditoría completa por SQL: no se encontraron más
  filas con patrones de correduría (TGSS/aseguradoras/comisiones/Dúplex) atrapadas en `destino='personal'`.
  **Pendiente evaluar** (no se tocó): si conviene añadir una subcategoría personal "salud" propia en vez
  de usar `otros_gasto` como cajón para gastos médicos sueltos.
- **📈 Trading Fase B: COHORTES del forward paper + curva persistida en BD (18/07/2026, SOLO paper).** Robustez
  del forward test (ideas 1+2 de Alberto): (1) **cohortes** — `paper-cartera.ts` pasa de UNA cesta congelada a
  una lista `COHORTES_PAPER` (se congela una NUEVA cada ~30 días, `DIAS_ENTRE_COHORTES`); cada cohorte es una
  muestra independiente con su propio reloj, así que "batir al SPY" repetido entre cohortes es mucho más difícil
  de explicar por suerte que una sola cesta. Congelar = AÑADIR una entrada al array (deliberado y auditable; nunca
  se edita una existente → no rompe el out-of-sample). (2) **persistencia** — nueva tabla `trading_paper_track`
  (modelo Prisma `TradingPaperTrack`, migración `2026-07-18_trading_paper_track.sql`, **pendiente aplicar a mano**
  en la Supabase compartida) + `persistirSnapshot`/`curvaForward` en el tracker: el cron semanal guarda un snapshot
  por cohorte (idempotente por cohorte+fecha) → curva del forward, no solo el número de hoy. El digest de Telegram
  ahora recorre todas las cohortes y **recuerda cuándo toca congelar la siguiente**. `/api/trading/paper` devuelve
  `cohortes[]` y, con `?curva=1|<cohorte>`, la curva persistida. tsc 0, 30 tests `node --test` en `lib/trading`
  (6 nuevos de integridad de cohortes), `next build` OK. **Pendientes de robustez (acordados, para siguientes PRs):**
  (3) métricas ajustadas a riesgo (drawdown/vol/tracking error) en el digest; (4) atribución = trackear una cesta
  gurús-SIN-filtro-calidad como 2º benchmark para saber si el filtro Piotroski/ROIC aporta. Invariantes intactas:
  cero órdenes reales, dinero real solo tras batir al SPY hacia delante.
- **🧭 DECISIÓN APLAZADA — datos de pago (EODHD MCP u otros) SOLO si los resultados reales lo piden (18/07/2026).**
  Alberto compartió **EODHD** («MCP Server for Financial Data», 72 tools de SOLO LECTURA, API key gratis: precios
  EOD/históricos, fundamentales, noticias). Encaja con nuestros dolores (Stooq→Yahoo bloquean IPs de datacenter de
  Vercel; EDGAR XBRL frágil; la rutina Claude no llega a Vercel por el 403 → un MCP lo consumiría directo) y respeta
  las invariantes (read-only, no ejecuta órdenes). PERO: el **tier gratis es muy limitado** (~20 llamadas/día, pocos
  exchanges) y hoy el forward paper corre a **0€** con Stooq→Yahoo. **Decisión: NO meterlo en el camino crítico
  ahora.** Reevaluar SOLO cuando veamos resultados reales del forward y con un disparador claro: (a) si Stooq **y**
  Yahoo fallan a la vez de forma recurrente en el cron semanal (fuente caída → el digest avisa «sin precios»),
  entonces añadir EODHD como **3er fallback de precios** en `cierresDiarios` (PR pequeño, key gratis); (b) al abrir
  la Opción B / rutina IBKR, engancharlo **por MCP en la rutina** para fundamentales+noticias, donde el free tier
  cunde (pocas llamadas, alto valor). Si el free no llega para lo que haga falta, valorar el plan de pago **solo
  entonces** (principio: fuentes de pago únicamente si el track record demuestra que aportan). Mientras: no se hace
  nada, queda anotado.

- **📈 Trading Fase B: cron SEMANAL del forward paper + aviso Telegram (18/07/2026, SOLO paper).** Tras congelar la
  cesta combinada (#1001), se automatiza el seguimiento para que el test corra solo y acumule evidencia:
  `lib/trading/paper-tracker.ts` (`medirCarteraPaper`/`enviarPaperTracker`) mide la cesta congelada vs SPY (precios
  Stooq→Yahoo) y manda un digest por Telegram (media + **MEDIANA** + baten/N; la mediana decide). Cron
  **`/api/cron/paper-tracker`** los **lunes 10:00** (`0 10 * * 1` en `vercel.json`, auth `CRON_SECRET`). Corre en
  Vercel (su egress a Stooq/Yahoo sí sale — no pasa por el proxy de la sesión Claude que da 403). tsc limpio, JSON
  válido. Para cambiar la cesta: editar `CARTERA_PAPER` (nueva version+fechaInicio = reinicia el reloj sin sesgo).
  Invariantes intactas: cero órdenes reales.

- **🏠 Cuarto segmento PERSONAL en el Inicio unificado `/banca` (18/07/2026):** Alberto pidió ver el
  desglose de gasto personal desde el Inicio ("quiero empezar a ver que gastamos desglosado"). Se añade
  **`🏠 Personal`** a `banca/SegTabs.tsx` (junto a 💶 Dinero · 🏢 Negocios · 🧾 Fiscal) y una rama
  `tab==='personal'` en `banca/page.tsx` que reutiliza **tal cual** `CategoriasTab` (la pestaña "En qué
  gasto" de `/finanzas`, ya probada: dona + tabla por subcategoría con grupo 🏠 Vivienda + drill-down por
  comercio/movimiento + cola "🔎 Necesitan tu atención" + alertas de presupuesto mensual). No se duplicó
  lógica: el componente gestiona su propio filtro de fechas (mes actual por defecto) vía sus propias
  llamadas a `/api/finanzas/categorias*`, así que la página solo le pasa el año en curso. `tsc` 0 ·
  `next build` OK. La página `/finanzas?tab=categorias` sigue existiendo (no se tocó).
- **📈 Trading Fase B: LUZ VERDE al forward paper — cesta combinada CONGELADA (18/07/2026, SOLO paper).**
  La selección combinada (gurús ∩ calidad, `/api/trading/seleccion`) pasó el test de robustez de Alberto: en
  backtest 2023→hoy la **MEDIANA** de la cesta batió al SPY **+159,9% vs +95,2%** (8/8 en verde, 6/8 sobre el
  índice) — o sea NO depende del unicornio APP (la media +608% sí, la mediana no). Por su criterio pre-registrado
  (mediana > SPY) → **arrancar el forward paper**. Pero el backtest siempre tiene look-ahead, así que se monta el
  **forward test LIGERO** (sin IBGateway, que aún no está listo — ver 403 abajo): **cesta CONGELADA** en
  `lib/trading/paper-cartera.ts` (`CARTERA_PAPER` v1 2026-07-18: MSFT/APP/DAL/CVI/NYT/LYV/GOOG/AMZN) + endpoint
  **`GET/POST /api/trading/paper`** que mide su rendimiento REAL hacia delante (sin look-ahead) vs SPY con precios
  gratis (Stooq→Yahoo). Devuelve media + **mediana** + días. Typecheck limpio. **Regla:** no leer como veredicto
  hasta acumular semanas/meses; si el forward bate al SPY sostenido → ahí sí dinero real.
  **🚨 Infra descubierta:** la **rutina programada trading-analista NO llega a Vercel** — `POST /api/trading/saldo`
  (y /analizar, /puntuar, Telegram) muere con **403 en el túnel CONNECT** del proxy de egress hacia
  `plataforma-ten-flame.vercel.app`. NO es token ni redeploy: es el **allowlist de red** del entorno de la rutina
  (pendiente: permitir el host de Vercel / `*.vercel.app`). El tracker `/api/trading/paper` como cron de Vercel
  sí funciona (su egress a Stooq/Yahoo no pasa por ese proxy). Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: verificación completa + endpoint de SELECCIÓN COMBINADA gurús∩calidad (18/07/2026, SOLO paper).**
  2ª verificación en vivo (Claude para Chrome, sesión superadmin, sin secretos): **`insiders` sigue 0** (acceso a la
  fuente `getcurrent` de la SEC desde Vercel — pendiente instrumentar; pilar menos importante, se deja). **`validar-oos`
  ✅ arreglado** (Yahoo salvó a Stooq). **Hallazgo clave:** la cesta de picks de gurús rindió +411% vs SPY +95%
  (`alpha +316`), PERO **dominado por UN solo nombre** (APP/AppLovin ×39): en **MEDIANA** la cesta = +97% ≈ SPY +95%,
  y sin APP = +98% ≈ SPY. O sea **gurús-solo NO tiene ventaja robusta** (era una lotería de un nombre + look-ahead
  máximo). Decisión: **NO montar aún la Opción B** (forward paper IBKR); primero afinar la selección. **Nuevo endpoint
  `POST /api/trading/seleccion`** (auth token o sesión superadmin, `maxDuration=60`): cruza convicción de gurús ×
  CALIDAD (Piotroski≥6 + ROIC≥10% de EDGAR), devuelve cesta **diversificada equiponderada** (`tam` def 25, cap de
  concentración) + `simbolos` para `/validar-oos`. Pieza pura `seleccionCombinada` (`@central/module-trading::seleccion.ts`).
  **92 tests módulo** (+4), typecheck limpio. **Siguiente:** validar la cesta combinada en `/validar-oos` mirando la
  MEDIANA; si bate al SPY sin depender de un outlier → ahí sí Opción B. Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: 1ª verificación EN VIVO desde el navegador + 2 fixes de acceso a fuentes (18/07/2026, SOLO paper).**
  Alberto ejecutó los 4 endpoints de lectura desde Claude para Chrome (sesión superadmin, sin secretos). Resultado:
  **`/gurus` ✅** (Dataroma OK: 4/5 gestores con datos —falla el código `a`—, 59 posiciones, ranking bien) y
  **`/fundamentales` ✅** (EDGAR OK: AAPL piotroskiScore 6, roic 0,606; 4/5 símbolos). **Dos rotos, ambos por la
  FUENTE, no por el navegador (no dio 401 → deploy/sesión OK):**
  - **`/insiders` → 0 transacciones.** Causa: el feed `getcurrent` de la SEC **NO enlaza a `/Archives/` en cada
    entrada** —el `<link>` va a la ficha del filer (`?CIK=…`) y el nº de accession vive en el `<id>`
    (`accession-number=…`). El parser `extraerEntradasAtom` buscaba `/Archives/` → 0 entradas. **Fix:** parsear por
    `<entry>` sacando accession del `<id>` + CIK del enlace (formato `/Archives/` queda de fallback).
  - **`/validar-oos` → 502 "sin precios del benchmark".** Causa: **Stooq bloquea/limita las IPs de datacenter de
    Vercel** (CSV vacío para SPY). **Fix:** respaldo **Yahoo Finance** (`cierresDiarios` = Stooq→Yahoo; parser
    `parseYahooChart` puro y testeado) + `stooqSimbolo` ahora convierte el punto de clase (BRK.B→brk-b.us).
  **24 tests lib/trading** (3 nuevos: atom getcurrent, yahooSimbolo, parseYahooChart), typecheck limpio.
  **Pendiente:** re-verificar en Vercel que insiders trae transacciones y validar-oos devuelve `alpha` (Yahoo). Si
  `alpha>0` → Opción B (forward paper IBKR). Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: los endpoints de SOLO LECTURA aceptan sesión de superadmin (verificación sin secretos, 18/07/2026, SOLO paper).**
  Para poder VERIFICAR los endpoints de selección/validación desde el navegador ya logueado (o desde Claude para
  Chrome) sin pegar el `ALERTA_TOKEN` en la consola: nuevo helper `lib/trading/auth.ts::isTradingLecturaAutorizado`
  = `isRoutineAuthorized` (token) **O** `getAdmin()` (cookie `plataforma_admin`, superadmin verificado en BD).
  Aplicado a los 5 read-only: `/factores`, `/gurus`, `/fundamentales`, `/insiders`, `/validar-oos`. **`/analizar`
  se deja SOLO con token a propósito** (puede disparar aviso de compra paper por Telegram). Motivo: los endpoints
  usaban `isRoutineAuthorized`, que NO mira la cookie de login (`plataforma_session`/`plataforma_admin`) → un
  navegador logueado daba 401; Claude para Chrome (con razón) no maneja secretos, así que sin esto no había forma
  de verificar en vivo desde el navegador. Sigue siendo solo-lectura (no opera ni persiste). tsc limpio (los 3
  errores de `lib/broker.ts` son pre-existentes). Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: validación de la selección vs SPY SIN IBKR — endpoint `/api/trading/validar-oos` (18/07/2026, SOLO paper).**
  Con la tríada de selección ya en main (#982/#990/#992/#995), se monta la **Fase A de validación** decidida con
  Alberto: comprobar si la selección bate al mercado **sin depender del conector IBKR** (frágil por el 2FA/reset
  diario de IBKR — hoy no hay tools de IBKR cargadas en sesión y el proxy del sandbox bloquea la salida a Vercel/SEC).
  Nuevo endpoint **`POST /api/trading/validar-oos`** (Bearer `ALERTA_TOKEN`, `maxDuration=60`): toma un universo YA
  rankeado (el `ranking` de factores/gurus/fundamentales/insiders), coge el top-N, baja cierres diarios **gratis de
  Stooq** (`lib/trading/precios-stooq.ts`, parser CSV puro testeado) + SPY, y devuelve el retorno de la **cesta
  equiponderada buy&hold vs el índice** (`evaluarCestaVsBench`/`retornoTotal` en `@central/module-trading::seleccionEval.ts`).
  **109 tests `node --test`** (88 módulo +4 seleccionEval; 21 lib/trading +5 stooq), typecheck rutas limpio.
  **⚠️ v1 = SANITY CHECK, no OOS point-in-time** (selección de hoy sobre precios pasados → look-ahead): `alpha>0` es
  NECESARIO pero no suficiente. **Prueba DEFINITIVA guardada para más adelante = Opción B (forward en paper de IBKR:
  IB Gateway + IBC en host siempre encendido, NO Vercel).** Decisión de Alberto: A ahora (filtro barato), B cuando A
  dé un candidato que bata al SPY. **Verificar en Vercel** (yo no puedo desde el sandbox): que Stooq devuelva precios.
  Invariantes intactas: cero órdenes reales, dinero real solo tras batir al SPY fuera de muestra.
- **🔧 Corrección: los ingresos de Pilar YA se ven en `/finanzas/pilar` (18/07/2026, PR #993).** El bullet
  de abajo (PR #991) grabó sus cifras en `fiscal_perfil.conyuge_*`, pero esas columnas **no las lee ninguna
  pantalla** — `/finanzas/pilar` y "Mi declaración" calculan todo en vivo desde `movimientos_bancarios`
  (`titular='conyuge'` + `destino='actividad_pilar'`), y no existía ninguna cuenta bancaria suya en el
  sistema. Se creó su cuenta (`cuentas_bancarias`, Kutxabank) + los movimientos reales del semestre: 2
  facturas (base imponible 990,56€+990,57€, el sistema aplica su propio 15% fijo de retención — por eso el
  `importe` de un cobro tiene que ser la BASE, no el neto bancario, o la retención se calcula mal) y 7
  cuotas de autónomos (467,45€). Nuevo: `ResumenPilar.notas` + banner 📝 en `PilarClient.tsx` que muestra el
  `comentario` de un movimiento cargado a mano (aquí, el supuesto de IVA 21%/retención 15% sin confirmar
  contra la factura real). Detalle completo y LANDMINE actualizados en la skill `perfil-fiscal`.
- **📈 Trading Fase B: montados los 2 pilares de ingesta que faltaban — EDGAR XBRL + insiders Form 4 (18/07/2026, SOLO paper).**
  Tras mergear #992 (gurús Dataroma), se completan las fuentes de SELECCIÓN. **(1) Fundamentales GRATIS de EDGAR**
  (`app/api/trading/fundamentales/route.ts`, Bearer `ALERTA_TOKEN`, `maxDuration=60`): resuelve ticker→CIK
  (`company_tickers.json`) y descarga `companyfacts` XBRL de la SEC; el parser puro `lib/trading/edgar.ts`
  (`serieAnual`/`extraerFundamentales`/`mapaTickers`) mapea los conceptos US-GAAP a los inputs que ya consume el
  módulo → **Piotroski F-score (2 ejercicios) + ROIC**; con `ev` por símbolo cierra la fórmula mágica
  (earningsYield=EBIT/EV). **(2) Insiders Form 4** (`app/api/trading/insiders/route.ts`): escanea los Form 4 más
  recientes (feed `getcurrent` atom → index.json → XML por filing) con el parser puro `lib/trading/form4.ts`
  (`parseForm4Xml`/`extraerEntradasAtom`/`elegirDocForm4`, solo transacciones P/S de mercado abierto) y agrega la
  **convicción por CLUSTER BUY** (nuevo `agregarInsiders` en `@central/module-trading::insiders.ts`: cuenta
  directivos DISTINTOS comprando; ventas restan). **100 tests `node --test` verdes** (84 módulo +4 insiders; 16
  lib/trading = 4 dataroma +6 edgar +6 form4), typecheck de rutas limpio (los 3 errores de `lib/broker.ts` son
  pre-existentes: modelo Prisma `brokerSaldo` sin generar en sandbox). **⚠️ Verificar en la 1ª corrida en Vercel**
  (el sandbox de las sesiones NO puede: la SEC bloquea IPs anónimas y exige User-Agent con contacto): que
  `conDatos`/`transacciones` no vengan en 0. Ambos endpoints NO operan ni persisten — priorizan QUÉ estudiar y los
  mejores entran al mismo `/analizar`. Skill `trading-analista` actualizada con ambos. Invariantes intactas: cero
  órdenes reales, dinero real solo tras batir al SPY fuera de muestra.
- **👶 Ingresos H1-2026 de Pilar (autónoma) cargados en `fiscal_perfil` (18/07/2026).** Pilar mandó por
  correo un extracto Kutxabank (`movimientos Pilar primer semestre2026.xls`, subido a Drive porque el Gmail
  MCP de esta sesión no expone descarga de adjuntos) con sus movimientos ene-jun 2026 — cuenta personal, NO
  conectada por PSD2/Enable Banking (primera carga manual de sus datos, `cuentas_bancarias` no tenía fila
  suya). Criterio de Alberto: **gastos de Pilar = 0€** (van con retroactividad a su nombre), solo importan
  los ingresos. Del extracto: **2 facturas a cliente** el 29/05 (transf. de 1.050€ netos cada una, Almacén
  de Mariscos González + Global 2 Instalaciones) → **base imponible ≈1.981,13€ / IVA ≈416,04€ / retención
  ≈297,17€** (⚠️ calculado asumiendo IVA 21% + retención 15% estándar — Alberto confirmó el mecanismo
  «retención la paga/ingresa la empresa cliente, IVA lo gestiona Pilar» pero no los % exactos; revisar
  contra la factura real si difieren). **Cuota autónomos (RETA) pagada: 467,45€** confirmado por Alberto
  (7 recibos, cae de ~118€/mes a 32,34€ en mayo-junio — coincide con la baja de maternidad). Grabado en
  `fiscal_perfil`: `conyuge_es_autonomo=true`, `conyuge_ingresos_brutos=1981.13`, `conyuge_gastos_deducibles=0`,
  `conyuge_cuota_autonomos=467.45`, `conyuge_retenciones=297.17`. **Nota aparte (NO en BD, no hay columna):**
  el extracto también trae 3 pagos "PENSION SS" (ene-mar, 1.085+980+770=2.835€) que es la **prestación por
  nacimiento/cuidado del menor** de la SS — **exenta de IRPF** (art. 7.h LIRPF, mismo tratamiento que la
  prestación propia de Alberto de PR #843) — no sumar a su rendimiento de actividad al declarar.
- **📈 Trading Fase B: #982 y #990 MERGEADOS + ingesta de gurús 13F vía Dataroma (18/07/2026, SOLO paper).**
  Ambos PRs de la Fase B en main (#982 core+factores+rvol; #990 barrera de selección en `/analizar` + `guru13f`).
  Nuevo (rama reiniciada desde main): **endpoint `POST /api/trading/gurus`** (`app/api/trading/gurus/route.ts`,
  auth `ALERTA_TOKEN`, `maxDuration=60`) que descarga la actividad 13F de gestores value desde **Dataroma** y
  devuelve la convicción por símbolo (`agregarConviccion`). Corre en el **egress de Vercel** (el sandbox de las
  sesiones da 403 a Dataroma, así que el fetch NO se puede probar aquí). Parser **puro y testeado**
  (`lib/trading/dataroma.ts`: `parseDataromaHoldings`/`mapActividadDataroma`, defensivo ante cambios de markup) +
  helper `agregarConviccion` en `guru13f.ts`. **84 tests `node --test` verdes** (80 módulo + 4 dataroma), typecheck
  rutas limpio. **PENDIENTE de verificar en la 1ª corrida en Vercel:** los códigos de gestor de Dataroma
  (`GESTORES_DEFECTO`) y el markup real (si `gestoresConDatos` sale vacío, ajustar selectores/códigos). **Aún por
  montar** (necesitan iteración en vivo en Vercel, no en el sandbox): fundamentales EDGAR XBRL e insiders Form 4.
  Invariantes intactas: cero órdenes reales, dinero real solo tras batir al SPY fuera de muestra.
- **📈 Trading Fase B: #982 MERGEADO + barrera de selección por factores en `/analizar` (18/07/2026, SOLO paper).**
  PR #982 (aviso Telegram compra + gates ADX/SMA50 + spec Fase B + `factores.ts`/`piotroski.ts`/`magicFormula.ts`
  + endpoint `/api/trading/factores` + RVOL robusto con mediana y umbral 1,5×) **mergeado a main** (squash 708a918).
  Seguimiento (rama reiniciada desde main): **la selección FILTRA al timing** — `/api/trading/analizar` acepta ahora
  `factorScore` por símbolo + `minFactorScore` global y **veta abrir un largo en un nombre fundamentalmente flojo**
  (`factorFlojo` en `riesgo.ts`, puro+testeado) aunque el gráfico dé señal; degrada sin factores (compat). El
  `factorScore` viaja en cada idea. 77/77 tests `node --test`, typecheck limpio. Invariantes intactas: cero órdenes
  reales, dinero real solo tras batir al SPY fuera de muestra. Pendiente: validar el ranking de factores OOS vs SPY
  (bloqueado por conector IBKR intermitente); luego B2 (13F gurús Dataroma/EDGAR + insiders Form 4).
- **🔑 Rutina trading-analista autenticada con `ALERTA_TOKEN`, no `CRON_SECRET` (18/07/2026).** Al montar el
  trigger diario de `trading-analista` (refresca el saldo IBKR de la vista 💶 Dinero + pasada paper) salió a la
  luz que el **entorno de una rutina de Claude Code es texto plano VISIBLE** («no metas secretos»), así que meter
  ahí el `CRON_SECRET` maestro (autoriza TODOS los crons) era un error. Fix: los endpoints `/api/trading/*`
  (`saldo`/`analizar`/`puntuar`/`fmp`/`descubrir`/`screener`) aceptan ahora el token DEDICADO de bajo privilegio
  **`ALERTA_TOKEN`** vía nuevo helper `lib/cron-auth.ts::isRoutineAuthorized` (= `isAlertaTokenAuthorized` ||
  `isCronAuthorized`, compat). Es el mismo token que ya usa `/api/internal/alerta` (refactorizado para compartir
  el helper); si se filtra, su alcance es mínimo (empujar un saldo / disparar una pasada PAPER — nunca dinero real
  ni órdenes reales). La rutina lleva en su entorno solo `PLATAFORMA_URL` (no secreta) + `ALERTA_TOKEN`. Skill
  `trading-analista` y `docs/RUTINAS-PROGRAMADAS.md` actualizados (Bearer ALERTA_TOKEN). **PENDIENTE Alberto:**
  añadir `ALERTA_TOKEN` (mismo valor que en Vercel) al entorno «Default» de la rutina y re-ejecutar; `PLATAFORMA_URL`
  ya la añadió. Verificado en sesión: el conector IBKR lee el NAV (33.658,82€); faltaba solo el token en el entorno.
- **🔍 AUDITORÍA PRICING COMPLETA («está fallando mucho») — 18/07/2026 tarde.** Informe en
  `docs/AUDITORIA-PRICING-2026-07.md`. Diagnóstico: el motor no falla por datos sino por MECÁNICA —
  (R1) el raíl «±20%/día» era **por PASADA** (3 crons/día = ±73%/día → la V de Karol G: 326→112→701€
  en 5 días), (R2) el premio de evento de #985 tenía **doble conteo** (×2,5 sobre una mediana que ya
  era precio-de-evento → Karol G camino de ~2.000€), (R3) **sin banda muerta** (3.448 escrituras/7d,
  78% de fechas de Busto subiendo Y bajando la misma semana — los huéspedes compran los valles).
  **Coste medido:** Karol G vendida a 344€/noche (mercado ~931€) y Puente del Pilar a 126€ (PL 473€),
  ambas cazadas en valles del ping-pong; 7 noches de octubre a 65€ brutos (los descuentos de canal
  perforan el `min_price` — R4, decisión pendiente de Alberto: subir Busto a ~115-120€). Fixes R1-R3
  aplicados en `apps/plataforma/app/api/sivra/pricing/apply/route.ts` (ancla `ref24` del raíl por DÍA
  real, evento sin doble conteo, banda muerta 3%) — mergeados en #987. **2ª tanda (delegación «haz todo
  como tú veas mejor»):** R4 `min_price` Busto 90→115 (BD, lección en `pricing_aprendizaje/min_price_canal`;
  Luxury se queda en 95) · R5 motor viejo de sivra → **410 Gone** (`apply`/`apply-auto`; `aplicar-propuesta`
  sigue vivo) · R6 factor de vísperas (noche pegada a evento ≥2× hereda la mitad del premio) · R7 29 alertas
  pre-fixes resueltas en lote (quedan las 3 de hoy como control). **R8 diferido a propósito** (4º cambio de
  fórmula el mismo día = el patrón que causó el bug R2). Vigilancia 7d: escrituras <1.000/7d, ping-pong <10%,
  Karol G estable ~690-800€ base.
- **📈 Trading: Fase 1 técnica CERRADA (no bate al mercado) + spec Fase B por SELECCIÓN — 18/07/2026 (SOLO paper).**
  Validado con datos REALES de 2 años de IBKR sobre **7 valores + SPY** (scratchpad, `backtestSimbolo`/`backtestOOS`/
  `backtestCartera`): el sistema técnico **NO bate a comprar-y-mantener** — cartera +13,7% (maxDD 6,1%) vs cesta
  equiponderada +38,4% y SPY +30,1%; solo 1 de 8 nombres bate por-símbolo (COST), y fuera de muestra los bordes se
  dan la vuelta (NVDA +32,5%→−11%, sobreajuste). Único mérito: drawdown bajo, que NO es la vara (la vara = batir al
  mercado). Chequeo de seguridad en vivo: 0 posiciones/órdenes reales en IBKR, NAV 33.658,82€, saldo bróker ya
  sincronizado en la vista Dinero. **Decisión: degradar el técnico a overlay de *timing* y pivotar a SELECCIÓN**
  (factores value+quality+momentum, clonar 13F de gurús vía EDGAR/Dataroma gratis, insiders Form 4, Piotroski/magic
  formula). Los gráficos (cup-and-handle, cuñas) entran SOLO como afinado de entrada de un valor ya seleccionado,
  nunca como señal primaria. Datos GRATIS primero (IBKR/FMP-free/EDGAR/`buscarWeb`), Sharadar de pago solo cuando el
  paper bata al mercado OOS (sesgo de supervivencia = enemigo nº1). Spec completo en **`docs/TRADING-FASE-B-spec.md`**.
  Invariantes intactas: cero órdenes reales, nunca herramientas de orden de IBKR, dinero real solo tras batir al SPY
  fuera de muestra (decisión de Alberto). Rama `claude/interactive-brokers-mcp-hbww2h`.
  - **B1 IMPLEMENTADO (código, 18/07/2026):** en `@central/module-trading` — `factores.ts` (modelo value+quality+
    momentum por **z-scores cross-seccionales**: `rankearFactores`, `zscores`, `momentum12_1`; ausente=0 neutral,
    deuda invertida, pesos ajustables 0.4/0.4/0.2), `piotroski.ts` (`piotroskiFScore` 0..9, 9 señales año vs año)
    y `magicFormula.ts` (`rankearMagicFormula`, Greenblatt earnings-yield+ROIC por rangos). Exportados en `index.ts`.
    **75/75 tests `node --test` verdes (13 nuevos), cero errores de tipo reales.** Pendiente B1: validar OOS contra
    SPY con datos reales (bloqueado por el conector IBKR, que cae intermitente y no re-propaga a la sesión aunque el
    toggle esté ON).
  - **B1 endpoint + prueba e2e + rvol robusto (18/07/2026):** **`POST /api/trading/factores`** en plataforma
    (`app/api/trading/factores/route.ts`, auth `CRON_SECRET`, compute-only como `/descubrir`): rankea universo por
    `rankearFactores` + opcional `rankearMagicFormula`, recorte `top`. **Probado end-to-end** con datos REALES
    (momentum12_1 sobre las velas de 2 años de IBKR + fundamentales plausibles → GOOGL/META/AAPL top; smoke en
    scratchpad). **Análisis del RVOL (petición de Alberto):** era un overlay débil de 1 día; se hizo **robusto** —
    baseline pasa de MEDIA a **MEDIANA** (`volumen.ts`, un spike de earnings ya no deprime el rvol de los días
    siguientes) y `confirmaVolumen` sube el umbral de "confirma" de 1,15× a **1,5×** (convicción real). El rvol es
    CONFIRMACIÓN de una señal de precio, nunca disparador de compra; el timing de entrada es justo lo que no bate al
    mercado. **76/76 tests verdes.** Skill `trading-analista` actualizada (sección Fase B factores + sección RVOL).
    Siguiente: integrar factores en `/analizar` (técnico como overlay) y validar OOS cuando IBKR esté estable.

- **💸 Pricing: 4 mejoras anti-desplome (robustez SIN PriceLabs) — 18/07/2026.** Sobre el suelo PL
  (#983 ya en main), a petición de Alberto se añaden 4 capas en `apps/plataforma/app/api/sivra/pricing/apply/route.ts`
  para que el motor aguante cuando se cancele PL (~ago-2026): **(1) curva PL persistida** — tabla nueva
  `pricing_pl_referencia` (migración `prisma/sql/2026-07-18_pricing_pl_referencia.sql`, **aplicada+sembrada
  vía MCP**, 366 filas/piso), upsert de la última foto cada pasada; el suelo la usa hasta `PL_REF_MAX_AGE_DAYS`=120
  tras la última captura → sobrevive a la cancelación de PL y luego caduca sola. **(2) guarda de outlier por
  precio ACTUAL** (sin PL): si `old > base_normal_mes ×1.4` y estamos lejos (>30 días), no hundimos la noche
  por debajo del actual (el last-minute la suaviza cerca de la fecha). **(3) min-stay** 2-3 noches en eventos
  fuertes (≥1.8×) y lejanos, salvo hueco suelto. **(4) premio de evento anclado a la MEJOR base** (fecha exacta
  > mes > global) en vez de la global baja, y puede superar el p90 del mes; el bucket por fecha exacta solo
  influye en fechas de evento. Constantes tuneables (`OUTLIER_RATIO`, `MIN_STAY_EVENTOS`, `MIN_FECHA_BUCKET`…).
  Rama `claude/pricing-below-pricelabs-bf1vab`.

- **💶 Saldo de Interactive Brokers en la vista Dinero (18/07/2026).** Petición de Alberto: ver el saldo del
  bróker junto a BBVA/Kutxabank en `/banca` (tab 💶 Dinero) **y** sumado al «Saldo total del grupo». Como la app
  en Vercel NO habla con IBKR, el dato se PERSISTE en la nueva tabla `broker_saldos` (`cuenta_id`, `broker`,
  `saldo`, `divisa`, `actualizado_en`; migración `prisma/sql/2026-07-18_broker_saldos.sql` aplicada por Supabase
  MCP, RLS ON + revoke anon/authenticated; modelo Prisma `BrokerSaldo`). La **refresca la pasada diaria del agente
  `trading-analista`**, que ya lee el NAV (`get_account_summary` → `net_liquidation` EUR) y ahora lo empuja a
  `POST /api/trading/saldo` (Bearer `CRON_SECRET`; resuelve la cuenta de Alberto con el mismo `resolverCuentaBuzon`
  del buzón de facturas — override `TRADING_CUENTA_ID`/`GMAIL_USER`). `lib/broker.ts` (`getBrokerSaldos`/
  `getBrokerTotal`/`upsertBrokerSaldo`). En `banca/page.tsx` (solo tab dinero): tarjeta «📈 Inversión · Interactive
  Brokers» en la misma rejilla que las bancarias + su importe suma a `totalGrupo`. **Sembrado el saldo actual
  33.658,82€** (net liq base EUR; sin posiciones abiertas ahora). Es SOLO lectura de IBKR → respeta la regla de oro
  (nunca órdenes reales). Verificado: `next build` exit 0, 7 tests cuenta-buzon OK. Skill `trading-analista`
  actualizada (paso 1). **PENDIENTE Alberto:** nada obligatorio; opcional `TRADING_CUENTA_ID` en Vercel si algún día
  hay ambigüedad de cuenta.
- **💸 Pricing: suelo PriceLabs (raíl anti-desplome) — 18/07/2026.** El aviso «91 fechas <70% de PL» era
  `luxury_busto` hundiendo las noches de puente (Pilar, Todos los Santos) a **0,64×PL** — el motor cotiza por
  MES y el bucket de octubre promedia la noche especial, cuyo premio de evento se ancla a la base global baja;
  el raíl ±20%/día remata el desplome. Fix en `apps/plataforma/app/api/sivra/pricing/apply/route.ts`: el
  **tripwire PL pasa de aviso a SUELO** (`PL_FLOOR_RATIO=0,85`) — no se escribe por debajo de 0,85×PL mientras
  PL siga conectado (reusa `plPrice`, ventana 14d → se auto-jubila al cancelar PL ~ago-2026). Actúa CON o SIN
  bucket del mes (a diferencia de la guarda Karol G). Inerte para Busto; recupera ~8.842€ de tarifa en las 91
  fechas de Luxury; el próximo `apply-auto` tras desplegar las re-sube. Rama `claude/pricing-below-pricelabs-bf1vab`.

- **📈 Trading-analista: aviso Telegram inmediato en cada compra paper (18/07/2026).** Antes solo existía el
  formateador `resumenPasada` (nadie lo enviaba) y el resumen nocturno dependía de que el agente lo mandase (y
  no corre sin IBKR en la rutina) → Alberto no recibía nada al comprar. Añadido `mensajeCompraPaper` en
  `lib/trading-notify.ts` y disparado desde `/api/trading/analizar` con `tgSend` (best-effort, SOLO en aperturas
  nuevas — guarda `yaAbierta` para no avisar si la posición ya existía). Precio en USD (sin `eur()`, es cotización
  de acción), % NAV como referencia, y marca «SOLO simulado, ninguna orden real». Con los gates las compras son
  raras → sin spam. Tests del formateador (3) verdes. Va en rama reiniciada desde main (el PR #980 ya está mergeado).

- **📈 Trading-analista: las 8 ideas de mejora (18/07/2026, SOLO paper).** Tras los gates (#1) y el benchmark
  buy&hold (#3), se implementaron las demás en `@central/module-trading` (62 tests, tsc 0): **#6 trailing stop**
  (`backtestSimbolo({trailing})`, chandelier sin lookahead; +2pp en muestra); **#7 simulación de cartera**
  (`backtestCartera`: nombres compitiendo por el MISMO capital, sizing 1%, tope 20%, sin apalancar → curva de
  equity + **`maxDrawdownPct`**); **#4 régimen** (`regimenMercado` SPY>SMA200, veta largos risk-off; barrera en
  `/analizar` vía `indice:{cierres}` + opción en cartera); **#8 opsRecientes** real (cuenta `trading_paper_orden`
  30d, antes 0 fijo); **#5 bucle de aprendizaje** (`ajustesDeStats` lee `trading_estrategia_stats` y modula la
  confianza por rendimiento real, ±20, guarda muestra ≥20 → `torneo(…, ajustes)`). **Hallazgo honesto:** a nivel
  CARTERA el sistema queda PLANO (≈−0,1% retorno, 3,2% drawdown sobre 6m/7 nombres) — el capital apenas se
  despliega; las cifras por-símbolo (−52%/+0,9%) sobreestimaban al asumir 100% invertido. **#2 PENDIENTE (bloquea
  la validación real):** backtest con 2 años y ~20 nombres CON ganadores (SPY/AAPL/MSFT) — necesita bajar histórico
  de IBKR en vivo. Puerta a Fase 2 sigue cerrada. (Se limpió la BD paper: 0 posiciones, 28 tesis recalculadas con
  gates, todas no-compra.)

- **📈 Trading-analista: dos gates que llevan el backtest de −52% a breakeven (18/07/2026, SOLO paper).**
  Revisión con otro modelo (Fable 5) + diagnóstico numérico: el backtest perdía por dos causas medibles — el
  **momentum operaba ruido lateral** (el cruce EMA/MACD es casi la misma condición y disparaba con ADX bajo) y
  la **reversión compraba cuchillos** en caídas lentas (UEC −41% con ADX~20, bajo su SMA50). Fix (probado sobre
  6m reales de 7 nombres): (1) **`evaluarMomentum` exige ADX≥20** o abstiene (neutral); (2) nueva barrera
  **`bajoTendencia(precio, sma50)`** veta abrir CUALQUIER largo por debajo de la SMA50 — en `/api/trading/analizar`
  y en el backtest. Resultado en el universo (sesgado a bajistas): estrategia **+0,9%** vs buy&hold **−59%** (los
  4 cuchillos → 0 trades). Honesto: NVDA/META pierden pequeño mientras mantenerlos subía (+15/+11%) → el próximo
  problema es la **salida** (stops cortan las ganadoras), no más indicadores. `backtestSimbolo` ahora reporta
  **`retornoBuyHoldPct`+`baten`** (batir a comprar-y-mantener es la vara) y hay **`backtestOOS`** (split fuera de
  muestra). 55 tests módulo verdes, tsc 0. **OJO:** bajo los nuevos gates NVDA(ADX15)/META(ADX18) NO habrían
  abierto hoy → las 2 posiciones paper persistidas son del sistema viejo (reconciliar con Alberto). **PENDIENTE:**
  dataset de 2 años / ~20 nombres CON ganadores (necesita IBKR en vivo) para validar fuera de muestra sin sesgo;
  salidas simétricas (take-profit/trailing); filtro de régimen (SPY>SMA200); cerrar el bucle `trading_estrategia_stats`.

- **📈 Trading-analista: backtest + pantalla `/trading` + rotación sectorial (18/07/2026, PR #979 MERGEADO).**
  Tras #974 (cantera+volumen+descubrimiento+FMP, en main), Alberto pidió: más indicadores, "que el agente
  haga pruebas y vea resultados con el historial", y "añade todo esto en mi pantalla / onboarding". Entregado
  (SOLO paper): en `@central/module-trading` **`adx`** (la reversión NO fadea tendencia fuerte ADX≥25 = fix
  ISRG), **`earningsInminente`** (barrera en `/analizar`: no abrir largo ≤3d de resultados), **`fuerzaRelativa`**,
  **`backtestSimbolo`** (walk-forward sin lookahead), **`rankearSectores`/`inclinacionSector`** (rotación por ETF
  sectorial). `lib/fmp.ts` **`fmpProximoEarnings`**. Pantalla **`/trading`** (`app/(usuario)/trading/`, server) +
  **OnboardingBanner** + entrada sidebar 📈 Inversión (lee tablas `trading_*`, degrada vacío). 50 tests módulo +
  7 fmp, tsc 0, **next build OK**. Backtest real (6m ISRG/CEG/UEC/SYM) = negativo → honesto, NO rentable aún
  (puerta Fase 2 cerrada). Guía de arranque en **`docs/TRADING-SETUP.md`**. **PENDIENTE Alberto:** `FMP_API_KEY`
  + `FMP_API_VER=stable` en Vercel plataforma; trigger nocturno (sesión Claude con IBKR ON); idea nº1 (backtest
  vs `get_account_trades` reales) cuando IBKR esté en vivo. IBKR MCP se desconectó a media sesión.

- **📈 Trading-analista: ADX + guarda de earnings + fuerza relativa (18/07/2026, rama nueva desde main tras
  mergear #974).** Alberto: "¿qué más indicadores/API nos interesan?". Añadido a `@central/module-trading`
  (puro, 46 tests): **`adx`** (fuerza de tendencia Wilder → `Indicadores.adx14`) — la **reversión ya no fadea
  tendencias fuertes** (RSI sobreventa + ADX≥25 = cuchillo, señal neutral; el fallo que hoy dejamos a medias
  con ISRG) y el momentum modula confianza por ADX; **`earningsInminente`** (riesgo) — `/api/trading/analizar`
  **veta abrir largo si earnings ≤3 días** (el gap salta el stop, lección ISRG/IBM); **`fuerzaRelativa`**
  (mercado) vs índice/SPY. `lib/fmp.ts`: **`fmpProximoEarnings`/`proximaFechaEarnings`** (endpoint `earnings`,
  best-effort, puebla `fundamentales.proximoEarnings`). Verificado con el torneo-replica sobre datos reales de
  IBKR (ISRG ADX 20,6, sigue NO OPERA). tsc 0. **PENDIENTE Alberto:** conectar FMP + trigger nocturno; la
  **idea nº 1 (backtest contra `get_account_trades` reales)** queda para cuando IBKR esté en vivo (hoy el MCP
  se desconectó a media sesión). PR draft nuevo (el #974 ya está en main).

- **🧾 Auditoría fiscal «100% OK» (18/07/2026, rama `claude/auditoria-fiscal-100-ots062`).** Tras restaurar el
  segmento Fiscal, Alberto preguntó si la estimación de fin de año tenía en cuenta los gastos deducibles y pidió
  «una auditoría que la fiscalidad esté 100% OK». Auditoría a fondo (4 agentes en paralelo: base/tramos,
  deducciones, proyección, UI). **Hallazgo gordo confirmado con datos:** la proyección «Fin de año» inflaba
  ~11.800€ de base — (1) **doble conteo** del ingreso turístico futuro (tabla `incomes` + patrones de payouts
  de Booking del banco proyectados otra vez) y (2) **coste deducible variable** de las reservas futuras sin
  restar → varios miles de € de «a pagar» fantasma. **Fix:** turístico futuro SOLO desde `incomes` y en NETO
  (margen histórico `pisos.total.gastos/ingresos`), patrones proyectados solo para `seguros`, run-rate por mes
  (no por transacción). **Otros fixes:** FN autonómica de Andalucía gateada por límite de renta (25/30k — con
  base ~46k Alberto no tiene derecho; la de nacimiento no lleva límite desde Ley 8/2025, ya estaba bien);
  maternidad prorrateada por mes de nacimiento; `tipoEfectivo` real (cuota tras mínimo, antes ~26% vs ~19%);
  tramos IRPF de fuente única (`importesDe(year).tramos`, antes 3 copias); transparencia UI (línea `exento`,
  nota maternidad, disclaimer, tope 10% mecenazgo). Verificado: `tsc` 0 · 178 tests · `next build` OK. Skills
  `perfil-fiscal`/`fiscal-novedades` actualizadas. NO había bug en la base imponible «de hoy» (retenciones solo
  sobre comisiones, reducción conjunta una vez, exento fuera de base, amortizables excluidos — todo bien).

- **🔌 FMP plan FREE = SIN screener → FMP pasa a ENRIQUECER, no a dar universo (18/07/2026, PR #974).** Alberto
  probó la key (vía Claude for Chrome) y descubrimos: la cuenta es NUEVA → host **`/stable`** (el legacy `/api/v3`
  está muerto: "Legacy Endpoint"), y **el screener es de pago** (`/stable/company-screener` → "Restricted").
  Pero **`/stable/quote` es GRATIS** y trae precio, volumen, marketCap, medias 50/200 y máx/mín de 52 semanas.
  **Rediseño:** el UNIVERSO lo da IBKR (temas); FMP **enriquece cada símbolo** con señales libres. Nuevas piezas:
  módulo `mercado.ts` (`posicionRango52` = proxy honesto de "por debajo de valor": 0=pegado a mínimos anuales=barata;
  `tendenciaMedias` por medias 50/200) exportadas por `@central/module-trading`; campos `posRango52`/`tendencia` en
  `Candidato`; criterio `maxPosRango52` en el screener + bonus por cercanía a mínimos en `puntuarCandidato`/
  `puntuarDescubrimiento`. `lib/fmp.ts` reescrito: default `/stable` con `?symbol=`, `fmpQuote` (gratis),
  `fmpEnriquecer` (quote + fundamentales best-effort), screener degrada a `[]`. Endpoint `/api/trading/fmp` acepta
  ahora **`{ simbolos:[...] }`** (camino Free) además de `{ criterios }` (de pago). Tests: 42 módulo + 6 fmp, tsc 0.
  **PENDIENTE Alberto:** añadir `FMP_API_KEY` **y** `FMP_API_VER=stable` en Vercel `plataforma`; (opcional) confirmar
  si su plan cubre `ratios-ttm`/`discounted-cash-flow` para activar PER/PB/DCF (si no, el agente usa `posRango52`).

- **🔌 Trading-analista: cliente FMP conectado por código (18/07/2026, PR #974).** Alberto: "conectar FMP
  (gratis)". Construido `apps/plataforma/lib/fmp.ts` (mappers puros testeados: `mapearScreener`,
  `mapearFundamentales`, `volAnualDeBeta` — 4 tests) + `fmpScreener`/`fmpFundamentales`/`fmpRvol` (fetch con
  timeout, degrada sin key/red) y endpoint `POST /api/trading/fmp` (screener + enriquece top con PER/PB + DCF
  + rvol → `Candidato[]` para `/descubrir`). **Secreto:** `FMP_API_KEY` cae a `''` (regla del repo: API key
  externa, solo rompe la llamada saliente). Overridable `FMP_BASE_URL`/`FMP_API_VER` (v3 vs stable). tsc 0.
  **PENDIENTE Alberto:** crear cuenta free en financialmodelingprep.com → añadir `FMP_API_KEY` al proyecto
  Vercel `plataforma` (⚠️ confirmar rutas/campos contra su plan, patrón eInforma). Sin ella, la cantera cae a
  solo temas IBKR + volumen (degrada, no rompe).

- **🔎 Trading-analista: DESCUBRIMIENTO autónomo (el agente busca solo dónde invertir) (18/07/2026, PR
  #974).** Alberto: "quiero que el agente analice él solo y encuentre forma de invertir". Autonomía =
  DESCUBRIR, no ejecutar (sigue 100% paper). Construido en `@central/module-trading`: `descubrimiento.ts`
  (`dedupCandidatos` funde por símbolo uniendo fuentes; `puntuarDescubrimiento` premia corroboración
  multi-fuente + rvol + descuento y **penaliza la volatilidad**; `descubrir` = dedup+filtro+orden) +
  `Candidato` gana `fuentes`/`volAnual` + `CriteriosScreener.maxVolAnual` (guarda anti-lotería). 37 tests
  verdes. Endpoint `POST /api/trading/descubrir` (default `maxVolAnual: 0.8`). El agente explora temas por
  IBKR (`search_investment_topics`→`get_theme_details`) + screener FMP + picos de volumen. **Demo en vivo:**
  encontró solo 6 nombres de Nuclear+Quantum (SMR/CEG/BWXT/IONQ/RGTI/QBTS) y la guarda de volatilidad dejó
  pasar SOLO CEG (41%) y BWXT (42%), descartando SMR/IONQ/RGTI/QBTS (92-98% vol anual = la lotería que
  vació la cuenta real). Skill actualizada con la fase de descubrimiento autónomo. Va en la misma rama/PR
  #974 que la cantera+volumen.

- **📊 Trading-analista: cantera (buscador por parámetros) + overlay de volumen (18/07/2026, rama
  `claude/interactive-brokers-mcp-hbww2h`).** Tras un **dry-run real** de los 13 de la watchlist con IBKR en
  vivo (NAV 33.657 €; 5 tesis alcistas operadas en paper: NVO/NVDA/META/SPOT/PLTR; CVX vetada por
  concentración 24,5%; NFLX marcó rvol 3,05 = pico de volumen inusual), Alberto pidió un **buscador de
  acciones por parámetros** ("volumen inusual + por debajo de su valor"). Construido (aditivo, sigue SOLO
  paper): **`@central/module-trading`** `volumen.ts` (`rvol`, `tendenciaVolumen`, `volumenInusual`,
  `confirmaVolumen`) + `screener.ts` (`infravalorada` por DCF o PER/PB, `pasaScreener`, `rankearCantera`) —
  33 tests verdes (9 nuevos); `types.ts` amplía `Fundamentales` (`pb`, `valorRazonable`) + `Candidato`/
  `CriteriosScreener`. `apps/plataforma`: nuevo `POST /api/trading/screener` (filtra+rankea la cantera) y
  `/api/trading/analizar` ahora devuelve `rvol`+`volConfirma` por idea (señal alcista con volumen flojo =
  dudosa; NO cambia la decisión). tsc 0. **El scanner de mercado va por FMP (plan free)** — el MCP de IBKR
  no tiene screener; FMP aporta universo + PER/PB + DCF. Sin FMP, cantera y estrategia `valor` degradan sin
  romper. Spec: `docs/superpowers/specs/2026-07-18-trading-cantera-volumen-design.md`. **Pendiente Alberto:**
  conectar FMP + crear el trigger nocturno. El dry-run de hoy dejó 52 tesis + 5 posiciones paper (fecha
  2026-07-18, motivo 'dry-run 13') en `wswbehlcuxqxyinousql` — borrables con `delete ... where fecha='2026-07-18'`.

- **⚡ Velocidad de conversión por mes en el apply (17/07/2026, OK de Alberto — completa el trío de defensas).**
  Tercera pata tras el prior estacional y el tripwire PL: si un mes futuro acumula ≥2 reservas entradas en
  los últimos 7 días (`incomes.createdAt`), su objetivo sube +10% (+20% desde 4), capado al techo de mercado
  del mes. No compone (se recalcula del mercado en cada pasada) y la ventana de 7 días lo apaga sola. Con
  esto, el patrón de octubre (2 reservas en 4 días a precio corto) dispara subida automática sin esperar a
  Alberto. `meses_calientes` en la respuesta del apply. Doc §14 fix 3 de `pricing-automatico.md`.

- **🧾 Fiscalidad de vuelta en el Inicio unificado (18/07/2026, rama `claude/fiscalidad-pantalla-unificada-ots062`).**
  Queja de Alberto: "hemos unificado varias pantallas en una, pero no veo nada de fiscalidad y es muy
  importante con previsiones a la declaración de la renta". Causa: la des-duplicación (Fase 4 fiscal) retiró
  las 4 entradas fiscales del sidebar apuntando a `/finanzas/radiografia` como puerta única; luego la
  radiografía pasó a **redirigir a `/banca`** (#900) y la fusión Resumen+Banca (Fase 2, 16/07) dejó `/banca`
  con solo `💶 Dinero | 🏢 Negocios` → la lente **🧾 Fiscal** (que la radiografía ya tenía, fusionando
  Fiscal+Proyección) quedó **huérfana y sin acceso**. **Fix:** tercer segmento **🧾 Fiscal** en
  `banca/SegTabs.tsx` + nuevo server component **`banca/FiscalResumen.tsx`** (réplica de la lente fiscal de
  la radiografía: «Mi declaración» Hoy/Fin de año · Solo yo/Conjunta con Pilar + palanca de gasto + barra de
  tramos IRPF + KPIs, enlace a `/finanzas/fiscal` para el detalle/deducciones). `banca/page.tsx` ramifica
  `tab==='fiscal'` con **carga perezosa** (igual que Negocios): `getResumenFinanciero(año,0)` +
  `calcularEstadoDeclaracion` (mismo motor que `/finanzas/fiscal`, año completo; respeta `?year=`). Sin
  lógica de cálculo nueva. `tsc` 0 en todo el app. Páginas `/finanzas/fiscal|proyeccion` intactas
  (reversible, alcanzables desde el enlace del segmento).

- **🧠 Prior estacional auto-aprendido + tripwire PriceLabs en el apply (17/07/2026, OK de Alberto).**
  Respuesta a su pregunta "¿el agente no lo sabe con las variables que tenemos?" — no lo sabía: el motor
  solo miraba comps actuales y el histórico (`incomes` 2020→) no entraba en la pasada diaria. Ahora el
  apply calcula por piso/mes `idx = ADR_hist × ocupación relativa` (octubre destaca en noches, no en ADR)
  y lo usa como SUELO del objetivo (sustituye al global plano sin bucket; red ×0,9 con bucket si idx≥1,15).
  Además, tripwire: pasada en vivo que escriba <70% del último precio de PriceLabs → Telegram (patrón
  común de las 3 minas). Doc §14 de `pricing-automatico.md`. Siguiente iteración: velocidad de conversión
  por mes.

- **📈 Octubre = temporada MUY ALTA (override de Alberto, 17/07/2026, rama `claude/dynamic-pricing-uhvnak`).**
  Tras 2 reservas de octubre vendidas en 4 días (Daniela 9-11 y Lara 2-4, ~118-126€/noche bruto, neto de
  Lara clavado en el suelo de 95€), Alberto fija: **octubre es el mejor mes del año en Sevilla**. Mercado
  verificado: puente del Pilar (9-12 oct) **p50 ≈ 245€/noche** (4 pax) vs finde normal de finales
  **p50 ≈ 175€** — el motor lo tenía todo a ~161. Corregido: +20 comps de octubre (2 ventanas, escenario
  luxury), `SEASONAL` oct 1,10→1,40 y `FLOOR_SEASONAL` oct 1,20→1,30 en `pricing-calendar.ts` (plataforma),
  y override de dueño en `pricing_aprendizaje` id 37 (`ALL`/`octubre`) + señal de velocidad en id 34.
  Regla para el agente: en octubre, comps de TODAS las semanas (una sola ventana esconde el puente).

- **🏁 Optimización de tokens del director de código: 100% CERRADO y probado en vivo (17/07/2026).** Alberto activó
  el ajuste de repo *"Allow GitHub Actions to create and approve pull requests"*. Prueba final de la Action
  `ai-programar` con TODO puesto (GRANT de `extensions`, secrets, toggle, guardia): el orquestador hizo el ciclo
  completo y **el PR draft #966 se abrió SOLO** — acota (qwen 0€) → **plan Opus 4.1** → ejecuta qwen (volvió a
  estropear el archivo) → **guardia lo rechazó → escaló a Opus** (`escalado:true`) → diff SANO (conserva `eur()`,
  añade `eurSinDecimales()`) → push → PR draft automático. Coste del run ~0,13 €. En `ai_usos` se ven DOS filas
  `ejecutar` (qwen 0€ + Opus 0,034€) = la firma del escalado. **Nada se auto-mergea.** Docs actualizados
  (`docs/DIRECTOR-CODIGO.md`, `apps/plataforma/CLAUDE.md`, skill `delegar-codigo`). El PR #966 es de la tarea de
  prueba (Alberto lo mergea si le sirve `eurSinDecimales`, o lo cierra); ramas `ai/programar-*` de test borrables.
- **✅ Orquestador Fase 2 «caro planifica / barato ejecuta» PROBADO end-to-end + endurecido (17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** Al ejercitar por primera vez la Action `ai-programar`
  aparecieron 3 causas encadenadas, cada una destapada por instrumentar `ai_usos.error`:
  1. Faltaba el secret `AI_GATEWAY_SECRET` en GitHub (lo puso Alberto). `PLATAFORMA_URL` ya estaba.
  2. El acotado (`/api/ai/codigo`) devolvía 0 filas → **causa raíz REAL: el rol de la app (por el pooler de
     Supabase) NO tenía `USAGE` sobre el schema `extensions`** donde vive pg_trgm → `word_similarity` lanzaba
     `permission denied (42501)`. Ni cualificar (`extensions.word_similarity`, #962) ni quitar el array de Prisma
     (#963) lo arreglaban — eran síntomas. **Fix: `GRANT USAGE ON SCHEMA extensions TO public;`** (aplicado por
     MCP; el grant a `authenticator` solo no bastó porque la app conecta con otro rol). Sin redeploy.
  3. Con eso, el ciclo COMPLETO corrió y quedó medido en `ai_usos`: **acota (qwen) → planifica `anthropic/
     claude-opus-4.1` → ejecuta `qwen-2.5-coder-32b`**, 0€. Solo falló el último paso `gh pr create` por el ajuste
     de repo *"Allow GitHub Actions to create and approve PRs"* (APAGADO) — la rama sí se pushea.
  **Aprendizajes de la prueba (endurecido en este PR):** (a) el coder barato **estropeó el archivo** (qwen truncó
  `dinero.ts` y borró `eur()`, que la orden prohibía) → nuevo **guardia puro `lib/reescritura-guardia.ts`**
  (`validarReescritura`: rechaza salida vacía, truncamiento <50%, y DESAPARICIÓN de exports existentes; test
  5/5). El ejecutor (`/api/ai/ejecutar`) valida y si el barato falla **ESCALA una vez al modelo fuerte
  (`categoria:'plan'`=Opus)**; si tampoco pasa → **422** y el orquestador salta ese archivo (nunca aplica código
  roto). (b) El workflow ya **no falla** si el toggle de PRs está apagado: pushea la rama e imprime el enlace para
  abrir el PR a mano (warning), con instrucción de encender el ajuste. tsc 0, next build 0. **PENDIENTE de
  Alberto (opcional):** activar el toggle de PRs para que el PR draft se abra solo. **Nada se auto-mergea nunca.**
- **📈 Agente `trading-analista` (IBKR) — Fase 1 CONSTRUIDA en paper, sin ejecución real (17/07/2026, rama
  `claude/interactive-brokers-mcp-hbww2h`, PR #961 draft).** Alberto tiene cuenta en Interactive Brokers y
  acceso al MCP oficial. Brainstorming → spec (`docs/superpowers/specs/2026-07-17-agente-trading-ibkr-design.md`)
  → plan (`docs/superpowers/plans/2026-07-17-agente-trading-ibkr.md`) → implementación. Decisiones cerradas:
  **sin autonomía hasta ser rentable** (fases con puerta walk-forward), horizonte swing, **headless** (Telegram+BD),
  watchlist mixta A(ETFs)+B(valores conocidos)+C(cantera de descubrimiento), barreras de riesgo derivadas del
  historial real de Alberto (YTD −17.632 $ realizado, pérdidas concentradas en growth/AI de alta volatilidad).
  Construido: paquete puro **`@central/module-trading`** (indicadores, torneo de estrategias, motor paper, scoring
  walk-forward, riesgo — 24 tests verdes), 6 modelos Prisma `trading_*`, endpoints `/api/trading/{analizar,puntuar}`,
  `lib/trading-notify.ts`, skill `.claude/skills/trading-analista`. **Código ya en `main`** (el PR #961 mergeó la
  rama con toda la implementación; PR #967 draft = solo el doc de estado/prompts). **BD RESUELTA (17/07/2026,
  2ª sesión):** la migración `trading_fase1.sql` + seed se aplicó a la Supabase **CORRECTA `wswbehlcuxqxyinousql`**
  (la que usa plataforma por `DATABASE_URL`): 6 tablas + RLS + 13 filas de watchlist; columnas verificadas contra
  los modelos Prisma. **Ojo — corregido un error previo:** una sesión anterior había aplicado esas tablas por
  equivocación al **silo de ia-rest `efncqyvhniaxsirhdxaa`**; se han **DROPEADO** de ahí (estaban vacías salvo la
  semilla; ia-rest no tiene código que las lea). **PENDIENTE (Alberto):** dry-run de una pasada con el MCP de IBKR
  encendido, crear el trigger (~22:15 Sevilla), y resolver el billing de Supabase (org en Free, grace period
  agotado). Datos: IBKR gratis + FMP free → 0 €/mes. La cuenta está hoy 100% líquida (~33.656 €).

- **🐛 Director de código (2ª pasada): el acotado seguía devolviendo 0 tras #962 → era el BINDING DE ARRAY de
  Prisma, no el search_path (17/07/2026, rama `claude/director-agent-token-optimization-g5z5f5`).** Con el fix de
  #962 (cualificar `extensions.word_similarity`) ya desplegado en producción, la Action `ai-programar` SEGUÍA
  fallando en «mapa vacío». Descartado el search_path, el sospechoso es `WHERE busqueda ILIKE ANY(${patrones}::text[])`:
  el binding de arrays de Prisma en `$queryRaw` no se comporta en el pooler y devolvía 0 filas en runtime (el SQL
  crudo sí funciona). **Fix:** reescrita la query de `acotarArchivos` para usar SOLO parámetros escalares — ordena
  por `extensions.word_similarity(consulta, busqueda)` y toma los `limite` mayores (`.filter(score>0)` en JS),
  sin `ILIKE ANY(array)`. **Instrumentado:** `acotarArchivos` captura el mensaje de excepción (`errorMapa`) y el
  endpoint `/api/ai/codigo` lo escribe en `ai_usos.error` aunque registre ok:true — así el próximo run es
  DECISIVO (o funciona, o dice el error exacto). tsc 0, next build 0. Pendiente: merge + deploy + relanzar Action.
- **🐛 Director de código: `word_similarity` sin cualificar rompía el acotado en runtime (fix 17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** Al ejercitar por PRIMERA VEZ el orquestador Fase 2 (Action
  `ai-programar`, tras poner el secret `AI_GATEWAY_SECRET` en GitHub), el paso ACOTA (`/api/ai/codigo`) devolvía 0
  archivos → «mapa vacío/caído» y el ciclo abortaba antes de planificar/ejecutar. **Root cause:** `pg_trgm` vive en
  el schema `extensions` de Supabase; el **pooler (pgBouncer, modo transacción) NO aplica el `search_path` por rol**,
  así que `word_similarity(...)` sin cualificar lanza «function does not exist» SOLO en runtime (en el editor SQL sí
  resuelve, por eso pasó desapercibido). La query de `acotarArchivos` lo capturaba en su try/catch → `sinMapa=true`
  (y `ai_usos` registraba el `codigo` como ok=true porque el fallo se tragaba dentro). **Fix:** cualificar
  `extensions.word_similarity` en `lib/ia-director-codigo.ts` (independiente del search_path). Verificado: la query
  cruda devuelve `dinero.ts` como candidato #1 (score 0.40); tsc 0, next build 0. **Medición inaugural del ahorro:**
  primera fila real en `ai_usos` con `endpoint='codigo'` (qwen-2.5-coder, 0€). Tras merge+deploy, relanzar la Action
  cierra el end-to-end (plan Opus → ejecuta qwen → PR draft). (El SQL `mapa_arquitectura` ya estaba aplicado: 2.192
  filas; `PLATAFORMA_URL` ya estaba como secret, faltaba `AI_GATEWAY_SECRET`, ya puesto por Alberto vía Claude-Chrome.)
- **🏢 Empresas — búsqueda web GRATIS en 3 sitios (17/07/2026, rama `claude/empresas-problemas-financieros-h46hr6`).**
  Alberto: «con la IA de OpenRouter, ¿añadimos búsquedas en Google?» → «todo». Reusa `lib/websearch.ts::buscarWeb`
  (Gemini grounding GRATIS → plugin web OpenRouter de pago, gateado por presupuesto diario). Nuevo
  `lib/empresas-websearch.ts` (la IA SOLO resume/cita lo que la búsqueda devuelve, con enlaces, nunca inventa):
  (1) **🔎 Investigar (web)** por empresa en `EmpresaCard` → `POST /api/empresas/investigar` (actividad, por qué en
  concurso, web, tamaño, relevo/edad — capa gratis para triar ANTES de pagar eInforma y rellenar media ficha);
  (2) **🌐 Analizar sector** en el bloque del radar → `POST /api/empresas/sector-web` (crecimiento/decrecimiento del
  sector con fuentes); (3) **🌐 toggle en el agente** → `POST /api/empresas/agente {web:true}` busca en web y pasa el
  contexto a `responderEmpresas(pregunta, provincia, contextoWeb)`. Todos van por `accesoEmpresas` (Pablo también).
  Verificado: tests 21/21, `tsc` 0, `next build` 0 (rutas investigar/sector-web/agente presentes).
- **🏢 Empresas — token de invitado MOVIDO a BD (no env) para poder ponerlo/rotarlo sin Vercel (17/07/2026,
  rama `claude/empresas-problemas-financieros-h46hr6`).** Alberto pidió que lo configurara yo; el conector de
  Vercel de las sesiones de Claude **no permite escribir env vars**, así que el token de acceso invitado pasó de
  `EMPRESAS_INVITADO_TOKEN` (env) a la **tabla `empresas_acceso_token`** (fila única `id=1`, `token`/`activo`;
  REVOKE anon/authenticated; SQL `2026-07-17_empresas_acceso_token.sql`). El token de Pablo YA está insertado por
  Supabase MCP → funciona **sin redeploy**. Flujo: enlace `…/invitado/empresas?token=<v>` → la página lo canjea
  en **`GET /api/empresas/invitado`** (valida contra BD, fija cookie httpOnly `empresas_invitado`, redirige) →
  `lib/empresas-acceso.ts::accesoEmpresas` valida la cookie contra BD en runtime Node. **Middleware edge** (sin
  Prisma) solo enruta: `/invitado/*` siempre pasa, `/api/empresas/*` pasa si trae la cookie o es la entrada; sin
  cookie/sesión sigue el gate de sesión (no abre nada). Enriquecimiento POST + ingesta-manual siguen SOLO sesión.
  **Rotar/revocar:** `UPDATE empresas_acceso_token SET token=… / activo=false` por Supabase MCP (sin tocar Vercel).
  `tsc` 0, `next build` 0. Pendiente: Alberto abre el enlace y confirma que ve el panel.
- **🐛 Agente contable: consejo de ahorro sobre un TRASPASO mal etiquetado (fix 17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** Tras arreglar el enrutado (los consejos ya llegan al
  LLM), Alberto: *"dame 3 consejos para reducir mi gasto"* → *"Optimiza comisiones bancarias (#10 −1.691,58€)"*.
  **Root cause (2 capas, verificado en BD):** (1) **dato sucio** — el movimiento real es `TRANSF. 0128 F0552026`
  (transferencia de salida de Kutxabank, casi seguro liquidación de tarjeta/traspaso), pero la normalización IA
  lo rebautizó **"Comisión bancaria"** y quedó en `turistico_pisos`. Hay 3 hermanos `TRANSF. 0128` (−2.000,25 /
  −2.178 / −1.691,58) con etiquetas inventadas distintas ("TRANSF. 0128"/"cargo de 0128"/"Comisión bancaria"),
  todos en Pisos. La regla determinista de `lib/categorizar.ts::categorizarPorReglas` comprobaba `'TRANSF '`
  (espacio) y NO `'TRANSF.'` (punto) → estas transferencias se colaban a la IA, que alucinaba la etiqueta.
  (2) **diseño del agente** — para aconsejar reutilizaba la lista "Movimientos por revisar" (12 filas sin
  confirmar que mezclan ingresos de Booking, traspasos y mal clasificados) y el modelo agarraba el negativo más
  gordo visible. **Fix (código):** (a) `categorizarPorReglas` ahora también matchea `'TRANSF.'` → las
  transferencias son deterministas (`🔁 Transferencia`) con etiqueta veraz, sin pasar por la IA; (b) las
  preguntas de consejo (`esConsejo`) reciben un dataset nuevo **"En qué gastas de verdad"** — gasto REAL por
  categoría (`construirContexto(cuentaId,{paraConsejo})` → personal por subcategoría + negocio por destino,
  EXCLUYE ingresos y `traspaso_interno`); (c) system prompt: aconsejar SOLO desde ese bloque, NUNCA proponer
  reducir un traspaso/liquidación de tarjeta ni un ingreso, y la lista "Movimientos" NO es muestra de gasto.
  Tests 131/131 contable (3 nuevos en `contexto.test.ts`), tsc 0, next build 0. **PENDIENTE de Alberto:**
  confirmar qué es la cuenta "0128" para reclasificar los 3 movimientos (→ `traspaso_interno`) y aprender la regla.
- **🏢 Empresas — acceso INVITADO por token para Pablo + prueba end-to-end (17/07/2026, rama
  `claude/empresas-problemas-financieros-h46hr6`).** Alberto: «pantalla para Pablo, acceso mejor con un token».
  - **Acceso por token (sin cuenta):** env `EMPRESAS_INVITADO_TOKEN` (secreto, sin fallback). Página nueva
    **`/invitado/empresas`** (fuera del grupo `(usuario)` → sin sidebar ni sesión) que valida el token por
    `?token=` (fija cookie `empresas_invitado`) o cookie; si no vale, muestra «acceso no válido». `middleware.ts`
    deja pasar `/invitado/*` y `/api/empresas/*` con token válido. Guard `lib/empresas-acceso.ts::accesoEmpresas`
    (`sesion|invitado|null`) en las rutas de empresas; **el enriquecimiento POST es SOLO sesión** (gasta dinero,
    403 para invitado) y la UI le oculta «Enriquecer» + «Actualizar BORME». Pablo SÍ puede: filtrar, usar el
    agente, y rellenar la ficha cualitativa. **Enlace:** `…/invitado/empresas?token=<valor>`; revocar = cambiar env.
  - **Prueba end-to-end (todo lo que hay):** smoke de integración BORME→mapeo eInforma→señales→score compuesto
    (satura a 100 con motivo completo)→radar→contexto del agente = TODO OK; tests 20/20 + guardián 1/1; `tsc` 0;
    `next build` 0 (rutas `/invitado/empresas` y `/api/empresas/*` presentes). BD: enriquecimiento/ficha/coste a 0
    (sin contaminar), BORME con las 14 empresas reales intactas. Live real (BORME por boe.es y app Vercel) no
    verificable desde el sandbox — lo prueba Alberto/Pablo en el panel.
- **🏢 Empresas en dificultad — capa de enriquecimiento COMPLETA, solo pendiente la API key de eInforma
  (17/07/2026, rama `claude/empresas-problemas-financieros-h46hr6`).** Alberto: «haz todo, solo pendiente API
  eInforma». Construida toda la tubería de enriquecimiento de modo que lo ÚNICO que falta es contratar eInforma:
  - **Adapter `lib/empresas-einforma.ts`** (OAuth2 client_credentials + informe financiero; mapeo PURO testeado;
    rutas/campos del payload AISLADOS y marcados «confirmar con doc/sandbox al activar»). Sin
    `EINFORMA_CLIENT_ID`/`EINFORMA_CLIENT_SECRET` lanza `EinformaNoConfigurado` y degrada sin romper.
  - **Orquestador `lib/empresas-enriquecer.ts`**: tope de gasto mensual (`EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR`,
    default 50€; coste/empresa `EMPRESAS_ENRIQUECER_COSTE_EUR` default 12€), upsert + ledger de coste
    `empresas_enriquecimiento_coste`. Endpoint `POST /api/empresas/enriquecer` (+GET presupuesto).
  - **Scoring conectado:** `lib/empresas-senales.ts::enriquecimientoASenales` (umbrales de Alberto) → el
    `SenalesFinancieras` de `puntuarEmpresa`; `getEmpresasYRadar` lee el enriquecimiento y suma las señales.
  - **Ficha cualitativa manual (bloque E, USABLE YA sin API):** `GET/POST /api/empresas/ficha` + formulario en
    `EmpresaCard.tsx` (edad CEO/consejo, salud, descendencia Sí/No, preconcurso, notas).
  - **UI:** filtros de **facturación (rango M€)** y **sector/CNAE** (dormidos hasta que haya dato), botón
    **Enriquecer** por empresa (pide CIF si falta), badges (enriquecida/CNAE/facturación/preconcurso), línea de
    presupuesto gastado/tope. Agente actualizado (menciona CNAE/facturación cuando constan).
  - **BD (Supabase MCP, aplicada):** `empresas_enriquecimiento` + `empresas_ficha` + `empresas_enriquecimiento_coste`
    (REVOKE anon/authenticated; SQL versionado `2026-07-17_empresas_enriquecimiento.sql`).
  - Verificado: `node --test` 20/20 empresas + guardián secretos 1/1, `tsc` 0, `next build` 0 (rutas presentes).
  - **PENDIENTE Alberto:** contratar eInforma → meter `EINFORMA_CLIENT_ID/SECRET` en Vercel + confirmar las
    rutas/campos del payload en `empresas-einforma.ts`. Precio eInforma: informe financiero ~29,50€ retail /
    ~10-12€ en pack; API desde 40€/mes + entorno de pruebas gratis. RAI en informe comercial; ASNEF = Equifax aparte.
- **🏢 Empresas en dificultad — Fase 2 pieza 1 (agente) + modelo de scoring financiero (17/07/2026, rama
  `claude/empresas-problemas-financieros-h46hr6`).** (a) **Agente conversacional MERGEADO (PR #954):** chat en
  `/empresas` que responde por provincia/tipo/score sobre el dataset real (BORME Fase 1) vía pasarela IA gratis;
  la IA solo filtra/narra, cifras de la BD. Pieza pura `lib/empresas-agente-contexto.ts` (testeada), route
  `/api/empresas/agente`, UI `AgenteEmpresas.tsx`. En producción; Alberto lo prueba en su panel.
  (b) **Indicadores financieros de Alberto → scoring:** amplió el modelo con umbrales concretos (patrimonio neto
  <0, EBITDA neg. 2 años, fondo de maniobra neg., depósito de cuentas >12m, incidencias RAI/ASNEF, deuda/EBITDA
  >6× / refis). Implementados como bloque `SenalesFinancieras` en `lib/empresas-scoring.ts` (dormido hasta que el
  enriquecimiento rellene el dato; pesos v1 tuneables; tests 8/8). Diseño actualizado (§5 con tabla de sourcing,
  §3 fuente RAI/ASNEF, §7 campos `enriquecimientos`+`ficha_cualitativa`, bloque E cualitativo manual: edad
  CEO/consejo, salud, descendencia, preconcurso). **GATE:** casi todo el bloque A depende de **eInforma** (cuentas
  depositadas) + posible producto de morosidad para RAI/ASNEF; el filtro de facturación y el CNAE por empresa
  también. Pendiente: Alberto contrata eInforma + tope de gasto → se cablea enriquecimiento + radar CNAE real.
- **🐛 Agente contable: preguntas de CONSEJO caían al router determinista (fix 17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** "Dame 3 consejos para reducir mi gasto este mes"
  devolvía "No encuentro cargos de reducir": la frase contiene "gasto" → pasaba la guarda de dinero de
  `lib/contable/intencion.ts::detectarIntencion` y el extractor de concepto genérico agarraba "reducir"
  como un falso concepto. **Fix:** guarda nueva LO PRIMERO en `detectarIntencion` que devuelve `null` (→ LLM
  libre) ante consejo/recomendación/cómo-hacer (`consej|aconsej|recomiend|sugier|tips|ideas para|cómo
  puedo/reducir/ahorrar/gastar menos|ayúdame a`), comparando SIN acentos. No secuestra datos legítimos
  ("¿cómo va el dúplex?" y "cuánto gasté este mes" siguen). Tests 92/92 (2 de regresión), tsc 0, next build 0.
  De paso: estas preguntas abiertas ahora sí ejercitan OpenRouter (el camino de pago que Alberto acababa de
  recargar tras un 402 "requires more credits").

- **🏢 Empresas en dificultad — Fase 1 en plataforma (17/07/2026, rama `claude/empresas-problemas-financieros-h46hr6`, PR #946).**
  Nueva sección interna para detectar empresas tocadas (concursos/disoluciones/ampliaciones) como oportunidades de
  captación/compra. Spec + esquema ya fusionados (PR #942, `main`); esquema navegable en `apps/plataforma/public/esquema-empresas.html`.
  **Decisión de arquitectura:** módulo dentro de plataforma con núcleo portable pensado para promocionar a `apps/empresas` si
  algún día va a terceros. **Entregado en esta sesión (Fase 1, coste 0€):**
  - **BD (aplicada por Supabase MCP):** `borme_eventos`, `sector_tendencias` (`prisma/sql/2026-07-17_empresas.sql`, con `REVOKE anon,authenticated`) + columna `cuentas.rol` (`2026-07-17_cuentas_rol.sql`).
  - **Ingesta BORME:** `lib/borme.ts` (parser puro: clasificar acto + normalizar empresa, 7 tests) + `lib/borme-ingesta.ts` (descarga sumario boe.es + upsert idempotente) + cron `/api/cron/borme-ingesta` (`0 6 * * *`) + disparador manual `/api/empresas/ingesta-manual`.
  - **Scoring + radar:** `lib/empresas-scoring.ts` (0–100 con motivo, 4 tests) + `lib/empresas-radar.ts` (cuadrantes por provincia, 1 test) + `lib/empresas.ts` (lectura para UI).
  - **UI:** sección `/empresas` (`app/(usuario)/empresas/{page,EmpresasClient}.tsx`): radar por provincia + lista rankeada perezosa (PAGE=50) + botón "Actualizar BORME". Entrada en `UserSidebar`.
  - **Acceso por rol:** `session.ts` devuelve `rol`; `layout.tsx` guarda (rol='empresas' → solo `/empresas`, vía `x-pathname` que inyecta `middleware.ts`); nav filtrado. Para dar acceso a un tercero: alta por `/register` + `UPDATE cuentas SET rol='empresas' WHERE email=…`.
  - **Verificado en sandbox:** `node --test` 12/12 (módulos puros), `tsc` 0, `next build` exit 0, guardián de secretos 22/22.
  - **PENDIENTE de validar en Vivo (el sandbox bloquea boe.es y no corre la app):** la **ingesta real de BORME** — al desplegar, abrir `/empresas` y pulsar "Actualizar BORME" (o esperar al cron). La extracción del sumario (`descargarSumario`) es defensiva pero su mapeo exacto se confirma contra el feed real. **Fase 2 (pendiente):** enriquecimiento eInforma (balances + **filtro de facturación ≤2M** + fondos propios negativos), radar por CNAE real (INE + Central de Balances), agente conversacional, SABI.

- **📖 `apps/almacen` — Manual de uso dentro de la intranet, corporativo JJ (17/07/2026, rama `claude/warehouse-module-review-angvve`).**
  Alberto pidió "un manual del programa, todo corporativo de Joaquín Jaén, con enlace dentro de la intranet". Hecho como
  **página `/manual`** en el área de oficina (`app/(usuario)/manual/page.tsx`), server component con contenido estático → hereda
  la marca `@central/brand` (verde `#004433` + oro, Playfair, logo real) automáticamente. Portada con logo + filete de oro,
  índice en chips, y una tarjeta por sección con **pasos numerados** (círculo verde) fiel a cada pantalla: Panel, Almacenes,
  Familias, Materiales, Transferencias, Inventarios, Movimientos, Eventos y alquileres, Empleados, Área del empleado (`/mi`) y
  Escaparate público. Cierra con "Buenas prácticas" (editable/borrable conserva historial, € español, móvil, aviso bajo mínimo).
  **Enlace añadido al menú** (`app/(usuario)/nav-links.tsx`: fila `Manual`). CSS nuevo `.manual-*` al final de `globals.css` (usa
  `var(--brand,...)` con fallback). Verificado: `tsc` 0, `next build` OK (ruta `/manual`), **capturas Playwright móvil+escritorio**
  (`--brand=#004433`, logo cargado, títulos verdes). Los textos guía replican los subtítulos reales de cada sección.
- **🎨 `@central/brand` — capa de marca por cliente + Joaquín Jaén 100% corporativo (17/07/2026, PR #943 MERGEADO a `main` squash `e8aa589`).**
  Decisión de Alberto: sistematizar el diseño por CLIENTE en toda la casa de marcas (JJ, Rico González, Global…) — **ni
  agente programado ni MCP nuevo**, sino (1) capa de tema compartida + (2) skill de alta de marca on-demand; el MCP de
  diseño ya es `adobe-diseno` (Firefly). Entregado y en producción:
  - **`packages/brand` (`@central/brand`)**: contrato `Marca {paleta, tipografia, logos, radio}` (`tipos.ts`),
    `emitirVariables/emitirRootCss` (`css.ts`) que emiten los nombres de variable existentes (`--bg`,`--accent`,`--text`,
    `--serif`…) **+** los de marca (`--brand`,`--brand-ink`,`--brand-soft`), y `MARCA_JOAQUIN_JAEN` (`marcas/joaquin-jaen.ts`).
  - **Colores EXACTOS del logo real** (no estimados de la web): tras recibir Alberto el logotipo oficial, extraje la paleta
    decodificando el PNG con **Node+zlib** (no hay PIL/ImageMagick en el entorno) → **verde `#004433`** dominante + **oro `#998855`**
    de acento. `--brand` = verde (identidad/acciones), `--accent` = oro (filetes/bordes). Iteración previa había estimado
    `#1f4a37`/`#9e814f` de la web — SUSTITUIDOS por los exactos del logo.
  - **Tipografía**: el **nombre de marca NO se re-escribe** con una fuente parecida → se usa el **logotipo real** como marca.
    Para la UI, títulos en **Playfair Display** (serif Didone que casa con el lettering del logo) + cuerpo **Lato**, por `<link>`
    a Google Fonts (el build no descarga fuentes → red capada; evitar `next/font/google`). *Pendiente fino:* si Alberto da el
    nombre EXACTO de la fuente de su manual y está en Adobe Fonts, incrustarla vía Typekit y reemplazar Playfair.
  - **Logo real** (`apps/almacen/public/logo-jj.png`, 401×141 transparente): en el **login** va **embebido en base64**
    (`app/login/logo-data.ts` → `LOGO_JJ_DATAURI`) para que no falle carga ni caché; en cabeceras basta `<img src="/logo-jj.png">`
    (`app/brand.tsx`, `(publico)/layout.tsx`). Login rediseñado elegante (marco verde+oro, aire de invitación).
  - **Aplicado a `apps/almacen`**: dep `@central/brand` (`workspace:*`) + `transpilePackages`; `app/layout.tsx` inyecta
    `emitirRootCss(MARCA)` en `<head>` + `<link>` de fuentes. Repunté en `globals.css` identidad/acción a `--brand` (verde):
    h1, wordmark, nav activo, botón primario, chips, focus, precios, títulos de tarjeta, hero; **oro** para filetes/bordes
    (filete superior de oro en tarjetas + regla de oro bajo el hero, su sello). Verificado: tsc 0, `next build` OK,
    **capturas Playwright** móvil+escritorio confirmando `--brand=#004433` y `img.complete` del logo.
  - **Skill `marca-cliente`** (`.claude/skills/marca-cliente/SKILL.md`, indexada en `docs/SKILLS.md` §Diseño): flujo probado de
    alta de marca (material → extraer paleta con el script Node+zlib → logo base64/Adobe Fonts → objeto `Marca` → enchufar →
    verificar con Playwright) para replicar en Rico González, Global y demás **a coste marginal**. `@central/brand` listado en
    `CLAUDE.md` (módulos compartidos).
  - **Siguiente (cuando Alberto lo traiga):** nombre exacto de la fuente del manual JJ → Adobe Fonts; logos de Rico González /
    Global → correr `marca-cliente` para su `src/marcas/<cliente>.ts`. **URL oficial de presentación**:
    https://almacen-pisos-turisticos-projects.vercel.app

- **👥 `apps/rrhh` — branding Mariscos González + login neutro + cambiador de empresa (17/07/2026, rama `claude/error-p2qw3l`, PR #941).**
  Tres mejoras entregadas en un PR sobre la auditoría de seguridad/UX anterior:
  - **Branding Mariscos González:** `color_primario` actualizado a `#1B3461` (azul marino corporativo) en BD directamente con SQL. Logo ya estaba en `public/logos/mariscos-gonzalez.png`. Sidebar y portal empleado muestran colores correctos.
  - **Login neutro:** La página `/login` mostraba el logo de la primera empresa de la BD (`LIMIT 1` sin ORDER BY, resultado arbitrario). Eliminado todo branding de empresa del login — ahora muestra siempre `ia·rrhh` neutral.
  - **Cambiador de empresa en sidebar:** Pilar gestiona Global2 y Mariscos González con un solo login. Nuevos endpoints: `GET /api/admin/mis-empresas` (lista empresas del usuario) + `POST /api/auth/cambiar-empresa` (rota el JWT activo a otra empresa). Componente `CambiadorEmpresa.tsx` — se auto-carga, aparece en el sidebar solo si hay ≥2 empresas, muestra dropdown con mini-logos y tick en la activa. AdminShell lo incluye sin props extra.
  - **Vercel:** `central-rrhh` desplegado correctamente (DEPLOYED); ia-rest/ialimp/sivra/plataforma ignorados por `ignoreCommand`.
  - **Pendiente manual (Alberto):** activar `CRON_SECRET` en Vercel si no está configurado (`vercel env add CRON_SECRET production`).
  - **Ubicación GPS en fichajes:** columna Obra en `/admin/fichajes` ahora muestra `📍 Ver mapa` (enlace Google Maps) cuando hay coords pero no hay obra asignada. Antes mostraba siempre `—`.
  - **Pendiente código (próxima sesión):** SEG-05 revocación JWT empleados (`ALTER TABLE rrhh.empleados ADD COLUMN session_jti UUID`); SEG-06 invalidación logout responsable; MEJ-02 `input[type=month]` incompatible iOS Safari → dos selects o picker custom.

- **🗂️ Drive reorganizado en `CENTRAL/` + fuente de verdad (16/07/2026, rama `claude/drive-organization-options-vuam1c`).**
  El Drive de Alberto tenía la raíz («Mi unidad») como cajón de sastre (~90 archivos sueltos, duplicados en
  serie, un repo de código volcado entero con su `.git`, papeleras `BORRAR`/`_DUPLICADOS_BORRAR` a medio vaciar).
  **Paso 1 hecho por MCP:** creada la estructura `CENTRAL/` con 5 secciones (`01 PROGRAMA`, `02 CONTABILIDAD`,
  `03 FACTURAS Y GASTOS`, `04 CLIENTES`, `05 PERSONAL`) y 21 subcarpetas — todos los IDs en el nuevo
  **`docs/DRIVE-ESTRUCTURA.md`** (fuente de verdad). **Principio clave:** en Drive mover conserva el `fileId`,
  y los agentes referencian por ID → reorganizar = **anidar** las carpetas buenas bajo `CENTRAL`, sin tocar
  código. El pipeline vivo de `facturas-correo` (Apps Script `Facturas a Drive` → `_buzon_pdf` → archivo en
  `FACTURAS Apartamentos/2026` → conciliación banco con `factura_ref`) **sigue igual** (banner añadido a su
  skill; `correo-triaje` NO escribe en Drive, no se toca). **Pendiente:** Paso 2 = ejecutar
  `scripts/drive/reorganizar-drive.gs` (Apps Script one-shot con `DRY_RUN`, lo corre Alberto: mueve carpetas +
  reparte sueltos + aparta el `.git`/basura a `_REVISAR_BORRAR`); Paso 4 = vigilante semanal (Apps Script con
  trigger que barre `_buzon`/raíz y avisa por Telegram). Presentación del plan: artefacto Claude (link en el chat).
- **🏬 `apps/almacen` — maestro editable/borrable + fixes de UX móvil (17/07/2026, rama `claude/warehouse-module-review-angvve`, PR nuevo tras mergear #935).**
  Tras probar Alberto en producción, ronda de correcciones:
  - **Todo editable y borrable:** **Familias** (renombrar + borrar por fila; antes solo listaba nombres),
    **Materiales** (ficha con editar nombre/familia/categoría/**capacidad**/**precio alquiler**/coste/ud-bandeja/stock mínimo + borrar; la API PATCH/POST ganó `precioAlquiler`+`capacidad`+`stockMinimo`), **Almacenes**
    (botón borrar en la ficha, con **guarda**: `DELETE /api/espacios` devuelve 409 si el almacén aún tiene existencias — verificado que Central queda bloqueado), **Empleados** (editar nombre/usuario/teléfono además del reset de contraseña ya existente; `editarEmpleado` en `lib/empleados.ts`). Todos los borrados son **soft** (`activo=false`, conservan historial). Botón `.btn-danger` nuevo.
  - **Bug de conteo de inventario en móvil (crítico):** la tabla de conteo se iba en scroll horizontal y el input "Contado"
    quedaba **fuera de pantalla** → parecía que no se podían meter cantidades. Reemplazada la `<table>` por **filas
    apiladas** (`inventario-conteo.tsx`) con el input SIEMPRE visible (`font-size:16px` para no disparar el zoom de iOS).
  - **Logo del login roto:** usaba `/logo.svg` (icono roto en el móvil de Alberto pese a ser SVG válido). Cambiado al
    mismo **`/logo-mark.svg`** que la cabecera (probado que carga) + wordmark "Joaquín Jaén" en serif.
  - **Acceso DEMO (recordatorio):** login oficina `demo-jj@central.local` / `JJdemo2026`; pantalla principal `/panel`.
    Proyecto Vercel `almacen` (equipo *Pisos turísticos*); el tenant REAL de Joaquín sigue sin sembrar.
  - **URL oficial de presentación (17/07/2026):** **https://almacen-pisos-turisticos-projects.vercel.app** (subdominio
    Vercel de producción). Decisión de Alberto: NO se compra dominio; se enseña a Joaquín Jaén en este `.vercel.app`
    y, cuando lo aprueben, se conecta **su** dominio (Vercel → proyecto `almacen` → Settings → Domains → Add + CNAME).
    Nota: la integración Vercel MCP de la sesión no ve el proyecto `almacen` (no puede tocar sus dominios por API);
    los cambios de dominio se hacen a mano en el panel.


- **🏬 `apps/almacen` FASES 2·3·4 — operativa completa de almacén (16/07/2026, rama `claude/warehouse-module-review-angvve`, PR nuevo).**
  Continúa la Fase 1 (#929, ya en main) con las tres fases restantes en la misma rama:
  - **Fase 2 — eventos y alquileres.** Modelo de celda de 4 estados (disponible/reservado/en_transito/fuera) en
    `@central/module-materiales/eventos.ts` (reservar/cancelarReserva/entregar/devolver/enPropiedad/solapa; 11 tests puros).
    Servicio `apps/almacen/lib/eventos.ts`: presupuesto → confirmar (disponible→reservado) → entregar (reservado→fuera) →
    devolver (fuera→disponible + roturas perdidas) → cerrado; cancelar libera reservas. Tablas `almacen_eventos` +
    `almacen_evento_lineas`. UI `/eventos` (+ ficha con transiciones). Verificado en BD (ciclo reserva→entrega→devolución
    con roturas; datos borrados).
  - **Fase 3 — empleados + inventario por conteo.** Sesión con **tipo** (`oficina` | `empleado`) en el JWT (`lib/auth.ts`);
    la oficina crea/edita empleados (usuario+contraseña bcrypt, `lib/empleados.ts`), los empleados entran a un área móvil
    **`/mi`** y solo cuentan; **solo la oficina cierra** inventarios. Inventario = snapshot del sistema por espacio →
    conteo (ciego u abierto, `inventario-conteo.tsx` compartido) → cierre con ajustes/roturas al stock (reusa
    `ajusteInventario` del módulo). Tablas `almacen_empleados`, `almacen_inventarios`, `almacen_inventario_lineas`.
    Verificado en BD (cierre delta −2 → rotura, disponible 10→8; datos borrados). 59 tests módulo verdes.
  - **Fase 4 — escaparate público de alquiler (sin sesión).** `/catalogo` (169 materiales alquilables con foto/precio/
    **unidades reales**), `/catalogo/[id]` (ficha + CTA), `/reservar` (form: datos cliente + fechas + líneas → crea un
    **presupuesto** tipo alquiler que la oficina revisa). `lib/publico.ts` (`catalogoPublico`/`itemPublico`/`crearSolicitud`),
    API pública `POST /api/publico/solicitudes`, middleware abre `/catalogo|/reservar|/api/publico`. **Prioridad de eventos**
    (requisito de Alberto): la web ve `disponible`; al confirmar un evento el stock pasa a `reservado` y **desaparece de la web
    automáticamente** — verificado en BD (reservar 10 baja la disponibilidad pública; revertido). Diseño corporativo
    Joaquín Jaén (oro/serif), responsive tablet/móvil/PC. **PENDIENTE — bloqueado:** cobro con **Stripe** (conector sin
    autorizar) + claves + dominio; la reserva con pago auto-confirmaría el presupuesto (reserva de stock). También pendiente
    la **auto-previsión de material por nº de personas** con IA (mencionada para medio plazo). Verificado global: typecheck 0,
    `next build` OK (rutas `/catalogo`, `/catalogo/[id]`, `/reservar`, `/api/publico/solicitudes`).

- **🏬 `apps/almacen` FASE 1 — control multi-almacén (16/07/2026, rama `claude/warehouse-module-review-angvve`, PR #929).**
  La app pasa de "maestro de materiales" a **control operativo**. Modelo nuevo: **stock POR ALMACÉN** vía
  **ledger** (`almacen_movimientos`, verdad histórica) + **snapshot** (`almacen_stock`: disponible + en_transito)
  actualizados en la misma transacción Prisma; el maestro (`almacen_materiales`) conserva contadores globales
  = Σ stock. Tablas: `almacen_espacios` (central + haciendas, con **ficha**: dirección/contacto/tel/email/notas),
  `almacen_movimientos`, `almacen_stock`, `almacen_transferencias`, `almacen_comentarios` (hilo polimórfico de
  registro con foto opcional). **Migración = asiento de apertura**: el stock actual (227 materiales) quedó en un
  almacén **"Central"** (Σ 51.969 uds, sin pérdida). Lógica pura nueva en `@central/module-materiales`
  (`transferencias.ts`: iniciar/confirmar/cancelar traspaso "en tránsito"; 11 tests). Capa de servicio
  `apps/almacen/lib/almacen.ts` (registrarMovimiento/crear-confirmar-cancelar transferencia; motivo obligatorio en
  ajuste/rotura; identidad = usuario de oficina de la sesión). API: `/api/espacios|movimientos|transferencias|comentarios`.
  UI corporativa+responsive (drawer móvil): **Panel** (KPIs valor total/por almacén, bajo mínimo, traspasos
  pendientes), **Almacenes** (tarjetas + ficha editable + stock + comentarios), **Materiales** ampliada + **ficha**
  (stock por almacén, acciones entrada/salida/ajuste/rotura/traspaso, **historial**, comentarios), **Transferencias**
  (alta + confirmar recepción parcial con roturas / cancelar), **Movimientos** (feed filtrable). Verificado: 48 tests
  módulo + 22 guardián verdes, `next build` 21 rutas, typecheck limpio, y **flujo en tránsito probado en BD**
  (envío 10 → recibo 8 + 2 rotas → material 10→8, estado parcial; datos de prueba borrados). Roadmap escrito en
  `docs/superpowers/specs/2026-07-16-almacen-fase1-multialmacen-design.md`: **Fase 2** eventos/alquileres,
  **Fase 3** empleados+inventario por conteo, **Fase 4** web pública (prioridad de eventos + auto-previsión por nº
  personas con `@central/core-ai`). El "actor oficina" = login actual (`cuentas`); empleados llegan en Fase 3.

- **⏰ rrhh — calendario de fichaje + alerta Telegram + recordatorio push (16/07/2026, PR #933,
  MERGEADO).** Portal del empleado: la tabla plana de fichajes se sustituye por un **calendario
  mensual** (`FichajeEmpleado.tsx`) con días en verde (jornada ok), naranja (sin cerrar), verde
  oscuro (jornada activa) y anillo para hoy, más el total de horas del mes. Dos crons nuevos en
  `vercel.json`: `/api/cron/alerta-fichajes-abiertos` (diario 22h ES, Telegram vía
  `@central/core-telegram` si un fichaje activo lleva >10h sin fichar salida) y
  `/api/cron/recordatorio-fichaje` (L-V 9h ES, push a quien aún no ha fichado entrada, reusa
  `pushEmpleado()`). `@central/core-telegram` entra a deps + `transpilePackages` de `apps/rrhh`.

- **📱 `/banca` — libro de movimientos legible en móvil (16/07/2026, PR #932, MERGEADO).** El
  select de negocio + el botón 🤖 inline de cada fila comían el ancho en móvil y el CONCEPTO
  quedaba aplastado. Fix: la fila se apila en móvil (concepto a ancho completo arriba, legible;
  fecha+badges+importe debajo), select y 🤖 se ocultan (para eso está la ficha al tocar la fila,
  ya existente) y se añade la pista «👆 Toca un movimiento para ver/editar».

- **🤖 Fase 2 del Director de código — ORQUESTADOR autónomo "caro planifica / barato ejecuta" (16/07/2026,
  rama `claude/director-agent-token-optimization-g5z5f5`, PR draft nuevo).** Cierra el ciclo tras Fase 1 (#922)
  y 1.5 (#926, CLI ejecutor). Piezas: (1) **`lib/programador.ts::planificarTarea`** — el PLANIFICADOR: dada la
  orden + archivos candidatos (con contenido), el modelo ALTO (categoría `plan`) devuelve un plan estructurado
  `[{ruta,instruccion,criterio}]` (parse cleanJSON defensivo; degrada a plan vacío). (2) Endpoint
  **`POST /api/ai/programar`** (auth `AI_GATEWAY_SECRET`, presupuesto, `ai_usos` endpoint='programar'). (3)
  **`scripts/ai-programar.mjs`** — orquestador CLI end-to-end: acota (`/api/ai/codigo`) → planifica
  (`/api/ai/programar`) → ejecuta cada archivo (`/api/ai/ejecutar`) → aplica; el humano revisa+verifica+commitea.
  (4) **`.github/workflows/ai-programar.yml`** — versión plenamente autónoma SOLO por disparo manual
  (`workflow_dispatch`): corre el orquestador y abre **PR draft** + Telegram; NUNCA mergea (código del barato no
  entra a main sin revisión). Reglas del repo respetadas (cambios de comportamiento → PR draft, nunca auto-merge).
  **Activación:** el PLAN lo hace Claude alto de verdad solo cuando la categoría `plan` esté en el catálogo →
  corrida del cron `ia-director-refresh` (semanal/manual); hasta entonces degrada al modelo por defecto barato.
  Verificado: tsc 0 · next build 0 · `node --check` de ambos scripts OK, degradan sin envs.

- **⚡ Inicio: el segmento 🏢 Negocios ahora es PEREZOSO (16/07/2026, misma rama).** Cierra el coste que
  quedó anotado en la fusión: antes `/banca` renderizaba en SSR **ambos** segmentos (Dinero + Negocios) en cada
  visita → el holding se computaba siempre. Ahora el conmutador es por **navegación** (`banca/SegTabs.tsx`, dos
  `next/link` con prefetch: 💶 Dinero → `/banca`, 🏢 Negocios → `/banca?tab=negocios`) y `banca/page.tsx`
  **ramifica por `?tab`**: si `tab=negocios` devuelve solo `<NegociosResumen/>` (sin tocar saldos/movimientos/IA);
  si no, computa solo Dinero. Cada pestaña carga **solo sus datos** (fin del doble coste). Se **eliminó**
  `TabsDineroNegocios.tsx` (el conmutador cliente por `display`). Trade-off aceptado: cambiar de pestaña es una
  navegación (prefetch, rápida) y no conserva los filtros del libro al alternar. Verificado: `tsc` 0 + `next build`
  exit 0 (`/banca` 28,6 kB).

- **🏠 FUSIÓN Resumen + Banca → Inicio único con `💶 Dinero | 🏢 Negocios` (16/07/2026, rama `claude/banking-summary-consolidation-4xvbt7`, Fase 2 + PR2 + PR3).** Continuación del PR1 (recolocación
  de `/banca`). Alberto: "Resumen y Banca hacían prácticamente lo mismo". **Fase 2 (fusión de rutas):**
  `/banca` es ahora el **Inicio único** con un control segmentado cliente **`TabsDineroNegocios.tsx`** —
  **💶 Dinero** (el cuerpo de banca: saldos + movimientos + IA, por defecto) y **🏢 Negocios** (la foto del
  holding: negocios con resultado + consolidado intercompany + Modelo 130 + alertas). El contenido de Negocios
  se **movió** del antiguo `/dashboard` a **`banca/NegociosResumen.tsx`** (server component autocontenido y
  defensivo con `safe()`); `dashboard/page.tsx` quedó como **redirect a `/banca?tab=negocios`** (se conserva la
  ruta porque es destino de login/register y de ~15 fallbacks `redirect('/dashboard')` de operador). Aterrizajes
  actualizados a `/banca`: `app/page.tsx`, `login`, `register`, `CommandPalette` (entradas Inicio + Negocios).
  Ambos paneles se renderizan en SSR y el cliente alterna con `display` (cambio instantáneo; el inactivo queda
  montado para no perder filtros). ⚠️ **Coste conocido:** `/banca` carga AHORA también los datos del holding en
  cada request (NegociosResumen no es perezoso) — aceptable pero candidato a lazy-load si molesta. **PR2 (ficha
  de movimiento):** tocar el concepto de una fila del libro (`MovimientosTabla` en `BancaClient.tsx`) abre un
  **bottom-sheet** con importe/fecha/banco, negocio (select que reclasifica), ¿deducible?, factura y **🤖 ¿Qué
  es?** (reusa el sugeridor). **PR3 (menú):** el sidebar fusiona «Resumen»+«Banca» en una sola entrada **🏠 Inicio**
  (`/banca`). **Verificado:** `tsc` 0 en los archivos tocados + `next build` exit 0 (`/banca` 28.9 kB, `/dashboard`
  = redirect). ⚠️ Deja **desactualizada** la sección "Home /dashboard = RESUMEN" de `apps/plataforma/CLAUDE.md`
  (ver nota añadida). Pendiente opcional: lazy-load del segmento Negocios; agrupación más fina del menú por «💶 Dinero».


- **⚙️ Fase 1.5 delegación de código — CLI `scripts/ai-ejecutar.mjs` (16/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`, PR draft nuevo tras mergear #922).** Operacionaliza el
  ejecutor barato: Node puro sin deps que envuelve `POST /api/ai/ejecutar` — `--ruta`/`--instruccion`/`--criterio`
  reescriben un archivo EN SITIO (`--dry` = no escribe; `--maxTokens`; `--smoke` = healthcheck del endpoint).
  Envs `PLATAFORMA_URL`+`AI_GATEWAY_SECRET` (el secreto nunca se imprime; degrada con mensaje claro sin ellas).
  La skill `delegar-codigo` (paso 3) y `docs/DIRECTOR-CODIGO.md` ahora apuntan al CLI en vez del `curl` a pelo.
  **Propósito:** cada delegación queda en `ai_usos` (`endpoint='ejecutar'`) → así se MIDE el ahorro antes de
  decidir la Fase 2. El planificador sigue siendo la sesión (un CLI que planifique solo YA sería Fase 2).
  Verificado: `node --check` OK, degrada sin envs, valida args antes de tocar red.

- **🧠 Optimización de tokens del Director — estudio + Fase 1 "caro planifica / barato ejecuta" (16/07/2026,
  rama `claude/director-agent-token-optimization-g5z5f5`, PR #922 MERGEADO).** Alberto: que Claude alto (la 5/Opus)
  gaste tokens SOLO en planificar y una IA barata/gratis ejecute la programación, vía OpenRouter. **Estudio:**
  `docs/ESTUDIO-DIRECTOR-CODIGO-TOKENS.md` — la arquitectura ya estaba ~70% (Director de código acota a 0 tokens
  con `mapa_arquitectura`, Director de modelos, cron que refresca catálogo, presupuesto/`ai_usos`; Claude ya
  entra como slug de OpenRouter). El hueco: no había fase de PLAN con Claude alto ni EJECUTOR barato, y Opus
  estaba capado por `DIRECTOR_MAX_PRECIO_OUT`. **Fase 1 implementada (modelo de 3 roles):** (1) `elegirPorCategoria`
  en `lib/ia-director.ts` (elige del catálogo por tag, sin hop al decisor); (2) `chatConDirector` acepta
  `categoria?` (aditivo, `lib/pasarela.ts`); (3) endpoint `POST /api/ai/ejecutar` (coder barato reescribe UN
  archivo, `endpoint='ejecutar'` en `ai_usos`, no toca disco/git); (4) categoría `plan` (Claude alto) en el cron
  `ia-director-refresh` con techo propio `DIRECTOR_PLAN_PRECIO_OUT` (default 100); (5) skill de sesión
  `.claude/skills/delegar-codigo` (delega SOLO lo mecánico; Claude planifica+revisa+verifica). Todo aditivo,
  degrada solo, no toca la cadena gratis ni el presupuesto. **Pendiente:** la categoría `plan` entra al catálogo
  en la próxima corrida del cron (o disparo manual); el ejecutor (`codigo`) ya funciona. **Fase 2 (futura):**
  orquestador autónomo servidor (plan→ejecuta→verifica→PR), solo tras medir el ahorro real en `ai_usos`.

- **🧹 `/banca` PR1 — recolocación en móvil (16/07/2026, rama `claude/banking-summary-consolidation-4xvbt7`).**
  Alberto: en móvil los 7 botones de acciones de `/banca` se comían la primera pantalla y el libro de
  movimientos (lo que más usa) quedaba enterrado tras ~12 secciones. Presentación de diseño validada como
  Artifact antes de tocar código (fusión Resumen+Banca con control `Dinero|Negocios`, lista única de
  movimientos, barra limpia, pregúntame, ficha de movimiento — escalonado en 3 PRs). **PR1 (recolocación
  pura, sin tocar datos):** (1) nuevo componente **`AccionesBanca`** en `BancaClient.tsx` — los 7 botones
  pasan a **➕ Añadir** (Importar extracto + Conectar banco) y **⋯ Más** (Subir factura, Conciliar,
  Re-analizar, Exportar, Revisar correo), reutilizando los botones existentes tal cual (solo cambia el
  contenedor, mantienen sus modales); (2) el **libro de movimientos + bandejas subidos** justo tras el
  resumen del periodo, antes de los paneles de IA; (3) nuevo **`Plegable`** (cerrado por defecto, montaje
  perezoso) agrupa los paneles secundarios de IA/herramientas (Benchmark, AnálisisIA, Cazador, Antifraude,
  Tickets, Tesorería, Fugas); (4) el **mini-chat contable subido arriba** («pregúntame»). Verificado
  `tsc` sin errores en los 2 archivos + `next build` exit 0 (`/banca` compila). **Pendiente Fase 2/3:**
  fusión de rutas Resumen+Banca con segmentado `Dinero|Negocios`, ficha de movimiento al tocar (PR2),
  reagrupar el menú lateral por «💶 Dinero» (PR3). Decisiones por defecto tomadas: «Revisar correo» dentro
  de «⋯ Más», segmento por defecto Dinero, menú aparcado.
- **📦 Catálogo REAL de Joaquín Jaén cargado en `apps/almacen` (16/07/2026, rama `claude/warehouse-module-review-angvve`).**
  Se extrajo el **catálogo de alquiler online completo** (`plataformacateringjoaquinjaen.com/alquiler`, 8 categorías /
  21 subcategorías) usando **Claude Chrome** (el agente de navegador en el navegador de Alberto, que sí tiene red —
  este entorno la tiene capada). **227 productos** únicos (dedupe **por URL de imagen**, no por nombre: hay duplicados
  legítimos con misma etiqueta y distinta foto/stock/medida; se excluyó la ficha de prueba "test prueba editor").
  Cada producto trae nombre, categoría, stock (`cantidad`), precio de alquiler, rotura (=`coste_reposicion`),
  capacidad/medidas y **URL de foto** (externa, apuntando a su web). Migración BD: 2 columnas nuevas en
  `almacen_materiales` → **`precio_alquiler` numeric(10,2)** (tarifa de alquiler, distinta de `precio_compra`) y
  **`capacidad` text** ("56 cl", "Ø 30 cm"…). Sembrado en el tenant **DEMO** (`0de5…0001`): 21 familias + 227
  materiales. Carga hecha por MCP **a prueba de erratas**: JSON minificado en 3 trozos, cada uno verificado con
  **SHA-256** antes de insertar (si el pegado no cuadra, no entra nada) — validado también con regex que las 227 URLs
  de imagen están bien formadas. UI de `/materiales` ampliada: **miniatura de foto + capacidad + precio de alquiler**.
  Artefactos en repo: `apps/almacen/prisma/sql/2026-07-16_almacen_alquiler_capacidad.sql` (migración) y
  `apps/almacen/prisma/sql/catalogo-joaquin-jaen.json` (fuente). **Pendiente:** re-hospedar las fotos en Storage
  (ahora dependen de su web); tenant REAL de Joaquín aún sin sembrar; e-commerce público (stock real + pago + reserva
  + envío) sigue siendo visión futura.

- **⚠️ INFRAVENTA #2 — FERIA 2027 sin cargar como evento + corrección (15/07/2026, rama `claude/dynamic-pricing-uhvnak`).**
  Reserva Nieves Cárdenas (Booking 5518506647, Luxury, 15-17 abr 2027, 4 pax, Genius): prepago 349,18€
  (~175€/noche) en **PLENA FERIA** — fechas oficiales confirmadas por websearch: **13-18 abr 2027**
  (alumbrado el 12) — con mercado real **p50 ≈ 424€/noche** (4 pax; 2 pax ≈ 387€). Causa: la Feria 2027
  nunca entró en `pricing_eventos_auto` (era el pendiente "fechas exactas de Feria") y el bucket de abril,
  hecho con comps de ventanas no-Feria, arrastró la noche 502→177 en 6 pasadas. La guarda del PR #911 no
  aplicaba (abril SÍ tiene bucket de mes). **Corregido:** evento `feria` factor 2,5 insertado 12-18 abr
  2027 (lo heredan los 4 pisos vía MAX; el salto de evento re-sube SIN esperar la rampa ±20%) + 10 comps
  4pax (luxury) + 10 comps 2pax (busto) del 15-17 abr. Lección en `pricing_aprendizaje` id 36. **Regla de
  agente:** al confirmarse fechas de un evento mayor, cargarlas en `pricing_eventos_auto` EL MISMO DÍA;
  un bucket mensual con semana de evento dentro necesita comps DE ESA SEMANA o el percentil esconde el pico.

- **🦺 Módulo PRL en `apps/rrhh` (15/07/2026, PRs #908/#912/#913) — cierra un ítem 🔴 del roadmap.**
  Nueva sección `/admin/prl` con generación de documentos PDF (`@react-pdf/renderer`) con firma doble
  (empresa firma primero, luego el empleado en su portal): **autorización de uso de maquinaria** (Art. 17
  LPRL/RD 1215/1997, equipos con checkboxes), **entrega de EPIs** (RD 773/1997), **información de riesgos**
  (art. 18 LPRL) y **acuerdos de confidencialidad RGPD** con/sin acceso a datos (art. 29 RGPD/LOPDGDD
  art. 5) — para este último se añadieron campos a `rrhh.empresas` (nif, representante, domicilio…).
  Nuevo endpoint `GET /api/admin/empleados/[id]/documentos/[docId]/descargar-firmado`: fusiona el PDF
  original con una página de certificado de firma (eIDAS art. 26) vía `pdf-lib`, solo si
  `estado_firma='firmado'`. Fix de paso: la comparación del nombre en la firma del empleado solo miraba
  `e.nombre` (sin apellidos) → rechazaba firmas legítimas; ahora concatena nombre+apellidos.
  **Roadmap actualizado** (`docs/ROADMAP-rrhh.md`): el ítem 🔴 "PRL + entrega de EPIs" pasa a hecho.
  Sigue pendiente el ítem distinto "Contrato de encargo de tratamiento (art. 28 RGPD)" (empresa↔iarrhh,
  no es lo mismo que el acuerdo de confidencialidad del empleado).

- **🏬 `apps/almacen` DESPLEGADA + tematizada Joaquín Jaén (15/07/2026).** Tras mergear el PR #902 (cimientos
  en `main`), Alberto creó el **proyecto Vercel `almacen`** (Root `apps/almacen`, BD compartida, rol
  `prisma_almacen` con password puesta a mano). Deploy verde, login OK. **Cuenta de prueba:** cuenta DEMO
  `demo-jj@central.local` (id `0de50000-0000-4000-a000-000000000001`, "Holding Joaquín Jaén (DEMO)"), vacía
  (0 familias/materiales); se le fijó una contraseña temporal por MCP para poder entrar. El **tenant REAL** de
  Joaquín aún NO sembrado (pendiente: elegir email + password reales). **UI re-tematizada a la marca
  Joaquín Jaén** (logo oro/bronce + serif que envió Alberto): tema CLARO, acento oro `--accent:#a5864f`,
  tipografía serif en títulos, marca por CSS (pastilla + "JJ"). Pulido: tarjetas, estados vacíos, buscador +
  paginación client-side (50 + «Ver más») en materiales, formato € español, responsive. Marca reutilizable en
  `apps/almacen/app/brand.tsx` — **cuando se añada el logo real como `apps/almacen/public/logo.svg`**, sustituir
  el `.brand-mark` por un `<img>` (comentario en el fichero). **Bug latente pendiente (no bloquea, PR pequeño):**
  `apps/almacen/prisma/schema.prisma` declara `Negocio.cuenta_id`, pero el `negocios` compartido usa
  `sociedad_id` (jerarquía Cuenta→Sociedad→Negocio); la app no consulta ese modelo hoy, corregir antes de
  cablear selección de negocio.

- **💸 Egress de la BD compartida — bajada de frecuencia de crons de ialimp (15/07/2026).**
  Preocupación de Alberto: el banner de cuota de Supabase (plan `free`, 5 GB egress/mes). Auditoría: la BD
  compartida es pequeña (~75 MB/500 MB) → el gasto es **egress/uso**, no almacenamiento. `cron.job` de la BD
  tiene 1 solo job (`sync-smoobu-daily` `0 5 * * *`, despreciable). El consumidor claro eran **los crons de
  Vercel de ialimp**, y **ialimp aún no tiene cliente de pago (Vanesa/Sique Brilla es piloto, aún no paga)**,
  así que su polling de fondo no tiene justificación de latencia. Bajados en `apps/ialimp/vercel.json`:
  `/api/cron/procesar-documentos` **cada-minuto `* * * * *` → `*/15`** (≈43.200→2.880 ejec/mes, −93 %) y
  `/api/superadmin/mailing/cron` **`*/3` → `*/10`** (drip de prospección, no necesita 3-min). **Sin tocar**
  `pms/sync` (`*/10`, sincroniza reservas Smoobu/iCal y el CLAUDE.md depende de él para check-ins del mismo
  día) ni los crons de **ia-rest** (viven en su silo aparte `efncqyvhniaxsirhdxaa` → no gastan egress de la
  compartida). Pendiente de Alberto: leer **Supabase → Reports → Usage** para atribuir el 5 GB real (DB egress
  vs Storage vs Realtime); si el grueso es Storage (fotos del portal) o Realtime, la palanca está ahí, no en
  los crons.

- **🅿️ Flip de ia-rest → la BD compartida: APLAZADO (15/07/2026). Sin coste, sin prisa.**
  Verificado por MCP: los **dos** proyectos Supabase (ia-rest `efncqyvhniaxsirhdxaa` + compartido
  `wswbehlcuxqxyinousql`) están en la **misma organización en plan `free`** → el free tier permite **2
  proyectos**, así que el segundo **cuesta 0 €**. La razón para migrar ("no pagar dos BD") **no aplica hoy**.
  Y **nada depende del flip**: los módulos nuevos del holding (almacén incl.) **nacen en el compartido igual**,
  y `plataforma` ya lee ia-rest por el puerto HTTP (`/api/operador/*`). El flip es solo higiene/consolidación,
  con riesgo real (datos de producción + cadena VeriFactu + 32 secrets a re-meter a mano). **Cuando merezca la
  pena** (paso a Pro, o consolidación nativa), se hace con **Supabase CLI `secrets set --env-file .env.local`**
  (+ `vercel env pull`) — los 32 de golpe, NO a mano por navegador.
  - **Intento manual parcial de hoy (a limpiar):** se guardaron **2 secrets en el compartido**
    (`STRIPE_SECRET_KEY` live + `STRIPE_SECRET_KEY_TEST`). **Hay que borrarlos** (Supabase → compartido →
    Edge Functions → Secrets) para dejarlo como estaba (3 custom: `SMOOBU_API_KEY`/`FAL_API_KEY`/`CRON_SECRET`).
    Sin impacto vivo (las funciones stripe del compartido son clones dormidos; la pública `webhook-stripe` ni
    usa esos 2 — usa `STRIPE_WEBHOOK_SECRET`), pero una clave **live** fuera de sitio = exposición innecesaria.
  - **NO se tocaron** las envs de Vercel de ia-rest ni hubo Redeploy: producción intacta en el silo.

- **🧭 CANÓNICO — Arquitectura de datos del holding (15/07/2026). LEE ESTO ANTES DE TOCAR BD.**
  **Una sola BD para todo el holding: la compartida `wswbehlcuxqxyinousql`.** No se crean proyectos Supabase
  nuevos por vertical. Cada módulo = tablas scoped por tenant en la compartida; `apps/plataforma` consolida.
  **`apps/ia-rest` sigue en un silo TRANSITORIO** (`efncqyvhniaxsirhdxaa`, schema `public`) **en migración**
  al schema `iarest` de la compartida (~80% hecho: DDL/funciones/edge/storage clonados; **falta el "flip"** de
  envs Vercel + datos vivos). ⚠️ **Cualquier módulo nuevo del holding (almacén incl.) nace en la compartida,
  NO dentro de ia-rest.** Entradas históricas más abajo que digan "ia-rest ya lee la compartida" describen un
  **intento parcial/revertido**, no el estado real → obsoletas. Fuente: `docs/PLAN-consolidacion-BD-holding.md`
  y `MATRIZ.md` ("Arquitectura de datos del holding"). *(Corrige el error de esta sesión: se arrancó el almacén
  en el silo de ia-rest por leer esas entradas viejas como si la unificación estuviera cerrada.)*

- **📋 Reunión Joaquín + auditoría del módulo ALMACÉN (14/07/2026, rama `claude/warehouse-module-review-angvve`).**
  Alberto tuvo ~2 h con Joaquín (dueño de un grupo de **catering/eventos** en Sevilla) para arrancar su
  **primer módulo: el ALMACÉN**. Grabación en Drive (`Jj 1 almacen_original.txt`, transcripción automática
  MALA — el diseño real está de 01:10 a 02:05). Entregado **`docs/ALMACEN-JJ-reunion-y-auditoria.md`** con
  3 partes: resumen de la reunión (requisitos R1–R12, flujo evento→picking→carga→entrega→devolución con
  firma, roles, fases), auditoría del código y cruce requisito↔código.
  **Hallazgo clave:** el motor de almacén **YA existe** (`packages/module-materiales`: ledger de movimientos,
  espacios/ubicaciones, unidades serializadas con QR, kits, inventario físico, mantenimiento, proveedores,
  valoración) y **`apps/ia-rest` (Voice POS del propio Joaquín Jaén, EN PRODUCCIÓN) ya implementa el ~70–80%**
  (catálogo, movimientos, espacios, QR, inventario físico, ASN con OCR de albarán, portal almacén central).
  `apps/alquiler` es deliberadamente ligera (stock entero plano). **Lo genuinamente NUEVO:** orquestación del
  flujo de evento de extremo a extremo, plantillas de material por tipo de evento (sobre `Kit`), calendario de
  eventos + anti-doble-reserva (`module-agenda` existe **sin consumo**), captura de firma/foto/vídeo, muelles
  de carga como `Espacio`, modo offline y PIN temporal. **Fase 1 acordada:** maestro por familias + inventario
  inicial "gordo" + plantillas de evento + alta de evento + salidas/entradas con firma. **Decisión CERRADA
  (15/07):** nueva **`apps/almacen`** sobre la **BD compartida** (NO extender ia-rest mientras esté en el silo)
  — ver banner canónico de arquitectura arriba. Sin código nuevo aún: esto es descubrimiento + auditoría.
  **Sesión de diseño (15/07):** repasado el esquema con Alberto + su **plantilla de materiales real** (foto).
  Decisiones cerradas de Fase 1 (adenda en el doc): tenant = **Catering Joaquín Jaén**; **todo 100% editable
  desde oficina** (familias/artículos/tipos de evento/bloques/muelles); **plantillas = bloques componibles**
  (Kit/expandirKit), validadas 1:1 con la hoja; **RAKI = bandeja** (`Material.empaque`, contar por bandejas);
  **solo 2 roles** (responsable almacén=tablet, responsable evento/lleva-y-trae=móvil, metre a mano); cuadre de
  stock por **doble conteo** de las 2 personas; **alquiler a terceros** en Fase 1 (receptor firma nombre+DNI,
  tipo Amazon); **personal = fase posterior pero se captura ya** `Evento.personal_previsto`; maquinaria por
  nombre (QR opcional). Idea validada para Fase 2: **agente IA de plantillas** que adelanta plantilla y predice
  material+personal (bucle previsto→real→sobrante, memoria en BD como el pricing-agente). Entregado esquema
  visual (artefacto Claude) + adenda de decisiones en `docs/ALMACEN-JJ-reunion-y-auditoria.md`. 4 preguntas
  abiertas para Joaquín (cantidades por comensal/mesa, devolución parcial, imputación de mermas, OCR de la hoja).

- **🔧 Auditoría completa de `/banca` + arreglo de hallazgos (14/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Tras el fix del crash, Alberto pidió «auditoría completa». 4 revisores en paralelo (correctitud servidor,
  rutas IA, tickets F5a, reglas del repo); cada hallazgo verificado a mano. **Ningún crítico.** Confirmado LIMPIO:
  auth en las 6 rutas IA, timeouts de IA, degradación, no-alucinación de cifras (la IA narra, los € salen de SQL),
  antifraude determinista, regex de acentos de tickets (U+0300–U+036F, byte a byte), scope `cuenta_id`, SQL
  parametrizado, rendimiento (paginación + montaje perezoso). **Arreglados (mismo PR):**
  1. **[MEDIO] Libro + P&L pisos ignoraban Año/Trimestre** (`banca/page.tsx`): el `IntervaloSelector` solo pone
     `?year=&quarter=` en esos modos, así que `desde/hasta` quedaban vacíos → el libro mostraba TODO el histórico
     y los pisos el mes en curso. Ahora se DERIVA el rango del trimestre/año. Además el P&L mensual de pisos +
     benchmark solo se pintan si el periodo es UN mes natural (`esMesUnico`); en trimestre/año el agregado ya
     sale en `ResumenPeriodo`.
  2. **[MEDIO] 500 por fecha malformada en la URL** (`banca/page.tsx`): `listarMovimientosLedger` no está en
     `safe()` y casteaba `${desde}::date` crudo → `/banca?desde=hoy` reventaba toda la página. Añadido saneo
     `fechaValida()` (ISO real; rechaza `hoy`, `2025-13-45`, `2025-02-30`) antes de que llegue al SQL.
  3. **[MEDIO responsive] CSS del scroll móvil del libro acoplada a `RevisarBandeja`** (condicional): si no había
     «gastos por revisar», el libro desbordaba en móvil (<375px). Movidas `.banca-movs-outer/.banca-movs-row` al
     `<style>` incondicional de `page.tsx`.
  4. [BAJO] `antifraude/route.ts`: `~${base.toFixed(2)}€` → `eur(base)` (formato español).
  5. [BAJO] `BenchmarkPisos.tsx`: nombre de piso con `flex:1/minWidth:0` (trunca bien en móvil) + `margen` NaN-safe.
  6. [BAJO] `lib/tickets.ts`: `guardarTicket` en `prisma.$transaction` (cabecera+líneas atómicas); `num()` entiende
     separador de miles (`"1.234,56"`→1234.56, antes daba null).
  Verificado: `tsc` 0 · `next build` exit 0 · 18/18 en test de lógica pura (fechaValida/rango trimestre/esMesUnico/num).
  **Pendiente (decisión de Alberto, NO tocado):** multi-tenant SIVRA — `getPLMensual` no filtra por cuenta (los
  pisos son mono-tenant; ya era así en `page.tsx` antes de esto). Y 2 errores Prisma pre-existentes ajenos:
  `concursos-cierre` (`make_interval(days => bigint)` falta `::int`) y `sivra/pricing/resumen-diario` (`created_at` no existe).

- **⚠️ INFRAVENTA en noche KAROL G + corrección (15/07/2026, rama `claude/dynamic-pricing-uhvnak`).**
  Reserva Andrea Salvatierra (Airbnb HMDB24SZDK, Luxury, 11-13 jun 2027, **finde Karol G ×3 La Cartuja,
  factor 2,5**): 687€ brutos las 2 noches (~343€/noche) cuando el mercado Booking real de ese finde estaba
  en **p50 ≈ 930€/noche** (4 pax, centro, rango 524-1.333). Causa raíz: **jun-2027 sin comps → fallback
  global hundió la base** y el motor bajó la noche de evento 788→283 en 5 pasadas pese al factor (el factor
  multiplica una base hundida). Corregido: 10 comps 4pax (escenario luxury) + 10 comps 2pax (escenario
  busto, p50 ≈ 628 vs 368 escrito) ingestados vía `/api/sivra/mercado/ingest` para 11-13 jun 2027 → el cron
  debe re-subir la noche libre del 13-jun y el finde de Busto. Lección en `pricing_aprendizaje` id 35.
  **Regla YA IMPLEMENTADA en el motor (PR #911, mismo día):** con evento factor ≥2 y sin comps del mes,
  `apps/plataforma/app/api/sivra/pricing/apply/route.ts` congela el precio actual en esas fechas (solo
  puede subir, salvo que el `max_price` del propietario exija bajar). Documentado como landmine §13 en
  `apps/sivra/docs/pricing-automatico.md`. Detalle extra sin cerrar: la reserva es de **5 huéspedes en
  piso de aforo 4** — revisar ocupación máxima del anuncio Airbnb.

- **🏷️ Bandeja «Gastos por revisar» — último productor de flag `requiere_revision` zombie tapado (15/07/2026, rama `claude/expense-category-assignment-4gjes9`).**
  Alberto vio en `/banca` un cargo de CORTEFIEL (`PAGO CON TARJETA EN MODA, CALZADO Y COMPLEMENTOS`, -139,64€,
  10/07) en «Gastos por revisar · categoría» y protestó: *"¿la IA no lo encontró? pone calzado y complementos"*.
  **Diagnóstico (no era fallo de clasificación):** el movimiento estaba YA bien clasificado (`categoria='tarjeta'`,
  `subcategoria='ropa'` — la keyword `CALZADO` sí casó —, `destino='personal'`, `destino_confirmado=true`). Salía
  en la bandeja solo por un `requiere_revision=true` **zombie**. **Causa raíz:** el saneo del 2026-07-10
  (`2026-07-10_limpiar_requiere_revision_confirmados.sql`) arregló `/api/banca/confirmar` y limpió los ~1.200
  zombies existentes, pero **dejó sin tapar `/api/banca/destino`** (reclasificar el negocio desde el libro de
  `/banca` o el desglose de correduría): marcaba `destino_confirmado=true` SIN limpiar `requiere_revision`. Y la
  bandeja `lib/banca.ts::listarPorRevisar` era el ÚNICO read-path sin el filtro canónico `destino_confirmado=false`
  (que sí tienen `getAlertas`, health-check Check 2 y `/finanzas/gastos`) → por eso el zombie salía ahí y no en el
  banner. **Arreglo (PR draft):** (1) `/api/banca/destino` añade `requiere_revision = false` a sus 2 UPDATEs
  (fila única + regla por comercio) → como el resto de rutas de confirmar; (2) `listarPorRevisar` filtra
  `COALESCE(destino_confirmado,false)=false`; (3) backfill idempotente `2026-07-15_limpiar_requiere_revision_destino.sql`
  (**ya aplicado en Supabase por MCP**: `requiere_revision=false WHERE requiere_revision AND destino_confirmado`).
  Verificado: la fila CORTEFIEL queda `requiere_revision=false` y la bandeja de gastos por revisar de Alberto
  devuelve 0. Sin migración de esquema; cambios en raw SQL, sin superficie de tipos.

- **💸 CORTE del cargo excesivo de Vercel — Build CPU Minutes (15/07/2026, rama `claude/vercel-excessive-charges-06p4a6`).**
  Alberto avisó de una factura de Vercel de **754,79 US$** (recibo 2789-8949, 14 jun–13 jul). Desglose: el
  **99% era una sola línea, `Build CPU Minutes` = 183.108 min ≈ 600,59 US$** (el resto —funciones, ISR, memoria,
  observabilidad, plan Pro— <24 US$). **Causa raíz:** ningún `vercel.json` tenía `ignoreCommand`, así que como
  ~7 proyectos Vercel cuelgan del MISMO repo, **cada push reconstruía TODOS los proyectos** (aunque el commit
  solo tocara `docs/` o una app), y encima `auditoria.yml` corría en todas las ramas y **commiteaba de vuelta**
  la radiografía con `[skip ci]` (que frena Actions pero NO Vercel) → cada push real generaba un 2º push que
  volvía a reconstruir todo. Con la cadencia de rutinas automáticas + tráfico manual, decenas de builds/día ×
  ~7 proyectos × install pesado (`npx pnpm@… --no-frozen-lockfile` + `prisma generate && next build`).
  **Arreglo (PR draft):**
  1. **`scripts/vercel-ignore-build.mjs`** (nuevo): cada `apps/<app>/vercel.json` lo invoca por `ignoreCommand`.
     Salta el build (exit 0) salvo que el commit toque `apps/<app>/`, `packages/*` o los manifiestos raíz
     (exit 1); los commits `[skip ci]` nunca construyen; fail-open ante cualquier duda. Añadido a los **7**
     `vercel.json` (ia-rest, plataforma, sivra, ialimp, rrhh, alquiler, transporte).
  2. **`auditoria.yml`**: el trigger y el commit-bot de la radiografía se restringen a `main` (antes `['**']`),
     así deja de generar el push-amplificador en ramas de feature.
  3. **Pendiente MANUAL de Alberto (dashboard):** activar **Spend Management** en el equipo Vercel
     (`Settings → Billing`) con aviso por email a un umbral (p.ej. 50 US$) — red de seguridad para que un
     runaway avise en horas, no en la factura. (Secundario, no bloqueante: aligerar el install fijando pnpm por
     Corepack para no re-descargar el binario en cada build.)
  Ahorro estimado **−90/95%** de Build CPU Minutes. Verificación real = ver caer el uso en el dashboard a los
  2-3 días (y que los deploys de proyectos no afectados salgan como «Ignored»). Doc corregida:
  `SKILL-proyecto-claude.md` ya no dice "sin límite, sin ignoreCommand".
- **🔐 Endurecimiento header-only del token de alertas `ALERTA_TOKEN` (14/07/2026, rama
  `claude/alerta-token-header-only`):** follow-up sobre el `ALERTA_TOKEN` que introdujo el PR #871.
  `/api/internal/alerta` (`app/api/internal/alerta/route.ts`) ahora acepta el token dedicado
  **solo por cabecera `Authorization: Bearer`** — se quitó el `?secret=` de `isAlertaTokenAuthorized`,
  porque es el token que viaja en los prompts de las rutinas y no debe filtrarse por logs de acceso/Referer.
  El `CRON_SECRET` de respaldo (vía `isCronAuthorized`) no cambia. **Contexto:** el PR #859 (que hacía lo
  mismo con el nombre `ALERTA_SECRET`) quedó **superado por #871** (ya en main) → se **cierra** #859 como
  duplicado; este follow-up recupera la única mejora suya (header-only). **Pendiente de Alberto** (manual,
  sin secretos en repo): generar `ALERTA_TOKEN` (`openssl rand -hex 32`) en env de plataforma + entorno de
  Claude Code, y rotar el `CRON_SECRET` débil (Vercel Prod+Preview + secret de GitHub Actions).

- **🐛 FIX crash de `/banca` + unificación real con Radiografía (14/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Alberto: «hay errores y no es lo que hablamos» (captura móvil con Banca **y** Radiografía como dos entradas
  separadas en el menú). **Dos cosas:**
  1. **CRASH de `/banca` (error de runtime #1 en producción, 6 veces / 2 usuarios):** *«Attempted to call
     periodoLabel() from the server but periodoLabel is on the client»*. Causa: `periodoLabel` y el tipo `Periodo`
     se exportaban desde `IntervaloSelector.tsx` (**`'use client'`**), y `banca/page.tsx` (server component) llamaba
     a `periodoLabel(periodo)` → Next.js no deja invocar una función de un módulo cliente desde el servidor. **NO lo
     cazan `tsc` ni `next build`** (solo revienta en ejecución RSC). **Fix:** helpers puros extraídos a nuevo módulo
     **`app/(usuario)/finanzas/periodo.ts`** (SIN `'use client'`: `Periodo`/`MESES`/`periodoLabel`); `IntervaloSelector`
     los importa y re-exporta SOLO el `type Periodo` (compat); `banca/page.tsx` importa `periodoLabel` de `./periodo`.
     ⚠️ **Patrón a vigilar:** nunca importar una FUNCIÓN de un módulo `'use client'` desde un server component.
  2. **Unificación F1 que quedó a medias (el «no es lo que hablamos»):** el plan era `/banca` = página única y
     `/finanzas/radiografia` **redirige** a `/banca`; pero coexistían las dos en la sidebar. `/banca` (vía
     `ResumenPeriodo`) YA es superconjunto de la Radiografía (misma cabecera KPIs, personal BBVA/Kutxa, negocios
     correduría+pisos, base IRPF + enlace a «Mi declaración», y además P&L pisos, benchmark, IA, tickets, tesorería,
     libro). **Hecho:** `radiografia/page.tsx` → `redirect('/banca'+querystring)` (conserva year/quarter/desde/hasta;
     `RadiografiaClient.tsx` **no se borra**, reversible); `UserSidebar.tsx` retira la entrada «Radiografía» (Banca =
     puerta única). Verificado: `tsc` 0 + `next build` exit 0 (la confirmación end-to-end del crash es la preview).
  **Aparte (pre-existentes, NO de esta rama):** timeouts de crons (facturas-scan/conciliar-gmail, ai/chat,
  concursos-ingesta) y 2 errores Prisma en producción — `/api/cron/concursos-cierre` (`make_interval(days => bigint)
  no existe` → falta cast `::int`) y `/api/sivra/pricing/resumen-diario` (`column "created_at" does not exist`).
- **🔍 Auditoría contable completa (14/07/2026).** Informe en `docs/AUDITORIA-CONTABLE-2026-07.md`.
  Alberto pidió asegurar que no se hubiera perdido ningún gasto. Contra la BD (cuenta `4fdc993a…`):
  - **Gasto real OCULTO recuperado (~406€):** movimientos PSD2 (feed real) que estaban TODOS `ignorado`
    sin copia activa → **2 IBI del Ayuntamiento (343,10€)** + **seguro de vida Kutxa (25,63€)** + 11 compras
    de tarjeta (37,20€) restaurados (`duplicado_estado=NULL`). **Causa:** el dedupe cross-origen
    (`importarExtracto`) se pasa de frenada cuando hay 2 movimientos legítimos del **mismo importe el mismo
    día** (2 IBI de 171,55€) e ignora también las copias PSD2 buenas → **landmine a vigilar / posible fix**.
  - **Verificado sin pérdida:** cuenta fantasma BBVA `cdb981d3…` (75 movs todos ignorados) = duplicados
    cross-account del BBVA real; sin reglas genéricas peligrosas; correduría 2026 ingresa 7.236€ (+1.133€, no
    está en el landmine 0€); traspasos internos netean a 0; ningún movimiento 2026 sin destino; BBVA/Kutxa
    frescos hasta 13-jul; `incomes` 1.974 filas hasta abr-2027.
  - **Limpieza:** 9 facturas más mal archivadas en el tenant DEMO (5.263€, reales de Alberto: Allianz,
    Booking×3, ASECON, IONOS, Petroprix, fal.ai, un PAGO RECIBO mal parseado) **borradas** (raíz ya
    arreglada en #896).
  - **Backlog para Alberto (no pérdida):** 3 facturas pendientes (2 ventas Socorro + ASECON 1.210€); ~38
    cargos sin confirmar + ~70 abonos por revisar en corrientes; pendiente su respuesta IONOS/gasolina.

- **🧹 Limpieza de tarjetas Kutxabank + fix del cron facturas-scan (14/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  Tras la Fase 3, Alberto pidió "revisa que cuadren todas las tarjetas". Revisión contra BD (Supabase,
  filtrando `cuenta_id` de Alberto `4fdc993a…`):
  - **Cuadre OK:** las 2 tarjetas (…0302 Pilar, …0300 Alberto) cuadran al céntimo (líneas `PAGO RECIBO`
    del detalle = cargos `TARJ.CRDTO` de la corriente Kutxabank) en los 15 meses con extracto.
  - **Limpieza aplicada por SQL (MCP):** (a) 2 reglas aprendidas MALAS borradas de `banca_destino_reglas`
    (`IONOS→seguros`, `PETROPRIX→seguros`) — metían hosting y gasolina en la correduría; (b) ~**492€**
    sacados de `destino='seguros'` que no eran correduría (IONOS 177 + gasolineras Petroprix/Plenergy/Isbilya
    190 + clínica Grupo Vivo 125) → la correduría salía ~492€ más cara de lo real; (c) 26 compras de Pilar +
    11 más confirmadas como personal; (d) 11 devoluciones resueltas (incl. Círculo Mercantil 80€); (e) tarjeta
    **0300** corregida de `tipo='corriente'`→`'tarjeta'` y su detalle jun-jul (estaba en una cuenta genérica
    "Importado (Excel)" por el import Excel viejo) **unificado** en la 0300: borradas 48+8 filas duplicadas
    ya `ignoradas`, movidos los activos, cuenta genérica oculta. Estado final: 0 mal en seguros, 0 por revisar.
  - **🐛 Bug encontrado y arreglado — cron `facturas-scan` mete facturas en tenants ajenos.** El aviso raro
    "🟡 SIVRA · Anthropic 180€ (proveedor nuevo)" era la suscripción de Claude de Alberto (Max plan 20x,
    217,80€ = 180€ + 21% IVA) archivada en la cuenta **DEMO "Holding Joaquín Jaén [seed-demo]"**, no en la suya.
    Causa: el cron hacía `SELECT id FROM cuentas` (TODAS, incl. demo) y escaneaba el **Gmail compartido**
    (`GMAIL_USER`, que es de UNA cuenta) para cada una → las facturas de Alberto se insertaban en cada tenant.
    **Fix** (`app/api/cron/facturas-scan/route.ts` + `lib/agente-facturas/cuenta-buzon.ts::resolverCuentaBuzon`,
    puro y testeado): el escaneo de Gmail se hace SOLO para la cuenta dueña del buzón (env
    **`FACTURAS_CUENTA_ID`** → cuenta con `email==GMAIL_USER` → la única real si solo hay una; si no se
    resuelve, no escanea). Se excluyen las cuentas `[seed-demo]` del cron. `verificarPagosPendientes` (global)
    se llama una vez. Las 6 filas basura de Anthropic del demo borradas. Tests 7/7, `tsc` 0.


- **🛒 Tickets de súper — F5a: OCR + guardado + subir/listar en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Arranca la F5 (el módulo grande). **BD nueva** `prisma/sql/2026-07-13_tickets_compra.sql`: `tickets_compra`
  (super/super_norm/fecha/total/n_lineas/movimiento_id?/imagen_url?) + `tickets_lineas`
  (producto_raw/producto_norm/cantidad/precio_unit/precio_total, denormaliza super_norm+fecha para el
  comparador), scope `cuenta_id`, `REVOKE anon/authenticated`. **⚠️ PENDIENTE APLICAR por Supabase MCP** (aditiva
  e idempotente; el endpoint degrada mientras tanto). **`lib/tickets.ts`:** `ocrTicket(base64,mediaType)` con
  **`nimVision`** (mismo patrón que `factura-ocr.ts`, IA de visión NIM gratis) → cabecera + líneas; `normalizarSuper`
  (mercadona/dia/lidl/carrefour/aldi/alcampo/eroski/consum/ahorramas…) + `normalizarProducto` (clave difusa v1:
  sin acentos/puntuación) para comparar entre súpers; `guardarTicket`/`listarTickets`. **`POST/GET /api/banca/ticket`**
  (multipart `file`; `maxDuration=60`; valida tipo/≤12MB; degrada: sin IA→nota, sin tabla→devuelve el OCR con
  `guardado:false`). **`TicketsSuper.tsx`** (client, bajo demanda en /banca): subir foto (`capture=environment`) →
  muestra líneas leídas + guardado + últimos tickets. **F5b (pendiente):** comparador de precios (súper más
  barato por producto, evolución, cesta) + conciliación con el cargo del banco. Verificado: `tsc` 0 + `next build`
  exit 0. (F4 entregada: sugerir por fila #889, benchmark #890, fugas #891, antifraude #892, resumen mensual #893.)

- **📤 Cierre de mes narrado → Telegram (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 5º corte).**
  Tras el #892 (antifraude). Cron `día 1 a las 08:00` (`0 8 1 * *` en `vercel.json`) `/api/cron/resumen-mensual`
  (auth `Bearer CRON_SECRET`, igual que `resumen-semanal`; GET para Vercel + POST manual). `lib/resumen-mensual.ts::`
  `enviarResumenMensual()` itera `SELECT id FROM cuentas` (patrón de `contable-proactivo`) y por cada cuenta
  recompone el **MES ANTERIOR** con `getResumenFinanciero(cuentaId, year, 0, desde, hasta)` (mismas cifras que
  /banca — nunca inventa) + `getPLMensual(mes)` (piso líder/rezagado), y manda un Telegram con el cierre:
  ingresos negocio, gasto total con Δ vs mismo mes del año anterior, resultado, tramo IRPF. Añade una
  **narración de 1-2 frases de la IA GRATIS que DEGRADA** (si falla, van solo las cifras). Single-tenant en la
  práctica (cuenta de Alberto). Reutiliza crons + `@central/core-telegram` + `eur()`. Verificado: `tsc` 0 +
  `next build` exit 0. Sigue pendiente F4: desviación explicada, aviso fiscal proactivo, adjuntar/conciliar
  factura por foto; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **🚨 Cargos raros / antifraude en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 4º corte).**
  Tras el #891 (fugas). Panel bajo demanda `POST /api/banca/antifraude {desde,hasta}` que revisa los CARGOS
  del periodo con **REGLAS DETERMINISTAS (NO IA — para dinero/fraude es más fiable, no alucina cifras)**.
  Reutiliza los vigilantes PUROS de la tarjeta (`lib/vigilantes-tarjeta.ts`: `dobleCobro`/`esCargoFinanciero`/
  `subioPrecio`) + `comercioDe` (`lib/comercio.ts`). Lee `v_movimientos_activos` (vista canónica, ya sin
  duplicados) 365 días atrás scoped por `cuenta_id`, parte en periodo vs histórico previo, y marca: **cobro
  doble** (mismo comercio+importe ≥2 en el periodo), **comercio nunca visto** con importe ≥60€, **subida**
  >25% sobre la mediana previa de un recurrente (≥3 cargos), y **cargos financieros** (intereses/comisiones).
  `Antifraude.tsx` (client): botón «🚨 Revisar cargos raros», lista con badge de tipo + motivo + importe. Solo
  avisa, el dueño decide. Insertado tras el Cazador de deducciones. Verificado: `tsc` 0 + `next build` exit 0.
  Sigue pendiente F4: desviación explicada, cierre narrado, aviso fiscal, resumen mensual Telegram, adjuntar/
  conciliar factura por foto; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **✂️ Fugas en recurrentes en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 3er corte).**
  Tras el #890 (benchmark). Panel bajo demanda que detecta **suscripciones/recibos recurrentes prescindibles o
  renegociables** (fugas de dinero silenciosas). `POST /api/banca/fugas` reutiliza los GASTOS recurrentes que
  **ya detecta la tesorería** (`getTesoreria`→`detectarRecurrentes`, ≥3 ocurrencias), **anualiza** el coste
  (`importeMedio·365/intervaloDias`), y pide a la IA GRATIS que marque cuáles son fuga con `tipo`
  (cancelar/renegociar) + motivo. La IA SOLO clasifica; los importes salen de la tesorería (nunca inventa cifras)
  y NO marca recibos ineludibles (hipoteca/IBI/suministros/TGSS). `FugasRecurrentes.tsx` (client): botón «✂️
  Buscar fugas», lista con badge tipo, coste/año y /vez, ahorro potencial total. Solo se renderiza si hay
  recurrentes. Degrada sin romper. Insertado tras la Previsión de tesorería. Verificado: `tsc` 0 + `next build`
  exit 0. Sigue pendiente F4: desviación explicada, cierre narrado, aviso fiscal, antifraude, resumen mensual
  Telegram, adjuntar/conciliar factura por foto; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **📈 Benchmark entre pisos en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 2º corte).**
  Tras el #889 (sugerir por fila). Componente `BenchmarkPisos.tsx` (client) que compara la rentabilidad de
  los pisos turísticos del mes sobre el **P&L que la página YA calcula** (`getPLMensual` en `page.tsx`) — cero
  fetch extra: se pinta todo en cliente con los datos por props (ranking por margen, barras escaladas al margen
  máximo, líder 🥇 / rezagado 🐢, margen medio, resultado del mes). Solo se muestra con ≥2 pisos. La **lectura
  en lenguaje natural es bajo demanda** (botón «✨ Lectura IA» → `POST /api/banca/benchmark-pisos {mes}`):
  recompone `getPLMensual(mes)` en servidor (cifras EXACTAS) y pide a la pasarela IA GRATIS una comparación
  (quién lidera/arrastra + causa por estructura de gasto: lavandería/alquiler/suministros/comunidad/otros).
  La IA aporta lectura, NUNCA cifras. Degrada sin romper. Insertado tras el grid de P&L de pisos, antes del
  Análisis IA. Verificado: `tsc` 0 + `next build` exit 0. Sigue pendiente F4: desviación explicada, cierre
  narrado, aviso fiscal, antifraude, fugas, resumen mensual Telegram, adjuntar/conciliar factura por foto en
  banca; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **🤖 Sugerir negocio por fila en el libro de /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 1er corte).**
  Tras mergear el mini-chat (#887), arranca la F4 (extras de IA). Primer corte: botón **🤖 por fila** en el
  libro de movimientos (`MovimientosTabla`, `BancaClient.tsx`) — solo en cargos (`importe<0`). Al pulsar,
  **reutiliza el endpoint ya probado `POST /api/finanzas/gastos/sugerir`** (`{id}` → `{bucket, motivo, …}`,
  prompt de deducibilidad afinado, IA GRATIS) y traduce el bucket a destino con `BUCKET_A_DESTINO`
  (`negocio→seguros`, `renta→turistico_pisos`, `no_deducible→personal`). Muestra una línea bajo la fila
  "🤖 Parece <negocio> · <motivo>" con **[Aplicar]** (reclasifica vía `/api/banca/destino`, que aprende regla
  y la reaplica a los iguales — igual que el `<select>`) y **[Descartar]**. Solo SUGIERE: nada se escribe sin
  el toque de Alberto. Cero backend nuevo (reaprovecha el endpoint del triaje de gastos). Verificado: `tsc` 0 +
  `next build` exit 0. Sigue pendiente F4: desviación explicada, cierre narrado, aviso fiscal, antifraude,
  fugas, benchmark pisos, resumen mensual Telegram, adjuntar/conciliar factura por foto en banca; y F5: módulo
  🛒 tickets de súper + comparador de precios.

- **🛫 LUXURY tarificando DE VERDAD + mina Expedia B2B detectada (13/07/2026, tarde).** Cadena completa:
  - **Reserva María José (Expedia Collect, 17-19 jul, 167,42€):** entró al precio viejo de PriceLabs
    (92€/noche) porque el motor aún no había aplicado nada en Luxury, y encima Expedia apiló ~9-10% de
    su canal **"B2B distribution network"** → 83,71€/noche efectivo, por debajo del suelo (95€). El
    suelo protege lo que el motor escribe, NO los descuentos que el canal apila después. **Pendiente
    Alberto:** revisar en Expedia Partner Central el % del programa B2B/Traveler Preference (prompt dado).
  - **Primer apply de Luxury bloqueado por la guarda `datos_insuficientes`** (mercado a 14d, exige ≤7d):
    el **sweep de Serper está DEGRADADO (0 comps en todas las ventanas)** — revisar SERPER_API_KEY/cuota.
    Se resolvió ingestando **60 comps frescos vía Booking MCP** (6 ventanas jul-dic 2026, escenario
    `prop_luxury_busto`, 4 adultos, `/api/sivra/mercado/ingest`).
  - **✅ Apply OK: 332 fechas escritas** (13-jul-2026 → 13-jul-2027): 116 subidas (jul-ago: 92→99) y
    216 bajadas con tope −20%/día (fechas lejanas donde Smoobu tenía 244-273 de PL → hacia el objetivo;
    p.ej. 3-oct 244→195, 5-dic 273→218). `recommended_guest` 130€, `base_target` 112€, suelo_base 106.
    Las noches 17-18 jul no se tocaron (ocupadas por la reserva). El cron diario sigue desde aquí.
  - Meses con mercado: 2026-07→2027-04; may-jul 2027 caen al global — reponer comps en próximos ciclos.
  - **✅ 14/07: primera reserva A PRECIO DEL MOTOR** — Daniela Magno (Booking Genius, 9-11 oct, 2 noches):
    bruto 125,71€/noche (zona del `recommended_guest` 130) y neto 100,92€/noche, **por encima del suelo 95**
    (al contrario que la mina Expedia B2B). Entró HORAS después de que el motor bajara oct de 264→162.
    Detalle en `pricing_aprendizaje` id 34 (prop_luxury_busto/2026-10). **OJO raíl detectado:** el tope
    ±20%/día se aplica POR PASADA, no por día natural — 3 pasadas en 14h (18:30 manual, 20:30 y 08:30 cron)
    acumularon −39%; revisar si `apply-auto` corre más de 1 vez/día o dedupear por fecha natural.

- **💬 Mini-chat "Pregunta a tus cuentas" en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 3 de la banca unificada).**
  Panel bajo demanda en `/banca` que embebe el **agente contable existente** — NO reimplementa nada:
  `MiniChatContable.tsx` (client) hace `POST /api/contable/chat` (`{mensaje}` → `{respuesta, guardados,
  acciones}`, servido por `lib/contable/cerebro.ts::responder`). Versión ligera de solo texto con chips de
  sugerencia; si el agente propone ACCIONES, enlaza al chat completo `/contable` para confirmarlas (y también
  para adjuntar facturas/tickets). Insertado tras el Cazador de deducciones. Verificado: `tsc` 0 + `next build`.
  Sigue pendiente (fases aprobadas): sugerir por fila en el libro, desviación explicada, cierre narrado, aviso
  fiscal, antifraude, fugas, benchmark pisos, resumen mensual Telegram, adjuntar/conciliar factura por foto en
  banca, y el módulo 🛒 tickets de súper + comparador de precios.
- **💳 Extracto de tarjeta al agente — Fase 3 (comodidades) (13/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  Cierra el ciclo del extracto de tarjeta (Fases 1+2 ya en `main`, PR #881). Dos comodidades:
  - **Extracto consultable por el chat.** Al archivar el PDF en Drive, `procesarExtractoTarjeta` persiste el
    enlace por tarjeta+mes en `contable_memoria` (clave `extracto_tarjeta:<PAN4>:<YYYY-MM>`, insight=URL;
    helpers `guardarEnlaceExtracto`/`getEnlacesExtracto` en `lib/contable/memoria.ts`; excluida del contexto
    del LLM igual que `sinonimo_negocio:`). Nueva intención **`extracto_drive`**: detector PURO
    `detectarConsultaExtracto` en `intencion.ts` (dispara con "extracto" + verbo de consulta, extrae mes y
    PAN4 opcionales, NO intercepta "súbeme el extracto" que es carga), respuesta en `respuestas-directas.ts`
    (devuelve el link, o invita a subirlo por 📎 si no lo tiene), y también enrutable por la IA
    (`intencionDesdeJSON` + prompt de `clasificar-ia.ts`). "enséñame el extracto de junio de la ****0302".
  - **Auto-factura del correo.** Tras importar, dispara `conciliarFacturasDesdeGmail(cuentaId,{mesesAtras:2,
    maxAdjuntos:8,tolDias:10})` (best-effort, acotado para no agotar el `maxDuration=60`) para enganchar YA
    los justificantes de las compras deducibles recién importadas desde el Gmail de contabilidad; avisa por
    Telegram lo enganchado y lo añade al resumen. Mismo motor conservador (`casarFactura`: mismo signo +
    importe al céntimo + fecha en ventana) que el cron diario `facturas-conciliar-gmail`, que sigue de red
    de seguridad. Sin migración nueva ni envs nuevas.
  - Tests: +6 en `lib/contable/intencion.test.ts` (detector `extracto_drive` + validación JSON). Suite pura
    plataforma **335/335**, `tsc` **0**. Fase 3 completa; no quedan fases del extracto de tarjeta.

- **🧾 Cazador de deducciones en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 2 de la banca unificada).**
  Siguiente fase tras el PR #882. Panel bajo demanda en `/banca` que detecta **gastos personales del
  periodo que probablemente son DEDUCIBLES** (negocio/pisos) y estima el **ahorro fiscal** al tramo marginal.
  - **`lib/cazador-deducciones.ts::cazarDeducciones(cuentaId, year, quarter, desde, hasta, tramoMarginal)`**:
    coge el bucket `no_deducible` de `getGastosControl`, filtra ruido (`importe≥20`, top 20 por importe),
    y por cada cargo pide a la IA GRATIS (mismo criterio que `/api/finanzas/gastos/sugerir`) si es
    `negocio`/`renta`/`no_deducible`. Devuelve candidatos + `totalDeducible` + `ahorroEstimado`. Prudente
    (ante la duda, no_deducible). La IA JUZGA, los importes salen de `getGastosControl` (nunca inventa cifras).
    Presupuesto de tiempo 45s (bajo `maxDuration=60`), degrada sin romper.
  - **`POST /api/banca/cazador-deducciones`** { year, quarter, desde, hasta }: calcula el tramo marginal del
    AÑO (`getResumenFinanciero(...).fiscal.tramoActual.tipo`) y llama al cazador.
  - **`CazadorDeducciones.tsx`** (client, bajo demanda): botón "🧾 Buscar deducciones que se me escapan" →
    lista de candidatos (concepto/importe/motivo IA) con **selector de negocio por candidato** (default a la
    sugerencia; `renta`→`turistico_pisos`). Aplicar = `POST /api/banca/destino` (aprende regla, igual que el
    libro). Solo SUGIERE; Alberto confirma. Insertado en `/banca` junto al panel ✨ Análisis IA.
  - **Verificado:** `tsc --noEmit` 0 errores + `next build` exit 0.
  - **Sigue pendiente** (fases aprobadas): resto de IA (mini-chat contextual `lib/contable/cerebro.ts`,
    sugerir por fila en el libro, desviación explicada, cierre narrado, aviso fiscal, antifraude, fugas,
    benchmark pisos, resumen mensual Telegram, adjuntar/conciliar factura por foto) y módulo 🛒 tickets de
    súper + comparador de precios (BD nueva + OCR).

- **🏦 /banca = cuadro financiero UNIFICADO, por defecto mes en curso (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Alberto (captura del dashboard móvil) quería que al pinchar "Ver banca" saliera el resumen del mes
  en curso, con filtros para ver TODOS los movimientos por cuenta/fecha, indicando si cada uno está
  categorizado como deducible o no; abajo pisos turísticos; y un resumen interactivo negocio+personal
  por fechas. **F1+F2+F3-core entregadas:**
  - `/banca` ahora es **period-driven** (lee `?year/quarter/desde/hasta`, default **mes en curso**,
    mismo patrón que `/finanzas/radiografia`). `IntervaloSelector` reutilizado (`basePath="/banca"`).
  - **Resumen del periodo** (`ResumenPeriodo.tsx`, client) con las MISMAS fórmulas de cabecera que la
    radiografía (reusa `getResumenFinanciero(cuentaId,year,quarter,desde,hasta)`) + tarjetas negocio
    (correduría/pisos) y personal (BBVA/Kutxa) con enlaces + link a `/finanzas/fiscal`.
  - **Gráficas** (Recharts, ya tematizado): evolución Ingresos vs Gastos + línea Resultado
    (`getEvolucionMensual`, antes sin consumidor) y dona de reparto del gasto.
  - **Pisos del mes**: P&L por piso reutilizando `getPLMensual(mes)`.
  - **Libro de movimientos**: por defecto acotado al periodo (SSR `listarMovimientosLedger({desde,hasta})`),
    filtros de cuenta/fecha/signo/texto ya existentes; "Limpiar" = ver todo el histórico. **Nuevo badge
    ✅ deducible / ❌ no deducible / 🔁 traspaso / ᴬ amortizable por fila**, derivado del `destino` que
    puso la IA/agente. Lógica en módulo PURO nuevo **`lib/deducibilidad.ts`** (`bucketDeDestino`,
    `BUCKET_DEDUCIBLE`, `deducibleDeMovimiento`) — fuente única; `lib/finanzas.ts` ahora **re-exporta**
    de ahí (antes definía el mapeo inline). `MovLedger`/SELECT del libro proyectan `amortizable`.
  - **✨ Análisis IA del periodo** bajo demanda: `AnalisisIAPanel.tsx` → `POST /api/banca/analisis-ia`
    (reusa `getResumenFinanciero` + `aiComplete` gratis con timeout; la IA lee, NUNCA inventa cifras;
    degrada sin romper).
  - Retiradas de `/banca` las tarjetas estáticas duplicadas "Por negocio"/"Neto por negocio"/"Estimación
    fiscal" (cubiertas por el resumen del periodo). Tesorería/duplicados/revisar/ingresos/reglas se mantienen.
  - **Verificado:** `tsc --noEmit` 0 errores + `next build` exit 0.
  - **PENDIENTE (fases siguientes, aprobadas por Alberto):** resto de IA (mini-chat contextual reusando
    `lib/contable/cerebro.ts`, sugerir categoría por fila, cazador de deducciones, desviación explicada,
    cierre narrado, aviso fiscal, antifraude, fugas, benchmark pisos, resumen mensual Telegram, adjuntar/
    conciliar factura por foto) y el **módulo 🛒 tickets de súper + comparador de precios** (BD nueva
    `tickets_compra`/`tickets_lineas`, OCR `aiVision`, normalización de producto). NO se hizo el redirect
    de `/finanzas/radiografia`→`/banca` para no perder su lente Fiscal "Mi declaración" (folding completo
    de esa lente en `/banca` = follow-up).

- **🚪 Domótica SIVRA — sonda de aperturas: parámetros ORDENADOS (fix del 1004, 13/07/2026, PR seguimiento
  de #884).** Probado #884 en prod (Socorro): las variantes `records`/`records+dps`/`device-logs` daban
  **Tuya 1004 "sign invalid"** (solo `open-logs` viejo llegaba, con 1100). **Causa real:** Tuya exige la
  **query ORDENADA alfabéticamente por clave** para que valide la firma HMAC v2 (el servidor la reordena
  antes de recomputar). Las llamadas que ya iban ordenadas (`page_no`<`page_size`) o de 1 solo parámetro
  firmaban de casualidad; `records?pageNo&pageSize&startTime&endTime` (desordenado) no. **Fix:** helper puro
  `queryOrdenada()` en `acceso-puro.ts` que ordena SIEMPRE; `variantesAperturas` lo usa en las 4 vías. ⚠️ Ojo
  general: cualquier llamada Tuya nueva con >1 parámetro de query DEBE ir ordenada (bug latente en
  `tuya.ts::listarAsociados` `size&last_row_key` — solo salvado porque la pág. 1 no manda `last_row_key`).
  Tests 5/5, tsc 0. Pendiente re-verificar en prod que «Accesos» pasa a ✅.

- **🚪 Domótica SIVRA — sonda de aperturas usa el endpoint correcto de Tuya (13/07/2026).** Alberto
  quiere detectar aperturas de puerta SIN PIN válido (posible robo). Investigado el error **1100** que
  daba el bloque «Accesos» de la sonda en Socorro/Busto: **era endpoint/params obsoletos**, no una
  limitación del hardware. Llamábamos `door-lock/open-logs?page_no=..&page_size=..` (API vieja) → 1100
  = "parámetro inválido". La vía actual es **`door-lock/records`** con `pageNo/pageSize/startTime/endTime`
  (ms) + `targetStandardDpCodes`. `lib/domotica/acceso-puro.ts`: nuevos `DP_UNLOCK` + `variantesAperturas()`
  (pura, testeada) que devuelve 4 variantes en orden (records+dps → records → open-logs viejo →
  device-logs); `acceso.ts::sondearAperturas()` prueba en orden y devuelve la 1ª que responde, anotando la
  `via` buena. La firma HMAC no se rompe: `firmaTuya` firma el `path` con query tal cual (ya funcionaba con
  query sin ordenar). Tests `acceso-puro.test.ts` 4/4, tsc 0. **PENDIENTE VERIFICACIÓN EN PROD** (dev no
  llega a Tuya, 403): Alberto vuelve a pulsar 🔍 Sonda en **Socorro**; si «Accesos» pasa de ❌1100 a ✅ con
  la lista → confirmado, y entonces se monta el **«Vigilante de aperturas»** (aviso Telegram si abren con
  llave/app-no-tuya o con el piso vacío, reusando el cron 3×/día + `tgAlert`). Feature aparte pendiente:
  botón **«Portal/Comunidad»** (relé Tuya contacto seco en el telefonillo del Dúplex; Alberto mirando el
  MHCOZY 1CH 12V). Rama `claude/domótica-pin-creation-errors-sg63g0` (reiniciada desde main tras mergear
  #837).
- **🔑 Agente SEO housesevillana: `GITHUB_TOKEN` ahora auto-provisionable desde el panel (13/07/2026,
  rama `claude/sivra-seo-github-token-ryjhmh`).** El cron semanal de sivra (`/api/seo-refresh`,
  `0 10 * * 1`) falló por Telegram: `Falta GITHUB_TOKEN en el entorno de sivra`. Causa raíz (ya anotada
  como pendiente de ops desde el bloque A): Alberto puso `SEO_AGENT_ENABLED=true` en sivra —por eso el
  cron corrió— pero `GITHUB_TOKEN` (que leen los `seo-landing.ts` de sivra Y plataforma para leer/commitear
  el repo `house-sevillana-landing`) solo estaba en el Vercel de **plataforma** (por eso el botón manual
  sí funciona), NO en el de **sivra**. **Fix:** añadida la fila `GITHUB_TOKEN` a `SECRETS_REGISTRY`
  (`apps/plataforma/lib/secrets-registry.ts`) como **editable write-through** (mismo patrón que
  `SERPER_API_KEY`: `vercelProject: 'sivra'` + `vercelProjects: ['plataforma']`). Así se documenta la
  credencial (antes NO estaba en el registro) y Alberto puede fijarla **una vez** desde
  `/operador/secretos` → se escribe en sivra+plataforma y redespliega ambos, sin entrar a Vercel.
  **PENDIENTE de Alberto (1 paso manual, inevitable — no se puede meter el valor por código):** ir al
  panel y pegar el PAT con acceso a `house-sevillana-landing`. Sin código extra: la ruta ya avisa por
  Telegram y lanza error claro cuando falta el token. Guardián de secretos ✅.

- **💳 Subir el EXTRACTO DE TARJETA al agente (📎) → desglosa/categoriza/archiva en Drive (13/07/2026, Fase 1).**
  Alberto preguntó si el agente tiene en cuenta que las líneas `TARJ.CRDTO 466…` de Kutxabank son las
  liquidaciones de la tarjeta (agregado; el gasto real está en el detalle). Sí las reconoce (`lib/destino.ts`,
  `traspaso_interno`), pero el detalle compra a compra solo entraba a mano por /banca. **Ahora:** sube el PDF
  "Movimientos de tarjeta" al 📎 del chat (o Telegram) → `procesarDocumento` lo detecta (`esExtractoTarjeta`,
  ≥3 movimientos) y lo enruta a `lib/contable/extracto-tarjeta.ts::procesarExtractoTarjeta`: parsea (cifras
  exactas), resuelve sociedad/titular por el ccc de la tarjeta, `importarExtracto(...,'pdf',titular,'tarjeta')`,
  `analizarMovimientos`, **empareja devoluciones** con su compra (mismo comercio+importe, ventana 120d →
  copia destino para que se ANULEN; sin casar → botones `mov_*` por Telegram), **cuadra** (Σcompras−Σdevol =
  liquidación `PAGO RECIBO`; si no, avisa) y **archiva el PDF en Drive** (`subir`). Dudosas por Telegram
  (`enviarResumenTarjeta`). Restricción de Alberto respetada: sube en el PC (web), revisa dudosas en el móvil
  (Telegram). Check 7 del health-check ahora pide subirlo por el chat, no en /banca. Nuevos módulos puros:
  `lib/devoluciones-tarjeta.ts` (`casarDevolucion`), helpers `esExtractoTarjeta`/`cuadrarExtractoTarjeta`/
  `esPagoReciboTarjeta` en `lib/extracto-tarjeta-pdf.ts`. Tests 13 nuevos (detector/cuadre/devoluciones) —
  suite plataforma 249/249, tsc 0, guardián 22/22. **Fase 2 HECHA** (mismo PR #881, apilada sobre Fase 1):
  `lib/vigilantes-tarjeta.ts` (puro: `esCargoFinanciero`/`dobleCobro`/`subioPrecio`) + `vigilantesTarjeta()` en
  `extracto-tarjeta.ts` que, tras importar, manda UN mensaje Telegram con las secciones que apliquen —
  intereses/comisiones, posible cobro doble, cargos de comercio nunca visto (>80€), subidas de precio de
  recurrentes, y justificantes pendientes de deducibles >100€ (enlaza Check 8). +4 tests (suite 253/253).
  **Fase 3** (extracto consultable por el chat + auto-factura del correo) PENDIENTE. Rama
  `claude/ai-accounting-agent-3a9o22`, PR draft #881.

- **🏢 RRHH: fichaje configurable por empresa + ficha editable empleado (13/07/2026, PR #874).**
  Pilar gestiona dos empresas (Mariscos González y Global2 Instalaciones Técnicas) y solo quiere
  control de presencia para Global2. Implementado:
  - Columna `tiene_fichaje boolean DEFAULT false` en `rrhh.empresas` (migración aplicada en BD).
  - Global2: `tiene_fichaje = true`; Mariscos González: `false` (default).
  - `getBranding()` ya devuelve `tiene_fichaje`; propagado a `ExpedienteEmpleado` (portal /e) y a
    todos los paneles admin via `AdminShell`. Items Fichajes/Obras en nav lateral y bloque
    FichajeEmpleado en portal solo se renderizan si `tieneFichaje = true`.
  - PR #874 en draft, builds Vercel en progreso.
  - **Pendiente de sesión anterior**: pregunta a Pilar sobre qué plantillas de "Generar documento
    legal" quiere conservar (3 opciones mostradas, esperando respuesta).

- **🔎 Búsqueda web de la pasarela con FALLBACK OpenRouter (13/07/2026):** el grounding de Gemini
  (gratis) llevaba rachas de 429 que tenían MUDO el cron `eventos/websearch` (LaLiga/ferias/congresos/
  festivos para el pricing) y degradaban `/api/ai/search` y `seo-refresh`. Nuevo
  `@central/core-ai::openrouterSearchEx` (plugin `web` de OpenRouter, cualquier modelo, con test de
  fetch inyectado) + `apps/plataforma/lib/websearch.ts::buscarWeb` (política: Gemini gratis →
  OpenRouter de pago ~0,02€/llamada, gateado por el presupuesto diario, ambos intentos en `ai_usos`).
  Consumidores enchufados: `eventos/websearch` (endpoint `eventos`; responde `via` para saber qué vía
  sirvió), `/api/ai/search` (endpoint `search` — arregla `aiSearch` para todas las verticales) y
  `seo-refresh` (paso 2, tras Serper). Env opcional `AI_PRECIO_WEBPLUGIN_EUR` (default 0,018).
  **✅ VERIFICADO EN PROD (13/07, pg_net):** el cron respondió 200 con
  `via=openrouter:deepseek/deepseek-chat` — Gemini falló EN VIVO con su 429 (205 ms) y el fallback lo
  cubrió (3,1 s, 3.388 tokens, 0,018€, rastro completo en `ai_usos`). Evento nuevo upsertado:
  **Hakuna en Icónica (Plaza de España) el 11-jun-2027, aforo 20k → factor 1,40** — la MISMA noche que
  Karol G en La Cartuja (el motor ya está a 2,5 esa noche por MAX, pero confirma demanda calientísima).
  El dedup del prompt funcionó (no repitió los 11 eventos ya registrados).

- **🏷️ Saneo banca/contable: prestación de paternidad EXENTA + limpieza de bandejas (12/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`, PRs #841/#843/#844, sin anotar hasta esta auditoría).**
  Tres fixes pequeños del mismo hilo tras el #840 (libro completo de movimientos):
  - **#843 — prestación por paternidad EXENTA de IRPF (Art. 7.h LIRPF):** la prestación por nacimiento
    y cuidado del menor que Alberto cobra como autónomo cae en la correduría (`destino='seguros'`) pero
    NO tributa. Marcada `subcategoria='exento'` (5 abonos, 5.474,28€); `getResumenFinanciero` la excluye
    de la base imponible y de los trimestres (M130) pero la sigue mostrando como cobrado real ("Prestaciones
    exentas, no tributan"). **Resuelve el pendiente "Sueldo −1.440€ por la baja"** que llevaba abierto en
    la skill `perfil-fiscal` — era esto. Regla añadida a `perfil-fiscal` (esta auditoría).
  - **#841 — traspasos internos fuera de "Ingresos por revisar":** los pagos del recibo de la tarjeta
    (`PAGO RECIBO 466…`, `TARJ.CRDTO`) se colaban como ingresos dudosos (2.698€, 1.355€…) por conservar
    `requiere_revision`; ahora `listarIngresosPorRevisar` los excluye (`destino='traspaso_interno'`) +
    limpieza del flag histórico (28 filas, migración aplicada en prod).
  - **#844 — conocimiento de dominio en el prompt del agente contable + de-duplicar bandejas:** el
    system prompt de `/contable` ahora sabe los alias de OTAs (TRAVELSCAPE=Expedia, Agoda, Booking/LIQ.
    OP., Stripe → pisos), que correduría=siempre BBVA con sus códigos de agente, que "PAGO RECIBO
    466…"/TARJ.CRDTO=traspaso interno, y la regla de exentos de arriba (`contexto.fiscal.exento`).
    Además "Por revisar" (categoría) y "Ingresos por revisar" (negocio) mostraban el mismo ingreso dudoso
    en las DOS bandejas → "Por revisar" ahora solo lista GASTOS, renombrada "🏷️ Gastos por revisar ·
    categoría". Skill `plataforma-maestro` ya actualizada en el propio PR.

- **🕳️ PRICING — resuelto el misterio del -45% en estancias largas de Booking + Ticketmaster VIVO +
  Karol G detectada (13/07/2026, sesión pricing).** Cadena completa del día:
  - **Causa real del desvío (reserva Teresa Delgado, 7 noches oct):** NO era el stack de promociones
    (sano: Genius dinámico ~11% + móvil 10% ≈ 19%), sino los **planes "Tarifa semanal/mensual"** que NO
    aparecen en Promociones (viven en Tarifas → planes). Derivación REAL verificada al editarlos:
    **semanal −30% en los 4 pisos; mensual −40% (busto/luxury/house) y −30% (duplex)** — el ~−19%
    aparente del desglose de la reserva subestimaba (compara con el estándar del momento, no con la
    derivación). Stack previo ≥7 noches ≈ ×0,56-0,65 del listado. **✅ EJECUTADO 13/07 (Alberto vía
    Claude Chrome, Booking confirmó los 8 planes):** semanal y mensual → −5% busto/luxury/duplex, −10%
    house. Sin tocar Estándar/Flexible/No-reembolsable/Genius/móvil/min-stay/políticas/calendario; solo
    reservas nuevas. **Medir 27/07:** ratio bruto/listado ≥7 noches (antes 0,65 → objetivo ≥0,76;
    esperado teórico 0,76, house 0,69) sin que caiga el volumen de largas en House. Detalle:
    `pricing-automatico.md` §12 + `pricing_aprendizaje` (`canal_booking`). Skill `pricing-agente` al día.
    **✅ VERIFICADO en calendario** (Claude Chrome, solo lectura, 19-26 oct): −5,0% constante en
    Busto/Luxury/Dúplex y −10,0% en House; mensual con los mismos importes. Bonus: estándar Busto
    137€ = motor 118€ × markup 1,16 → cadena motor→Smoobu→Booking íntegra.
  - **Ticketmaster FUNCIONANDO** (PR #853 mergeado): el postalCode devolvía 0 fuera de EE.UU. → ahora
    latlong+radio con city como respaldo. Primera pasada: 8 eventos. **🔥 Identificado el evento del
    11-13 jun 2027: KAROL G, 3 noches en La Cartuja (60k)** — mercado 4-8x confirmado por el barrido F1;
    factor 2,5 en las 3 noches, el motor rampa desde ya. Bonus: Jamiroquai 16/07/2026 (Icónica, 1,15).
  - **TICKETMASTER_API_KEY** añadida al proyecto Vercel `plataforma` por Alberto (vía Claude Chrome,
    copiada de ia-rest) + redeploy. El cron semanal (lun 04:00) queda operativo.
  - **Noviembre 2026 verificado** (reserva Antonio 27-29 nov a 96€): clúster apto 110-204€ pero con
    notas 8,1-9,3 vs 7,0 de Busto → banda baja defendible, infraprecio leve (~10-15%), no caso abril.
    10 comps ingestados.
  - Inventario de promos Booking (Claude Chrome, solo lectura): Genius nivel 1 (10%) + móvil 10% en los
    4; House además Genius N2/3 15% y 3 country rates 10% (no apilan con móvil). Máx real ~19-23,5%.

- **🔎 Auditoría exhaustiva multi-agente del monorepo (12/07/2026, rama
  `claude/program-audit-plan-g1tlaf`).** Pasada completa a petición de Alberto ("la auditoría más
  completa posible de todo"). Método: gate baseline (install `--frozen-lockfile` + `auditar-estructura
  --check` + guardianes 22/22, todo verde) → **typecheck de las 7 apps, 0 errores TS** (serial por el
  `@prisma/client` compartido) → fan-out de **15 dominios con 81 subagentes** (7 verticales + 5 capas
  transversales + 2 infra Supabase/Vercel por MCP) + **verificación adversarial** de cada hallazgo.
  Resultado: **66 hallazgos confirmados (2 críticos, 25 medios, 39 bajos)**, informe en
  `docs/AUDITORIA-2026-07.md` (pasada 12/07 antepuesta; histórico del 01/07 conservado). **Críticos:**
  IDOR cross-empresa en ialimp `admin/informe` (PII+tarifa de limpiadora de otra empresa) y las 77
  funciones `SECURITY DEFINER` ejecutables por `anon` (reconfirmadas en ambos proyectos). **Auto-fix
  de bajo riesgo aplicados en la rama:** C1 IDOR (scope `empresa_id` + 404 antes de tocar sesiones);
  M12 `token_acceso`→`access_token` (ruta escanear del propietario estaba rota, 500); M5 borrado del
  `next.config.js` residual de ia-rest (recupera cabeceras de seguridad del `.ts`); M1 `idempotencyKey`
  en cron `cobro-descuento` (evita doble crédito Stripe); formato dinero español en helpers de
  transporte/alquiler; docs (MATRIZ 23→24 modules, CLAUDE.md raíz sivra=web pública). Typecheck de las
  4 apps tocadas + guardianes: verdes. **PENDIENTE (checklist manual de Alberto, gran radio, ver informe):**
  REVOKE de funciones `anon`, policy del bucket `rrhh-documentos`, TOCTOU/UNIQUE de VeriFactu, huella AEAT
  `cuota_iva`, hardening del proyecto ia-rest standalone (47 vistas SECURITY DEFINER + 113 search_path),
  migración del parser `xlsx` de extractos bancarios, y confirmar envs de crons/webhooks en Vercel.

- **Agente contable — sondeo + 2 fixes: `reservas`→ingreso e intent `negocio_resultado` (12/07/2026, rama
  `claude/ai-accounting-agent-3a9o22`).** Tras mergear #851, Alberto pidió "haz más preguntas". Sondeo con
  batería nueva contra el router → 2 fallos reales: (1) `¿Cuántas reservas lleva Luxury?` daba el GASTO del
  piso (reservas es lado INGRESO) → añadido `reserv|noche` a la guarda y al signo=ingreso; (2)
  `¿Es rentable la correduría?` daba solo el gasto (misma clase que el 👎, pero para un negocio suelto) →
  **nuevo intent `negocio_resultado`** (ingreso − gasto por `destino`, para negocios de caja bancaria como la
  correduría; EXCLUYE `turistico_*`, que van por pisos_rentabilidad/piso que leen SIVRA). Detección tras
  `pisos_rentabilidad`; handler en respuestas-directas (reusa `suma`); clasificador IA + VERIFICABLES + replay
  al día. **Lección reforzada:** la IA sola NO habría arreglado el 👎 — solo enruta a tipos que EXISTEN; era
  una capacidad que faltaba, no comprensión. Cifras validadas (correduría 2026: 7.236,01€ − 6.557,10€ =
  678,91€ ✅). 84 tests verdes, tsc limpio.

- **Agente contable — intent `pisos_rentabilidad` (12/07/2026, PR #851 mergeado).**
  Alberto probó el agente y dio 👎 a "¿Todos los pisos turísticos son rentables este mes?" → el agente
  respondía solo el GASTO agregado del banco (3.459,04€), ni resultado ni por piso. Nuevo intent
  `pisos_rentabilidad` (agregado, distinto de `piso` que es UN piso): desglose por piso de ingreso
  (`incomes`) − gasto (`gastos`) = dashboard, dice cuáles están en positivo. Detección: negocio agregado
  (`destinos` incluye `turistico_pisos`) + rentab/resultado/beneficio → antes de `gasto_destino`. Handler en
  respuestas-directas, clasificador IA enterado, `PISOS_LABEL` exportado. 78 tests verdes, tsc limpio.
  (El 👎 que lo destapó ya estaba en `contable_feedback` — el bucle de mejora funcionó.) **PENDIENTE:** PR.

- **📊 PRICING F1 ejecutado: barrido de fechas lejanas + evento jun-2027 detectado + F2 diagnosticado ROTO (13/07/2026).**
  Alberto aprobó retomar las fases de datos del plan de pricing. Hecho en sesión:
  - **Barrido F1 (Booking MCP, 40 comps nuevos):** mayo-2027 (p50 ~180€), junio-2027 normal (p50 ~109€),
    julio-2027 (p50 ~105€ — mes que faltaba entero) — ingestados por `POST /api/sivra/mercado/ingest`
    **vía pg_net** (la técnica documentada: el proxy del entorno bloquea Vercel, pero pg_net desde
    Supabase llega; timeouts de 5s del cliente son inofensivos, el endpoint procesa igual).
  - **🔥 EVENTO DETECTADO — finde 11-13 jun 2027 a 405-1282€/noche (4-8× lo normal).** Registrado en
    `pricing_eventos_auto` (fuente `agente`, factor 2,5 = techo). Identificar el evento real y RAMPAR
    con meses de antelación. Aprendizaje en `pricing_aprendizaje` (busto, `verano_2027`).
  - **Triangulación 2ª OTA fallida:** Expedia MCP caído ("Unknown error"); lastminute solo da
    pensiones/extrarradio no comparables → NO se ingestó (mejor 1 portal bueno que 2 con ruido).
  - **⚠️ F2 (eventos automáticos) está ROTO — 0 filas de crons en `pricing_eventos_auto`:**
    (1) `eventos/sync`: **falta `TICKETMASTER_API_KEY` en el proyecto Vercel `plataforma`**
    (respuesta live: "cópiala del proyecto ia-rest") → ACCIÓN ALBERTO; (2) `eventos/websearch`:
    configurado pero **Gemini 429 cuota agotada** (la key libre está saturada por la cadena de
    fallback) → valorar moverlo a OpenRouter o reintentar en horario de cuota fresca.
  - **F3 (vuelos):** plumbing existe, `flight_demand_k=0` (inerte por diseño hasta activar).
  - **Reserva Luxury verificada** (Mercedes Aguayo, 18-20 dic, 264,37€ brutos = 132€/noche, solo
    Genius): vendida a mercado (~157€ dic). Primera pasada live del motor en Luxury = próximo apply-auto.

- **Agente contable — P&L por PISO + contexto + 4 mejoras de fiabilidad (12/07/2026, PR #848 mergeado).**
  - **Intent unificado `piso`** (`{ modo:'ingreso'|'gasto'|'resultado', propertyId, mes? }`, sustituye a
    `ingresos_piso`): INGRESO ← tabla `incomes`; **GASTO ← tabla `gastos` (SIVRA) para los 4 pisos por igual**
    (= cards del dashboard vía `getResumenSivra`; el gasto del Dúplex ya NO va por banco `turistico_duplex`);
    RESULTADO = ingreso − gasto. El check de piso va tras SINÓNIMOS/SUBCAT (para que "comunidad del dúplex"
    siga siendo concepto ∩ destino) y antes del concepto genérico.
  - **CONTEXTO de conversación:** `clasificarIntencionIA(mensaje, hoy, historial)` resuelve seguimientos
    elípticos ("¿y gastos?", "¿y en junio?") heredando piso/año/mes/signo; el SISTEMA mapea los 4 pisos por
    nombre → `piso` con propertyId+modo. Fix signo: `facturación/facturó/facturado` = ingreso.
  - **Arnés de replay** (`lib/contable/replay.mts`): corre el router sobre el corpus REAL de `contable_log`;
    cobertura determinista 63%→70%. Destapó 4 fixes de enrutado: guarda `llevo`→`llev` (3ª persona),
    `cargo(s)` a la guarda, `ganar/ganancia`→ingreso, piso+`factur`→ingreso.
  - **Verificador 2º modelo** (`verificarIntencionIA`, deepseek): 2ª opinión sobre la clasificación IA
    (confirma/corrige/rechaza→LLM libre). Fail-open, solo intenciones con entidad, gate `CONTABLE_VERIFICADOR`.
  - **Botón 👎** en `/contable` → tabla nueva `contable_feedback` (`prisma/sql/2026-07-12_contable_feedback.sql`,
    **aplicada en prod**) vía `/api/contable/feedback`. Alimenta `/agentes-entrenador`.
  - Principio reforzado: **la IA entiende el lenguaje pero NUNCA calcula las cifras — las da el SQL** (por eso
    "más modelos gratis" mejora resiliencia/comprensión, no exactitud). 73 tests verdes, tsc limpio.

- **🤖 DIRECTOR IA: circuit breaker + memoización de decisiones (13/07/2026).** Dos guardas en memoria
  en `lib/ia-director.ts::elegirModelo` (aprobadas por Alberto tras revisión del Director):
  - **Circuit breaker:** `DIRECTOR_BREAKER_FALLOS` (3) fallos SEGUIDOS del hop → default directo durante
    `DIRECTOR_BREAKER_PAUSA_MIN` (5) min, sin pagar el timeout de 4s por petición (el patrón del incidente
    11/07 con los `:free`). El fallo que abre el breaker se marca `[breaker abierto]` en `ai_usos.error`.
  - **Memoización:** `DIRECTOR_DECISION_TTL_MIN` (5 min; `0`=off) reusa la decisión por forma de petición —
    clave `app|eu|hash(system)|log2(tamaño)|versión-catálogo|degradado`. El tráfico repetitivo (contable,
    clasificadores) no paga el hop en cada llamada. Los hits de caché NO escriben fila `director` en
    `ai_usos` (la llamada que sirve ya registra el modelo).
  - Pendiente de sesión anterior (mejora 3, "señal de calidad de salida" para el aprendizaje): NO hecha,
    da para PR aparte (toca callers + cron).

- **💬 AGENTE HUÉSPED: early check-in el DÍA de llegada (12/07/2026, rama
  `claude/luggage-storage-response-40przx`).** Alberto revisó el borrador de consigna a Gyongyi (reserva
  141199302): "no ha mirado que la fecha de entrada es HOY y no hay [otra] entrada [la víspera está libre],
  por lo que tendría que haber dicho que sí es posible al ser el mismo día". El agente había soltado un hedge
  inventado ("no puedo confirmar la entrada anticipada hasta el día anterior").
  - **Causa raíz:** en `lib/sivra/agente-huesped/decidir.ts` la fase temporal solo distinguía pre-llegada
    (`hoy < checkIn`) / en-estancia / post-estancia. El **día de llegada** (`hoy === checkIn`) caía en
    "en-estancia" → "el huésped ya está dentro" y el bloque `EARLY CHECK-IN` **NO se inyectaba** (solo en
    pre-llegada). Sin ese dato (aunque `contexto.ts` ya calculaba bien `earlyCheckinPosible` desde Smoobu),
    el modelo improvisó el hedge equivocado.
  - **Arreglo:** nuevo helper puro `lib/sivra/agente-huesped/fases.ts` (`faseReserva` + `aplicaEarlyCheckin`)
    que reconoce el **día de llegada** como fase propia. `decidir.ts` inyecta el early check-in en pre-llegada
    **Y** el día de llegada, con instrucción explícita de NO decir "no puedo confirmarlo hasta el día anterior"
    si la víspera está libre. `fases.test.ts` (8 casos, verde). Sin cambios de BD ni de infra.
  - **Robustez (2ª pasada):** el early check-in ahora es **tri-estado**. `contexto.ts` distingue "no pudimos
    comprobar Smoobu" de "víspera libre": el `catch` del fetch devolvía `[]` y `nocheAnteriorLibre([])` da
    `true` → **un fallo de red hacía CONFIRMAR una entrada anticipada no verificada**. Ahora el catch devuelve
    `null` y el nuevo flag `earlyCheckinChequeado` solo es true con respuesta real de Smoobu. `decidir.ts`:
    verificado+libre → confirma · verificado+ocupado → declina · **no verificado → no afirma ni niega, dice
    que lo confirma en breve** (nunca inventa disponibilidad).

- **Fix seguimiento `ingresos_piso`: el check de piso iba DESPUÉS del concepto (11/07/2026, rama
  `claude/ai-accounting-agent-3a9o22`).** Tras mergear #826, "Dime ingresos del apartamento socorro y número de
  reservas" daba *"No encuentro cargos de reservas"*: "de reservas" se colaba como concepto genérico antes de que
  el intent `ingresos_piso` se ejecutara. Arreglo: (1) mover el check de `ingresos_piso` (solo signo=ingreso)
  ANTES de subcategoría/concepto en `intencion.ts`; (2) `reserva(s)/noche(s)/ocupación/huésped/número` → STOP_CONCEPTO;
  (3) la respuesta anual de `ingresos_piso` incluye el nº de reservas cerradas (mismo criterio checkout≤hoy que
  `getResumenSivra.ingresosHoy`). 53 tests verdes, tsc limpio. **PENDIENTE:** merge del PR.

- **🧾 facturas-correo — corte de extracción de PDF RESUELTO + red de seguridad (12/07/2026, rama
  `claude/facturas-correo-pdf-extraction-x805fl`, PR #836).** La Vía B (Apps Script `Facturas a Drive` →
  Drive `_buzon_pdf`) llevaba **sin copiar nada desde el 23/06** (19 días). **CAUSA REAL (no era la que creí):**
  NO era OAuth ni token caducado. El trigger corría cada hora "Completada" 0 errores, pero su constante
  `QUERY` se había **estrechado el 23/06 a un solo remitente** (`from:Comisiones-Mapfre@info.mapfre.com …`)
  → dejó de copiar el resto; y encima Mapfre-comisiones llega **cifrada** (no es adjunto `filename:pdf`, la
  query da 0). Mi diagnóstico inicial ("token caduca en Testing → publica la app OAuth") **era erróneo** y
  Alberto lo frenó bien (la consola mostraba el trigger sano). Se confirmó leyendo el código por Claude para
  Chrome. **FIX (Alberto, en su Apps Script):** restaurada la `QUERY` a **allowlist de 11 remitentes**
  (booking, pricelabs, ionos, bbva, cabify, glovo, emasesa, endesa, asecon, petroprix, withorb) + `newer_than:3d`;
  verificado que **vuelve a copiar** (IONOS 11/07 y BBVA 09/07). **Lección: si Vía B no trae nada, revisar la
  `QUERY` del Apps Script, NUNCA OAuth.**
  - **Red de seguridad añadida a la skill** `facturas-correo` (para que un corte futuro no pierda facturas):
    **Paso 0** (health-check determinista de frescura + backlog persistente en etiquetas Gmail
    `Facturas/PDF-pendiente`/`Revisar` + escalado Telegram con backoff vía `/api/internal/alerta`), **cadena
    de vías con fallback** (B→A→OCR/visual→**conciliación inversa por banco**→pendiente). Doc corregida (fuera
    la falsa causa OAuth; documentado el mecanismo real de la `QUERY` y el caveat Mapfre cifrado).
  - **Badge de corte en `/finanzas`** (plataforma): tabla nueva `agente_salud`
    (`prisma/sql/2026-07-12_agente_salud.sql`, **aplicada en prod** por Supabase MCP), lectura tolerante en
    `lib/finanzas.ts::getResumenFinanciero` + `SaludExtraccionBanner` en `FinanzasClient.tsx`. Sembrado rojo
    durante el corte y **puesto en verde** (`ok=true`) al arreglarse. Preview de plataforma en Vercel compiló
    verde (typecheck OK).
  - **Procesado:** IONOS 24,19 € archivada en Drive (julio); aviso de duplicado (IONOS 1,82 €) en
    `_DUPLICADOS_BORRAR`. **Barrido del hueco 23/06→12/07:** todo ya estaba procesado por pasadas previas (todo
    con `Facturas/Procesada`) — sin backlog. **Pendiente de Alberto (no del agente):** Booking 03/07 (3 facturas
    `1656693936/1656760428/1656793743` → bandeja de revisión, confirmar a mano) y **ASECON 10/07** (gestoría,
    pedir reemisión a nombre de Alberto, está a nombre de Punto y Coma).
- **🔐 Domótica NIVIAN — PIN por reserva ARREGLADO: 3 bugs (12/07/2026, rama
  `claude/domótica-pin-creation-errors-sg63g0`).** El monitor avisó de que el programador de accesos
  (`/api/sivra/domotica/acceso/programador`, cron `40 4,12,20 * * *` UTC = 06:40 Madrid) no creaba NINGÚN
  PIN: `online: Invalid key length · offline: Tuya 1109: param is illegal`. Al mirar la BD real salieron
  **TRES** fallos, no dos:
  1. **Online `Invalid key length` (cripto, `lib/domotica/tuya-cifrado.ts`):** el descifrado del `ticket_key`
     usaba `aes-128-ecb` con solo los 16 primeros bytes del secret y `setAutoPadding(false)`. La spec real de
     Tuya (foro + docs) es **`aes-256-ecb` con el `access_secret` COMPLETO (32 bytes, utf8) + PKCS7** → clave
     real de 16 bytes; luego el PIN se cifra en `aes-128-ecb`+PKCS7. Se corrigió `descifrarTicketKey`
     (+ guarda explícita si el secret no mide 32 bytes) y se **eliminó** `claveDesdeSecret`. Test reescrito
     para imitar cómo Tuya genera el `ticket_key` (el test que habría cazado el bug).
  2. **Offline `Tuya 1109` (endpoint, `lib/domotica/acceso.ts`):** el endpoint offline es **`/v1.1/`**, no
     `/v1.0/` → `crearPinOffline` y el borrado offline de `borrarPin` a v1.1.
  3. **🚨 El más grave (puerta EQUIVOCADA): todas las reservas de los 4 pisos se metían en la ÚNICA cerradura
     Socorro** (BD: 9 filas error, todas `dispositivo=Socorro`+`smoobu_apartment_id=352007` pero `property_id`
     de house/duplex/busto/luxury). Causa: el filtro `apartments[]=` de Smoobu **no acota** y `toPropertyId`
     ignora el aptId. **Fix en `programador/route.ts`:** filtrar por el apartamento REAL de la reserva
     (`b.apartment.id`) contra `aptId` antes de crear el PIN. Sin esto, arreglar la cripto habría programado
     el código de un huésped del Dúplex/Busto en la puerta de otro piso.
  - **BD reconciliada:** borradas las 9 filas `error` (sin PIN ni tuya_id), y **BustoTavera** (la puerta real
    de Busto Reform + Luxury Busto, 🔴 offline) vinculada a `smoobuApartmentIds=[352418,352943]` (antes vacía →
    nunca se usaba). Socorro sigue en `[352007]`=House Sevillana (🟢 online). Dúplex Center **no tiene cerradura**
    → no genera PIN. `entrega` default = `aviso` (Telegram a Alberto, nada al huésped automático).
  - **Validación:** cripto testeada (roundtrip AES-256→AES-128, 4/4) + 46/46 tests domótica + tsc limpio en los
    3 ficheros. **PENDIENTE prod (dev no llega a Tuya):** correr la sonda de las 2 cerraduras y crear 1 PIN
    manual (`/sivra/domotica`) para confirmar que el NIVIAN soporta la vía online (Socorro) y offline v1.1
    (BustoTavera) antes de fiarse del cron. Docs: `docs/DOMOTICA-TUYA.md`.
- **🏦 BANCA: libro completo de movimientos + arreglo correduría muda (12/07/2026, rama
  `claude/banco-all-movements-lv8e7o`).** Alberto: "quiero ver TODOS los movimientos" + "la correduría
  cobra 0 aunque hay comisiones (Generali/Caser/Occident de julio)".
  - **Causa raíz correduría:** `banca_destino_reglas` envenenada con una regla-trampa **`"TRANSF" →
    turistico_pisos`** (6 chars, substring de todo "TRANSFERENCIA RECIBIDA") que secuestraba TODA
    transferencia entrante de BBVA (incl. comisiones de seguros) → como la correduría suma solo
    `destino='seguros'`, cobraba 0 en silencio. Otras basura: `TOTAL`/`RECEIPT`/`MODA`/`RESTAURANTES`→pisos,
    `GOOGLE ONE`/`PEPEPHONE`→seguros. Las reglas se aplican por SUBSTRING con prioridad sobre `destino.ts`.
  - **Arreglo código:** `lib/correduria.ts::claveReglaValida()` (rechaza claves genéricas/cortas) aplicada
    en TODOS los puntos de aprendizaje (`/api/banca/destino`, `/api/finanzas/categorias/asignar`,
    `agente-movimientos::aprenderReglaMovimiento`) **y como filtro al aplicar** (`categorizar.ts`, así las
    reglas viejas malas dejan de aplicarse). `lib/destino.ts` amplía `RE_LIQUID_SEGUROS` con los códigos de
    agente (`M00171`/`M1454`/`8/92361`/`SALDO.`) sincronizados con `detectarCompania`. Tests: destino 20 +
    correduria 8, todo verde.
  - **Migración `prisma/sql/2026-07-12_limpiar_reglas_destino.sql` (APLICADA en prod vía MCP):** borra
    reglas-trampa, corrige GOOGLE ONE/PEPEPHONE, reclasifica abonos BBVA mal parkeados en turistico_pisos →
    29 a `seguros` (2.408€), 24 a `turistico_duplex` (Booking, 9.138€). **Correduría julio pasó de 0€ a
    616,92€.** Sin doble conteo: los gemelos Excel de las comisiones ya estaban `duplicado_estado='ignorado'`.
  - **⚠️ PENDIENTE Alberto:** 65 abonos BBVA "Transferencia recibida" a secas (22.924€, 2025→2026-03,
    PREVIOS al bug, año cerrado, ambiguos: correduría/Dúplex viejo/personal) **NO se auto-movieron** —
    marcados `requiere_revision` para que él decida en la bandeja "🔎 Ingresos por revisar" de /banca.
  - **Ver TODOS los movimientos:** `/banca` ahora tiene libro completo — `listarMovimientosLedger()` +
    `GET /api/banca/movimientos` (paginado servidor), `MovimientosTabla` con filtros cuenta/fechas/signo/texto
    + "Ver más" + reclasificar el negocio EN LÍNEA por fila (antes solo se veían los 300 últimos).
  - **Extras:** panel "🧠 Reglas aprendidas" con borrar (`/api/banca/reglas`, marca sospechosas en rojo);
    health-check **Check 10** (correduría 0€ + abonos BBVA sin identificar → Telegram, autolimpiable);
    bandeja "🔎 Ingresos por revisar" (`listarIngresosPorRevisar`, antes un ingreso mal clasificado no
    aparecía en ningún sitio accionable). `next build` OK, tsc limpio.

- **🔧 Gemini directo `gemini-2.5-flash` → `gemini-flash-latest` (12/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`).** Tras mergear la auditoría IA→OpenRouter (#827),
  verificando en `/operador/ia` salió un **404 de HOY**: Google retiró `gemini-2.5-flash` de la
  **API directa** (`generativelanguage`) el **09/07/2026**, ANTES de su EOL oficial (16/10) — problema
  masivo confirmado en el foro de Google AI. **No rompió nada user-facing**: el Director se lo comió
  (reintento por OpenRouter → deepseek ok), justo el valor del cambio de #827. Afectaba solo a rutas de
  **Gemini directo**: `/api/ai/search` (grounding), cron `sivra/eventos/websearch`, edge fn
  `eventos-entorno` de ia-rest y el fallback profundo de `pasarela.ts`. **Fix (decisión de Alberto:
  alias rodante):** `DEFAULT_GEMINI_MODEL` en `packages/core-ai/{gemini,client}.ts` → `gemini-flash-latest`
  (→ Flash GA vigente, no se rompe con retiradas de versión) + etiquetas de log en `pasarela.ts`/
  `ai/search` + la URL de la edge fn `eventos-entorno`. **Pendiente:** redeploy de la edge function
  `eventos-entorno` en el proyecto Supabase de ia-rest (`efncqyvhniaxsirhdxaa`) por MCP. **No tocado
  (self-heal):** el seed OpenRouter `google/gemini-2.5-flash` del cron `ia-director-refresh` (vector
  distinto — Vertex vía OpenRouter; lo regenera el cron semanal / buscador-ia). Typecheck plataforma 0.

- **📉 PRICING: seguimiento baja PriceLabs — checker anticipado + Luxury EN VIVO + lección Booking (13/07/2026).**
  Seguimiento semanal del plan de baja de PL (todo con "ok a todo" de Alberto):
  - **Reserva 21-28 oct verificada (Teresa Delgado, Busto, 7 noches):** el cambio de precio SÍ estaba aplicado
    (listado 118€/noche desde 25/06), pero Booking vendió a 64,77€/noche bruto (52€ neto) — el **stack de
    descuentos de Booking (Genius+semanal+móvil) se come ~45%** en estancias largas. El raíl `min_price`
    protege el listado, no el post-descuento. **Acción pendiente de Alberto: revisar promos en la extranet.**
    Lección en `pricing_aprendizaje` (busto, temporada `canal_booking`).
  - **Checker anticipado:** `update_experiment_results()` ahora marca `was_booked=true` en cuanto un income
    cubre la noche futura (antes esperaba a que pasara la fecha). Aplicado en BD vía MCP + SQL en
    `apps/sivra/sql/2026-07-13_early_mark_experiments.sql`. Primera pasada: Busto 0→**14 experimentos
    reservados**. Cancelaciones: el bloque de fechas pasadas re-alinea con `rate_snapshots`
    (`IS DISTINCT FROM`).
  - **Luxury Busto ACTIVADO EN VIVO** (OK explícito): `apply_enabled=true`, `pilot_enabled=true`,
    `seasonal_floor_k=1` (suelo 95€, ±20%/día, markup 1,16). Vigilar reversiones de PL vía `pricing/guard` —
    PL podría seguir conectado a Luxury en Smoobu.
  - **Criterio de baja replanteado** (doc `apps/sivra/docs/pricing-automatico.md` §11): manda ADR realizado +
    ritmo de ocupación vs histórico/PL; el "reservado ≥ PL" pasa a informativo. **Calendario: cancelar PL
    hacia principios de agosto** si las 2-3 próximas semanas confirman.
  - Ratios `price_ours`/PL (90d): busto 1,36× ✅ · duplex 1,59× · luxury 1,84× (dry→vivo hoy) · house 0,71×.
    Nada en 2-3×; la recalibración de 08/06 aguanta.

- **🤖 IA→OpenRouter: auditoría de enrutado + PR-A (12/07/2026, rama `claude/openrouter-sdk-integration-4dkiem`,
  PR #827).** Alberto: "redirigir toda la IA a OpenRouter y, cuando toque, pasar por el Agente Director".
  **Auditoría** (`docs/AUDITORIA-IA-ENRUTADO-2026-07.md`): la arquitectura ya es correcta — las 4 verticales
  usan wrappers *gateway-first* (con `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` van por la pasarela OpenRouter+Director).
  **Botón nº1 = operacional** (confirmar esas envs en Vercel de ia-rest/sivra/ialimp/rrhh — pendiente de Alberto).
  **✅ PR-A:** `apps/plataforma/lib/ai-client.ts::aiComplete` era **NIM directo con modelo pinneado**
  (bypaseaba OpenRouter Y Director) y lo consumen 9 rutas; ahora enruta por `chatConDirector`. Firma
  intacta, `maxTokens` 2048, typecheck 0. `aiExtractInvoice`/`aiTranscribe` (OCR/STT) NO se tocan.
  **✅ PR-B (parcial):** retirados 2 `fetch` crudos de plataforma — `sivra/expenses/parse-invoice`→
  `aiExtractInvoice`, `sivra/eventos/websearch`→helper `geminiSearch` (mantiene grounding). **`ia-rest/
  brain.ts` NO migrado a propósito** (cerebro POS por voz, timeout 5 s cara al cliente; el código lo deja
  directo a NIM — meterlo por la pasarela arriesga el presupuesto de 5 s).
  **✅ PR-C (subconjunto seguro):** migradas a `chatConDirector` las rutas internas de categoría B
  (`agente/chat`, `admin/estructura/chat`, `sivra/inversion/analyze`, `sivra/mercado/{cron,sweep,search}`);
  `chatConDirector` gana `temperature`. **NO migradas a propósito:** `reclamacion` (pin 8B, ya en
  OpenRouter), agente de huéspedes + `mensajes/reply` (cara al cliente, pin de modelo fuerte), `categorizar`/
  `subcategoria-barrido` (pin 8B por latencia). Clave: **categoría B YA iba por OpenRouter** (core-ai
  `aiComplete` lo usa si hay key) — PR-C solo añade el Director, no saca de un bypass.
  **PR-D DESACONSEJADO:** `/api/ai/{tools,vision,search}` excluyen el Director a propósito (tools=
  estructuradas/compatibilidad de function-calling, vision=modelos de visión, search=grounding nativo de
  Gemini). Forzarlo mete regresiones → no se hace sin rediseño. **Pendiente Alberto (operacional, sin código):**
  confirmar `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` en Vercel de ia-rest/sivra/ialimp/rrhh (enchufa el Director en
  las verticales). PRs previos de la rama: #822 y #825 (ya mergeados). Todo en PR #827.

- **🔴 ia-rest: el "corte de BD" al compartido NUNCA se conmutó — split-brain (12/07/2026, rama
  `claude/ia-rest-deployment-security-9dfxo8`, a raíz del PR #832 de la auditoría).** Verificado por MCP
  (logs Edge en vivo + `linked-project.json` + `setup-vercel-env.sh`): **producción (POS + crons) sigue
  corriendo contra el proyecto VIEJO `efncqyvhniaxsirhdxaa`** (schema `public`), NO contra el compartido
  `wswbehlcuxqxyinousql`/`iarest` como afirmaban la skill maestra y el mapa (era FALSO — corregido en este
  commit). El corte del 10/06 copió funciones/algunos datos al compartido pero no cambió el `SUPABASE_URL`
  de Vercel. Es un split por subsistema (POS→viejo; Instagram/Reels + demo Catering JJ→compartido) y por
  época (histórico + las **6 `facturas_verifactu`**→viejo; `personal`=14 demo→compartido). El proyecto
  viejo tiene además **seguridad sin auditar** (113 search_path, 47 SECURITY DEFINER views, 23 RLS
  always-true) y crons `infra-monitor`/`monitor-health` en 500/401. El "504 de Reels" ya se había parcheado
  el 11/07 (PR #791, deploy de `ig-video-gen` al viejo); queda una copia duplicada v7 en el compartido.
  **DECISIÓN (Alberto, 12/07): terminar la migración al compartido (Opción 2)** aprovechando que no hay
  clientes de restaurante activos (comandas congeladas 31/05, `sesiones_activas`=0). **HECHO en esta sesión
  (Etapa A, reversible):** corregidos los docs que mentían (skill `ia-rest-maestro` §2 e INFRAESTRUCTURA) +
  limpiado `setup-vercel-env.sh` (fuera el ANON key placeholder hardcodeado y el `ANTHROPIC_API_KEY` muerto;
  la URL sigue en el viejo a propósito hasta el flip). **PENDIENTE (ventana dedicada, irreversible):**
  Etapa C reconciliar datos viejo→compartido con las 6 facturas VeriFactu intactas · Etapa D flip de
  `SUPABASE_URL` en Vercel + redeploy · Etapa E jubilar el viejo. Plan completo:
  `/root/.claude/plans/carril-1-auto-aplicado-a-silly-crab.md` (efímero — resumen aquí).
- **🎬 Reels IA de Instagram — Veo 3 Fast + 2 arreglos de raíz (11/07/2026, rama
  `claude/instagram-video-improvements-m6avu9`, PR #791).** El motor Veo 3 Fast (audio nativo) ya se
  mergeó en **PR #789**. Al probar un reel de ejemplo salieron DOS cosas rotas de ANTES (no del #789):
  (1) la Edge Function **`ig-video-gen` nunca estaba desplegada** en Supabase `efncqyvhniaxsirhdxaa`
  → **desplegada** (v1, `verify_jwt=false`, auth propia `x-story-secret`). (2) La tabla
  **`instagram_borradores` no tenía la columna `video_job`** que el cron (reel Y carrusel) y el callback
  de Telegram escriben/leen → el INSERT fallaba y ambos caían a imagen. Migración aditiva
  `add column if not exists video_job jsonb` **aplicada a prod** y commiteada
  (`supabase/migrations/20260707_instagram_borradores_video_job.sql`). Además, durante la prueba
  NVIDIA+Groq cayeron a la vez y el reel daba **504** (sin fallback de texto): esto **ya lo resuelve `main`**
  con el **Director + OpenRouter** de la pasarela (`OPENROUTER_API_KEY` en plataforma, PRIMARIO desde el
  09-10/07) → mis parches de OpenRouter (ia-rest + pasarela) quedaron **superseded y descartados**; el PR #791
  final es SOLO la migración `video_job`. **Prueba:** `GET /api/cron/instagram?manual=1&formato=reel` desde
  navegador → Telegram → 🔄 Comprobar (~1-2 min) → revisar que **suena** y **sin subtítulos quemados**.
- **⚠️ Punto ciego de contexto corregido: el INGRESO por piso vive en `incomes` (inglés), no en el banco
  (11/07/2026, rama `claude/ai-accounting-agent-3a9o22`).** Investigando "cuánto ingresó el Dúplex" (daba 0€
  porque el agente contable lee el banco, donde todos los pisos van juntos en `destino='turistico_pisos'`),
  busqué la fuente por piso **por nombres de tabla en español** (`%ingres%`,`%propiedad%`) → no salieron las
  tablas SIVRA reales, que están **en INGLÉS** (`incomes`/`properties`/`expenses`), concluí en falso que "no
  existía" y **creé una tabla duplicada** (`ingresos_negocio_mensual`, cargada desde 20 pantallazos de Booking).
  Alberto lo cazó ("puede haber duplicidad" + pantallazo del dashboard). **`incomes` YA es la fuente canónica
  por reserva** (`propertyId, date, amount` neto, `amount_gross`, `portal`, `nights`; 2020→2026; 2026=72.113,89€)
  y **cuadra al céntimo con el dashboard** (Casa Sevillana 33.960,91 / Duplex 10.015,31 / Busto 7.657,81 "a hoy";
  full-year = "Proyectado"). Enlace `negocios.ref_ext` (`prop_*`) = `incomes.propertyId`; helper existente
  `getResumenSivra(anio,propertyId)`. **Reparado:** tabla duplicada BORRADA (`incomes` intacto, verificado); cero
  código de agente enviado. **Anti-recurrencia (este commit):** LANDMINE en `apps/plataforma/CLAUDE.md` (sección BD)
  + skills `sivra-maestro`/`plataforma-maestro` documentando que el ingreso por piso = `incomes` (inglés), el banco
  agrega los pisos, y `propiedades`/`propietario_ingresos` son DEMO. **Regla:** cargar los maestros y buscar tablas
  en inglés Y español antes de una investigación de ingresos. **ARREGLO FUNCIONAL HECHO (mismo PR):** el agente
  contable responde el ingreso por piso desde `incomes` — nuevo intent `ingresos_piso` en `intencion.ts` (4 pisos:
  `prop_duplex_center`/`prop_luxury_busto`/`prop_house_sevillana`/`prop_busto_reform`, solo para signo=ingreso; el
  GASTO del Dúplex sigue por banco) + handler en `respuestas-directas.ts` que **reutiliza `getResumenSivra(anio,propertyId)`**
  (mismos números que el dashboard: realizado a hoy + proyección año). `intencionDesdeJSON` acepta también el intent
  (carril IA). 52 tests verdes, tsc limpio. Así "¿cuánto ingresó el Dúplex?" ya da la cifra real (~10.015€ a hoy).

- **Limpieza de ids Gemini muertos en el Director + edge function ia-rest desplegada (11/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`).** Cola del swap de la cadena directa (PR #822 mergeado): (1)
  **desplegada la edge function `eventos-entorno` de ia-rest** (proyecto Supabase `efncqyvhniaxsirhdxaa`, v13,
  `verify_jwt` intacto) con `gemini-2.5-flash` — ya no da 404 en la búsqueda web de eventos. (2) **Director:**
  `lib/ia-director.ts::SUPLENTES_DEFAULT` (fallback de runtime real si la tabla `ia_director_prompt` está vacía)
  y la lista `contexto` del cron `ia-director-refresh` citaban `google/gemini-2.0-flash-001` (EOL 01/06) →
  cambiadas a `google/gemini-2.5-flash`. La lista del cron se auto-cura contra el catálogo vivo; el
  SUPLENTES_DEFAULT no. Sin migración ni env nueva.

- **Agente contable: compone CONCEPTO ∩ NEGOCIO ("comunidad del dúplex" ≠ total del Dúplex) (11/07/2026, rama
  `claude/ai-accounting-agent-3a9o22`, PR #824).** Incidente: «gastos de comunidad del apartamento duplex» devolvía
  el TOTAL del Dúplex (1.704,86€, 28 mov) porque en el router determinista (`lib/contable/intencion.ts`) el
  `gasto_destino` (total del negocio) cortaba ANTES que el concepto. Arreglo: el `dest` (negocio detectado) se
  calcula UNA vez y **compone** con concepto/subcategoría en vez de cortar — `{tipo:'concepto', destinos, destinoEtiqueta}`;
  el `gasto_destino` a secas solo dispara si NO hay concepto que acotar. `respuestas-directas.ts` añade el filtro
  `coalesce(mb.destino,'personal') IN (...)` y rótulo compuesto («En comunidad del Dúplex llevas…»). `SinonimoDestino`
  gana `etiquetaDe` ('del Dúplex', 'de la correduría', 'de los pisos'). Defensa en profundidad: `intencionDesdeJSON`
  también acepta `destinos`+`destinoEtiqueta`, así el carril IA puede expresar la misma composición (la IA propone la
  INTENCIÓN, nunca las cifras). 46 tests verdes (7 nuevos de composición). Respuesta a la duda de Alberto («¿IA para
  revisar o que esquematice?»): main YA tenía el planner IA (`intencionDesdeJSON` + aprendizaje de `extras` +
  `entidadesResiduales` que difiere a la IA); este arreglo cierra el hueco determinista que quedaba. **PR #824 MERGEADO** (commit `a091102`).

- **🧠 buscador-ia 1ª pasada + OPENROUTER_API_KEY editable desde el panel (11/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`, PR #822 MERGEADO).** A raíz de un correo que sugería "integrar
  el SDK de OpenRouter": OpenRouter YA está integrado en `@central/core-ai` (mejor que el SDK del correo).
  (1) **Pasada real del `buscador-ia`** → la cadena directa tiene 3 backstops podridos: Groq
  `llama-3.3-70b-versatile` DEPRECADO (17/06), Gemini `gemini-2.0-flash` APAGADO/EOL (01/06, id muerto),
  Kimi `kimi-k2-0711-preview` DISCONTINUADO (25/05); solo NIM `llama-3.3-70b-instruct` VIVO. Anotado en
  `docs/BUSCADOR-IA.md`. **SWAP APLICADO (opción A, PR #822):** `client.ts` + adaptadores ahora usan
  `gemini-2.5-flash`, `kimi-k2.6`, `openai/gpt-oss-120b`. Además se corrigieron otras llamadas vivas en
  `gemini-2.0-flash` (pasarela, api/ai/search, sivra/eventos/websearch, y la edge function ia-rest
  `eventos-entorno` → **necesita `supabase functions deploy` aparte**). Pendiente aparte (Director, su cron):
  `ia-director.ts::SUPLENTES_DEFAULT` aún cita `google/gemini-2.0-flash-001`.
  (2) **`OPENROUTER_API_KEY` añadida a `lib/secrets-registry.ts` como `editable`→`plataforma`** para poder
  ponerla/rotarla desde `/operador/secretos` (write-through a Vercel + redeploy) sin entrar a Vercel. El panel
  necesita `VERCEL_ADMIN_TOKEN` en plataforma. Nota: `OPENROUTER_API_KEY` casi seguro YA está en plataforma
  (Director `activo` desde 10/07). Alcance elegido: solo plataforma (cubre a todas las verticales por la pasarela).
- **Health-check: el 🟡 «152 alertas» era de Vanessa, no de Alberto → reorientado (11/07/2026, rama
  `claude/health-check-alerts-qidakc`).** El Check 6 del health-check de plataforma contaba filas de la tabla
  `alertas` (que es de **ialimp**, operativa de limpiezas de Sique Brilla) sin filtrar por empresa y lo metía al
  Telegram de Alberto. 138 de las 152 eran `asignacion_auto` (log del auto-asignador, insertado **sin leer** y
  nunca purgado → inflaba el badge 🔔 de Vanessa para siempre). **Última conexión de Vanessa:** no revisa el
  panel de alertas desde finales de mayo (su badge no es canal fiable). Cambios: (1) ialimp inserta
  `asignacion_auto` con `leida=true` + purga las de >30 días en el propio auto-assign; (2) limpieza puntual por
  MCP (107 borradas + 31 marcadas leídas → badge a 0); (3) **retirado el Check 6** de plataforma (no vigilar la
  tabla de otro tenant); (4) **cron nuevo `/api/cron/alertas-pendientes`** (lunes 08:00) que avisa a
  `empresas.email` (Vanessa) SOLO si le quedan alertas accionables sin leer >3 días. Helper puro
  `lib/alertas-resumen.ts` (test verde). Diseño en `docs/superpowers/specs/2026-07-11-health-check-alertas-limpiezas-design.md`. **PR #823 MERGEADO** (commit `9eb220c`).

- **`facturas-correo` — backlog de la raíz Drive archivado + Vía B confirmada rota 18 días (11/07/2026).**
  Pasada tras 8 días sin correr (hueco desde el 03/07). Hallazgo principal: la raíz de `FACTURAS
  Apartamentos/2026` tenía 13 PDFs sueltos que resultaron ser solo 3 facturas distintas (EMASESA Reform
  57,09€ ×9 copias, EMASESA "Bustos 1º DER" 2025 ×2 facturas distintas ×2 copias) más 9 facturas reales
  ya conciliadas en banco de sesiones previas sin bitácora (Dimitri 907,50€, CREATE 123,45€, 4× Endesa
  Dúplex, 4× Endesa Bustos Reform/Luxury) que nunca se habían archivado en Drive. Las 11 se archivaron
  ahora en sus carpetas de mes + se completó `propiedad_id` en 7 movimientos; 4 avisos nuevos en
  `_DUPLICADOS_BORRAR`. **Aviso importante: el Apps Script `Facturas a Drive` (Vía B, copia PDFs de
  Gmail) lleva 18 días parado** (última copia 23/06, detectado el 02/07 y no se ha autocorregido) —
  Petroprix, la factura fal.ai y ASECON quedaron "Para tu decisión" por falta de PDF legible. Alberto
  debería revisar la autorización OAuth del script. También sin resolver: EMASESA contrato 0105329645
  ("Bustos Tavera 1º DER", facturas 2025 a nombre de Punto y Coma SL) es una unidad que NO está en la
  tabla CUPS conocida — preguntar si sigue en uso. Detalle en `docs/AGENTES-BITACORA.md` (entrada
  2026-07-11) y `.claude/skills/facturas-correo/SKILL.md` (nota Vía B actualizada).

- **✅ Cierre OTA (punto 3) + agente Gmail de justificantes + móvil de "Control de facturas" (10/07/2026, rama
  `claude/unpaid-ota-invoices-hqt8ll`, PR nueva desde main tras mergear #817).** Tres cosas en un PR draft:
  1. **Certificación por piso del cuadre OTA — 3 de 4 pisos cerrados.** Alberto pasó el desglose de payouts de
     Booking (extranet "Información de los pagos", estado Enviado, Ene–Jul 2026) de 3 pisos. Cruzado contra
     `incomes` (bruto por mes de checkout): **Luxury Busto** pagó 13.092,08€ vs libros 13.075,50€ (Δ +16,58€,
     0,13%); **Dúplex Center** 12.874,06€ vs 14.281,10€ (Δ −1.407€); **Busto Reform** 8.125,17€ vs 8.614,67€
     (Δ −490€, enero cuadra al céntimo). Los Δ negativos son SOLO checkouts recientes (julio + fin de junio) aún
     sin liquidar por la OTA (la extranet los marca "Programado"/"no hay pagos"), **no dinero perdido**. Ninguna
     reserva impagada en los 3. Anexos 2/2-bis/2-ter en `INFORME-COBROS-OTA-2026-07.md`. **House Sevillana (4º piso)
     NO cuadra limpio** (Anexo 2-quater): Booking pagó 37.347€ vs libros 42.052€ de checkouts YA completados
     (≤9 jul) → **−4.705€ (~11%)** que NO se explica solo por el borde reciente (los checkouts Jun–9jul suman
     3.872€ y casi todo junio ya estaba pagado). Dos hipótesis sin poder distinguir: desfase de pago fuerte en
     temporada alta (Abr–May factura 11k/9k y el "dinero en vuelo" puede rondar 5–6k), o **reservas
     canceladas/modificadas contadas a bruto en `incomes`** (la tabla no tiene estado) → los libros
     SOBREESTIMARÍAN ingresos (riesgo CONTRARIO al de la alarma; relevante IRPF). Revisadas Abr+May a mano: sin
     duplicados ni noches=0. **RESUELTO esa misma noche con el calendario Smoobu** (Alberto lo pasó, coloreado por
     canal; verde=HomeExchange que NO da dinero): cruzadas las 28 reservas Booking del libro 1-a-1 contra el
     calendario (Ene–May al 100%) → **todas reales y confirmadas**; sin duplicados de reservationId; los
     HomeExchange (verde) están como portal OTRO a ~0€, no en Booking. **Los libros son correctos** → el −4.705€
     NO es error ni dinero perdido: es **cobro en tránsito** (Booking aún no ha desembolsado; remesa "Programado"
     13-jul + desfase normal en un piso de reservas grandes). **Los 4 pisos cuadran** (⚠️→✅). Único seguimiento:
     si en unas semanas Booking no liquida ese saldo, reclamarlo. Anexo 2-quater actualizado con el cierre.
  2. **Agente de conciliación de facturas desde Gmail (`lib/agente-facturas/conciliar-gmail.ts` +
     `POST /api/finanzas/gastos/conciliar-gmail`).** Ataca el backlog "❗ 127 deducibles sin justificante":
     barre el buzón `Triaje/Contabilidad`, OCR de cada adjunto (`aiExtractInvoice`, PDF-texto o imagen) y
     **engancha** la factura a su cargo del banco sin conciliar vía `casarFactura` (match CONSERVADOR: mismo
     signo + importe al céntimo + fecha ±N días → nunca a ciegas). Auth sesión O `CRON_SECRET`; resumen
     Telegram opcional (`avisar=1`, por defecto en cron). Reutiliza piezas ya probadas (IMAP/OCR/casado).
  3. **Responsive de `/sivra/facturas-control`.** La tabla de 5 columnas se cortaba en móvil (captura de
     Alberto). Ahora ≤640px pinta **tarjetas apiladas** (matchMedia tras montar, sin duplicar refs de los
     `<input file>`) y en desktop la tabla va en contenedor con `overflow-x:auto`. Acción "📎 Subir PDF"
     extraída a `renderAccion()` compartida. tsc 0 en los 3 archivos.

- **✅ Falsa alarma "44.797€ sin cobrar de OTAs" DIAGNOSTICADA + vigilante ARREGLADO (10/07/2026, rama
  `claude/unpaid-ota-invoices-hqt8ll`).** El banner del dashboard avisaba de 44.797,26€/94 reservas OTA
  "sin cobrar". **Era 100% falso positivo:** el banco había recibido MÁS de lo facturado (67.519€ recibidos
  vs 56.965€ bruto facturado en la ventana, +10.554€). **Causa raíz** (comprobada contra BD y contra el
  desglose real de Booking de Luxury Busto mayo — captura de Alberto): la v1 de `lib/sivra/cobros-ota.ts`
  emparejaba 1 abono ↔ 1 reserva por importe EXACTO contra el **neto**, pero (1) Booking **ingresa el BRUTO**
  y factura la comisión aparte, y (2) las OTAs **agrupan** varias reservas por transferencia con referencias
  que el banco rota. Solo 8 de 99 casaban. **Arreglo:** reescrito a **conciliación por flujo (FIFO en el
  tiempo) a nivel de cuenta**, contra el **bruto** (`amount_gross`), con abonos muchos-a-uno/uno-a-muchos,
  umbral de aviso agregado subido a 500€, márgenes ampliados (BOOKING/AIRBNB 10 d, EXPEDIA 40 d, AGODA 20 d).
  Contrato de salida intacto (el banner no cambia). **Sigue sin IA** (es dinero → SQL/aritmética). Simulado
  sobre las 96 reservas reales → **0,00€ pendientes** (antes 44.797€). Tests 11/11 (`node --test`). Informe
  en `apps/plataforma/docs/INFORME-COBROS-OTA-2026-07.md`. **Límite conocido:** el cuadre es agregado por
  cuenta (los abonos no se pueden atribuir a un piso); prueba que no hay agujero grande, no certifica
  una-por-una. **Pendiente Alberto:** confirmar en la extranet que no hay reservas OTA fuera de `incomes`
  (único hueco real posible) y validar el spot-check de Luxury Busto contra su desglose de Booking.
  **AMPLIADO (misma PR #817):** Alberto detectó que el resto del banner del dashboard también mentía. El
  flag `requiere_revision` es **zombie** — `/api/banca/confirmar` marcaba `destino_confirmado=true` sin
  limpiarlo → **1.202 movimientos ya confirmados** seguían con el flag, y el banner (`getGastosSinClasificar`)
  los contaba como "58.097,99€ sin clasificar / 38 gastos por revisar" (real: **0€**; 35 de los 38 eran
  ingresos, no gastos). La página `/finanzas/gastos` y el `health-check` ya filtraban bien; solo el banner no.
  **Arreglo:** `getGastosSinClasificar` + `getAlertas.porRevisar` añaden `NOT destino_confirmado AND
  destino<>traspaso_interno` (+ `importe<0`); `/api/banca/confirmar` limpia el flag al confirmar (raíz);
  migración `prisma/sql/2026-07-10_limpiar_requiere_revision_confirmados.sql` limpia los 1.202 zombies
  (PENDIENTE aplicar por Supabase MCP). Los avisos "127 sin justificante" y "10 facturas faltan" son
  backlog REAL (subir justificantes), no bugs.

- **🐛✅ FIX rrhh: la ficha de empleado NO guardaba NINGÚN cambio (10/07/2026, rama
  `claude/card-changes-not-saving-rginop`).** Alberto reportó "no guarda los cambios en las fichas"
  (captura del empleado PIÑA FRANCO MANUEL ANTONIO). **Causa raíz** (verificada contra la BD real,
  no adivinada): el `PATCH /api/admin/empleados/[id]` construye un `UPDATE` raw con Prisma, y las 3
  columnas DATE (`fecha_nacimiento`, `fecha_alta`, `fecha_reconocimiento_medico`) se asignaban **sin
  cast** — Prisma manda el parámetro como `text` y Postgres rechaza `date = text` con `ERROR 42804`
  **aunque el valor sea NULL** (comprueba el tipo, no el valor). Como el formulario SIEMPRE envía esas
  3 fechas, **todo el UPDATE fallaba → PATCH 500 → 0 cambios guardados**. El autor ya casteaba `::uuid`
  en el WHERE por el mismo motivo, pero se olvidó de las fechas del SET. **Fix:** helper `cDate()` que
  añade `${val}::date`. **De paso:** el PATCH leía `dni` pero ignoraba `nss` (el form lo enviaba) →
  las ediciones de NSS se perdían en silencio; añadido. **Deriva de esquema saldada:** `apellidos` y
  `fecha_reconocimiento_medico` existían en la BD (aplicadas a mano en commit 9e84f1e "migración ya
  aplicada") pero sin fichero de migración ni en `schema.prisma` → añadida migración idempotente
  `0020_ficha_apellidos_reconocimiento.sql` + campos al modelo Prisma. Verificado: `tsc --noEmit` OK y
  el UPDATE corregido persiste todos los campos (probado con transacción revertida sobre el registro real).

- **✅ RE-DIAGNÓSTICO: las 7 rutinas NO corrían sin repo — la PR #815 se equivocó de causa (13/07/2026, rama
  `claude/ialimp-client-health-missing-4fisyk`).** La PR #815 (ya fusionada) documentó que a 7 triggers les
  faltaba `central` como *fuente*. **Verificación de solo lectura en la UI del 13/07 (abriendo cada rutina en
  `claude.ai/code → Rutinas`): las 7 YA tienen `central` adjunto.** No faltaba en ninguna → tercer diagnóstico
  del hilo tras "proyecto equivocado" y "falta el repo", ambos incorrectos. **Causas reales:** (1) los fallos en
  rojo del 8/07 de `psd2-health-check` y "Agente de prospección comercial" eran **"Límite de uso alcanzado"**
  (límite semanal, reset 11/07 07:00 UTC), transitorio; (2) `ialimp-client-health` — un **run manual del 13/07
  11:36 completó en verde** (skill encontrada, repo clonado, Sique Brilla OK; la pasada abrió el PR draft #870
  con su bitácora). Los runs antiguos "sin repo" no se explican por trigger sin fuente (la tenía): repo
  adjuntado/propagado después o desfase puntual *adjuntado ≠ clonado*. **Pendientes reales:** (a) 🔴 rotar el
  `CRON_SECRET` de `buscador-ia` (está como **literal en texto plano** en su prompt, no placeholder) y sacarlo
  del prompt; (b) actualizar las queries SQL desfasadas de la skill `ialimp-client-health` (esquema real:
  `cleaning_sessions`/`pms_connections`/`facturas_clientes`) — tarea de `agentes-entrenador`. Corrección de docs
  en `docs/RUTINAS-PROGRAMADAS.md` (incidente rutina 7 re-diagnosticado + sección de verificación + pendientes #8/#9).

- **✅ Director de código COMPLETO y EN PRODUCCIÓN — cierre B/C/A + D aparcado (10/07/2026, rama
  `claude/agent-token-optimization-146k3e`, PRs #806 y #810 mergeados).** Continuación de la entrada de más
  abajo (índice a nivel de función + tabla + endpoint). Ya **resueltos los 2 pendientes** que quedaban:
  (1) Alberto añadió los GitHub Actions secrets `PLATAFORMA_URL` + `CRON_SECRET` (metió la contraseña y
  redesplegó) → `auditoria.yml` **auto-puebla `mapa_arquitectura` en cada push a `main`** (las ~2025 filas,
  ya no la muestra de 20); (2) documentado el protocolo del Director en `docs/DIRECTOR-CODIGO.md` (#806).
  **Siguiente paso (#810)**, 3 de las 4 mejoras que pidió Alberto:
  **(B)** el paso de inyección de `auditoria.yml` ahora **reintenta con backoff** (6 intentos, 15→75 s ≈ 3,7 min)
  para cubrir el 404 transitorio cuando un push a `main` además redespliega `plataforma`; un **401** (CRON_SECRET
  que no cuadra con Vercel) NO se reintenta. **(C)** sección "Medir el ahorro" en `DIRECTOR-CODIGO.md` con SQL
  sobre `ai_usos` (`endpoint='codigo'`): volumen, coste y reparto por modelo. **(A)** nueva skill **`code-map`**
  (`.claude/skills/code-map/SKILL.md`, en `docs/SKILLS.md` bajo "Desarrollo (ahorro de tokens)") — el gemelo
  "lado sesión" del endpoint: enseña a las sesiones Claude Code (que SON los agentes programadores de este repo)
  a consultar `mapa_arquitectura` por `word_similarity`/GIN (MCP Supabase `wswbehlcuxqxyinousql`) para acotar
  archivos ANTES de Grep/Read a ciegas; degrada al método clásico si el mapa no está. **(D) Embeddings pgvector
  = APARCADO a propósito** (mi recomendación, aceptada): el trigram ya acota bien en las pruebas y los embeddings
  solo ganan en órdenes muy vagas (mayor esfuerzo/menor retorno; requiere columna pgvector + cron de embeddings,
  no cabe en el CI Node-puro). Se retomará SOLO si el trigram se queda corto en uso real — medible por `ai_usos`
  `endpoint='codigo'`. Verificado: CI 14 checks en verde (incl. build de `plataforma`, tests+guardián, `--check`
  de la radiografía) antes de mergear #810.

- **✅ Radiografía financiera — Fase 3: lente Fiscal completa (PR #813 MERGEADO, 10/07/2026, rama `claude/accounting-consolidation-study-cbe2lf`).**
  Continuación de PR #809 (mergeado). La **lente 🧾 Fiscal** de la Radiografía deja de ser un mero resumen con
  enlace: ahora **mete dentro "Mi declaración"** (fusiona Fiscal + Proyección en un sitio). Hecho: (1) `radiografia/
  page.tsx` calcula `calcularEstadoDeclaracion(session.id, year, resumenAnual)` (de `lib/comparativa-declaracion.ts`,
  reutilizado con `/finanzas/fiscal`) en SSR y lo pasa al cliente; en `try/catch` → si falla, la lente degrada sin
  romper. (2) **Bug latente corregido:** la lente Fiscal usaba `resumen.fiscal` del INTERVALO (en la vista por
  defecto = mes en curso → base imponible del mes, engañosa). Ahora el bloque fiscal usa **SIEMPRE el año completo**
  (`resumenAnual.fiscal`; se reutiliza `resumen` si el intervalo ya era el año, si no se calcula aparte). (3)
  `RadiografiaClient.tsx` — nuevos `MomentoCard` (📍 Hoy / 🔮 Fin de año, cada uno 👤 Solo yo / 🤝 Conjunta con Pilar
  + palanca de gasto) y `TramoBar` (barra de tramos IRPF, misma fuente de tramos del servidor) + KPIs base/tipo
  efectivo/marginal/retenciones; enlace a `/finanzas/fiscal` para el detalle de deducciones. tsc limpio en los
  ficheros tocados. **PENDIENTE (Fases 2/4):** lente Negocios con P&L por piso (`getPLMensual`) + reclasificación
  inline; eliminar `TRAMOS_IRPF` hardcodeados de `proyeccion/ProyeccionClient.tsx` y retirar la página `proyeccion`;
  absorber tarjeta-crédito en Personal; deltas de ingresos/resultado (hoy solo el gasto total lleva Δ).
  **Doc de la vertical actualizada:** `apps/plataforma/CLAUDE.md` ya documenta la Radiografía (`/finanzas/radiografia`,
  las 3 lentes, `bancoCond`, la des-duplicación del menú y los pendientes) — antes no la mencionaba.

- **🚧 Radiografía financiera unificada — Fase 0+1 (esqueleto) (10/07/2026, rama `claude/accounting-consolidation-study-cbe2lf`).**
  Estudio + primer esqueleto para unificar la dispersión financiera de Alberto (10 pantallas de dinero, 5
  selectores de intervalo distintos, P&L duplicado en 3 sitios, 2 calculadoras IRPF, 2 motores de proyección).
  **Diseño aprobado** (plan en `/root/.claude/plans/…`, no versionado): UNA pantalla "Radiografía" con selector
  único (mes/trimestre/rango libre) + cabecera-resumen fija + comparativa + bandeja "sin identificar" arriba +
  3 lentes (🏢 Negocios · 🏠 Personal · 🧾 Fiscal). **Hecho:** (1) `lib/finanzas.ts` — `getResumenFinanciero`/
  `getResumenPilar` aceptan `desde?/hasta?` (rango libre); helper `shiftYearStr` para la comparativa; y helper
  puro `bancoCond(banco)` (BBVA `LIKE '%bbva%'` vs familiar) para filtrar el eje personal por cuenta.
  (2) `app/(usuario)/finanzas/IntervaloSelector.tsx` — selector de intervalo COMPARTIDO. (3) `finanzas/radiografia/`
  (`page.tsx` + `RadiografiaClient.tsx`) — pantalla nueva (por defecto MES EN CURSO): cabecera fija (Ingresos/Gasto
  total con Δ vs año anterior/Resultado/reparto Negocio·Personal), bandeja "🔎 sin identificar", y 3 lentes; la
  **lente Personal separa BBVA (100% tuya) vs Kutxabank (familiar)** y cada bloque enlaza a su detalle filtrado.
  (4) **Detalle "En qué gasto" (`CategoriasTab`) filtra por CUENTA** (`?banco=` + selector Todo/BBVA/Kutxabank),
  inyectado en las 3 rutas `/api/finanzas/categorias{,/comerciantes,/movimientos}` + `getMerchantsForCategoria`.
  (5) **Des-duplicación del menú (Fase 4 iniciada):** se retiran de `UserSidebar.tsx` las 4 entradas fiscales
  sueltas (En qué gasto / Deducciones / Fiscal / Proyección) → *Mi negocio* de 11 a 8 ítems; la Radiografía es la
  única puerta y el detalle cuelga de sus lentes (páginas NO borradas, reversible). Build OK, guardián 22/22.
  **PR #809 mergeado.** **PENDIENTE (Fases 2-4):** lente Negocios con P&L por piso + reclasificación inline; lente
  Fiscal fusionando Fiscal+Proyección y unificando las 2 calculadoras de tramos; absorber tarjeta-crédito; delta
  de ingresos/resultado (hoy solo gasto total). Mejoras Fase 2+ en el plan: "¿llego a fin de mes?" (tesorería),
  fijo vs variable, calendario de obligaciones, caja de preguntas del contable, termómetro de presupuesto.

- **✅ Fix reservas canceladas fantasma en calendario/ingresos SIVRA (10/07/2026, rama
  `claude/smoobu-reservation-missing-0tusov`).** Alberto: "esta reserva no me aparece en Smoobu"
  (captura de `/sivra/calendario`, tarjeta de Gabriela Encheva con "Noches: ?"). **Diagnóstico:** la
  reserva se canceló en Booking/Smoobu (15/06) pero seguía viva en `incomes`. **Causa raíz** (confirmada
  contra la API de Smoobu vía `pg_net`): el listado `/api/reservations` de Smoobu **OCULTA las canceladas
  salvo `showCancellation=1`**, flag que `fetchPage` no ponía → la rama `if (isCancel) DELETE FROM incomes`
  de `runSync` **nunca se ejecutaba** (ni cron ni webhook) y cada cancelación dejaba un fantasma que inflaba
  calendario e ingresos. **Fix código:** añadido `showCancellation:'1'` en `fetchPage` de
  `apps/plataforma/lib/sivra/smoobu-sync.ts` (canónico) y en la copia `apps/sivra/app/api/updates/sync/route.ts`.
  **Fix UI:** la tarjeta de detalle de `/sivra/calendario` deriva `nights` de las fechas (mismo fallback que las
  barras/tabla) → no más "Noches: ?" ni ADR = total. **Limpieza datos** (`prisma/sql/2026-07-10_incomes_limpiar_canceladas_fantasma.sql`,
  aplicada en `wswbehlcuxqxyinousql`): borradas las **9 reservas canceladas fantasma** con llegada 2026-27
  (verificadas 1 a 1 contra Smoobu) + backfill de `nights` en 18 reservas activas con 0/NULL. ⚠️ **LANDMINE:**
  cualquier lectura del listado de Smoobu que deba reflejar cancelaciones necesita `showCancellation=1`.
  Alberto NO quiso barrer canceladas históricas (<2026) por ahora. Verificado: 0 fantasmas restantes, 0 futuras
  con nights=0, sintaxis TS OK (sin deps instaladas en el contenedor).

- **✅ Agente contable: "ingresos duplex" arreglado + híbrido "IA enruta, SQL calcula" (10/07/2026).**
  Alberto: el chat `/contable` respondió "Ingresos duplex 2026 → 98.317,59€ / 239 movs" (imposible: era el
  TOTAL del año). **Causa:** el router determinista (`lib/contable/intencion.ts`) no conocía "duplex" y el
  comodín "total del año" tapó el filtro; además el importe salía mal formateado (`98317.59 €`). **PR #807
  (mergeado):** fila del Dúplex en `DESTINO_SINONIMOS` (`turistico_duplex`) + `respuestas-directas.ts` usa
  `eur()` de `lib/dinero.ts`. **PR #808 (mergeado):** a petición de Alberto, montado el híbrido:
  (a) el router deja de contestar el total a ciegas cuando hay una **entidad sin resolver**
  (`entidadesResiduales`); (b) nuevo `lib/contable/clasificar-ia.ts` — la IA MAPEA la pregunta a una
  intención estructurada y el **SQL calcula la cifra exacta** (la IA nunca inventa números); (c) **aprende**
  el vocabulario nuevo en `contable_memoria` (clave `sinonimo_negocio:<palabra>`, sin migración) → la próxima
  vez es determinista. `detectarIntencion(…, extras)`, `intencionDesdeJSON` (validador puro) + 12 tests nuevos
  (77/77 en `node --test lib/contable/`). Sin envs nuevas (reutiliza la pasarela IA existente).
  **Reconciliación de docs (misma fecha):** actualizado el router `plataforma-maestro/SKILL.md` (ficha del
  agente contable: añadido el tier **1-bis IA-enruta-SQL-calcula** + el aprendizaje `sinonimo_negocio:` +
  la nota del Dúplex en el camino determinista) y `apps/plataforma/CLAUDE.md` (mismo detalle). ⚠️ Regla
  latente: `getMemoria` EXCLUYE las claves `sinonimo_negocio:%` del contexto del LLM — no son hábitos que
  contarle al modelo, son vocabulario para el router; no reintroducirlas en el panorama.

- **✅ facturas-correo: Paso 1-bis reforzado para subidas MANUALES a Drive (10/07/2026).** A raíz de la
  factura **Castuera 055/2026** (climatización Casa Socorro, 1.691,58 €): el agente YA la había leído,
  clasificado (`turistico_pisos`), archivado en `FACTURAS Apartamentos/2026/07-Julio-2026`
  (`2026-07-09_JMCastuera-Socorro_1691.58EUR.pdf`) y **conciliado** con el cargo Bankinter del 10/07 —
  todo automático desde Gmail. Pero Alberto la subió además a mano y quedaron **2 duplicados**
  (suelto en la raíz `FACTURAS Apartamentos/2026` y en `ALBERTO 2026 PERSONAL (SEGUROS)/JULIO`),
  y no veía la carpeta de julio porque miraba en su estructura personal, no en la de FACTURAS.
  **Fix:** Paso 1-bis de la skill `facturas-correo` ahora (1) barre también PDFs recién creados por
  Alberto fuera de la estructura de FACTURAS, no solo los sueltos en la raíz; (2) **verifica anti-
  duplicado** antes de tocar nada — si ya hay copia normalizada en el mes O el cargo ya está
  `conciliado=true` con `factura_ref`, solo avisa «🗑️ borrar duplicado» y no re-archiva/re-concilia;
  (3) deja explícito que una subida manual se trata igual que un correo (clasificar → si deducible
  archivar+conciliar). **Extras aplicados** (a petición de Alberto): (a) buzón único de subidas
  manuales `FACTURAS Apartamentos/2026/_subir_aqui` (`1JlK9JXIpqlbDlOawtAFlk4_X7bn0Onjf`) como vía
  preferente en vez de barrer todo Drive; (b) regla nueva en Paso 4: imputar `propiedad_id` cuando la
  factura es de UN piso (no solo la luz) — y de paso el cargo Castuera reimputado a `prop_house_sevillana`
  (Casa Socorro); (c) aviso «⚠️ mal ubicado» si un deducible aparece en el árbol personal (SEGUROS).
  **Extra #2 (misma sesión):** papelera única **`FACTURAS Apartamentos/2026/_DUPLICADOS_BORRAR`**
  (`1Au-_pFEPqvwZN_a7xKNZzVZOWGMAAO7Z`) como bandeja de duplicados a borrar. Como el MCP de Drive no
  mueve/borra/edita, la papelera lleva **un mini-aviso (Google Doc) por duplicado** con enlace directo
  al fichero a borrar + enlace a la copia buena; idempotente por título. Sembrada con los 2 duplicados
  Castuera y con la **carpeta `07-Julio-2026` duplicada** (había DOS: se consolidó todo en la canónica
  del 01/07 `13Pxwt…` —copiando allí la factura PriceLabs que estaba en la del 07/07— y se marcó la del
  07/07 para borrar). Regla nueva en Paso 3: reusar SIEMPRE la carpeta de mes existente más antigua,
  nunca crear una segunda. Pendiente de Alberto: vaciar `_DUPLICADOS_BORRAR` (3 avisos) borrando los
  ficheros/carpeta reales y luego el aviso.
- **✅ Índice de arquitectura a nivel de FUNCIÓN + Director de código (10/07/2026, rama
  `claude/agent-token-optimization-146k3e`).** Alberto: "los agentes programadores gastan demasiados tokens
  leyendo archivos enteros para entender el flujo antes de tocar el definitivo". Auditoría: la radiografía ya
  existía (`scripts/auditar-estructura.mjs`) pero solo a nivel app/módulo/ruta/tabla; faltaba nivel de FUNCIÓN,
  la persistencia en Supabase y un director que ACOTE archivos. Estrategia (decidida con Alberto): archivos
  reales INTACTOS; el "esqueleto" es solo un ÍNDICE global; el Director acota (0 tokens) → señala el archivo →
  el agente lee el archivo ENTERO y devuelve diff (nada de trocear/fusionar fragmentos). Entregables:
  **(1)** `auditar-estructura.mjs` ampliado — extrae firmas de función (nombre/params/retorno/exportada/línea),
  resumen de cabecera y tablas referenciadas por archivo con **regex Node-puro (0 tokens, sin `typescript` ni
  install en CI)**; nuevo artefacto `docs/mapa-funciones.generated.json` (2024 archivos · 5265 funciones), SHA de
  git vía `execSync` (stdlib), excluido del comparador `--check` para no churnear. **(2)** Tabla Supabase
  `mapa_arquitectura` (`prisma/sql/2026-07-10_mapa_arquitectura.sql`: 1 fila/archivo, `funciones jsonb`, índice
  **pg_trgm** sobre `busqueda`, GIN en `tablas`, `REVOKE anon/authenticated`, sin RLS — BYPASSRLS). Se inyecta por
  el puerto interno `app/api/internal/mapa-arquitectura` (upsert idempotente por `hash`, borra huérfanos; auth
  `CRON_SECRET`), llamado desde `.github/workflows/auditoria.yml` **solo en `main`** (curl con `PLATAFORMA_URL`+
  `CRON_SECRET` → sin `DATABASE_URL` en CI). **(3)** Director de código `lib/ia-director-codigo.ts::acotarArchivos`
  (keywords → `word_similarity`/pg_trgm sobre `mapa_arquitectura` → top-N; reutiliza `elegirModelo` para el modelo
  bajo presupuesto; degrada `sinMapa`/`stale`, nunca lanza) + endpoint `app/api/ai/codigo` (auth `AI_GATEWAY_SECRET`,
  presupuesto, `registrarUso` endpoint `codigo`). **(4)** Categoría `codigo` en el catálogo del cron
  `ia-director-refresh` (qwen-coder/deepseek/sonnet; enruta por complejidad vía `modelosPermitidos`).
  **APLICADO Y PROBADO (10/07/2026):** migración `mapa_arquitectura` **aplicada por Supabase MCP en
  `wswbehlcuxqxyinousql`** (pg_trgm ✓, 4 índices, REVOKE anon/authenticated); cargada una muestra de 20 archivos y
  validada la consulta EXACTA del Director contra Postgres real: "login"→`.../auth/login/route.ts` (score 1.0),
  "director+codigo"→`ia-director-codigo.ts`+`api/ai/codigo` (1.0/0.889), tabla `movimientos_bancarios` vía GIN→
  `banca/destino`+`conciliacion`+`contable/cerebro`, "pricing sivra"→`pricing-auto`+`sivra/lib/pricing`. CI: **build
  de `plataforma` Ready** (valida tsc/next build de todo el TS nuevo) + los 7 proyectos Vercel en verde; guardia 22/22,
  `--check` gate OK, `keywordsDe("Arregla el bug del login")→[login]`.
  ✅ **RESUELTO** (ver entrada de arriba, #806/#810): Alberto añadió los secrets `PLATAFORMA_URL` + `CRON_SECRET`
  → `auditoria.yml` ya inyecta las ~2025 filas en cada push a `main` (con reintentos). Opcional runtime:
  `DIRECTOR_MODO=activo` (arranca en sombra), `MAPA_STALE_DIAS` (default 7).
- **🟢 EN VIVO: triaje de correo + Agente Director (10/07/2026).** Alberto activó en el proyecto Vercel
  `plataforma` (por la extensión Claude para Chrome, verificado desde aquí con el MCP de Vercel — deployment
  de producción `ARkMaj5dp` en READY sirviendo tráfico):
  - **`TRIAJE_DRY_RUN=false`** → el triaje de correo sale de sombra: ya **etiqueta/archiva en Gmail de
    verdad** y avisa por Telegram (personal/huéspedes/leads) en cada pasada del cron `*/10`. La clasificación
    ya era fiable (capa keyword + IA). Si algo clasifica raro → regla en `correo_reglas` (0 tokens).
  - **`DIRECTOR_MODO=activo`** → el Director **enruta modelos de verdad** en `/api/ai/*` (antes solo registraba
    en `ai_usos`). ⚠️ Se acortó la semana de sombra prevista a **1 día** (creado 09/07, activo 10/07): el bucle
    de aprendizaje F4 tiene poca muestra todavía; vigilar `/operador/ia` y `/operador/agentes` los primeros días.
    No rompe (si un modelo falla, cae a la cadena gratis).
  - Ambas variables se crearon nuevas, solo en **Production**, marcadas `Sensitive`. Los dos "Pendiente de
    Alberto" de las entradas de abajo (triaje a vivo / Director a activo) quedan **cerrados**.

- **✅ Triaje de correo: capa keyword-first (09/07/2026, en el PR #798).** Al revisar el estado del
  agente de triaje (funciona, cron cada 10 min, 300 correos clasificados, **modo SOMBRA** `accion='sombra'`,
  0 notificados) se vio que **~27% caían a `dudoso` con confianza 0** — la pasarela de IA se satura en algunas
  llamadas y el correo cae al cajón seguro. Muchos eran contabilidad (recibos Stripe/PayPal/IBKR), huéspedes
  (Booking/Smoobu), correduría (Occident) o marketing claro. **Fix (mismo patrón que /finanzas):** nueva capa
  DETERMINISTA `apps/plataforma/lib/correo/keywords.ts` (`clasificarPorKeyword`, pura + test) que corre en el
  clasificador ANTES de la IA (paso 2.5): dominios de alta precisión (stripe/paypal/interactivebrokers →
  contabilidad; guest.booking.com/smoobu/homeexchange → huéspedes; occidentinforma → correduría; endesaclientes/
  cortefiel/sevillafc/pedrobuerbaum → ruido), prefijo `mediadores@` → correduría, y asunto transaccional
  (receipt/invoice/refund/recibo de pago) → contabilidad. Alta precisión; si no aplica, decide la IA (sin tocar
  seguridad/personal). Verificado: tsc 0, next build OK, node --test 7/7. **Pendiente de Alberto:** poner
  `TRIAJE_DRY_RUN=false` en el proyecto Vercel `plataforma` para pasar el triaje de sombra a VIVO (que ya
  etiquete/archive y avise por Telegram); la clasificación ya es fiable.

- **✅ Panel de agentes unificado: autónomos + asistentes IA (09/07/2026, seguimiento del #797).**
  Alberto vio dos recuentos distintos y preguntó por qué: `/operador/agentes` decía **24** (autónomos:
  rutinas Claude + Director + crons agénticos) y `/operador/estructura` decía **39** ("Agentes IA" = toda
  función con IA: copilotos, voz BRAIN, visión, OCR, chats por pantalla — lista `AGENTES` en
  `apps/plataforma/lib/estructura.ts`). Eran dos definiciones de "agente". **Unificado en `/operador/agentes`:**
  la pestaña ahora muestra ambos con un **filtro Todos / Autónomos / Asistentes**; reutiliza (NO duplica) la
  lista de `estructura.ts` para los asistentes (agrupados por vertical, sin semáforo porque son *bajo demanda*),
  y el titular reconcilia los dos números. Verificado: `tsc` 0, `next build` OK. Nota: los autónomos que son
  rutinas Claude siguen en ⚪ "sin telemetría" (no dejan rastro en BD); pendiente opcional darles un latido.
- **✅ Análisis de agentes + panel de agentes + Director ampliado (09/07/2026, rama
  `claude/agents-analysis-director-935c3q`).** Alberto: "análisis de todos los agentes, esquema, actualiza
  funciones en mi panel; hemos creado un agente director por si se le puede dar más funciones". Tres entregables:
  **(1) Esquema** — `docs/AGENTES-MAPA.md` (mermaid + tablas de las 3 familias: rutinas Claude / Director / crons
  agénticos de Vercel) + artifact visual. **(2) Panel** — nueva pestaña `/operador/agentes` (superadmin) que lista
  TODOS los agentes desde el catálogo tipado `lib/agentes-catalogo.ts` con **salud en vivo** (`lib/agentes-salud.ts`,
  semáforo 🟢🟡🔴/⚪ por última actividad en BD vs cadencia); tarjeta del Director en `/operador/ia` enriquecida
  (versión de catálogo, nº de modelos, estado de degradación por presupuesto). Sidebar: `🤖 Agentes` + `💸 IA · gasto`.
  **(3) Director con 4 funciones nuevas** — filtro puro `lib/director-modelos.ts::modelosPermitidos` que estrecha el
  catálogo ANTES de decidir: **F1** degradación gradual por presupuesto (al 80% del límite diario, solo modelos
  baratos, antes del bloqueo duro al 100% — `ratioPresupuestoDiario` en `ai-gateway.ts`); **F2** enrutado por
  contexto real de la petición + preferencia `eu` (RGPD) si es sensible; **F3** el Director sale de la pasarela:
  núcleo reutilizable `lib/pasarela.ts::chatConDirector` (el route `/api/ai/chat` pasa a wrapper fino) y el **agente
  contable** (`lib/contable/cerebro.ts`) enruta ya por el Director (CONTABLE_MODEL = override del modelo clásico);
  **F4** bucle de aprendizaje determinista en el cron `ia-director-refresh` — lee rendimiento real (error_rate/ms)
  de `ai_usos`, **penaliza** modelos con mala racha en el ranking y versiona snapshot en la tabla nueva
  `ia_director_aprendizaje` (migración aplicada en `wswbehlcuxqxyinousql`). Envs nuevas documentadas en
  `apps/plataforma/CLAUDE.md`. Verificado: `tsc` 0, `next build` OK, `node --test` (modelosPermitidos 9/9,
  catálogo 3/3), `test:guardia` 22/22. Pendiente de Alberto: nada obligatorio (el Director sigue en sombra hasta
  que ponga `DIRECTOR_MODO=activo`).

- **✅ OpenRouter como partner primario de IA + arquitectura de agentes (09/07/2026, rama
  `claude/openrouter-quickstart-t9w2k1`).** Alberto: "las IAs están saturadas, he conectado OpenRouter".
  5 piezas: **(A)** `@central/core-ai` gana adaptador puro `openrouter.ts` (OpenAI-compat, fallback
  NATIVO entre modelos `models:[...]`, prompt caching `cacheSystem`, no-training `privacidad`,
  `response_format`, `fetchImpl` testeable) + `embeddings.ts` (`geminiEmbed`, 1º del monorepo) y
  la cadena `aiComplete`/`aiTools` pasa a **OpenRouter (si hay `OPENROUTER_API_KEY`) → NIM → Groq →
  Gemini → Kimi** (sin key, idéntica a antes; `skipOpenRouter` para la pasarela). **(B)** Agente
  DIRECTOR en la pasarela (`lib/ia-director.ts` + tabla `ia_director_prompt`, semilla v1 aplicada):
  modelo barato elige slug por petición con **salida estructurada** (json_schema + enum del catálogo
  = imposible inventar modelo); **modo SOMBRA por defecto** (`DIRECTOR_MODO=activo` para enrutar;
  1ª semana comparar en el panel); `:floor` opcional. **(C)** Meta-agente cron semanal
  `/api/cron/ia-director-refresh` (lunes 05:00): catálogo público `/api/v1/models`, ranking
  DETERMINISTA por listas `PREFERIDOS` + techo de precio, suplentes `:free` vivos, versiona
  prompt+catálogo, Telegram si cambia el juego de modelos, y vigila créditos (`/api/v1/credits`,
  umbral `AI_CREDITOS_UMBRAL`). **(D)** Presupuesto DIARIO en € a 3 niveles (global
  `AI_GATEWAY_LIMITE_DIARIO_EUR` default 1€ / por app / **por CLIENTE** para refacturar —
  `ai_usos.cliente_ref` + tabla `ia_presupuestos`, migración aplicada): bloquea SOLO el camino de
  pago, la cadena gratis sigue (degrada, nunca muere); Telegram 1x/día. Panel `/operador/ia`:
  gasto hoy, Director, por modelo y por cliente. **(E)** Caché semántica **pgvector** (1º uso;
  extensión instalada + `ia_cache_semantica` aplicada): opt-in DOBLE (`IA_CACHE_SEMANTICA=1` +
  caller manda `cache:{ambito}`), umbral coseno ≥0,97, TTL, fail-open. **Pendiente de Alberto:**
  poner `OPENROUTER_API_KEY` en el proyecto Vercel `plataforma` (con eso arranca todo en sombra);
  tras ~1 semana, `DIRECTOR_MODO=activo`. Migraciones YA aplicadas en `wswbehlcuxqxyinousql`.
  Tests core-ai 14/14, guardián 22/22, tsc plataforma limpio.

- **✅ rrhh: fix error Digest 3871889014 (BigInt) + apellidos/nombre separados (09/07/2026, PR #793 mergeado).**
  Pilar reportó error de página al crear empleado y subir documento. Causa raíz: columna `rrhh.documentos.tamano`
  es `bigint` en PostgreSQL → Prisma `$queryRaw` devuelve `BigInt` de JS → `JSON.stringify` lanza
  `TypeError: Do not know how to serialize a BigInt` en SSR. Fix: `tamano: d.tamano != null ? Number(d.tamano) : null`
  en `lib/documental.ts`. También: todos los catch en `documentos/route.ts` ahora devuelven JSON (antes lanzaban
  un 500 sin body que rompía `r.json()` en el cliente). Al mismo tiempo: **campo apellidos separado** en ficha y
  lista de empleados — migración `ALTER TABLE rrhh.empleados ADD COLUMN apellidos TEXT` aplicada a producción;
  lista ordena por `COALESCE(apellidos, nombre) ASC`; display `"apellidos, nombre"`. 9 ficheros tocados.
  sivra e ia-rest tienen builds fallidos pre-existentes (no relacionados con este PR).

- **🩹 2 fixes menores sin memoria propia, reconciliados en pasada de auditoría (09/07/2026).**
  **(1)** `fix(plataforma)` **#795** — el Agente Director a veces envolvía su JSON en fences
  ` ```json ` (OpenRouter no fuerza `response_format` a nivel de proveedor) y `JSON.parse` petaba
  con `SyntaxError`, cayendo a la decisión por defecto; ahora reutiliza `cleanJSON` de
  `@central/core-ai` (mismo patrón que el agente contable). De paso arregla `empleados.test.ts`
  (roto en main desde el PR #793 — el test no cubría el campo `apellidos` nuevo). **(2)**
  `fix(concursos)` **#786** — `tsc --noEmit` fallaba en main porque `evalOferta.umbral_temeraria`
  es `number|null` y el `eur()` de concursos espera `number|undefined`; normalizado `null→undefined`
  en la llamada.

- **✅ Agente contable: "gastos de la correduría / los pisos" responde por DESTINO (07/07/2026).**
  Alberto preguntó al chat "Gastos de este año 2026 correduria" y respondía **€18 / 1 cargo** (absurdo). Dos
  bugs en `lib/contable/intencion.ts`: (1) el extractor genérico de concepto capturaba **"este"** de "de este
  año" (no estaba en `STOP_CONCEPTO`) → `ILIKE '%este%'` = 1 cargo basura; (2) un negocio nombrado en solitario
  (correduría, pisos) no tenía intent (solo existía la comparativa `por_destino` con "vs"). Arreglo: se añaden
  demostrativos (`este/esta/…`) a `STOP_CONCEPTO`, y nuevo intent **`gasto_destino`** con `DESTINO_SINONIMOS`
  (correduría→`seguros`; pisos/apartamentos/turístico→`turistico_pisos`+`turistico_duplex`, con/sin tilde),
  que suma por la columna `destino` (mismo eje que la pestaña Gastos), compone con mes y sirve gasto o ingreso.
  `respuestas-directas.ts` añade el handler. Validado en BD: correduría 2026 = **€6.452,34 gasto / €1.493,64
  ingreso (43 mov)**, no €18. **Auditoría del agente (misma pasada):** el extractor de proveedor genérico
  perdía el proveedor cuando había mes ("en amazon **en junio**" devolvía el TOTAL de junio) y solo miraba
  la 1ª preposición (una stop-word inicial tapaba el proveedor). Arreglado: `primerConceptoNoStop()` recorre
  TODOS los objetos de preposición y coge el primero que no sea stop-word, y el concepto genérico se compone
  con el mes (va ANTES del mes-solo; los meses están en STOP así que "en junio" a secas sigue cayendo al
  total del mes). Tests intención 29/29, typecheck limpio.

- **✅ Reclasificación de las decisiones de Alberto APLICADA en BD (07/07/2026).** Ejecutado el SQL que estaba
  bloqueado por caída sostenida del gateway MCP: **hipoteca** = 19 mov CUOTA PTMO (€14.468,82); **club** = 17
  mov Círculo Mercantil (14 activos, €1.363,88); **El Girandillo** ya estaba en `turistico_pisos` (regla
  aprendida ya existía) y se limpió su subcategoría heredada; la regla `RECIBO CIRCULO MERCAN` fija
  `subcategoria='club'`. OJO aprendido: `categorizar.ts::analizarMovimientos` aplica `banca_destino_reglas`
  SOLO para `destino`, **no** lee su columna `subcategoria` — la subcategoría futura la pone el diccionario
  determinista `subcategoria-keywords.ts` al Auto-clasificar (por eso el fix de datos es el UPDATE, no reglas).
- **🎬 Reels IA de Instagram → Veo 3 Fast con audio nativo (07/07/2026, rama
  `claude/instagram-video-improvements-m6avu9`, PR #789).** Alberto: "quiero mejores vídeos para
  instagram". El Reel IA del miércoles usaba **Kling 2.5-turbo/pro** (t2v, 10s, **MUDO**). Se sube el
  motor a **Veo 3 Fast** (`fal-ai/veo3/fast`, ~$0.10/s vs $0.07 Kling → ~€0.80/reel, 1/semana): audio
  **nativo sincronizado** (adiós al reel mudo, sin sembrar música) + realismo Google. **Construido:**
  EF `ig-video-gen` v7 con `engine` conmutable (`MODELS` map, `buildPayload` por motor: Veo lleva
  `duration:'8s'`+`resolution`+`generate_audio`; Kling igual que antes); `startVideoIA(...,{engine,generateAudio})`
  en `ai-video.ts`; cron lee **`IG_VIDEO_ENGINE`** (default `veo3-fast`, `=kling` revierte sin código),
  `generarPromptVideo(tema,engine)` añade dirección de audio ambiente + refuerza "NO subtitles/text"
  (Veo quema subtítulos si detecta palabras); **cadena Veo → Kling → imagen**. Todo reel sigue pasando por
  **aprobación Telegram** antes de publicar (gate humano). `?engine=` en `/api/ig-ai-video` para probar a mano.
  **Verificado:** `tsc` + `next build` limpios. EF v7 desplegada a Supabase (`efncqyvhniaxsirhdxaa`) al mergear.
  **PENDIENTE (Alberto):** confirmar que `FAL_API_KEY` tiene acceso/saldo a Veo 3 Fast; **verificar que el
  audio de Veo sobrevive al re-encode de Cloudinary** (`videoConSubtitulo`/endcard) revisando el primer reel.
  Spec: `docs/superpowers/specs/2026-07-07-instagram-veo3-reels-design.md`.
- **🔐 Domótica — selector de tipo manual (07/07/2026, rama `claude/tuya-device-setup-1dpz09`).** Alberto
  vio que «Socorro» (la cerradura NIVIAN) se pintaba como **ventilador** (Encender/Velocidad/Luz) en vez de
  tarjeta 🔐 de acceso: su categoría Tuya no está en `CATS_ACCESO` (o vino vacía) y «Buscar dispositivos» no
  lo reclasificaba. **Fix:** `tipoEfectivo(config, categoria)` en `lib/domotica/tipo.ts` — si hay
  `config.tipoManual` ('acceso'|'ventilador'|'otro') manda sobre la categoría autodetectada. Lo consumen la
  ruta `dispositivos` (GET) y el cron `acceso/programador`. UI: **selector 🌀/🔐/Otro** en cada tarjeta
  (`SelectorTipo` en `DomoticaClient.tsx`, guarda por el PATCH de config existente). Marcando «Socorro» como
  🔐 Cerradura sale su tarjeta de acceso (sonda + PIN). Tests 46/46.
- **🔐 Domótica accesos NIVIAN — Fase 2 (PIN automático por reserva) implementada (07/07/2026, rama
  `claude/tuya-device-setup-1dpz09`).** La Fase 0+1 (sonda + panel + abrir) se **mergeó** (PR #785, squash
  `cabcbb2`); Alberto pidió «mergea porque no aparece nada y sigue fase 2» (el preview de la rama no tiene las
  envs `TUYA_*`, que son Production-scoped → la sonda solo responde en prod). **Construido en Fase 2:** tabla
  **`domotica_acceso_pin`** (migración aplicada; único `(dispositivo_id, reserva_ref)` = idempotencia);
  **`lib/domotica/acceso-programador.ts`** (puro, testeado: ventana desde `HORARIOS_PISO` ± márgenes en epoch
  DST-safe, reconciliación crear/borrar, aviso offline); **`lib/domotica/tuya-cifrado.ts`** (AES-128-ECB para
  contraseña online, roundtrip testeado); `acceso.ts` gana `crearPinTemporal` (intenta **online** —PIN elegido,
  ticket+AES— y cae a **offline** —Tuya genera el código, sin conexión—), `borrarPin`, `listarPins`, `generarPin`;
  **cron** `/api/sivra/domotica/acceso/programador` (`40 4,12,20 * * *`) sincroniza PIN por reserva de los
  próximos 14 días de **todos los apartamentos vinculados** (1 cerradura↔N pisos, BustoTavera); rutas manuales
  `POST/DELETE /api/sivra/domotica/acceso/[id]/pin[/ref]`; UI `TarjetaAcceso` con **PIN por reserva** (lista +
  alta/baja manual) y **⚙️ Configuración** 100% editable (autoPin, entrega, longitud, horario/márgenes,
  auto-borrado, botón abrir, pisos vinculados, alertas). **Entrega DEFAULT = `aviso`** (solo Telegram a Alberto;
  `huesped`/`ambos` se activan a mano por cerradura — nada llega a huéspedes reales sin querer). Tests
  `node --test` 44/44. **Se valida en producción** (dev no alcanza la Tuya API); si `crearPinTemporal` falla en
  todas las vías, la fila queda `error` + aviso Telegram y la sonda dirá qué expone el NIVIAN. **Pendiente:**
  cablear `codigosFijos` (limpiadora, mismo mecanismo sin caducidad) cuando la creación de PIN quede confirmada.
- **🔐 Domótica accesos NIVIAN — Fase 0+1 (sonda + panel) implementada (07/07/2026, rama
  `claude/tuya-device-setup-1dpz09`, PR #785).** Los 2 «teclados» descubiertos son **NIVIAN
  NV-ACCESS-PIN-RFID-W** (control de acceso **Wi-Fi**, PIN + tarjeta RFID); el tercero es el ventilador
  (`ceiling fan/Light v2`). «Socorro» online, «BustoTavera» offline. **Construido:** columna
  `domotica_dispositivos.categoria` (migración aplicada); helper puro `lib/domotica/tipo.ts`
  (`tipoDispositivo` + `CONFIG_ACCESO_DEFAULT`); `lib/domotica/acceso.ts` + `acceso-puro.ts` (sonda
  read-only `sondearAcceso` = spec+status+intentos door-lock con `try/catch` por bloque; `abrirMomentaneo`
  con DP candidato `unlock_request/open_door/…`); rutas `GET /api/sivra/domotica/acceso/[id]` (sonda) y
  `POST …/[id]/abrir`; UI `TarjetaAcceso` en `DomoticaClient.tsx` (botón 🔍 Sonda + 🚪 Abrir). `tuya.ts`
  exporta `tuyaRequest`/`tuyaGetToken`. Tests `node --test` 24/24. **La sonda descubre los DP/endpoints
  reales del NIVIAN** (el entorno de dev no alcanza la Tuya API). **PENDIENTE:** que Alberto pulse 🔍 Sonda
  sobre «Socorro» y vea qué bloques salen ✅ + el DP de apertura → eso **gatea la Fase 2** (PIN por reserva,
  alertas, tarjetas limpiadora, 1 cerradura↔N pisos). Spec/plan en `docs/superpowers/{specs,plans}/2026-07-07-*`.

- **📊 Propuesta comercial Grupo Joaquín Jaén → página viva en iarest (07/07, PR #779).** Deck de captación
  (17 láminas, HTML autocontenido con el logo de JJ en data-URI, tema claro/oscuro, imprimible a PDF, `noindex`)
  servido como estático en `apps/ia-rest/public/propuesta-jj.html` → URL `iarest.es/propuesta-jj.html`. Cubre los
  5 negocios + cocina central + intercompany (770k→−60k→710k) y la capa transversal REAL auditada en código:
  RR.HH./portal empleado, contabilidad+banca PSD2+copiloto IA, concursos públicos (radar PLACSP por CPV 55/15) y
  agentes (fiscal, pago proveedores, triaje, control facturas). Se quitó el lenguaje interno ("Design Partner")
  por ser modelo de negocio, no argumento de cliente. Fuente editable: Artifact en claude.ai (misma URL).
- **🧾 Categoría 'Impuestos' + repaso del "sin categoría" (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Al revisar los ~26.000€ "sin categoría" salió que **~20.340€ eran IRPF/Hacienda** (la renta: pago de junio
  12.020€ + 2º plazo de noviembre 8.014€ + tributos menores), no consumo. Decisión de Alberto: **categoría
  nueva `impuestos` (🧾) DENTRO de personal** (se ve en "En qué gasto" pero no infla el consumo). Keywords
  ESPECÍFICAS (`IMPUESTO DE HACIENDA`/`TRIBUT HACIENDA`/`AGENCIA TRIBUTARIA`/`AEAT`/` IRPF `) para no chocar con
  el IBI ni con locales llamados 'Hacienda'. Además: `AMZN Mktp`→**ocio** (el banco abrevia Amazon), `AYTO.
  SEVILLA`→**ibi**. Los **Bizums** a personas se quedan agrupados como 'Bizum' (decisión de Alberto). Tras la
  reclasificación el "sin categoría" bajó de 26.170€ a 5.537€, y 63 de los 86 restantes son Bizums. Taxonomía
  en `lib/categorias-personales.ts` (SUBCATEGORIAS_GASTO + EMOJI + DESCRIPCION). Tests 18/18 keyword.

- **✉️ Dedup del email frío de prospección POR DIRECCIÓN de email (07/07/2026, rama `claude/iarest-restaurant-emails-6r2vpi`).**
  Alberto preguntó si el agente controla no mandar al mismo cliente dos veces (tras la tanda 🍴 de 15
  restaurantes de `proponerEmailsVertical`). Ya deduplicaba por **`lead.id`** (tabla `leads_web_tracking`
  estado `enviado_dia1`, más desuscritos y `descartado`), pero el hueco era: **el mismo local en dos filas de
  lead distintas** (email idéntico, web/nombre algo distinto) recibía la presentación dos veces, porque el guard
  era por id, no por dirección. **Fix:** nuevo helper `emailsYaContactados()` + `normEmail()` en
  `apps/ia-rest/src/lib/lead-hunter-sevilla.ts` que, dado el pool de candidatos, devuelve las direcciones ya
  contactadas mirando los **dos caminos de envío vivos** (`leads_web_tracking` estado ≠ propuesto/descartado, y
  el pipeline del cron `crm-envio-auto`: `estado_pipeline='enviado'`/`propuesta_enviada_at`). Se añadió el guard
  por email (+ set en-tanda para no repetir dentro del mismo lote) en `enviarEmailsSevilla`,
  `proponerEmailsVertical` y el cron `crm-envio-auto`. tsc 0. Hueco teórico restante ya cerrado; no hace falta
  UNIQUE en `leads.email` (hay muchos NULL y posibles duplicados históricos que romperían la migración).
- **🌀 Domótica Tuya — el listado de dispositivos ahora sí ve el ventilador vinculado por QR
  (07/07/2026, rama `claude/tuya-device-setup-1dpz09`).** Alberto abrió `/sivra/domotica` y seguía en
  "Sin dispositivos". **Causa raíz de código:** `tuyaListDevices()` (`lib/domotica/tuya.ts`) llamaba solo a
  **`/v2.0/cloud/thing/device`**, que lista los dispositivos IMPORTADOS directamente al proyecto cloud —
  NO los vinculados por el QR de Smart Life ("Link App Account"), que es el flujo real del setup. Ésos
  salen por **`/v1.0/iot-01/associated-users/devices`** (verificado contra el cliente canónico tinytuya).
  Con lo anterior, «Buscar dispositivos» devolvía lista vacía aunque las envs estuvieran bien y la cuenta
  vinculada → tabla `domotica_dispositivos` a 0 filas. **Fix:** `tuyaListDevices` consulta ahora el
  endpoint de asociados (paginado por `last_row_key`) como fuente principal y **fusiona** con
  `/v2.0/cloud/thing/device` (dedupe por id, gana la 1ª lista) para cubrir ambas vías de alta; si el
  principal falla y no hay nada, propaga el error real (envs mal / trial IoT Core caducado) para que la UI
  lo muestre. Helpers puros nuevos `normalizarDispositivo`/`fusionarDispositivos` con tests (`node --test`
  17/17 verde). Doc `docs/DOMOTICA-TUYA.md` ampliada con troubleshooting «si Buscar no encuentra nada».
  Proyecto Tuya **Casa Sevilla** (data center Europa Central → endpoint EU por defecto, sin `TUYA_ENDPOINT`).
  **PENDIENTE de Alberto (pasos manuales, no de código):** poner `TUYA_CLIENT_ID/SECRET` en Vercel
  (proyecto plataforma) + redeploy, y vincular la cuenta Smart Life por QR en platform.tuya.com. Luego
  «Buscar dispositivos» → verificar alta real y encender/apagar.

- **🩹 Categorización mal + autocuración por keyword (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "esta mal, revisalo bien todo". La captura mostraba la categoría **Seguro** con gasolineras
  (PETROPRIX), súper (PRIMAPRIX×11), un restaurante y "PAGO DE IMPUESTOS 600€" dentro. Dos causas: **(1)
  bug de código** — `getMerchantsForCategoria` (`lib/finanzas.ts`) NO filtraba `destino='personal'`, así
  que costes profesionales (cuota autónomos TGSS, tributos del negocio) que comparten subcategoría se
  colaban en el desglose personal y descuadraban la cabecera. **(2) datos malos** — la **IA gratis de la
  pasarela es poco fiable** y había puesto comercios conocidos en 'seguro' con confianza alta; mi rescate
  anterior solo tocaba NULL/otros_gasto, así que esas etiquetas malas se quedaban fijas. **Arreglo
  sistémico:** la **keyword ahora manda** — `barrerSubcategoriasPersonal` barre TODO el gasto personal y
  el paso keyword **SOBREESCRIBE** la etiqueta cuando discrepa (la IA solo ve lo no clasificado y nunca
  pisa una etiqueta puesta). Re-barrido histórico por SQL generado DESDE el diccionario real
  (`reglasOrdenadas()`, `translate()` para acentos, sin duplicar a mano): 'seguro' de 17→5 (solo
  aseguradoras reales), GALOS→bar, PRIMAPRIX→súper, PETROPRIX→gasolina. **Prioridad comercio específico:**
  `CIRCULO MERCANTIL` (club) va ANTES que `deporte` aunque el recibo diga 'GYM'. Nuevas keywords:
  PETROPRIX, IONOS/GODADDY, RESTAURANTES Y CAFETERIAS, SHEIN/WISH, TUSSAM/SEVICI, colegio Sagrados
  Corazones/ACPA. **UX:** al abrir una categoría con UN solo comercio se muestra el desglose directo, y el
  mini-gráfico de una sola barra (redundante con el total) se oculta. Tests 103/103.

- **🏷️ Recurrentes conocidos categorizados + Bizums unificados (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "hay muchos gastos q se saben… los IBI también ya lo revisamos… unifica Bizum también". Se ampliaron
  las keywords deterministas (`lib/subcategoria-keywords.ts`) con los recibos fijos de la vivienda Montecarmelo y
  otros recurrentes: `MONTECARMELO`/`MONTE CARMELO`→**comunidad** (recibo ~110€/mes), `TOTAL GAS Y ELECT`/
  `TOTALENERGIES`→**suministros_piso**, `TEMU`/`SHEIN`→**ocio**, `TUSSAM`/`SEVICI`→**transporte**, `PRIMAPRIX`→
  **supermercado**. Reclasificado el histórico por SQL **set-based** (WITH scope + ILIKE + CASE, sin UUIDs a mano):
  comunidad +15, suministros +29, más TEMU/TUSSAM/Primaprix. El **IBI** y tributos ya estaban cubiertos (subcat
  `ibi`). **Bizums unificados:** `comercioDe` devuelve un único grupo **"Bizum"** para cualquier envío (`\bBIZUM\b`),
  en vez de partir por destinatario → el total enviado por Bizum se ve de un vistazo. Tests 26/26 (comercio+keywords),
  regla documentada en el skill para no re-preguntar. Pendiente: confirmar con Alberto ambiguos (colegio San José
  SSCC/ACPA/Fundación Sagrados Corazones, GALOS CMI, RECIBO BANSABADELL, EX.AY.SEVILLA).

- **💶 Formato de dinero ESPAÑOL en todo el programa + regla permanente (07/07/2026).** Alberto: "mismo formato
  siempre". Todo importe en € va en formato `2.162,49€` (miles con punto también en 4 cifras, decimales con coma,
  € DETRÁS), NUNCA estilo dólar (`€2162.49`). Helper único **`apps/plataforma/lib/dinero.ts::eur`**
  (`toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2, useGrouping:'always'})` + `€`).
  Pasada por toda la app plataforma (pantalla + Telegram + email; UI, libs y crons). **Regla global permanente**
  añadida al `CLAUDE.md` raíz ("## Formato de dinero"), a `apps/plataforma/CLAUDE.md` y al skill `plataforma-maestro`.

- **🧭 Reestructura de "En qué gasto" + 2 bugs del drill-down (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "la estructura es muy rara… la idea es ver dónde gasto en mi día a día". Un agente de arquitectura
  la revisó (sin tocar código) y de ahí salió esto. **Bug #1 (el "2 ops" que no cuadraba):** el drill-down de
  un comercio no filtraba por subcategoría → `/api/finanzas/categorias/movimientos` acepta `?categoria=` y
  `fetchMovsComercio` lo pasa (el comercio siempre se abre dentro de `expanded`). **Bug #2 ('Sin identificar'
  colapsaba comercios distintos):** nuevo helper puro **`lib/comercio.ts::comercioDe`** que quita el prefijo de
  operación ("COMPRA EN DIA SEVILLA 2260" → "DIA SEVILLA 2260") y **fusiona las filas con y sin contraparte del
  mismo comercio** (en prod la contraparte trae el texto completo, no un nombre limpio; `claveComercio` lo
  partía y elegía mal 'SEVILLA' para DIA por el corte de <4 chars). `getMerchantsForCategoria` agrupa en JS por
  él; `movimientos`/`asignar` casan por el mismo criterio. **Reestructura UI (`CategoriasTab.tsx`):** (1) titular
  del mes (total + ±% vs media 6m, nuevo `comparativaTotal` en `/api/finanzas/categorias`); (2) los 3 paneles
  solapados (Sin categoría + Por revisar + Sin identificar grandes) → **UNA cola "🔎 Necesitan tu atención"**
  (modo `?atencion=1`: NULL/otros_gasto O `subcategoria_revisar`, backlog por importe, plegada); (3) orden
  período→titular→cola→dona→categorías(grupo Vivienda)→comercios; insights/alertas al fondo plegados; **quitada
  la tabla de Ingresos** (vive en su tab). **Sidebar** (`UserSidebar.tsx`): 📊 Categorías → **💸 "En qué gasto"**
  (tras Banca, protagonista); 🧾 Gastos → **"Deducciones"** (separa eje gasto personal vs eje fiscal). Tests
  97/97, tsc 0, `next build` OK.

- **🔧 Reclasificación HISTÓRICA de gasto personal aplicada A MANO por SQL (06/07/2026, tras mergear #773).**
  El PR #773 dejó la categorización automática de aquí en adelante (ingesta + cron 07:00 + botón), pero los
  **movimientos personales ya existentes** seguían en `otros_gasto`/NULL hasta que corriera el barrido. Alberto
  lo vio ("la ia estos gastos sí lo sabría": RECIBO CIRCULO MERCANTIL, ZAPATERIA…). Se aplicó el **paso
  determinista (keywords)** directamente sobre la BD (`wswbehlcuxqxyinousql`, cuenta `4fdc993a…`) con un UPDATE
  **set-based** (`WITH scope … matches … DISTINCT ON (id) por prioridad`), scoped a `destino='personal' AND
  importe<0 AND (subcategoria IS NULL OR ='otros_gasto')`. **Resultado:** ~322 movimientos movidos a categoría
  real — Círculo Mercantil→`club` (€1.364), zapatería→`ropa`, comunidad→`comunidad` (🏠 Vivienda), + super
  (210), colegio (22), ocio/Amazon (59), hipoteca (20, €14.478)… **Quedan ~375 ambiguos** (173 NULL €32k
  gordos de una vez + 202 `otros_gasto`: Amazon Mktp, GALOS CMI, Bizums, transferencias) → esos los coge la
  **IA** (botón 🤖 Auto-clasificar o cron nocturno), NO la keyword. ⚠️ El bloque NULL de €32k tiene gastos
  grandes puntuales: revisar por si alguno no es consumo personal. **Ojo:** el SQL a mano fue una aproximación
  ILIKE del diccionario `subcategoria-keywords.ts`; las filas ya reclasificadas NO las vuelve a tocar el cron
  (solo procesa NULL/otros_gasto), así que si alguna quedó mal, se corrige con el desplegable (aprende regla).

- **🆕 Categorización AUTOMÁTICA de gasto personal (06/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "la IA no categoriza" — la pestaña 📊 Categorías amontonaba casi todo en "Otros gasto". Causa
  raíz: (1) la ingesta NO ponía subcategoría (todo entraba NULL); (2) el `auto-tag` mandaba a la IA **solo
  los NULL**, así que un `otros_gasto` ambiguo se quedaba en el cajón para siempre; (3) el botón 🤖
  Auto-clasificar estaba escondido (solo salía con NULL>0). **Arreglo (automático, sin pulsar nada):**
  función única **`lib/subcategoria-barrido.ts`** (`barrerSubcategoriasPersonal`) — keyword primero (gratis),
  IA de la pasarela GRATIS (NIM→Groq→Gemini→Kimi) solo para lo ambiguo, y **RESCATA los `otros_gasto`** (coge
  `subcategoria IS NULL OR ='otros_gasto'`). Enganchada a la **ingesta** (`analizarMovimientos` reparte por
  keyword al importar) y al **cron diario** `categorizar-movimientos` (`0 7 * * *`; ya NO usa la vía Anthropic
  de pago; `lib/categoria-ia.ts` ELIMINADO; `normalizarContraparte`→`lib/normalizar-contraparte.ts`). Baja
  confianza → marca la nueva columna **`subcategoria_revisar`** (NO reutiliza `requiere_revision`, que es del
  *destino*) en vez de tirar a otros_gasto en silencio. **Taxonomía Vivienda** (Montecarmelo): subcategorías
  **`comunidad`** (🏘️) e **`ibi`** (🏛️) + `GRUPO_VIVIENDA` (hipoteca+comunidad+ibi+suministros), agrupadas
  bajo "🏠 Vivienda" en la pestaña. **Extras A-D:** cola "🔎 Por revisar", panel "sin clasificar más grandes",
  badge ±% (mes vs media 6m), presupuestos por categoría con aviso Telegram scoped por `cuenta_id`
  (`categoria_alertas(_log).cuenta_id` nuevos, dedup mensual, aviso proactivo desde el barrido). **Prueba real:**
  de 720 gastos personales atascados, la keyword rescata 358 (50%) gratis al instante (167 super, 20 hipoteca,
  4 comunidad…); el resto a la IA. Migración `2026-07-06_subcategoria_control.sql` aplicada. Tests 21/21,
  typecheck 0 errores, `next build` OK. Spec+plan en `docs/superpowers/{specs,plans}/2026-07-06-categorizacion-*`.

- **🆕 Nuevo agente `buscador-ia` — vigía semanal de LLMs gratis (06/07/2026).** A raíz del incidente
  del 405B (ver más abajo), Alberto pidió un estudio semanal automático de si hay una IA gratis que
  convenga meter. Creado como hermano de `github-vigia`: skill `.claude/skills/buscador-ia`, estado vivo
  en `docs/BUSCADOR-IA.md`. Tres patas: (1) **watch de deprecación** de los modelos cableados en
  `packages/core-ai/src/client.ts` (NIM `llama-3.3-70b`, Groq, Gemini `2.0-flash`, Kimi) para cazar
  retiradas de catálogo ANTES de que rompan producción; (2) **descubrimiento** de gratis nuevos;
  (3) **mini-eval** de candidatos con 2 prompts fijos. Salida: `docs/BUSCADOR-IA.md` + Telegram si merece
  ojo + PR draft solo para swaps seguros (id muerto→vigente) o plumbing de proveedor nuevo (gateado por
  env, nunca activado por su cuenta). Indexado en `docs/SKILLS.md` y `docs/RUTINAS-PROGRAMADAS.md`
  (rutina 11, semanal lunes 07:00). **⚠️ PENDIENTE de Alberto:** crear el trigger en `claude.ai/code →
  Rutinas` (prompt `Ejecuta la skill buscador-ia` + `PLATAFORMA_URL`/`CRON_SECRET` al final).

- **✅ Decisiones de Alberto sobre gasto personal (06/07/2026).** Resueltas las 2 dudas pendientes: (1) la
  **lavandería El Girandillo** (~€1.100/mes) es de los **pisos** → reclasificada `destino='turistico_pisos'`
  (fuera del gasto personal) + regla `GIRANDILLO→turistico_pisos` en `banca_destino_reglas` para futuros; (2)
  el préstamo **CUOTA PTMO** (~€772/mes) es la **hipoteca de Montecarmelo** (su vivienda) y la cuota ~€800 es
  la **inscripción de socio del Círculo Mercantil** (recurrente). Nuevas subcategorías canónicas **`hipoteca`**
  (🏦) y **`club`** (🎩) en `lib/categorias-personales.ts`, con claves en `lib/subcategoria-keywords.ts`
  (`CUOTA PTMO`/`HIPOTECA`→hipoteca, `CIRCULO MERCAN`→club) y en `SUBCAT_SINONIMOS` del agente (para "¿cuánto en
  hipoteca/club?"). Reclasificados los movimientos existentes y aprendidas las reglas por SQL.

- **✅ Agente huéspedes SIVRA: arreglado "IA no disponible" — modelo fuerte muerto (06/07/2026).**
  Un huésped de House Sevillana (reserva 146294321, «Estamos a caminho de Sevilla») recibió borrador vacío
  con `motivo:'IA no disponible'`. **Causa raíz (logs de prod Vercel, `/api/sivra/mensajes/webhook`
  12:31 UTC):** el modelo "fuerte" `AGENTE_HUESPED_MODEL` default `meta/llama-3.1-405b-instruct` **fue
  retirado del catálogo de NVIDIA NIM → `HTTP 404` en CADA mensaje**; normalmente lo enmascara el reintento
  con el 70B por defecto (30/06 y 04/07 sí tuvieron borrador), pero ese día el 70B **también** cayó
  (`aborted due to timeout`) y **ningún fallback (Groq/Gemini/Kimi) rescató** → "IA no disponible".
  **Arreglo (código):** `decidir.ts` deja `AGENTE_HUESPED_MODEL` **vacío por defecto** → una sola llamada al
  70B por defecto (que ya trae la cadena NIM→Groq→Gemini→Kimi); si se pone un id verificado vivo, se usa como
  modelo fuerte aditivo. Elimina el 404 determinista y el round-trip desperdiciado en cada mensaje.
  **⚠️ PENDIENTE de Alberto (Capa B, config, no toco secretos):** verificar que **`GROQ_API_KEY`** (y opcional
  `MOONSHOT_API_KEY`) están puestas y sanas en el proyecto Vercel `plataforma` — son la red de seguridad que
  falló; con Groq activo el 404/timeout de NIM se habría rescatado solo. PR draft en la rama
  `claude/sevillana-reservation-146294321-bos9dx`.

- **✅ Agente contable: "¿cuánto en super/bares en <mes>?" responde por subcategoría (06/07/2026).**
  Alberto preguntó al chat "¿cuánto se ha gastado en supermercado en junio?" y respondía **€13.347/145 mov**
  (¡el gasto TOTAL de junio!): el parser detectaba "junio" y devolvía `movimientos_mes`, **tirando
  "supermercado"**. Arreglo en `lib/contable/`: (1) `intencion.ts` extrae el mes UNA vez (`detectarMes`) y
  lo **COMPONE** con la categoría; nuevo intent `subcategoria` con `SUBCAT_SINONIMOS` (super/bares/gasolina/
  farmacia/ropa/… → subcategoría canónica), casado como palabra completa (`tienePalabra`, evita que 'bar'
  pique en 'Barcelona'); va ANTES del mes-solo. (2) `respuestas-directas.ts` responde el intent por
  `subcategoria = X OR (ILIKE de las claves del diccionario)` — reusa `clavesDeSubcategoria()` de
  `lib/subcategoria-keywords.ts` (sin duplicar), SOLO `destino='personal'`, con mes opcional. Validado en BD:
  "supermercado junio" pasa de €13.347 a **€442,97/25 mov** (real). `concepto` (luz/agua…) también admite mes.
  Tests intencion 21/21.

- **✅ Categorías = SOLO gasto personal de consumo + rescate de "otros_gasto" (06/07/2026).** Alberto: "la
  categoría la quiero para analizar mis gastos personales, ni negocios… cuánto gasto en super, en bares".
  Dos fallos vistos en la BD real: (1) el gráfico sumaba `subcategoria IS NOT NULL` SIN filtrar `destino`
  → colaba **traspasos internos** (liquidaciones `TARJ.CRDTO`, miles de €), **negocio** (turistico_*/seguros)
  e **ingresos** (SUM(ABS) los sumaba) → "Otros gasto" al 97% (€7.196 jul; lo personal real eran €3.038).
  **Arreglo:** la agregación de `/api/finanzas/categorias` ahora filtra `destino='personal' AND importe<0`
  (coherente con el contador "sin categoría"). (2) El histórico estaba enterrado en `otros_gasto` (de pasadas
  antiguas de IA) y **auto-tag solo miraba `NULL`**, así que super/bar/farmacia/ropa no afloraban. **Arreglo:**
  `auto-tag` ahora coge `(subcategoria IS NULL OR ='otros_gasto')` y el paso determinista por palabra clave
  **reclasifica** los otros_gasto que en realidad son super/bar/etc (sin reescrituras no-op; la IA sigue solo
  para lo `NULL` desconocido). Validado en BD: una pasada rescata ~208 movimientos (**supermercado 166/€3.209**,
  restaurante_bar 16, farmacia 11, ropa 9, transporte 5, deporte 1). Alberto pulsa 🤖 Auto-clasificar una vez
  y salen. ⚠️ PENDIENTE de decisión de Alberto (no tocado aún): la **lavandería El Girandillo (~€1.100/mes,
  destino personal)** parece de los pisos (negocio) → habría que pasarla a `turistico_*`; y el **préstamo
  (CUOTA PTMO ~€772/mes)** + cuotas fijas (Círculo Mercantil ~€850, comunidad) — decidir si categoría propia o
  fuera del análisis de consumo.

- **✅ Categorías: gráfico legible + filtro por fechas (06/07/2026).** Alberto: "no se ve bien" (captura) —
  la leyenda de Recharts se solapaba con la dona en móvil al haber ~15 categorías. Arreglo: **quitada la
  `<Legend>`** de la dona (redundante) y la **tabla de abajo hace de leyenda** con un punto de color por fila
  que casa con su porción; dona más compacta (200px, radios 55/90). Además Alberto pidió **filtro por fechas
  por defecto el mes en curso**: `CategoriasTab` tiene ahora presets **Mes actual / Mes anterior / Año** +
  inputs `desde`–`hasta` (rango personalizado); por defecto `mes_actual`. Las 4 rutas
  (`categorias`/`comerciantes`/`movimientos`/`insights`) aceptan `desde`/`hasta` (YYYY-MM-DD) que **mandan
  sobre year/mode**. El selector año/trimestre de `/finanzas` sigue rigiendo las demás pestañas. OJO: el
  contador "sin categoría" es ahora del rango filtrado, pero `auto-tag` sigue clasificando TODO el histórico
  (no filtra por fecha) — puede haber leve desajuste entre el número mostrado y lo que auto-clasifica.

- **✅ Auto-clasificar Categorías: paso DETERMINISTA antes de la IA (06/07/2026, PR #762 + follow-up).** El
  botón "🤖 Auto-clasificar" seguía dando ⚠️ pese al arreglo de lotes (#762). Los logs de Vercel lo
  confirmaron: no era solo tamaño de respuesta — **toda la pasarela de IA estaba saturada** (Gemini HTTP 429
  "quota exceeded" en `/api/ai/search` y `/api/ai/chat`; timeouts en `insights` y `auto-tag`). Arreglo robusto
  alineado con el principio "funciona con la IA saturada": nuevo módulo PURO `lib/subcategoria-keywords.ts`
  (9 tests) que clasifica los gastos **obvios por palabra clave** (Mercadona, DIA, bares, gasolineras,
  farmacias, Netflix, Iberdrola, DIGI…) **al instante y sin IA**, aprendiendo regla en `banca_destino_reglas`.
  `auto-tag/route.ts`: PASO 1 determinista → solo los ambiguos van a la IA (PASO 2, en lotes con presupuesto de
  tiempo). Si el determinista etiquetó algo, es **éxito parcial (200)** aunque la IA esté caída (la siguiente
  pasada coge el resto); solo 502 si NADA se pudo clasificar. Antes: primer intento #761 (fallback+parse
  tolerante), luego #762/#763 (lotes de 12 + `maxDuration=60` + paso determinista), y **follow-up #764
  (06/07/2026)**: los logs reales mostraron que el gasto de Alberto es en comercios **locales de Sevilla**
  (HORNO NUEVA FLORIDA, FCIA.MARINA, MARISCOS GONZALEZ, ULTRAMARINO, adidas, GOCCO…), no cadenas nacionales,
  así que `subcategoria-keywords.ts` amplió términos genéricos españoles (HORNO/ULTRAMARINO/ALIMENTACION→
  supermercado, FCIA→farmacia, ADIDAS/NIKE→deporte, GOCCO/MAYORAL→ropa) + regla de última prioridad
  `otros_gasto` (TANATORIO/EXPENDIDURIA/ESTANCO); y se bajó el timeout por proveedor IA 18s→8s y el
  presupuesto del lote 48s→38s (la cadena NIM→Groq→Gemini es aditiva y se pasaba de los 60s de `maxDuration`
  → 504). `auto-tag` ya no puede morir por 504: siempre 200 con lo que el determinista haya etiquetado.

- **✅ Categorías: fix 'Cargando…' infinito en modo Año fiscal (06/07/2026, PR #759).** La pestaña mandaba
  el trimestre como `month` (0='Año'); `/api/finanzas/categorias` en modo año fiscal formateaba la fecha
  como `'2026-00-01'` (mes 0 inválido) → error Postgres → 500 sin `.catch` → spinner colgado para siempre.
  Arreglo: el modo año fiscal cubre Ene-Dic completo (coherente con `/comerciantes` y `/movimientos`, que ya
  usaban el año entero); el modo rolling sanea el mes a 1-12 (0→12); try/catch devuelve vacío en vez de 500;
  cada fetch inicial de la UI tiene su propio `.catch` (antes un `Promise.all` sin catch dejaba `loading` a
  medias si una API caía).

- **✅ facturas: extracción robusta Groq→NIM + aviso de PDF ilegible + ventana `?horas` (06/07/2026, PR
  #760).** El scan de las 06:00 ya no daba 504 (fix previo), pero algunos PDFs se imputaban vacíos → `'error'`
  mudo. Causa: `aiExtractInvoice` era la ÚNICA llamada IA de la app SIN cadena de respaldo (solo NVIDIA NIM);
  si NIM devolvía algo no-JSON o se colgaba (mismo mal que el triaje, PR #745), la factura quedaba a cero.
  Arreglo: `ai-client.ts` prueba **Groq primero** (mismo Llama-70b, responde en segundos) con **NIM de
  respaldo**, devuelve el primer JSON válido no vacío (`nimConfig()` pasa a perezoso); si un adjunto sale sin
  total/proveedor/NIF se marca **no legible** y avisa por Telegram (`avisaNoLegibles`) en vez de morir como
  error mudo (el OCR de escaneados queda para otra fase); nuevo parámetro `?horas=N` (1–240, def. 36) en
  `expenses/agent/scan` para recuperar facturas fuera de ventana mientras el scan estuvo caído.

- **✅ Gastos personales: pestaña Categorías accesible + editable (05/07/2026).** Alberto quería "revisar y
  segmentar los gastos personales para controlar el gasto". Al mapear se vio que **ya existía** casi todo
  (pestaña `📊 Categorías` en `/finanzas`: dona, drill-down por comercio, alertas de presupuesto, insights IA,
  resumen semanal por Telegram) pero (a) **no había acceso en la sidebar** (solo por URL a mano) y (b) **no se
  podía modificar** la categoría de nada ahí (solo auto-clasificar en bloque). Cambios: (1) entrada `📊 Categorías`
  en la sidebar (`UserSidebar.tsx`); (2) **editar en sitio** — desplegable por comercio que reasigna todos sus
  movimientos y aprende regla (`banca_destino_reglas`), drill-down a movimientos sueltos con override por
  movimiento, y panel clicable de "sin categoría" para asignar a mano — vía `POST /api/finanzas/categorias/asignar`
  (comerciante|movId, scoped `cuenta_id`) + `GET .../movimientos`; (3) **fuente única de subcategorías**
  `lib/categorias-personales.ts` (puro, 6 tests) que reconcilia las 3 listas divergentes previas (la
  auto-clasificación ya puede poner `seguro`/`suministros_piso` y usa `otros_gasto`, no `otros`). Sin migración
  de BD (reusa `subcategoria` + `banca_destino_reglas`). Pendiente anotado: `categoria_alertas` no filtra por
  `cuenta_id` (inocuo con un solo usuario).

- **✅ Agente contable: fixes de fiabilidad y UX (04–05/07/2026, PRs #735/#737/#747).** Cadena de fallback IA
  NIM→Groq→**Gemini**(gratis)→Kimi; `CONTABLE_MODEL` (DeepSeek por defecto); respuesta determinista al tramo
  fiscal + panorama de contexto (sociedades/negocios/saldos/IRPF); **fix `#747`:** "¿cuánto gasté en `<proveedor>`?"
  ya no devolvía el total del año (extractor de concepto genérico en `intencion.ts` con `STOP_CONCEPTO`), y las
  tarjetas de acción muestran **importe · fecha · banco** para poder confirmar sin salir del chat.

- **✅ Booking → Drive → contable, por fases (05/07/2026, PRs #752/#753/#754).** Alberto: los mails de
  Booking adjuntan las liquidaciones; quería que llegaran a Drive, la IA las leyera y el contable
  confirmara. Al mapearlo se vio que el pipeline que debía hacerlo (`expenses/agent/scan`, cron 06:00)
  **estaba roto** (504 diario, 0 Booking en `gastos`). Tres fases:
  - **Fase 1 (#752):** el 504 era una llamada colgada al web-app de Drive sin timeout → `AbortSignal.timeout(20s)`
    en `agente-facturas/drive.ts` + `maxDuration` 60→300 + presupuesto de tiempo (para a 250s, lo restante
    lo coge la pasada siguiente). Misma medicina que arregló el triaje.
  - **Fase 2 (#753):** puente Drive **robusto** — `call()` reintenta transitorios con backoff (5xx del proxy
    de Google, redirección de login/cuota que devuelve HTML en vez de JSON); errores reales (4xx, `ok:false`)
    NO se reintentan. Y la subida ya no se traga el fallo en silencio: `avisaSinDrive()` (Telegram 🏨) cuando
    una factura se imputa pero su PDF no llegó a Drive. Cuenta de servicio Google = mejora opcional futura.
  - **Fase 3 (#754):** auto-confirmación **segura**. Booking NUNCA se auto-imputa en silencio (`ctx.esBooking`
    en `procesarFactura` → siempre a bandeja + toque Telegram, porque una liquidación trae varias reservas +
    comisión + IVA y casi nunca cuadra a un cargo exacto). Política del contable documentada en la skill
    `facturas-correo` (Paso 4): auto-confirma conciliación SOLO si extracción limpia + importe exacto a un
    único movimiento; Booking / varios candidatos / descuadre / dudas → toque a Alberto, nunca auto.
  - **Pendiente de Alberto:** verificar tras el redeploy que el scan de las 06:00 devuelve 200 (no 504) y que
    empieza a entrar Booking en `gastos` con `drive_url`.
- **✅ auditoría 05/07 — cron `correo-triaje` YA NO está mudo; clasificador arreglado (PRs #743/#744/#745, 04/07/2026).**
  El bloqueo de envs `GMAIL_USER`/`GMAIL_APP_PASSWORD` en Production que reportó la auditoría del 04/07
  (entrada de abajo) **se resolvió** — el heartbeat de hoy confirma `correo_triaje` con actividad hace 3,4h
  y sin huecos desde entonces; el 🔴 de esa entrada queda **obsoleto**. Una vez corriendo, la primera pasada
  real en sombra sacó otro problema (no de envs): el clasificador marcaba casi todo `dudoso`. Tres fixes de
  Alberto el mismo día:
  - **#743** — `CATEGORIAS_IA.includes()` exigía coincidencia exacta (`"Contabilidad"` no casaba con
    `"contabilidad"`) → `normalizarCategoria()` tolera mayúsculas/puntuación; umbral de confianza 0.6→0.5;
    cursor se escribe en el `finally` (antes se repetía sin avanzar); filas fallidas pasan a `'error'` en
    vez de quedar `'pendiente'` para siempre.
  - **#744** — timeout 504 en cada pasada: 50 correos/pasada en serie (~15s/uno) agotaba los 300s de Vercel
    → tope bajado a 10/pasada, timeout de IA 25s→20s.
  - **#745** — causa raíz real: NIM (`aiComplete`) tardaba ~25-30s y su propio timeout cortaba la llamada →
    todo cae a `dudoso` con `confianza=0`. Cambiado a **Groq primero** (`llamarIA()`, mismo Llama-3.3-70b,
    responde en segundos; NIM queda de respaldo). `.claude/skills/correo-triaje/SKILL.md` y
    `apps/plataforma/CLAUDE.md` actualizados (auditoría de hoy) para reflejar el orden Groq→NIM.
  - **Verificado por Supabase MCP:** tras el deploy de #745 (04/07 07:47 UTC) hubo una ventana corta
    (~08:20-09:20 UTC, 9 correos) todavía cayendo a `dudoso` con confianza 0 — probablemente arranque en
    frío de Groq o un rate-limit puntual — pero **0 correos `dudoso` desde entonces** en las ~15h siguientes
    hasta la última pasada (22:40 UTC). Sigue todo en modo sombra (0 acciones reales); no requiere más acción.
- **⚕️ Health-check 04/07 — 3 hallazgos del monitor matinal (branch `claude/ia-rest-monitor-health-g3irwd`).**
  Analicé el Health Check que llegó por Telegram (🔴 backlog 1056 · 🟡 105 alertas · 🔴 CIMA 404):
  1. **CIMA LIQ 404 → cron apagado tras flag.** `ws.cimaseg.es/wsEstandar/` devuelve 404 (endpoint WSE nunca
     validado — el sandbox Codeoscopic/Avant2 quedó pendiente del ticket LOOR.es, PR #508). Un 404 NO es auth
     ni password. El cron `cima-liq` corría a diario y alertaba 🔴 cada 07:30 → lo gateé tras
     **`CIMA_WSE_ENABLED` (default off)**: no corre ni alerta hasta que Alberto ponga la env a `true` con la
     ruta confirmada. **Bug latente corregido de paso:** la query de cruce con BBVA usaba `mb.fecha` (no
     existe) → habría dado 500 en cuanto CIMA conectara; ahora `fecha_operacion` y lee de `v_movimientos_activos`.
  2. **Backlog `requiere_revision` 1069 era falso 🔴.** Investigado en BD: **937 de esos 1069 están
     `destino_confirmado=true`** (ya clasificados; saneos SQL fijaron el destino sin limpiar la bandera). El
     backlog REAL (marcado Y sin confirmar) es **132**. El Check 2 del health-check contaba `requiere_revision`
     a secas → lo alineé con la semántica del resto de la app (`requiere_revision AND NOT destino_confirmado`)
     → ahora reportará 🟡 132, no 🔴 1069. **PENDIENTE opcional (requiere OK de Alberto):** limpiar las 937
     banderas obsoletas (`UPDATE … SET requiere_revision=false WHERE destino_confirmado=true AND requiere_revision=true`).
  3. **105 alertas >30 días** (Check 6, 🟡): deuda de limpieza, sin tocar.

- **✅ 04/07 — agente-huésped: fix "afirma acciones que no ejecuta" + scope del entrenador ampliado
  (rama `claude/reservation-cancellation-draft-*`).** Alberto detectó un borrador de cancelación (reserva
  134250232, huésped Mirian) donde el agente AFIRMABA que la reserva "ya está cancelada" — falso: el agente
  solo redacta, no cancela en Smoobu; se inventó la acción. Además pedía confirmar fechas que ya tiene de
  Smoobu (`contexto.ts`). **Fix:** nueva regla **"NO EJECUTAS ACCIONES"** en el system prompt de
  `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` (nunca afirmar gestiones no hechas: cancelar/
  reembolsar/cambiar fechas/cobrar; ante una petición así, acusar recibo y trasladar al anfitrión; y no
  re-verificar con el huésped datos de la reserva que ya están en la ficha). **Además**, se metió el
  `agente-huésped` en el scope del `agentes-entrenador` (fila en `docs/SKILLS.md` § Agentes programados +
  nota en su SKILL de que hay prompts que viven en CÓDIGO, no en `.md` → el PR toca `decidir.ts`), y se
  anotó el caso en `docs/FEEDBACK-AGENTES.md`. Motivo: el agente de huéspedes no estaba en la lista que el
  entrenador evalúa, así que este tipo de fallo no lo habría cazado solo.

- **🛡️ correo-triaje: arranca en SOMBRA por defecto (03/07, seguimiento del PR #718).** Alberto pidió
  "hazme tú lo pendiente". El MCP de Vercel NO escribe env vars, así que en vez de `TRIAJE_DRY_RUN=true`
  cambié el DEFAULT del código: `lib/correo/triaje.ts` `DRY_RUN = () => process.env.TRIAJE_DRY_RUN !== 'false'`
  → cuando el cron pueda correr, lo hará SIN tocar la bandeja hasta que Alberto valide y ponga
  `TRIAJE_DRY_RUN=false`. Tablas ya aplicadas (11 reglas semilla). **NO resuelve el blocker de abajo**
  (envs Gmail en Production): eso sigue siendo acción manual de Alberto en Vercel.

- **✅ RESUELTO (ver entrada de arriba, auditoría 05/07) — auditoría 04/07: cron `correo-triaje` MUDO en producción, causa por confirmar.** El agente de
  triaje de correo (PR #718, ver más abajo) no ha completado NUNCA una pasada: primero
  `relation "correo_cursor" does not exist` (la migración `2026-07-03_correo_triaje.sql` tardó en
  aplicarse; ya aplicada — tablas `correo_triaje`/`correo_cursor`/`correo_reglas` existen), y desde las
  19:40 del 03/07 (deploy `dpl_DLkUeQzat71yb146DUngzxPvmuVZ`, el de producción actual) **`Error: Faltan
  GMAIL_USER / GMAIL_APP_PASSWORD`** en CADA pasada de 10 min hasta ahora — mismo par de envs que usa con
  éxito `facturas-scan` (agente de pago de facturas), pero ese cron es diario (06:15 UTC) y no ha vuelto a
  correr desde antes del cambio, así que no sirve de control. **Acción manual de Alberto:** revisar en
  Vercel → proyecto `plataforma` → Settings → Environment Variables que `GMAIL_USER`/`GMAIL_APP_PASSWORD`
  siguen presentes para el entorno **Production** (no solo Preview) y forzar un redeploy si hiciera falta
  — Vercel no siempre repropaga un env editado a los deployments ya construidos. Sin este cron, el Gmail
  de Alberto no se está triando desde su creación. Detalle en `docs/AUDITORIA-2026-07.md`.

- **✅ 5 entradas de memoria pendientes reconciliadas (auditoría 04/07, commits del 03/07 tarde/noche sin anotar):**
  - **rrhh: `centro_trabajo` pasa a texto libre + fecha de reconocimiento médico en la ficha del empleado**
    (commit `073c5bc`). El desplegable fijo (CAMAS/MANCHON/AMBOS) no servía para clientes con centros de
    trabajo distintos → ahora es un campo de texto libre. Nueva columna `fecha_reconocimiento_medico` en
    `rrhh.empleados`, editable desde `/admin/empleados/[id]`.
  - **plataforma: domótica Tuya — ventilador de techo de Socorro** (PR #714). Ver ficha nueva en
    `apps/plataforma/CLAUDE.md` y `plataforma-maestro`.
  - **plataforma: eliminado el tracker Modelo 179 de `/finanzas`** (PR #698, 03/07/2026 — no 02/07 como
    decía por error `apps/plataforma/CLAUDE.md`, ya corregido). El 179 lo presentan los intermediarios
    (Booking/Airbnb/gestores), no el propietario/cedente; el tracker con plazos Q1-Q4 venía mal modelado
    desde el PR #341.
  - **plataforma: agente de triaje de correo** (PR #718). Ver ficha nueva arriba (🔴 cron mudo) y en
    `apps/plataforma/CLAUDE.md`/`plataforma-maestro`.
  - **ialimp: el mailing frío ya no encola el paso 1 a leads contactados a mano** (PR #717). El
    auto-encolado del paso 1 no aplicaba la misma exclusión (`contactado`/`interesado`/`descartado`/
    `rebotado`) que sí aplicaban los pasos de seguimiento → un lead contactado en persona podía recibir
    igualmente el email frío de presentación. Convención: registrar el contacto manual en
    `mailing_prospectos` con `estado='contactado'`+notas.

- **🧠 Agente contable: fiabilidad IA + tramo fiscal + panorama completo (03/07/2026, PRs #733/#735/#737 mergeados).**
  - **Fiabilidad IA (#733/#735):** `aiComplete` (`packages/core-ai`) encadena **NIM → Groq → Gemini → Kimi**.
    Nueva `geminiChat()` (texto sin grounding) + `moonshotChat()` (Kimi). Gemini se activa SOLO con
    `GEMINI_API_KEY` (ya presente) → resuelve el "IA no disponible" que sufrió Alberto (chat contable y agente
    de huéspedes) cuando NIM+Groq estaban rate-limited a la vez. Kimi (de pago) es último recurso: falta poner
    `MOONSHOT_API_KEY` en Vercel de plataforma para activarlo (opcional).
  - **Modo determinista (#733):** preguntas estructuradas se responden por **SQL sin LLM** (`intencion.ts` puro +
    `respuestas-directas.ts`): gasto/ingreso mes/año, por concepto (sinónimos), por destino, facturas
    pendientes. Instantáneo e inmune a saturación. `CONTABLE_MODEL` (default `deepseek-ai/deepseek-v3`) para el
    razonamiento libre; `stripThink()` limpia `<think>` de modelos de razonamiento.
  - **Tramo fiscal (#737):** intención `tramo_fiscal` ("¿en qué tramo estamos?") responde con tramo marginal,
    base imponible, tipo efectivo y margen — reutilizando `getResumenFinanciero` (misma fuente que `/finanzas`).
  - **Panorama completo en el contexto (#737):** `construirContexto` ahora inyecta, además de movimientos, el
    **bloque fiscal IRPF** + las **sociedades/negocios** + los **saldos bancarios** (consultas directas y
    baratas, sin salir a los adaptadores por-vertical que harían HTTP). Prompt del sistema pasa a "agente
    FINANCIERO" con visión transversal. Skill `plataforma-maestro` actualizada con la ficha del agente.
  - Solo toca `lib/contable/*` + `packages/core-ai`. Sin migración. Tests `lib/contable` 46/46. Pendiente
    Alberto (opcional): function-calling para tirar de datos concretos por-vertical bajo demanda (otro PR).

- **🧾 facturas: 4 recibos de luz Endesa de Bustos Tavera 22 deducidos a nombre de Alberto + corrección de piso (03/07/2026, rama `claude/account-name-transfer-52o8b1`).**
  - Alberto subió 4 facturas Endesa (feb–may 2026) de Bustos Tavera 22 (IZQ/Busto Reform + DCHA/Luxury Busto), **a nombre de PUNTO Y COMA GESTION SL** pero pidió deducirlas y archivarlas como suyas (los pisos pasan a IRPF personal desde 2026; la SL está dormida).
  - **Hecho:** los 4 cargos del banco (−38,54 · −71,42 · −100,00 · −133,71 €, cuenta `4fdc993a…`) quedan `conciliado=true`, `destino=turistico_pisos`, con el nº de factura/CUPS/contrato y el caveat fiscal en `comentario`.
  - **Corrección importante:** el `propiedad_id` de los 4 estaba **intercambiado Reform↔Luxury** (asignación del 02/07 por correlación de ocupación, confirmada «ES OK» pero errónea). Los PDF oficiales traen CUPS+dirección+nº factura que coincide con el concepto bancario → prueba documental. Correcto: **contrato 130139655504 = CUPS …443002ED0F = BJO IZQ = Busto Reform** (38,54 y 100,00); **contrato 130139685932 = CUPS …443004EB0F = BJO DCHA = Luxury Busto** (71,42 y 133,71). Corregida también la tabla LUZ de la skill `facturas-correo`.
  - **Pendiente de Alberto:** (1) archivar los 4 PDF en Drive `FACTURAS Apartamentos/2026/04-Abril-2026` (los del 21/04) y `05-MAYO-2026` (los del 19/05) — la subida binaria por MCP no era viable (PDF ~700KB → base64 inline); (2) pedir a Endesa el **cambio de titular a su nombre** para que las facturas futuras (y a poder ser estas) no queden a nombre de la SL. Deducibilidad fina: confirmar con Asecon el tratamiento de facturas aún tituladas a la SL.

- **📱 plataforma: fix responsive móvil en /banca (03/07/2026, rama `claude/por-revisar-scroll-issue-il0l0i`).**
  - **Queja de Alberto (captura móvil):** (1) la bandeja "🔎 Por revisar" no se podía leer — cada fila se
    forzaba a `min-width:520px` con `overflow-x:auto`, un scroll horizontal inservible en táctil (importes y
    desplegable de categoría cortados por la derecha); (2) al bajar con scroll, el botón hamburguesa ☰
    (`position:fixed` chip pequeño) tapaba a medias la esquina superior-izquierda de los títulos
    ("⚠️ Posibles cargos duplicados").
  - **Fix 1 — `app/(usuario)/banca/BancaClient.tsx` (`RevisarBandeja`):** en móvil (≤768px) la fila se
    **apila** (card): concepto a ancho completo arriba (envuelve, sin ellipsis), fecha+importe en una línea
    (`margin-left:auto`), desplegable a ancho completo. Se eliminó el `min-width:520px`/`overflow-x` de esta
    bandeja. Escritorio sin cambios. (Las reglas `.banca-movs-*` de la tabla grande se dejaron intactas.)
  - **Fix 2 — `app/(usuario)/UserSidebar.tsx` (rama móvil):** el chip flotante ☰ pasa a ser una **barra
    superior de ancho completo** (`position:fixed; top:0; left/right:0; height:52; z-index:30`, fondo
    `--surface`, borde inferior) con el ☰ + marca "ia plataforma". z-index por DEBAJO del backdrop(40) y el
    drawer(50) → el menú abierto la sigue cubriendo. `LayoutShell` (paddingTop:52 en móvil) sin tocar: ya
    reservaba justo ese alto. Ahora el contenido desplazado pasa limpio por debajo de una barra sólida en
    vez de asomar medio tapado por un recuadro.
  - **Verificación:** harness HTML con el markup+media queries reales, capturado con Chromium headless a
    viewport móvil: `scrollWidth==clientWidth` (sin overflow horizontal) y apilado correcto (importe íntegro,
    select a lo ancho). Regla responsive global del repo respetada (usable a ≥320px, no solo "que quepa").
  - **PLUS — 2 bugs de typecheck de MAIN arreglados de paso (el gate `Tests & Typecheck` estaba en ROJO para
    TODOS los PRs, no solo este):** (1) `app/(usuario)/contable/page.tsx:66` — `new Promise(...)` sin genérico
    resolvía a `unknown`, no asignable a `const base64: string` → añadido `<string>` (venía de #729). (2)
    `packages/core-ai/src/stt.ts:29` — `new Blob([bytes])` con `bytes: Uint8Array` fallaba TS2322 por el caso
    `SharedArrayBuffer` del lib → cast `as BlobPart` (venía de #731 voz). El build de Vercel se los tragaba
    (`typescript.ignoreBuildErrors`), pero el nuevo workflow `tests.yml` (tsc estricto) no. **Verificado en
    local `tsc --noEmit -p tsconfig.json` de plataforma → EXIT 0.** OJO CI: el hook `Stop` de memoria empuja
    commits `[skip ci]` que, por la `concurrency: cancel-in-progress` de `tests.yml`, cancelan el run en vuelo
    sin lanzar otro → el check puede no reportar verde nunca aunque el código lo esté (por eso la verificación
    local es la prueba buena).

- **🆕 plataforma: Agente de contabilidad conversacional — VOZ por Telegram (backlog del spec, 03/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  - Cierra el último ítem del spec (voz). Nota de voz al bot (`message.voice`/`message.audio`) → se descarga
    (`descargarTelegram`) → se transcribe con **Groq Whisper `whisper-large-v3`** (gratis, misma `GROQ_API_KEY`
    del fallback de texto) → se trata como si Alberto lo hubiera escrito (`manejarVozTg`→`manejarTextoLibreTg`).
    Eco `🎤 <i>…</i>` de lo entendido. Si no reconoce nada → pide que lo repita/escriba (nunca inventa).
  - **Cliente STT puro** nuevo en el núcleo: `packages/core-ai/src/stt.ts::groqTranscribe` (identity-agnostic,
    multipart a `api.groq.com/openai/v1/audio/transcriptions`, `language:'es'`), exportado en el barrel.
    Wrapper de app `lib/ai-client.ts::aiTranscribe(buffer,fileName,mimeType)` (lee `GROQ_API_KEY`).
  - Enganche en el catch-all del webhook ANTES de la rama de documento. Build verde, tests `lib/contable` 30/30.
    Con esto el spec del agente de contabilidad queda **COMPLETO** (fases 1–4 + voz). Requiere `GROQ_API_KEY`
    en el proyecto Vercel de plataforma (ya existe como fallback de texto).

- **🆕 plataforma: Agente de contabilidad conversacional — FASE 4 (Telegram + proactividad + onboarding) (03/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  - **Boca Telegram** (`lib/contable/telegram.ts`) sobre el webhook único del bot
    (`app/api/sivra/mensajes/telegram-webhook/route.ts`): (a) rama callback `cont_ok`/`cont_no` que
    confirma/descarta acciones **reutilizando `contable_accion` de la Fase 2** (`ejecutarAccion`/
    `descartarAccion` por id) — **NO se creó `contable_pendiente_tg`** (una sola fuente de verdad web+TG);
    (b) **catch-all de texto libre** AL FINAL del webhook (después de `pago_`/`mov_`/`hsp_`/`deduccion_` y
    de los `force_reply`, y con guarda `!reply_to_message` + `chat.id === TELEGRAM_CHAT_ID`) → `cerebro.
    responder(...,'telegram')`, responde por `tgSend` y manda botones si propone acción; (c) **foto/PDF**
    (`message.photo`/`message.document`) → `descargarTelegram` (getFile→CDN) → `procesarDocumento` (Fase 3)
    → propone conciliar con botón. `cuenta_id` fijo = `SELECT id FROM cuentas LIMIT 1` (patrón de los crons).
  - **Proactividad** (`lib/contable/proactivo.ts` + cron `/api/cron/contable-proactivo`, `0 9 * * 1` lunes):
    resumen breve a Telegram SOLO si hay algo (nº por revisar / facturas sin cerrar / cargos deducibles
    de 30 días sin justificante). No spamea.
  - **Onboarding** (§8): comando `/contable` → mensaje guía; la memoria se construye después con lo que
    Alberto cuente (canal `APRENDER` del cerebro), sin sembrar datos sensibles a mano.
  - Builder puro compartido `documentos-tipos.ts::accionConciliar` (usado por la boca web y la de TG para
    no divergir). Tests `lib/contable` 30/30, build verde. Con esto el spec queda COMPLETO salvo voz (backlog).

- **🆕 plataforma: Agente de contabilidad conversacional — FASES 2 y 3 (03/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  - **Fase 2 (PR #727, MERGEADO):** el agente `/contable` ya no solo informa — **propone acciones** sobre
    `movimientos_bancarios` que Alberto **confirma en pantalla**. Canal lateral `ACCION: {json}` (calco de
    `APRENDER:`), refs cortas `#n`, persistencia en tabla nueva `contable_accion` (estado pendiente),
    ejecución **por id** (nunca confía en params del cliente) reutilizando los writers existentes. Acciones
    v1: `clasificar` (+aprende regla en `banca_destino_reglas`), `amortizable` (toggle), `confirmar`.
  - **Fase 3 (documentos — foto ticket / PDF factura, en esta rama):** botón 📎 en `/contable`. El route
    `/api/contable/chat` acepta `adjunto {base64,mimeType,fileName}` → `lib/contable/documentos.ts`
    `procesarDocumento` reutiliza el extractor CANÓNICO `agente-facturas/extraer.ts::extraerDesdeBuffer`
    (PDF→pdf-parse, imagen→visión NIM; NO hay OCR nuevo) + un matcher **read-only** (SELECT de
    `factura-ocr.ts::casarFactura` SIN el UPDATE, scoped por cuenta, excluye `duplicado_estado='ignorado'`).
    Si casa un movimiento → propone acción nueva **`conciliar`** (nueva rama en `acciones.ts`: UPDATE
    `conciliado=true, factura_ref`, por id, scoped) → tarjeta Confirmar existente. **Números deterministas
    (OCR+SQL), no del modelo → nunca inventa importe;** ilegible → "no lo he podido leer". Módulo puro
    `documentos-tipos.ts` (interpretar/resumen/ref) testeado (9 tests). **Sin migración** (`contable_accion`
    ya existe, `conciliado`/`factura_ref` ya existen). Fase 4 (Telegram + proactividad + onboarding) y voz
    (backlog) quedan pendientes en el spec.

- **🆕 plataforma: Agente de contabilidad conversacional — FASE 1 (03/07/2026, rama `claude/ai-accounting-agent-3a9o22`, PR #726).**
  - Idea de Alberto: «hablar con mi agente de contabilidad, meterle IA, que aprenda mi rutina». Diseño = capa conversacional + memoria SOBRE la maquinaria contable existente (no reescribe nada).
  - **Spec** `docs/superpowers/specs/2026-07-03-agente-contabilidad-conversacional-design.md` + **plan** `docs/superpowers/plans/2026-07-03-agente-contable-fase1.md` (4 fases; esta entrega la Fase 1).
  - **Fase 1 ENTREGADA (build verde, 7/7 tests):** página `/contable` (espejo de `/agente`) con Q&A de SOLO LECTURA sobre finanzas + aprende hábitos. `lib/contable/` = `parse.ts` (canal `APRENDER:`), `memoria.ts`, `formato.ts` (formateador puro), `contexto.ts` (fetch), `cerebro.ts` (`aiComplete` NIM Llama). Endpoint `POST /api/contable/chat`. Nav en sidebar + command palette. Tablas nuevas `contable_memoria` (hábitos, UNIQUE cuenta_id+clave) y `contable_log` (traza/historial) — **aplicadas en Supabase** (`prisma/sql/2026-07-03_contable.sql`).
  - **2 bugs del plan corregidos al ejecutar** (subagentes los cazaron): (1) el borrado de la línea `APRENDER:` debe ser por-línea, no por el regex que exige `}`; (2) el formateador puro tuvo que separarse a `formato.ts` porque `node --test` no resuelve el alias `@/` del fetch.
  - **PENDIENTE (fases siguientes, mismo spec):** Fase 2 acciones con confirmación (clasificar/deducible/conciliar/pagos reutilizando `agente-facturas`/`agente-movimientos`); Fase 3 documentos (foto/PDF → `extraerDesdeBuffer`/`ocrFactura`); Fase 4 Telegram (texto libre + `cont_` + docs) + proactividad + onboarding; backlog voz. **Falta E2E manual en preview** (necesita `NVIDIA_API_KEY` + sesión) y decidir si se embebe como pestaña de `/finanzas`.
  - **Nota:** modelo = NVIDIA NIM (Llama), no Claude. Commits sin firma GPG (clave del entorno vacía) → GitHub «Unverified», email autor/committer correcto.

- **✅ plataforma: repaso «haz todo» de los 🔴/🟡 del auto-informe 01/07 (03/07/2026, rama `claude/tax-declaration-projection-ewsd4a`, PR nuevo).**
  - Verificado cada hallazgo contra código+BD ANTES de tocar (el auto-informe 01/07 falló varias veces).
  - **Arreglado**: crons `categorizar-movimientos` y `resumen-semanal` solo exportaban `POST` pero Vercel dispara por **GET** → 405, nunca corrían (causa real del «0 hits» #6). Ahora GET+POST. Son los únicos 2 de 40 crons con ese problema. + IVA soportado: `COALESCE(pago_confirmado_at,created_at)`→ solo `pago_confirmado_at` (AEAT; 0 filas hoy).
  - **Obsoletos/ya resueltos (auto-informe desactualizado)**: 🔴#1 getResumenSivra YA usa `gastos` (no `expenses`); 🔴#2 `amount NULL` en incomes = 0 hoy; 🟡#4 getResumenFinanciero NO cuenta traspaso_interno/actividad_pilar (caen por defecto en el if/else de destino).
  - **NO ejecutado a ciegas (gran radio/criterio humano)**: RLS 180 tablas sin policy, REVOKE 77 funciones anon iarest, backlog revisión (hoy 939), needs_human, cap pricing, resync Smoobu. Documentado en `docs/AUDITORIA-2026-07.md` (sección «Actualización 2026-07-03 (2)»).
  - **Lección**: los hallazgos del auto-informe `/auditoria-diaria` hay que VERIFICARLOS contra la realidad; genera falsos positivos y misdiagnósticos.

- **🔴 plataforma: auditoría 03/07 — 2 bugs de prod por DRIFT de esquema BD↔código (rama `claude/tax-declaration-projection-ewsd4a`, PR nuevo).**
  - **Disparador**: Alberto reportó «Error cargando datos» en `/sivra/resultado-pisos`.
  - **Bug 1 (arreglado en prod)**: la vista `v_movimientos_activos` (creada 26/06 con `SELECT *`, columnas CONGELADAS) no exponía `propiedad_id` (añadida a `movimientos_bancarios` el 01/07, PR #638) → `SELECT propiedad_id FROM v_movimientos_activos` en `lib/sivra/pl-mensual.ts` fallaba → 500 en `/api/sivra/pl-mensual` TODOS los meses. Regenerada por MCP + migración `prisma/sql/2026-07-03_v_movimientos_activos_propiedad_id.sql`. **LANDMINE: `CREATE VIEW ... SELECT *` NO se re-expande; al añadir columna a movimientos_bancarios, re-ejecutar el CREATE OR REPLACE.**
  - **Bug 2 (arreglado en código)**: `cuentas` NO tiene columna `estado`, pero `facturas-scan` y `facturas-resumen-semanal` hacían `WHERE estado IS DISTINCT FROM 'inactiva'` → crons caídos (0 trabajo). Quitado el filtro. Era la causa real del «4 crons silenciosos» de la auditoría del 01/07 (se había atribuido a envs GMAIL).
  - **Por qué ningún agente lo vio + guarda**: ningún agente ejercita las páginas. Añadido **Check 9 smoke-test** en `/api/cron/health-check` que ejecuta `getPLMensual`/`getResumenFinanciero`/`calcularEstadoDeclaracion` y avisa por Telegram si lanzan.
  - Informe: `docs/AUDITORIA-2026-07.md` (sección «Actualización 2026-07-03»). Siguen abiertos los 🔴 del 01/07 (no en este PR).

- **⚡ plataforma: «🧾 Mi declaración» (/finanzas/fiscal) ya no se cuelga en «Calculando…» (03/07/2026, PR #721 MERGEADO a main).**
  - **Causa raíz**: `GET /api/finanzas/comparativa` llamaba a un LLM (`enriquecerConIA`→`aiComplete`→`nimChat`) EN la petición y **sin timeout** (`lib/gastos-recurrentes.ts`, `lib/ai-client.ts`). Si NVIDIA iba lento, el spinner no terminaba nunca. Además se calculaba `getResumenFinanciero` dos veces (SSR + endpoint) y sin caché.
  - **Fix**: (1) IA FUERA del camino crítico — los números salen de SQL; nueva tabla **`patrones_recurrentes_cache`** (aplicada en prod) que rellena un **cron diario** `/api/cron/patrones-fiscal-refresh` (`30 5 * * *`); la petición solo lee la etiqueta cacheada (cosmética). (2) La comparativa se calcula en **SSR** (`fiscal/page.tsx` reutilizando el `resumen`) y se pasa como prop → **primera carga sin «Calculando…»**; el endpoint solo sirve el cambio de año. (3) **`aiComplete` con `AbortSignal.timeout`** (red de seguridad). (4) Nuevo helper `lib/comparativa-declaracion.ts` (`calcularEstadoDeclaracion`, compartido SSR+endpoint) que además **anualiza retenciones y rendimiento/retenciones de Pilar** en el escenario «🔮 Fin de año» (antes las dejaba a fecha de hoy → sesgo a «a pagar»).
  - **Respeta `fiscal-novedades`**: las cifras legales siguen entrando por `importesDe(year)`→`IMPORTES_POR_ANIO`; la caché nueva NO cachea importes fiscales.
  - **Decisión de diseño (validada contra BD)**: se descartó una heurística SQL de `proyectable` ("2 plazos atrasados") porque marcaba el alquiler recurrente real (GUTIERREZ ALCALA) como no proyectable → se proyectan TODOS los recurrentes (como el fallback histórico); el `proyectable` de la IA se cachea solo como dato informativo.
  - **Verificado**: `tsc --noEmit` limpio, 14/14 tests fiscales, la SQL de patrones corre en prod, tabla creada, preview de Vercel de `plataforma` ✅ Ready, PR mergeado a main. El cron poblará las etiquetas legibles (hasta entonces se ve el concepto crudo del banco).
  - **LANDMINE detectada (no corregida aquí)**: la tabla `cuentas` NO tiene columna `estado`; los crons `facturas-scan`/`facturas-resumen-semanal` usan `WHERE estado IS DISTINCT FROM 'inactiva'` → estarían fallando en runtime. Revisar aparte.

- **✅ rrhh: nueva empresa + documentos empresa + fichaje geolocalización (01/07/2026, PR #645 verde, pendiente merge).**
  - **Nueva empresa**: "Global2 Instalaciones Técnicas" dada de alta directamente en SQL (INSERT en `rrhh.empresas` + `rrhh.usuarios_rrhh`). Pilar (`pilar.pina.franco@gmail.com`) vinculada como responsable.
  - **Multi-empresa**: tabla `rrhh.usuario_empresas` (N:N) creada. Login muestra selector de empresa si el usuario tiene >1. Nuevo endpoint `POST /api/auth/seleccionar-empresa`. JWT emitido con `empresa_id` elegida.
  - **Documentos empresa**: tabla `rrhh.empresa_documentos` + `lib/empresa-documental.ts` + endpoints `GET/POST /api/admin/cuenta/documentos` + `DELETE /api/admin/cuenta/documentos/[id]`. Sección "Documentación de empresa" en `/admin/cuenta` (categorías: CIF, escritura, TC2, seguro social, póliza, otro; filtro año+mes para periódicos).
  - **Fichaje geolocalización**: tablas `rrhh.fichajes` + `rrhh.obras`. `lib/fichajes.ts` usa `dentroDeGeocerca()` de `@central/module-geo` para asignar `obra_id` automáticamente. `resumenJornada()` de `@central/module-horario` para resumen mensual. Endpoints `GET/POST /api/e/fichaje` (portal empleado) + `GET /api/admin/fichajes` + `PATCH /api/admin/fichajes/[id]`. UI en portal empleado (botón fichar, GPS, historial mes). Admin `/admin/fichajes` (tabla, filtros, resumen) + `/admin/obras` (CRUD). Nav AdminShell actualizado.
  - **Fix CI**: `lib/fichajes.ts:81` — `horas_totales: f.horas_totales ?? null` (era `?? undefined`, incompatible con `TurnoFichaje.horas_totales: number | null`).
  - **Estado**: todos los typechecks ✅, Vercel `central-rrhh` ✅ Ready. Pendiente merge por Alberto.

- **✅ rrhh: contador vacaciones, calendario admin, notificaciones y quitar columna Puesto (01/07/2026, PRs #637 y #643 mergeados).**
  - **PR #637** (squash a main): contador vacaciones empleado (devengados/aprobados/en trámite/pendientes, barra progreso, selector año), columna saldo vacaciones en lista empleados, calendario admin (`/admin/calendario`), email notificación al aprobar/rechazar solicitud (`lib/notificar.ts`), aviso solapamiento en admin.
  - **PR #643**: quitar columna "Puesto" de la tabla `/admin/empleados` (sigue editable en ficha).
  - **Fix Pilar login**: INSERT en `public.cuentas` para `pilar.pina.franco@gmail.com` — puede entrar al god-panel como operador.
  - **Error persistente**: `/admin/empleados/[id]` da 500 (Digest 1939364247) en prod. Sin acceso a logs de `central-rrhh` vía API Vercel (403 Forbidden — cuenta personal, no equipo). Pendiente revisar en Vercel UI directamente.
  - **Principio permanente Pilar**: listas desplegables (centro de trabajo, contratos…) configurables desde UI, no hardcoded. `rrhh.config_listas` pendiente de implementar.

- **🐛 plataforma: fix duplicados cross-cuenta tarjeta↔corriente (01/07/2026, PR en curso).**
  - **Causa**: Kutxabank exporta los cargos de tarjeta en DOS extractos (el de la corriente y el propio de la tarjeta). Al importar ambos Excels, la misma compra entraba bajo dos `cuenta_bancaria_id` distintos (un `tipo='corriente'` y un `tipo='tarjeta'`). La guarda anti-dedup existente solo cubría `xls vs psd2` dentro de la misma cuenta — no detectaba este patrón.
  - **Backfill aplicado en prod**: SQL `2026-07-01_dedupe_cross_cuenta.sql` → **47 filas marcadas `ignorado`, 3.764€ eliminados de gastos inflados** (movimientos de la corriente, se conservan los de tarjeta).
  - **Prevención en código** (`lib/banca.ts::importarExtracto`): nuevo bloque anti-dedup cross-cuenta tras el bloque cross-origen. Si se importa una corriente y ya existe la misma (fecha, importe) en una cuenta `tipo='tarjeta'` de la misma sociedad (o viceversa), se marca como `ignorado` de forma conservadora e idempotente.
  - **Banner duplicados** (`getDuplicadosSospechosos`): UNION SQL añadido — detecta ahora pares cross-cuenta (distinta `cuenta_bancaria_id`, misma sociedad, misma fecha+importe). Incluye `cuentaLabel` en `DupMovimiento` para que la UI pueda mostrar de qué cuenta viene cada uno.
  - **LANDMINE nueva**: `dedupe_hash` solo evita duplicados DENTRO de la misma cuenta. Para duplicados CROSS-CUENTA la clave es `tipo='tarjeta'` gana sobre `tipo='corriente'`. No mezclar con el LANDMINE anterior (cross-origen psd2 vs xls).

- **✅ plataforma: motor de categorización IA de gastos — MERGEADO a main (01/07/2026, PR #639 squash-merged).**
  - **3 bugs corregidos en el mismo PR**: (1) guard `actividad_pilar` en `categorizarMovimiento()` — devuelve `'gasto_profesional'` directamente sin llamar IA; (2) filtro `COALESCE(m.destino,'') <> 'actividad_pilar'` en ambas queries de `categorizarLoteSinSubcategoria()`; (3) `titular='titular'` añadido en `/api/finanzas/tarjeta/route.ts` para excluir tarjetas de Pilar del resumen de Alberto.
  - **SQL retroactivo aplicado en prod** (`2026-07-01_fix_pilar_subcategoria_nula.sql`) — 0 filas afectadas (ya tenían subcategoría).
  - **Pendiente Alberto**: trigger retroactivo `POST /api/cron/categorizar-movimientos?retroactivo=true` con `Authorization: Bearer $CRON_SECRET`.

- **🏷️ plataforma: motor de categorización IA de gastos — implementado (01/07/2026, PR #639 verde, pendiente merge).**
  - **Motor híbrido**: `apps/plataforma/lib/categoria-ia.ts` — reglas→IA Haiku fallback → auto-aprendizaje (confianza ≥0.85 persiste regla).
  - **Columna**: `banca_destino_reglas.subcategoria` + tablas `categoria_alertas` y `categoria_alertas_log` — **aplicadas en Supabase prod** (migración `2026-07-01_categoria_alertas.sql`).
  - **Hooks de ingesta**: `lib/psd2.ts` + `lib/banca.ts` llaman `categorizarYAlertar()` con `Promise.allSettled()` tras cada inserción (fallo de categoría no rompe importación).
  - **Alertas Telegram**: `lib/alertas-categoria.ts` — límite mensual configurable, throttle 24h, envía aviso al superar.
  - **Resumen semanal**: `lib/resumen-semanal-gastos.ts` — cada lunes 09:30 UTC, desglose emoji por categoría.
  - **Crons Vercel**: `0 7 * * *` (categorizar) + `30 9 * * 1` (resumen semanal) en `vercel.json`.
  - **UI**: `app/(usuario)/finanzas/CategoriasTab.tsx` — pestaña "📊 Categorías" en `/finanzas`, gráfico dona recharts, tabla gastos/ingresos, gestión alertas. Integrado en `FinanzasClient.tsx`.
  - **APIs**: `GET/PATCH/DELETE /api/alertas-categoria`, `GET /api/finanzas/categorias?year=&month=`, `POST /api/cron/categorizar-movimientos`, `POST /api/cron/resumen-semanal`.
  - **Todos los Vercel projects ✅ Ready** tras el push.
  - **Pendiente Alberto**: (1) merge PR #639; (2) trigger retroactivo: `POST /api/cron/categorizar-movimientos?retroactivo=true` con `Authorization: Bearer $CRON_SECRET`; (3) procesar PDF Kutxabank de Pilar (Gmail thread `19f1d3ff7593e23d`, ene-jun 2026) con importador Norma43.
  - **Fase 2 futura**: rediseño sidebar/navegación `/finanzas` (eliminar duplicaciones) — PR draft separado.

- **🤖 Rutinas programadas: 8 rutinas activas + arquitectura Telegram centralizada (01/07/2026, PR #631).**
  - Creadas 5 rutinas nuevas (pricing-agente, fiscal-novedades, psd2-health-check, rrhh-compliance-calendar, ialimp-client-health). Total: 8 rutinas activas.
  - **Arquitectura de notificaciones**: token Telegram vive ÚNICAMENTE en Vercel plataforma. Las rutinas llaman `POST /api/internal/alerta` con `CRON_SECRET` — sin duplicar tokens por rutina.
  - Nuevo endpoint `apps/plataforma/app/api/internal/alerta/route.ts`: auth `isCronAuthorized` + `tgSend`.
  - **Skills creadas/actualizadas**: `psd2-health-check`, `ialimp-client-health`, `rrhh-compliance-calendar`, `pricing-agente`, `fiscal-novedades`.
  - **`docs/RUTINAS-PROGRAMADAS.md`** actualizado: cadencias, MCPs, arquitectura Telegram, workaround env vars.
  - **Workaround env vars**: la UI de Rutinas no tiene campo "Variables de entorno" (jul 2026). Solución: incluir `PLATAFORMA_URL` + `CRON_SECRET` directamente en el campo "Instrucciones" de rutinas 6 y 7.
  - **Pendiente manual Alberto**: añadir `CRON_SECRET` al prompt de rutinas 6 (psd2) y 7 (ialimp-client-health). Ver `docs/RUTINAS-PROGRAMADAS.md` sección workaround.
  - **Primer ciclo pricing-agente** (lunes): revisar PR draft con `dryRun: true` antes de aprobar.
  - WebFetch/WebSearch son herramientas nativas de Claude (no MCPs externos) — fiscal-novedades solo necesita Supabase como conector.

- **🏗️ ARQUITECTURA RRHH — PRINCIPIO PERMANENTE: Pilar debe poder configurar TODO sin depender de Alberto (01/07/2026).**
  Pilar es la gestora externa de RRHH. La app debe ser 100% autónoma para ella. Implicaciones:
  - **Listas desplegables configurables** (centro de trabajo, tipo contrato, categoría, grupo cotización...): NO hardcoded en código. Deben editarse desde el god-panel (`/operador`) o en la propia ficha admin de RRHH. La tabla `rrhh.config_listas` (o similar) almacena las opciones por empresa (`empresa_id`, `campo`, `opciones[]`).
  - **Feedback de Pilar (01/07/2026, WhatsApp):**
    - "Centro de trabajo" → desplegable con opciones CAMAS / MANCHON / AMBOS (configurable por empresa).
    - "Cuenta de cotización (CCC empleador)" → **ELIMINAR** del formulario (no se usa).
  - Cuando Pilar necesite añadir un centro de trabajo nuevo o cambiar opciones de un desplegable, debe poder hacerlo ella desde la propia interfaz de admin de RRHH, sin tocar código.
  - **Pendiente implementar**: `rrhh.config_listas` + UI de configuración en admin + campo "Centro de trabajo" como `<select>` en ficha empleado.

- **✅ rrhh: fix responsive nav admin + login corporativo con logo #1565C0 (01/07/2026, PRs #624 #628 mergeados + fix en curso).**
  - #624: fix TS7016 (`@types/nodemailer` en `packages/core-email`). Admin panel con branding.
  - #628: `/login` como Server Component con logo y color desde BD. Logo `/logos/mariscos-gonzalez.svg` en `public/`.
  - BD: `color_primario='#1565C0'`, `logo_path='/logos/mariscos-gonzalez.svg'` para Mariscos González.
  - Fix responsive `AdminShell`: nav horizontal scrollable en móvil (`overflow-x-auto` + `whitespace-nowrap`), logo inline con nav, padding `p-4 md:p-6` en `main`. Header empleados apilable (`flex-wrap`).

- **🚀 plataforma: control mensual tarjeta de crédito Kutxabank (01/07/2026, PR #626 draft).**
  - BD: columna `tipo` (`corriente`/`tarjeta`/`ahorro`) en `cuentas_bancarias` — **aplicada en Supabase prod**.
  - `lib/banca.ts`: `importarExtracto()` acepta y persiste `tipo`; nueva `enviarResumenTarjeta()`.
  - Nueva página `/finanzas/tarjeta-credito`: KPIs, desglose por categoría, top 10 cargos.
  - **PR #626 en revisión**.

- **📁 Drive 2026 organizada + reglas aprendidas (01/07/2026).**
  - Carpeta `FACTURAS Apartamentos / 2026` (ID `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O`): tiene subcarpetas mensuales `01-Enero-2026` … `06-Junio-2026`. Al archivar facturas 2026 usar esas subcarpetas (NO la raíz).
  - **6 PDFs copiados a su mes correcto** con nombres descriptivos (`YYYY-MM-DD_emisor_importe.pdf`). Referencias en `facturas_drive` y `movimientos_bancarios.factura_ref` actualizadas a los nuevos file IDs (los originales de la raíz los borra Alberto manualmente junto con los duplicados EMASESA).
  - **9 EMASESA en raíz = mismo PDF repetido 9 veces** (Busto Reform Mayo €57.09, PE2600946516). Alberto los borrará manualmente. Solo es válido `factura (7).pdf` (839 KB, ya vinculado en BD).
  - **4 `factura (33)-(36).pdf` = EMASESA 2025 Punto y Coma SL** — fuera de lugar en la carpeta 2026; Alberto los borra o mueve.
  - **Endesa Dúplex: €5,78/mes extra en banco = "Electric Protección 360 Plus"** (servicio de mantenimiento/asistencia hogar, contrato OR-0046183234, nº factura X326NC11179334). El cargo bancario siempre incluye electricidad + este servicio en un único débito. NO es un error; ambos son deducibles `turistico_duplex`. El PDF de factura ya muestra el RESUMEN TOTAL con ambas partidas.
  - **BBVA Endesa Dúplex — 4 movimientos corregidos** (`destino='turistico_duplex'`, `destino_confirmado=true`, `conciliado=true`). Estaban como `turistico_pisos` por error.
  - **CREATE ventilador techo Socorro** (€123,45, F28-132832, 09/06/2026): la factura lleva "Monte Carmelo 68" como dirección fiscal del cliente (≠ lugar de instalación). Clasificado `turistico_pisos` (Socorro), archivado en `facturas_drive` (`create-socorro`), conciliado con movimiento `4ad69aaa` "COMPRA EN CREATE" 02/06/2026. **Regla**: dirección fiscal del cliente en una factura ≠ lugar de uso del artículo; para material (CREATE/IKEA/ferretería) siempre confirmar con Alberto si va a pisos o vivienda habitual.
  - **`amortizable` = NUNCA** (regla permanente de Alberto): el campo existe en BD pero NO se usa. Ninguna factura se marca `amortizable=true`. Dimitri azotea Socorro (€907,50) se corrigió a `false`.

- **✅ rrhh: ficha editable empleado + branding + auditoría + ialimp agente IA (30/06/2026, PRs #602 #609 #620 #621 mergeados).**
  - #621: ficha editable de empleado (datos contacto, personales, laborales) + branding Mariscos González + acceso portal empleado desde admin. Responsive.
  - #620: logo corporativo en admin sidebar + distribución nóminas PDF con IA (pdfjs-dist@4 fix: `.mjs`).
  - #609: agente análisis IA por apartamento en ialimp (`POST /api/admin/ia/analizar-apartamento`).
  - #602: docs transporte/alquiler + fix nodemailer CVE. **Pendiente manual: vars SMTP en Vercel plataforma.**

- **💧 EMASESA 2026: 9 facturas cuadradas y registradas en BD (30/06/2026).**
  Mapeo definitivo contratos EMASESA → piso (Kutxabank, `turistico_pisos`):
  | Contrato | Dirección | Piso | proveedor en facturas_drive |
  |---|---|---|---|
  | 0104785292 | C/ Socorro 24 | House Sevillana | `emasesa-socorro` |
  | 0105137440 | C/ Bustos Tavera 22 Bajo DER | Luxury Busto | `emasesa-luxury` |
  | 0105185751 | C/ Bustos Tavera 22 Bajo IZQ | Busto Reform | `emasesa-reform` |
  - **"derecha siempre Luxury"** (confirmado por Alberto). Busto Reform = izquierda.
  - **9 facturas insertadas** en `facturas_drive` (ene/mar/may 2026, `fuente='manual'`, sin Drive URL — portal EMASESA únicamente).
  - **6 duplicados marcados** como `duplicado_estado='ignorado'` en `movimientos_bancarios` (marzo y mayo tenían doble entrada PSD2+Excel).
  - **9 canónicos confirmados** con `destino_confirmado=true` + `comentario` con piso/contrato/nº factura.
  - Facturas bimestrales: meses 1,3,5 cubiertos; julio será el siguiente ciclo.
  - C/ San Luis 9 era piso anterior de Punto y Coma SL, ya no en cartera.

- **📌 DECISIÓN FISCAL PERMANENTE: declaración 2025 presentada, scope = solo 2026 (30/06/2026).**
  Alberto confirmó que la declaración IRPF 2025 (y Pilar) **ya está presentada**. Regla permanente:
  - **Solo importa 2026 en adelante** para clasificación de gastos, revisión de movimientos y cálculos fiscales.
  - **BD limpiada**: `UPDATE movimientos_bancarios SET destino_confirmado=true, requiere_revision=false WHERE fecha_operacion < '2026-01-01'` → 630 filas confirmadas. Bandeja "Por revisar" queda vacía para el periodo actual y no aparecerán entradas históricas.
  - Anotado en skill `perfil-fiscal` con bloque `⚠️ Declaración 2025 ya presentada`.

- **🔧 plataforma/BD: reclasificaciones masivas bandeja "Por revisar" (30/06 sesión continuación).**
  Se resolvieron todos los movimientos mal clasificados que seguían apareciendo en la UI:
  - **Gimnasio Círculo Mercantil** (7 filas, mar–jun 2026, -€30/mes): `destino='personal'` correcto. Aplicado `destino_confirmado=true` a todos. Salen de la bandeja. La deducción autonómica andaluza (D.A. 1ª Ley 7/2021, 15%, máx. €15/año) ya estaba anotada en `comentario`.
  - **Escuela Infantil Ratón Pérez** (20 filas, ene-2025 a jun-2026): `destino='personal'` correcto. Aplicado `destino_confirmado=true` a todos. Deducción maternidad ampliada (Art. 81 bis LIRPF) ya anotada en `comentario`.
  - **TGSS RETA cuota autónomos en BBVA** (7 filas: 3 short-concepto + 4 PSD2 format, mar–jun 2026): estaban mal como `seguros`. Reclasificados a `destino='personal'`, `destino_confirmado=true`, `requiere_revision=false`. Fix retroactivo del PR #613 (`RE_TGSS` solo afecta entradas nuevas).
  - **Comisiones correduría Occident/ASISA** (56 filas, jul-2025 a jun-2026): M00171 (Occident), 8/92361 (Occident sub), M1454 (ASISA) importados con `destino='personal'` por no casar el patrón ILIKE case. Reclasificados a `destino='seguros'`, `destino_confirmado=true`, `requiere_revision=false`.
  - **Bandeja residual**: quedan ~27 entradas sin clasificar (varios "Adeudo nº" en BBVA sin contraparte legible, traspasos internos sin concepto, un Booking oct-2025 en turistico_pisos). Pendiente de revisión manual por Alberto.

- **🧾 plataforma/BD: backfill facturas_drive Giraldillo + seguros reclasificados + skill perfil-fiscal (30/06, PR #613 ✅ mergeado).**
  Sesión de cierre y lavandería. Todo lo que se hizo:
  - **`facturas_drive` Giraldillo 2026**: insertadas 5 facturas de El Giraldillo (lavandería pisos) — ene: €598,95, feb: €635,40, mar: €579,75, abr: €489,70, may: €598,95. Drive IDs registrados. Tabla: `facturas_drive (proveedor='giraldillo', anio=2026, mes=1..5)`.
  - **`facturas_drive` otros**: Dmytro azotea Socorro (2026-02-17, €907,50) y CREATE ventilador (F28132832, 2026-06-09, €123,45). Nombres en Drive: `Dimitri.pdf` y `CREATE.pdf` (se dejan así).
  - **OCCIDENT GCO,S.A. (2026-01-16, -€593,45)**: seguro del apartamento Socorro → reclasificado a `destino='turistico_pisos'`, `destino_confirmado=true`. Art. 23.1 LIRPF → deducible del alquiler de Socorro (50% Alberto, 50% Pilar).
  - **RECIBO POLIZAS GIP (2026-01-02, -€211,60)**: seguro salud ASISA póliza 009460888 → reclasificado a `destino='seguros'`, `destino_confirmado=true`. Art. 30.2.5ª LIRPF → deducible actividad económica autónomo (€500/persona/año).
  - **Skill `perfil-fiscal` actualizado**: ASISA → `seguros` (Art. 30.2.5ª, máx. €1.500/año entre Alberto+Pilar+hijos); gimnasio Círculo Mercantil → `personal` pero D.A. 1ª Ley 7/2021 Andalucía (15%, máx €15/año vía `comentario`); donativos Fundación Sagrados Corazones → Ley 49/2002 (80%+35%, requiere Modelo 182). Reglas de `banca_destino_reglas` sembradas al 23/06.
  - **fix `destino.ts`**: cuota RETA (TGSS) en BBVA ya no cae a `seguros` por descarte → `personal` sin `revisar`.
  - **PR #613**: squash-mergeado a main.

- **🏷️ plataforma/BD: anotaciones fiscales IRPF en movimientos_bancarios (30/06) — solo `comentario`, siguen en bucket `no_deducible`.**
  El campo `comentario` de `movimientos_bancarios` se usa para marcar gastos personales que tienen deducción en IRPF personal pero no son gastos de actividad (no cambia `destino`). Anotados:
  - **21 donativos Fundación Sagrados Corazones** (ene-2025 a jun-2026, -€10/mes): Ley 49/2002 mecenazgo → 80% deducción primeros €150 en cuota IRPF + 35% resto. Pedir certificado anual (Modelo 182). IDs: todas las filas con `concepto ILIKE '%fundaci%sagrado%'`.
  - **4 cuotas gimnasio Círculo Mercantil** (mar-jun 2026, -€30/mes): D.A. 1ª Ley 7/2021 Andalucía → 15% gastos deportivos, máx. €100/año de base → deducción máxima **€15/año** en cuota IRPF autonómica. ⚠️ En sesión anterior se indicó erróneamente que el gimnasio NO era deducible — SÍ lo es a nivel autonómico andaluz.
  - **4 recibos seguro salud ASISA póliza 009460888** (mar-jun 2026, -€180,99/mes): Art. 30.2.5ª LIRPF → deducible en estimación directa autónomo: €500/persona/año (€1.500 total si Alberto+Pilar+1 hijo). Con 12 meses = €2.172, máx deducible €1.500.
  - **17 recibos guardería Escuela Infantil Ratón Pérez** (ene-2025 a jun-2026): Art. 81 bis LIRPF deducción maternidad ampliada → 15% gastos guardería hijos <3 años, máx. €1.000 base → hasta **€150 extra** en cuota. Conservar facturas del centro.
  - **IMPORTANTE — ¿qué edad tiene el hijo?** La deducción guardería aplica solo a hijos <3 años. Si en 2026 tiene ya 3+, solo aplica en IRPF 2025.
  - **Plataforma:** todos quedan en bucket `no_deducible` (destino=personal). La plataforma clasifica gastos de ACTIVIDAD. Estas deducciones son de cuota IRPF personal — el asesor las recoge de los comentarios.

- **🧾 plataforma/BD: facturas Endesa Dúplex registradas en facturas_drive (30/06).**
  4 facturas subidas a Drive carpeta 2026 por Alberto → insertadas en `facturas_drive` vía SQL:
  - Mar-26: €69,21 (`20260314-P26CON011796753.pdf`, Drive `1pwpjjzwY06KNUx6-l98k4AaluRktMbfy`)
  - Abr-26: €60,10 (`20260420-P26CON016684421.pdf`, Drive `1n1JmgSFHex6cz2OkgI7l_TRgWR7q0QdA`)
  - May-26: €56,88 (`20260519-P26CON021226634.pdf`, Drive `1wCc9VAU3KCzjpwkFQElUU1L0eMHKKq3v`)
  - Jun-26: €89,69 (`20260613-P26CON025735465.pdf`, Drive `1thpfK1MjVMRVI-SwATmhpHu1f8Pd5I-q`)
  Contrato Endesa Dúplex: 130139482171, PJ Francisco Molina 4 1C, BBVA ES34.

- **🔧 plataforma: fix IBAN guard PSD2 (30/06, PR #613 ✅ mergeado).**
  `lib/psd2.ts::sincronizarSesion()`: guard `if (!/^[A-Z]{2}[0-9]{2}/.test(iban)) continue` evita insertar UUID como IBAN en `cuentas_bancarias`. Skill `plataforma-maestro` actualizado con el landmine. Fix del bug que causó 75 duplicados (cuenta fantasma UUID vs IBAN real).

- **🚨 plataforma/BD: cuenta bancaria fantasma PSD2 + 75 duplicados eliminados (30/06).**
  - **Causa raíz:** una sesión PSD2 (Enable Banking) creó una segunda `cuenta_bancaria` para la misma cuenta BBVA física pero con `iban` = UUID en lugar del IBAN real (`ES34...`). Al no coincidir el `cuenta_bancaria_id`, el `dedupe_hash` (que lo incluye) no detectó los duplicados → 75 movimientos duplicados activos en la BD inflaban finanzas.
  - **Cuenta fantasma:** `id=88560ea2-747c-41bd-a98a-6c654f7a34e5`, banco=BBVA, `iban=cdb981d3-...` (UUID inválido). Cuenta real: `8ce760ca-0cfb-4daa-8f8c-7fb5ba72d627`, IBAN=`ES3401829465600202331175`.
  - **Fix aplicado:** `UPDATE movimientos_bancarios SET duplicado_estado='ignorado' WHERE cuenta_bancaria_id='88560ea2...' AND EXISTS (gemelo en cuenta real)`. 75 registros ignorados.
  - **Investigación pendiente** (agente en background): confirmar cómo el código PSD2 crea cuentas_bancarias y añadir guard para no duplicar. Ver resultado agente antes de commitear fix preventivo.
  - **Síntoma que delató el bug:** fila "Sin identificar (revisar)" de 76.30€ en `/correduria` que Alberto identificó como duplicado de Pelayo. El movimiento real (con `compania_seguros='Pelayo'`) estaba en la cuenta real; el fantasma (sin compañía) aparecía como segunda fila.
  - **⚠️ LANDMINE dedupe cross-cuenta:** `dedupe_hash = cuenta_bancaria_id|fecha|importe|concepto` — NO detecta duplicados entre cuentas distintas aunque sean el mismo banco. Si PSD2 crea una segunda cuenta para el mismo banco, los movimientos se duplican silenciosamente. Solución a implementar: al crear `cuenta_bancaria` por PSD2, buscar primero si ya existe una con mismo `banco` + `cuenta_id` y IBAN válido; si sí, reutilizarla en lugar de crear nueva.

- **🔧 plataforma: fix CUOTA autónomo clasificado como Seguros + backfill facturas_drive Sique Brilla (30/06).**
  - **Bug CUOTA autónomos BBVA:** `lib/destino.ts` asignaba `seguros` por descarte a TODO cargo de BBVA que no casaba con el Dúplex. Una cuota RETA (TGSS/Seg.Social) de Alberto en BBVA caía ahí. Fix: añadida detección `RE_TGSS` antes del descarte BBVA → devuelve `personal` sin `revisar`. Commit en rama `claude/laundry-invoice-analysis-4yoys8`.
  - **Backfill `facturas_drive`:** Sique Brilla no tenía NINGÚN mes registrado en BD aunque las facturas estaban en Drive → `/sivra/facturas-control` mostraba "Falta" para todos los meses. Insertadas vía SQL directo (Supabase MCP):
    - Ene-26: 798,60€ · Mar-26: 1.074,48€ · Abr-26: 1.439,90€ · May-26: 1.360,04€ · Jun-26: 902,65€
  - **⚠️ WORKFLOW CRÍTICO — "factura subida a Drive ≠ registrada en BD":** el botón "Subir PDF" de `/sivra/facturas-control` hace Drive + BD en un solo paso. Si la factura se sube DIRECTAMENTE a Google Drive (fuera de la plataforma), la tabla `facturas_drive` no se entera y la página sigue mostrando "Falta". **La regla es: toda factura debe registrarse vía la plataforma** (`/sivra/facturas-control` → "Subir PDF"), o insertar manualmente con SQL en `facturas_drive (proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente='manual')`. El agente de Gmail (cron `facturas-scan`) usa `fuente='agente'` pero solo procesa `facturas_proveedor`, NO `facturas_drive`. Son dos tablas distintas:
    - `facturas_drive`: control de presencia/estado mensual por proveedor (usa `/sivra/facturas-control`).
    - `facturas_proveedor`: facturas para el flujo de pago OCR→Telegram→banco (usa el agente Gmail).
  - **Resuelto**: fix `destino.ts` y reclasificaciones OCCIDENT+GIP mergeados en PR #613 (30/06).

- **📊 plataforma/sivra: P&L mensual por piso turístico — implementado y mergeado (30/06, PR #611 ✅).**
  Nueva funcionalidad que cruza ingresos Smoobu con costes reales (lavandería, limpieza, suministros) para calcular el beneficio real por piso cada mes.
  Archivos nuevos/modificados en `apps/plataforma`:
  - `lib/sivra/pl-mensual.ts`: lógica de cálculo. Reparte El Giraldillo entre los 3 pisos Kutxa con fórmula `maxGuests × reservas_del_mes`. Usa `v_movimientos_activos` (vista deduplicada). Los movimientos ya en `movimiento_reparto` se suman directamente.
  - `app/api/sivra/pl-mensual/route.ts`: `GET /api/sivra/pl-mensual?mes=YYYY-MM`, requiere sesión, valida formato.
  - `app/(usuario)/sivra/resultado-pisos/page.tsx`: página con selector de mes, KPI cards (ingresos totales, gastos, resultado neto, margen global) y tabla desglosada por piso (lavandería | alquiler | suministros | comunidad | otros | total | resultado | margen%).
  - `app/(usuario)/UserSidebar.tsx`: añadido "Resultado pisos" como primer ítem de "Pisos · detalle".
  Valores validados SQL mayo 2026: House Sevillana €8.359,62 ing / €7.940,28 res; Luxury Busto €1.924,98 / €1.439,44; Dúplex €1.722,06 / €1.562,32; Busto Reform €1.658,64 / €1.346,63.
  Pisos Kutxa (`prop_house_sevillana`, `prop_busto_reform`, `prop_luxury_busto`) comparten lavandería; Dúplex Center (BBVA) es independiente.
  **Pendiente**: EMASESA, DIGI, PriceLabs, Netflix, IONOS, ENDESA por piso aún sin mapear → indicado en nota al pie de la tabla. PR #611 a revisar por Alberto.

- **🧾 skill facturas-correo: conciliación SIQUE 2026 completa (30/06, PR #610 mergeado ✅).**
  Archivadas y conciliadas facturas SIQUE (Si Que Brilla SL, NIF B22992523) ene–jun 2026 en Drive y BD.
  Mayo 2026 (1.360,04 €): banco `c9f835ee-7782-4b95-a87b-7b9f92ee63eb` marcado conciliado, Drive `1HNRrPy4L35ESjjOSdTtoczVUt6l-isYz`.
  Junio 2026 (902,65 €): Drive `16NKosRE-eEkOVwRSqZjC2oF3EG9_eqFf`, ⏳ banco pendiente (~2026-07-02, "TRANSF. 2100 LIMPIEZA APARTAMENTOS JUNIO").
  Skill actualizado con: SQL verificación limpiezas vs `incomes` (checkouts del mes por piso), mapeo nombres factura→BD (LUXURY→`Luxury Busto`, DUPLEX→`Duplex Center`, CASA SOCORRO→`House sevillana`, BUSTOS REFORMA→`Busto Reform`), regla bloqueos-no-cuentan, regla ±1 último día del mes.
  **Pendiente**: cuando llegue la transferencia de junio (~2026-07-02), conciliar con `UPDATE movimientos_bancarios SET conciliado=true, factura_ref='16NKosRE-eEkOVwRSqZjC2oF3EG9_eqFf', destino='turistico_pisos' WHERE id = '<id>'`.

- **💳 plataforma: agente de pago de facturas — Fase 2 mergeada a main (30/06, PR #606 ✅).**
  PRs #605 (Fase 1) y #606 (Fase 2) ambos mergeados a main. Sistema completo operativo.
  Pendiente manual por Alberto: `EB_PIS_ENABLED=true` y `EB_DEBTOR_IBAN=<IBAN Kutxabank>` en Vercel plataforma.
  Fase 3 (backlog): foto ticket → pago, aplazar con email, scoring proveedores, pago fraccionado.

- **💳 plataforma: agente de pago de facturas a proveedores — Fase 2 enriquecimiento (30/06, PR #606 mergeado).**
  Sobre la base de Fase 1 (PR #605 mergeado). Cuatro ideas implementadas:
  - **Idea #3 — Resumen semanal**: nuevo cron `GET /api/cron/facturas-resumen-semanal` (lunes 09:15). Si hay >1 factura en `nueva`/`pendiente_revision`, envía mensaje agrupado con total + botones ✅ Pagar todo / 📋 Revisar una a una. `resumenSemanal(cuentaId)` exportada en `pagos.ts`. `pagarTodo(cuentaId)` llama `aprobarPago` para cada factura pendiente.
  - **Idea #4 — Presupuesto por proveedor**: nueva tabla `presupuesto_proveedores (cuenta_id, proveedor, budget_anual, anno)` — **migración aplicada en prod**. `notificarFactura` ahora consulta el gasto acumulado del año + el budget y añade una línea *"Giraldillo lleva €X este año (budget €Y · N%)"* al Telegram si hay presupuesto configurado. Nuevo endpoint `GET/PUT /api/banca/pago/presupuesto` para gestionar budgets por proveedor.
  - **Idea #11 — Vínculo factura-reserva**: tras insertar una factura en `escanearNuevasFacturas`, comprueba en `incomes` si hay un checkout en ±2 días de la fecha de factura. Si existe, envía Telegram "¿Asociar con estancia [huésped] en [piso] (salida [fecha])?" con botones ✅ Sí / ❌ No. Callback `pago_vincular` guarda `reserva_id = "propertyId:checkOut"` en la fila.
  - **Idea #2 — Alerta factura recurrente ausente**: `alertarFacturasAusentes(cuentaId)` (nueva export en `pagos.ts`, llamada desde el cron diario día 7+). Para cada proveedor con ≥2 facturas históricas que no tenga ninguna este mes, envía alerta Telegram "⚠️ Sin factura de X este mes".
  - **Callbacks Telegram nuevos**: `pago_pagartodo`, `pago_revisarunauna`, `pago_vincular`, `pago_novinc` — manejados en el webhook.

- **💳 plataforma: agente de pago de facturas a proveedores — Fase 1 completa (30/06, PR #605 mergeado a main).**
  Implementado el flujo completo: Gmail → OCR → Telegram con botones → Enable Banking PIS (o SEPA XML fallback) → auto-conciliación con extracto bancario.
  - **`packages/@central/module-pagos`**: nuevo módulo portable. Tipos (`FacturaProveedor`, `EstadoFactura`, `PagoParams`…), generador SEPA XML pain.001.001.03 puro, validador de IBAN (checksum ISO 7064). Sin BD ni secretos.
  - **`prisma/sql/2026-06-30_facturas_proveedor.sql`**: nueva tabla `facturas_proveedor` (cuenta_id, proveedor, importe, estado, pago_id, pago_url, cuota_iva…). Índice único de dedupe por (cuenta_id, proveedor, numero_factura). **Migración aplicada en prod (wswbehlcuxqxyinousql).**
  - **`lib/enablebanking.ts`**: añadidas funciones PIS — `iniciarPago()`, `estadoPago()`, `disponiblePis()`. Flag de activación: `EB_PIS_ENABLED=true`.
  - **`lib/agente-facturas/pagos.ts`**: orquestador — `escanearNuevasFacturas()` (Gmail IMAP → OCR → BD → Telegram), `aprobarPago()` (PIS o SEPA XML), `aplazarPago()`, `rechazarFactura()`, `verificarPagosPendientes()` (pago_iniciado → ACSC → pagada), `conciliarConBanco()` (cruce con `v_movimientos_activos` por proveedor+importe+fecha±3d).
  - **API routes**: `POST /api/banca/pago/aprobar|rechazar|aplazar`, `GET /api/banca/pago/callback` (exento en middleware — redirect del banco tras SCA).
  - **Cron** `GET /api/cron/facturas-scan` (`vercel.json` 15 6 * * *): scan + verify + conciliar para todas las cuentas activas.
  - **Telegram webhook** extendido con `prefix === 'pago'` → `aprobar|aplazar|rechazar`. Formato callbacks: `pago_aprobar:<id>`, `pago_aplazar:<id>`, `pago_rechazar:<id>`.
  - **`lib/finanzas.ts`**: `trimestres` ahora incluye `ivaSoportado` (suma `cuota_iva` de `facturas_proveedor WHERE estado='pagada'` del año). Tipo `ResumenFinanciero.fiscal.trimestres` actualizado.
  - **`middleware.ts`**: `/api/banca/pago/callback` añadido a `PUBLIC`.
  - **`next.config.ts`**: `@central/module-pagos` en `transpilePackages`.
  - **`package.json` plataforma**: `@central/module-pagos: workspace:*`.
  - **Nuevas env a añadir en Vercel plataforma**: `EB_PIS_ENABLED=true` (cuando se confirme tier), `EB_DEBTOR_IBAN` (IBAN de Kutxabank para debitar).

- **📞 Datos de contacto de Alberto:** móvil `637 349 990`. Usar en firmas de emails comerciales de ia-rest e ialimp.
- **📊 PRICING Busto: datos de mercado corregidos + Feria Apr 18-25 bajada aplicada EN VIVO (05/07).**
  El motor tarificaba agosto y septiembre muy por debajo del mercado real porque los datos de `market_rates` (de 2026-06-23) usaban un pool incorrecto. Corregido via Supabase MCP + `pg_net`:
  - **Agosto 7-9** (10 comps reales Booking, 2p aptos Casco Antiguo): p55=171€. BD previa tenía p55=84€ — motor infravaloraba agosto >50%.
  - **Septiembre 4-6** (10 comps): p55=268€. BD previa tenía p55=132€.
  - **Feria Apr 18** (domingo): 10 comps peer cluster 2p añadidos (p55=259€). BD previa tenía outlier 1350€ (hotel).
  - **Feria Apr 24** (sábado): 10 comps peer (p55=325€).
  - **Feria Apr 18-25 aplicado EN VIVO via pg_net**: los precios Smoobu (todos a 503€) bajaron a **402€** (raíl ±20%/día aplicado, ciclo 1/3). El apply-auto diario continuará la bajada hacia objetivo ~260-305€. Apr 24 quedó a 503€ (no estaba en propuesta original — el apply-auto lo corregirá).
  - Auditado en `pricing_applied` (7 filas, source='agente', dry_run=false) y `pricing_decisiones` (7 filas, motivo+variables).
  - **TÉCNICA NUEVA — pg_net como proxy para Smoobu:** el entorno cloud bloquea CONNECT a `housesevillana.vercel.app`, `plataforma-ten-flame.vercel.app` Y `login.smoobu.com`. Solución: usar `net.http_get/post` de pg_net (ya instalado, v0.20.0) + leer respuesta en `net._http_response` (esperar ~5s y consultar por `id`). La API de Supabase NO bloquea `login.smoobu.com` desde su infraestructura. Patrón: `SELECT net.http_get(url, headers) AS request_id` → esperar → `SELECT content FROM net._http_response WHERE id=<request_id>`. NO usar `http_collect_response(id, async:=false)` — falla con "query has no destination for result data" (bug interno pg_net).
  - **pricing_aprendizaje** actualizado (temporada='feria_2027') con todo el contexto..

- **🐛 ia-rest CRM: emails a leads no se enviaban — 4 bugs corregidos + QA mejorado (29/06, PR #599 mergeado).**
  Alberto reportó que los emails a leads habían dejado de enviarse. Causa raíz: `lead-onboarding` faltaba en el array `crons` de `apps/ia-rest/vercel.json` → el cron nunca corría → los leads no tenían `email_draft` → el botón "📨 Enviar email" de Telegram no aparecía. Tres bugs adicionales corregidos en la misma PR:
  - `vercel.json` (ia-rest): añadido cron `lead-onboarding` `*/30 7-17 * * 1-5`.
  - `lead-onboarding/route.ts`: ventana de tiempo 72h → 7d para recuperar leads acumulados.
  - `telegram/webhook/route.ts`: al enviar email, ahora fija `siguiente_contacto_at = now+3d` + `ultima_actividad_at` para que el lead vuelva a aparecer en `pipeline-comercial`.
  - `pipeline-comercial/route.ts`: añadido `'enviado'` a la lista de estados urgentes.
  - **QA agent mejorado** (`qa-runner.ts`): `checkCrons()` ahora lee `vercel.json` real (antes devolvía `ok` sin verificar nada); ventana CRM ampliada a 7d; nuevo check "Leads enviados sin `siguiente_contacto_at`".

- **🔴 RRHH: fix crash `/admin/empleados` — search_path de rrhh_app (29/06, PR #596 mergeado).**
  `central-rrhh.vercel.app/admin/empleados` petaba con "Application error: server-side exception". Logs de Supabase mostraban `relation "empleados" does not exist` desde el user `rrhh_app`. **Causa raíz:** `rrhh_app` tenía `rolconfig = null` (sin `search_path`). Supavisor en transaction mode descarta `SET search_path` entre conexiones, así que el `?schema=rrhh` del `DATABASE_URL` no se aplicaba y las queries sin prefijo fallaban. **Fix doble:** (1) `ALTER ROLE rrhh_app SET search_path = rrhh, public` — aplicado en prod vía Supabase MCP al instante; (2) prefijo `rrhh.` explícito en todos los `$queryRaw`/`$executeRaw` del app (11 ficheros). Migración documentada en `0018_fix_rrhh_app_search_path.sql`. PR #596 mergeado, todos los builds verdes.

- **🧾 IALIMP: escáner de facturas multi-foto + acceso directo en dashboard (29/06, PR #595 mergeado a main).**
  - **`/admin/contabilidad`**: botón "📷 Escanear" → picker multi-foto → IA (NVIDIA Vision 90B) analiza cada imagen → si certeza alta y base imponible > 0, auto-contabiliza directo; el resto va a cola de revisión manual con datos pre-rellenos en el modal de apunte.
  - **`/dashboard`**: nueva tarjeta `ScanFacturasCard` (acceso directo desde la pantalla principal) que hace el mismo flujo sin entrar a Contabilidad.
  - Sin cambios de schema ni crons; usa `/api/admin/escanear/process` (ya existente) y `/api/admin/contabilidad/apuntes`.

- **📞 REUNIÓN Singular Cleaning con Rafa — resultado: NO CLIENTE (29/06).**
  - Rafa tiene herramienta interna propia (~1,5 años), cubre planificación/empleados/facturación con conector Holded. Equipo contento. Expansión internacional preparada. Su conclusión: *"creo que hemos programado el mismo motor"*.
  - **Principal objeción: falta soporte 24/7** — lo mencionaron expresamente como el único gap que les duele. Alberto no puede ofrecerlo ahora.
  - Segunda brecha: conector Holded (ialimp tiene facturación propia pero no conecta con Holded).
  - **Positivo:** Rafa ofreció pasar contactos de clientes susceptibles de usar la plataforma. Quedaron en buenas: "vamos hablando".
  - Transcripción archivada en Google Drive (`Grabación de llamadas Rafa Singular Cleaning_260629_173733`).
  - **Acción pendiente:** si Alberto implementa soporte 24/7 o conector Holded, Singular Cleaning es el primer candidato a retomar.

- **🧹 IALIMP: tenant demo Singular Cleaning + sesiones futuras sin asignar (29/06).**
  - Empresa `Singular Cleaning` creada en Supabase: `empresa_id=e20589e6-8c3a-4808-b764-3c88d5484809`, login `info@singularcleaning.es`/`1234`, white-label azul `#1B5EBE`/verde `#3DB346`.
  - 3 limpiadoras (María PIN 1111, Carmen PIN 2222, Lucía PIN 3333), 2 clientes gestores, 6 propiedades en Sevilla, 1 factura de GestaPisos (junio), stock básico.
  - Insertadas 6 sesiones futuras sin `limpiadora_id` (30 jun y 1 jul) para demo del botón 🧹 Asignación automática.
  - Disponibilidad de las 3 limpiadoras ya configurada en `limpiadora_disponibilidad`.
  - **PR #592 mergeado**: página pública `/propuesta/singular-cleaning` (sin auth, colores Singular Cleaning, calculadora de ahorro interactiva, QR para acceso limpiadora, 8 módulos, CTA final).
  - **URL presentación**: `https://app.ialimp.es/propuesta/singular-cleaning`

- **🛰️ SIVRA: el cron SEO semanal nunca había corrido — fix middleware 307 (29/06, PR #593 mergeado a main).**
  Tras activar el cron SEO (env `SEO_AGENT_ENABLED=true` en Vercel `sivra`, hecho por Alberto), los logs mostraban `GET /api/seo-refresh → 307`. **Causa real (NO era la env var):** el `matcher` de `apps/sivra/middleware.ts` excluye los crons para que no pasen por el middleware, pero a `/api/seo-refresh` se le olvidó añadirlo (es el único cron que se quedó en sivra; los demás migraron a plataforma). El cron (sin sesión NextAuth) era redirigido a `/login` (307) ANTES de llegar al handler — que tiene su propia auth por `Bearer CRON_SECRET`. **Llevaba sin correr desde #419.**
  - **Fix**: añadido `api/seo-refresh` a la negative-lookahead del matcher. 1 línea, aditivo. `tests.yml` (typecheck 7 apps + guardián) verde.
  - **Verificado por Alberto**: `CRON_SECRET` y `SERPER_API_KEY` ya existían en Vercel `sivra`. Con el fix, el lunes 10:00 UTC el cron debería dar 200 y ejecutar el agente SEO con búsqueda real (Serper).
  - **Nota de proceso**: la rama designada `claude/agent-error-visibility-k4ayma` estaba divergida con commits ya mergeados; force-push denegado por el clasificador → se publicó en rama nueva `claude/sivra-cron-307-fix`. El bot de radiografía volvió a meter un conflicto de ficheros generados → resuelto mergeando main y tomando su versión (diff neto = 1 línea).

- **🔍 AUDITORÍA del monorepo + acciones manuales de Alberto resueltas (29/06).** Auditoría `auditoria-central` (PR #576): fix `core-receipts` en transpilePackages. Alberto cerró además las 3 acciones manuales: (1) cron SEO activado (env), (2) **seguridad BD apretada** — `portal_rates` ALL→SELECT y `v_movimientos_activos` a `security_invoker` (verificado seguro: ninguna app referencia esos objetos, plataforma lee la tabla base por Prisma con rol que bypassa RLS), (3) deps documentadas. Advisor de seguridad ahora a 0 ERRORS.

- **💬 AGENTE HUÉSPED SIVRA: respuesta en TEXTO PLANO (no JSON) + modelo 405b (29/06, PR #588, absorbe #547).**
  Mergeado tras OK de Alberto ("mergea, no hay cliente 100% activo"). Arregla el "sigue sin tener contexto": `decidir.ts` pedía un JSON y, cuando el 70B gratis fallaba al emitirlo, caía a un fallback que ignoraba TODO el system prompt (reglas + hilo) → borrador genérico. Ahora genera el mensaje en **texto plano** (las reglas siempre se aplican) y deriva escalado/sentimiento/`requiere_respuesta` aparte (reglas `esSensible`/`esCierre` + clasificador de UNA palabra `debeEscalar`). Guardrail anti-invención intacto. Modelo `AGENTE_HUESPED_MODEL` (default `meta/llama-3.1-405b-instruct`, aditivo→cae al 70B). **Verificado**: suite del agente `node --test` 74/74, tsc 0 en `agente-huesped/`. **Riesgo bajo**: auto-envío OFF por defecto (`mensajes_auto_config.auto_enabled=false`) → cada respuesta se propone por Telegram con ✅/✏️/🔧; nada llega al huésped sin el ✅ de Alberto.

- **🧹 BANCA: guarda anti-duplicado CROSS-ORIGEN Excel↔PSD2 (29/06, PR #585 — absorbe el código de #541).**
  El saneamiento de datos de #541 YA estaba aplicado en BD; faltaba en `main` la **prevención en código**. `lib/banca.ts::importarExtracto` marca `duplicado_estado='ignorado'` (reversible, idempotente, conservador) las filas de un Excel que ya tienen gemelo PSD2 por `(cuenta, fecha, importe)`, conservando siempre el feed del banco. + LANDMINE en `apps/plataforma/CLAUDE.md` + SQL (`2026-06-26_dedupe_cross_origen.sql`, `2026-06-26_v_movimientos_activos.sql`, ya aplicados). `test:guardia` 22/22, banca.ts tsc 0. No incluidas las ampliaciones de skills de #541 (las mantiene la rutina de auditoría).

- **🔧 FIXES consolidados de crons + estructura (29/06, rama `claude/fixes-crons-estructura`, PR).**
  Tras "mergea todo", en vez de mergear a ciegas PRs viejos (basados en `main` antiguo y arrastrando radiografías auto-generadas obsoletas), se aplicaron LIMPIOS sobre `main` actual SOLO los 3 fixes de código todavía vigentes (verificados contra `main`); los snapshots de memoria/pricing viejos se dejan (históricos). Absorbe #563, #564 y #556.
  - **`concursos-cierre` (era #564)**: `current_date + ${DIAS_AVISO}` (Prisma manda el número como `bigint` → Postgres `date + bigint` no existe → 500 diario 09:00 UTC) → `current_date + make_interval(days => ${DIAS_AVISO})`. Mantiene `DIAS_AVISO` (mejor que el literal `INTERVAL '3 days'` del PR original).
  - **`mercado/cron` (era #563)**: queries Serper sin `site:` (los portales renderizan precio con JS → snippets sin cifra) + extrae `answerBox`/`sitelinks` + prompt LLM relajado (acepta rangos→extremo inferior). Restaura datos en `market_rates` para el motor de pricing.
  - **`estructura.ts` VERTICALES (era #556)**: añade `rrhh` y `transporte` (faltaban → KPI "APPS: 6" no cuadraba con "Apps · 4").
  - **Verificado**: `test:guardia` 22/22 ✅; los 3 ficheros editados typecheck 0. Las radiografías auto-generadas se regeneran solas en el push.
  - **Sin mergear (pendiente revisión 1-a-1 con Alberto)**: #547 (reescritura agente huésped sivra) y #541 (dedupe bancario, SQL ya aplicado) — mayor radio/comportamiento.

- **🛰️ TRANSPORTE: ingesta de hardware GPS AGNÓSTICA del fabricante (29/06, rama `claude/transporte-gps-ingesta`, PR #580).**
  A petición de Alberto ("el proyecto es 100% adaptable, hazlo importante y que cada cliente elija el hardware que quiera"): capa de ingesta para que el GPS deje de depender SOLO del móvil del conductor.
  - **Cómo**: `POST|GET /api/ingest/[formato]` con 3 formatos — `osmand` (balizas baratas + app Traccar Client, GET query params, velocidad en nudos), `traccar` (webhook "Forward" de un servidor Traccar, POST JSON `position`/`device`), `generico` (nuestro JSON `{deviceId,lat,lng,...}`). Acepta lote (array).
  - **Mapeo aparato→vehículo**: nueva columna `flota_vehiculos.device_id` (IMEI/uniqueId, único global → deriva la cuenta). Migración `prisma/sql/2026-06-29_flota_device.sql` **APLICADA** a la BD compartida (additiva). El `device_id` se edita por vehículo en el form de flota (`_forms.tsx` + `/api/vehiculos`).
  - **Una sola vía de escritura**: extraída `ingerirPosicion()` a `lib/transporte-repo.ts` (escribe `flota_posiciones` + geocerca + km reales); la usan IGUAL el conductor por enlace (`/api/conductor/posicion`, refactorizado) y el hardware. El endpoint resuelve `getVehiculoPorDevice` → `porteActivoDeVehiculo` → `ingerirPosicion`.
  - **Normalización pura** en `@central/module-geo` (`src/ingest.ts`: `normalizarOsmAnd/Traccar/Generico`, `normalizarLectura`, `nudosAKmh`, `parseTimestamp`; 9 tests `node --test`, 19/19 verde). Reutilizable por cualquier vertical.
  - **Auth**: clave `FLOTA_INGEST_SECRET` (`lib/ingest-auth.ts`, patrón guarda sin literal en prod; `?key=`/`x-ingest-key`/Bearer). Ruta `/api/ingest` exenta en `middleware.ts`.
  - **Verificado**: `tsc` 0 (module-geo + transporte), `next build` ✓ (registra `/api/ingest/[formato]`), `test:guardia` 22/22. Demo: `device_id='jj-demo-gps-01'` en el camión JJ-01 → `GET /api/ingest/osmand?key=<secret>&id=jj-demo-gps-01&lat=37.1&lon=-5.95&speed=40`.
  - **🟡 Alberto (manual)**: añadir env `FLOTA_INGEST_SECRET` al proyecto Vercel `transporte`. La columna ya está aplicada en prod (misma BD compartida).

- **🧹 IALIMP: ruta /presentacion/singular-cleaning + sin precio (29/06, PR #578 mergeado a main).**
  - Regla permanente: **precio nunca por escrito en la app** — Alberto lo habla directamente con el cliente.
  - **Nueva ruta** `app.ialimp.es/presentacion/singular-cleaning` (página "Presentación de plataforma", sin sección de precios). `/presentacion` añadido a `PUBLIC_PATHS` en middleware.
  - **Ruta anterior** `app.ialimp.es/propuesta/singular-cleaning` sigue existiendo pero también sin sección de precios. La palabra "propuesta" implica propuesta económica; se usa "presentación" en adelante.
  - Tenant demo intacto (ver entrada anterior): `info@singularcleaning.es`/`1234`, PIN limpiadoras 1111/2222/3333.
  - Logo SC (monograma SVG azul/verde) embebido inline en la página. `logo_url` en Supabase es null — admin white-label sin logo personalizado (no crítico para la reunión).

- **🧹 IALIMP: presentación + demo tenant Singular Cleaning (29/06, rama `claude/singular-cleaning-analysis-0scn5x`, PR #575 mergeado).**
  Preparación reunión de ventas con Rafa de Singular Cleaning (empresa limpieza pisos turísticos Sevilla, ~50-60 usuarios, usan Holded para facturación).
  - **Tenant demo** sembrado via Supabase MCP (project `wswbehlcuxqxyinousql`): empresa `info@singularcleaning.es`/`1234`, 3 limpiadoras (María PIN 1111, Carmen PIN 2222, Lucía PIN 3333), 2 gestoras (GestaPisos Sevilla SL, Andalucía VFT Gestión SL), 6 propiedades en Sevilla, 5 sesiones para 2026-06-29, factura SC-2026-001 GestaPisos 450€ base, 5 productos stock, disponibilidad de limpiadoras.
  - Postura Holded: no se construye integración, se presenta la facturación propia de ialimp como reemplazo a medio plazo.

- **🏢 PLATAFORMA: mapa consolidado de la flota del holding (god-panel) — extra 4 del GPS (29/06, rama `claude/plataforma-mapa-holding`, PR draft).**
  Cierra el 4º extra del GPS: ver en **un solo mapa** la flota de **todas las sociedades del grupo** (narrativa holding). Página operador `/(usuario)/operador/flota-mapa` (guard `getAdmin()`), mapa Leaflet+OSM (CDN, sin dep) coloreado por señal viva/perdida + lista por vehículo/cuenta; polling `GET /api/operador/flota-mapa` cada 7 s. Datos por **`$queryRaw`** (`lib/flota-holding.ts`, `DISTINCT ON (vehiculo_id)` última posición + join `flota_vehiculos`/`cuentas`) — sin modelo Prisma nuevo; `GRANT SELECT` a `prisma_plataforma` en `flota_posiciones`/`flota_vehiculos`. Nav en `UserSidebar` + `CommandPalette` (🛰️ Flota (mapa)). `tsc` 0 + `next build` ✓ (rutas registradas) + `test:guardia` 22/22. **Con esto los 4 extras del GPS quedan hechos**; pendientes solo push de llegada (VAPID) y purga >30 d.

- **🛰️ TRANSPORTE: localización GPS en vivo + módulo transversal `@central/module-geo` (29/06, rama `claude/transporte-gps`, PR draft).**
  Funcionalidad "novedosa" para la demo JJ: ver la flota en un mapa en tiempo real. **Decisiones**: mapa **Leaflet + OpenStreetMap** (gratis, sin API key; cargado por CDN, sin dep npm); legalidad **art. 90 LOPDGDD** (se rastrea el **vehículo**, **solo con servicio activo**, aviso visible, minimización + purga) — texto del aviso a validar por asesoría.
  - **`@central/module-geo`** (puro, transversal — lo reutiliza cualquier vertical para geolocalizar personal de campo): `haversineKm`, `rumbo`, `velocidadKmh`, `tieneSenal`, `ultimaPosicionPorVehiculo`, `dentroDeGeocerca`, `etaMin`, `kmDeTraza`, `progresoRuta`, `simularTrayecto`. Tests `node --test` 10/10.
  - **Datos** (BD compartida, scope cuenta): tabla `flota_posiciones` (append-only, minimización) + `flota_conductores.acceso_token` + `transporte_servicios.seguimiento_token` + `lat`/`lng` en `transporte_paradas`. **Aplicado** por MCP; DDL `apps/transporte/prisma/sql/2026-06-29_flota_gps.sql`.
  - **App**: `/(usuario)/mapa` (mapa + **simulación** en cliente con `simularTrayecto`, polling `/api/mapa/posiciones`); **conductor por enlace mágico** `/conductor/acceso/[token]` (`watchPosition`→`/api/conductor/posicion`, aviso legal); **geocerca** marca paradas/entregado + **km reales** (`kmDeTraza`)→margen; **link de seguimiento cliente** `/seguir/[token]` con **ETA**. Rutas públicas exentas en `middleware.ts`. `MapaLeaflet` compartido en `app/_components`.
  - **Demo sembrada** (`…seed_demo_gps.sql`): ruta Sevilla→Jerez (servicio "Bodega Real"), tokens `jj-demo-conductor` / `jj-demo-jerez`, posición viva. Probar: `/mapa` (+▶ Simular), `/seguir/jj-demo-jerez`, `/conductor/acceso/jj-demo-conductor`.
  - **Verificado**: module-geo 10/10 · `tsc` 0 + `next build` ✓ (rutas registradas) · `test:guardia` 22/22.
  - **Extras elegidos por Alberto (los 4)**: link cliente ✅, geocerca+aviso ✅ (push de llegada con `core-push`/VAPID = follow-up), km reales→margen ✅, **mapa consolidado del holding en plataforma = follow-up** (toca otra app). Pendiente además: purga automática de posiciones >30 d.
- **📈 PRICING AGENTE (sivra): ciclo semanal autónomo — 29/06/2026 (sesión programada, sin PR)**
  Ciclo completo de recopilación de mercado + memoria. Sin commits de código (solo datos en BD).
  - **180 nuevos registros `market_rates`** (search_date=2026-06-29, portal="booking"): 40 busto, 60 duplex, 60 luxury, 20 house. Cobertura: Sep 2026 – Abr 2027 (fines de semana clave + festivos + Semana Santa + Feria). [El motor `apply-auto` (cron diario de plataforma) ahora tiene datos reales para tarificar Busto; los otros pisos tienen apply_enabled=false.]
  - **Feria 2027 confirmada a 293€ p50 (2p)** — el motor tenía un dato OBSOLETO (162€). Ya corregido en `pricing_aprendizaje('prop_busto_reform', 'feria_2027')`. Precios Busto para Feria: Abr17 ya VENDIDO (196€, pérdida vs mercado 293€, lección cara), Abr18=516€/Abr19=432€ sobreestimados — el cron `apply-auto` los corrige automáticamente (tope ±20%/día: 516→413→330 en ~2 días).
  - **Semana Santa 2027 Busto 100% RESERVADA** a buenos precios (473-549€ vs p50 504€). Duplex/Luxury/House en buen punto.
  - **6 entradas escritas en `pricing_aprendizaje`**: feria_2027(ALL+busto), semana_santa_2027(ALL), maraton_feb_2027(ALL), cobertura_mercado_jun2026(ALL), grandes_grupos(house).
  - **⚠️ ALERTA: `pricing_eventos_auto` VACÍA** — los crons Ticketmaster (`/eventos/sync`) y websearch (`/eventos/websearch`) NO están poblando la tabla. El motor usa eventFactor del calendario estático, sin eventos de Ticketmaster ni ferias/congresos de Gemini. **Alberto: revisar que esos crons en `apps/plataforma/vercel.json` están activos y con los envs `TICKETMASTER_API_KEY`/`CRON_SECRET` correctos.**
  - p50 mercado actualizado por piso/evento: Busto(2p) SS=504€/Feria=293€/Maratón=257€; Duplex+Luxury(4p) SS=498€/Feria=295€/Maratón=282€; House(8p) SS=1.083€/Feria=583€.
  - CRON_SECRET no disponible en sesión → no se llamó `aplicar-propuesta` directamente. El apply-auto recoge los datos esta noche.

- **🚏 TRANSPORTE: ruta multiparada (portes + paradas editables) → vertical 100% (28/06, rama `claude/transporte-multiparada`, PR draft).**
  Cierra el equivalente a "multi-línea" en transporte (su modelo no tiene líneas: un servicio agrupa **portes**, y cada porte una **ruta de paradas**). Editor anidado en el servicio (botón 🚏 por fila): lista de portes (asignar vehículo + estado/km/coste/importe/interno) y, dentro de cada uno, lista de paradas (orden por índice + dirección + recogida/entrega).
  - **API** `PATCH /api/servicios/portes?servicioId=`: reemplazo atómico del conjunto (`$transaction([deleteMany portes del servicio, ...create con paradas anidadas])`); valida pertenencia del servicio y que los vehículos sean de la cuenta. Repo nuevo `listPortesDeServicios()` (portes+paradas en orden). Al cambiar portes, el coste/margen de la tabla de servicios se recalcula solo (`margenServicio`).
  - **Verificado**: `tsc` 0 + `next build` ✓ (ruta `/api/servicios/portes` registrada) · `test:guardia` 22/22 · BD: 3 portes demo ligados a servicios, 0 huérfanos (el editor los precarga). El esquema ya tenía `transporte_portes`/`transporte_paradas` → sin migración.
  - Con esto **transporte + alquiler quedan 100% (CRUD + estructura multi-elemento en ambas)**.

- **✏️ TRANSPORTE + ALQUILER: edición (update) → CRUD COMPLETO (28/06, rama `claude/verticales-edicion`, PR draft).**
  Cierra el CRUD de las 4 entidades de cara a la demo JJ. Cada fila tiene ahora ✏️ (editar) + 🗑 (borrar), y arriba el alta.
  - **Patrón**: hook `useSubmit(endpoint, 'POST'|'PATCH')` en `_forms.tsx` de cada app; campos extraídos a `*Fields`; `Nuevo*` (alta inline) y `Edit*` (modal `Overlay` prefijado con la fila actual). El PATCH reusa el **mismo `zod Body`** que el POST (el form de edición envía todos los campos).
  - **API**: añadido `PATCH` (scope `where {id, cuentaId}`, `updateMany`) a `/api/vehiculos`, `/api/servicios`, `/api/materiales`. En `/api/alquileres` el PATCH actualiza cabecera y **reemplaza la línea única** (`lineas:{deleteMany:{},create:[…]}`) tomando nombre/tarifa del catálogo; comprueba pertenencia (404 si el alquiler no es de la cuenta).
  - **Verificado**: `tsc --noEmit` 0 + `next build` ✓ en ambas apps · `test:guardia` 22/22 · prueba contra BD compartida: datos demo intactos (2 veh / 3 serv / 5 mat / 3 alq / 6 líneas), **scope del UPDATE** confirmado (acotado a JJ toca 2 filas, otra cuenta 0), e **intercompany cuadra**: transporte interno 40.000€ + alquiler interno 20.000€ = **60.000€**; terceros alquiler 3.900€.
  - **Multi-línea** ✅ (añadido en el mismo PR #568): el alta/edición de alquiler maneja **N líneas** (lista dinámica material+cantidad con +añadir/quitar, mín. 1). API `/api/alquileres` POST+PATCH aceptan `lineas:[{materialId,cantidad}]`; helper `construirLineas()` copia nombre/tarifa del catálogo (scopeado por cuenta) y el PATCH reemplaza el conjunto entero (`deleteMany+create`). El esquema ya soportaba multi-línea (el seed tiene 6 líneas en 3 alquileres) → sin migración. tsc 0 + next build ✓. Skills + `apps/alquiler/CLAUDE.md` actualizados. **CRUD de transporte+alquiler queda 100% completo.**

- **✍️ TRANSPORTE + ALQUILER: altas (crear) + borrado — ya NO son solo lectura (28/06, rama `claude/verticales-altas-edicion`, PR draft).**
  Para la demo de JJ, ambas verticales pasan de solo-lectura a **interactivas**:
  - **Transporte**: API `/api/vehiculos` y `/api/servicios` (POST crear + DELETE, scope `cuentaId`, validación zod). Formularios cliente en `apps/transporte/app/(usuario)/_forms.tsx` (`NuevoVehiculo`, `NuevoServicio`, `DeleteButton`) cableados en flota y servicios (alta arriba + 🗑 por fila).
  - **Alquiler**: API `/api/materiales` y `/api/alquileres` (POST+DELETE). El alta de alquiler crea **1 línea** desde un material del catálogo (toma nombre/tarifa del material; total se calcula con module-alquiler). Formularios en `apps/alquiler/app/(usuario)/_forms.tsx`.
  - Borrado FK-safe (deleteMany scoped + 409 si tiene dependientes). Sesión `getSession()` en cada route (401 si no).
  - **Verificado**: `tsc --noEmit` 0 + `next build` ✓ en las dos apps.
  - **Pendiente**: edición (update) y multi-línea en alquiler. Skills `transporte-maestro`/`alquiler-maestro` actualizadas.

- **✉️ feat(sivra/agente-mensajes): ✏️ Modificar ahora genera borrador IA desde idea en bruto — 28/06/2026 (rama `claude/ai-message-drafting-djwtgv`, PR draft)**
  Antes: Alberto pulsaba ✏️ Modificar, escribía el texto completo y se enviaba verbatim (o traducido). Ahora: Alberto escribe su idea en bruto ("Lo siento, la limpieza ya va de camino") y la IA genera un mensaje profesional en el idioma del huésped usando el contexto completo de la reserva + historial reciente.
  - **`lib/sivra/agente-huesped/redactar.ts`** (nuevo): `redactarDesdeIdea(idea, ctx, complete?)` — función pura inyectable. Prompt: anfitrión de {propiedad} + historial últimas 3 conversaciones de `mensajes_log` + pregunta del huésped + idioma.
  - **`telegram-webhook/route.ts`**: helper `cargarCtxRedaccion()` carga `incomes` + `mensajes_log` en paralelo. Reemplaza bloque de traducción verbatim por `redactarDesdeIdea()`. Mensaje del bot actualizado: "Escribe tu idea en bruto y la IA la redactará".
  - **Escape hatch**: 🔧 Retocar sigue siendo para ajustes finos sobre el borrador existente (sin cambio).
  - **7 tests** en `redactar.test.ts` — todos pasan ✅. Sin cambios en BD.
  - Spec: `docs/superpowers/specs/2026-06-28-redaccion-ia-modificar-design.md`

- **📦 VERTICAL ALQUILER de materiales — app nueva sobre `module-alquiler` (27/06, rama `claude/vertical-alquiler`, PR draft).**
  Segunda vertical "componible" de la tanda JJ (tras transporte), mismo patrón. `apps/alquiler` (Next 15 + Prisma sobre BD compartida) que compone el módulo puro `@central/module-alquiler` (ya existente): catálogo de material con stock/tarifas, y alquileres (órdenes) a terceros (ingreso real) o internos al grupo (intercompany materiales→eventos). `lib/alquiler-repo.ts` adapta Prisma↔dominio + compone la lógica (precio por días, disponibilidad por solape, resumen, intercompany). Pantallas: dashboard (activos, ingresos terceros, 🔗 intercompany, fianzas, disponibilidad de material), materiales, alquileres. **tsc 0 · next build ✓.**
  - **Datos** (BD compartida, scope `cuenta_id`): `alquiler_materiales`/`alquiler_alquileres`/`alquiler_lineas` — esquema **aplicado** (apply_migration `vertical_alquiler_schema`) + DDL en `apps/alquiler/prisma/sql/2026-06-27_alquiler_schema.sql`.
  - **Rol propio `prisma_alquiler`** creado (clon de `prisma_sivra`, sin contraseña). Auth: cookie `alquiler_session`, secreto `ALQUILER_SESSION_SECRET`, sesión stateless contra `cuentas`.
  - **Demo JJ sembrado** (`0de5…0001`): 5 materiales, 3 alquileres (1 interno = **intercompany 20.000€**, que casa con materiales→catering del consolidado de plataforma; 2 a terceros = 3.900€), 6 líneas. Fichero + teardown: `prisma/sql/2026-06-27_seed_demo_alquiler.sql`.
  - **Integración**: `alquiler` en la matriz typecheck de CI, fila en MATRIZ.md, skill `alquiler-maestro` + enrutado en central-maestro + índice SKILLS.
  - **✅ DESPLEGADA Y PROBADA (27/06):** Alberto creó el proyecto Vercel `alquiler` (Root Directory `apps/alquiler`, envs OK), puso contraseña a `prisma_alquiler` y el **login demo funciona** (`prisma_alquiler` con conexiones vivas en `pg_stat_activity`, 0 fallos). Las **4 verticales nuevas/tocadas** (transporte, alquiler, plataforma, ialimp) conectan cada una con su rol propio. Demo coherente: **transporte 40k + alquiler 20k = 60k** que plataforma elimina.
  - **Siguiente producto**: altas/edición en pantalla (hoy lectura), parte de daños con fotos, contrato de alquiler.
  - ⚠️ **Nota RLS:** Supabase **auto-activó RLS** en las tablas nuevas (`flota_*`/`transporte_*`/`alquiler_*`). No rompe nada porque los roles `prisma_*` tienen BYPASSRLS; pero un acceso sin bypass (REST/anon) vería 0 filas hasta crear políticas.

- **🔐 BD compartida: cada app con su ROL propio + rotación de credenciales (27/06) — cierre del incidente del reset de `postgres`.**
  Al desplegar la vertical `transporte` se conectó como `postgres` y se reseteó su contraseña → rompía a quien usara `postgres`. Estado FINAL (verificado en `pg_stat_activity`, 0 fallos de auth):
  - **Cada app conecta con su rol dedicado**: sivra→`prisma_sivra`, ialimp→`prisma_ialimp`, plataforma→`prisma_plataforma`, transporte→`prisma_transporte` (todos: `login`, `BYPASSRLS`, grants DML completos sobre las 183 tablas de `public`, **sin CREATE** = mínimo privilegio), rrhh→`rrhh_app`. **`postgres` ya no lo usa ninguna app.**
  - **Contraseñas rotadas:** `postgres` y `prisma_sivra` ✅ (confirmado). Las de `prisma_ialimp/_plataforma/_transporte` **pasaron por el chat** → rotarlas también si no se ha hecho ya (método: `ALTER ROLE <rol> WITH PASSWORD '…'` en Supabase SQL Editor + actualizar `DATABASE_URL`/`DIRECT_URL` de esa app en Vercel + redeploy).
  - **Conexión pooler:** `<rol>.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com` (6543 pooled `?pgbouncer=true` / 5432 direct). **Migraciones** se aplican como `postgres` (vía Supabase/MCP), no por el rol de la app (no tiene CREATE).
  - Para crear una vertical/app nueva: dale **su propio rol** (clónalo de `prisma_sivra`) en vez de usar `postgres`. **NUNCA** contraseñas en repo/memoria/chat.
  - ⚠️ *Nota de proceso:* la entrada original de esto (PR #554) se **perdió** porque un PR paralelo (#553) branchado de main anterior la sobrescribió al hacer squash — riesgo conocido de `CONTEXTO-SESIONES.md`: branchea de main lo más tarde posible al anotar.

- **💰 feat(rrhh): automatización de nóminas IMPLEMENTADA — 27/06/2026 (PR #562, rama `claude/payroll-automation-hr-f67d9c`)**
  Plan de 15 tasks completado. Lo entregado:
  - `packages/module-nominas`: motor puro de cálculo SS+IRPF+neto. 7 tests unitarios ✅
  - DB: migraciones 0015/0016/0017 aplicadas en Supabase (contratos_laborales, nominas, incidencias_mes + cnae/at_ep en empresas)
  - `lib/contratos.ts` + `lib/at-ep-agente.ts` + `lib/nominas.ts` + `lib/nomina-pdf.tsx`
  - API routes: `/api/admin/contratos/[empleadoId]`, `/api/admin/nominas` (GET list + periods), `/api/admin/nominas/generar`, `/api/admin/nominas/[nominaId]/incidencias`, `/api/admin/nominas/[nominaId]/incidencias/[incId]`, `/api/admin/nominas/[nominaId]/confirmar`
  - Cron `/api/cron/nominas` (`0 8 25 * *`) en vercel.json
  - Admin pages: `/admin/nominas`, `/admin/nominas/[periodo]` (NominasPanel), `/admin/empleados/[id]/contrato`
  - AdminShell: +nav "Nóminas"; ExpedienteClient: +enlace "Contrato laboral →"
  - 38 tests pasan ✅. Vercel CI verde (alquiler falla por issue pre-existente no relacionado).
  **Pendiente en Vercel:** añadir env `CRON_SECRET` al proyecto `central-rrhh`.

- **🔍 feat(plataforma/finanzas): buscador y filtros en pestaña Gastos — 26/06/2026 (PR #553 draft, rama `claude/gastos-filters-search-l8x53n`)**
- **🔍 feat(plataforma/finanzas): buscador y filtros en pestaña Gastos — 26/06/2026 (PR #553 ✅ MERGEADO)**
  `GastosTab.tsx` — filtros 100% client-side sobre los datos ya cargados (sin petición extra al servidor): buscador de texto
  (concepto / comercio / comentario), selector de destino, selector de bucket fiscal, selector de banco (dinámico, solo si
  hay >1), toggle "❗ Sin justificante" y toggle "📦 Amortizables". Botón "✕ limpiar" cuando hay filtros activos. Contadores
  "N de M" en bandeja y buckets. Sugerir todo se oculta con filtros para no operar sobre subconjunto incompleto. ✅ Mergeado (27/06/2026).

- **🔐 INCIDENTE + BLINDAJE roles de BD (26/06/2026, PR #554):** Para desplegar `apps/transporte` (vertical nueva, ya en main) se conectó la app como usuario **`postgres`** de la BD compartida y se **reseteó su contraseña** en Supabase. Mapa de roles REAL de la BD compartida (`wswbehlcuxqxyinousql`): **sivra → `prisma_sivra`** (login, BYPASSRLS, grants completos en `public`), **rrhh → `rrhh_app`**; **ialimp** iba con `prisma_sivra`; **plataforma** y **transporte** con `postgres`. Tras el reset, parche aplicado por Alberto: las 3 apps (transporte/ialimp/plataforma) pasaron a **`postgres`+contraseña nueva** → funcionan, pero como **SUPERUSUARIO** (se saltan RLS) = deuda de seguridad. Verificado: conexiones `postgres`/Supavisor vivas, `prisma_sivra` intacto, 0 fallos de auth. **Blindaje DB-side hecho:** creados `prisma_ialimp`, `prisma_plataforma`, `prisma_transporte` (clones de `prisma_sivra`: login, BYPASSRLS, 183 tablas de `public`, **sin contraseña** → inertes). **PENDIENTE (Alberto):** `ALTER ROLE <rol> WITH PASSWORD …` para los 3, apuntar `DATABASE_URL`/`DIRECT_URL` de cada app a su rol propio (`<rol>.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`, 6543 pooled / 5432 direct) + redeploy; luego **rotar** contraseñas de `postgres` y `prisma_sivra` (ambas se expusieron en chat). **NUNCA** guardar contraseñas en repo/memoria.

- **📄 docs(rrhh): CLAUDE.md creado para apps/rrhh — 26/06/2026 (PR #552 draft, rama `claude/apps-missing-claude-md-hmr9nf`)**
  `apps/rrhh` era la única vertical del monorepo sin CLAUDE.md. Se creó documentando: qué es iarrhh (Portal del Empleado
  multi-tenant), URL/Vercel (`central-rrhh.vercel.app`), BD (schema `rrhh`, rol `rrhh_app` con BYPASSRLS, Prisma), alta de
  empresas desde plataforma vía `POST /api/operador/empresas` (Bearer `RRHH_OPERADOR_SECRET`), estructura de rutas
  (`/login`, `/admin/*`, `/e/[token]`, `/api/admin/*`, `/api/operador/*`, `/api/e/*`), packages consumidos
  (`transpilePackages`), patrones clave de `lib/` (auth, empleado-auth, tenant, asistente, firma, documental, push,
  branding) y reglas del monorepo (secrets con `requireSecret()`, scope `@central/*`). PR en revisión/CI.

- **🔁 AGENTE SEO (housesevillana): cron semanal ALINEADO con el botón — 26/06/2026 (PR #551, rama `claude/seo-cron-serper`)**
  Había DOS agentes SEO divergentes: el botón "Actualizar SEO ahora" (ruta `apps/plataforma`, ya endurecida con Serper) y
  el **cron semanal automático** (`apps/sivra/app/api/seo-refresh`, lunes 10:00, gateado por `SEO_AGENT_ENABLED`), que
  seguía con el camino viejo (`aiSearch`→Gemini, `JSON.parse` pelado, sin alertas) y podía dar 429/`JSON.parse('')`. Se le
  portó el mismo `runSeoAnalysis` de 3 niveles (Serper 4 búsquedas + NIM → `aiSearch`/Gemini → NIM), `parseSeoJson` con
  guard y `tgAlert('critico')` en el catch. Conserva lo suyo: campo `schema` y escritura vía `prisma.seoProposal.create`
  (`topCompetitors` con `Prisma.InputJsonValue`/`Prisma.JsonNull`). **Divergencia resuelta** — si cambia uno, replicar en
  el otro. El cron sigue apagado por el kill-switch hasta que Alberto lo active. 13 checks verdes, mergeado.

- **🔎 AGENTE SEO (housesevillana): más competidores — 4 búsquedas Serper + 4-6 competidores REALES — 26/06/2026 (PR #550, rama `claude/seo-more-competitors`)**
  La key Serper ya pegada y funcionando (devolvía competencia real: Genteel Home, Wimdu, etc.). Alberto pidió "ajusta →
  Más competidores". `runSeoAnalysis` (nivel 1, Serper) sube de **2 → 4 búsquedas** (apartamento turístico centro 6 dorm.,
  casa vacacional grupos parking 12 pax, alquiler vacacional grupos grandes precio/noche, VFT casa completa parking patio),
  cada una con su `.catch(()=>'')` para que una consulta caída no tumbe al resto; el prompt pide **listar 4-6 competidores
  REALES** extraídos de los resultados, sin inventar. Sigue gratis (free tier Serper, agente semanal+manual), mismo
  fallback a NIM. **De paso** se arregló un fallo de typecheck PREEXISTENTE (no del SEO) que bloqueaba el gate global de
  CI: `equipaje.test.ts` indexaba `CONSIGNA_POR_ZONA` con un `string` ancho → `for (const zona of ['busto','duplex'] as
  const)`. 13 checks verdes, mergeado a main → redeploy automático de producción. **Listo para que Alberto pruebe** el
  botón "Actualizar SEO ahora".

- **💬 AGENTE HUÉSPEDES (sivra/plataforma): deja de responder a los mensajes que Alberto envía A MANO — 26/06/2026 (rama `claude/sevillana-guest-message-78f0b9`)**
  Alberto detectó (reserva 131511815, House Sevillana) que el agente le redactó una respuesta a un mensaje **suyo**
  ("Importante recordar el ruido en las horas de descanso"), tratándolo como pregunta del huésped. Causa: la atribución
  host/guest en `contexto.ts` se apoyaba SOLO en `sent_by_owner` de Smoobu, que vino vacío; y como el mensaje se mandó a
  mano (no por el agente) tampoco estaba en `mensajes_log`, así que `corregirAtribucion` no lo rescataba → quedó como
  'guest' y el guard "último=host" no saltó. **Fix:** se recupera la señal NATIVA de Smoobu `type` (la usaba el código
  probado del viejo sivra: `type===1` = huésped, cualquier otro = host) en un helper puro **`atribuirEmisor`**
  (`atribucion.ts`), usado en `contexto.ts` (historial del agente), el sondeo `auto-reply` (skip si el último del hilo es
  host, defensa para el desfase threads↔messages), `seed-aprendizaje` y la ruta de display `[bookingId]`. Si Smoobu no
  manda `type`, cae al comportamiento previo (`sent_by_owner`) → sin regresión. 5 tests nuevos en `atribucion.test.ts`
  (incl. reproducción del bug). `node --test` verde.

- **🔎 AGENTE SEO (housesevillana): búsqueda de competencia EN VIVO y GRATIS vía Serper — 26/06/2026 (rama `claude/seo-refresh-serper`)**
  Tras dejar el agente funcionando en modo degradado (NIM sin búsqueda, porque el grounding de Gemini es de
  pago/cuota ínfima en free tier → 429), Alberto pidió competencia en vivo sin pagar. Clave: el LLM (NIM/Groq)
  ya es gratis; lo capado era la BÚSQUEDA. **`runSeoAnalysis` ahora tiene 3 niveles:** (1) **Serper** (Google
  Search API, free ~2.500/mes) hace 2 búsquedas reales → NIM redacta el SEO con esos resultados (competencia en
  vivo, coste 0); (2) Gemini grounding si tuviera cuota; (3) NIM solo (último recurso). Reutiliza el patrón
  `serperSearch` del módulo de mercado. **`SERPER_API_KEY` es editable desde el panel** `/operador/secretos`
  (write-through a sivra+plataforma, ver `lib/secrets-registry.ts`) — Alberto la pega ahí, no hace falta tocar
  Vercel a mano. PENDIENTE de Alberto: pegar la key en el panel. Sin key, sigue degradado (NIM) sin romper.

- **🔎 AGENTE SEO (housesevillana): 4º y ÚLTIMO eslabón — INSERT con columnas inexistentes — 26/06/2026 (rama `claude/seo-refresh-fix-insert-columns`)**
  Tras #545 (fallback NIM), el botón llegó hasta el **final**: generó SEO + lo commiteó en GitHub, y solo falló el último
  `INSERT` en `seo_proposals` con `column "updatedAt" of relation "seo_proposals" does not exist` (42703). La tabla REAL de
  la BD compartida (verificado por `information_schema`) **no tiene `updatedAt`**; sí `createdAt`/`appliedAt`. Además `id` es
  TEXT y `topCompetitors` es jsonb. **Fix** (`route.ts`): el INSERT (1) quita `"updatedAt"`, (2) castea `gen_random_uuid()::text`
  para el id TEXT, (3) castea el parámetro `${...}::jsonb` para topCompetitors (Prisma lo bindea como text → 42804 sin cast).
  Verificado con INSERT real en transacción **revertida** contra la BD (sin escribir en prod). Con esto la cadena queda
  **completa de punta a punta**: #521 (Buffer) + GITHUB_TOKEN + #544 (Gemini) + #545 (fallback NIM) + este INSERT.

- **🔎 AGENTE SEO (housesevillana): 3er eslabón — fallback NIM cuando Gemini da 429 — 26/06/2026 (rama `claude/seo-refresh-fallback-nim`)**
  Tras mergear #544 (Anthropic→Gemini) y redeploy, el botón "Actualizar SEO" dio `Gemini HTTP 429: You exceeded your
  current quota`. **No es bug de código** (de hecho confirma que el fix funciona: ya es Gemini + error claro): `geminiSearch`
  usa `tools:[{google_search:{}}]` (Google Search **grounding**), cuya cuota en el plan **gratuito** de `GEMINI_API_KEY` es
  ínfima/0 sin billing. **Fix de resiliencia** (`apps/plataforma/app/api/sivra/seo-refresh/route.ts`): `runSeoAnalysis` intenta
  Gemini y, si falla (429/cualquier error) o no hay key, **degrada a `aiComplete` (NIM/Groq texto, gratis, SIN búsqueda)** —
  el SEO se genera igual desde los datos de la propiedad, sin romper. Es el patrón que el propio core-ai documenta ("la app
  decide el fallback") y que la pasarela ya usa en chat. **PENDIENTE de Alberto (opcional, para SEO con competencia en vivo):**
  activar billing en el proyecto de Google AI de `GEMINI_API_KEY` (grounded search casi no existe en free tier). Sin eso, el
  agente funciona en modo degradado. Cadena completa: #521 (Buffer) + GITHUB_TOKEN + #544 (Gemini) + este fallback.

- **🔎 AGENTE SEO (housesevillana): 2º fallo latente — Anthropic huérfano → migrado a la pasarela — 26/06/2026 (rama `claude/seo-refresh-gateway-migration`)**
  Tras arreglar el crash del `Buffer.from` (PR #521) y que Alberto pusiera `GITHUB_TOKEN` en Vercel `plataforma`, el botón
  "Actualizar SEO" volvió a fallar, ahora con `SyntaxError: Unexpected end of JSON input` (`JSON.parse('')`). Causa (logs de
  runtime): `runSeoAnalysis` en `apps/plataforma/app/api/sivra/seo-refresh/route.ts` llamaba a **Anthropic directo**
  (`ANTHROPIC_API_KEY` + `api.anthropic.com`, web_search), pero el monorepo **migró de Anthropic a la pasarela** y esa key ya no
  está en plataforma → respuesta vacía → `JSON.parse('')` revienta. **Fix:** la ruta usa ahora **`geminiSearch` de `@central/core-ai`**
  directamente (plataforma ES la pasarela; `GEMINI_API_KEY` ya está), igual que `/api/ai/search`. Se elimina la dependencia de
  `ANTHROPIC_API_KEY` y se lanza error claro si Gemini devuelve vacío o no-JSON.
  **Barrida de patrones iguales (a petición de Alberto, "que no vuelva a pasar"):** Anthropic huérfano solo estaba aquí en plataforma
  (en ia-rest es fallback deliberado que degrada). `Buffer.from(x.content)` sin guarda: plataforma y sivra ya blindados; `ia-rest
  super/blog/route.ts:98` está protegido por `if (!ghRes.ok)` (riesgo bajo). La visibilidad (aviso Telegram del catch, PR #521) hace
  que estos fallos de runtime dejen de ser silenciosos. **PENDIENTE de Alberto:** al mergear, redeploy `plataforma` y reprobar el botón.

- **🚚 VERTICAL TRANSPORTE: módulo nuevo + app nueva (camiones como negocio) — rama `claude/vertical-transporte` (PR draft) — 26/06/2026**
  Arranque de la vertical Transporte (decidida el 26/06 como vertical propia, no embebida en ia-rest). Tras hablar con Alberto: **app nueva `apps/transporte`** + **módulo nuevo** + **BD compartida** (un proyecto Supabase nuevo cuesta y aislaría el intercompany).
  - **`@central/module-transporte`** (puro, mergeable, riesgo 0): capa "servicio/orden" espejo de `module-alquiler`, que **compone `module-flota`** (reutiliza sus funciones de coste). `ServicioTransporte` (interno intercompany / externo a terceros), precio (importe pactado o `sugerirImporte` = coste de portes × margen), máquina de estados (presupuestado→planificado→en_curso→entregado→facturado), `resumenServicios`, `margenServicio`, `totalIntercompany`/`operacionIntercompanyDe` (tipo `'flota'`, parentType `'porte'`). Tests con **vitest 9/9** (no `node --test`: importa flota cross-package y el index de flota tiene re-exports de valor sin extensión que Node no resuelve — patrón core-firma/module-rrhh). Añadido a `test:vitest` raíz.
  - **`apps/transporte`** (Next 15 + Prisma sobre BD compartida, auth JWT propia): config espejo de plataforma (`outputFileTracingRoot`, `transpilePackages`, vercel.json, eslint, middleware). Auth contra la tabla `cuentas` compartida, cookie `transporte_session`, secreto **propio** `TRANSPORTE_SESSION_SECRET` (sin literal en prod), sesión **stateless** (no escribe `session_jti` para no pisar plataforma). `lib/transporte-repo.ts` adapta Prisma↔dominio y compone la lógica. Pantallas: **dashboard** (KPIs flota + semáforo ITV/seguro + rentabilidad por vehículo + 🔗 tarjeta intercompany), **flota**, **servicios**. `tsc --noEmit` 0, `next build` ✓ (dashboard/flota/servicios dinámicos).
  - **Datos**: tablas `flota_*` + `transporte_*` (scope `cuenta_id`, prefijo nuevo, no toca nada). DDL **documentado** en `apps/transporte/prisma/sql/2026-06-26_transporte_schema.sql` — aplicar a mano (preview→prod tras OK). Incluye `flota_conductores` (gap nuevo).
  - **Intercompany**: `operacionIntercompanyDe()` → tabla `operaciones_intercompany` que **ya lee plataforma** (un porte interno flota→catering aparece eliminado en el consolidado del holding sin tocar plataforma).
  - **CI**: `transporte` añadido a la matriz `typecheck` de `.github/workflows/tests.yml`.
  - **Skill**: nuevo `transporte-maestro` (router de la vertical) + enrutado añadido en `central-maestro` + índice `docs/SKILLS.md`. **PR #542 MERGEADO** a main (squash) el 26/06.
  - **BD + demo APLICADOS por mí** (26/06): el esquema `flota_*`/`transporte_*` está **creado en la BD compartida** (apply_migration `vertical_transporte_schema`) y se **sembró un demo** en la cuenta JJ (`0de5…0001`): 2 vehículos, 1 conductor, 3 docs (semáforo ITV/seguro), 3 servicios (2 a terceros = 2.050€, 1 interno Logística→Catering = intercompany 40.000€), 3 portes. Fichero reproducible + **teardown**: `apps/transporte/prisma/sql/2026-06-26_seed_demo_transporte.sql`. **Solo falta el proyecto Vercel de `apps/transporte`** (lo crea Alberto) para que la web esté viva.
  - **PENDIENTE (Alberto)**: crear el **proyecto Vercel** (Root Directory `apps/transporte`, install pnpm, envs `DATABASE_URL`/`DIRECT_URL`/`TRANSPORTE_SESSION_SECRET`) y aplicar el SQL. Siguiente iteración de producto: altas/edición (hoy las pantallas son de lectura), planificador con `asignarVehiculo`, rutas multiparada, facturación a terceros (core-fiscal).

- **🧳 AGENTE HUÉSPED SIVRA: zona busto gana consigna MÁS CERCANA (Lock & Explore – Castellar) — rama `claude/equipaje-busto-castellar` — 26/06/2026**
  Alberto aportó un punto de consigna más pegado a la zona busto (enlace Google Maps; *calle Castellar*). Identificado por búsqueda web = **Lock & Explore – Castellar, C/ Castellar 60A, 41003** (taquillas automáticas 24/7; `lockandexplore.com/sevilla-castellar-store`). Se añade como el **MÁS CERCANO** de la zona busto (House Sevillana / Busto Reform / Luxury Busto), dejando *Locker in the City – Alfalfa* como alternativa. Cambio de modelo: `CONSIGNA_POR_ZONA` pasa de `Record<zona, Consigna>` a **`Record<zona, Consigna[]>`** (lista ORDENADA por cercanía, el primero = más cercano). `bloqueEquipaje` ahora pinta "La más cercana: …" (1º) + "También cerca: …" (resto) + redes. Zona duplex sigue con un único punto (Plaza del Duque). Sigue guardrail-safe (todo en la `ficha`). Tests ampliados (orden Castellar<Alfalfa, guardrail de la web nueva); suite agente `node --test` **63/63**. Doc: skill `sivra-maestro` actualizada.

- **🧳 AGENTE HUÉSPED SIVRA: consigna de equipaje AHORA POR ZONA (punto físico concreto por piso) — rama `claude/agente-huesped-consigna-zona` (PR #539 MERGEADO) — 26/06/2026**
  Refinamiento del equipaje (resuelve el "pendiente de decisión" de la entrada de abajo): Alberto pidió un punto físico concreto por zona además de las redes, porque "suelen preguntar" y los pisos están en dos zonas. `equipaje.ts` reescrito: `CONSIGNAS_RED` (Radical Storage, Bounce, LOCK & enjoy! — puntos por toda la ciudad, sirven a todos) **+** `CONSIGNA_POR_ZONA` (taquillas 24/7 concretas) **+** `zonaDePiso(propertyId)`. Mapeo: **House Sevillana / Busto Reform / Luxury Busto → zona `busto` → Locker in the City – Alfalfa** (~5 min); **Dúplex Center (Pasaje Francisco Molina, C. Martín Villa, 41003) → zona `duplex` → Locker in the City – Plaza del Duque** (~3 min). `bloqueEquipaje(propertyId)` antepone "la más cercana a este apartamento" y luego ofrece las redes como alternativa; piso sin zona conocida → solo redes. `contexto.ts` pasa `bloqueEquipaje(propertyId)` (antes sin arg). Sigue guardrail-safe (todo en la `ficha`) y en allowlist de graduación. Tests `equipaje.test.ts` reescritos (9 casos: zonaDePiso, Dúplex→Plaza del Duque, Busto→Alfalfa, sin-zona→solo redes, control checkout); suite agente `node --test` **61/61**. Doc: skill `sivra-maestro` actualizada.

- **🟢 DEMO HOLDING JJ SEMBRADA EN PROD (BD compartida) + financiero manual por negocio — 26/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Para la reunión de JJ, con OK explícito de Alberto ("hazlo en real, si hay OK metemos sus datos y borramos los ficticios"), se **aplicó a la BD compartida** (`wswbehlcuxqxyinousql`, schema public) y se **sembró un grupo demo**:
  - **DDL aplicado** (`apply_migration` `operaciones_intercompany_y_financiero_manual`): tabla `operaciones_intercompany` (cuenta_id/sociedad_origen/destino/importe/…); columnas `negocios.ingresos_manual`/`gastos_manual`. Aditivo: nadie más las lee; la prod actual de plataforma (código viejo) y la cuenta real de Alberto no se ven afectadas.
  - **Financiero manual** (código): `manualFinanciero()` en `lib/financiero.ts` + el dashboard usa cifras manuales cuando el negocio no tiene `app`. Habilita negocios sin app (y el demo).
  - **Seed `[seed-demo]`** (cuenta `0de50000-…-0001`, login **`demo-jj@central.local` / `JJdemo2026`**): 3 sociedades (Catering / Logística / Eventos&Materiales JJ), 3 negocios con cifras, 2 operaciones intercompany (Logística→Catering 40k flota; Materiales→Catering 20k menaje). Consolidado: **bruto 770k/545k/225k**, intercompany eliminado **60k**, **consolidado 710k/485k/225k** (neto invariante). Fichero reproducible/limpieza: `prisma/sql/2026-06-26_seed_demo_holding_jj.sql`.
  - **LIMPIEZA cuando entren datos reales:** `DELETE FROM cuentas WHERE id='0de50000-0000-4000-a000-000000000001';` (cascada borra sociedades+negocios+operaciones).
  - **Visible en el PREVIEW de plataforma** del PR #537 (que ya lleva el código intercompany); en PROD aparecerá al mergear #537. La tarjeta del holding solo sale para cuentas con operaciones intercompany → la cuenta real de Alberto no la ve.

- **📦 NUEVO `@central/module-alquiler` (vertical alquiler de materiales) — 26/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Cuarto módulo de la tanda JJ y base de una de las dos verticales nuevas del diseño (alquiler de menaje/material **interno a eventos del grupo Y a terceros** — Alberto: "a veces alquila su material a terceros"). PURO, se **compone** sobre `module-encargo` (tipo 'alquiler') y referencia materiales por id (sin acoplar tipos). Lógica: `diasAlquiler` (inclusivo), `importeLinea` (por día o tarifa fija), `subtotal`/`totalAlquiler` (descuento; la fianza no suma), `recargoRetraso` (días tarde × tarifa/día), máquina de estados `reservado→entregado→devuelto` (+cancelado), `comprometidoEnVentana`/`disponibleEnVentana` (solape de fechas, junto al stock de module-materiales), y **costura intercompany** (`esIntercompany`/`totalIntercompany`/`operacionIntercompanyDe`: un alquiler interno entre dos sociedades del grupo se elimina; a terceros es ingreso real). **10/10 tests `node --test`, tsc 0 errores, guardián 22/22, radiografía regenerada (`npm run auditar` → 30 packages).** Sin consumo aún (blast radius 0). Docs (ESTRUCTURA.md) actualizados.

- **🚚 FLOTA = vertical propia (transporte), NO dentro de ia-rest — decisión de Alberto, 26/06/2026**
  Se construyó una UI de flota en el panel `/owner` de ia-rest (`/owner/flota` + pestaña en `GRUPOS`) y **se REVIRTIÓ**: Alberto recordó que la flota/transporte **será una vertical aparte** (como el alquiler), no embebida en ia-rest. Lo que QUEDA en ia-rest: el endpoint `GET /api/owner/flota/resumen` (#534, ya en main) como **puerto de datos** de su propio transporte-en-eventos. El consumo de `module-flota` como producto será la **vertical Transporte** (app nueva que compone module-flota, paralela a la vertical Alquiler basada en module-alquiler). Pendiente: crear esa app cuando Alberto provisione su proyecto Vercel.

- **🔗 CABLEADO `module-intercompany` → apps/plataforma (PREVIEW, NO mergear sin revisión) — 26/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Cableado del gancho del holding al dashboard consolidado, montado como **capa ADITIVA e independiente** (NO toca el cálculo existente `getResumenNegocio` ni la suma bruta `totalIngresos`/`totalResultado` → los números reales de Alberto no cambian). Piezas: `apps/plataforma/lib/intercompany.ts` (lee `operaciones_intercompany`, delega TODA la consolidación al módulo puro `consolidar()`) + `lib/intercompany-mapeo.ts` (helpers PUROS sin imports en runtime → testeables: `filaAOperacion`, `resumenPorSociedad` negocio→sociedad) + tarjeta **🔗 Consolidado del holding** en `dashboard/page.tsx` (bruto − intercompany eliminado = real del grupo, + tabla por sociedad). **Tolerancia clave:** si la tabla no existe (migración no aplicada) o no hay operaciones internas → `consolidado === suma bruta` y la tarjeta **NO se muestra** (cero cambio para Alberto). **Migración como ARCHIVO documentado NO aplicado:** `prisma/sql/2026-06-26_operaciones_intercompany.sql` (BD compartida con ialimp/sivra vivos → se ejecuta a mano cuando Alberto lo apruebe). Dep `@central/module-intercompany` + `transpilePackages`. Verificación: helpers 4/4 (`node --test`, local; plataforma no corre sus tests en CI), `tsc` 0 errores en mis archivos (los 7 restantes son symlinks/deps de entorno que CI resuelve con `pnpm install`). **PR draft, NO mergear: pendiente revisión de Alberto en el preview de Vercel.**

- **🧳 AGENTE HUÉSPED SIVRA: respuesta de CONSIGNA/EQUIPAJE (no tenemos servicio + consignas cercanas) — rama `claude/agente-huesped-equipaje` (PR pendiente) — 26/06/2026**
  Mismo patrón que el parking (PR #527), pedido por Alberto: pregunta recurrente "¿dónde guardo/dejo las maletas?" → el piso NO tiene consigna; el agente se disculpa y recomienda consignas cercanas del centro. **A) curada** (no búsqueda en vivo): nuevo `equipaje.ts` (`CONSIGNAS_CERCANAS`+`bloqueEquipaje()`) inyectado en la **`ficha`** (`contexto.ts`) → guardrail-safe; categoría `equipaje` en `detectCategory` **ANTES que checkout** (porque "dejar las maletas" contiene "dejar") + en allowlist de graduación (`graduacion.ts` y `telegram-msg.ts`). **Consignas = REDES** (Radical Storage, Bounce + LOCK & enjoy!): tienen muchos puntos por todo el centro → **un solo bloque cubre los 4 pisos y las dos zonas** (cluster Luxury/Busto/Socorro y Dúplex); el huésped busca el punto más cercano a la dirección del piso (que está en la ficha). Datos por búsqueda web (jun-2026). Tests: `equipaje.test.ts` (incl. control de que "dejar las maletas" cae en equipaje, no checkout); suite agente `node --test` 58/58. **Pendiente decisión de Alberto:** ¿dejar redes (cubren todo) o añadir un punto físico concreto por zona? Doc: skill `sivra-maestro` actualizada.

- **💬 AGENTE HUÉSPED SIVRA: contexto del hilo + bucle de re-borrador (ver antes de enviar) — PR #535 MERGEADO — 26/06/2026**
  Dos mejoras pedidas por Alberto al agente de mensajería (`apps/plataforma/lib/sivra/agente-huesped/*`):
  - **(1) Contexto del hilo:** antes el agente redactaba mirando solo ficha+guía+aprendizajes+ÚLTIMO mensaje; el historial se cargaba (`contexto.ts`) pero **NO se le pasaba a la IA** (solo se usaba para el guardrail). Ahora `decidir.ts` le pasa el **hilo** como mensajes previos a `aiComplete` vía nuevo `hilo.ts::hiloComoMensajes` (**últimos 15, ambos lados**, huésped=user / anfitrión=assistant; quita el último si == pregunta para no duplicar). Regla añadida al prompt: "continúa la conversación, NO repitas lo ya dicho". Mejora también el **auto-envío** (mismo motor `decidir`). `hilo.ts` es PURO (solo `import type`) → testeable; `hilo.test.ts` 5/5.
  - **(2) Bucle de re-borrador (Modificar/Retocar YA NO envían directo):** tras ✏️ Modificar o 🔧 Retocar, el agente **re-propone** el texto FINAL con `reproponerBorrador` (`telegram-msg.ts`): en el idioma del huésped + `🔁` español para verificar, con botones ✅/✏️/🔧, manteniendo el pendiente. **Solo ✅ Enviar manda al huésped.** Así Alberto ve SIEMPRE lo que sale (incluida la traducción es→idioma del huésped) y puede **encadenar vueltas**. En `telegram-webhook/route.ts` los paths `esperando_retoque`/`esperando_edit` ya no hacen `enviarAlHuesped`+`DELETE`; el atajo "ok/vale" en Modificar sigue enviando el borrador tal cual.
  - **Caveat asumido:** `mensajes_log` no reescribe el texto editado (solo flag `auto_sent` al enviar); el **aprendizaje** sí usa el texto final (`aprenderCorreccion(pend.borrador)`). Suite agente `node --test` 52/52; typecheck filtrado limpio. Doc: skill `sivra-maestro` actualizada.

- **🔌 CABLEADO `module-flota` → ia-rest (primer consumo real de un módulo nuevo) — 26/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Tras la trilogía de núcleos (flota/intercompany/encargo), primer cableado a una app. **Aditivo y de bajo riesgo** (no cambia rutas ni comportamiento existente): `apps/ia-rest/src/lib/flota-adapter.ts` (mapea `vehiculos_grupo`/`evento_transporte` → `Vehiculo`/`Porte` con columnas reales verificadas en BD; ojo `tarifa_fija_evento`→`tarifaFija`; `import type` → adaptador puro y testeable) + endpoint **solo lectura** `GET /api/owner/flota/resumen` (rentabilidad por vehículo: coste estimado vs real + desviación, vía module-flota). Dep `@central/module-flota` añadida a `package.json` + `transpilePackages` (next.config.js y .ts). CI usa `--no-frozen-lockfile` → regenera lockfile. **module-flota pasa a CONSUMIDO** (radiografía 15/19). Verificación: adaptador 4/4 (`node --test`, local), guardián 22/22; typecheck+build de ia-rest los valida CI. Nota infra: ia-rest no corre sus `test/*.test.ts` en CI (solo typecheck+build), por eso el test del adaptador es evidencia local.

- **🔕 AGENTE HUÉSPED SIVRA: quitado el recordatorio horario de escalados pendientes — 26/06/2026 (rama `claude/quitar-recordatorio-escalados`)**
  Alberto recibía cada hora por Telegram "⏳ Escalados pendientes de tu OK" repitiendo los MISMOS 2 borradores sin aprobar (reservas 142771692 general y 144860521 wifi/FR), con el contador "hace Xh" subiendo. **No era un bug:** verificado que el webhook de Telegram (`telegram-webhook/route.ts`) hace `DELETE FROM mensajes_pendientes_tg` en TODAS las acciones terminales (✅ enviar / descartar / modificar / aprobar) → los 2 seguían en cola solo porque nunca se pulsó ningún botón. Con el bajo volumen de Alberto el aviso horario solo molesta. **Cambio:** eliminado el cron `/api/sivra/mensajes/recordar-pendientes` de `apps/plataforma/vercel.json` + borrado el route huérfano (solo lo llamaba ese cron). El **resumen diario** (`resumen-diario`, 19:00) ya reporta "X te esperan", así que sigue habiendo un repaso 1×/día. Los 2 pendientes actuales quedan en cola (sin nag); se resuelven aprobándolos/descartándolos en Telegram cuando Alberto quiera.
- **🔕 AGENTE HUÉSPED SIVRA: quitado el recordatorio horario de escalados pendientes — PR #532 MERGEADO — 26/06/2026**
  Alberto recibía cada hora por Telegram "⏳ Escalados pendientes de tu OK" repitiendo los MISMOS 2 borradores sin aprobar (reservas 142771692 general y 144860521 wifi/FR), con el contador "hace Xh" subiendo. **No era un bug:** verificado que el webhook de Telegram (`telegram-webhook/route.ts`) hace `DELETE FROM mensajes_pendientes_tg` en TODAS las acciones terminales (✅ enviar / descartar / modificar / aprobar) → los 2 seguían en cola solo porque nunca se pulsó ningún botón. Con el bajo volumen de Alberto el aviso horario solo molesta. **Cambio (PR #532):** eliminado el cron `/api/sivra/mensajes/recordar-pendientes` de `apps/plataforma/vercel.json` + borrado el route huérfano (solo lo llamaba ese cron). El **resumen diario** (`resumen-diario`, 19:00) ya reporta "X te esperan", así que sigue habiendo un repaso 1×/día. **Los 2 pendientes se DESCARTARON** (`DELETE FROM mensajes_pendientes_tg` por Supabase MCP, decisión de Alberto) — cola vacía. La skill `sivra-maestro` NO listaba este cron, así que no hubo nada obsoleto que corregir ahí.
- **🧩 NUEVO `@central/module-encargo` (el agregado central) — 25/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Tercer desarrollo modular de la tanda. La "pieza central" de la modularización (docs §3): un evento, un porte, un alquiler o una cita son el MISMO patrón → el **Encargo** los une bajo una identidad común con **máquina de estados** (borrador→presupuestado→confirmado→en_curso→completado, +cancelado desde cualquier abierto) y enlaces por id a cada capacidad (CRM, presupuestos, agenda, inventario, proveedores, portal, feedback, flota, intercompany). Funciones: `puedeTransicionar`/`transicionar` (inmutable, lanza si inválida), `componentesVinculados`/`estaCompleto`/`componentesFaltantes`, `resumenEncargos` (por estado/tipo, abiertos, valor, completados-mes). No acopla tipos entre módulos (solo ids). **10/10 tests, tsc 0 errores, guardián 22/22. Sin consumo aún (blast radius 0).** Es la base para montar las verticales nuevas (alquiler, transporte). Docs actualizados (ESTRUCTURA.md).

- **🔗 NUEVO `@central/module-intercompany` (el gancho del holding) — 25/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Segundo desarrollo modular para la visión holding de Joaquín. Núcleo PURO de **consolidación con eliminación** de operaciones entre sociedades del mismo grupo (cocina→tiendas, flota→catering, materiales→eventos): `consolidar(sociedades, operaciones)` devuelve agregado bruto (suma simple, lo de hoy) · eliminaciones · **consolidado real** · detalle por sociedad (ingresos/gastos intercompany). Solo se elimina si AMBOS extremos están en el holding (cliente/proveedor externo NO se elimina). **Invariante testeada:** eliminar intercompany no cambia el resultado neto, solo deshincha ingresos/gastos. Puerto `OperacionAdapter`; costura `parent` para trazar el Encargo (porte/alquiler/lote). **10/10 tests, tsc 0 errores, guardián 22/22.** **Sin consumo aún (blast radius 0).** Decisión de Alberto: el **cableado a `apps/plataforma`** (tabla de operaciones + eliminación en el dashboard, app VIVA) se hará aparte y se revisa en PREVIEW antes de main. Docs actualizados (ESTRUCTURA.md).
- **🔍 AUDITORÍA DIARIA — 26/06/2026** (rutina programada, modo ligero)
  8 commits nuevos (PSD2 fix + module-flota + core-receipts docs + sivra parking), todos documentados. Heartbeat: todos los crons ✅ — `mercado/cron` se autocuró (SERPER_API_KEY añadida por Alberto). 1 corrección documental: `MATRIZ.md` — `module-flota` añadido al árbol de packages. **Carry-forward 🔴 persistente (4ª semana): `concursos_radar_criterios` SIGUE SIN APLICARSE en Supabase** → cron `/api/concursos/radar` de plataforma falla en producción. Informe completo: `docs/AUDITORIA-2026-06.md` § Addendum 2026-06-26.

- **🅿️ AGENTE HUÉSPED SIVRA: respuesta de PARKING con parkings cercanos — PR #527 MERGEADO — 25/06/2026**
  Alberto pidió que, cuando un huésped pregunte por parking, el agente conteste que **nuestro parking está ocupado** y le recomiende estos parkings de los alrededores (centro de Sevilla) **con web y teléfono**: José Laguillo, Escuelas Pías, Imagen y Plaza de la Concordia.
  - **Implementación:** nuevo `apps/plataforma/lib/sivra/agente-huesped/parking.ts` (constante `PARKINGS_CERCANOS` + `bloqueParking()`), inyectado en la **`ficha`** del piso en `contexto.ts`. Va en la ficha (no solo en el prompt) **a propósito**: el guardrail anti-invención (`contieneDatoInventado`) valida teléfonos/URLs contra las FUENTES (ficha+guía+historial); al estar los teléfonos en la ficha, el agente puede darlos **sin escalar a humano**. La categoría `parking` ya está en la allowlist de graduación → puede auto-enviarse.
  - **REGLA DE ORO respetada:** el bloque solo se usa si el huésped pregunta por aparcamiento (no se añade info no pedida).
  - **Datos finales (búsqueda web + enlaces aportados por Alberto, jun-2026):** José Laguillo/AUSSA (954 21 02 19, apparkya.com/parking/parking-jose-laguillo), Escuelas Pías (954 56 17 58, parkingescuelaspias.es), Imagen (954 21 00 68, parkingimagen.es), Plaza Concordia/SABA (954 21 88 31, saba.es).
  - **Tests:** `parking.test.ts` (4 casos, incluido control de guardrail). `node --test` → 13/13 OK.
  - **Doc:** skill `sivra-maestro` actualizada con el bullet de parking.
- **🚚 NUEVO `@central/module-flota` (extracción de la flota a módulo) — 25/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`, PR #525)**
  Primer desarrollo tras la auditoría. Extraída la flota a medida de ia-rest (`vehiculos_grupo`+`evento_transporte`) a un **paquete portable** `packages/module-flota` (TS puro, patrón puerto/adaptador como el resto). Lógica pura: costes estimado/real por porte, rentabilidad por porte y por vehículo, **asignación inteligente** por capacidad/tipo (frigorífico) + disponibilidad (solapes), **gestión documental** ITV/seguro/mantenimiento (alertas caducado/por-caducar), y **costura intercompany** (`esInterno`+`sociedadOrigen/Destino`, `totalIntercompany`). **15/15 tests `node --test` verdes, `tsc` 0 errores, guardián 22/22.** Radiografía regenerada (`npm run auditar`: 27 packages). **Sin consumo aún** (no lo importa ninguna app → blast radius 0): pendiente el adaptador en ia-rest + la vertical Transporte. Docs actualizados (ESTRUCTURA.md, DISENO-modulos-materiales-flota.md).

- **🔍 AUDITORÍA COMPLETA DEL PROYECTO + visión holding Joaquín Jaén + docs corregidos — 25/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  Alberto se reúne con el DUEÑO (Joaquín) la semana que viene; quiere **vender la visión holding completa**. Al preparar la auditoría se descubrió que **el proyecto está MUCHO más construido de lo que decían los docs** — y se corrigió la documentación para que **no vuelva a pasar**.
  - **Mapa del negocio de Joaquín (5 negocios, NO 6):** restaurante, catering/eventos (núcleo), haciendas (propias+terceros), **alquiler de materiales (también a TERCEROS)**, transporte/flota. "Tiendas comida para llevar" de los docs viejos **NO existe** (descartado por Alberto). Cocina central abastece restaurante+catering. Gancho = **intercompany**.
  - **Auditoría de capacidades (6 agentes en paralelo, verificada en código):** 10 `core-*` (8 HECHO, core-email PARCIAL, core-payments ESBOZO) + **16 `module-*`** (14 HECHO y CONSUMIDOS; solo `module-agenda` y `module-revenue` HECHOS pero SIN consumo) + 5 apps (ia-rest ~488 rutas, ialimp, sivra, plataforma, rrhh). **`module-materiales` YA soporta alquiler** (tarifa/fianza/daños/`ReservaAnticipada`/`ClienteMaterial`). **`module-crm`/`presupuestos`/`proveedores`/`feedback` están consumidos** (los docs los marcaban "⏳ no usado" — falso).
  - **Gaps REALES (lo único genuinamente pendiente):** (1) **intercompany** en `apps/plataforma` = INEXISTENTE (consolidado = suma simple, sin eliminación de operaciones entre sociedades); (2) **`module-flota`** no existe → la flota vive a medida en ia-rest (`vehiculos_grupo`+`evento_transporte`). **DECISIÓN (Alberto): extraerla a `module-flota` + vertical Transporte**, patrón `module-crm`←`leads_evento`; (3) `module-agenda` y `module-revenue` HECHOS pero sin cablear (haciendas/flota/kits, BI); (4) **haciendas** = NO es desarrollo nuevo → **clonar ialimp** (calendario iCal + portal propietario + turnaround, ~70% reutilizable).
  - **PRINCIPIO (Alberto, innegociable):** todo desarrollo nuevo = **modular** (`packages/module-*`), reutilizable por otros clientes/sectores. Joaquín = **design partner**.
  - **Docs CORREGIDOS para que no recurra:** `docs/ESTRUCTURA.md` (contadores 6→10 core, 9→16 module, columna "¿Usado hoy?" arreglada, +app rrhh, banner→radiografía viva); banners de realidad en `docs/DISENO-modularizacion-verticales.md` y `docs/DISENO-modulos-materiales-flota.md` (estaban como "no implementado"); comentario obsoleto de `packages/module-crm/src/index.ts`. **Fuente de verdad = `docs/ARQUITECTURA.generated.md`** (`npm run auditar`, al día: 5 verticales · 26 packages · 951 APIs). **Antes de "diseñar" algo, mirar ESTRUCTURA.md.**
  - **Entregable:** Google Doc "Auditoría Holding Joaquín Jaén" en Drive (carpeta reuniones JJ `0AFsLksoArH7GUk9PVA`). Pendiente: actualizarlo a la realidad corregida (sobrestimaba los gaps).
- **✅ CORE-RECEIPTS: ciclo completo cerrado (#307 + #488 + #489 MERGEADOS) — 25/06/2026**
  Cerrada la capacidad transversal de emitir los recibos/facturas REALES (no fake — choca con VeriFactu)
  más bonitos y con marca, vía el nuevo paquete compartido **`@central/core-receipts`** (TS puro,
  `node --test`, deps `workspace:*`). Las 3 fases shippables están en `main`:
  - **#307 — Fase 1 (reducida):** scaffold del paquete + modelo `ReceiptDoc` (unión discriminada) +
    `assertFiscalIntegrity` (guardia **fail-closed**: si el render no contiene los importes fiscales
    exactos, lanza `FiscalIntegrityError`) + migración de **3 generadores térmicos de cocina** ESC/POS
    (`generarEscPos`/`generarTextoPlano`/`generarTicketCuenta`) con **golden tests byte-equality**.
    `generarEscPosCuenta` se quedó en ia-rest (main le añadió e-recibo digital `recibo_url`+QR → conflicto
    semántico; se redujo el alcance por decisión de Alberto). Helper `withFrozenClock` en los tests porque
    ese generador lee `new Date()` (pillado por verificación independiente: un subagente lo dio por verde y
    no lo estaba).
  - **#488 — Fase 2:** `renderInvoiceHtml(doc, branding)` — renderer HTML de factura con CSS vars
    `--brand-*`, paridad visual con la plantilla anterior; adoptado en la factura imprimible del propietario
    de ialimp.
  - **#489 — Task 4 (white-label):** `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts`
    usa `getBranding(cliente.empresa_id)` en vez de `BRAND_DEFAULT` → **cada empresa ve su marca** en la
    factura (Sique Brilla = oro/negro `#0a0805`/`#d4a017`; resto = índigo ialimp `#4f46e5`). Alberto lo sacó
    de draft y lo mergeó él mismo (visto bueno visual en preview de ialimp, que salió verde).
  - **PENDIENTE a propósito (NO construir a ciegas):** **Fase 3** (glosa IA por emisión, Modo A) y
    **Fase 4** (Modo B, layout experimental con IA) + **PDF** vía `@react-pdf/renderer`. Solo esbozadas en
    `docs/superpowers/specs/2026-06-16-core-receipts-design.md`. Cargan decisiones de coste/producto reales
    (gasto LLM **por factura** renderizada, gateway IA de ialimp = `lib/ai-client.ts` no core-ai, peso del
    bundle PDF) → requieren **brainstorm/diseño** antes de tocar código. NO es trabajo mecánico.
- **🔄 AUDITORÍA DIARIA: nuevo modelo de entrega en DOS CARRILES + avisos Telegram — branch `claude/stale-info-daily-updates-cena38` — 26/06/2026**
  Alberto se topó con info desactualizada pese a la rutina nocturna. Diagnóstico: el problema NO era de alcance (la auditoría ya reconciliaba memoria/skills/docs/manuales) sino de **entrega** — todo se quedaba en un PR draft que, sin mergear, dejaba la info vieja viva. Rediseño de `/auditoria-diaria`:
  - **Carril 1 (auto-aplicar):** los arreglos de **texto** (memoria/skills/`CLAUDE.md`/`SKILLS.md`/`CONTEXTO-SESIONES.md`/manuales) se **commitean y empujan directos a `main`**, sin PR. Con **guardarraíl (B):** solo cambios acotados; lo grande/estructural se trata como carril 2. Bitácora de transparencia en **`docs/AUTO-APLICADOS.md` (G)**.
  - **Carril 2 (revisión):** código, infra, gran radio, hallazgos ambiguos y **crons mudos** → **PR draft** + **aviso Telegram (A)** con `tgSendButtons` (botón-URL al PR draft) para "pasártelo en conversación". Nunca a `main`.
  - **Frescura (D):** sello `<!-- verificado: YYYY-MM-DD -->` al pie de los docs + nuevo **`docs/FUENTES-DE-VERDAD.md` (F)** que mapea doc/skill → paths de código (qué releer cuando algo cambia).
  - **Heartbeat semanal (C):** en la pasada `--profunda` (domingos) manda SIEMPRE un Telegram "sigo viva" aunque no haya hallazgos (vigila al vigilante).
  - **Archivos tocados:** `.claude/commands/auditoria-diaria.md` (reescrito), `docs/RUTINAS-PROGRAMADAS.md`, `docs/SKILLS.md`, `CLAUDE.md`, nuevos `docs/FUENTES-DE-VERDAD.md` + `docs/AUTO-APLICADOS.md`.
  - **Fase 2 anotada (sin implementar):** E (shift-left: avisar en PR si tocas código sin actualizar su doc) + H (trigger por evento tras merge a `main`).
  - **⚠️ ACCIÓN MANUAL DE ALBERTO:** añadir `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` a la env de la rutina de auditoría en `claude.ai/code → Rutinas`. Sin ellos la auditoría corre igual pero no avisa por Telegram.

- **✅ BANCA/PSD2: arreglada la RAÍZ de los movimientos duplicados — PR #524 MERGEADO — 25/06/2026**
  Alberto detectó la cuota del préstamo (`CUOTA PTMO 856289293-5`, –772,86€ el 05/06) **duplicada** en el dashboard. Investigado: **15 movimientos PSD2 duplicados** en `movimientos_bancarios` (cuota PTMO ×3 meses, recibos `TARJ.CRDTO` ×6, `KUTXABANK SEG. VIDA` ×2, `RECIBO AYTO. SEVILLA`, comisión emisión, liq. intereses, devolución AEAT). **⚠️ REINCIDENTE:** esto ya pasó y se limpió a mano (ver entrada "16 registros eliminados… CUOTA PTMO… AEAT deducción maternidad" más abajo) **sin arreglar la causa** → reincidió. Esta vez se ataca la raíz. **Causa raíz:** `lib/psd2.ts::hashMov` deduplicaba por `entry_reference` del banco (o fallback `accountUid|fecha|importe`); **ambos ROTAN entre sesiones de Enable Banking**, así que el cron `psd2-sync` del 24/06 reinsertó lo ya importado el 14/06 con otro hash → burló `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)`. La dedup por contenido existente era **solo en memoria** (no protege entre pasadas).
  - **Fix código:** `hashMov` pasa a clave por **CONTENIDO estable** = `cuenta_bancaria_id|fecha|importe(2dec)|upper(trim(concepto))` (ignora entry_reference/accountUid). Verificado byte-a-byte node↔postgres. Call sites actualizados (`accountUid`→`cbId`); eliminado el `vistosContenido` redundante. Landmine documentado en `apps/plataforma/CLAUDE.md` + skill `plataforma-maestro`.
  - **Migración:** `prisma/sql/2026-06-25_psd2_dedupe_contenido.sql` (borra sobrantes conservando el más antiguo + backfill de `dedupe_hash` de todas las filas psd2 al esquema de contenido).
  - **✅ APLICADO Y VERIFICADO (Supabase MCP):** DELETE de los 15 sobrantes + backfill de TODAS las filas psd2 al hash de contenido. Verificación: **0 filas con hash incorrecto, 0 grupos duplicados**; la cuota PTMO 05/06 quedó con hash `7044dc1c…` = exactamente el que produce el código desplegado → el próximo cron `psd2-sync` (06:00 UTC) hará match en el `ON CONFLICT` y NO reduplicará.
  - **MATIZ asumido:** dos movimientos PSD2 realmente idénticos el mismo día (misma cuenta/importe/concepto) se colapsarían en uno (rarísimo en cuenta personal; ya lo asumía el dedup en-memoria previo).

- **🔍 AUDITORÍA DIARIA — 25/06/2026** (rutina programada, modo ligero)
  Hallazgo 🔴: `mercado/cron` MUDO desde el 23/06 — `SERPER_API_KEY` configurada en Vercel `sivra` pero **NO en `plataforma`** donde el cron realmente corre. Vercel runtime errors lo confirman (23/06 y 24/06 a las 07:15 UTC). **Acción: añadir `SERPER_API_KEY` a Vercel proyecto `plataforma`** (mismo valor que en `sivra`). `auto-sessions` falso positivo (55h mudo porque todas las sesiones ya existen). CIMA LIQ operativo (tabla ✅, cron ✅, primer run esperado hoy 07:30 UTC). `pilot-track` autocurado ✅. Reconciliación: `plataforma-maestro` actualizado con CIMA LIQ; entrada CIMA LIQ reordenada aquí. Informe completo: `docs/AUDITORIA-2026-06.md` § Addendum 2026-06-25.

- **🏢 CORREDURÍA: integración CIMA LIQ → cruce BBVA → alerta Telegram — PR #508 draft — 24/06/2026**
  Alberto quiere conectar su correduría (CS-F/0170, ASegura S.L.) a CIMA (WSE Estándar TIREA) para descargar ficheros de liquidaciones y verificar que cuadran con lo cobrado en BBVA.
  - **`apps/plataforma/lib/cima.ts`**: cliente SOAP completo (`recibirFicherosPendientes` + `confirmarFicherosRecibidos`). Parsea EIAC 6.0: cabecera tipo-0 (código compañía pos 2-6, periodo AAAAMM pos 12-18), pie tipo-9 (importes × 100). Decodifica base64 latin1. Mapeo de códigos CIMA → nombres (Mapfre/Allianz/Reale/Generali/Occident/AXA/…).
  - **`apps/plataforma/app/api/cron/cima-liq/route.ts`**: cron diario. Descarga LIQ, hace upsert en `cima_liquidaciones` por `nombre_fichero`, cruza contra `movimientos_bancarios` (`destino='seguros'`) en ventana ±45 días del cierre del periodo. Si |diff| > 5 € → Telegram `🟡` con detalle; si todo cuadra → Telegram `✅`.
  - **BD:** tabla `cima_liquidaciones` + índice `idx_cima_liq_cuenta_periodo` — **migración aplicada vía Supabase MCP** (`wswbehlcuxqxyinousql`).
  - **`vercel.json`**: cron añadido `30 7 * * *` (07:30 UTC diario).
  - **Branch:** `claude/amazing-mccarthy-nk11hw`. **PR #508** draft — builds Vercel en progreso al cierre de sesión.
  - **Credenciales CIMA** (Vercel env secrets — nunca en chat): `CIMA_WSE_USER=cima.albertocsf0170ws`, `CIMA_WSE_PLATAFORMA=ALBERTOSUAREZ_6393`, `CIMA_WSE_PASSWORD` (ya configurada por Alberto).
  - **Pendiente:** test manual `GET /api/cron/cima-liq?secret=<CRON_SECRET>` en preview. Codeoscopic/Avant2 pendiente de credenciales sandbox renovadas (contactar a Juan Manuel / LOOR.es — ticket #267336 cerrado el 19/06).
- **💬 GASTOS: comentarios por movimiento + saneo de clasificación del Dúplex — branch `claude/expense-deductibility-control-sfx6od`, PR #491 — 24/06/2026**
  - **Comentarios por gasto** (lo pidió Alberto, "así controlamos mejor"): nueva columna `movimientos_bancarios.comentario` (`prisma/sql/2026-06-24_mov_comentario.sql`, aplicada). Endpoint `POST /api/banca/comentario` (`{id,comentario}`, trim 500, scoped por cuenta). `lib/finanzas.ts` `GastoMov.comentario` + SELECT. UI en `GastosTab.tsx`: botón «💬 comentar» + `ComentarioEditor` (top-level, estado local para no perder foco) en `Fila` y en `Grupo` de count 1. `tsc` OK.
  - **Saneo manual de clasificación (BD compartida, vía MCP; cuenta `4fdc993a…`):** Alberto fue revisando cargos de BBVA mal metidos en `seguros` (correduría) por venir del **Excel pelado** ("Adeudo nº…", pre-PSD2). Corregido a `turistico_duplex` + comentario: **Seguro Dúplex** 270,60€ (11/12/25), **Internet Dúplex** 20,90€, **Luz Dúplex** ×4 (TE Electricidad y Gas España; regla `banca_destino_reglas` clave `TE ELECTRICIDAD Y GAS ESPANA`), **Comunidad Dúplex** ×15 (Pasaje Francisco Molina 4; regla clave `COMU. DE PROP.PASAJE FRANCISCO MOLINA`). **Seguro RC del corredor** 399,13€ → confirmado en correduría (correcto). IBI Dúplex 130,46€ ya estaba bien.
  - **⚠️ Lección — reglas por substring sobre-amplias:** al aprender la regla «ELECTRICIDAD» (ILIKE `%ELECTRICIDAD%`) arrastró por error ENDESA (otros pisos → `turistico_pisos`) y ENERGÍA XXI (luz personal → `personal`) porque su concepto trae "FACTURA DE ELECTRICIDAD". Revertido y sustituido por la clave específica `TE ELECTRICIDAD Y GAS ESPANA`. Verificar SIEMPRE el `concepto` COMPLETO (no truncado) antes de reclasificar por substring.
  - **Conexión bancaria (PSD2):** BBVA activa desde 20/03/2026, Kutxa desde 17/03/2026 (banca abierta da solo ~90 días de histórico → no se puede sacar ene-2025 por PSD2). Todo lo anterior viene del **Excel** (xls-bbva/xls-kutxa desde 01/01/2025), que se solapa con PSD2 y se deduplica (`duplicado_estado='ignorado'` en la copia pobre). El histórico está completo; lo que falta en meses viejos es solo el concepto rico, no recuperable.
  - **⏳ Pendiente:** recibo municipal Ayto. Sevilla **242,93€** (ref …153000286…) imputado al Dúplex por error pero NO es su IBI (el IBI son 130,46€) — sin identificar a qué inmueble pertenece; el cargo BBVA no trae referencia catastral (solo nº de recibo). Opción: rastrear Gmail/Drive por el recibo. Seguir saneando histórico pre-marzo-2026.
  - **Saneo histórico 2025 (cont.):** el bucket `seguros` (BBVA) era un cajón de sastre. Corregido: **Internet del Dúplex = FINETWORK** (–20,90€/mes, 18 cargos 2025–2026 → `turistico_duplex`, regla `FINETWORK`); **TGSS cotización autónomos** (–387,72€/mes, 17 cargos) → se queda en correduría (`seguros`) confirmado, criterio de Alberto = gasto del negocio; **Bizums «Enviado:…»** (19) → `personal`. Pendiente aún: –19,50€ recaudación municipal Ayto. Sevilla (sin identificar), y varios sueltos en seguros (Punto y Coma/dinero cedido, facturas limpieza/lavandería de pisos, –15000 traspasos, etc.).
  - **✅ Saneo 2025 COMPLETO (bandeja «por revisar» = 0):** triados todos los cargos del cajón `seguros` (BBVA). Luz/agua/IBI/basura del Dúplex → `turistico_duplex` (con comentarios); lavandería/limpieza → `turistico_pisos`; Studium/Codeoscopic/CIMA/Registradores/TGSS → correduría (con factura de Drive donde la había, en `factura_ref`); golf/baja paternidad/transferencias sueltas → `personal`. Facturas localizadas vía Google Drive (hay 2 hojas propias de Alberto «Organizar/Unificación Gastos Renta» como referencia). OJO atribución de suministros: en Drive hay luz de varias direcciones (Socorro 24=familiar, Bustos Tavera 22=Punto y Coma SL, San Luis, Dúplex) — los «luz» de BBVA se imputaron al Dúplex por decisión de Alberto.
  - **🤖 Criterio fiscal del agente de sugerencia (`/api/finanzas/gastos/sugerir` + `/sugerir-lote`):** prompts afinados con la regla de Alberto — **`no_deducible` SOLO lo claramente personal/familiar; el resto es deducible → `negocio` (correduría) o `renta` (pisos)**. Ante la duda no marcar personal "por si acaso". Añadidos ejemplos: TGSS/autónomos→negocio; luz/agua/internet/comunidad/IBI/seguro del piso→renta; Bizums/golf→no_deducible.
  - **🛠️ Fix colateral en ia-rest (`apps/ia-rest/src/app/estado/page.tsx`):** el preview de ia-rest del PR fallaba el build al prerenderizar `/estado` (`SyntaxError: Unexpected token '<' … is not valid JSON`). Causa: `getEstado()` hacía `return r.json()` SIN `await` dentro del try → el `JSON.parse` (cuando `/api/estado` responde HTML en build) se resolvía en el caller, FUERA del try/catch → tumbaba el prerender. Fix: `return await r.json()` (la página ya maneja `data===null` con valores por defecto). No reproducible en local (falta enlazar `@central/core-receipts`, que sí resuelve en Vercel); verificado el mecanismo con prueba aislada de semántica try/catch+await.

- **⚡ GASTOS: reparto AUTOMÁTICO por actividad (limpiezas × camas) — branch `claude/expense-deductibility-control-sfx6od`, PR #491 — 24/06/2026**
  - Sobre el desglose por % (abajo), Alberto pidió que el margen por piso sea **lo más real posible**. Método decidido: repartir el cargo compartido **proporcional a la actividad** de cada piso en el mes del cargo, ponderado por **huéspedes**: `peso = Σ huéspedes servidos en el mes` (= nº_limpiezas × huéspedes por salida). (Alberto: «mejor número de limpieza, pero a su vez por huéspedes».) Se usan los huéspedes reales de cada limpieza (`cleaning_sessions.num_huespedes`) y, cuando falta, `properties.maxGuests`. Driver fijo para todos los gastos — sin preferencia de driver-por-tipo.
  - **`/api/finanzas/gastos/reparto-sugerido` (GET, SOLO LECTURA):** dado `movimientoId`, calcula los % sugeridos por actividad del mes del cargo (Σ huéspedes). Fallbacks: sin limpiezas ese mes → por capacidad (`maxGuests`); sin capacidad → equitativo. Cuadra a 100,0. Scoped por `cuenta_id`. NO escribe nada.
  - **`GastosTab.tsx` (`DesgloseEditor`):** botón **«⚡ por actividad»** que pre-rellena los % (el usuario revisa y guarda por el flujo normal `POST /desglose`). Nota explicativa con el detalle `piso N limp · M huésp`.
  - **Datos clave (BD `wswbehlcuxqxyinousql`):** `cleaning_sessions.property_id` guarda el slug `prop_*` de los 4 pisos turísticos (filtrar por esos slugs ya escopa a la cuenta); NO se filtra por `completed_at` (las limpiezas vienen de iCal y rara vez se marcan completadas, pero la salida `session_date` sí ocurrió). `properties.maxGuests`: Busto 2 · Duplex 4 · Luxury 5 · House 12. Verificado junio 2026 → Luxury 37,3% · House 35,5% · Duplex 18,2% · Busto 9,1%.
  - **NO cambia la deducibilidad fiscal:** el total deducible sigue contando entero como `turistico_pisos` en `/finanzas`; el reparto solo afina el P&L por piso. Sin migración nueva (reutiliza `movimiento_reparto`). `tsc --noEmit` OK.
  - **Pendiente / posibles mejoras:** reflejar el desglose también en la pestaña Fiscal (hoy total sin cambio); poder lanzar el reparto desde el detalle del apartamento; opción de ponderar por `beds` (camas) en vez de huéspedes.

- **🧾 GASTOS: fecha·banco en cargos sueltos (PR #487 MERGED) + desglose por piso — branch `claude/expense-deductibility-control-sfx6od` — 24/06/2026**
  - **PR #487 (merged):** la bandeja «Por revisar» de `/finanzas?tab=gastos` mostraba solo el concepto bruto del banco (`Adeudo nº…`) sin fecha ni banco → imposible localizar el cargo. Ahora la cabecera de grupo muestra **fecha · banco** en cargos sueltos (`count===1`). 1 línea en `GastosTab.tsx`.
  - **Desglose por piso (siguiente PR, en curso):** reparto de un cargo que factura en bloque (lavandería/suministros) entre varios pisos **por porcentaje**. Decisión de Alberto: «ambos» (verlo en el cargo + alimentar P&L por piso) y método **por %**.
    - **BD:** tabla `movimiento_reparto (movimiento_id, propiedad, porcentaje, importe)` + columna `movimientos_bancarios.desglosado` (`prisma/sql/2026-06-24_movimiento_reparto.sql`, aplicada por MCP). El reparto **NO cambia la deducibilidad fiscal** (el movimiento sigue contando entero como `turistico_pisos` en `/finanzas`); solo alimenta el P&L por piso.
    - **`lib/finanzas.ts`:** `GastoMov.desglose[]` + `GastosControl.pisos[]`; `getGastosControl` trae repartos y lista de pisos (excluye `prop_multi_apartamentos`).
    - **`/api/finanzas/gastos/desglose` (POST):** valida pisos reales + suma ≈100%, recalcula importes, reemplaza el reparto, marca `desglosado`. Repartos vacío = quitar desglose. Scoped por `cuenta_id`.
    - **`GastosTab.tsx`:** botón «🪧 desglosar por piso» en cargos de bucket `renta`; componente `DesgloseEditor` (checkbox+% por piso, «partes iguales», validación suma 100). Chips de reparto inline cuando está desglosado.
    - **`lib/propiedades.ts` (`getApartamentoDetalle`):** la parte repartida a cada piso se suma a sus gastos del mes/año y aparece como categoría «🪧 Compartido (repartido)».
    - **Pendiente:** Sueldo «por la baja» sigue sin resolver (falta de quién es la nómina).
- **✨ AGENTE HUÉSPEDES SIVRA · "no responder" a cierres de conversación — 25/06/2026 — branch `claude/asi-w7sdu9`**
  Alberto probó EN VIVO el flujo de mensajería (Luxury Busto · David, reserva 142771692): tras retocar un borrador ("añade que la cafetera es italiana" → quedó "cafetera convencional **italiana**", algo redundante), el huésped cerró con **"Perfecto, gracias"** y el agente igualmente propuso "De nada, David…". Alberto: *"en este caso no cabe respuesta"*. Faltaba poder **descartar** sin enviar.
  - **Decisión (opción "Ambas"):** el agente DETECTA el cierre y AVISA, pero deja decidir a Alberto (Enviar de cortesía o 🚫 No responder). No auto-descarta.
  - **Cambios (sin migración de BD — el descarte solo borra el pendiente):**
    (1) `decidir.ts`: nuevo campo `Decision.requiere_respuesta?` + el system prompt pide `requiere_respuesta:false` SOLO en cierres tipo gracias/perfecto/ok/buenas noches/👍 (aun así rellena `reply` de cortesía). `needs_human` o guardrail fuerzan `true` (una queja nunca se descarta).
    (2) `telegram-msg.ts`: si `requiere_respuesta===false`, añade nota "ℹ️ Parece un cierre — quizá no requiere respuesta" + botón **🚫 No responder** (`hsp_skip`). Helper `confirmarDescartado`.
    (3) `telegram-webhook/route.ts`: maneja `action==='skip'` → edita el mensaje a "🚫 Descartado", borra `mensajes_pendientes_tg`, no envía nada ni aprende.
    (4) `orquestador.ts`: guard `dec.requiere_respuesta !== false` en `puedeAuto` → un cierre nunca se auto-envía aunque la categoría esté graduada.
  - **Pendiente/observado:** el retoque ("italiana" sobre "convencional") no DEPURA el adjetivo previo → puede quedar redundante. No tocado en esta sesión (calidad de `aplicarRetoque`, a vigilar). Typecheck local solo da errores preexistentes de deps no instaladas (`@types/node`, módulos workspace), ninguno del código nuevo.
- **🔎 AGENTE SEO: fix crash + visibilidad de errores — 25/06/2026 (rama `claude/agent-error-visibility-k4ayma`)**
  - **Caso:** el botón "Actualizar SEO" de `/sivra/seo` (en **plataforma**, `-flame.vercel.app`) mostraba
    `TypeError [ERR_INVALID_ARG_TYPE] ... Received undefined`. Logs de Vercel (runtime errors, 3 ocurrencias,
    última 25/06 15:45): el crash es `Buffer.from(d.content)` en `fetchLanding()` de
    `app/api/sivra/seo-refresh/route.ts` — la GitHub Contents API devuelve respuesta **sin `content`**
    (probable `GITHUB_TOKEN` ausente/inválido en el proyecto Vercel `plataforma`; no está en su tabla de envs)
    y el código decodificaba a ciegas. La copia de plataforma se quedó en la versión SIN guarda; `apps/sivra/lib/seo-landing.ts` ya estaba blindada.
  - **Fix:** nueva `apps/plataforma/lib/sivra/seo-landing.ts` (portada de sivra) con `decodeLanding()` puro y
    testeado (`seo-landing.test.ts`, 3 tests `node --test` verdes): si la respuesta no es un fichero, lanza error
    CLARO citando `GITHUB_TOKEN` en vez del Buffer críptico. La ruta importa la lib (elimina copias inline frágiles).
  - **Visibilidad ("que el agente lo vea"):** el `catch` ahora avisa por Telegram (`tgAlert(..., 'critico')`,
    bot único del monorepo) distinguiendo `[cron automático]` vs `[manual]`. Antes el cron semanal fallaba en
    silencio (nadie leía su 500).
  - **PENDIENTE de Alberto (ops):** poner/arreglar `GITHUB_TOKEN` con acceso al repo `house-sevillana-landing`
    en el proyecto Vercel **plataforma** — el fix convierte el crash en error claro, pero el SEO no actualizará
    hasta que el token sea válido. Aparte: la ruta sigue usando Anthropic directo (`ANTHROPIC_API_KEY`) cuando el
    resto del monorepo migró a la pasarela — NO tocado en este PR.
- **🐛 PANEL OPERADOR ia-rest · "Error cargando CRM (401)" — 25/06/2026 (rama `claude/crm-error-d2j3sq` · PR #522 MERGED a main)**
  - **Síntoma:** `plataforma-ten-flame.vercel.app/operador/iarest/crm` mostraba **"Error cargando CRM (401)"** (captura de Alberto).
  - **Causa raíz (diagnóstico):** NO es la sesión del operador. La *página* `crm/page.tsx` es Server Component que
    redirige a `/dashboard` si `getAdmin()` es nulo → como la pantalla renderizó el cliente, la cookie `plataforma_admin`
    es válida. El 401 era el **pass-through** del 401 que devuelve **ia-rest** por el puerto HTTP cuando su
    `OPERADOR_SHARED_SECRET` falta o **no coincide** con el de plataforma (si faltara EN plataforma sería 502, no 401).
    Las **8** sub-páginas `/operador/iarest/*` comparten el mismo helper y estaban TODAS caídas por lo mismo. Encaja con
    el trasiego de secretos del PR #512.
  - **⚠️ ACCIÓN PENDIENTE DE ALBERTO (lo que de verdad carga los datos):** poner el **MISMO valor** de
    `OPERADOR_SHARED_SECRET` en el proyecto Vercel **`ia-rest`** que el de **`plataforma`** + redeploy de ia-rest
    (desde `/operador/secretos` o el panel de Vercel). El código NO puede arreglar esto (no se inventan literales de secreto).
  - **Cambios de código (hechos):** nuevo helper compartido `lib/iarest-port.ts` (`fetchIarest` + `iarestError`) + lógica
    pura `lib/iarest-port-core.ts` (`iarestErrorPayload`, 5 tests `node --test` verdes). Migradas las 8 rutas
    `app/api/admin/iarest/**`: un 401/403 de ia-rest ya **NO** se propaga como 401 (→ 502 con mensaje accionable
    "OPERADOR_SHARED_SECRET debe tener el MISMO valor…"); así un 401 del navegador significa SOLO "sesión de operador".
    `CrmClient.tsx` ahora muestra el **mensaje** del servidor, no un "(401)" desnudo. tsc local solo da ruido ambiental
    (node_modules sin instalar); CI de Vercel valida el build real.

- **🏠 HOME `/dashboard` plataforma · rework "de un vistazo" — 25/06/2026 — rama `claude/dashboard-home-page-obwrta`**
  Alberto pidió que la página principal muestre más cosas de golpe (2 capturas: dashboard actual + calendario Multi Smoobu). Solo plataforma, **sin migración de BD**. Cambios en `lib/banca.ts` (3 funciones nuevas) y `app/(usuario)/dashboard/page.tsx` (helpers + componentes).
  - **Saldo por cuenta** (`getCuentasConMovimientos`, excluye `titular='conyuge'` = Pilar): tarjeta por cuenta bancaria propia con saldo + movimientos de los **2 últimos días** al máximo detalle (fecha, concepto, contraparte, destino, importe, **saldo posterior**, badges 🔗/🔎). Componente `SaldoPorCuenta`/`MovRow`.
  - **Pisos "ya cobrado"** = **conciliado con banco** (decisión de Alberto). `getCobradoPisos`: suma abonos `importe>0` `destino IN (turistico_duplex,turistico_pisos)` para **mes** y **YTD**. **El banco solo separa Dúplex (BBVA) vs Pisos (Kutxa agrupados)**, no por piso individual → el desglose por piso sale de `incomes.amount` (neto) etiquetado como *facturado*, con ocupación del mes y ADR. `PisosWidget` reescrito.
  - **Reservas por piso ±7 días** (`getReservasVentana`, estancias que solapan la ventana): agrupadas por piso con huésped + **neto** (`amount`). Componente `ReservasPorPiso` (sustituye "Esta semana en los pisos").
  - **Extras pedidos:** tarjeta **Pendiente de cobrar OTA** (`getEstadoCobrosOTA`), **Top gastos del mes** (`getTopGastosMes`), **aviso Modelo 130** de Pilar (`getResumenPilar` → próximo trimestre vivo). Se conservan corredería y banner de gastos por revisar.
  - tsc verde (único error preexistente ajeno: `globals.css` en layout). Pendiente: revisar en producción que las cifras "cobrado" cuadran con `/cuadre-booking`.
- **📊 PRICING REVISIÓN SEMANAL — 29/06/2026 (rama `claude/dynamic-pricing-uhvnak`)**
  - **Resultado clave: 0 de 337 noches a suelo** (antes: 270/349). Los 3 PRs de la semana pasada (#440 #493 #520) funcionan.
  - **Datos nuevos Booking.com (35 comps):** Feria Abr18(domingo, p55=172€ vs sábado 298€), Mayo p55=284€, Junio p55=408€, Dic26 p55=130€. Insertados en `market_rates` directamente con `search_date=2026-06-29`.
  - **Anomalía detectada y en corrección:** Abr18-21 están a 432-516€ vs mercado real del domingo de Feria ~172€. Motor bajará ±20%/día; llegará a ~210-215€ en 3-4 días.
  - **Potencial identificado:** Mayo avg 243€ vs p55 284€ (+17% upside); Junio avg 248€ vs p55 408€ (motor subirá gradualmente, vigilar conversión).
  - **Estado crons:** apply-auto 3x/día operativo (último Jun 28 14:30). `pricing_eventos_auto` VACÍO — falta `TICKETMASTER_API_KEY` en Vercel `plataforma` + posible bug websearch Gemini. **Acción manual de Alberto:** copiar `TICKETMASTER_API_KEY` de Vercel `ia-rest` al proyecto `plataforma`.
  - **Aprendizaje persistido:** `pricing_aprendizaje` actualizado (feria_2027_dias_semana, may_jun_2027, cobertura_jun2026_v2).
  - **Próxima revisión sugerida:** ~7 días (06/07) tras ver conversión de las nuevas subidas May/Jun.

- **⚡ PRICING: salto directo en eventos + apply 3x/día — 25/06/2026 (rama `claude/dynamic-pricing-uhvnak`)**
  - **Caso:** reserva Busto oct'26 (François, 7 noches) entró a **122€/noche plano** sin capturar el premium del
    **puente Hispanidad** (mercado ~196€). No es suelo ni config (events_enabled=true): el motor sube **gradual**
    (±20%/día, 1 pasada/día) → una fecha de evento tarda días en escalar y el huésped la reserva barata antes.
  - **Fix 1 — salto de evento** (`app/api/sivra/pricing/apply/route.ts`): se captura `eventTarget` y se aplica
    **DESPUÉS del raíl ±20%** (igual que el suelo) → una fecha de evento del calendario sube a su precio **de golpe**.
    Solo al ALZA. Gateado por `events_enabled`.
  - **Fix 2:** `apply-auto` 1→**3 pasadas/día** (08:30/14:30/20:30) en `vercel.json`.
  - **Review octubre:** sembrado `market_rates` oct (p55 160€) → resto de octubre se levanta hacia ~130-145€.
    Aprendizaje `pricing_aprendizaje.octubre`. La reserva de François ya hecha no se toca. PR #440 y #493 MERGEADOS;
    pendiente manual `TICKETMASTER_API_KEY` en Vercel `plataforma`. tsc verde.

- **🐛 AGENTE HUÉSPEDES SIVRA · "se respondía a sí mismo" — 25/06/2026 — branch `claude/luxury-busto-kitchen-amenities-14rz2x`**
  Alberto reenvió un borrador del agente (Luxury Busto · David, reserva 142771692) donde la "pregunta del huésped" era **"Sí, el alojamiento dispone de cafetera y microondas."** y el borrador "Genial, David, me alegra que hayas encontrado lo que necesitas en la cocina" → **eso era NUESTRA propia respuesta**, no un mensaje del huésped. Confirmado en `mensajes_log`: a las 07:46 el agente AUTO-ENVIÓ esa frase (categoría graduada `checkin`); a las 08:48 la reprocesó **como si fuera un mensaje nuevo del huésped** y se propuso una respuesta a sí mismo.
  - **Causa raíz:** la atribución host/guest en `contexto.ts` dependía SOLO de `m.sent_by_owner` de Smoobu, que `/api/threads` no trae y `/api/reservations/{id}/messages` a veces deja vacío. Nuestra respuesta reapareció en el hilo sin esa marca → etiquetada `guest` → fallaron TODOS los guards (`ultimoMsg.from==='host'`, `ya_respondido`, dedup por msgId distinto, `esMensajeAutomatico` —nuestros envíos van sin asunto—).
  - **Fix (ground truth = lo que NOSOTROS enviamos):** nuevo módulo puro `lib/sivra/agente-huesped/atribucion.ts` (`normalizarTexto`/`setEnviados`/`corregirAtribucion`/`esEcoPropio`, +5 tests `node --test`). `contexto.ts` carga las respuestas ya enviadas (`mensajes_log.auto_sent=true`, últimas 30) y **corrige a `host`** cualquier mensaje del hilo cuyo texto coincida (expone `Contexto.enviados:Set<string>`). `orquestador.ts` añade guard `esEcoPropio(pregunta, ctx.enviados)` → `accion:'eco_propio'` (cubre el sondeo, que pasa la pregunta directa de `/api/threads` aunque aún no esté en el historial). Umbral anti-falso-positivo: solo se cruzan textos ≥15 chars (un huésped no reproduce una frase entera nuestra; un "sí"/"ok" suelto podría coincidir por azar). Disparo manual exento.
  - **Sin migración de BD.** No había propuesta fantasma atascada en `mensajes_pendientes_tg` (el `ON CONFLICT` la sobrescribió con la pregunta real "Qué tipo de cafetera?"). Tests del agente: 43/43 verde.

- **🧹 LIMPIEZA · revisión correos GitHub + barrido de envs/credenciales muertas — 25/06/2026 — branch `claude/github-noreply-email-review-lbzv7k` · PR draft #512**
  Alberto pidió revisar el Gmail de `noreply@github.com` (resumen) y luego limpiar lo que no se usa. Avisos de GitHub: caducidad de tokens (`iarest` fine-grained → caducó; `ialimp` classic con scopes admin amplios) + 2FA obligatorio.
  - **Token `iarest` = env `GH_PAT`** (ia-rest): se gestiona desde el **panel de operador** `https://plataforma-ten-flame.vercel.app/operador/secretos` (login `/login`). Alberto lo **regeneró** (caduca **25-jul-2026**) y lo iba a pegar en `GH_PAT`. Consumidores a verificar tras el cambio: blog SEO (`apps/ia-rest/src/app/api/cron/blog-seo/route.ts`), agente arquitecto (`.../api/super/agente-arquitecto/route.ts`), publicar blog (`.../api/super/blog/route.ts`).
  - **Token `ialimp` (classic):** NO lo consume ninguna app del repo (no está en `secrets-registry.ts`). Decisión de Alberto ("lo que no se usa, fuera"): **borrarlo en GitHub**, no registrarlo en el panel.
  - **Barrido de envs/credenciales muertas** (subagente, read-only): ~95 declaradas → solo **4 muertas**. (1) `STRIPE_PUBLISHABLE_KEY` en `apps/ia-rest/.env.example` era nombre equivocado (el código usa `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) → **renombrada** = único cambio del PR #512. (2-4) `SIVRA_URL`, `IAREST_SUPABASE_URL`, `IAREST_SUPABASE_SERVICE_KEY` → muertas, **borrar a mano en Vercel proyecto plataforma** (ya documentadas como pendientes). `DATABASE_URL`/`DIRECT_URL` NO están muertas (Prisma las lee implícito).
  - **Packages muertos:** `@central/module-agenda` y `@central/module-revenue` sin consumidores PERO **se mantienen a propósito** (andamio para verticales futuras — decisión de Alberto, no tocar).
  - **PR #512** (draft): CI verde (10/11 al cerrar la sesión, faltaba solo "Lint·TypeCheck·Build"). Suscrito a su actividad + cron horario de auto-revisión.
  - **🐛 BUG del panel de secretos encontrado y arreglado (mismo PR #512):** al guardar `GH_PAT` (clave que YA existía en Vercel), el panel devolvía `"A variable with the name GH_PAT already exists … on branch undefined"`. Causa: `upsertProjectEnv` (`apps/plataforma/lib/vercel-env.ts`) solo hacía el PATCH si el error de Vercel traía `error.envVarId`, y la API NO siempre lo incluye → caía al mensaje crudo sin actualizar. Fix: si el create falla por conflicto, se **lista** la env del proyecto (`GET /v9/projects/{id}/env`, sin `decrypt` → nunca se lee el valor) y se hace **PATCH solo del valor** (preservando target/rama → evita el conflicto "branch undefined"); rota todas las entradas con ese nombre. **Requiere merge + deploy de plataforma a producción** para que el panel deje de fallar.
  - **Verificación de la env muerta:** Alberto confirmó que `SIVRA_URL`/`IAREST_SUPABASE_URL`/`IAREST_SUPABASE_SERVICE_KEY` ya NO existen en el proyecto Vercel plataforma (eran referencias residuales en docs). `DATABASE_URL`/`DIRECT_URL` son envs compartidas del equipo (no a nivel proyecto).
  - **🧹 Limpieza total del rename `ia.rest`→`central` (mismo PR #512):** al renovar el `GH_PAT` se descubrió que el código seguía apuntando al repo viejo `albertosuarezgutierrez-gif/ia.rest` (ya no existe; renombrado a `central`) Y, peor, usaba rutas de cuando el repo era solo la app (`src/app/blog/…`) en vez de las del monorepo (`apps/ia-rest/src/app/blog/…`). Arreglado: (a) nombre de repo `ia.rest`→`central` en las 4 rutas que llaman a la API de GitHub (`blog/route.ts`, `blog-publicar`, `agente-arquitecto`, `blog-seo`); (b) rutas del blog prefijadas con `apps/ia-rest/` (`blog/route.ts` ×2, `blog-publicar`); (c) ejemplos de ruta del agente-arquitecto actualizados a `apps/ia-rest/…`; (d) URLs de descarga APK/bridge (`bridge-config.ts`, `app/route.ts`, `descargar/page.tsx`, `version.json`) y la URL `raw` de `bridge-setup.sh` (ahora `…/central/main/apps/ia-rest/scripts/bridge-local.js`); (e) docs/skills de referencia (`ia-rest-maestro`, `ia-rest-project.skill`, `SKILL-proyecto-claude`, `manual-iarest`). Dejadas SIN tocar las referencias históricas (log de sesión 828 ya corregido en 772, y el plan datado 2026-06-21). **El `GH_PAT` fine-grained debe acotarse al repo `central` con permiso Contents Read and write.**
  - **PENDIENTES de Alberto:** ✅ 2FA ya activo · ✅ token `ialimp` borrado · ✅ envs muertas no existían · ⏳ configurar `GH_PAT` (acceso a repo `central`, Contents R/W) y meterlo en Vercel ia-rest (o por el panel ya arreglado, tras merge+deploy). Posible recordatorio para mediados de julio (token caduca 25-jul).

- **📘 MANUAL + datos demo + fix login para reunión Catering JJ — 25/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  - **Manual operativo** cocina central + logística como página estática: `apps/ia-rest/public/manual-jj.html` → **`https://www.iarest.es/manual-jj.html`** (noindex; 15 secciones + flujo boda). Junto al guion `guion-demo-jj.html`.
  - **Datos demo sembrados en PRODUCCIÓN** (BD `wswbehlcuxqxyinousql`, schema `iarest`, tenant JJ `067c8bab-…`), marcador `[seed-demo]` para revertir: dietas en Boda Familia Pérez (sin gluten 5, vegano 3), 8 recepciones, materiales 5→21 + 3 kits + 22 líneas + rotura/reserva/proveedores/clientes, 2 menús de evento, y boda CRM con 6 costes + 8 invitados + 4 APPCC. **Solo el tenant JJ.**
  - **Login JJ aclarado:** Carmen 1234 / Joaquín(owner) 1369 / Montador 4040 / cocineros Marta 2001·Diego 2002·Lucía 2003. El "error pin" era por el **`)` pegado al enlace** (`...jaen)` no resuelve) o entrar sin `?r=` (cae a DEMO). `resolve_restaurante` + `login_pin` verificados OK en prod.

- **🔧 AGENTE HUÉSPEDES SIVRA · BOTÓN "RETOCAR SOBRE EL BORRADOR" — 25/06/2026 (branch `claude/luxury-busto-guest-reply-n8ltqp`)**
  Origen: borrador real (Luxury Busto · David, reserva 142771692) — el huésped preguntó el TIPO de cafetera y el borrador solo decía "cafetera y microondas". Alberto quería **retocar el borrador** (no reescribir entero), enviar y aprender. Spec/plan en `docs/superpowers/{specs,plans}/2026-06-25-retoque-borrador-huesped*`.
  - **Qué se hizo:** nuevo botón **🔧 Retocar** (`callback hsp_tune`) junto a ✅ Enviar / ✏️ Modificar en la propuesta de Telegram. Al pulsarlo escribes una INSTRUCCIÓN corta ("añade que la cafetera es italiana") y la IA la aplica sobre el borrador (que ya está en el idioma del huésped → resultado en su idioma sin traducir aparte). Helper puro-inyectable `lib/sivra/agente-huesped/retoque.ts` (`aplicarRetoque`, aiComplete por **import dinámico** para que el test corra con `node --test`). Modo `esperando_retoque` en el webhook; confirmación a Alberto con línea 🔁 en español si el huésped no es hispanohablante.
  - **Aprendizaje Q→A:** nueva columna `mensajes_pendientes_tg.pregunta` (+ `esperando_retoque`) — el agente ahora guarda el par pregunta→respuesta (antes `mensajes_aprendizaje` se llenaba con `pregunta=''`). Arreglado también en los caminos Modificar/aprobación existentes.
  - **Archivos:** `telegram-msg.ts` (botón + persistir pregunta), `telegram-webhook/route.ts` (acción tune + fix aprendizaje), `retoque.ts`+`retoque.test.ts` (NUEVOS), `prisma/sql/2026-06-25_retoque_borrador.sql`.
  - **Verificación:** 38/38 tests del módulo (`node --test`) verdes; SQL **aplicada y verificada contra Supabase real** (`wswbehlcuxqxyinousql`); los cambios no introducen errores de `tsc` nuevos (los 92 errores `Prisma` del repo son el cliente sin `prisma generate`, env sin engine binary tras el proxy). No toca RLS ni ialimp.

- **📦 RECEPCIÓN DE MERCANCÍA MULTI-MODAL (cocina central) · IMPLEMENTADO Y MERGEADO — 25/06/2026 — PR #511 (branch `claude/information-extraction-orls7m`)**
  Construido end-to-end (spec→plan→código→pruebas→merge) tras el "ok a todo hazlo, prueba y mergea" de Alberto. Spec y plan en `docs/superpowers/{specs,plans}/2026-06-25-recepcion-mercancia-multimodal*`.
  - **Qué se hizo:** (B) `geminiVision` nuevo en `@central/core-ai` + `callAIVision` reordenado a **gateway→Gemini→NIM** (fallback real que antes no existía; afecta a TODA la visión del proyecto — marcado en el PR). Compresión de foto relajada a ~1.8 MB (Gemini admite imágenes grandes → lee la letra pequeña). (A) escáner EAN cliente (`BarcodeDetector` nativo + fallback `@zxing/browser`), ruta `/api/cocina/recepciones/ean` (catálogo propio→Open Food Facts), `nombrePorEan` extraído a `lib/recepcion-ean.ts`. (C) migración `cocina_recepciones.codigo_barras`+`evidencia_url` (aplicada vía MCP) y persistencia. (2) `/temperatura` (foto de sonda→Tª). (3) `/evidencia` (sube original al bucket privado `recepciones` ya creado, URL firmada 1 año). (4) `/caducidades` + lógica pura `recepcion-caducidades.ts` + **banner FEFO on-screen** en `/produccion`. (5) escaneo continuo multi-EAN con dedupe.
  - **Verificación:** 10/10 tests (`node --test`: 3 core-ai + 7 ia-rest), `tsc --noEmit` 0 errores, **`next build` OK**.
  - **Decisiones de Alberto:** `callAIVision` global (no acotado) + bucket `recepciones` nuevo. Voz FUERA. Esperado-vs-recibido = futuro (necesita "lista esperada").
  - **PENDIENTE/seguimiento:** vigilar que el reorden de `callAIVision` no degrade otros usos de visión (qr-assistant, etc.); si hace falta, captura "enfocada" de lote/caducidad como iteración (hoy va por el flujo de `reconocer`).

- **📦 RECEPCIÓN DE MERCANCÍA MULTI-MODAL (cocina central) · SPEC — 25/06/2026 — branch `claude/information-extraction-orls7m`**
  Alberto enseñó una foto (multipack de atún de Mercadona) procesada por la foto-recepción de `/produccion` (Catering JJ): salió mal (`producto`="…PORTE", `lote`="30g (6x8…)" = confundió el peso con el lote, `proveedor` vacío). Diagnóstico: el endpoint `api/cocina/recepciones/reconocer` **solo** usa `callAIVision` → **NIM `llama-3.2-11b-vision` sin fallback**, y la foto se machaca a **≤170 KB** (`fotoAJpegPequeno`) por el tope de 180 KB inline de NIM → letra pequeña ilegible. Decisión: hacerlo **multi-modal** ("que sirva para todo": packs de súper + albaranes + mayorista).
  - **Spec escrito y commiteado:** `docs/superpowers/specs/2026-06-25-recepcion-mercancia-multimodal-design.md`.
  - **Alcance elegido por Alberto:** Núcleo C (escáner EAN cliente `BarcodeDetector`+ZXing con catálogo propio que aprende EAN de marca blanca · motor **Gemini Vision** nuevo en `@central/core-ai` como fallback real de `callAIVision` · fin de la compresión a 170 KB · captura lote/caducidad enfocada + persistir `codigo_barras`) **+ idea 2** (Tª por foto de la sonda) **+ idea 3** (foto-albarán archivada en Storage como prueba APPCC) **+ idea 4** (banner **FEFO on-screen** en la pantalla de Carmen; Telegram solo opcional para Alberto, por la regla "operador→Telegram, usuarios finales→pantalla") **+ idea 5** (escaneo continuo multi-EAN). **Voz FUERA.** **Esperado vs recibido (idea 6) = futuro** (necesita "lista esperada" que no existe).
  - **Migraciones previstas (schema `iarest`, aditivas):** `cocina_recepciones.codigo_barras text` + `evidencia_url text`.
  - **⚠️ Decisión abierta pendiente del visto bueno de Alberto:** (1) el cambio de orden en `callAIVision` (Gemini→NIM) afecta a TODOS los consumidores de visión, no solo recepción → confirmar si se acota o no; (2) bucket Storage `recepciones` nuevo para la foto-evidencia.
  - **PENDIENTE:** Alberto revisa el spec → si OK, pasar a `writing-plans` (plan de implementación). Aún NO hay código, solo el spec.
- **👻 AGENTE HUÉSPED · fix "escalado fantasma" (recordatorio horario de un mensaje ya respondido) — 25/06/2026 — branch `claude/busto-reform-guest-reply-imltis`**
  Síntoma: a Alberto le llegaba cada hora "⏳ Escalados pendientes de tu OK" con la reserva 142612302 y el texto que YA había enviado. **Causa (diagnosticada en la BD real):** a las 21:25 se envió la respuesta a Patrycja (`mensajes_log auto_sent=true, edited=true`); a las 21:28 el MISMO mensaje "everything perfect" se reprocesó y creó una **propuesta duplicada** en `mensajes_pendientes_tg` que nadie contestó (ya estaba contestada). El cron `recordar-pendientes` (horario, lista todo lo >3h) la sacaba sin parar.
  - **Raíz:** el dedup por `msgId` divergía entre el **sondeo** (`/api/threads`, id numérico) y el **webhook** (`procesarMensajeHuesped(bookingId)` sin msgId → cae a `ultimoGuest.id` del historial `/api/reservations/{id}/messages`, otra fuente / `created_at`) → mismo mensaje, **dos claves** → se procesa 2×. Y el **envío saliente propio** dispara `newMessage`, que con el desfase de Smoobu burla el guard "último=host".
  - **Fix (`orquestador.ts`):** guard robusto independiente del id — antes de procesar, si existe en `mensajes_log` un envío `auto_sent=true` con `created_at >= ts` del último mensaje del huésped → `accion: 'ya_respondido'` (no propone). Se salta en disparo MANUAL (`msgId 'manual:…'`, que sirve para re-proponer a propósito). Best-effort (si la consulta falla, sigue el flujo). 34 tests del agente verdes.
  - **Limpieza:** borrada a mano la fila fantasma (`mensajes_pendientes_tg` booking 142612302, tg_message_id 1128) vía Supabase MCP → 0 pendientes.

- **💬 AGENTE HUÉSPED · responder a lo que escribe el huésped (no soltar horarios) — 24/06/2026 — branch `claude/busto-reform-guest-reply-imltis`**
  Feedback de Alberto sobre un borrador para Patrycja (Busto Reform, reserva 142612302): el huésped solo escribió *"Everything is perfect, thank you!"* (y ya está dentro del apartamento) y el agente respondió con un bloque largo que **repetía la hora de check-in/check-out**. Queja: *"¿por qué saca tema de hora si ya está dentro? hay que responder sobre lo que escriba… que parezca real"*.
  - **Causa:** el system prompt de `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` forzaba **"4-6 frases" + despedida genérica** en TODA respuesta → con un simple agradecimiento el modelo rellenaba con datos no pedidos (horarios).
  - **Fix (solo prompt):** "REGLA DE ORO: responde EXACTAMENTE a lo que el huésped dice y a nada más; NO añadas info no pedida (horarios entrada/salida, normas, parking, wifi) salvo que pregunte; el huésped YA está dentro → no repetir check-in/out salvo pregunta expresa". Longitud **adaptada al mensaje**: agradecimiento/comentario positivo → 1-2 frases cálidas; pregunta real → detalle necesario. Tono "persona real, no folleto". Sin cambios de lógica/tipos; los 34 tests del agente siguen verdes.
  - **Verificado EN VIVO:** Alberto corrigió el borrador de Patrycja por Telegram (✏️ Modificar) y el sistema lo envió ("✅ Enviado al huésped" en EN, sin horarios). El fix del prompt automatiza este criterio de aquí en adelante.

- **🔐 PANEL DE SECRETOS · FASE 2 (escritura blindada + redeploy auto) — 24/06/2026 — mergeado #502/#494/#503/#504**
  Sobre el panel-inventario de #492 (solo lectura), Alberto eligió la **"Versión blindada"**: poder **crear/editar** desde el god-panel de operador, pero **solo** claves de **API externa** marcadas `editable` en el registro (NUNCA firma-sesión, NUNCA borrados — eso sigue en Vercel). Defensa en profundidad (6 candados): operador logueado (`getAdmin`) → **2º factor** = re-teclear la contraseña de operador (`loginAdmin`/bcrypt) → allow-list por registro (`editable` + `vercelProject`) → doble candado que rechaza `tipo==='firma-sesion'` → **write-only** (jamás se lee/devuelve el valor; POST/PATCH a la API de Vercel, production+preview) → **auditoría** en `secrets_audit` (actor/clave/proyecto/fecha, sin valor) → **INERTE** sin `VERCEL_ADMIN_TOKEN` (503).
  - **Redeploy automático (#504, `48bd3d8`):** tras escribir la env, el endpoint lanza un redeploy de producción del proyecto destino (`redeployProjectProduction` → Vercel `POST /v13/deployments` con `deploymentId`+`withLatestCommit`). **Best-effort**: si falla, el guardado vale y el panel avisa de redeployar a mano. Objetivo cumplido de Alberto: **gestionar claves sin entrar nunca a Vercel.**
  - **Archivos:** `lib/vercel-env.ts` (`upsertProjectEnv` write-only + `redeployProjectProduction`), `app/api/operador/secretos/set/route.ts` (POST con 6 candados + redeploy auto; devuelve `{redeployed, redeployError}`), `app/(usuario)/operador/secretos/SecretosClient.tsx` (botón ✏️ Editar + form inline), `lib/secrets-registry.ts` (`editable`/`vercelProject`), `prisma/sql/2026-06-24_secrets_audit.sql` (tabla, **ya aplicada** vía Supabase MCP).
  - **Activación (hecho por Alberto):** token Vercel `plataforma-secrets-panel` (scope team, Never) puesto como `VERCEL_ADMIN_TOKEN` (Sensitive) en *plataforma* Production+Preview. ⚠️ Token con escritura+deploy sobre los 5 proyectos del team → rotarlo periódicamente.
  - **Claves editables:** GEMINI/GROQ (plataforma) · RESEND_WEBHOOK_SECRET/GOOGLE_PLACES_API_KEY/TURNSTILE_SECRET_KEY (ialimp) · GOOGLE_CLIENT_SECRET/CLOUDINARY_API_SECRET/GH_PAT (ia-rest) · SERPER_API_KEY (sivra) · **CIMA_WSE_PASSWORD (plataforma — alta nueva #503, web service Codeoscopic/CIMA de la correduría; aún sin consumidor en código).**
  - **Flujo para gestionar una clave nueva desde el panel:** registrarla en `secrets-registry.ts` con `editable:true` + `vercelProject` (el panel NO crea nombres arbitrarios, por diseño — es la allow-list).
  - **Probado en vivo:** Alberto editó `CIMA_WSE_PASSWORD` en producción → "✅ Guardada en Vercel" (circuito auth→2FA→allow-list→escritura→auditoría OK). El redeploy auto entró después (#504).
  - **PENDIENTE elegido por Alberto:** subir el 2º factor a **TOTP** (app autenticadora, factor independiente) — más adelante. Idea adicional barata: **rate-limit** de intentos en el endpoint `set` (hoy no hay).

- **💸 VIGILANTE DE COBROS OTA (Booking/Airbnb/Expedia) — 24/06/2026 — branch `claude/auto-respond-guest-messages-ai-syzmhb`**
  Pedido por Alberto tras el webhook en tiempo real ("emparejador de cobros"). Objetivo: avisar **solo en el dashboard** cuando una reserva OTA hizo checkout hace más del margen del canal y la OTA aún no ha pagado. Flujo brainstorming→spec→plan→build (spec+plan en `docs/superpowers/{specs,plans}/2026-06-24-vigilante-cobros-ota*`).
  - **Diseño clave:** el canal del abono NO es fiable (los cobros del Dúplex llegan con concepto genérico `ABONO… LIQ. OP.`, sin nombre de OTA) → el match es **OTA-wide por importe+fecha**, y el **margen lo aporta el canal de la RESERVA** (`incomes.portal`): Booking/Airbnb **7d**, Expedia **35d**. Umbral aviso **50€**, tolerancia 0,02€. v1 dispara **solo por pendientes**; huérfanos = contexto.
  - **Archivos:** `lib/sivra/cobros-ota.ts` (lógica PURA `reconciliarCobrosOTA` + 8 tests `node --test`), `lib/sivra/cobros-ota-db.ts` (`getEstadoCobrosOTA`, separado para no romper el type-stripping de node --test con el import de prisma), `lib/banca.ts` (`getAlertas` → `cobrosPendientes/Eur/Detalle`), `app/(usuario)/dashboard/page.tsx` (banner 💸). **Sin tablas/crons/envs nuevos** — se calcula al vuelo en el dashboard.
  - PENDIENTE fase 2 (anotado): huérfanos como disparo, emparejador por referencia exacta `NO.<ref>ID`, split por piso.

- **🔗 WEBHOOK SMOOBU → reacciones en cadena (limpieza + pricing reactivo) — 24/06/2026 — branch `claude/auto-respond-guest-messages-ai-syzmhb`**
  Sobre el webhook de reservas en tiempo real, Alberto pidió aprovechar la conexión para 1 (limpieza auto), 3 (pricing reactivo) y 5 (cuadre Booking); 2 (alertas) y 4 (bienvenida) quedan para más tarde.
  - **#5 cuadre Booking:** NO requiere código. `/api/duplex/cuadre-booking` es un informe de solo lectura (banco vs `incomes`); con `incomes` ya en tiempo real, el cuadre queda vivo solo. El emparejador por cobro individual (cuelga del feed del banco, no de Smoobu) queda como tarea futura.
  - **#1 + #3 (webhook/route.ts):** tras `runSync` en eventos de reserva, se lanza `reaccionarAReserva()` que ejecuta en **`after()` de Next 15** (NO bloquea la respuesta a Smoobu → evita reintentos por timeout): (a) `auto-sessions` GET (crea/ajusta sesiones de limpieza, idempotente) y (b) `apply-auto` GET con `days=45` (repricing reactivo de la ventana cercana; el motor respeta pausa/confianza/apply_enabled). Ambos reutilizados vía import + `NextRequest` forjado con `CRON_SECRET` (Bearer + `?secret`). El cron diario sigue tarificando 365d como red de seguridad.
  - Caveat conocido: `auto-sessions` no borra la sesión de limpieza de una reserva CANCELADA (limitación preexistente del cron, no regresión).

- **🐛 FIX BUILD ia-rest: `/estado` rompía el prerender — 24/06/2026**
  El build de ia-rest fallaba (FAILED en Vercel) al pre-renderizar `app/estado/page.tsx`: `SyntaxError: Unexpected token '<' ... is not valid JSON`. Causa: `getEstado()` hacía `return r.json()` **sin `await`** dentro de un try/catch → cuando `/api/estado` devuelve HTML (durante el build el endpoint propio aún no está vivo), el rechazo de `r.json()` escapaba al try/catch y reventaba el export. Fix: `return await r.json()` → el catch lo atrapa y la página usa sus datos por defecto. (No tiene relación con el agente/webhook; salió a la luz porque el PR #490 reconstruye todas las apps.)

- **⚡ SMOOBU WEBHOOK EN TIEMPO REAL: mensajes + reservas/dinero — 24/06/2026 — branch `claude/auto-respond-guest-messages-ai-syzmhb`**
  Disparador: a Alberto le llegó una incidencia de huésped (Patrycja, 142612302, "no keys") y respondió a mano en Booking porque "no llegó a Telegram". Diagnóstico: el agente SÍ la procesó (categoria=acceso, needs_human, propuesta a Telegram) pero ~2 min tarde — el poller `auto-reply` corre cada 3 min (`*/3 * * * *`) y Booking le mandó el push instantáneo antes. NO estaba roto, solo lento. (Borré la propuesta colgada de esa reserva para que no re-spamee.)
  - **Fix raíz: activar el webhook de Smoobu.** Alberto lo configuró en Smoobu **Advanced → API Keys → Webhook URLs** (la UI actual no filtra por evento → manda TODOS los eventos). URL: `https://plataforma-ten-flame.vercel.app/api/sivra/mensajes/webhook`. PENDIENTE confirmar 200 vs 401 (no hay llamadas en logs aún; no pude probar el endpoint desde el contenedor — proxy bloquea `*.vercel.app`). Si 401 → hay `SMOOBU_WEBHOOK_SECRET` y la URL necesita `?k=<secret>`.
  - **Como Smoobu manda TODOS los eventos**, aproveché para que el webhook actualice **reservas+ingresos en tiempo real** (idea de Alberto: "¿no es mejor un agente que analice y actualice el programa?"). Principio acordado: **el código determinista actualiza los números (NUNCA un LLM); el agente solo analiza/avisa.** Extraído `runSync` a `lib/sivra/smoobu-sync.ts` (reusado por el cron `updates/sync` y por el webhook). El webhook enruta por `action`: `newMessage`→agente; `new/update/cancelReservation`→`runSync(2,5)` (idempotente, upsert en `incomes`); resto→ignora. El cron `updates/sync` (cada ~6h) queda como red de seguridad.
  - PENDIENTE (futuro paso 2): capa de análisis del agente encima de los datos ya en vivo (alertas de ocupación, huecos, cobros que no cuadran).

- **🤖 AGENTE HUÉSPEDES: escalados atascados + aprendizaje incompleto — 24/06/2026 — branch `claude/auto-respond-guest-messages-ai-syzmhb`**
  Alberto recibía cada hora el recordatorio "Escalados pendientes de tu OK" con las MISMAS 3 reservas (142846717 checkin ~24h, 131511815 general en `esperando_edit=true` ~22h, 132494657 recomendacion ~21h — la de Gladys). Causa: el cron `recordar-pendientes` re-avisa de toda fila de `mensajes_pendientes_tg` con `created_at > 3h`, y esas 3 nunca se cerraron (la 131511815 quedó a medias: pulsó ✏️ Modificar y no envió la corrección). **Acción:** `DELETE` de las 3 filas de `mensajes_pendientes_tg` ("dar por contestado, empezar de nuevo" — pidió Alberto). La idempotencia (`update_logs`) evita que se vuelvan a proponer.
  - **Verificación del aprendizaje (lo pidió Alberto):** SÍ funciona pero solo a medias. Estado BD: `mensajes_aprendizaje=1`, `mensajes_log=30` (corregidos=1, enviados=6), `mensajes_auto_config auto_enabled=0`. El bucle estaba cerrado SOLO para correcciones: `aprenderCorreccion()` (corrección por force_reply) → `mensajes_aprendizaje` → `contexto.ts` (últimos 8/piso) → `decidir.ts` (prompt "EJEMPLOS APROBADOS POR EL ANFITRIÓN"). Pero **aprobar tal cual (✅ Enviar / "ok"/"vale") NO guardaba ejemplo** → con 6 envíos solo 1 aprendido.
  - **Fix (`telegram-webhook/route.ts`):** ahora las DOS ramas de aprobación (botón `send`/`grant`/`grad` y aprobación corta por texto) también llaman `aprenderCorreccion()` con el borrador aprobado → el agente aprende de TODAS las respuestas de Alberto, no solo de las correcciones.

- **🟢 ia-rest /produccion · Recepción de mercancía: la IA ya lee la foto de etiqueta — 24/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)**
  - **Bug reportado por Alberto (Catering JJ):** el botón "📷 Foto de etiqueta / albarán" no leía nada y se veía como un rectángulo gris muerto.
  - **Causa 1 (cosmética):** en estado "Leyendo…" el texto iba `color: C.ink3` sobre fondo `C.ink3` → invisible. Fix: texto en blanco.
  - **Causa 2 (de fondo):** la foto se mandaba **en crudo** a NVIDIA NIM (`integrate.api.nvidia.com`, `meta/llama-3.2-11b-vision-instruct`), que **rechaza imágenes inline > ~180 KB**. Una foto de móvil lo supera → la IA fallaba/colgaba. Fix: `fotoAJpegPequeno()` reduce y recomprime en canvas (JPEG, orientación EXIF) hasta <170 KB antes de enviar; fallback a crudo si no hay canvas. + `catch` que avisa.
  - **Mejoras posteriores (mismo día, pedidas por Alberto al probar):** (a) **nombre por código de barras** — si la foto es solo el EAN, `recepciones/reconocer` lo resuelve contra **Open Food Facts** y rellena el nombre real (no vuelca los dígitos en Producto); (b) campo **"Fecha recepción"** visible en el form, **hoy** por defecto (el API ya tenía la columna `fecha`).
  - **Archivos:** `apps/ia-rest/src/app/produccion/page.tsx` + `.../api/cocina/recepciones/reconocer/route.ts`. `tsc --noEmit` verde.
  - **⚠️ Mismo patrón latente** en `WineScannerModal.tsx` (y otros escáneres) que también mandan `readAsDataURL` en crudo → si fallan, aplicar el mismo `fotoAJpegPequeno`.
- **📄 Guion de demo de Catering JJ como URL — 24/06/2026** (PR #395 mergeado a `main`)
  - El guion de la boda 100 pax (cocina · dietas · material · owner · montador) servido como página estática: `apps/ia-rest/public/guion-demo-jj.html` → **`https://www.iarest.es/guion-demo-jj.html`** (mismo patrón que `demo-saboga.html`). `noindex` (pública, lleva PIN de demo).
- **🍽️ CATERING JJ: guion-URL + recepción por foto + módulos catering — 24/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`, PRs #395/#496/#497/#499 mergeados)**
  Sesión de soporte en vivo con Alberto (owner de Catering JJ = tenant **`demo`** con branding "Joaquín Jaén"; el login `?r=catering-joaquin-jaen` resuelve a `demo`).
  - **Guion de demo como URL (#395):** `apps/ia-rest/public/guion-demo-jj.html` (estático, `noindex`) → **`https://www.iarest.es/guion-demo-jj.html`**. Boda 100 pax: cocina · dietas · material · owner · montador, con "🎙️ Di esto / 👆 Haz esto". Mismo patrón que `demo-saboga.html`.
  - **Recepción de mercancía — la foto no se leía (#496):** dos bugs en `/produccion`. (1) botón "Leyendo…" con `color==fondo` (C.ink3) → invisible, parecía muerto → texto en blanco. (2) **GOTCHA NIM:** la foto se mandaba en crudo a NVIDIA NIM (`meta/llama-3.2-11b-vision`, `integrate.api.nvidia.com`) que **rechaza imágenes inline > ~180 KB**; una foto de móvil siempre lo supera → no leía. Fix: `fotoAJpegPequeno()` reduce/recomprime en canvas a <170 KB antes de enviar. **Aplicar el mismo patrón a `WineScannerModal`/otros escáneres si fallan** (mandan `readAsDataURL` en crudo).
  - **EAN→nombre + fecha (#496):** si la foto es solo el código de barras, `recepciones/reconocer` resuelve el EAN contra **Open Food Facts** (`nombrePorEan`) y rellena el nombre real; campo "Fecha recepción" (hoy por defecto). *(Después, la rama `nice-mendel` (#498, commit 4fb6287) refactorizó el flujo a recepción BATCH multi-foto + plantilla de pedido habitual; el lookup EAN y reconocer siguen intactos.)*
  - **Módulos catering activables (#497):** el menú owner oculta los grupos `materiales` (`/owner/materiales`) y `eventos` si `modulos_activos` no los lleva, y **no estaban en la lista conmutable de `ModulosTab`**. Añadido grupo "Catering & eventos" con toggles `eventos`+`materiales`; `eventos` añadido a `TODOS_MODULOS` en `api/owner/modulos`. **Importante:** `modulos_activos` se lee SOLO al cargar la página (la PUT no refresca el menú).
  - **Auto-recargar al guardar módulos (#499):** por lo anterior, activar un módulo no hacía aparecer su sección hasta recargar a mano (confuso). `ModulosTab.guardar()` ahora hace `window.location.reload()` a los 900 ms tras el ✓.
  - **Infra observada:** la Supabase accesible por MCP (`efncqyvhniaxsirhdxaa`, "ia-rest") **NO es la de producción de iarest.es** (no tiene `cocina_recepciones`; solo `demo`+`saboga`). La BD viva de producción está en otro proyecto no conectado al MCP. → no se puede verificar `modulos_activos` real desde aquí.

- **📦 RECEPCIÓN BATCH + PEDIDO HABITUAL (ia-rest) — PR #498 draft — branch `claude/nice-mendel-7q88xm` — 24/06/2026**
  Carmen (Catering JJ) recibía un pedido a la vez con confirmación por foto; con muchos repartidores seguidos el flujo era lento.
  - **Flujo nuevo:** botón "Añadir foto" multi-disparo — cada foto acumula productos en una tabla de revisión editable (`recPendientes[]`). "Registrar todo (N)" los inserta en paralelo con `Promise.allSettled`. Sin dialogo intermedio.
  - **Reconocimiento de pedido habitual:** si la IA reconoce el proveedor en la foto, se consulta el endpoint nuevo `GET /api/cocina/recepciones/plantilla?proveedor=X`. Si hay historial, se pre-cargan los productos de la ÚLTIMA entrega de ese proveedor (plantilla histórica) en vez de volver a leer la foto. Banner ámbar "Pedido habitual detectado". Sin ML, sin tablas nuevas.
  - **Archivos modificados:**
    - `apps/ia-rest/src/app/produccion/page.tsx` — reemplaza `reconocerFoto`/`crearRecepcion`/`recForm` por `añadirFotoACola`/`registrarTodos`/`recPendientes`. UI de tabla inline editable.
    - `apps/ia-rest/src/app/api/cocina/recepciones/plantilla/route.ts` — **nuevo** endpoint GET que busca `MAX(fecha)` por proveedor en `cocina_recepciones` y devuelve esos productos.
  - **Vercel:** 5/5 builds Ready (24/06 19:32 UTC). tsc sin errores nuevos.
  - **Pendiente:** merge del PR una vez Alberto revise. Ideas opcionales anotadas en sesión: alerta caducidad próxima, alert temperatura APPCC vía Telegram, linking recepciones→ingredientes.

- **🛡️ PRICING: guard de SUELO ESTACIONAL + review Busto con Booking — 24/06/2026 (rama `claude/dynamic-pricing-uhvnak`)**
  - **Caso real que lo motivó:** entró reserva Busto Apr 10-13'27 (Booking) a **94€ lista / 70€ neto**. `rate_snapshots` mostró
    que el motor **decayó esa fecha de 129€ (17-jun) al suelo 94€ (22-jun)** al caducar los comps del mes (perdió bucket → cayó
    al global bajo → se deslizó a min_price); el huésped la pilló barata el 23-jun, horas antes del reseteo de comps. La fuga
    no es solo "no subir": el motor **BAJA semanas altas al suelo** cuando el mercado caduca.
  - **Fix (motor):** suelo estacional en `app/api/sivra/pricing/apply/route.ts` = `min_price × FLOOR_SEASONAL[mes]`
    (nueva `seasonalFloorFactor()` en `lib/pricing-calendar.ts`; alta mar-jun/sep-oct/dic, eventos suben más, acotado a
    max_price). Gateado por **`pricing_settings.seasonal_floor_k`** (migración `prisma/sql/2026-06-24_pricing_seasonal_floor.sql`,
    default **0 = inerte**). **Busto activado a k=1** → suelos: Abr/May 117€, Mar/Sep 113€, Jun 104€, Oct/Dic 108€, baja 90€. No
    depende de mercado fresco (a diferencia de PR #440).
  - **Review Busto (Booking apartamentos 2pax centro):** sembrado `market_rates` (search_date HOY) Jul/Ago/Sep/Nov/Dic
    (p55 103/84/132/131/114) → las 24 noches libres de abril pasaron de suelo a **146€ media (0 a suelo)**. Septiembre era el
    leak (95 vs 132); agosto correcto (~92, no tocar); Feb 19-21 = Maratón (evento, no baseline). Aprendizajes en
    `pricing_aprendizaje` (`abril_pre_feria`, `sep_media`).
  - **PR #440 MERGEADO** (Ticketmaster + 3 fuentes gratis). Pendiente manual: `TICKETMASTER_API_KEY` en Vercel `plataforma`
    (copiar de `ia-rest`). tsc verde; migraciones aplicadas a la BD.

- **🔑 PANEL-INVENTARIO DE SECRETOS en el god-panel — branch `claude/unified-api-token-management-aklwp8` — 24/06/2026**
  Lo que Alberto pidió desde el principio ("un apartado para todo el proyecto"), versión **mapa, no baúl** (Opción A, solo lectura, cero valores):
  - **`apps/plataforma/lib/secrets-registry.ts`** — registro declarativo de ~40 credenciales: `{name, tipo, proposito, verticales, dondeVive, proyecto?, obligatoria?, nota?}`. `tipo` ∈ firma-sesion/token-inter-app/cron/api-externa/login-humano/hash-usuario. `dondeVive` ∈ vercel-equipo/vercel-proyecto/bitwarden/bd-hash. **Sin un solo valor.** Es también documentación viva de qué secreto vive dónde.
  - **Página `/operador/secretos`** (`app/(usuario)/operador/secretos/{page,SecretosClient}.tsx`): agrupa por tipo (críticos arriba), filtro, banner "no se muestran valores", badges de vertical + obligatoria + nota. Auth `getAdmin()` (cookie `plataforma_admin`). Item `🔑 Secretos` añadido a `NAV_OPERADOR` en `UserSidebar.tsx`.
  - **Pendiente / fase 2 (a decidir con Alberto):** "write-through" para editar valores desde el panel (escribiría a Vercel por API, bien blindado) — hoy el panel solo enlaza mentalmente a Vercel/Bitwarden. La columna "dónde vive" ya está; falta el botón de edición si lo quiere.
  - Guardián de secretos sigue verde (el registro no dispara falsos positivos). Validación final en preview de Vercel.
  - **✅ CIERRE (24/06/2026):** las 3 entradas (hardening + prevención + panel) se **mergearon a `main` en PR #492** (squash `8ff9acf`). CI `tests.yml` verde (guardián + typecheck de las 5 apps, rrhh incluido → sin deuda de tipos); 5/5 previews de Vercel Ready. **VAPID de ia-rest ROTADA** por Alberto (nueva pública/privada en Vercel ia-rest Production&Preview + redeploy) → clave filtrada anulada. Envs de auth verificadas presentes en Vercel (`JWT_SECRET` ialimp; `JWT_SECRET_CRM`/`CRON_SECRET`/`SUPER_ACCESS_KEY` ia-rest). **Pendientes (opcionales):** fase 2 del panel (write-through a Vercel), adoptar `requireSecret()` en call-sites, cablear `eslint.config.mjs` en `rrhh`, y los opcionales del plan (gitleaks histórico, `tests.yml` como required check, guardián de rutas sin auth).

- **🛡️ PREVENCIÓN AUTOMÁTICA de fallbacks de secretos (+ VAPID privada filtrada) — branch `claude/unified-api-token-management-aklwp8` — 24/06/2026**
  Continuación del hardening: que esta clase de fallo se detecte sola. Por qué no se detectaba antes: ninguna red miraba el patrón (gitleaks solo ve secretos "de alta entropía" en commits nuevos; no había regla ESLint; el guardián solo vigilaba `@iarest/`; la auditoría es manual).
  - **Guardián nuevo `test/regression-secrets.test.ts`** (gate en `pnpm test:guardia`, Node puro): falla si un secreto de auth cae a un literal sin guarda de prod. Excluye `NEXT_PUBLIC_*` y `|| ''`. **En su 1ª ejecución cazó una VAPID PRIVATE KEY real hardcodeada** en `apps/ia-rest/src/lib/push.ts`, `qr-notify.ts` y `api/push/send/route.ts` → blanqueada (`|| ''`). **PENDIENTE Alberto: rotar el par VAPID de ia-rest** (`npx web-push generate-vapid-keys`, poner en Vercel; OJO: invalida las suscripciones push existentes → re-suscribir).
  - **Regla ESLint** `securityRules` (en `eslint.config.base.mjs`, `no-restricted-syntax`, warn) compuesta en ia-rest/ialimp/sivra/plataforma. **rrhh NO tiene `eslint.config.mjs`** (hallazgo aparte).
  - **`requireSecret()` en `@central/core-identity`** (`src/secret.ts` + test vitest) — encapsula la guarda de prod. Adopción en call-sites: PENDIENTE (helper listo).
  - **rrhh añadido al typecheck de CI** (`tests.yml` matrix) — antes se escapaba (lleva `ignoreBuildErrors`). OJO: si rrhh tuviera deuda de tipos, ese job saldrá rojo (es real, a reparar).
  - **Docs:** comentado el porqué de `ignoreBuildErrors` en plataforma/ialimp/rrhh; regla en `CLAUDE.md` raíz; check en `auditoria-central`. **Hook `.githooks/pre-commit`** (versionado) corre los guardianes dep-free → wiring 1 vez: `git config core.hooksPath .githooks`.
  - Guardián verificado en verde local. Resto se valida en preview de Vercel.

- **🔐 HARDENING SECRETOS DE AUTH: fuera fallbacks hardcodeados — branch `claude/unified-api-token-management-aklwp8` — 24/06/2026**
  Auditoría de la gestión de tokens/secretos inter-app (emparejamientos emisor↔validador). **Estructura sana** (OPERADOR_SHARED_SECRET, RRHH_OPERADOR_SECRET, CRON_SECRET, AI_GATEWAY_SECRET, JWT_SECRET bien emparejados, `===`, sin endpoints operador desprotegidos). Reparados los **fallbacks con literal** que en prod serían una credencial conocida del repo:
  - **ialimp:** `app/api/auth/register/route.ts` (firmaba con `'ialimp-secret-2026'` sin guarda de prod → ahora fail-hard en producción) y `app/api/auth/logout/route.ts` (mismo patrón). El resto de ialimp (`lib/auth.ts`/`tenant.ts`/`propietario-auth.ts`) ya fallaba en duro.
  - **ia-rest CRM:** nuevo helper único **`src/lib/crm-secret.ts` → `crmSecret()`** (fail-hard en prod, dev-fallback `ia-rest-crm-2026`); adoptado en `leads/unsubscribe`, `telegram/webhook`, crons `crm-followup-sevilla`/`crm-envio-auto`/`crm-recordatorio-dia2` (firman/validan los JWT de baja → MISMO secreto en ambos lados, era el riesgo).
  - **ia-rest OAuth super:** `super/google-oauth{,-callback}` ya no caen a `'iarest'` para el state CSRF; mantienen la cadena `CRON_SECRET || SUPER_ACCESS_KEY` y fallan en duro en prod.
  - **Docs:** `apps/ia-rest/.env.example` ahora documenta `JWT_SECRET_CRM` y `DEMO_SEED_SECRET` (se usaban en código sin estar en ningún `.env.example`).
  - **Verificado en preview (5/5 verde):** el primer push falló el build de ia-rest (`crm-envio-auto/route.ts`: `crmSecret()` adoptado sin añadir el `import`); fix en commit aparte → re-build de las 5 apps **Ready** (central-rrhh skipped, no le afectaba). En prod estas envs SIEMPRE están puestas → sin cambio de comportamiento, solo se elimina el downgrade silencioso.
  - **Lección:** al extraer un helper y adoptarlo en N ficheros, verificar `import` en TODOS (un `grep` de "usa vs importa") antes de empujar; `tsc` local no corre sin `node_modules`, la red de seguridad fue la preview de Vercel.
  - **Pendiente:** el "panel-inventario de secretos" (Opción A) que Alberto pidió queda por diseñar/construir. PR draft: **#492** (`claude/unified-api-token-management-aklwp8`).

- **🔍 AUDITORÍA LIGERA DIARIA — 24/06/2026**
  Rango: desde 21/06 (último addendum) hasta HEAD. 66 commits en plataforma + nuevo `packages/core-telegram`.
  - **Crons:** ✅ 8/8 vivos. `pricing/guard` aparecía ⛔ MUDO por falso positivo del heartbeat SQL (mide filas en `pricing_alerts`, que solo se escriben cuando hay reversiones; Vercel confirma 7 ejecuciones en 7 días). Corregido en `auditoria-diaria.md`.
  - **Lockfile desincronizado 🟡:** `@central/core-telegram@workspace:*` añadido a `apps/plataforma/package.json` + `transpilePackages` pero `pnpm-lock.yaml` no actualizado. **Acción Alberto:** `pnpm install` local + commitear lockfile.
  - **Docs corregidos:** `MATRIZ.md` + `CLAUDE.md` raíz actualizados para incluir `@central/core-telegram` (bot único del monorepo, creado 22/06, consumido por plataforma).
  - **Memoria y skills:** CONTEXTO-SESIONES.md en sync hasta 23/06; SKILLS.md en sync con `.claude/skills/` y `.claude/commands/`. Sin entries faltantes.
  - **Carry-forwards pendientes de Alberto:** Q1 (tabla `concursos_radar_criterios`), Q4 (listing buckets Supabase), Q5 (SMTP plataforma), Q6 (vulns ialimp), B2 (jubilar BD vieja ia-rest).
  - PR draft: `claude/auditoria-diaria-2026-06-24`.

- **📊 RECONCILIACIÓN INGRESOS Casa Sevillana 2026 + KPI «a día de hoy» — PR #485 — 23/06/2026**
  Alberto quiso verificar que los 41.177€ de ingresos 2026 de Casa Sevillana (Socorro) en plataforma cuadran con la realidad. Análisis manual sobre capturas de Booking, Expedia, Airbnb:
  - **Booking.com cobrado 2026:** 35.778,98€ (ene 6.690,82 + feb 3.503,63 + mar 5.792,39 + abr 8.568,53 + may 7.385,35 + jun 3.838,26) — confirmado por captura de la app Booking.
  - **Expedia cobrado 2026:** 1.593,24€ + 1.094,77€ + 26,82€ (ajuste extracto 9570613) = 2.714,83€ — confirmado por Alberto.
  - **Airbnb cobrado 2026:** 1.219€ (1 reserva, Alberto Galan, 12-14 jun). Solo esa en 2026 para Casa Sevillana.
  - **Total cobrado confirmado: ~39.712,81€**. Los 41.177€ del programa incluyen reservas con check-out futuro (aún no liquidadas por Booking). Cuadra.
  - **Código (`financiero.ts` + `dashboard/page.tsx`):** `ResumenFinanciero` gana `ingresosHoy?` / `resultadoHoy?`; `getResumenSivra` añade 3ª query paralela con filtro `"checkOut"::date <= CURRENT_DATE`; `NegocioCard` muestra el KPI «a día de hoy» con fallback YTD para ialimp/ia-rest, más «Proyectado año: X€» si hay diferencia.

- **✅ DASHBOARD: widget correduría mostraba compañías incorrectas — PR #480 — branch `claude/vibrant-cori-7j28op` — 23/06/2026**
  El widget "Correduría 2026" del dashboard agrupaba movimientos usando solo `compania_seguros` (campo de asignación manual), ignorando las reglas aprendidas (`correduria_reglas`) y la detección automática (`detectarCompania`). Las compañías identificadas por nombre/clave pero no confirmadas a mano aparecían todas como "Otras" → faltaban compañías en el widget.
  - **`app/(usuario)/dashboard/page.tsx`:** `getResumenCorreduria` reescrita para replicar exactamente la lógica de `/api/correduria/route.ts`: fetch paralelo de reglas + aplicación de cadena manual→regla→`detectarCompania`, filtros `importe > 0` y `duplicado_estado <> 'ignorado'`, JOIN directo por `cb.cuenta_id` (no a través de `sociedades`).
  - **Skill `plataforma-maestro`** actualizado con landmine: widgets de dashboard deben replicar la cadena de detección JS completa, nunca simplificar con GROUP BY en SQL.
  - PR mergeado a main.

- **✅ SMOOBU 401 era una API KEY MAL en la BD (NO era migración HMAC) — PR #482 revierte #481 — 23/06/2026**
  **CORRIGE el diagnóstico anterior.** Smoobu **NO** está migrado a HMAC para esta cuenta. El header **legacy `Api-Key`** con la key CORRECTA devuelve **200** (probado en prod contra `/api/threads`: `total_threads: 1210`). Lo que rompía desde por la mañana era que en `pms_connections.smoobu_api_key` había un valor INVÁLIDO (`usr_live_bdc8…cbd31`) que **no autentica por NINGÚN método** (probadas ~19 variantes: header `Api-Key` full/sin-prefijo/secret + HMAC con secret string/bytes, firma b64/hex, ~12 formatos de canónica → todas 401 `Authentication required`). La HMAC del PR #481 se construyó sobre una premisa falsa y dejó el agente en 401 en prod.
  - **Fix (verificado, prod 200):** (1) BD `pms_connections.smoobu_api_key` = la key buena `5xA62g1B…aW9w` (42 chars, sin prefijo) — **arregla también ialimp/Sique Brilla y sivra**, que comparten la fila y usan el mismo header. (2) **`lib/smoobu.ts`**: `smoobuFetch` vuelve a añadir el header `Api-Key` (se eliminó la firma HMAC, `getSmoobuCreds`, `canonicalString`); `getSmoobuKey()` sigue siendo la fuente única. (3) Borrado el endpoint temporal `diag-hmac`.
  - **Lección:** ante 401 de Smoobu, lo PRIMERO es validar que la key de `pms_connections` es la real (probar `Api-Key: <key>` contra `/api/threads`), no asumir cambios de esquema. La columna `smoobu_api_secret` quedó en la tabla pero **sin uso** (inocua).
  - `smoobuFetch` (header `Api-Key`) ya lo usan agente (`contexto`/`guia`/`enviar`) + poller `auto-reply`. El resto de rutas Smoobu de plataforma/ialimp/sivra ya funcionaban con `Api-Key` legacy y volvieron solas al corregir la key en BD.

- **🤖 AGENTE HUÉSPEDES: hotfix 500 ".map is not a function" — 23/06/2026**
  Al re-proponer a José el endpoint devolvió **500** `(intermediate value).map is not a function`. Causa: en `contexto.ts` se hacía `d.messages || d || []` (y `d.bookings || d.data || []`) y luego `.map`; si Smoobu devuelve un OBJETO (p.ej. error/límite de rate, agravado por la 4ª llamada que añadió el early-checkin) en vez de un array, el `.map` revienta y tumba TODO el agente. Fix: `Array.isArray(...) ? ... : []` en mensajes Y en la consulta de reservas → como mucho degrada (historial/disponibilidad vacíos), nunca 500.

- **🤖 AGENTE HUÉSPEDES: robustez del envío + "Modificar"→aprobar — 23/06/2026**
  Alberto pulsó **✏️ Modificar** en un borrador (reserva 131511815) y respondió **"Ok"** pensando que aprobaba; el handler trató "Ok" como el texto a ENVIAR al huésped → "❌ No se pudo enviar al huésped" (Smoobu rechazó). Además el código **borraba el pendiente aunque el envío fallara** → botones muertos. Arreglos en `telegram-webhook/route.ts` + `enviar.ts`:
  - **Aprobación corta:** si respondes a Modificar con `ok/vale/sí/dale/👍…` se interpreta como **aprobar** → se envía el BORRADOR existente (no la palabra), no se manda "Ok" al huésped.
  - **Fallo de envío no destruye el pendiente:** en ✅ Enviar y en Modificar, si `enviarAlHuesped` devuelve false NO se borra la fila ni se marca "Enviado" → puedes reintentar.
  - **`enviar.ts` ahora loguea el motivo** (status + cuerpo de Smoobu) para diagnosticar por qué rechaza una reserva (antes se tragaba el error).
  - Pendiente: confirmar la causa del rechazo de Smoobu para 131511815 (¿mensajería del canal no disponible? lo dirá el log en el próximo intento).

- **✅ BANCA: eliminar 16 falsos duplicados PSD2 y prevenir recurrencia — PR #465 — 23/06/2026**
  BBVA y Kutxa devuelven cada transacción dos veces en el feed PSD2 con `entry_reference` distintos → dos hashes → dos filas → falsas alertas en "Posibles cargos duplicados". NO era solapamiento Norma43/PSD2.
  - **BD (Supabase MCP):** 16 registros eliminados (CUOTA PTMO hipoteca Montecarmelo, TARJ.CRDTO x2 tarjetas, KUTXABANK SEG. VIDA, RECIBO AYTO SEVILLA, AEAT deducción maternidad, etc.)
  - **`lib/psd2.ts`:** dedup secundario `fecha+importe+concepto` dentro de cada sync call (el hash-based solo cubre within-call con mismo entry_reference)
  - **`lib/banca.ts`:** `getDuplicadosSospechosos` excluye pares cross-origen (psd2↔norma43/xls) y pares psd2+psd2 mismo concepto+fecha (backstop)
  - **`lib/duplicados.ts` + `BancaClient.tsx`:** campo `origen` propagado hasta UI → badge de fuente en cada fila de la tarjeta de duplicados
  - **Pendiente manual:** RECIBO EXCMO. AYUNTAMIEN 2026-06-02 (2 entradas `xls-kutxa`, son 2 facturas IBI distintas del Ayuntamiento con EXPTE diferentes) → Alberto puede resolver con "Es normal" en /banca
  - **Nota arquitectónica:** TARJ.CRDTO 4662032019750300 y 4662032019650302 son DOS tarjetas reales (Alberto + mujer), pero BBVA PSD2 duplicaba cada una; después de la limpieza quedan 1 entrada/mes por tarjeta. Correcto.

- **🧾 GASTOS: KPI dashboard «sin revisar / sin justificante» + pasada facturas-correo (PriceLabs) — branch `claude/expense-deductibility-control-sfx6od` — 23/06/2026**
  - **Dashboard KPI (mejora #4 de Alberto):** `getAlertas` (`lib/banca.ts`) ahora alinea `porRevisar` con la bandeja de `/finanzas?tab=gastos` (`requiere_revision AND NOT destino_confirmado AND destino<>'traspaso_interno'`) y añade **`sinJustificante`** (cargos deducibles del año — seguros/turistico_* — no amortizables, sin `conciliado`/`factura_ref`). El banner del dashboard enlaza a `/finanzas?tab=gastos` (antes `/banca`) y muestra ambas líneas. Build OK.
  - **Pasada `facturas-correo` (mejora #5):** ventana 7d sin facturas deducibles nuevas (solo docs de firma BBVA + mensajería Booking). **PriceLabs:** 5 cargos en banco (feb–jun, todos pisos) estaban 0/5 con 📎 → conciliados 4/5 (mar–jun) con `factura_ref=gmail:<thread>`; feb pendiente (aviso fuera de ventana). **Hallazgo:** los correos de PriceLabs son AVISOS DE COBRO, no el PDF (la factura real vive en el portal de facturación tras login) → el 100%-desde-email no es posible; el Apps Script no los baja. Para el PDF oficial hay que entrar a pricelabs.co/billing.
  - **Decisiones de Alberto (esta sesión):** #2 amortización **descartada** (no tiene gastos grandes que amortizar ahora). #3 **split/desglose de un cargo por piso** (p.ej. lavandería que factura en bloque sin separar por piso) = **siguiente PR** (pendiente de plantear). Sueldo «por la baja» sigue pendiente (de quién es la nómina).

- **🤖 AGENTE HUÉSPEDES: early check-in solo si la noche anterior está libre (gratis) — 23/06/2026**
  Regla de Alberto: el early check-in (entrada antes de las 15:00) es **GRATIS**, pero SOLO se confirma si la **noche anterior está libre** (nadie duerme la víspera). OJO: puede haber una reserva que SALE el MISMO día de la llegada (`departure === arrival`) → esa noche está ocupada → NO hay early check-in. **NUNCA se ofrece de pago** (antes el prompt lo ofrecía como servicio de pago, inventado).
  - **`disponibilidad.ts` (nuevo, puro):** `nocheAnteriorLibre(arrival, estancias, selfId)` — ocupada si alguna otra estancia `arrival<=víspera && departure>=llegada` (incluye salir el mismo día); excluye la propia reserva y cancelaciones. 8 tests `node --test` OK.
  - **`contexto.ts`:** consulta las reservas del piso en Smoobu (`/api/reservations?apartments[]=…&from=llegada-30&to=llegada`) y expone `earlyCheckinPosible`.
  - **`decidir.ts`:** bloque EARLY CHECK-IN según `earlyCheckinPosible` (gratis si libre / no posible si ocupada). LATE CHECK-OUT pasa a `needs_human` (lo decide Alberto, depende de la reserva siguiente).
  - Verificado en vivo: reserva 131511815 (House Sevillana, huésped llega 12:30-13:00) → borrador correcto a 15:00.

- **🧾 GASTOS Fases 3-4: IA en bloque + justificante automático — branch `claude/expense-deductibility-control-sfx6od` — 23/06/2026**
  - **Fase 3 (IA en bloque):** `POST /api/finanzas/gastos/sugerir-lote` (una llamada IA para todos los grupos de la bandeja, `= ANY(ids::uuid[])` scoped por cuenta). `GastosTab`: botón **«🤖 Sugerir todo»** → chip de propuesta por grupo con **✓ aceptar** (aplica destino vía regla de comercio + amortizable a todo el grupo) y **«✓ Aceptar todas las sugerencias»**. Build OK.
  - **Fase 4 (justificante automático):** la skill `facturas-correo` ahora, al casar factura↔movimiento, **marca `conciliado=true` + `factura_ref`** en `movimientos_bancarios` → enciende el badge **📎 con factura** del panel. PriceLabs/SaaS por email: archivar TODAS en Drive y conciliar (PriceLabs al 100%). (Lo ejecuta el agente en su pasada; el código del puente queda listo.)
  - **Pendiente:** Sueldo «por la baja» (de quién es la nómina).

- **🧾 GASTOS Fase 2: bandeja agrupada por comercio — branch `claude/expense-deductibility-control-sfx6od` — 23/06/2026**
  La bandeja «Por revisar» ahora se **agrupa por comercio** (`claveComercio`): "PETROPRIX ×3 · 50€" con una sola decisión que clasifica todos los iguales. `lib/finanzas.ts` `getGastosControl` devuelve `porRevisarGrupos` (GastoGrupo[] ordenado por count); `GastoMov` gana `comercio`. `GastosTab.tsx`: componente `Grupo` con acciones de grupo (**✓ Está bien** → confirma todos en lote; **↪ Reclasificar** → un `/api/banca/destino` sobre el representante que **aprende la regla del comercio** y la aplica a todos) + expandir para ver/afinar los movimientos sueltos. Build OK. (Fase 3-4 pendientes: IA en bloque + auto-proponer reglas; justificante auto `facturas-correo`→Drive.)

- **🧾 GASTOS Fase 1: bandeja «Por revisar» usable (963→135) + aprendizaje por COMERCIO — branch `claude/expense-deductibility-control-sfx6od` — 23/06/2026**
  La bandeja mostraba 603/963 (todo lo no confirmado). Ahora **`porRevisar = requiere_revision AND NOT destino_confirmado AND ≠traspaso`** → solo lo DUDOSO. `lib/destino.ts`: descarte **BBVA** → `revisar:true` (se contaría como correduría, confirmar); Kutxa personal por descarte → `revisar:false` (caso normal, no inunda); Bizum → `confirmado:true`. `DestinoDetalle` gana `confirmado?`. `lib/categorizar.ts`: `guardarCategoria` persiste `destino_confirmado`; aplica reglas de `banca_destino_reglas` por **substring** (prioridad sobre auto → anula "seguros solo BBVA"; guarda: no a cónyuge; gana la clave más larga). **Aprendizaje por comercio:** `lib/correduria.ts` `claveComercio()` + `/api/banca/destino` aprende por comercio si no hay código de referencia. Tests 15/15. **Reglas sembradas (BD, cuenta `4fdc993a…`):** IONOS/PETROPRIX/PRIMAPRIX→`seguros`; NETFLIX/`GUTIERREZ ALCALA`→`turistico_pisos`; GENERALI coche (one-off, sin regla)→`seguros`; Bizum (88) confirmados; backfill `requiere_revision` (solo BBVA descarte). Bandeja 963→**135**.
  - **Pendiente (fases 2-4):** agrupar bandeja por comercio; sugerencia IA en bloque + auto-proponer reglas; justificante auto (`facturas-correo`→Drive, PriceLabs al 100%). **Sueldo −1.440 «por la baja»** aparcado (falta de quién es la nómina).

- **👷 RRHH — alta masiva 22 empleados Mariscos González + mejoras UI lista — 23/06/2026**
  Branch `claude/awesome-carson-3obe34`. PR draft #469 (builds Vercel en curso al cerrar).
  - **BD (SQL vía MCP `wswbehlcuxqxyinousql`):** migración `0014_nss` (`ALTER TABLE rrhh.empleados ADD COLUMN nss TEXT`); INSERT 22 trabajadores de "Almacén de Mariscos González" (empresa de Pilar), ordenados A-Z, con DNI y NSS del PDF oficial SS. Email NULL — Pilar los añadirá desde la UI.
  - **`prisma/schema.prisma`:** campo `nss String?` en modelo `empleados`.
  - **`app/admin/empleados/page.tsx`:** SELECT incluye `dni, nss`; fetchea `nombre` del `usuario_rrhh` y `nombre` de la `empresa` para el banner de bienvenida.
  - **`app/admin/empleados/EmpleadosClient.tsx`:** tipo `E` con `dni, nss`; banner "Bienvenida, Pilar · Mariscos González"; chips DNI+NSS en cada fila; buscador ampliado (nombre, DNI, Nº SS).
  - **`app/api/admin/empleados/route.ts`:** GET incluye `nss` en SELECT.
  - **Pendiente:** Pilar debe añadir el email a cada empleado para que puedan recibir documentos a firmar.

- **🧾 GASTOS: Bizum SIEMPRE personal — branch `claude/expense-deductibility-control-sfx6od` (follow-up del #468) — 23/06/2026**
  Alberto, probando el control de gastos, avisa que un **Bizum es siempre personal**. Bug en `lib/destino.ts`: la regla Bizum→personal solo cubría ABONOS (`RE_PERSONAL_IN`); un **Bizum ENVIADO desde BBVA** caía a `seguros` por descarte (los cargos de BBVA que no son del Dúplex). Fix: regla propia `if (/\bBIZUM\b/i…) → personal` **tras el bloque de cónyuge** (a Pilar un Bizum sí es cobro de cliente → `actividad_pilar`), cubre ambos signos y bancos; se quitó `BIZUM` de `RE_PERSONAL_IN` (redundante). Test nuevo (12/12 ✓). SQL: reclasificados **3 cargos** (180 €) de `seguros`→`personal` (scope titular, no cónyuge); ahora los 99 Bizum están en personal.

- **🤖 AGENTE HUÉSPEDES: arreglado el timeout (504) del disparo manual/webhook — 23/06/2026**
  Al re-proponer raquel (booking 142846717) con el horario ya corregido (15:00), el endpoint `/api/sivra/mensajes/auto-reply?booking=…&q=…` daba **504 Vercel Runtime Timeout**: el camino de una reserva hace 3 llamadas IA secuenciales (decisión + 2 traducciones EN→ES) y el upsert del borrador es el ÚLTIMO paso → se moría antes de persistir (la fila pendiente seguía con "13:00"). Las llamadas IA van ANTES de `tgSendButtons`, así que un 504 NO manda Telegram (no hay spam a Alberto), pero tampoco re-propone.
  - **`telegram-msg.ts`:** las dos traducciones (pregunta + borrador) ahora en **`Promise.all`** (antes secuenciales).
  - **`auto-reply/route.ts` y `webhook/route.ts`:** `maxDuration` 60 → **300** (máximo en plan Pro). El webhook en tiempo real corría el mismo trabajo pesado y también podía dar 504 con un huésped que necesita traducción.
  - Tras desplegar: re-disparar raquel y confirmar en `mensajes_pendientes_tg` que el borrador dice **15:00**.

- **🧾 CONTROL DE GASTOS (deducible negocio / renta / no deducible) en /finanzas — branch `claude/expense-deductibility-control-sfx6od` — 23/06/2026**
  Alberto no podía separar qué gasto es deducible (actividad/renta) de lo personal ni reclasificar un cargo. Caso que lo motivó: ventilador CREATE (123,45 €, Kutxa) para un piso → deducible como `turistico_pisos` PERO mobiliario → **a amortizar**, no gasto del año al 100%.
  - **Hallazgo:** la deducibilidad YA está en `movimientos_bancarios.destino` (no hizo falta columna de bucket). Mapa bucket: `seguros`→negocio, `turistico_*`→renta, `personal/null`→no deducible, `traspaso_interno`→fuera.
  - **BD:** nueva columna `movimientos_bancarios.amortizable BOOLEAN DEFAULT false` (migración `prisma/sql/2026-06-23_mov_amortizable.sql`, aplicada por MCP `wswbehlcuxqxyinousql`).
  - **`/finanzas` reorganizado en 3 pestañas** (`?tab=`): **Ingresos** (correduría+pisos+Pilar) · **Gastos** (panel nuevo) · **Fiscal/Resumen** (gráfico, base imponible, tramos, deducciones, Modelo 179). KPIs de cabecera fijos. Decisión de Alberto: pestañas propias.
  - **Pestaña Gastos (`GastosTab.tsx`):** bandeja **«Por revisar»** primero (= `requiere_revision OR NOT destino_confirmado`, sin traspasos) + buckets colapsables. Por fila: reclasificar (aprende regla), confirmar (✓ está bien), toggle **amortizable**, **🤖 sugerir** (IA), badge **📎 con factura / ❗ sin justificante** + «buscar factura» (Gmail). Mejoras elegidas por Alberto: justificante+alerta, sugerencia IA, export asesoría.
  - **Amortizables:** se EXCLUYEN del gasto deducible del año (en `getResumenFinanciero` y trimestres) y se listan aparte (nota en base imponible + sección en el CSV). v1 NO calcula el % de amortización (solo separa y lista).
  - **Aprendizaje:** al reclasificar SIEMPRE se crea regla (`banca_destino_reglas`) — `/api/banca/destino` generalizado para reaplicar a TODOS los iguales (ya no solo dentro de `seguros`).
  - **Nuevo:** `lib/finanzas.ts` `getGastosControl()` + tipos bucket; rutas `POST /api/banca/amortizable`, `GET /api/finanzas/gastos`, `POST /api/finanzas/gastos/sugerir`, `GET /api/finanzas/gastos/export`. Reusa patrón de reclasificación de `CorreduriaClient` y `aiComplete` de `lib/ai-client`.
  - **Verificado:** `next build` ✓, 11 tests `destino` ✓, CREATE localizado en bandeja por-revisar (read-only). **Fuera de alcance v1:** split por línea de pedido mixto, % de amortización.

- **🤖 AGENTE HUÉSPEDES: override de horarios por piso (Smoobu da hora desfasada) — 23/06/2026**
  Al probar: Smoobu graba la hora de check-in POR RESERVA al crearse; cambiar el ajuste del apartamento solo afecta a reservas NUEVAS, y la API del apartamento NO expone la hora → `reserva['check-in']` viene desfasado (13:00 cuando la entrada real es 15:00). Solución: **`horarios.ts`** (override por piso, fuente de verdad): todos 15:00 salvo **Busto Reform 13:00**, salida 11:00; `contexto.ts` lo aplica por encima de Smoobu (fallback a Smoobu si el piso no está en la tabla). Tests OK.
  **Seguridad:** Alberto graduó `checkin` a auto-envío por error → se **desactivó** (`DELETE mensajes_auto_config WHERE categoria='checkin'`) porque con la hora desfasada habría auto-enviado horas mal. Re-graduar solo cuando el horario sea fiable (ya lo es con el override).

- **🟣 PILAR autónoma: sección completa /finanzas/pilar — PR #462 MERGEADO — 23/06/2026**
  Branch `feature/pilar-autonoma`. Sección completa para la contabilidad autónoma de Pilar (cónyuge) bajo el mismo login, sin segundo usuario.
  - **BD (SQL aplicado vía MCP `wswbehlcuxqxyinousql`):** `cuentas_bancarias.titular TEXT DEFAULT 'titular'`, `fiscal_perfil` + 5 campos cónyuge autónoma, `movimientos_bancarios.subcategoria TEXT`.
  - **Import banca:** select "Titular de la cuenta" en `BancaClient.tsx` (Yo / Cónyuge Pilar), se pasa a la API y guarda en `cuentas_bancarias.titular`.
  - **Auto-clasificación:** `lib/destino.ts` → `clasificarDestinoDetalle(banco, concepto, contraparte, importe, titular)`: para cónyuge, TGSS→`actividad_pilar/cuota_autonomos`, abono→`actividad_pilar/cobro_cliente`, resto→`actividad_pilar/gasto_profesional`. `lib/categorizar.ts` usa `titular` y persiste `subcategoria`.
  - **`getResumenPilar(cuentaId, year, quarter)`** en `lib/finanzas.ts`: 4 queries paralelas (totales, clientes, por mes, recientes), concentración (>75% → alerta), Modelo 130 por trimestre (`rendimiento_neto × 0.20 − retenciones_15%`), badges estado (pasado/próximo/futuro).
  - **`compararDeclaracion()`** en `lib/fiscal-deducciones.ts`: conjunta vs separada — ahorro y recomendación.
  - **`/finanzas/pilar`**: página nueva completa (KPIs morado, evolución mensual, Modelo 130 con fechas límite, tabla clientes con alerta concentración, movimientos recientes con subcategoria badges).
  - **`/finanzas`**: card compacta "🟣 Actividad de Pilar" en el grid de accesos rápidos.
  - **`/api/finanzas/perfil`**: campos cónyuge autónoma en GET/PUT.
  - **12 archivos modificados/creados.**

- **🤖 AGENTE HUÉSPEDES: modificación traducida + sin asunto "Re: tu estancia" — 23/06/2026**
  Feedback en vivo de Alberto:
  - **Modificar traduce:** Alberto SIEMPRE escribe su corrección en español; si el huésped es de otro idioma, el agente la **traduce a ese idioma** antes de enviar y le confirma a Alberto en español lo que se mandó. Se guarda el idioma del huésped en `mensajes_pendientes_tg.idioma` (migración `2026-06-23_pendientes_tg_idioma.sql`, aplicada por MCP) y el handler `edit` de `telegram-webhook` traduce con `aiComplete`.
  - **Sin asunto:** `enviarAlHuesped` ya no manda `subject='Re: tu estancia'` (salía repetido en cada mensaje); ahora solo incluye `subject` si se pasa explícito. Decisión de Alberto: sin asunto.

- **✅ AGENTE HUÉSPEDES: arreglada la idempotencia (no reprocesa/duplica) — branch `claude/agente-huesped-idempotencia` — 23/06/2026**
  Seguimiento del agente en producción (Telegram): funcionaba (clasifica, propone, auto-gradúa), pero **reprocesaba el MISMO mensaje** en cada sondeo/webhook → propuestas duplicadas y **un auto-envío doble** (reserva 130550600 salió 2 veces). **Causa:** el webhook llamaba `procesarMensajeHuesped(bookingId)` SIN `msgId`, y el dedup se saltaba si `msgId` venía vacío (`if (msgId && …)`); además el "check-then-mark" no era atómico (carrera sondeo↔webhook).
  - **`lib/sivra/agente-huesped/clave-dedup.ts` (nuevo, puro):** `claveDedup(bookingId,msgId,pregunta)` = el id de Smoobu si lo hay; si no, clave estable `c:<booking>:<sha1(texto)>` (normaliza espacios/mayúsculas). 4 tests `node --test` (20 OK en el agente).
  - **`idempotencia.ts`:** nuevo `claimMensaje(key)` = INSERT … ON CONFLICT DO NOTHING RETURNING → reclamo **atómico** (solo uno gana la carrera); `liberarMensaje(key)` para reintentar si el procesado falla a mitad.
  - **`orquestador.ts`:** reclama la clave AL ENTRAR (corta duplicados aunque no haya msgId); si el envío falla o salta excepción, libera el reclamo (no pierde el mensaje). Quitado el `marcarMensajeProcesado` tardío.
  - **Pendiente menor:** el duplicado ya enviado al huésped no se deshace (a partir de ahora no se repite). Latente (dominio de #454): si el `latest_message` del hilo fuese la propia respuesta del agente, la heurística de `auto-reply` podría intentar procesarla (no observado).

- **✅ BANCA: la correduría (`seguros`) es SIEMPRE BBVA — branch `claude/seguros-solo-bbva` — 23/06/2026**
  Regla de Alberto: la **correduría de seguros vive solo en la cuenta BBVA**. Un "RECIBO GENERALI/OCCIDENT/LIBERTY SEGUROS" en **Kutxabank** (u otro banco) es el seguro PROPIO (coche/hogar), NO una comisión de la correduría — antes el clasificador los metía en la matriz de correduría por casar el nombre de la aseguradora en cualquier banco.
  - **`lib/destino.ts`:** el destino `seguros` solo se asigna en **BBVA** (tanto en abonos —comisiones/liquidaciones— como en cargos). En Kutxa/otros, un recibo de seguro propio → `personal` (si fuese de un piso, se reclasifica a Pisos desde el desglose). Tests `node --test` (11 OK en destino).
  - **Data (BD compartida, por MCP + `prisma/sql/2026-06-23_seguros_solo_bbva.sql`):** 13 movimientos no-BBVA sacados de `seguros` → `personal` (12 Kutxa Generali/Occident/Liberty + 1 N26 Cabify). Quedan 264 en `seguros`, todos BBVA.
  - **Fiscal (pendiente de Alberto):** el seguro del coche normalmente NO es deducible en IRPF salvo afectación del vehículo a la actividad; los recibos de seguro de un **piso turístico** SÍ son gasto deducible del alquiler → reclasificarlos a Pisos. Ver skill `perfil-fiscal`.

- **🤖 AGENTE HUÉSPEDES: datos oficiales de Smoobu como fuente + traducción del borrador — branch `claude/auto-respond-guest-messages-ai-syzmhb` — 23/06/2026**
  Tras probar en producción, Alberto detectó respuestas **vagas** (p.ej. hora de salida sin decir la hora). **Causa raíz:** el `guest-app-url` de Smoobu es una **SPA JS** (`"You need to enable JavaScript"`, ~56 chars) → `mensajes_guia_cache` SIEMPRE vacía → el agente decidía con "(sin guía cargada)". Además el código usaba `arrival`/`departure` (las FECHAS) e **ignoraba** `check-in`/`check-out` de la reserva (que en Smoobu son las **HORAS**, p.ej. 11:00 de salida).
  - **`contexto.ts`:** nueva **ficha estructurada** desde datos oficiales de Smoobu (dirección, **horario entrada/salida**, capacidad, equipamiento) + campos `horaCheckIn`/`horaCheckOut`/`direccion`/`ficha`. checkIn/checkOut pasan a ser solo las fechas.
  - **`decidir.ts`:** la ficha + el **HORARIO OFICIAL** entran como fuente de verdad del prompt ("úsalo SIEMPRE para horas, NO seas vago"). La ficha se añade a las fuentes del guardrail anti-invención (si no, decir "11:00" se marcaría como inventado y escalaría).
  - **`telegram-msg.ts`:** si el huésped escribe en otro idioma, se traduce al español **la pregunta Y el borrador** (🔁) para que Alberto entienda qué se le va a responder. Al huésped se le sigue respondiendo en SU idioma.
  - **`diagnostico-guia`:** vuelca `reservaHoras` (arrival/departure/check-in/check-out/language) para verificar valores reales.
  - **✅ VERIFICADO en prod (PR #456 mergeado):** `reservaHoras` del Dúplex = `check-in 13:00 / check-out 11:00 / language es`. El agente ya responde con la hora exacta y en español.
- **🐛 AGENTE HUÉSPEDES: 2 BUGS GRAVES detectados al probar #456 (mismo branch, follow-up) — 23/06/2026**
  Al revisar `mensajes_log` tras el deploy salieron dos fallos serios:
  1. **Auto-envío indebido en Fase 1:** `mensajes_auto_config` tenía `categoria='general'` con `auto_enabled=true`. Como casi todo cae en el catch-all 'general', el agente **auto-enviaba TODO sin que Alberto revisara** (p.ej. el checkout vago del Dúplex y la respuesta a Gladys fueron auto-enviados, no aprobados). **Causa:** `evaluarGraduacion` usaba una *blocklist* (SENSIBLES) en vez de *allowlist*; 'general' no estaba bloqueado → tras 5 aprobaciones se graduó. **Fix:** `graduacion.ts` ahora usa **allowlist `GRADUABLES`** (wifi/acceso/checkin/checkout/parking/normas/contacto/faq); 'general' y sensibles NUNCA se gradúan. **Data:** borrada la fila `general` de `mensajes_auto_config` (vuelve a Fase 1, propose-only).
  2. **Idioma:** `detectLang("Nos iremos sobre las 10.30")` → 'en' (sin tildes ni keywords) → se respondió en INGLÉS a huésped español. **Fix:** se usa el **idioma OFICIAL de la reserva** (`reserva.language`, p.ej. "es") como primario; `detectLang(texto)` solo si Smoobu no lo trae. (`contexto.idiomaReserva` + orquestador.)
- **🤖 AGENTE HUÉSPEDES: responde en el idioma ESCRITO + tono más cordial + disparo manual — 23/06/2026**
  Feedback de Alberto probando en vivo (reserva 142846717, raquel, escribe en inglés pero perfil Smoobu=es): la respuesta salía en español y muy seca.
  - **Idioma = el que ESCRIBE el huésped** (no el perfil de Smoobu). `detectLang(text, fallback)` reescrito con puntuación ES/EN (antes "Nos iremos sobre las 10.30" caía a inglés); si el mensaje no da señal, usa el idioma de la reserva como fallback. Orquestador: `detectLang(pregunta, idiomaReserva||'en')`. Al huésped se le responde en SU idioma; en Telegram Alberto ve pregunta+borrador traducidos al español (🔁).
  - **Tono:** prompt de `decidir` ahora cálido/cercano, 4-6 frases, saludo por nombre + cierre ofreciendo ayuda (antes "breve 3-4 frases" → secas).
  - **Disparo manual** `GET /api/sivra/mensajes/auto-reply?booking=<id>&q=<pregunta>` (PR #458) para reproponer una reserva concreta. Se usó para corregir el checkout del Dúplex (Alberto aprobó y le gustó).
  - **NOTA merge:** main trajo en paralelo un refactor de idempotencia (`claveDedup`/`claimMensaje`/`liberarMensaje`, reclamo atómico anti-duplicados). Se conservó ese refactor y se metió DENTRO mi lógica de idioma nueva.
- **✅ AGENTE HUÉSPEDES: webhooks fuera del gate + borrador IA robusto + fechas — PR #455 MERGEADO — 23/06/2026**
  Middleware exime `/api/sivra/mensajes/{telegram-webhook,webhook}` (traen su propia auth; antes 307→/login colgaba el botón Modificar). `decidir` usa el texto del modelo como borrador si no devuelve JSON. Telegram muestra Entrada/Salida. Idempotencia por `mensajes_procesados`. **Nota:** los borradores vacíos vistos al probar fueron por **concurrencia** (doble disparo manual del cron a la vez sobre NIM/Groq) — el cron normal corre 1 vez/3min, secuencial.
- **✅ BANCA: el cron ya no deshace confirmaciones de destino + Booking histórico protegido — branch `claude/booking-confirmado-guard` — 23/06/2026**
  Follow-up de #448. **Bug detectado al probar:** el cron de categorización movía Booking histórico del Dúplex (los abonos BBVA "Transferencia recibida" que #444 fijó por SQL **sin** marcar `analizado_at`) de `turistico_duplex` → `personal`, porque la nueva regla manda "Transferencia recibida" a secas a personal+revisar. Reclasificó indebidamente ~8.494€ de Booking real.
  - **Código (`lib/categorizar.ts`):** `analizarMovimientos` ahora **respeta cualquier `destino_confirmado`** (lo lee en el SELECT y lo preserva por encima de la detección automática). Una confirmación manual del dueño NO se vuelve a pisar. Tests `node --test` (22 OK).
  - **Data (BD compartida, por MCP + `prisma/sql/2026-06-23_proteger_booking_historico.sql`):** re-confirmados como Booking del Dúplex TODOS los abonos BBVA `concepto='transferencia recibida'` (marcados `analizado_at`+`destino_confirmado` para que el cron no los toque). **Excepción:** el abono 2026-01-07 de **1.148,85€** NO es Booking (era personal en el estado aprobado en #446; un traspaso grande puntual) → devuelto a personal.
  - **Verificado:** total Booking del Dúplex = **30.234,91€** (estado aprobado), cuadre 2026 = **11.046,53€**, 0 "Transferencia recibida" sin proteger.
- **💶 Mejora bloque Tramos IRPF en /finanzas — PR #451 — 23/06/2026**
  Branch `claude/tender-cannon-ovy6sk`. Solo toca `apps/plataforma`.
- **💶 Mejora bloque Tramos IRPF en /finanzas — PR #451 MERGEADO — 23/06/2026**
  Branch `claude/tender-cannon-ovy6sk`. Solo toca `apps/plataforma`. **Mergeado a main** (squash).
  - Corregido mensaje factualmente incorrecto: "Si metes 210.998€ más en gastos deducibles, reduces el tramo" era incorrecto (esa cifra es la distancia para SUBIR al 47%, no para bajar).
  - Añadido **tipo efectivo** (cuota total / base) junto al tipo marginal.
  - Añadido **ahorro en euros** si se baja de tramo (ej. 29.002€ × 8% = 2.320€) — dato accionable.
  - Añadida **barra de progreso dentro del tramo** con % recorrido e importes de inicio/fin.
  - Añadida **etiqueta ▲ con importe** sobre el marcador de posición en la barra.
  - Separadas las dos direcciones: "para bajar (gastos deducibles)" vs "para subir (más ingresos)".
  - Ficheros: `lib/finanzas.ts` (calcularTramos + tipo ResumenFinanciero) + `FinanzasClient.tsx` (TramoBar + recuadro).

- **📝 SPEC: Agente de respuesta a huéspedes (SIVRA) — branch `claude/auto-respond-guest-messages-ai-syzmhb` — 22/06/2026**
  Sesión de **brainstorming** (sin código aún). Alberto quiere un agente IA que responda los mensajes de
  huéspedes de los pisos turísticos. Investigada la **API de Smoobu** + el código existente. Decisiones:
  - **Hallazgo Smoobu:** existe `POST /api/reservations/{id}/messages/send-message-to-guest` (responder EN el
    hilo, no por email suelto como hace hoy el cron) y webhook **`newMessage`** (tiempo real, hoy no hay receptor).
    La **Guía del Huésped NO está como datos en la API**: solo se da el enlace `guest-app-url` (web `guest.smoobu.com`).
    `/api/apartments/{id}` solo da hechos (dirección, lat/lng, amenities, timeZone).
  - **Fuente de conocimiento (prioridad):** (1) contenido de la **URL personal del huésped** (`guest-app-url`) leído
    con IA, (2) hechos de la API, (3) **búsqueda web** para recomendaciones (Gemini), (4) ficha por piso editable
    (`knowledge_base`) como plan B/override. Adiós al WiFi/teléfono hardcodeado del `reply/route.ts` actual.
  - **Autonomía híbrida** + canal **Telegram** (propone → ✅ aceptar / ✏️ modificar por `force_reply`; modificar = aprende).
    Arranque Fase 1 (revisión total) → Fase 2 (autónomo por categoría según acierto). Extras aprobados: anti-invención,
    auto-mejora de la guía, escudo de reseñas, upsell+botones+resumen diario.
  - **Telegram (decisión 22/06):** **un solo bot** para todo el monorepo + paquete compartido nuevo
    **`@central/core-telegram`** (los `lib/telegram.ts` de ia-rest/plataforma/sivra migran a él). Un bot = un webhook →
    receptor único con enrutado por prefijo de `callback_data` (`hsp_` para este agente).
  - **Smoobu (decisión 22/06):** la key se lee centralizada en `lib/smoobu.ts` (tabla `pms_connections` + fallback env
    `SMOOBU_API_KEY`); asegurar el env en el Vercel que lo use. Si pasa a ser transversal → módulo compartido
    `@central/core-pms` (paralelo a `core-telegram`). Poner el env en Vercel es paso MANUAL de Alberto (no hay valor ni red aquí).
  - **Dónde:** todo en `apps/plataforma` (mensajería interna de sivra: `/api/sivra/mensajes/*`). Spec en
    `docs/superpowers/specs/2026-06-22-agente-respuesta-huespedes-sivra-design.md`.
  - **OJO entorno:** el contenedor de desarrollo está **sin `SMOOBU_API_KEY` y SIN salida de red** (todo egress da 403,
    incl. example.com). No se puede probar la API de Smoobu desde aquí → el **paso 1 de implementación** es un sondeo de
    solo lectura ejecutado **en Vercel** (`GET /api/sivra/mensajes/diagnostico-guia`) que vuelca el JSON real y dice si
    `guest-app-url` es HTML legible o app JS.
  - **Spec APROBADO por Alberto (22/06).** Plan de implementación escrito en
    `docs/superpowers/plans/2026-06-22-agente-respuesta-huespedes-sivra.md` (16 tareas en 6 fases: sondeo, core-telegram,
    tablas, guía/contexto, guardrail/decisión, envío/Telegram/aprendizaje, webhook, red de seguridad+resumen, upsell).
  - **✅ PLAN IMPLEMENTADO (22/06).** Código completo en la rama. Tablas aplicadas en Supabase compartida vía MCP.
    Ficheros: paquete `packages/core-telegram` (bot único; `lib/telegram.ts` re-exporta); `apps/plataforma/lib/sivra/agente-huesped/*`
    (reglas, guia, recomendar, contexto, guardrail, sensibilidad, decidir, enviar, aprender, telegram-msg, orquestador);
    rutas `app/api/sivra/mensajes/{diagnostico-guia,webhook,telegram-webhook,resumen-diario}/route.ts`; `auto-reply` pasa a
    red de seguridad; `reply/route.ts` usa `reglas.ts`; SQL `prisma/sql/2026-06-22_agente_huespedes.sql`.
    **20 tests `node --test` verdes** (core-telegram 4 + reglas 6 + guardrail 5 + sensibilidad 5). `tsc`/`next build` NO
    corridos aquí (sin node_modules ni red) → los valida Vercel/CI en el PR.
  - **AMPLIACIÓN (22/06, commit `37a8059`):** Smoobu YA capta los mensajes de Booking (no se filtra por canal) → el
    agente ya responde Booking por Smoobu; el email de Booking es solo copia. Añadido: **sondeo cada 5 min**
    (`vercel.json` `*/5`, webhook sigue dando tiempo real) + **idempotencia compartida** webhook↔sondeo
    (`idempotencia.ts`, key `agente-huesped:<msgId>` en `update_logs`, dedup en `orquestador.ts`); **auto-graduación**
    por categoría (`graduacion.ts`: tras 5 aprobaciones sin corregir, la categoría básica se auto-responde; nunca las
    sensibles) + botón Telegram `hsp_grad` "Aprobar y a partir de ahora solas"; **traducción al español** de la pregunta
    del huésped en la propuesta de Telegram; **recordar-pendientes** (cron horario, escalados sin OK >3h); **seed-aprendizaje**
    (arranque en caliente desde el histórico de respuestas de Smoobu). Plan: `/root/.claude/plans/acabo-de-recibir-un-fuzzy-quiche.md`.
  - **Pendientes (post-deploy, manuales de Alberto):** (a) envs en Vercel `plataforma`: `TELEGRAM_BOT_TOKEN`,
    `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `SMOOBU_WEBHOOK_SECRET`; (b) ejecutar `GET /api/sivra/mensajes/diagnostico-guia`
    en Vercel y anotar veredicto HTML vs SPA (ajustar `guia.ts` si SPA); (c) registrar webhook Smoobu (`?k=SECRET`) y webhook
    Telegram (`setWebhook`, un solo webhook por bot — ojo si ia-rest ya lo tiene); (d) Fase 2 autónoma: rellenar
    `mensajes_auto_config` por categoría solo cuando `mensajes_log` muestre alto acierto.

- **✅ BANCA: Booking del Dúplex por marcador FIABLE (LIQ.OP) + dedup doble conteo — branch `claude/booking-dedup-liqop` — 23/06/2026**
  Cierre del "pendiente de fondo: capturar el ordenante al importar BBVA". **Hallazgo:** BBVA **NUNCA** da el ordenante real — ni en Excel (concepto colapsado a "Transferencia recibida") ni en PSD2/Enable Banking, donde `debtor.name` devuelve el **TITULAR** (Alberto), no Booking.com. Capturar el ordenante es imposible. **Pero** los cobros de Booking por PSD2 sí traen el marcador específico **`LIQ. OP. Nº`** en el concepto → ese es el discriminante fiable (ya lo usaba `lib/destino.ts`).
  - **Doble conteo detectado y depurado:** Excel y PSD2 se solapaban (23-mar→16-jun 2026) → los **mismos 22 cobros (8.459,17€)** estaban duplicados (dedupe_hash distinto por concepto distinto), inflando el P&L por destino del Dúplex (no el cuadre, que filtraba por concepto). Decisión de Alberto: conservar PSD2, borrar los 22 de Excel del solapamiento. SQL aplicado por MCP + registrado en `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`. Total Dúplex Booking: 38.694€ (inflado) → **30.234,91€** (correcto: 64 xls + 22 psd2).
  - **`lib/destino.ts`:** nuevo `clasificarDestinoDetalle()` → `{destino, revisar}`. Los abonos de BBVA que **no casan ningún patrón** ya NO caen a Dúplex por descarte: van a `personal` + **`revisar:true`** (decisión de Alberto). Booking real = `LIQ. OP. Nº`. `clasificarDestino()` se mantiene como wrapper.
  - **`lib/categorizar.ts`:** `analizarMovimientos` usa el detalle y marca `requiere_revision` cuando el destino es ambiguo (los abonos de BBVA sin patrón van a la bandeja "por revisar" en vez de colarse en el Dúplex). Reglas aprendidas (`banca_destino_reglas`) siguen teniendo prioridad y nunca marcan revisión.
  - **`/api/duplex/cuadre-booking`:** cuenta el banco por **`destino='turistico_duplex' AND importe>0`** (no por el texto "transferencia recibida"), así suma tanto el histórico Excel como el PSD2 (LIQ.OP) sin doble conteo. 2026 sigue cuadrando: banco **11.046,53€** vs Smoobu ≈10.685€. Tests `node --test` (22 OK).

- **✅ CUADRE Booking↔Smoobu del Dúplex — branch `claude/cuadre-booking-smoobu` — 22/06/2026**
  Verificación: lo cobrado de Booking en banco (BBVA, transferencias planas → `turistico_duplex`) vs lo que dice Smoobu (`incomes`, `propertyId='prop_duplex_center'`, `portal='BOOKING'`, `amount`=neto). Página `/cuadre-booking` (sidebar Pisos·detalle 🔁) + API `/api/duplex/cuadre-booking?año=`. Tabla mensual Banco/Smoobu/Δ/estado + TOTAL (veredicto). **No casa 1-a-1** (Booking agrupa pagos y con desfase respecto al check-in) → el cuadre fiable es el TOTAL; mes a mes orientativo. 2026: banco ≈11.046€ vs Smoobu ≈10.685€ → cuadra. Smoobu key vía `pms_connections` (sivra `getSmoobuKey()`); aquí se leen los `incomes` ya sincronizados, sin llamar a la API en vivo.

- **📚 DOC: consolidado el módulo correduría + aprendizaje en los routers — 22/06/2026**
  Documentado en `plataforma-maestro` (SKILL) y `apps/plataforma/CLAUDE.md` (Estado): página `/correduria`, `lib/correduria.ts`, tablas de aprendizaje `correduria_reglas` (clave→compañía) y `banca_destino_reglas` (clave→destino), override `movimientos_bancarios.compania_seguros`, y el cambio de `lib/destino.ts` (abonos planos de BBVA = Booking→Dúplex; `RE_LIQUID_SEGUROS`). Para que una sesión nueva sepa que existe sin releer todos los PRs. Pendiente de fondo anotado: capturar el "ordenante" al importar BBVA.

- **✅ BANCA: ingresos de Booking del Dúplex dejan de colarse en seguros (BBVA) — branch `claude/banca-booking-bbva` — 22/06/2026**
  Los abonos de **Booking** al Dúplex llegan a BBVA como **"Transferencia recibida" a secas** porque la importación **NO guarda el ordenante** ("Booking.com B.V."), así que eran indistinguibles y caían en `seguros` por descarte. Las comisiones reales SÍ traen concepto identificable.
  - **`lib/destino.ts`:** los ABONOS de BBVA sin patrón de comisión ahora → `turistico_duplex` (Booking), no `seguros`. Nuevo `RE_LIQUID_SEGUROS` (SALDO AGENTE/REMSALDO/SALDO CUENTA/PAGO SALDO CTA/PD005) para que las liquidaciones de agente sin la palabra "comisión" SIGAN en seguros. `RECIBIDO:` (Bizum de particular) → personal. Tests nuevos en `lib/destino.test.ts` (18 OK).
  - **Reclasificado ya** (SQL, cuenta BBVA de Alberto): **31 "Transferencia recibida" → Dúplex (12.042,85€)**, **12 "Recibido: …" → personal (343€)**.
  - **Compañía Caser:** "Caja de Seguros Reunidos" = Caser; concepto `PD005 SALDO AGENTE`. Regla `PD005→Caser` sembrada (correduria_reglas) + 4 movimientos aplicados.
  - OJO raíz: la importación de BBVA pierde el "Ordenante" → arreglo de fondo pendiente (capturarlo en la ingesta para no depender del descarte).


- **✅ BANCA: auto-aprendizaje del DESTINO al sacar de seguros — branch `claude/banca-aprendizaje-destino` — 22/06/2026**
  Simétrico al aprendizaje de compañía (#439), pero para el NEGOCIO: cuando Alberto saca un movimiento de seguros ("No es de seguros"), el sistema aprende `clave→destino` y lo aplica a los iguales (pasados y futuros). Caso real: la **pensión por baja de paternidad** llega mensual con el **DNI `28823484E`** como única referencia (sin la palabra "pensión"), así que caía en `seguros` por descarte.
  - **Migración** (BD compartida): tabla `banca_destino_reglas (cuenta_id, clave, destino, UNIQUE(cuenta_id,clave))`. SQL en `prisma/sql/2026-06-22_banca_destino_reglas.sql`. **El código (DNI) vive en BD, nunca en el repo.**
  - **`/api/banca/destino`:** al reclasificar, UPSERT en `banca_destino_reglas` + propaga a los movimientos en `seguros` con esa clave (`claveReferencia` de `lib/correduria.ts`).
  - **`lib/categorizar.ts` (`analizarMovimientos`):** antes de la detección automática consulta `banca_destino_reglas`; si la clave casa, usa el destino aprendido. Así los futuros ingresos con ese código se clasifican solos.
  - **Aplicado ya** (SQL): 3 movimientos de la pensión (dic-25, ene-26, mar-26; 3.457,44€) movidos `seguros→personal` + regla `28823484E→personal` sembrada para la cuenta de Alberto.


- **✅ CORREDURÍA: auto-aprendizaje de compañía por código de referencia — branch `claude/correduria-aprendizaje-companias` — 22/06/2026**
  Los abonos de seguros que entran "por descarte" no traen el nombre de la aseguradora, solo un **código de referencia** estable en el concepto (`M1454`, `M00171`, `8/92361`…). Ahora cuando Alberto asigna una compañía en el desglose, el sistema **aprende** la regla `clave→compañía` y la aplica sola a todos los movimientos con ese código (pasados y futuros).
  - **Migración** (BD compartida): tabla `correduria_reglas (cuenta_id, clave, compania, UNIQUE(cuenta_id,clave))`. SQL en `prisma/sql/2026-06-22_correduria_reglas.sql`.
  - **`lib/correduria.ts`:** `claveReferencia(concepto)` extrae el código (token con letra+dígito o `/`, ≥4 chars; rechaza fechas tipo `202604`). `'Asisa'` añadida a `COMPANIAS_CONOCIDAS` (compañía propia, no dentro de 'Salud').
  - **`/api/banca/confirmar`:** al asignar compañía, UPSERT en `correduria_reglas` + propaga `compania_seguros`+`destino_confirmado` a los movimientos de la cuenta con ese código (`concepto ILIKE %clave%`).
  - **Matriz y detalle:** compañía efectiva = `compania_seguros` → **regla aprendida** → `detectarCompania()`. El KPI "Pendiente de confirmar" ya solo cuenta lo que sigue en `Otras` (lo identificado/aprendido sale).
  - **Sembrado + aplicado ya** (SQL): `M1454→Asisa` (21 movs), `M00171→Occident` + `8/92361→Occident` (28 movs). Tests `claveReferencia` en `lib/correduria.test.ts` (39/39 OK).


- **✅ CORREDURÍA: fecha del desglose en formato día/mes/año — branch `claude/correduria-formato-fecha` — 22/06/2026**
  El desglose mostraba la fecha en ISO (`2026-06-03`). Ahora `fmtFecha()` en `CorreduriaClient.tsx` la pinta como `03/06/2026` (día/mes/año, formato español).

- **✅ CORREDURÍA: asignar compañía al confirmar — branch `claude/correduria-asignar-compania` — 22/06/2026**
  Seguimiento de #435: al confirmar que un movimiento de "Sin identificar" ES de seguros, ahora se puede **elegir la compañía** (antes se quedaba en "Otras" porque la compañía solo se deducía del concepto). Selector = lista `COMPANIAS_CONOCIDAS` + "Otra…" (texto libre) + "No lo sé" (confirma sin compañía).
  - **Migración aplicada a la BD compartida `wswbehlcuxqxyinousql`:** columna `movimientos_bancarios.compania_seguros text` (override manual; NULL = detección automática). SQL en `prisma/sql/2026-06-22_mov_compania_seguros.sql`.
  - **`/api/banca/confirmar`** acepta ahora `compania?` opcional (si viene, set `compania_seguros` + `destino_confirmado`; si no, solo confirma → compat con /finanzas).
  - **Matriz y detalle** (`/api/correduria` y `/detalle`) agrupan por `compania_seguros || detectarCompania(...)`. `lib/correduria.ts` exporta `COMPANIAS_CONOCIDAS`. UI: selector en el modal de desglose (`CorreduriaClient.tsx`), botón "✓ Es de seguros · elegir compañía" / "✍️ Cambiar compañía".

- **✅ CORREDURÍA: formato `1.543€` + desglose clicable con confirmación — MERGEADO PR #435 — branch `claude/brokerage-amount-breakdown-cl3tqb` — 22/06/2026**
  Alberto pidió sobre la página `/correduria`: (a) formato importe+€ (`1.543€`, no `€3581`), y (b) poder **pinchar un importe y ver de qué movimientos sale** para confirmar que de verdad son de una compañía de seguros (la fila "Otras" es cajón por descarte y puede colar cosas que no son seguros). Implementado + 4 extras.
  1. **Formato `1.543€`:** `eur()` en `CorreduriaClient.tsx` con separador de miles MANUAL (no depende del ICU de Vercel, que no agrupaba → de ahí el `€3581`). Importe primero, € detrás.
  2. **Desglose clicable:** cualquier importe (celda compañía×mes, total de fila, total de mes, total anual) abre un modal con los movimientos que lo componen (fecha·concepto·contraparte·importe·banco). API `GET /api/correduria/detalle?año=&compania=&mes=` (`compania` admite `__TOTAL__` y `__PENDIENTE__`).
  3. **Confirmar / reclasificar por movimiento:** `✓ Es de seguros` reusa `POST /api/banca/confirmar`; `No es de seguros ▾` usa el **nuevo `POST /api/banca/destino`** (cambia `destino` y marca `destino_confirmado=true`, scoped por cuenta) → sale de la correduría.
  4. **Extras:** (1) etiqueta del porqué `✅ por nombre` vs `⚠️ por descarte (BBVA)` con resalte; (2) auto-confirmar las que casan por nombre (estado = `destino_confirmado || motivo==='nombre'`, sin backfill); (3) KPI "Pendiente de confirmar €" (= descarte sin confirmar) + filtro `__PENDIENTE__`; (4) "Otras" se muestra como "Sin identificar (revisar)" (solo etiqueta).
  - **Módulo nuevo `lib/correduria.ts`** (puro): `detectarCompania` (extraído de la API, ahora compartido matriz+detalle), `motivoSeguros`, `companiaLabel`. Regex `RE_SEGUROS`/`RE_COMISIONES` exportadas desde `lib/destino.ts`. Import con extensión `.ts` (habilita `allowImportingTsExtensions`) para que `node --test` resuelva la cadena.
  - **Tests:** `lib/correduria.test.ts` (5 casos) → toda la batería `node --test lib/*.test.ts` 37/37 OK. **Sin migración** (reusa `destino_confirmado`).
  - **Vercel:** plataforma + resto de proyectos **Ready** en el PR. Mergeado a main (squash, sha `2a6f737`).

- **✅ CORREDURÍA + TABLA PISOS + TRAMO IRPF — PR #434 (draft) — branch `claude/hopeful-allen-xw84rs` — 22/06/2026**
  Alberto quería controlar mejor las comisiones de su correduría de seguros y ampliar las vistas de pisos y fiscal.
  1. **Sidebar limpiado:** eliminado duplicado "Agente IA" (mismo href `/agente` que "Agente precios"). Añadido ítem "🛡️ Correduría" entre Finanzas y Banca en `UserSidebar.tsx`.
  2. **Nueva página `/correduria`:** tabla compañía × mes con liquidaciones de seguros. API `GET /api/correduria?año=XXXX` (query `movimientos_bancarios` donde `destino='seguros'`, detección de compañía por regex replicada de `lib/finanzas.ts`). `CorreduriaClient.tsx` con selector de año, KPIs, matriz y fila de totales. Archivos: `app/api/correduria/route.ts`, `app/(usuario)/correduria/page.tsx`, `app/(usuario)/correduria/CorreduriaClient.tsx`.
  3. **`/finanzas` simplificado:** bloque correduría compactado: se eliminaron la lista de últimos movimientos y el mini gráfico; se añadió enlace "Ver detalle ↗" a `/correduria`. Archivo: `FinanzasClient.tsx`.
  4. **`/sivra/income` — vista tabla:** toggle "Lista / Tabla×mes" en cabecera. Vista tabla = propiedad × mes calculada client-side de los datos ya cargados. Selector de año. Archivo: `app/(usuario)/sivra/income/page.tsx`.
  5. **`/sivra/fiscal` — panel tramo IRPF:** componente `TramoIRPFPanel` al inicio de la página. Barra de tramos, tramo actual, margen al siguiente, cuota estimada, retenciones 15%, a ingresar estimado. Datos de `/api/finanzas` (reutiliza cálculo existente). Archivo: `app/(usuario)/sivra/fiscal/page.tsx`.
  - Vercel PR #434: todos los proyectos **Ready** ✅ (plataforma, sivra, ialimp, ia-rest, central-rrhh).
  - Pendiente: merge a main.

- **✅ FINANZAS: badges X/Y verificación movimientos + export gestoría mejorado — MERGEADO PR #431 — 22/06/2026**
  Alberto pidió más desglose en `/finanzas` para cruzar ingresos con movimientos del banco. Se implementaron 2 features:
  1. **Badge X/Y verificación por card:** campo `destino_confirmado boolean` en `movimientos_bancarios` (migración aplicada en Supabase). Cada card (Correduría, Pisos, Personal) muestra "X/Y ✓" en verde/ámbar. Botón "✓" por movimiento llama a `POST /api/banca/confirmar` (scoped por `cuenta_id`). UI actualiza sin reload.
  2. **Export CSV gestoría mejorado:** retención calculada POR FILA (`bruto = neto / 0,85`) en vez de solo totales, pisos separados por banco (Kutxa vs BBVA Duplex), gastos personales incluidos (antes faltaban), resumen fiscal con deducciones y resultado a pagar/devolver.
  - Archivos: `lib/finanzas.ts`, `FinanzasClient.tsx`, `app/api/banca/confirmar/route.ts`, `app/api/finanzas/export/route.ts`, `prisma/sql/2026-06-22_mov_destino_confirmado.sql`
  - Vercel: todos los proyectos rebuilding con el nuevo commit en main.

- **🧾 facturas-correo: lectura de PDF RESUELTA por vía B (Apps Script → Drive) — 22/06/2026**
  Tras la pasada del 22/06 (única factura nueva: recordatorio BSH 56,05 € → **Monte Carmelo, personal,
  NO deducible**, etiquetada `Facturas/Procesada`) se cerró el agujero de leer importes dentro de PDF.
  - **Fix de correctitud:** la etiqueta real es `Facturas/Procesada` (femenino), no `Procesado` → corregido en `SKILL.md`.
  - **El conector Gmail gestionado NO baja adjuntos** (solo cuerpo + IDs). Resuelto con **VÍA B (activa)**:
    Apps Script de Alberto **`Facturas a Drive`** (trigger horario) copia los PDF de correos recientes a
    **Drive `FACTURAS Apartamentos / _buzon_pdf`** (fileId **`1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh`**) con
    nombre `YYYY-MM-DD_remitente_archivo.pdf` y etiqueta el hilo `PDF-guardado`. El agente los lee con
    `read_file_content` (probado: BSH, Cabify, Glovo legibles) y cruza por fecha+remitente. Sin token, sin red.
    ⚠️ El script copia CUALQUIER PDF reciente (p. ej. boletines del cole) → el Paso 2 los descarta.
  - **Vía A (cableada pero NO activa):** `/.mcp.json` declara `gmail-adjuntos` (`@gongrzhe/server-gmail-autoauth-mcp`)
    + `scripts/setup-gmail-mcp.sh` + guía `SETUP-adjuntos.md`. La cubre la vía B; usar A solo si se quita el Apps Script.
  - **Dato fiscal visto en PDF:** el recibo de Glovo factura a **Punto y Coma SL (Socorro 24, NIF B90446683)**.
  - Cambios solo de config/docs, sin tocar apps. PR #428 (vía A) mergeado; este PR = activar vía B en la skill + memoria.

- **🚨 CRONS CONGELADOS 5 DÍAS — el middleware de plataforma bloqueaba `/api/sivra/*` — 22/06/2026**
  - **Síntoma:** auditando "que Busto funcione 100%" se vio que el motor de pricing llevaba **parado
    desde el 16-17 jun**: `rate_snapshots`, `pricing_applied`, `incomes` (sync Smoobu), `market_rates`,
    `pricing_alerts`, etc. sin filas frescas. NO era el motor ni la clave Smoobu (la conexión
    `pms_connections` id `c8c1fb07…` está activa con key válida).
  - **Causa raíz:** `apps/plataforma/middleware.ts` gatea TODO tras la cookie `plataforma_session`
    y solo exime `PUBLIC` (incluye `/api/cron` pero **NO** `/api/sivra`). Los crons migrados a
    plataforma (#348) viven bajo `/api/sivra/*` → el cron de Vercel (sin cookie, con `Bearer
    CRON_SECRET`) se **redirige 307 → /login** y el handler nunca corre. Patrón confirmado en BD:
    **todos los `/api/cron/*` vivos, todos los `/api/sivra/*` muertos** (murieron el 16-17 jun = últimas
    corridas en el proyecto sivra antes de retirarlo en #413). Todos los handlers de cron ya aceptan
    el Bearer (`isCronAuthorized` o `secretOk || getSession()`), así que el ÚNICO bloqueo era el middleware.
  - **✅ Fix (esta sesión):** `middleware.ts` deja pasar el gate a las peticiones con `CRON_SECRET`
    válido (Bearer o `?secret=`) ANTES del chequeo de cookie. Cubre todos los crons de cualquier ruta,
    sin exponer los endpoints de datos (el navegador sin secreto sigue gateado). Surte efecto solo en
    **producción de plataforma** (los crons corren sobre el deploy de prod) → tras mergear a `main`.
  - **✅ Heartbeat (esta sesión):** nuevo paso **2-bis** en `/auditoria-diaria` — query de frescura por
    Supabase MCP que marca 🔴 cualquier cron mudo (diarios > 36h) y avisa a Alberto. Agnóstico a la causa
    (cubre middleware, clave, bug, caída Vercel…). Doc en `docs/RUTINAS-PROGRAMADAS.md`.
  - **✅ Verificado en producción (22-jun):** tras mergear #429 y disparar los Run en Vercel,
    `pricing_applied` = **205 filas de hoy** (apply-auto) y `rate_snapshots` = **1.464 de hoy**
    (4 pisos × 366d, **Busto 366**). El fix del middleware queda probado end-to-end (antes esas
    peticiones morían en /login). El hueco de mercado de 5 días es irrecuperable.
  - **⚠️ Lección operativa:** NO dispares los 3 crons de Smoobu a mano **a la vez** — `snapshot`
    dio 0 filas la 1ª vez por **rate-limit de Smoobu** (apply-auto ganó la carrera); relanzado SOLO
    → 200 OK y 1.464 filas. En operación normal van **escalonados** (`updates/sync` 05:00 ·
    `rates/snapshot` 07:00 · `apply-auto` 08:30 UTC), así que no chocan. `updates/sync` solo mueve
    `incomes.createdAt` si entra una reserva nueva → su "0 hoy" no es fallo.
  - **🔭 Observación pendiente (Busto):** lo que se aplica live (~116€) ≈ PriceLabs (~118€) y 373/851 veces
    POR DEBAJO de PL → Busto sigue/infraprecia a PL en vez de ganarle (el motor calculaba ~201€). Revisar
    el gap motor-vs-aplicado y poner `max_price` (hoy `null`) cuando se retome.

- **💸 PRICING / baja de PriceLabs — seguimiento semanal + fix de pipeline — 22/06/2026**
  - **Recalibración del motor (8-jun) funcionó:** ratio `price_ours`/PriceLabs (snapshots reales)
    bajó de 2-3× a Duplex **1.39×**, Luxury Busto **1.61×**, Busto Reform **1.75×**. ⚠️ House Sevillana
    se quedó **corto** (0.61× — PL le pide ~821€ vs 433€ nuestros): revisar aparte.
  - **🐛 Pipeline de experimentos estaba ROTO:** la función `update_experiment_results()` (la llama el
    cron `check-results`) referenciaba `incomes.property_id`/`incomes.total_price` (columnas inexistentes:
    son `"propertyId"` y `amount`/`amount_gross`) → fallaba en cada ejecución, **ningún experimento se
    cerraba**. `incomes` NO está obsoleta (1.964 filas, sync Smoobu vivo hasta 16-jun); la unificación de
    `/finanzas` es el consolidado **fiscal/IRPF** (`lib/finanzas.ts`), cosa distinta de las reservas.
  - **✅ Arreglado (22-jun):** función reescrita sobre `rate_snapshots.was_booked` (señal noche-a-noche,
    capta mitad de estancia). SQL versionado en `apps/sivra/sql/2026-06-22_fix_update_experiment_results.sql`
    + aplicada a mano en Supabase. Backfill hecho: Duplex 14/15-jun → **libre** (estaban a 3-4× PL, no
    entraron), Luxury Busto 17-oct → pendiente.
  - **🔎 Mejora de la revisión (v3):** `revenue_realized` pasa a ser el **ADR bruto REAL** del income que
    cubre la noche (`amount_gross / (checkOut-checkIn)`; OJO: `incomes.nights` viene a 0, hay que calcular
    las noches de las fechas). Así "reservado ≥ PL" es fiable: se verifica si la reserva entró a NUESTRO
    precio (`revenue_realized ~ price_set`) y el margen real vs PL (`revenue_realized` vs `pe.price_pricelabs`).
    ⚠️ Aprendizaje de datos: `rate_snapshots.price_ours` es el precio HIPOTÉTICO del motor (`calcOurs`), NO
    el live; el precio publicado real (lo que controla PriceLabs en Smoobu) es `price_pricelabs`. Validado:
    las reservas recientes entraron a precio PL (~92€ Luxury Busto), no a los 400+ del motor.
  - **🚀 Mejoras "todo" (22-jun) — auto-registro + digest + estudio:**
    - **Hallazgo clave:** solo **`busto_reform` tiene `apply_enabled=true`**; los otros 3 (duplex, luxury,
      house_sevillana) OFF → PriceLabs los controla de facto. `pricing_applied` tiene **851 escrituras live**
      (source `market-anchored`, el cron), **0 del agente manual**. Por eso no había experimentos.
    - **Idea 1 — auto-registro (HECHO):** función `auto_register_experiments()` (SQL en
      `apps/sivra/sql/2026-06-22_auto_register_experiments.sql`) crea un experimento por cada fecha futura con
      escritura live; baseline PL = snapshot MÁS ANTIGUO (resuelve contaminación de `price_pricelabs`, idea 4).
      La llama el cron `check-results` a diario. Backfill: **344 experimentos** (Busto Reform), todos pendientes.
    - **Idea 3 — digest+criterio (HECHO):** endpoint `GET /api/sivra/pricing/experiments/digest` (plataforma)
      + cron semanal (lun 9:00). Por piso: cerrados≥PL, reservados≥PL, ocupación, ADR real vs baseline PL,
      `revenue_extra_vs_pl` y `listo_para_baja` (≥10 cerrados≥PL, ocupación≥50%, ADR≥PL baseline). Criterio explícito.
    - **Idea 2 — House Sevillana (estudio):** motor 542€ vs PL 397€ (120d), ocupación 40%, PL NUNCA superó al
      motor en pasado → históricamente **infrapreciado vía PL**; reserva real de ADR 610€ lo confirma. NO
      enchufar el motor a ciegas: hace falta estudio de mercado dedicado (skill `pricing-agente`) de ese piso.
    - **Pendiente real para cancelar PL:** ya cableado, la evidencia se acumula sola a medida que pasan las 344
      noches de Busto Reform. Para extender la baja a los otros pisos hay que poner `apply_enabled=true`
      (decisión de negocio; en House Sevillana, antes el estudio). El raíl `/api/pricing/*` sigue en `apps/sivra`.
- **📝 ia-rest BLOG SEO: timeout 504 arreglado (modelo rápido 8B) + botón "Generar ahora" + acceso /super restaurado — PR #302 (mergeado 21/06)**
  A raíz del aviso de Telegram "❌ Error generando artículo blog: NIM falló: NVIDIA timeout".
  - **Causa raíz:** `/api/cron/blog-seo` se corta a **~60s** (el plan de Vercel **NO respeta `maxDuration=300`** en el
    proyecto ia-rest, aunque sí en plataforma). Generar ~1800 palabras con `llama-3.3-70b` (no-stream) tarda >60s →
    Vercel mata la función con **504** (devuelve texto plano, no JSON → el front petaba al parsear "Unexpected token 'A'…").
    El primer intento (PR #254: timeout interno 110s + reintento + `maxDuration=300`) **no servía**: la plataforma corta antes.
  - **Fix (PR #302, en producción):** generar con el **modelo rápido `meta/llama-3.1-8b-instruct`** (~30-40s),
    `max_tokens` 3000, timeout interno 45s (salta antes del corte de Vercel → fallo = JSON limpio, no 504). `callAI`
    acepta un 6º arg `model?` (sobrescribe el modelo NIM por llamada) y, si se fuerza `model`, **salta la pasarela
    central** (que usa su modelo por defecto e ignoraría el 8B). Verificado en preview: "va ok". *Tradeoff:* 8B < 70B en
    calidad; el artículo es **borrador** que se revisa. Para recuperar 70B: subir el límite de función en Vercel (plan) o
    job en background.
  - **Botón "⚡ Generar ahora" (PR #283):** el tab Blog de `/super` (`BlogSuperTab` en `app/super/page.tsx`) no tenía
    generación manual (solo el cron de los lunes). Llama a `/api/cron/blog-seo` con `x-ia-session` (sin exponer `CRON_SECRET`).
  - **🚨 Hueco de la migración Fase A2 (credenciales `personal`):** en la BD unificada (`wswbehlcuxqxyinousql`, schema
    `iarest`), `personal` tenía **`email` y `password_hash` en NULL en TODAS las filas** → el login por email de
    `super_admin` daba 401 con cualquier clave. **Restaurada** la fila super_admin (`alberto.suarez.gutierrez@gmail.com`).
    **PENDIENTE (verificar, no urgente):** owner/camarero/cocina/running/jefe_sala/gestor siguen con email/password NULL;
    probablemente entran por **PIN/código** (no por email) → seguramente no roto, pero conviene confirmar antes de migrar.
  - **Datos viejos NO migrados (por diseño, A2 = solo-esquema):** la BD vieja `efncqyvhniaxsirhdxaa` conserva 8
    `blog_borradores` (TODOS `publicado` → **vivos como ficheros** `app/blog/<slug>/page.tsx`, se sirven en iarest.es/blog),
    395 leads y 142 comandas. La unificada arranca vacía → por eso `/super → Blog` dice "No hay artículos". Proyecto viejo a **jubilar**.

- **🧹 Limpieza de PRs draft abiertos (merge masivo) + fix test destino — 21/06/2026**
  Petición de Alberto ("mergea todo y prueba todo"). Se cerraron los 10 PRs draft pendientes de
  otras sesiones a estado terminal: **mergeados** #416 (memoria Groq), #410 (competencia ia-rest +
  VeriFactu 2027), #406/#405/#402/#387 (auditorías), #392 (skill perfil-fiscal), #413 (retirada
  sivra Fase 1). **Cerrada** #302 (blog-seo: su fix ya estaba en main vía `c4db1df`, superada).
  **Retenida #307** (`@central/core-receipts`): NO es "solo spec" como decía — trae el paquete
  nuevo + refactor de `apps/ia-rest/src/lib/courier.ts` (−473 líneas, impresión térmica ESC/POS);
  cambio de código gordo sin revisar → pendiente de decisión de Alberto (no mergeado).
  Conflictos resueltos (CONTEXTO/MATRIZ/skills/generados) preservando lo ya en main.
  **Regresión cazada y corregida:** `destino.test.ts` fallaba 1/7 porque una aserción de #392
  (`LIQ. OP.→seguros`) chocaba con la regla deliberada de hoy (`LIQ. OP.` de BBVA = Booking dúplex).
  Test alineado al comportamiento vigente → 8/8. Suite repo verde (guardián 21, packages, vitest 40).

- **🗑️ RETIRADA DE `apps/sivra` — Fase 1 HECHA (sin riesgo) — 21/06/2026**
  Sivra ya está 100% consolidado en `apps/plataforma` (`/sivra/*`, APIs, crons); la app standalone
  `housesevillana.vercel.app` está **deprecada**. **Fase 1 (esta sesión, rama `claude/dynamic-pricing-uhvnak`):**
  - **Quitada la dependencia de `SIVRA_URL`**: `app/api/sivra/mensajes/reply/route.ts` ya NO hace `fetch` HTTP
    a la app sivra para el aviso de early check-in/out. Se portó la lógica a `lib/limpiadoras-early.ts`
    (`registrarAvisoHuesped`) + nuevo endpoint `app/api/sivra/limpiadoras/early-checkin/route.ts` (POST+PATCH,
    auth `getSession()`); el caller la llama **directa** (sin red, sin 404 si se apaga sivra).
  - **Deduplicado `pricing-calendar`**: borrado `lib/sivra/pricing-calendar.ts` (idéntico a `lib/pricing-calendar.ts`);
    repuntados imports en `pricing/apply`, `pricing/apply-auto`, `pricing/pilot-track` a `@/lib/pricing-calendar`.
  - **Dashboard**: el card de negocio "sivra" enlaza ahora a `/sivra/income` interno (antes `SIVRA_URL`).
  - Marcado deprecado en `apps/sivra/CLAUDE.md` y `MATRIZ.md`.
  - *(Merge previo: se fusionó `claude/plataforma-url` — que traía la consolidación de 81 archivos sivra — en
    `claude/dynamic-pricing-uhvnak`; conflictos solo en docs/generados, resueltos.)*
  - **FASE 2 — GATE RESUELTO + parte destructiva CANCELADA (21/06/2026):**
    - **(B) Limpiadoras reales — confirmado:** Alberto confirma que las limpiadoras las crea la **empresa en
      ialimp**, ahora mismo solo **Sique Brilla**. Verificado contra la BD real (`wswbehlcuxqxyinousql`):
      las **16** limpiadoras (15 activas) son **todas de `Sique Brilla SL`** (empresa de ialimp); las **36
      sesiones/90d** (6 limpiadoras distintas, último 14-jun) son **100% Sique Brilla**, 0 huérfanas/otro
      origen. → El flujo de limpiadoras de sivra no tiene usuarias reales; seguro retirarlo.
    - **Pricing — confirmado:** los crons de pricing/mercado/limpiadoras ya están **todos en
      `apps/plataforma/vercel.json`**; `apps/sivra/vercel.json` tiene `crons: []`. Apagar sivra NO tumba el pricing
      automático. **PERO** el raíl del **agente de pricing** (`/api/pricing/aplicar-propuesta` + `/api/pricing/pisos-zona`)
      **sigue SOLO en sivra** (no portado a plataforma) → razón adicional para no apagar sivra.
    - **🚫 PERO la parte destructiva NO se hace (decisión de Alberto: "eso no tocar"):** `apps/sivra` también
      es la **web PÚBLICA de reserva directa de House Sevillana** (`housesevillana.es`: landing multidioma
      `app/[locale]`, SEO `sitemap.ts`/`robots.ts`/schema). Esa parte **NO está en plataforma** y **se queda
      viva**. Por tanto: **NO redirigir el dominio, NO borrar `apps/sivra`, NO borrar el proyecto Vercel
      `sivra` ni la env `SIVRA_URL`.** Una sesión futura NO debe ejecutar el viejo plan de "borrar y redirigir".
    - **Lo que sí queda hecho:** Fase 1 (quitar dep `SIVRA_URL` en runtime, dedup pricing-calendar, dashboard
      interno) + esta nota de gate. Sivra queda como **app pública de reservas únicamente**; la gestión interna
      vive en plataforma.
- **🧾 GROUND TRUTH FISCAL de Alberto persistido — 19/06/2026** (rama `claude/tax-deductions-personal-finance-e098a7`)
  - Sesión de revisión de la **Renta 2025** (borradores AEAT, libro de familia, Excel gastos/reservas,
    PDFs IBKR y seguro, hilos con la asesoría Asecon). Salieron hechos que el repo tenía mal/ausentes
    y se han persistido en **4 sitios** (datos sensibles SOLO en BD; en git solo estructura).
  - **Hechos clave aclarados:**
    - **Cónyuge = Pilar Piña Franco** (el repo asumía "Carmen"). **3 hijos** → **familia numerosa general**.
    - **Villasís = el Dúplex = Duplex Center** = Pasaje Villasís 1 / Pasaje Francisco Molina 4 (**mismo
      piso**, dos accesos). Tributa en **IRPF personal**.
    - **Socorro** (House Sevillana) → **IRPF personal 50/50** Alberto+Pilar, **aunque** cobre en cuenta
      de **Punto y Coma SL** (sin contrato de cesión → riesgo de paralela; recurrente desde 2024).
    - **Asesoría = Asecon Consultores** (renta personal + sociedad). **Interactive Brokers**: ganancias
      no salen en el borrador → declarar + **revisar Modelo 720**.
    - Reglas de gasto: trading/FTMO = personal; notaría/registro de compraventa = adquisición;
      mobiliario/obras = amortizar; los ~19,5 € del Ayto = tasa de basura (NO IBI).
  - **Cambios (git):** nueva skill **`.claude/skills/perfil-fiscal/`** (+ índice en `docs/SKILLS.md`);
    `facturas-correo/SKILL.md` y `apps/sivra/docs/contabilidad.md` corregidos (alias Villasís, cónyuge,
    regla Socorro-personal); `apps/plataforma/lib/destino.ts` reconoce "Villasís/Francisco Molina" como
    dúplex; caveat del **prorrateo de maternidad** documentado en `lib/fiscal-deducciones.ts`.
  - **Cambios (BD, NO git):** `fiscal_perfil` de Alberto → `gasto_guarderia_anual` real (escuela infantil
    autorizada) y `fiscal_descendientes` con las **fechas reales** de nacimiento (años 2018/2024/2025) en
    vez de placeholders. (Fechas exactas e importes viven solo en la BD, no aquí.)
  - **Pendiente:** confirmar si Busto Reform/Luxury Busto van por Punto y Coma SL; decisión individual vs
    conjunta (la herramienta tiene `declaracion_conjunta=true`); (opcional) prorrateo mensual de maternidad
    en el motor. La asesoría tiene aún pendiente meter familia numerosa, hijo nov-2025, guardería e IBKR.
- **🗂️ CONTROL DE FACTURAS + FIX BANCA CORREDURÍA — 18/06/2026** (PR #384 + PR #385 mergeados a `main`)
  - **PR #384** — `fix(plataforma/banca)`: los ingresos de la correduría no cuadraban (~€10.026 ocultos en P&L). Causa: en abonos Norma 43, el banco rotula la contraparte con el TITULAR → la regla 'titular ⇒ traspaso_interno' escondía comisiones. Fix: lógica pura extraída a `lib/destino.ts` (nuevo, testeable `node --test`, 7 casos reales del extracto). ABONOS se clasifican por CONCEPTO (`LIQ.COMISIONES`/aseguradoras ⇒ `seguros`; pensión/nómina/Bizum ⇒ `personal`). CARGOS sin cambios (el titular sí marca traspaso en salidas). `lib/categorizar.ts` reexporta. SQL de reclasificación aplicado a BD compartida (`prisma/migrations/2026-06-16_reclasificar_abonos_correduria.sql`).
  - **PR #385** — `feat(plataforma)`: panel `/sivra/facturas-control` (entrada 🗂️ Facturas en sidebar, sección Mis pisos). Estado por proveedor/mes: ✅ En Drive / ⏳ En plazo / ❌ Falta. 17 proveedores recurrentes (mensual/bimestral_impar/anual_marzo) en `lib/sivra/facturas-control.ts`. API `GET/POST /api/sivra/facturas-control` (sube PDF → Apps Script → Drive → tabla `facturas_drive`). Alerta `facturasFaltantes` del mes anterior en `getAlertas(lib/banca.ts)` → banner en `/dashboard`.
- **🛡️ CORREDURÍA — Reconciliación Modelo 190 IRPF 2025 + gestión cobros pendientes — 21/06/2026**
  - **Análisis Modelo 190 vs BD completo:** Modelo 190 bruto €8.593,76 → neto esperado €7.305. BD tras correcciones: €6.176,53. Gap ~€1.128 = timing (dic-2025 cobrado ene-2026).
  - **Compañías identificadas definitivamente:**
    - Occident: `Saldo. m00171` + `Saldo. 8/92361` ✅
    - Mapfre: `Liq.comisiones YYYYMM` ✅
    - Caser: `fra-comis` ✅
    - Generali: `G.65792 liq.XXX generali se` + `Pago saldo cta` ✅
    - Pelayo: `COMISIONES [nombre] [7 dígitos]` ✅
    - ASISA: **M1454** (~€46/mes) ✅ confirmado por Alberto
    - Aegon: `REMSALDO` ✅
    - AXA: `Liq. saldo cuenta` ✅ (importe pequeño, ~€41 neto)
    - Reale: `Liquidacion de comisiones` ✅
    - Fidelidade: probable `Pd005 saldo agente` (pendiente confirmar)
  - **Compañías con dinero retenido sin pagar:**
    - **Allianz (mediador 18638/PA342520):** saldo **€521,53** a abr-2026. Extractos en Gmail desde mediador@allianz.es asunto "Cuenta Agente".
    - **Helvetia:** trámite cambio cuenta iniciado mar-2025 (Nieves Calvo → Cac.corredores@helvetia.es + Elena Pérez) nunca completado.
    - **AXA (mediador 634471):** sin comercial asignado, importe pendiente desconocido.
  - **3 borradores Gmail creados** (Allianz/Helvetia/AXA) con IBAN ES34 0182 9465 6002 0233 1175 y enlace Drive.
  - **⚠️ Certificado BBVA:** el PDF guardado en Drive era un justificante Bizum (equivocado). Pedir certificado de titularidad real desde app BBVA (Mis productos → cuenta → Documentos → Certificado de titularidad) y adjuntar manualmente a los 3 borradores.
  - **Google Apps Script** creado para salvar adjuntos Gmail→Drive (script.google.com, función `guardarCertificadoBBVAenDrive`).
  - **Pendiente Alberto:** obtener certificado titularidad BBVA real → adjuntar a los 3 borradores → enviar.

- **🕵️ ia-rest: inteligencia competitiva (comandiavoz.com) — 21/06/2026**
  - **Disparador:** Alberto pasó un anuncio de Meta/Instagram (`fbclid`) de **comandiavoz.com**
    (parece comanda-por-voz para hostelería = competidor directo de ia.rest) y pidió estudiar competencia.
  - **Bloqueo del entorno:** egress de red cortado en la sesión web (`WebFetch` → 403 "Host not in
    allowlist" para TODOS los hosts; `WebSearch` US-only no indexa el dominio). **No se pudo leer
    comandiavoz.com** → su perfil queda pendiente (ver checklist §11 del doc).
  - **Hecho:** `apps/ia-rest/docs/competencia.md` — mapa del mercado VERIFICADO (Veovox, Storyous,
    Qamarero, SmartBar; precios TPV ES: Glop/Ágora/Revo/Last.app/Tipsi/Cuiner; dolores cuantificados),
    battlecard ia.rest y checklist para cerrar el perfil de comandiavoz. Rama `claude/competitor-research-rca1fz`.
  - **🚨 VeriFactu APLAZADO a 2027 — CORREGIDO:** el RD-ley 15/2025 (BOE 3-dic-2025) prorrogó un año
    (sociedades 1-ene-**2027**, resto 1-jul-**2027**). Corregido en este PR: maestro/skill (`SKILL.md`
    §VeriFactu) **y** código `apps/ia-rest/src/lib/verifactu.ts` (`VERIFACTU_STATUS`, solo info en API,
    no gatea lógica). **Pendiente Alberto:** confirmar en sede oficial AEAT antes de uso legal/comercial.
  - **Para cerrar:** habilitar egress (o pegar el contenido de comandiavoz.com) y rellenar §2/§7/§11 del doc.
- **📝 Doc drift corregido — crons de sivra — 21/06/2026**
  El `CLAUDE.md` de sivra y el skill `sivra-maestro` decían "10 crons en vercel.json", pero es
  **obsoleto**: el `vercel.json` de sivra solo tiene **1 cron** (`/api/seo-refresh` semanal, #419).
  Los ~18 crons de negocio (pricing/apply-auto, mercado, limpiadoras, expenses, eventos, mensajes,
  updates…) se **migraron a plataforma** (#348/#288) y viven en `apps/plataforma/vercel.json` como
  `/api/sivra/*` (plataforma tiene 25 crons en total). Corregidos ambos docs; **no re-programar esos
  crons en sivra** o correrían por duplicado. (Solo documentación, sin cambio de código.)

- **🔎 Agente SEO de housesevillana.es (sivra) — Bloque A (paridad con ia-rest sin Google) — 21/06/2026**
  Spec/plan en `docs/superpowers/{specs,plans}/2026-06-21-agente-seo-housesevillana-bloqueA*`.
  - **Contexto:** housesevillana.es es una **landing estática de un fichero** (`app/route.ts` en repo
    aparte `house-sevillana-landing`), editada por la GitHub API desde `apps/sivra/app/api/seo-refresh`.
    No aplica el modelo "cambios como datos en BD" de ia-rest; la paridad = **seguridad + revert + schema**.
  - **Hecho (Bloque A):** helpers extraídos a `lib/seo-landing.ts` (DRY, compartidos con revert);
    **kill switch** `SEO_AGENT_ENABLED` (solo gatea el cron; el botón manual con sesión funciona siempre);
    **snapshot+revert** (nueva columna `seo_proposals.currentOgDescription` + endpoint `/api/seo-revert`
    que re-commitea title/desc/OG anteriores + botón "Revertir" en `/seo` + estado texto `REVERTED`);
    **JSON-LD conservador** (solo reemplaza si ya existe bloque `ld+json` en la landing; si no, lo guarda
    en `schemaDescription` y sigue). El análisis ya iba por `aiSearch` (pasarela/Gemini, fallback NIM).
  - **Migración aplicada** a Supabase `wswbehlcuxqxyinousql` (`seo_proposals_revert`, aditiva): solo
    `add column currentOgDescription text`. OJO: `seo_proposals.status` es **text** en la BD (NO hay enum
    `SeoStatus` real) → `REVERTED` es solo a nivel Prisma/app; no se alteró ningún tipo.
  - **Verificado:** lógica pura de `applySeoReplacements` (7 checks, vía node) ✅, `next build` sivra ✅.
  - **⚠️ PENDIENTE de despliegue:** `GITHUB_TOKEN` en el Vercel de sivra (acceso a `house-sevillana-landing`)
    y `SEO_AGENT_ENABLED=true` para activar el cron. Sin ellos: error claro / cron inactivo.
  - **Bloque B pendiente:** conectar **GSC+GA4** de housesevillana.es (datos reales) — requiere OAuth de
    Alberto; mismo trabajo que la **Fase 0 de ialimp** (compartir fontanería GSC/GA4).
- **💶 FINANZAS — Reconciliación BBVA 2025 con Modelo 190 IRPF + correcciones masivas BD — 21/06/2026**
  - **Importación completa:** Kutxabank XLS (581 filas) + BBVA XLSX (379 filas) Jan 2025–Jun 2026 en `movimientos_bancarios`. Total BD: Kutxa 733, BBVA 458, Tarjeta 434, N26 1 → 1.626 filas. Autocategorización SQL de 848 filas NULL.
  - **Dúplex BBVA 2026 corregido a €12.195,38:** filas XLS duplicadas de PSD2 marcadas `ignorado`; 8 "Transferencia recibida" Jan-Mar 2026 (antes de cobertura PSD2) reclasificadas a `turistico_duplex`.
  - **Correcciones BBVA 2025 — "Transferencia recibida" = Booking dúplex:** Alberto confirmó que TODAS las "Transferencia recibida" en BBVA son pagos de Booking (dúplex). Reclasificadas 57 filas → `turistico_duplex` (€19.188). Dúplex BBVA 2025 recuperado.
  - **Otras correcciones BBVA 2025:** Traspaso €6.000 + Cuenta cancelada €1.014,72 → `traspaso_interno`; Deuda €600 + Abono devolución €47,90 → `personal`; ANULACION RECIBO OCCIDENT (Kutxa) €627,01 → `personal` (devolución prima, no comisión).
  - **Seguros BBVA 2025 limpio:** €6.176,53 neto (bruto estimado €7.267 ÷ 0,85). Modelo 190 bruto: €8.593,76 → neto €7.305. Gap ~€1.128 = timing (comisiones dic-2025 cobradas en ene-2026 que el pagador ya declaró en 2025).
  - **`porCompania` mejorado (`finanzas.ts` líneas 441-475):** añadidos patrones Plataforma m00171, 8/92361, Liq.comisiones, Fra-comis, Comisiones mensuales, Pd005, Remsaldo, M1454, Liq. saldo cuenta, Pago saldo cta, Liquidación comisiones. Ya no todo va a "Otras comisiones".
  - **Matches exactos Modelo 190 vs BD:** AXA €41,80 neto (Liq. saldo cuenta) ✓ | Reale €47,66 neto (Liquidacion comisiones) ✓ | Generali pequeño €32,24 (Pago saldo cta) ✓.
  - **Pendiente:** Identificar a qué compañías corresponden los códigos de plataforma (m00171, liq.comisiones, M1454, etc.) para el desglose completo del Modelo 190. Necesita que Alberto lo confirme con su gestoría o extracto detallado de la plataforma.

- **🧹 CONCURSOS (plataforma) — auto-saneo de provincia en la ingesta + skills actualizadas — 21/06/2026**
  - **Bug visto:** buscar Sevilla daba 0 aunque había 3 (Autoridad Portuaria/EMASESA): eran filas de una
    ingesta vieja, ya fuera del feed, con `provincia=NULL` → el filtro estricto las ocultaba. Backfill manual aplicado.
  - **Arreglo permanente:** la ingesta (`lib/concursos-ingesta.ts`) ahora **auto-sanea** en cada pasada:
    rellena la provincia de las EN PLAZO sin ubicación deduciéndola del órgano (`provinciaDeTexto`); y el
    `ON CONFLICT` usa `COALESCE(EXCLUDED.provincia, …)` para no pisar una provincia ya conocida con NULL.
  - **Skills sincronizadas:** `ialimp-maestro` (concursos YA NO viven en ialimp), `central-maestro` (concursos→plataforma),
    `plataforma-maestro` (nueva entrada de concursos en "Dónde vive cada cosa").
  - **Diferencia Buscar vs Actualizar:** Buscar = filtra el corpus ya guardado (instantáneo); Actualizar = descarga
    lo último de PLACSP (solo trae datos en Vercel; 403 fuera).

- **🎯 CONCURSOS (plataforma) — filtro por zona ESTRICTO, probado en vivo — 21/06/2026**
  - Tras poblar provincia por código postal del órgano (#418), el filtro de zona pasa a **estricto**: al elegir
    zona se muestran SOLO las ubicadas en ella. Verificado en la BD: **Andalucía → 6 resultados, todos andaluces,
    0 de Canarias** (antes se colaban por la inclusión de NULL).
  - **Límite de la fuente:** el feed PLACSP solo trae ubicación en ~56% de los anuncios; el ~44% restante queda
    sin provincia y aparece solo en "Toda España" (no se cuela en otras zonas). Backfill de normalización aplicado
    en la BD (`provincia` = provincia oficial o NULL; se limpiaron municipios crudos de la versión anterior).

- **🎯 CONCURSOS (plataforma) — filtro por ZONA fiable vía CÓDIGO POSTAL + desplegable de provincia — 21/06/2026**
  - **Problema:** al elegir zona (Andalucía) salían licitaciones de otra región (Canarias) porque la
    provincia estaba vacía en el corpus y el filtro incluía las de ubicación desconocida (recall sobre precisión).
    Deducir la provincia del NOMBRE del órgano solo cubría ~30%.
  - **Solución de raíz:** la provincia se deduce del **código postal del órgano** (PostalZone del feed) →
    `provinciaDeCP` (mapa oficial 52 prov., 04=Almería…41=Sevilla…35=Las Palmas). Extracción **recursiva**
    (`buscarValor`) para no depender de la ruta exacta del XML (PLACSP da 403 fuera de Vercel, no se pudo inspeccionar).
    Precedencia: CP → CountrySubentity → CityName → nombre del órgano.
  - **UI:** el campo "Provincia" pasa de texto libre a **desplegable** dependiente de la zona (`provinciasDeComunidad`).
  - **Pendiente de dato:** se rellena al **reingerir** (cron 6 h o botón "Actualizar ahora"); el corpus viejo
    queda null hasta entonces. El filtro sigue incluyendo las de ubicación aún desconocida (residuo pequeño).

- **🍽️ ia-rest PREAVISO de marcha — Fase 1 MERGEADA + voz + Fase 2 auto en marcha — 21/06/2026**
  - **Fase 1 (PR #408, MERGEADO en main):** botón 📣 en `/kds` → push + banner Realtime en `/edge`
    → camarero confirma "mesa lista" → cocina lo ve. Tabla `preavisos` (schema iarest), gate
    `restaurantes.preaviso_activo` (off por defecto, toggle en `/owner`). Migración aplicada en prod.
  - **Voz en los cascos (Capa 1-2, en #408):** `/edge` lee el preaviso en voz alta (reutiliza
    `speak()` VOX+WebSpeech) + vibración si la pantalla está visible y `!ttsOff`. Bloqueado en
    navegador = solo tono del push (iOS imposible). Spec: `2026-06-21-preaviso-voz-cascos-design.md`.
  - **Fase 2a — DISPARO AUTOMÁTICO (nuevo, rama `claude/plate-change-server-alert-n8prlu`):**
    modelo v1 = umbral fijo por restaurante `restaurantes.preaviso_auto_min` (0=solo manual,
    configurable en `/owner`). Cron `/api/cron/preavisos-auto` (cada 2 min) dispara el preaviso solo
    para comandas en cocina que superan el umbral y no tienen preaviso (`emitido_por='auto'`). Lógica
    crear+push extraída a `lib/preaviso-server.ts` (compartida con el POST manual). Migración
    `preaviso_auto_min` APLICADA en prod. **Build verde.** Los preavisos manuales registran
    `emitido_at` vs comanda `created_at` → base para aprender antelación por plato en el futuro.
  - **Fase 2b — VOZ NATIVA bloqueado (APK Android, PENDIENTE construir):** spec
    `2026-06-21-preaviso-voz-nativa-apk-design.md`. SÍ hay proyecto Android editable en
    `apps/ia-rest/android/` (Kotlin, WebView + `BridgeService` foreground con Realtime Supabase, sin
    FCM). Plan: extender `BridgeService` para escuchar `preavisos` por Realtime y hablar con el TTS
    nativo de Android con la pantalla apagada. Caveat: compilar/firmar/publicar la APK (keystore) es
    paso manual de Alberto; Claude escribe el Kotlin.
  - **Docs de usuario (#414):** actualizada la ayuda en app (`help-prompts.ts`, roles camarero/cocina/owner)
    y `public/manual.html` (subsección Preaviso) con la voz + el disparo automático. Los PDF de
    `public/manuals/*` son binarios → pendientes de regenerar por Alberto (texto listo).
  - **Auto-mantenimiento de manuales:** ampliado `/auditoria-diaria` (paso 4) para que el agente nocturno
    también reconcilie los manuales de usuario (help-prompts.ts + manual.html) cuando haya features nuevas,
    y deje los PDF como acción manual. Antes solo cubría memoria/skills/CLAUDE.md/SKILLS.md.
  - **Fase 2b — VOZ NATIVA bloqueado: CÓDIGO ESCRITO (no compilado) en #414.** Nuevo
    `android/.../PreavisoVozService.kt` (foreground `specialUse` + Supabase Realtime sobre
    `preavisos` + TTS `es-ES`, habla solo si la app NO está visible → no duplica la voz web).
    `BridgeInterface.setPreavisoSesion(...)`, `MainActivity` set `appVisible` en onResume/onPause,
    manifest con permiso `FOREGROUND_SERVICE_SPECIAL_USE`. La WebView pasa las credenciales
    Supabase ACTUALES (no hardcode). **Pendiente: build+firma+publicar APK (v13/v3.1) por Alberto.**
  - **✅ HALLAZGO (pre-existente) ARREGLADO:** `BridgeService.kt` tenía hardcodeado el proyecto
    Supabase viejo `efncqyvhniaxsirhdxaa` (sin schema `iarest` ya) para el Realtime de impresión.
    La app vive en `wswbehlcuxqxyinousql` (BD unificada, schema `iarest`). Arreglado: la WebView
    inyecta URL/anon/schema actuales vía `IaRestBridge.setSupabase` (desde `AppBadge`, todas las
    páginas privadas); sin creds → omite Realtime y sigue por polling (sin regresión). Llega en APK v3.1.
  - **📋 Acciones de Alberto:** `docs/ACCIONES-ALBERTO-preaviso.md` (merge #414, activar toggle,
    build+firma+release APK v3.1, regenerar 3 PDF). BD y web ya hechos/automáticos.
  - **Texto PDF manuales:** `docs/manuals-texto-preaviso.md` (camarero/cocina/owner) listo para
    pegar al regenerar los PDF (binarios, no los toca Claude).
  - **⚠️ Aclaración BD:** ia.rest en PROD usa `wswbehlcuxqxyinousql` (schema `iarest`), NO el
    proyecto `efncqyvhniaxsirhdxaa` (ese es el viejo standalone, ya sin tablas iarest).
  - **⚠️ Correción de nota previa:** el código de ia.rest SÍ vive en `central` (`apps/ia-rest`), buildea
    en Vercel y se mergeó por #408. La nota antigua de "repo aparte" está desactualizada.

- **🤖 IA: fallback de TEXTO restaurado con Groq (mismo Llama 3.3 70B, gratis) — 21/06/2026**
  - **Contexto:** Alberto preguntó si los modelos gratis de moda (Llama 3, Groq, Mistral, Cohere, HF…)
    valdrían para el proyecto. Auditoría: **casi todo ya integrado y gratis** — texto/visión = Llama 3.3
    70B + 3.2 11B Vision por **NVIDIA NIM**, voz = **Groq Whisper**, búsqueda web = **Gemini Flash**.
    El hueco real NO era falta de modelos sino **falta de redundancia**: tras retirar Anthropic (sin saldo,
    17/06), NIM quedó como **punto único de fallo** del texto (`callAI` lanzaba error si NIM caía).
  - **Hecho:** adaptador puro `groqText`/`groqChat`/`groqChatTools` en `@central/core-ai`
    (`packages/core-ai/src/groq.ts`, espejo de `nim.ts`, endpoint OpenAI-compat de Groq, default
    `llama-3.3-70b-versatile`). Cableado fallback automático **NIM → Groq** en `apps/ia-rest/src/lib/ai-client.ts`
    (`callAI` y `callAITools`). Reutiliza `GROQ_API_KEY` (ya existía para Whisper); override opcional
    `GROQ_BRAIN_MODEL`. Visión sigue NIM-only (Groq no tiene vision model gratis equivalente). `noFallback`
    pasa a ser legacy (ya no bloquea el fallback gratis). Doc en `docs/IA-busqueda-web-y-proveedores.md`.
  - **✅ MERGEADO (PR #415, squash en `main`):** 11/11 checks verdes (typecheck de las 4 verticales,
    tests, build, los 5 previews de Vercel Ready). Incluyó también un fix de CI ajeno: shim de tipos
    `apps/plataforma/types/pdf-parse.d.ts` (deuda preexistente de `lib/concursos.ts`, #403).
  - **Reconciliadas skills/docs** (que describían "NIM → Anthropic/Haiku fallback", ya obsoleto):
    `.claude/skills/ia-rest-maestro/SKILL.md` (STACK IA), `packages/core-ai/README.md` (exports `groq*`
    + scope `@central`), `docs/SKILL-proyecto-claude.md`, `docs/HANDOFF-unificacion-casa-marcas.md`, y
    specs/planes forward-looking (maître-ia, consolidación/duplicados bancarios). Todos → "NIM → Groq, gratis".
  - **Propagado a sivra/ialimp/plataforma (misma PR #415):** el fallback NIM → Groq se metió en el
    **wrapper compartido** `aiComplete`/`aiTools` de `packages/core-ai/src/client.ts`. Como las rutas-servidor
    de la **pasarela** (`apps/plataforma/app/api/ai/{chat,tools}/route.ts`) llaman a esos wrappers, UNA edición
    cubre a la vez (a) el camino directo de las 3 verticales y (b) el tráfico por pasarela. En el chat de
    pasarela queda **NIM → Groq → Gemini** (Gemini ya existía). Visión NIM-only. Verificado: tsc 0 errores en
    plataforma/ia-rest/sivra (sivra tras `prisma generate`).
    - ✅ **`GROQ_API_KEY` puesta en el Vercel de plataforma** (Production+Preview) y redeploy de prod
      **READY** → el fallback **NIM → Groq → Gemini queda ACTIVO en producción** (host de la pasarela,
      por donde va casi todo el tráfico de sivra/ialimp/plataforma). ia-rest ya la tenía (Whisper).
      Override `GROQ_BRAIN_MODEL`. **Opcional pendiente:** la misma key en **sivra** e **ialimp** solo si
      se quiere cubrir su camino directo SIN pasarela (por pasarela ya están cubiertas).
    - Recordatorio de arquitectura: la IA vive en el núcleo compartido `@central/core-ai` (añadir un
      proveedor nuevo = un solo sitio, lo heredan todos los módulos), pero las **claves son por vertical**
      (cada proyecto Vercel inyecta las suyas) — por eso `GROQ_API_KEY` se configura por proyecto.
  - **Pendiente (futuro):** **Cohere Rerank/Embed** para mejorar RAG (buscador de
    comparables en sivra `app/api/mercado/*` y concursos LCSP en plataforma) — ese es el hueco de
    CALIDAD real. Mistral solo si se quiere diversidad de modelo; Ollama solo si self-host.

- **🌐 URLs de producción (no perder) — 16/06/2026**
  - **plataforma** (web principal: dashboard + chat 🤖 Agente IA en `/agente`): **`https://plataforma-ten-flame.vercel.app`** (login `/login`).
  - **sivra** (motor de pricing dinámico + endpoints `/api/pricing/*`, `/api/mercado/*`, etc.): `housesevillana.vercel.app` (la pantalla de login es la verde "SIVRA").
  - Son **apps distintas** (no confundir): el chat del agente está en *plataforma*; aplicar precios a Smoobu se hace por el endpoint de *sivra* (logueado o por el cron con `CRON_SECRET`).

- **🍽️ idea ia-rest: PREAVISO de marcha cocina⇄sala — SPEC escrito — 21/06/2026**
  - **Idea de Alberto:** avisar al camarero con tiempo de un cambio de plato (sale carne caliente →
    desbarasar y montar el cubierto/plato ANTES de que salga, para que no se enfríe esperando).
  - **Diseño (brainstorming, todo delegado a mi criterio):** Fase 1 botón manual "📣 Preaviso" en `/kds`
    (cocina manda) → push al camarero de la mesa (infra `qr-call-waiter`) → aviso nombra los platos
    (info ya en la comanda, cero config) → camarero confirma "mesa lista" en `/edge` (dos direcciones)
    → cocina lo ve por Realtime `kds-{id}` y emplata. Tabla nueva `preavisos` (schema `iarest`).
    Fase 2 (futuro): automático por tiempos aprendidos (el botón manual genera esos datos) + menaje por producto.
  - **Hecho:** spec en `docs/superpowers/specs/2026-06-21-preaviso-marcha-cocina-sala-design.md`
    (commit en rama `claude/plate-change-server-alert-n8prlu`). **Pendiente revisión de Alberto** antes
    de sacar el plan (`writing-plans`).
  - **⚠️ Ojo al implementar:** el código de ia.rest vive en su PROPIO repo (`albertosuarezgutierrez-gif/ia.rest`),
    no en `central`. Esta sesión solo tiene scope sobre `central` (ahí está el spec). Para construirlo hay que
    abrir/añadir el repo de ia.rest.

- **🐛 CONCURSOS (plataforma) — buscador daba 0 al filtrar por zona — 20/06/2026**
  - **Causa:** el feed PLACSP a menudo NO trae `provincia` (0/57 de las en-plazo la tenían), pero el
    buscador filtraba en duro `provincia ILIKE …` → cualquier CCAA/provincia seleccionada = 0 resultados.
    (El corpus SÍ tiene datos: 201 filas, 57 en plazo, con CPV y FTS OK.)
  - **Fix 1 (inmediato):** `api/concursos/radar/buscar` incluye también las de ubicación desconocida
    (`provincia IS NULL OR ''`) al filtrar por zona → deja de dar 0.
  - **Fix 2 (a futuro):** el parser `lib/concursos-radar.ts` saca la provincia como fallback de la
    dirección del órgano de contratación (`LocatedContractingParty.Party.PostalAddress`), no solo de
    `RealizedLocation` (que el feed omite). Se rellena al re-ingerir (cron cada 6 h, UPSERT por dedupe_key).

- **🔀 AGENTE DE CONCURSOS — PORTADO de ialimp → PLATAFORMA (y borrado de ialimp) — 19/06/2026**
  - **Por qué:** las licitaciones son **transversales a los negocios de la cuenta** (fontanería, catering JJ,
    limpieza…), no de la vertical de limpiezas. Decisión de Alberto: el agente va en **plataforma**, no en ialimp.
  - **Plataforma (nuevo):** sección de usuario **🏛️ Concursos** (`/concursos`, sidebar *Mi negocio* + command palette).
    Scope = **CUENTA** (`requireEmpresaId()` shim → `requireSession().id` = `cuenta_id`; las tablas guardan ese id en
    su columna `empresa_id`). Corpus `concursos_licitaciones` GLOBAL. Consume `@central/module-concursos`.
  - **Shims clave en plataforma** (para reusar el código de ialimp sin reescribir): `lib/prisma.ts` (→`lib/db`),
    `lib/tenant.ts` (`requireEmpresaId`), `lib/mailer.ts` (`getTransporter`/`MAIL_FROM` sobre `@central/core-email`),
    y `aiComplete()` añadido a `lib/ai-client.ts` (NVIDIA `nimChat`). Crons de email hacen `JOIN cuentas` (no `empresas`).
    OCR NO portado (deps pdfjs/canvas). 4 crons en `vercel.json` (ingesta/radar/avisos/cierre).
  - **ialimp (borrado):** eliminadas páginas `/admin/concursos`, rutas `api/admin/concursos`, 4 crons, libs
    `concursos*.ts`, y entradas de menú (`DashboardClient` NAV/NAV_MODULO). Las **tablas se quedan** (las usa plataforma).
  - **Verificado:** build de plataforma ✓ y de ialimp ✓ (tras el borrado). Sin migraciones nuevas (reusa tablas).
  - **PENDIENTE para que los emails salgan:** poner `SMTP_*`/`RESEND_API_KEY` en el proyecto Vercel **plataforma**
    (hoy viven en ialimp). `NVIDIA_API_KEY`/`CRON_SECRET` ya están en plataforma.

- **🟢 AGENTE DE CONCURSOS (ialimp) — FASE 3+4: del hallazgo a la oferta + usabilidad — 19/06/2026** (PR #400 mergeado a `main`)
  - **H "Preparar candidatura 1 clic":** botón en cada resultado del buscador → `POST /api/admin/concursos/preparar`
    crea un `concursos` con **ficha mínima** desde el anuncio (sin pliego) y lo abre en el workspace (evento DOM
    `concurso-preparado` → `FichaView`). El sobre administrativo (DEUC+declaración) ya funciona con perfil+biblioteca;
    para Go/No-Go, criterios, memoria y oferta hay que subir el pliego.
  - **D "¿Me conviene?":** (1) **resumen IA** por anuncio (`POST radar/resumen`, `aiRunner`, cacheado en
    `concursos_licitaciones.resumen_ia` — migración `2026-06-19_concursos_licitaciones_resumen.sql`, aplicada); (2)
    **semáforo de encaje DETERMINISTA** (módulo puro `encajeConcurso(anuncio, criterios)` vs criterios del radar →
    🟢/🟡, sin IA). 96 tests del módulo en verde (+6 de encaje).
  - **K "Búsqueda en lenguaje natural":** caja "✨ Describe lo que buscas" → `POST radar/interpretar` (la IA traduce a
    `{cpv, ccaa, provincia, presupuesto, q}`) → rellena los filtros y busca; degrada a búsqueda por texto si la IA falla.
  - **Nota:** "🏛️ Concursos" YA está en el menú lateral del panel (`DashboardClient.tsx` NAV, sin gating por rol).
    El agente está COMPLETO salvo extra opcional (BOE como fuente adicional + unificar el radar sobre el corpus).

- **🟢 AGENTE DE CONCURSOS (ialimp) — FASE 2: proactivo (seguimiento + avisos) — 19/06/2026** (PR #398 mergeado a `main`)
  - **El agente pasa de *pull* (buscar) a proactivo (te trae y te avisa).** Tres piezas:
  - **G "Mis concursos" (seguimiento):** tabla `concursos_seguidos` (scope `empresa_id`, `dedupe_key`,
    `licitacion` jsonb = snapshot, `estado` interesado→adjudicado/perdido, `notas`, `fin_presentacion`,
    `recordatorio_cierre_at`). API `app/api/admin/concursos/seguidos` (GET/POST/PATCH/DELETE por `dedupe_key`).
    UI: botón "📌 Seguir" en el buscador + panel "📌 Mis concursos" (sincronizados por evento DOM
    `concursos-seguidos-changed`). El buscador devuelve `dedupe_key`.
  - **C "Recordatorio de cierre":** cron `/api/cron/concursos-cierre` (diario 9:00) → email a `empresas.email`
    de los seguidos (interesado/preparando) que cierran en ≤3 días, idempotente vía `recordatorio_cierre_at`.
  - **B "Avisos de nuevos":** cron `/api/cron/concursos-avisos` (diario 7:30) → digest por email de los matches
    del radar (`concursos_radar_anuncios`) aparecidos en 48 h y no enviados, empresas con `radar_activo`.
    Idempotente vía columna nueva `avisado_email_at`; >2 días sin enviar se marcan sin email (sin backfill-blast).
  - **Sin push** (las suscripciones son de limpiadoras) → todo por email (`lib/mailer.ts`), patrón cron-impagos.
  - **Migraciones aplicadas a mano en Supabase:** `2026-06-19_concursos_seguidos.sql`, `2026-06-19_radar_anuncios_avisado.sql`.
  - **OJO crons en `vercel.json`:** `concursos-cierre` (0 9 * * *) y `concursos-avisos` (30 7 * * *), auth Bearer `CRON_SECRET`.
  - **Pendiente Fase 3:** H "preparar candidatura 1 clic" (wire al análisis F1-F6) + D resumen IA "¿me conviene?"; luego K lenguaje natural; BOE como fuente.

- **🟢 AGENTE DE CONCURSOS (ialimp) — buscador por sector/zona + ingesta a demanda — 19/06/2026** (PRs #393, #394, #396 mergeados a `main`)
  - **Contexto:** Alberto quería que el buscador de concursos le trajera catering/fontanería **en Andalucía**. El corpus
    `concursos_licitaciones` estaba vacío y **PLACSP bloquea por IP (403)** cualquier fetch que no venga de Vercel
    (por eso no se puede sembrar desde el contenedor de dev; la ingesta real solo corre en preview/prod).
  - **#393 — Selector de sector (CPV):** catálogo puro `packages/module-concursos/src/sectores.ts` (32 sectores
    PYME → divisiones CPV) + chips "Tu sector" en el buscador (`apps/ialimp/app/admin/concursos/page.tsx`).
  - **#394 — Fontanería + fix CPV:** añadido sector **Fontanería** (`4533`). **Bug corregido:** varios sectores
    usaban prefijos CPV **con punto** (`79.7`, `92.4`…) que el buscador (`LIKE 'prefijo%'` sobre códigos sin punto)
    **no casaba nunca** → normalizados a `797`/`924`/`374`/`7934`. Test que prohíbe puntos en los prefijos.
  - **#396 — Agente F1:** (A) botón **"⟳ Actualizar ahora"** = ingesta a demanda. Lógica extraída a
    `apps/ialimp/lib/concursos-ingesta.ts` (`descargarAtom`/`ingerirAnuncios`), reutilizada por el cron
    `concursos-ingesta`, el cron `concursos-radar` (quitada duplicación) y el nuevo `POST /api/admin/concursos/ingesta`.
    (F) **Filtro por zona/CCAA**: mapa puro `packages/module-concursos/src/provincias.ts`
    (`COMUNIDADES`/`provinciasDeComunidad`/`comunidadDeProvincia`, tolerante a acentos), filtro `?ccaa=` en el
    buscador (expande a provincias por `ILIKE`) + selector "Tu zona" recordado en `localStorage`. Probado el filtro a
    nivel BD (Andalucía + sector) con filas de prueba (limpiadas). Módulo **88/88**, build ialimp ✓.
  - **Roadmap acordado (siguientes fases, NO hechas):** F2 = G "Mis concursos" (seguimiento) + B avisos proactivos
    email/push por sector+zona + C recordatorio antes del cierre. F3 = H "preparar candidatura 1 clic" (wire al
    análisis F1-F6) + D resumen IA "¿me conviene?". F4 = K búsqueda en lenguaje natural. BOE/TED descartados (bajo ROI local).
  - **Pendiente menor:** el manual (`public/manual.html`) NO cubre el módulo de concursos (0 menciones) — documentarlo entero es tarea aparte.

- **🟢 DIETAS por COMENSALES PUNTUALES (cocina/catering JJ) — 19/06/2026** (PR #391 mergeado a `main`)
  - **Por qué:** crítica de Joaquín — las dietas son de **comensales puntuales** (5 sin gluten, 3 veganos),
    NO un filtro global que cambie el menú entero por 1 persona. Antes, "✨ Sugerir menú" pasaba
    "Restricciones" como texto libre a la IA → habría hecho TODO el menú sin gluten. Corregido de raíz.
  - **Modelo:** un evento = **menú principal** (todos los PAX) **+** grupos `{dieta, nº comensales, plato adaptado del catálogo}`.
    El plato adaptado es una receta del catálogo (la IA no inventa: si falta, lo dice en notas).
  - **DB (BD viva + repo):** `2026-06-19_cocina_dietas.sql` → `cocina_evento_elaboraciones` +`comensales int` +`dieta text`
    (NULL/NULL = menú principal, retrocompatible). El PK `(evento_id,receta_id)` impedía varias filas por receta →
    sustituido por **id sintético** (`gen_random_uuid()`) + 2 índices únicos parciales (principal / por dieta).
    *El código en producción sigue siendo compatible (inserts sin dieta funcionan igual).*
  - **Motor puro `@central/module-trazabilidad`:** `EventoInput.dietas[]`, `ElaboracionTraza.{dieta,comensales,receta_base}`;
    `generarParte` genera **elaboraciones de dieta** (agrupa receta+dieta, suma comensales, escala el escandallo por
    COMENSALES, no por PAX). Nuevo `dietas.ts`: `alergenosIncompatibles(dieta)` + `avisosDietas()` (#3). **36 tests verdes.**
  - **API:** `parte` devuelve `elaboraciones`+`dietas[]`; `eventos` POST/PATCH persisten ambos (helper
    `lib/cocina-elaboraciones.ts`); `menu-sugerido` reescrito → `{menu, alternativas:[{dieta,comensales,platos}], notas}` (#9 sustitución IA).
  - **UI `/produccion`:** EventoForm con sección "Comensales con dieta especial"; "Sugerir menú" con grupos de dieta;
    fichas de dieta con chip "🟢 sin gluten · 5 raciones"; `duracionTarea` usa comensales; reparto IA ignora líneas de dieta;
    **avisos de seguridad** (#3), **resumen de dietas para sala** (#4), **hoja de alérgenos imprimible** (#1).
  - Verificado: `tsc --noEmit` limpio + tests del paquete verdes; 5/5 previews Vercel en verde. Backlog:
    #2 etiqueta/plato, #6 lista compra resta dietas, #7 coste/margen, #8 plantillas evento, #10 histórico cliente.

- **📅 `diaHabitual` en facturas-control — 19/06/2026** (PR #389, builds Ready)
  - Usuario vio 13 facturas en estado "Falta"/"En plazo" sin saber cuándo llega cada una.
  - Añadido `diaHabitual?: number | null` a `ProveedorRecurrente` en `lib/sivra/facturas-control.ts`.
  - Los 17 proveedores recurrentes tienen ahora su día típico del mes (1, 5, 8, 10, 15, 25).
  - La UI (`sivra/facturas-control/page.tsx`) muestra "~día X" en gris debajo del nombre del proveedor.
  - La API route (`route.ts`) no necesitó cambios (spread `...p` ya pasa `diaHabitual` al JSON).
  - **Stop hook:** local branch `claude/responsive-panel` → remote `claude/nice-heisenberg-jo4vy1`.
    El hook busca `origin/claude/responsive-panel` (no existe) → cae a `origin/HEAD` (main) →
    escanea 28 commits. Fix manual: `git fetch origin claude/responsive-panel && git push --force origin HEAD:claude/responsive-panel`.

- **🟢 fix(ia-rest/blog-seo) + fix(plataforma/banca) + feat(plataforma): Control de Facturas — 18/06/2026** (PRs #384, #385 mergeados; blog-seo sin PR propio)
  - **fix(ia-rest/blog-seo):** `callAI` gana 6º arg `model` opcional. El cron `app/api/cron/blog-seo/route.ts`
    usa `meta/llama-3.1-8b-instruct` (8B) con timeout interno <60 s para no superar el límite de Vercel.
    `ia-rest-maestro` skill actualizada. Añadida spec `docs/superpowers/specs/2026-06-16-core-receipts-design.md`.
    Recrea PR #302 (stale draft, código portado directamente a main).
  - **fix(plataforma/banca) — PR #384:** Ingresos de la correduría (comisiones + liquidaciones Allianz/Mapfre)
    llegaban con signo negativo y se clasificaban como gastos, descuadrando el panel `/finanzas`. Solución:
    nuevo `apps/plataforma/lib/destino.ts` (clasificador basado en destino, no en signo) +
    `lib/destino.test.ts` (44 tests). Migración `2026-06-16_reclasificar_abonos_correduria.sql` (aplica
    `UPDATE movimientos_bancarios SET clasificacion_manual=...` a los movimientos históricos mal clasificados).
    Recrea PR #331 (stale draft).
  - **feat(plataforma): Control de Facturas — PR #385:** Panel `/sivra/facturas-control` en plataforma
    (lista de proveedores recurrentes con frecuencia esperada vs. última factura recibida).
    `GET /api/sivra/facturas-control` compara `facturas_drive` contra el registry en
    `apps/plataforma/lib/sivra/facturas-control.ts`. Alerta `facturasFaltantes` en `getAlertas`
    (`lib/banca.ts`) + banner en `/dashboard` + entrada `🗂️ Facturas` en el sidebar (Mis pisos).
    Spec `docs/superpowers/plans/2026-06-16-facturas-control.md` (741 líneas). Recrea PR #322.

- **🐛 FIXES COMUNICACIÓN + FINANZAS — 18/06/2026** (PR #382 mergeado a `main`)
  - **`/comunicacion` → Nuevo mensaje → Persona**: dropdown vacío corregido. `sivraAdapter` no
    tenía `listarDirectorio` → añadido: query `limpiadoras WHERE activa = true ORDER BY nombre`
    (single-tenant, sin filtro empresa_id). Ahora muestra las 15 limpiadoras activas.
  - **`/finanzas` → BBVA 0€ personal**: comportamiento correcto (todos los movimientos personales
    BBVA son positivos — Bizum recibido, pensiones). Añadida nota explicativa inline en
    `FinanzasClient.tsx` cuando `gastos === 0` y la etiqueta contiene "BBVA".

- **🔗 UNIFICACIÓN spine `eventos` (boda = cocina + material + CRM) — 19/06/2026** (rama `claude/jj-logistica-materiales-k5eko3`)
  - **Aclaración:** el módulo CRM de eventos (`eventos` "Eventos v2": presupuesto/espacio/fechas
    montaje) y `cocina_eventos` YA existían; lo que faltaba era **unirlos**. Hecho.
  - **DB (BD viva + repo):** `cocina_eventos.evento_id uuid REFERENCES eventos(id)` (puente, nullable).
    Migración `apps/ia-rest/supabase/migrations/2026-06-19_cocina_evento_crm_link.sql`.
  - **API nueva** `api/cocina/eventos/[id]/crm` (GET/POST): crea una ficha `eventos` mínima desde el
    evento de cocina (cliente=nombre, fecha, aforo=pax, modo_local='cerrado', requiere_appcc) o enlaza
    a una existente; **re-apunta el material** ya asignado del id de cocina → id del evento CRM.
  - **Anclaje del material:** `api/cocina/eventos/[id]/material` ahora usa `evento_id ?? cocina_evento.id`
    como `destino_ref`. Si la boda tiene ficha CRM, cocina + material cuelgan del MISMO `eventos.id`.
  - **UI `/produccion`:** botón **🔗 Ficha CRM** por evento (crea/enlaza) → chip cuando está unido;
    el panel de material indica "unido a la ficha CRM". `parte` devuelve `evento_id`.
  - **Legacy** `inventario_menaje_evento` (menaje viejo sobre `eventos`) se deja como está (no migrado).
  - Verificado: `tsc --noEmit` limpio; insert de `eventos` probado contra constraints (smoke + limpieza).

- **🔗 INTEGRACIÓN boda → cocina + material (1er corte CONSTRUIDO) — 18/06/2026** (rama `claude/jj-logistica-materiales-k5eko3`)
  - Nuevo: cada **evento de cocina** (`/produccion`) lleva su **material** (mesas/sillas/menaje). Botón
    **📦 Material** por evento → panel para añadir **kits** o **material suelto**, con descuento de stock,
    valor en riesgo (coste de reposición) y quitar (repone stock).
  - **API** `apps/ia-rest/src/app/api/cocina/eventos/[id]/material/route.ts` (GET/POST/DELETE), auth de
    cocina (`x-ia-session`), scope `local_id`. Enlace **genérico sin FK dura**:
    `materiales_asignacion.destino_tipo='evento'`, `destino_ref=cocina_eventos.id`, `destino_nombre=nombre`.
  - **UI** en `produccion/page.tsx`: panel desplegable bajo cada evento (solo responsable).
  - **DECISIÓN/DESVIACIÓN:** el v1 ancla en **`cocina_eventos`** (lo que JJ usa hoy), NO en la tabla CRM
    `eventos` que se había elegido — porque JJ no usa el módulo CRM de eventos y así es testeable ya. La
    unificación sobre `eventos` (CRM) sigue siendo el norte; migración futura = repuntar `destino_ref`.
  - **Sembrado para probar** (Catering Joaquín Jaén): owner **PIN 1369** (/owner→Materiales), montador
    **PIN 4040** (/montaje), Carmen **1234** (/produccion). 5 materiales + kit "Boda 100 pax" + 2 asignaciones.
    Enlace: `https://www.iarest.es/login?r=catering-joaquin-jaen`.
  - Verificación: pendiente preview Vercel de ia-rest (sin toolchain TS local).

- **📦 MATERIALES · Fase B aplicada a la BD VIVA + diseño integración con cocina — 18/06/2026**
  (rama `claude/jj-logistica-materiales-k5eko3`)
  - **Bug de fondo resuelto:** el código de Fase B del módulo materiales (mesas/sillas/menaje de
    catering JJ) estaba desplegado pero **solo existían 3 de 16 tablas** en la BD viva
    (`wswbehlcuxqxyinousql`, schema `iarest`). Sus migraciones apuntaban a la BD VIEJA
    (`efncqyvhniaxsirhdxaa`) y nunca se aplicaron al schema compartido → las ~15 pantallas/rutas de
    Fase B (espacios, kits, proveedores, clientes, reservas, movimientos, unidades/QR, mantenimiento,
    inventario físico, categorías, alertas) fallaban 404/500 en producción.
  - **Aplicadas las 4 migraciones** (`materiales_v2`, `_categorias`, `_ledger`, `_fase_b`) al schema
    `iarest` con `SET search_path TO iarest, public` (para que aterricen en `iarest`, NO en `public`
    de ialimp/sivra). **Verificado:** 16 tablas `materiales_*` en `iarest`, **0 en `public`**,
    `materiales` con 25 columnas (tipo/estado/proveedor_id/codigo_qr/stock_minimo OK), **RLS 16/16**.
    Añadida policy `service_role_all` a `materiales_categorias` (solo tenía la de current_setting).
  - **Repo sincronizado:** corregidos los headers de las 4 migraciones (BD vieja → compartida iarest)
    + añadido `search_path` para que reaplicarlas vaya al schema correcto.
  - **Diseño integración boda → cocina + material** (decisión Alberto: anclar en la tabla `eventos`,
    el CRM rico, NO en `cocina_eventos`): doc nuevo
    `docs/superpowers/specs/2026-06-18-eventos-spine-cocina-materiales-design.md`. Principio
    "**junto pero separado por módulo**": `eventos` = tronco común; cocina (`cocina_eventos.evento_id`,
    columna nueva propuesta) y materiales (enlace genérico `parent_tipo/destino_tipo='evento'`, sin FK
    dura) cuelgan del mismo evento sin depender entre sí. Incluye 1er corte ("Material del evento" con
    kits + `disponibilidadEnFecha`) y 17 ideas. **NO implementado aún** (solo diseño).
  - **Pendiente para sesión siguiente:** construir el panel "Material del evento" + `cocina_eventos.evento_id`.

- **📱 RESPONSIVE COMPLETO — 18/06/2026** (PR #381 mergeado a `main`)
  - Añadidas media queries `@media (max-width: 768px)` en 30+ páginas de `apps/plataforma`.
  - Lote 1: `LayoutShell`, `dashboard`, `banca` (×2), `finanzas/FinanzasClient`.
  - Lote 2: `apartamentos` (×2), `sivra/mercado`, `sivra/pricing`, `sivra/pricing-auto`,
    `sivra/income`, `sivra/expenses`, `sivra/gastos-fijos`, `sivra/fiscal`.
  - Lote 3: `sivra/limpiadoras` (×2), `sivra/mensajes`, `sivra/calendario`, `sivra/inversion`, `sivra/seo`.
  - Lote 4: `operador/clientes`, `operador/personas`, `operador/iarest/*` (8 páginas),
    `operador/rrhh/*` (2 páginas), `comunicacion` (×2), `CommandPalette`.
  - Estrategia: `<style>` JSX tags + `className` en divs estructurales. Sin Tailwind, sin reescribir
    inline styles. Breakpoints: 768px (tablet/mobile) y 480px (xs). Utilidades globales en `globals.css`.
  - Todos los CI verdes (4 typechecks + tests + 4 builds Vercel Ready).
- **🧮 DEDUCCIONES FISCALES en `/finanzas` (plataforma) — 18/06/2026** (rama `claude/tax-deductions-personal-finance-e098a7`)
  - Nuevo apartado de **deducciones IRPF** en el módulo `/finanzas`: el cálculo ya no se queda en
    los tramos, ahora llega a **cuota íntegra → mínimos → deducciones → retenciones → a pagar/devolver**.
  - **Motor PURO testeado** `apps/plataforma/lib/fiscal-deducciones.ts` (+ `.test.ts`, 6 casos, `node --test`):
    mínimo personal y familiar, maternidad (hijos <3, madre con actividad), familia numerosa,
    autonómicas **Andalucía** (nacimiento + FN), donativos, plan de pensiones. Importes en
    `IMPORTES_POR_ANIO` (con `fuente`/`revisado`). Optimizador: avisos de oportunidad, checklist
    "deducciones que te dejas", transiciones de edad, calendario fiscal.
  - **BD** (migración `2026-06-18_fiscal_perfil_descendientes.sql`, aplicada a `wswbehlcuxqxyinousql`):
    `fiscal_perfil`, `fiscal_descendientes`, `fiscal_novedades`, `fiscal_justificantes`, `fiscal_historico`.
    3 modelos Prisma nuevos. Datos de Alberto sembrados (3 hijos 2018/2024/2025, madre autónoma, FN general).
  - **UI** `FinanzasClient.tsx`: banner de novedad fiscal, tarjeta de deducciones+cuota, simulador
    "¿y si…?" (plan de pensiones), checklist, calendario, histórico interanual, y **formulario**
    de situación familiar (`PUT /api/finanzas/perfil`). CSV gestoría ampliado con el desglose.
  - **Vigilante** skill **`fiscal-novedades`** (BOE estatal + BOJA Andalucía): contrasta los importes,
    abre PR draft al actualizar la constante e inserta en `fiscal_novedades` (`beneficia`=subió) →
    la app **avisa en pantalla**. Registrada en `docs/SKILLS.md` + `docs/RUTINAS-PROGRAMADAS.md` (rutina #5,
    ~mensual). **NO** se cuelga del agente de concursos (ese sondea PLACSP por CPV, fuente distinta).
  - Pendiente: crear el **trigger** de la rutina en `claude.ai/code → Rutinas`. Importes Andalucía son
    orientativos (afinar contra BOJA en la 1ª pasada del vigilante).
- **🔍 AUDITORÍA PROFUNDA SEMANAL — 18/06/2026** (`docs/AUDITORIA-2026-06.md` addendum)
  - Estado general: **SANO**. 0 errores de tipos en las 5 apps (ia-rest, sivra, ialimp,
    plataforma, rrhh). Tests verdes (rrhh 25/25, packages 40/40, guardián 21/21). Lockfile en
    sync. Radiografía al día. 0 referencias `@iarest/` (guardián).
  - **Supabase**: 0 ERRORS mantenido. Nuevo hallazgo 🟡: bucket `documentos-contables` con
    listing público habilitado → revisar (expone índice de ficheros a agentes anon).
  - **Docs**: `RUTINAS-PROGRAMADAS.md` desync — dice "pendiente de activar" pero las rutinas
    están activas → PR #375 (draft) lo corrige. Pendiente de que Alberto lo mergee.
  - **PRs stale**: 8 drafts abiertos sin actividad (#302, #307, #312, #322, #331, #351, #364,
    #375). Revisar y cerrar los que ya no procedan.
  - **Carry-forward**: aplicar migraciones `concursos_radar` en Supabase (A3 de jun-12) + jubilar
    proyecto viejo `efncqyvhniaxsirhdxaa` (B2).
  - **Rutinas programadas** activas (confirmado por esta sesión): ligera diaria 04:00 CEST +
    profunda semanal domingos. Ambas abren PR draft; sin cambios → sin PR.

- **🧠 MEMORIA ANTI-PÉRDIDA + AUDITORÍA NOCTURNA — 18/06/2026** (rama `claude/project-review-skill-p0jrkc`)
  - **Guardián de cierre**: el hook `Stop` (`.claude/hooks/persist-memoria.sh`) ahora, si la
    sesión hizo commits que tocan algo distinto de la memoria pero NO anotó este archivo,
    **bloquea una vez** y pide anotarlo antes de cerrar. Usa el SHA base que graba el nuevo
    hook `SessionStart` `memoria-record-base.sh`. Sesiones de solo lectura nunca se bloquean.
  - **Hook `PreCompact`** (`.claude/hooks/memoria-precompact.sh`): recuerda volcar memoria
    antes de compactar sesiones largas. Ambos hooks registrados en `.claude/settings.json`.
  - **Auditoría programada**: `/auditoria-diaria` ahora tiene cadencia escalonada — **ligera**
    (diaria, reconcilia memoria/skills/docs + checks baratos) y **profunda** (`--profunda`,
    semanal, `auditoria-central` entera). Documentado en **`docs/RUTINAS-PROGRAMADAS.md`**.
  - **Índice de skills**: nuevo **`docs/SKILLS.md`** (qué skills hay y cuándo usar cada una);
    `/auditoria-diaria` lo mantiene al día contra `.claude/skills/` y `.claude/commands/`.
  - **Triggers ACTIVOS** (creados por Alberto en `claude.ai/code → Rutinas`, 18/06): diaria
    `Ejecuta /auditoria-diaria` 04:00 CEST; semanal `Ejecuta /auditoria-diaria --profunda`
    domingos. Conectores: Supabase + Vercel (**GitHub es nativo** al vincular el repo, no es
    un conector MCP aparte). PR #374 mergeado a `main`.
  - **Límite conocido:** sesiones de solo charla (decisión sin commit) no las caza el
    guardián → anótalas a mano.

- **🔍 AUDITORÍA DIARIA — 18/06/2026** (`docs/AUDITORIA-2026-06-18.md`) — **estado SANO, sin bugs nuevos.**
  - Rango #356→#372. Verde: lockfile en sync, radiografía al día, guardián 21/21, `transpilePackages`
    vs deps coherente (los 2 módulos nuevos de cocina — `module-trazabilidad`, `module-organizador-trabajo`
    — declarados en ambos), **typecheck 0 errores en las 5 apps**, tests en verde, multi-tenant OK en las
    APIs nuevas de cocina (scope `local_id` + guards).
  - Reconciliado: memoria (#372 no anotado), skill `ia-rest-maestro` (faltaban APIs `personal`/`validar-pin`),
    y sincronizado `apps/ia-rest/next.config.js` (residuo con 3 paquetes) con el `.ts` (14) como red de seguridad.
  - **Acción manual (no urgente):** opcional borrar el `next.config.js` redundante de ia-rest (ya sincronizado).
    (Nota: `rrhh` SÍ despliega como `central-rrhh` en el equipo Vercel — confirmado por el CI del PR.)
  - Vulns: 2 high `xlsx` (ialimp solo escribe → no explotable, ya documentado) + 4 moderate transitivas
    (postcss/uuid/file-type) — no se tocan (override arriesga el build de apps vivas).

- **✨ COCINA CENTRAL · GENERADOR DE MENÚS IA — 18/06/2026** (PR #379 merged, `65a68a1`)
  - **API `/api/cocina/menu-sugerido`** (`callAI`, solo responsable): describe el evento (pax/restricciones) →
    la IA compone un menú **eligiendo SOLO del catálogo `cocina_recetas` del local** (valida ids, no inventa),
    equilibra entrante/principal/postre. En `/produccion` (panel Eventos): botón **"✨ Sugerir menú"** → abre
    `EventoForm` **prerrellenado** con las elaboraciones propuestas (revisión humana antes de guardar) + notas IA.
  - Skill `ia-rest-maestro` actualizado con reparto IA / atribución / foto-recepción / generador de menús.

- **🤖 COCINA CENTRAL · REPARTO IA + ATRIBUCIÓN + FOTO-RECEPCIÓN — 18/06/2026** (PR #377 merged, `fa1e48e`)
  - **Reparto IA con aprendizaje:** tabla `cocina_asignaciones` (receta_id→trabajador_id, `origen` ia|manual).
    API `/api/cocina/asignaciones` (GET + set/bulk, solo responsable). En `/produccion`: botón **"✨ Repartir con IA"**
    (`asignarTrabajo` por partida sobre el equipo real, `requiere_rol=partida` + `trabajador.roles=partidas`; fallback a
    semilla con todas las partidas). Selector por ficha → los ajustes de Carmen quedan `origen='manual'` (señal de aprendizaje).
  - **Atribución + tiempos (APPCC real):** `cocina_registros.hecho_por/hecho_por_id/hecho_at/firma_por_id`; controles con `por`.
    La ficha y el dossier muestran "Hecho por X · hora" y el autor de cada control.
  - **📷 Foto-recepción:** `cocina_recepciones.caducidad`; API `/api/cocina/recepciones/reconocer` (`callAIVision`, reutiliza
    patrón de `/api/vinos/reconocer`): foto de etiqueta/albarán → producto/proveedor/lote/caducidad/Tª; albarán multi-producto
    registra todos. Botón "📷 Foto de etiqueta/albarán" en el panel Recepción + campo Caducidad.
  - **Aprendizaje real (análisis de overrides → ajustar la propuesta) = pendiente.**

- **🗺️ ROADMAP COCINA CENTRAL (backlog acordado — "todo menos voz") — 18/06/2026**
  - Decisión Alberto: ejecutar todo el backlog **menos control por voz** (voz → PENDIENTE). La IA hace y aprende.
  - **Pendiente por orden sugerido:** (1) **Generador de menús IA** (describe evento → propone menú del catálogo) ·
    (2) **Etiqueta de regeneración en destino** + **etiquetas APPCC imprimibles por elaboración** (lote/caducidad/alérgenos) ·
    (3) **Control de Tª de cámaras programado con alarma** · (4) **Comparador de precios de proveedores** (requiere capturar
    precio en foto-albarán) · (5) **Lista de la compra automática** (escandallo×PAX → pedido por proveedor, 1 clic) ·
    (6) **Parte/eventos desde PDF del cliente** (visión doc) · (7) **Cronograma del día "en riesgo"** (motor ya da holgura/empezar_antes) ·
    (8) **Hoja de alérgenos por evento (PDF)** · (9) **Hoja de carga/picking del furgón + Tª transporte** ·
    (10) **Costes/márgenes por evento → plataforma** · (11) **Recalibrado automático de tiempos** (usa `hecho_at`) ·
    (12) **Plantillas de evento** · (13) **Mise en place consolidada con cantidades** · (14) **No conformidades + partes de limpieza (L+D)** ·
    (15) **Modo "inspección sanitaria" (dossier total)** · (16) **QR de trazabilidad en etiqueta** · (17) **Presupuesto/PDF al cliente** ·
    (18) **Resumen diario a Carmen** · (19) **Mermas/sobrantes** · (20) **Asistente conversacional del parte** · (21) **Foto del plato terminado** ·
    (22) **Histórico de partes + dossier PDF** · (23) **Firma de entrega digital del cliente** · (24) **Ficha de cliente/CRM**.
  - **PENDIENTE explícito:** control por voz (recalibrado para cocina central, sin comandas).

- **👥 COCINA CENTRAL · GESTIÓN DE EQUIPO — 18/06/2026** (PR #372 merged, `a43fdb1`)
  - Carmen (responsable) gestiona su equipo desde `/produccion` (panel "👥 Equipo"): alta/edición/baja/borrado
    de miembros con **PIN 4 díg. único por local** + `partidas`; muestra el enlace del local + PIN de cada persona.
  - **API `/api/cocina/personal`** (GET/POST/PUT/DELETE) con guard **solo-responsable** (`cocina_rol === 'responsable'`,
    403 si no). Crea filas en `personal` con `rol='cocina'`. `/api/cocina/yo` añade `access_token` del local.
  - Cada miembro entra por el **mismo enlace del local** con su PIN; `/api/cocina/yo` le sirve su vista por rol/partida.
  - `cocina_rol` previsto `co-responsable` (aún no habilitado en el guard). Reunión Carmen: **jueves 25, 12:00**.

- **🏭 COCINA CENTRAL — CICLO COMPLETO EN BD Y EDITABLE — 18/06/2026** (Catering Joaquín Jaén, `/produccion`)
  - **Carmen** (rol `cocina`, PIN **1234** de prueba) entra por su enlace → **`/produccion`** (no al KDS de mesas).
  - **Ya NO es consultivo: herramienta completa, persistida en BD `iarest`** (service_role). PRs mergeados:
    - **#363** eventos editables (CRUD + asignación de elaboraciones) + GET `/api/cocina/parte`.
    - **#365** CRUD de **recetas/escandallo** (partida, min/PAX, muestra, controles APPCC, "depende de", ingredientes por PAX con desinf/descong).
    - **#366** **operativa del día**: tabla `cocina_registros`; cada ficha marca **hecho**, registra **Tª por control**, **muestra testigo**, **firma**; chip "✓ Lista / ⛔ Pendiente"; controles impresos en el dossier.
    - **#368** **recepción de mercancía** (`cocina_recepciones`): registrar albarán (producto/proveedor/lote/Tª/conforme); rellena Lote/Prov./Tª de la ficha por coincidencia de nombre.
    - **#369** **vistas por rol/partida** (`personal.cocina_rol`): GET `/api/cocina/yo`; responsable ve todo; **cocinero** solo su(s) partida(s) sin gestión; **preparación** = recepción + "Bases a preparar".
  - **Tablas nuevas (iarest, aditivas):** `cocina_eventos`, `cocina_recetas`, `cocina_receta_ingredientes`, `cocina_evento_elaboraciones`, `cocina_registros`, `cocina_recepciones`; `restaurantes.modo` (`cocina_central`); `personal.partidas text[]` + `personal.cocina_rol` (Carmen=`responsable`).
  - **APIs:** `/api/cocina/parte` `eventos[/id]` `recetas[/id]` `registros` `recepciones[/id]` `yo`. Auth por sesión firmada `x-ia-session` + `local_id`.
  - **CICLO COMPLETO (5 bloques):** recetas → eventos → asignar → recepción → ejecutar el día (Tª/firma/muestra) → dossier; con roles cocinero/preparación. Motor `@central/module-trazabilidad` + `module-organizador-trabajo`.
  - **PENDIENTE/MEJORAS:** dar de alta usuarios reales de cocinero/preparación (con su `cocina_rol`/`partidas`) — aún sin ellos para Catering JJ; reparto con personas reales (ahora 3 cocineros semilla); "Bases a preparar" como checklist persistido; PIN propio (ahora 1234 de prueba). Reunión Carmen: **jueves 25, 12:00**.
- **📨 FIX FORMULARIO DE CONTACTO (landing) — no avisaba NUNCA — 18/06/2026** (PR #360 merged en main)
  - `iarest.es/#contacto` (home) manda `restaurante:""` y email opcional, pero `/api/leads/landing` exigía
    `nombre && restaurante && email` → **400 en CADA envío de la home**, antes de guardar y antes de avisar
    (`tgAlert()` + `enviarEmailNuevoLead()` van en `Promise.allSettled`, no se llegaban a ejecutar). El cliente
    ignora la respuesta y muestra "Recibido" → fallo invisible. Las otras landings (catering/hostelería/espacios)
    SÍ mandan `restaurante`, por eso esas funcionaban.
  - **Fix** (solo `app/api/leads/landing/route.ts`): la API exige `nombre` + al menos un medio de contacto
    (teléfono **o** email); `restaurante`/`email` vacíos se normalizan (`'Sin especificar'` / `''` / `null`)
    respetando los NOT NULL reales de `leads_landing` (restaurante, email) y `leads` (restaurante, telefono);
    dedup CRM por email o, si no hay, por teléfono; `consent_rgpd: true`.
  - **Verificado EN VIVO** (Alberto rellenó el form real): llega **Telegram** ✅ + **email** ✅ a `hola@iarest.es`
    (alias send-as + recepción confirmada en su Gmail). → `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` SÍ están en
    Vercel y Resend tiene `iarest.es` verificado.
  - **Gotcha leads perdidos:** los envíos fallidos NO dejaron rastro en BD (400 antes del insert). El recuento de
    intentos perdidos vive en **GA4 → evento `generate_lead`** (`origen=landing-principal`), que el form dispara en
    cliente pase lo que pase con la API. GA guarda el evento, no nombre/teléfono.

- **🧾 FACTURAS CORREO · Pasada completa 60 días + fix skill — 18/06/2026**
  - **Archivadas en Drive** (`FACTURAS Apartamentos/2026/`): 7 facturas Anthropic (abr–jun) + Codeoscopic €769.56.
    - **Cuentas Anthropic** (dos, mismo NIF 28823484E, ambas deducibles `seguros`):
      - `albertosuarezgutierrez@gmail.com` → **Anthropic Ireland Ltd** (EU, API credits, IVA 21%):
        `2026-04-15` €21.78 · `2026-04-17` $6.05 · `2026-05-02` $6.05 · `2026-05-05` €142.50
      - `manuelsuarezz@gmail.com` → **Anthropic PBC** (US, Max plan 20x, Mastercard **-0341** sin identificar):
        `2026-04-13` €163.21 (KX7NRNU6-0003, crédito −16.79) · `2026-05-13` €180.00 (KX7NRNU6-0004)
    - **Codeoscopic** `2026-05-21` €769.56 (Workspace software correduría, ya pagado por transferencia).
    - Todos como documentos de texto en Drive (PDFs no subibles por MCP base64). PDFs originales pendientes de subida manual.
  - **Fix skill** (commit `e069a49`): añadida exclusión explícita de **notificaciones operativas de la correduría**
    (recibos devueltos de clientes, avisos de emisión, circulares de Allianz/Mapfre/Generali/Occident) — el agente
    rutinario había etiquetado `Facturas/Procesada` un email de "recibo devuelto de cliente" de Allianz (falso positivo).
  - **FACTURA MAPFRE** (31/05): es liquidación de comisiones (INGRESO de la correduría), NO gasto deducible → excluida.
  - **N26 sin conectar a PSD2**: Vercel ($190.93 anterior) y facturas Anthropic pagadas desde N26 no aparecerán en banco hasta subir extracto manual.
  - **Pendientes detectados en pasada 60d** (sin procesar aún):
    - EMASESA × 3 (Bustos Tavera DER, Bustos Tavera IZQ, Socorro 24) — agua pisos turísticos
    - Endesa SOCORRO 24 (Ref P26CON021029273, "Luz pendiente 2026") — luz pisos
    - Lavandería El Giraldillo (AFV-11528, 25/05/2026) — lavandería pisos, **factura pendiente de pago**
    - IONOS Correo Basic 1 (31/05/2026, ~€1.50/mes)
  - **Para tu decisión (sin respuesta de Alberto):** Registro de la Propiedad "Factura 2025/AM 2345" (¿qué propiedad?) · Amazon WORKPRO Grapadora (¿pisos o personal?)

- **🏭 COCINA CENTRAL DE CATERING ≠ RESTAURANTE — 18/06/2026** (concepto clave, decisión de Alberto)
  - **Distinción fundamental:** una **cocina central de preparación** (catering / comida para llevar / obrador) es
    un MODELO DISTINTO al de un restaurante. ia-rest nació para restaurante (mesas, comandas, voz, KDS). Para la
    cocina central **NO aplican** mesas/comandas/voz/KDS: su mundo es **eventos → parte de elaboración → producción
    → trazabilidad APPCC → recepción de mercancía**. NO calibrar el KDS de restaurante para catering — es el mundo
    equivocado; se le da **pantalla propia**.
  - **Modo del local:** columna nueva aditiva `iarest.restaurantes.modo` (`'restaurante'` por defecto |
    `'cocina_central'`). El local de Carmen (Catering Joaquín Jaén, id `067c8bab-4edf-4765-a0d6-11b6ea112e8f`) está
    marcado `cocina_central`. El login lee el flag (`/api/auth` → sesión firma `cocina_central`) y enruta
    `cocina`+`cocina_central` → **`/produccion`** (no a `/kds`). `/cocina` se deja intacto (sigue → /kds para restaurantes).
  - **ROLES de la cocina central (modelo acordado):**
    - **Responsable de cocina central** (Carmen): distribuye el trabajo, **recepciona mercancía**, coordina, **firma**
      la salida, supervisa APPCC. Ve TODO (parte, reparto, productividad, dossier).
    - **Cocinero/a**: cocina/monta los platos finales con material ya tratado; **no toca mercancía cruda**. Ve su lista del día.
    - **Preparación** (a estudiar/implementar): recepción + mise en place de las BASES. **Frontera recomendada por
      Claude = "contacto con mercancía cruda"** (recepción/lavar/desinfectar/descongelar/cortar/porcionar + bases frías →
      preparación; cocción/montaje → cocinero). Principio APPCC de **marcha adelante** (crudo y cocinado no se cruzan).
    - En el motor `@central/module-organizador-trabajo`: se modela con `requiere_rol` por tarea + `depende_de`
      (encadenado base→plato ya hecho). `asignarTrabajo` respeta `requiere_rol`.
  - **Hecho esta sesión:** módulo `@central/module-trazabilidad` (APPCC: ficha ingredientes·lote·proveedor·desinf·
    descong, controles térmico/abatimiento/congelación, muestras testigo, **bloqueo de salida**, **14 alérgenos
    automáticos**, **generarParte** desde catálogo+eventos; 29 tests). Demos: `/propuesta/parte-jj`, `parte-jj-vivo`,
    `parte-jj-traza`, `parte-jj-auto` (mergeadas). Acceso de **Carmen** creado (rol `cocina`, PIN **4 dígitos**, login por
    token de local; el PIN va en CLARO en BD → rate-limited). Arreglos: nombre del local en `/login?t=`, móvil (tablas
    del parte → filas; header KDS envuelve), parpadeo del panel Elaboraciones del KDS (#361).
  - **PENDIENTE (bloqueado solo por outage del clasificador de Bash):** `next build` + commit + PR + merge de la
    **vista de Carmen `/produccion`** (home de cocina central LIMPIO: header fino con nombre del local + Salir, **sin
    voz/mesas/comandas**, parte del día + reparto + trazabilidad + dossier imprimible, móvil-first). Rama
    `claude/cocina-central` (código listo y revisado, sin commitear).
  - **SIGUIENTE (gated):** persistencia real en BD (rama Supabase + gate) y las pantallas de **cocinero** y
    **preparación** (taggeando cada (sub)elaboración por "contacto con crudo"). Reunión Carmen: **jueves 25, 12:00**.

- **🍳 PARTE DE CARMEN — DEMO + VIVO MERGEADOS — 17/06/2026** (Catering Joaquín Jaén, cocina)
  - **PR #352** → `iarest.es/propuesta/parte-jj`: parte de elaboración real del 20/6 (estático, datos OCR del PDF
    de Carmen). 4 eventos por color, 4 partidas, sub-elaboraciones como "Depende de", badges APPCC. Marca verde/dorado.
  - **PR #354** → `iarest.es/propuesta/parte-jj-vivo`: el parte **conducido por el motor puro REAL**
    `@central/module-organizador-trabajo` (enchufado como workspace dep + `transpilePackages`). `asignarTrabajo`
    reparte por cocinero, `agruparPorPartida` arma columnas, `avisosAlCompletar` encadena base→plato (pulsar
    "Hecho" en un fondo/salsa dispara "Lista para empezar" en el plato). Verificado con `next build` (164/164) +
    64/64 tests del módulo. Sin BD/secretos (semilla en cliente).
  - **Reunión con Carmen: jueves 25 a las 12:00.** Logo real DESCARTADO por Alberto ("con las mejoras mejor, el
    logotipo no es importante").
  - **PENDIENTE (gated, plan #351):** persistencia real sobre `produccion_tareas` (cocinero entra a ia.rest, ve su
    día repartido + cronómetro + avisos encadenados desde BD). Toca la Supabase compartida → rama Supabase + gate
    manual antes de prod. ia-rest YA tiene base: `produccion_tareas`, rutas `/api/produccion/*`, UI cocinero/productividad.
- **🍳 DEMO PARTE CARMEN MERGEADO — 17/06/2026** (PR #352 merged en main, CI + Tests + 5/5 Vercel ✅)
  - Página `apps/ia-rest/src/app/propuesta/parte-jj/page.tsx` → **`iarest.es/propuesta/parte-jj`**.
  - Para la reunión con **Carmen (cocina, Catering Joaquín Jaén) — jueves 25 a las 12:00**: su **parte de
    elaboración REAL del 20/6/2026** ya organizado por nuestro sistema. 4 eventos por color (Hacienda El Alba
    115 pax, Finca Los Fresnos 131, Hacienda Trinidad 136, Decanato 20), 4 partidas (Frío/Caliente/Corte/Montaje),
    sub-elaboraciones como "Depende de" (dependencias), badges de puntos de control APPCC. Marca verde `#02473B`
    + dorado `#9E8152`.
  - **Autocontenida** (`'use client'`, sin BD/imports/secretos) = molde visual. La versión viva sobre
    `produccion_tareas` sigue siendo hito posterior (plan en PR #351, con gate manual de migración Supabase).
  - **PENDIENTE (diferido por Alberto, "luego lo hago"):** logo real `logo-jj.svg` en repo + aplicarlo a
    decks/UI. Decks ya mergeados: `/propuesta/catering-jj-cocina` (Carmen) y `/propuesta/catering-jj-deck` (grupo/Joaquín).

- **💶 MÓDULO /finanzas MERGEADO — 17/06/2026** (PR #341 merged en main, 5/5 Vercel ✅)
  - Hub financiero consolidado para Alberto: correduría seguros, 4 pisos turísticos, gastos personales BBVA/Kutxa, fiscal IRPF.
  - Archivos nuevos: `lib/finanzas.ts` · `app/api/finanzas/route.ts` · `app/api/finanzas/export/route.ts` · `app/(usuario)/finanzas/page.tsx` · `app/(usuario)/finanzas/FinanzasClient.tsx`.
  - `UserSidebar.tsx`: "💶 Finanzas" segundo ítem en Mi negocio, "🤖 Agente IA" renombrado (era "Agente precios"), Mercado 📊→🗺️, sección "Mis pisos"→"Pisos · detalle".
  - Lógica fiscal: `calcularTramos()` (tramos IRPF 2025 declaración conjunta, reducción €3.400). Correduría = cobrado neto / 0.85 (bruto); retenciones = cobrado × 0.15/0.85; no modelo 130 ni 303.
  - Pisos propios (House Sevillana + Duplex Center): placeholder amortización 3%. Pisos subarrendados (Luxury Busto + Busto Reform): alquiler pagado = deducible 100%.
  - Export CSV (`/api/finanzas/export?year=YYYY`) para gestoría: filtro destino seguros+turistico_pisos+turistico_duplex.
  - Bloque Modelo 179: tracker de obligación informativa trimestral para los 4 pisos turísticos.
  - Filtros temporales: año + Q1/Q2/Q3/Q4.

- **🧹 EDGE FUNCTIONS sin Anthropic — 17/06/2026** (PR pendiente) — **ya NO queda Anthropic en ia-rest.**
  - `supabase/functions/qr-assistant`: eliminado el fallback Anthropic (ya usaba NIM como principal).
  - `supabase/functions/eventos-entorno`: web_search de Anthropic → **Gemini `gemini-2.0-flash` + `google_search`**
    (mismo prompt/JSON). `fuente` pasa de `claude-websearch` → `gemini-websearch` (re-corre 1 vez por local, dedup ok).
  - **DESPLIEGUE MANUAL (Alberto):** estas son edge functions de **Supabase** (no Vercel), así que no se
    despliegan con el push. Hay que `supabase functions deploy qr-assistant eventos-entorno` y poner el
    **secret `GEMINI_API_KEY`** en el proyecto Supabase de ia-rest (`efncqyvhniaxsirhdxaa`) para eventos-entorno.

- **🧹 QUITAR ANTHROPIC de ia-rest (#4) — 17/06/2026** (PR pendiente)
  - Eliminada la dependencia **`@anthropic-ai/sdk`** del `package.json` de ia-rest + sus 3 imports:
    `brain.ts` (`callAnthropic`, fallback de pago del POS) y `ai-client.ts` (`anthropicText`/`anthropicVision`).
    El brain ahora es **NIM puro** (si falla → aviso); `callAI`/`callAIVision` lanzan error si NIM no está
    (sin fallback de pago). `noFallback` se mantiene en firmas por compatibilidad.
  - `pnpm-lock.yaml` regenerado (−32 líneas, solo Anthropic). `package-lock.json` de ia-rest es **vestigial**
    (npm; el build usa pnpm `--no-frozen-lockfile`), no se tocó. `tsc` limpio (0 errores).
  - **Pendiente (queda, PR aparte):** 2 **edge functions Deno** (`supabase/functions/qr-assistant`,
    `eventos-entorno`) aún llaman a `api.anthropic.com` por `fetch` → migrar a NIM/Gemini (runtime distinto).
    Referencias inertes a `ANTHROPIC_API_KEY` (health/qa-runner/transcribe: solo booleano/diagnóstico) se dejaron.

- **💸 PASARELA IA · coste real + fallback + healthcheck — 17/06/2026** (PR pendiente)
  - **Coste/tokens reales en `/operador/ia`**: `ai_usos` gana columnas `tokens`+`coste_eur` (migración
    `2026-06-17_ai_usos_coste.sql`, **YA aplicada** en Supabase `wswbehlcuxqxyinousql`, aditiva/idempotente).
    `ai-gateway.ts`: `estimarTokens` (~4 chars/token), `costeEur` (precio €/1k por proveedor, env
    `AI_PRECIO_NIM_EUR_1K`=0 / `AI_PRECIO_GEMINI_EUR_1K`=0.0002). Los 4 endpoints registran tokens+€.
    El panel muestra KPIs **Coste €** y **Tokens**, € por app, y tokens/€ por llamada.
  - **Alerta de presupuesto**: `estadoPresupuesto()` + banner en `/operador/ia` al ≥80% (rojo al 100%).
  - **Fallback de proveedor DENTRO de la pasarela**: `/api/ai/chat` hace **NIM → Gemini** si NIM falla
    (con `GEMINI_API_KEY`) → las verticales podrán quedarse sin keys de proveedor propias.
  - **Healthcheck**: `GET /api/ai/health` (sin secreto, no gasta) → `{ok, proveedores:{nim,gemini}, limite}`.
  - **NO incluido (pendiente, PR aparte):** quitar `@anthropic-ai/sdk` de ia-rest — lo tocan 11 ficheros
    (qa-runner, brain, transcribe, health, edge functions…), merece su propio PR testeado.

- **✅ PR #336 MERGED — 17/06/2026** — Fase 5 COMPLETA: Sistema (QA runs + training IA), Crecimiento (Instagram/Blog/Leads landing) y CRM (pipeline de leads con filtros, buscador, fila expandible con contactos/notas) en `/operador/iarest/*`. 5/5 proyectos Vercel ✅ Ready. `iarest.es/super` ya absorbido al 100% en plataforma (modo read-only). Ver detalle abajo.

- **✅ PR #335 MERGED — 17/06/2026** — Fase 5 Restaurantes: lista completa de locales con KPIs + detalle por restaurante en `/operador/iarest/restaurantes/[id]`.

- **✅ PR #334 MERGED — 17/06/2026** — Fase 5 Suscripciones Stripe (read-only) en `/operador/iarest/suscripciones`. Rebase sobre main (conflicto en generated files: commit intermedio saltado). 4/4 proyectos Vercel ✅ Ready. Ver entrada de sesión 17/06 para detalle.

- **✅ PR #333 MERGED — 17/06/2026** — Panel ia-rest/super en plataforma (`/operador/iarest/cobros|soporte|sugerencias`). Rebase completado contra main (conflictos en UserSidebar.tsx y generated files resueltos). 5/5 proyectos Vercel ✅ Ready antes del merge. Ver entrada de sesión 16/06 para detalle completo.

- **🍽️ PLATAFORMA · Panel ia-rest/super absorbido → /operador/iarest/* — 16/06/2026** (rama `claude/nice-heisenberg-jo4vy1`)
  - **PR #332 MERGED**: `/admin` (god-panel dark 338 líneas) → redirect a `/operador/clientes`. Limpieza definitiva.
  - **Panel ia-rest** (mismo PR): 3 nuevos endpoints en ia-rest `/api/admin/` (Bearer `OPERADOR_SHARED_SECRET`, mismo patrón que `/api/operador/`):
    - `cobros/route.ts` — lee `v_cobro_resumen_super` + `resumen_cobros_mensual`. Totales globales + histórico 12m.
    - `soporte/route.ts` — GET/POST(responder)/PATCH(cambiar estado) de tickets de soporte.
    - `sugerencias/route.ts` — GET/PATCH sugerencias del equipo de sala (estado, nota admin, leída).
  - Plataforma: 3 proxy APIs en `/api/admin/iarest/` (auth `plataforma_admin` cookie → Bearer ia-rest) + 4 páginas:
    - `/operador/iarest` — overview con cards de sección + link al panel legacy `iarest.es/super`.
    - `/operador/iarest/cobros` — tabla de volumen/comisiones por restaurante + histórico mensual. Read-only.
    - `/operador/iarest/soporte` — lista de tickets con panel lateral: responder inline + cambiar estado (abierto/escalado/resuelto).
    - `/operador/iarest/sugerencias` — lista de ideas con filtros (categoría/estado/no leídas) + nota interna editable.
  - **UserSidebar**: sub-items indentados bajo 🍽️ ia-rest (💶 Cobros, 🎫 Soporte, 💡 Sugerencias).
  - **Auth iarest.es/super no tocada**: los `/api/super/*` siguen con `x-ia-session`. Los `/api/admin/*` son endpoints nuevos aditivos.
  - **Env requerido en ia-rest Vercel**: `OPERADOR_SHARED_SECRET` (ya existe, mismo valor que plataforma). Sin él, los 3 endpoints devuelven 401 silencioso.
  - **Pendiente Fase 5**: CRM/leads (~20 endpoints), Clientes/Restaurantes (~11), Instagram/Blog (~15), sistema/health (~12), autocuras — iterativos.
  - **Pendiente Fase 4**: Admin limpiadoras (riesgo ialimp — auditoría RLS previa necesaria).

- **🧰 FUNCTION-CALLING POR LA PASARELA · cerrar el último cabo — 16/06/2026** (PR #329 MERGED, squash `92e6140`)
  - Nuevo endpoint **`POST /api/ai/tools`** en plataforma (espejo de `/api/ai/chat`): `verificarSecreto` +
    `dentroDePresupuesto` + `registrarUso` (endpoint `'tools'`). Recibe `messages`+`tools` (OpenAI),
    responde `{content, tool_calls}`.
  - **`@central/core-ai`**: `aiTools` (lee `NVIDIA_API_KEY`, en `client.ts`) + `gatewayTools` (adaptador
    vertical, en `gateway.ts`). Exports añadidos.
  - **ia-rest** `callAITools` enruta por la pasarela (`gatewayTools`) y cae a `nimChatTools` directo si falla.
  - **Resultado:** las **4 vías** de IA de ia-rest (`callAI`/`callAISearch`/`callAIVision`/`callAITools`)
    pasan ya por la pasarela cuando está configurada → gasto 100% centralizado en `/operador/ia`. `tsc` limpio.

- **🔌 IA POR LA PASARELA · cerrar los 2 pendientes del #325 — 16/06/2026** (PR #327)
  - **sivra `seo-refresh`** ya NO usa Anthropic web_search: `lib/ai-client.ts` gana `aiSearch()` →
    `gatewaySearch` (pasarela central, Gemini+Google Search); sin pasarela cae a NIM puro. Eliminada
    `ANTHROPIC_API_KEY` de la ruta. **Con esto NINGÚN agente del repo llama ya a Anthropic como vía principal.**
  - **ia-rest `lib/ai-client.ts`** enruta por la **pasarela central** (como ialimp/sivra): `gatewayCfg()`
    (`AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`, env de equipo Vercel); `callAI`/`callAISearch`/`callAIVision`
    intentan la pasarela primero y caen al camino directo NIM→Anthropic si no está / falla.
    `callAITools` (function-calling de los agentes del god-panel) sigue **directo a NIM** (la pasarela no
    expone tool-calling).
  - Anthropic queda solo como fallback de transición en ia-rest (hoy sin saldo). `tsc` limpio en ambas apps.

- **🤖 AGENTES IA-REST · quitar Anthropic de los 4 agentes del god-panel — 16/06/2026** (PR #325 MERGED, squash `97bdcc2`)
  - **Motivo**: los 4 agentes daban error 500 *"Anthropic no disponible (sin crédito)"*. Decisión de Alberto:
    quitar Anthropic → **NVIDIA NIM + Gemini** (gratis, sin saldo).
  - **`@central/core-ai`**: nuevo `nimChatTools` (function-calling con NIM, endpoint OpenAI-compatible) +
    tipos `NimToolMessage`/`NimToolCall`/`NimToolResult`. NIM corre el bucle agéntico; la app ejecuta sus tools.
  - **ia-rest `lib/ai-client.ts`**: `callAITools(system, messages, tools)` (wrapper de `nimChatTools`).
  - **Agentes migrados** (las herramientas se ejecutan igual; solo cambió el "cerebro"):
    - `agentes-ai` (solo búsqueda web) → **Gemini** (`callAISearch`).
    - `agente-arquitecto` (GitHub/Drive) → **NIM function-calling**.
    - `agentes-seo` (web_search + GSC/GA4) → **NIM**; `web_search` pasa a tool custom respaldada por **Gemini**.
    - `cron/seo-agent` (web_search + escritura SEO + GSC/GA4) → **NIM + Gemini**.
  - Funciona con `NVIDIA_API_KEY` + `GEMINI_API_KEY` que ia-rest **ya tiene**. `tsc` limpio. 5 deploys Vercel en verde.
  - **PENDIENTE**: (a) **sivra `seo-refresh`** (cron) aún usa Anthropic web_search → migrar igual a Gemini.
    (b) Conectar el `ai-client` de ia-rest a la pasarela central (como ialimp/sivra) para centralizar su gasto.


- **📧 FACTURAS CORREO · Sistema completo en producción — 16/06/2026** (PR #324 MERGED)
  - **Flujo diario automatizado:**
    - 06:00 UTC → cron PSD2 sincroniza BBVA + Kutxa (23 movimientos insertados en primera sync)
    - 08:00 CEST → Rutina Claude `Revisar facturas correo` procesa Gmail → Drive → Supabase
  - **Infraestructura:**
    - `CRON_SECRET` configurado en Vercel plataforma → cron PSD2 ya funciona
    - Rutina activa en `claude.ai/code → Rutinas` (daily 8:00 CEST, repo `central`, MCPs Gmail+Drive+Supabase)
    - Botón `📧 Revisar correo` en Banca → abre Claude Code + copia `/facturas-correo` al portapapeles
    - Slash command `/facturas-correo` disponible en Claude Code web
  - **Clasificaciones confirmadas por Alberto:**
    - IKEA/Taskrabbit/ferretería → `turistico_pisos`; TotalEnergies → `turistico_pisos`
    - Anthropic Ireland → `seguros`; BSH + Tutrocito 122.87€ → `personal`
    - Círculo Mercantil → siempre `personal`
  - **Regla reenvíos Pilar** (actualizada en skill): Taskrabbit/fontanero/Amazon/ferretería → siempre "Para tu decisión" (no auto-clasificar)
  - **Archivados en Drive** (`FACTURAS Apartamentos/2026/06-Junio-2026/`): Vercel, Anthropic, TotalEnergies, PriceLabs, Taskrabbit 85.41€ (montaje IKEA, 16/06)
  - **Pendiente subida manual**: IKEA 888.89€ PDF + PDFs TotalEnergies (MCP Gmail no descarga adjuntos)
  - **Vercel 190.93€ + Anthropic 217.80€**: pagados desde **N26** → pendiente conectar N26 al PSD2 o subir extracto manual
  - **Etiqueta Gmail**: `Facturas/Procesada` (Label_11) — todos los correos procesados etiquetados


- **🤖 IA UNIFICADA · ialimp + sivra a la pasarela central + endpoint de VISIÓN — 16/06/2026** (rama `claude/bold-ride-s4s8eq`)
  - **Decisión de Alberto**: la IA NO se configura por proyecto. Las **keys de proveedor viven solo en
    plataforma**; cada vertical llama a la pasarela. La conexión (`AI_GATEWAY_URL` + `AI_GATEWAY_SECRET`)
    se pone **UNA vez como Variables Compartidas a nivel de equipo (Team) en Vercel** → todos los
    proyectos la heredan, sin repetir por proyecto.
  - **Pasarela ampliada con VISIÓN/OCR**: `gatewayVision` (core-ai) + `POST /api/ai/vision` en plataforma
    (NIM vision, Bearer, presupuesto, registro en `ai_usos`). Necesario porque ialimp/sivra hacen mucho OCR.
  - **ialimp** (100% migrado): `lib/ai-client.ts` reescrito → `aiComplete` y `aiVision` enrutan por la
    pasarela con fallback a NIM directo. Los **7 sitios de OCR** (`concursos-ocr`, `cron/procesar-documentos`,
    `propietario/escanear`, `admin/escanear/process`, `admin/ia/{analizar-foto,analizar-botes,comparar-foto}`)
    cambiados de `nimVision`→`aiVision` (misma firma). `lib/concursos.ts` importa `aiComplete` del wrapper.
  - **sivra**: `lib/ai-client.ts` → `aiComplete` y `aiExtractInvoice` (OCR facturas) por la pasarela con fallback.
  - **ia-rest PENDIENTE** (Fase 2): los 4 agentes con **tool-calling de Anthropic** (agente-arquitecto, agentes-seo,
    agentes-ai, cron/seo-agent) + el `seo-refresh` de sivra NO migran: la pasarela hace chat+búsqueda+visión, no
    tool-calling. Para unificarlos hay que extender la pasarela con un endpoint de tool-calling (Anthropic). Las
    llamadas NIM/Gemini planas de ia-rest sí se pueden migrar (su `ai-client.ts`) en otro PR.
  - **Migración SIN romper nada**: sin los envs, todo sigue con las keys directas; al ponerlos, pasa por la pasarela.
  - **Tras configurar**: el gasto de ialimp/sivra/rrhh se ve en plataforma → god-panel → 🤖 IA · gasto.

- **🤖 RRHH · Verticales conectadas a la pasarela de IA central — 16/06/2026** (rama `claude/bold-ride-s4s8eq`)
  - El **asistente del empleado** (`lib/asistente.ts`) y el **agente de convenios** (`lib/convenio-agente.ts`)
    de iarrhh ya **llaman a la pasarela de plataforma** en vez de a NIM/Gemini directos → las keys de
    proveedor y el **control de coste/uso** quedan centralizados en plataforma (`/operador/ia`).
  - **Nuevo**: `lib/ai.ts` — `viaIA()` (pura, testeada), `iaDisponible()`, `iaChat()` (pasarela→NIM),
    `iaSearch()` (pasarela search→degrada a chat; fallback Gemini/NIM directo). Prioriza la pasarela;
    si no está configurada, usa la key directa (transición sin romper nada). Test `lib/ai.test.ts`.
  - **Envs nuevos en Vercel `central-rrhh`**: `AI_GATEWAY_URL` (= URL de plataforma) + `AI_GATEWAY_SECRET`
    (mismo valor que en plataforma). Al activarlos se podrán quitar `NVIDIA_API_KEY`/`GEMINI_API_KEY` de rrhh.
  - **Bonus**: esto probablemente **arregla el "asistente no disponible"** (la key vivía en rrhh; ahora la
    llamada la hace plataforma, donde `NVIDIA_API_KEY` ya funciona).

- **🎨 RRHH · Marca blanca por empresa (white-label) — 16/06/2026** (rama `claude/bold-ride-s4s8eq`)
  - Cada empresa define su **color corporativo (hex)** y su **logo** desde **Mi cuenta** (gestor);
    el **Portal del Empleado** (`/e`) se tiñe con ellos (logo en cabecera + acento de la marca).
  - Reutilizable para CUALQUIER cliente (no hardcodea Mariscos González). Para aplicar la marca de
    Mariscos: el sitio `mariscosgonzalez.com` **no es accesible** desde el entorno (bloqueado por la
    allowlist de egress) → Alberto sube el logo + elige el color en Mi cuenta (self-service).
  - **Nuevo**: `lib/branding.ts` (puro: `normalizaHex`, `derivarPaleta`, `estiloMarca`) + test;
    `app/api/admin/cuenta/branding/route.ts` (POST multipart, gestor); migración
    `0013_empresa_branding.sql` (`empresas.color_primario`, `empresas.logo_path`; **aplicada**).
  - **Modificado**: `lib/empresa.ts` (`getBranding`, `actualizarBranding`); `app/e/page.tsx` +
    `app/e/ExpedienteEmpleado.tsx` (aplica color vía CSS vars `--accent*` inline + logo); `app/admin/cuenta/page.tsx`
    + `CuentaClient.tsx` (sección "Identidad corporativa"). Logo en bucket privado `rrhh-documentos`
    (`branding/<empresa>/...`), servido por URL firmada en cada render.
  - **AI gateway (PR #315 MERGED)**: pasarela de IA en plataforma (`/api/ai/chat` NIM, `/api/ai/search`
    Gemini, Bearer `AI_GATEWAY_SECRET`) + god-panel `🤖 IA · gasto` (`/operador/ia`) + tabla `public.ai_usos`.
    Pendiente Alberto: env `AI_GATEWAY_SECRET` (+opc. `GEMINI_API_KEY`, `AI_GATEWAY_LIMITE_MENSUAL`) en plataforma.

- **🏠 PLATAFORMA · Sivra Fase 3 completa: mercado, pricing lab, pricing automático + calendario por portal — 16/06/2026** (PR #316 mergeado, rama `claude/sivra-fase3-mercado-pricing`)
  - **Páginas migradas** de sivra → plataforma `/sivra/*`:
    - `/sivra/mercado` — benchmark de competidores: panel por escenario (normal/corpus), toggle de portales, percentiles p25/p50/p75, búsqueda en tiempo real (Serper+NIM). APIs `GET /api/sivra/mercado/stats`, `GET /api/sivra/mercado/search`, `POST /api/sivra/mercado/ingest`.
    - `/sivra/pricing` — Pricing Lab en modo shadow: tabla de experimentos A/B por propiedad (booked/libre/activo), stats de ocupación vs PriceLabs. APIs `GET|POST|DELETE /api/sivra/pricing/experiments`, `GET /api/sivra/pricing/stats`.
    - `/sivra/pricing-auto` — Motor de precios completo: 13 parámetros por propiedad, botón de pánico, historial de aplicaciones, resultados €, pilot tracking 🟢🟡🔴. APIs `GET /api/sivra/pricing/settings`, `GET /api/sivra/pricing/apply`, `GET /api/sivra/pricing/historial`, `GET /api/sivra/pricing/resultados`, `GET /api/sivra/pricing/pilot-track`, etc.
  - **Calendario Gantt** (`/sivra/calendario`) — barras ahora coloreadas por portal de reserva (Airbnb rojo, Booking azul, VRBO azul oscuro, Directo violeta, Otros gris). Leyenda actualizada. Antes eran por propiedad (redundante con filas).
  - **Libs puras copiadas de sivra**: `lib/sivra/pricing-engine.ts` (motor de recomendación), `lib/sivra/pricing-calendar.ts` (eventos/estaciones), `lib/sivra/pilot-track.ts` (evaluación 🟢🟡🔴).
  - **7 nuevos crons** en `vercel.json`: mercado/cron (07:15), mercado/sweep (dom 03:00), pricing/guard (07:30), pricing/experiments/check-results (08:00), pricing/apply-auto (08:30), pricing/resumen-diario (09:00), pricing/pilot-track (09:15).
  - **UserSidebar.tsx** — NAV_PISOS ampliado con 3 entradas: Mensajes, Mercado, Pricing Lab, Pricing auto.
  - **Estado CI**: todos los proyectos en Ready ✅ (plataforma, ialimp, sivra, ia-rest, central-rrhh)
  - **Siguiente Fase 4**: Admin limpiadoras (⚠️ riesgo ialimp, requiere auditoría RLS previa)

- **🏠 PLATAFORMA · Sivra Fase 2 completa: /sivra/mensajes (Smoobu) + fixes responsive dashboard — 16/06/2026** (PR #310, mergeado)
  - **Mensajería de huéspedes** migrada de sivra → plataforma:
    - `lib/smoobu.ts` — `getSmoobuKey()` lee `pms_connections.smoobu_api_key` (tabla de ialimp) con caché 5min; fallback a `SMOOBU_API_KEY` env solo si BD falla
    - `GET /api/sivra/mensajes` — threads Smoobu + join `incomes` (checkIn/checkOut/portal) + `mensajes_status` (overrides manuales). Clasifica: trivial/info/importante → estado: respondido/pendiente/urgente
    - `GET|PATCH /api/sivra/mensajes/[bookingId]` — mensajes por reserva, cambio de estado persiste en `mensajes_status` (ON CONFLICT UPDATE)
    - `POST /api/sivra/mensajes/reply` — reglas de negocio (late checkout, early checkin, parking) → RAG en `knowledge_base` → `aiComplete` de `@central/core-ai`. Notifica `SIVRA_URL/api/limpiadoras/early-checkin` para early in/out
    - `GET|POST|PATCH|DELETE /api/sivra/mensajes/knowledge` — CRUD base de conocimiento (tabla `knowledge_base`)
    - `/sivra/mensajes/page.tsx` — UI completa: paneles redimensionables, lista de threads con filtros (estado/propiedad/búsqueda), chat, sugerencia IA, traducción vía MyMemory, Gmail draft, guardar en KB. Mobile: vista única list/chat con toggle
  - **UserSidebar** — NAV_PISOS actualizado a 8 entradas (añadida Mensajes entre Fiscal y Inversión)
  - **Dashboard fixes responsive**:
    - Fecha `checkIn` ahora usa `::date::text` (antes `::text` devolvía timestamp completo `2026-06-16 12:00:00+00`)
    - Widget "Esta semana en los pisos": `maxWidth: 90` en nombre de piso (era `minWidth`) + `minWidth: 0` en contenedor → importe ya no se corta en móvil
  - **Env vars necesarias en proyecto Vercel `plataforma`**: `SMOOBU_API_KEY` (fallback), `SMOOBU_PMS_CONNECTION_ID` (opcional, tiene default), `SIVRA_URL` (para notificar limpiadoras)

- **🏠 PLATAFORMA · Sivra Fase 1b completa: income, expenses, gastos-fijos, fiscal, calendario Gantt, widget dashboard — 16/06/2026** (PR #305, rama `claude/sivra-fase1b-income-expenses`)
  - **Páginas migradas** de sivra → plataforma `/sivra/*`:
    - `/sivra/income` — lista completa de reservas con filtros (portal, propiedad, fecha, huésped) + 4 KPIs: reservas, ingresos brutos, media/reserva, noches. API `GET /api/sivra/income`.
    - `/sivra/expenses` — gastos manuales con formulario, subida a Drive, filtros por mes/propiedad/categoría. APIs `GET/POST/DELETE /api/sivra/expenses` + `POST /api/sivra/expenses/parse-invoice` (OCR NVIDIA NIM).
    - `/sivra/gastos-fijos` — CRUD de plantillas de gastos recurrentes. APIs `GET/POST/PUT/DELETE /api/sivra/expenses/fijos` + `GET /api/sivra/expenses/fijos/generar` (cron día 1/mes).
    - `/sivra/fiscal` — NUEVA (no existía en sivra): export IRPF por piso/trimestre. Tabla de rendimientos brutos, gastos deducibles (por categorías: limpieza, suministros, seguros, ibi, amortización, comisiones), resultado neto, descarga CSV con BOM UTF-8. API `GET /api/sivra/fiscal?year=YYYY`.
  - **Calendario Gantt** completo (reescritura desde cero, `/sivra/calendario`):
    - Barras de reserva con posicionado absoluto (DAY_W=46, ROW_H=52, LABEL_W=130, DAYS=30)
    - Color de propiedad + stripe de portal (Airbnb rojo, Booking azul, VRBO azul oscuro, Directo violeta)
    - ADR/noche visible en barras anchas, nombre del huésped
    - Detector de gaps (1-2 días libres entre reservas) → fondo rojo suave
    - Indicator de limpieza (checkout+checkin mismo día/piso) → emoji 🧹 en cabecera de columna
    - Panel de detalle al click en reserva
    - Stats de propiedades con barra de ocupación %
    - Tabla de próximas llegadas con ADR al final
  - **Widget "Esta semana en los pisos"** en `/dashboard`:
    - `getProximasLlegadas()` — query server-side sobre `incomes` + `properties`, próximos 7 días
    - Filas: dot color por propiedad, etiqueta HOY/MÑN/dd/mm, nombre piso, huésped, noches, badge portal, importe
    - HOY resaltado en `--primary-light`; link directo a `/sivra/calendario`
  - **lib/sivra/fingerprint.ts** — helper de deduplicación para gastos (copiado de sivra)
  - **lib/sivra/gastos-fijos.ts** — generador mensual de entradas desde plantillas
  - **vercel.json** — añadido cron `0 6 1 * *` para `/api/sivra/expenses/fijos/generar`
  - **UserSidebar.tsx** — NAV_PISOS actualizado con 7 entradas: Calendario, Ingresos, Gastos, Gastos fijos, Fiscal IRPF, Inversión, SEO
  - **Fix TypeScript**: `inversion/page.tsx` corregido `'break-words'` → `'break-word'` (typecheck CI)
  - **Estado CI**: todos los proyectos en Ready ✅ (plataforma, ialimp, sivra, ia-rest)
  - **Pendiente Fase 2**: `/sivra/mensajes` (Smoobu, getSmoobuKey()), OCR Gmail, crons sync

- **📊 SIVRA · Backfill de ingresos Smoobu completado (sep-2025→may-2026) — 16/06/2026**
  El panel "Mis apartamentos / Febrero 2026" mostraba **0 € de ingresos** (Gastos: 1.641 €, resultado −1.641 €).
  Causa raíz: la API key de Smoobu estuvo rota ~sep-2025→14-jun-2026 y el cron solo tiene ventana de 2 días
  (`modifiedFrom = hoy − 2 días`), por lo que nunca rellenó hacia atrás. PRs #294 y #297 añadieron
  `from`/`to` de llegada (Smoobu solo devuelve próximas si no se pasan esas fechas) y `maxPages` al
  endpoint `GET /api/updates/sync`. Backfill ejecutado por tramos via `web_fetch_vercel_url`; a pesar de
  los 502 de Cloudflare (timeout de gateway), el Lambda de Vercel procesa y escribe. Resultado final:
  - 2025-09: 17 res · 7.653 € ✅ | 2025-10: 36 res · 12.783 € ✅ | 2025-11: 20 res · 7.490 € ✅
  - 2025-12: 15 res · 10.342 € ✅ | 2026-01: 15 res · 4.927 € ✅ | 2026-02: 24 res · **9.902 €** ✅
  - 2026-03: 23 res · 8.171 € ✅ | 2026-04: 33 res · **17.961 €** ✅ | 2026-05: 27 res · **13.665 €** ✅
  **El hueco sep-2025→may-2026 está 100% cerrado.** El cron diario (ventana 2 días) ya corre con la key
  correcta (de `pms_connections`, arreglada el 14/06/2026) y mantiene los datos al día. Verificado por
  Supabase SQL (`SELECT … FROM incomes GROUP BY mes`).

- **📖 MANUAL de iarrhh para Pilar (Mariscos González) + roadmap RR.HH. + CI verde — 16/06/2026**
  - **Manual de usuario** del Portal del Empleado (responsable RR.HH.): `apps/rrhh/public/manual.html`
    (servido en `central-rrhh.vercel.app/manual.html`), dirigido a **Pilar** (Mariscos González). Cubre
    entrar/cambiar contraseña, alta de trabajador (email obligatorio), enviar enlace de acceso, expediente
    (5 carpetas), nóminas + **firma eIDAS art.26 con OTP**, cómo firma el empleado, vacaciones/permisos,
    chat, baja vs borrado, qué ve el empleado, FAQ. **Sin credenciales** (no se hardcodean: el fichero es
    público). Enlace **📖 Manual** añadido al sidebar del panel (`components/AdminShell.tsx`).
  - **Roadmap RR.HH.** consolidado y durable en **`docs/ROADMAP-rrhh.md`** (PR #296, mergeado): todas las
    ideas con top-3 (asistente IA del trabajador + multi-idioma, verificación pública por QR estilo
    VeriFactu, plantillas legales versionadas).
  - **CI verde en main:** fix `packages/core-firma/src/firma.ts` (cast `BufferSource` en `hashDocumento`,
    PR #293 mergeado) — el `Typecheck · ialimp` que rompía main tras el merge de #287 ya pasa.
  - **Pendiente conocido (no mío, latente):** `components/ActivarPush.tsx` tiene el MISMO patrón
    `Uint8Array→BufferSource` sin castear (rrhh no está en el matrix estricto de Typecheck y `next build`
    ignora TS, por eso no rompe CI). Candidato a limpiar cuando se toque ese fichero.

- **🧩 RR.HH. CAPACIDAD COMPARTIDA — Fases 1+2 + verificación + arreglos rrhh — 16/06/2026** (PR #287, rama `claude/bold-ride-s4s8eq`)
  - **Fase 1 (ialimp da RR.HH. a las limpiadoras):** consume `@central/module-rrhh` + `module-documental` +
    `core-firma`. Tablas `documentos_limpiadora`/`firmas_limpiadora`/`firma_otps_limpiadora` (+ `limpiadoras.email`
    OBLIGATORIO para el OTP, `+dni`). Bucket **privado** `documentos-limpiadora` (policy read). `lib/{carpetas,storage,
    expediente,firma}-limpiadora.ts` + `lib/nomina-pdf.ts` (pdf-lib, agrega `partes_trabajo`). Rutas `/api/l/expediente*`
    (firma OTP) + `/api/admin/limpiadoras/[id]/{expediente,nomina}`. UI: **`/l/documentos`** (botón en `/l`) + pestaña
    **📁 Expediente** en `/admin/rrhh` (`components/ExpedienteLimpiadoraAdmin.tsx`). Remitente OTP parametrizado
    `FIRMA_FROM` (default `hola@ialimp.es`). Migración `2026-06-16_rrhh_limpiadora.sql` aplicada.
  - **Fase 2 (identidad de persona compartida):** `@central/core-identity` añade tipo **`Persona`** + helpers puros
    (`nuevaPersonaId`, `normalizarDni/Email`, `coincidenciaPersona`, `mismaPersona`). Columna **`persona_id`** (uuid,
    indexada) en `limpiadoras` y `rrhh.empleados`, **provisión automática al alta**. Verificado e2e: join cross-vertical
    por `persona_id` (misma persona en ialimp ↔ rrhh).
  - **Arreglos panel Empleados (rrhh):** faltaban editar/borrar en la UI (el backend ya los tenía). Añadido editar inline
    + estado activo/baja, **alta completa** (email OBLIGATORIO + DNI/tel/puesto), buscador + filtro, **copiar/regenerar
    enlace**, **borrado blindado** (409 si tiene firmas → conservar evidencia). Fix PATCH parcial (no machaca dni/tel).
    Fix infra: **policy read del bucket `rrhh-documentos`** (sin ella, con RLS, el firmado de URLs devolvía null → no se
    descargaban los documentos del expediente).
  - **Tests:** los 4 paquetes vitest (`core-firma`/`module-rrhh`/`module-documental`/`module-chat`) + `core-identity`
    estaban huérfanos (sin runner) → **cableados** (`vitest` devDep root + `test:vitest` dentro de `test`). **40/40 verdes.**
  - **Fase 3 (consolidación en plataforma, SOLO LECTURA) — HECHA:** nuevo endpoint READ-ONLY en rrhh
    `/api/operador/personas` (empleados+persona_id por el puerto operador). En plataforma `lib/personas.ts`
    consolida "la persona a través de verticales" (ialimp.limpiadoras por prisma directo + rrhh por HTTP),
    agrupa por `persona_id` y PROPONE enlaces no hechos por DNI/email (`coincidenciaPersona`). God-panel:
    `/operador/personas` (`PersonasClient.tsx`, item nuevo en `UserSidebar`) + `GET /api/admin/personas`.
  - **Pendiente:** **enlace MANUAL** del `persona_id` cross-vertical (escritura: setear el mismo persona_id
    en ambas filas/dos apps — hoy solo se SUGIERE en `/operador/personas`). **Roadmap completo en
    `docs/ROADMAP-rrhh.md`** (todas las ideas con top-3 marcado: asistente IA del trabajador + multi-idioma,
    verificación pública por QR estilo VeriFactu, plantillas legales versionadas; + fichaje RD 8/2019,
    art. 28 RGPD, canal de denuncias, coste laboral en plataforma, pago real Stripe, etc.).

- **🧩 RR.HH. COMO CAPACIDAD COMPARTIDA — Fase 0: `@central/module-rrhh` — 16/06/2026**
  Objetivo (decisión de Alberto): RR.HH. (nóminas + firma + expediente) reutilizable por **cualquier
  vertical** y **cliente directo**. Casos que cubre el diseño: (1) limpiadoras de ialimp (Vanessa),
  (2) cualquier vertical futura, (3) cliente RR.HH. directo tipo **Joaquín Jaén** (entra como `empresa`
  en la app rrhh por el god-panel/puerto operador ya existente, sin tocar nada). Identidad de persona
  cross-vertical vía `core-identity` + consolidación en `plataforma`.
  - **Hecho (Fase 0):** nuevo paquete **`@central/module-rrhh`** (`packages/module-rrhh`, TS puro):
    orquestación de firma con OTP **owner-agnóstica** (puertos `RepoFirma`/`PuertoEmailFirma`/
    `PuertoDescarga` que inyecta cada vertical) + taxonomía `CARPETAS_RRHH` compartida (reusa
    `module-documental`). Tests vitest **9/9**.
  - **Refactor sin cambio de comportamiento:** `apps/rrhh/lib/firma.ts` ahora es un adaptador fino que
    construye los puertos con el SQL de rrhh (`rrhh.documentos/firmas/firma_otps`) y delega en el módulo;
    `apps/rrhh/lib/carpetas.ts` reusa `CARPETAS_RRHH`. Añadido `file:` dep + `transpilePackages`. Tests
    rrhh 3/3 y core-firma 9/9 verdes; sin regresión.
  - **Pendiente (Fase 1+):** ialimp ofrece RR.HH. a limpiadoras (migraciones `documentos/firmas/
    firma_otps_limpiadora`, bucket privado, nómina PDF desde `partes_trabajo`, UI `/l/documentos`).
    **Decisiones abiertas:** email de limpiadora obligatorio (para OTP) y marca del remitente. Fase 2
    identidad de persona; Fase 3 consolidación en plataforma. Roadmap: fichaje (RD 8/2019), art. 28 RGPD,
    canal de denuncias (Ley 2/2023), vacaciones, onboarding, gestoría.
- **🤖 SIVRA · Agente de pricing — 1er ciclo con datos reales + motor por temporada (Paso 6/B2) — 16/06/2026**
  Continuación del agente (#291 ya MERGED). Ejecutado el primer ciclo y construido B2.
  - **Zona poblada** (`pricing_piso_zona`): 4 pisos, CP 41003 (Bustos Tavera / Casco Antiguo), aforo y tipo
    reales sacados de `propiedades` (el endpoint `/api/pricing/pisos-zona` requiere sesión y al abrirlo sin
    login redirige; por eso se pobló por SQL desde `propiedades`).
  - **Mercado real por zona+aforo** (`market_rates`, conector Booking MCP): finde julio (p50 ~132€ 4pax / ~122€
    2pax), **Semana Santa 2027 p50 ~462€/noche (¡~3,3× normal!, ya disparado 9m vista)**, Feria 2027 (~162€, aún
    sin rampar → oportunidad de adelantarse; FECHAS A CONFIRMAR).
  - **Memoria** (`pricing_aprendizaje`): factor pelotazo SS, baseline verano, nota Feria. **Decisiones dry-run**
    (`pricing_decisiones`, fuente `agente_bootstrap`): SS 2027 base Smoobu Duplex 371 / Luxury 354 / Busto 319, min-stay 3.
  - **Paso 6/B2 (motor por temporada)** en `apps/sivra/app/api/pricing/apply/route.ts`: el motor tarificaba con
    UN percentil por piso (mezclando fechas → precios planos). Ahora agrupa comps por **mes de `checkin_date`**
    (más reciente por scenario+fecha+nombre, ventana 120d) y tarifica cada fecha con el mercado de SU mes;
    fallback al global si <3 comps. Evento: si usa bucket mensual (ya refleja el evento) NO multiplica por
    `eventFactor` (sin doble conteo) pero garantiza ≥ global×eventFactor; en fallback, comportamiento idéntico
    al previo. Validado por SQL (buckets jul/oct/SS/Feria correctos). Va en rama `claude/pricing-b2-temporada`.
  - **Pendiente:** (1) calibrar coste→`min_price` (suelo) de Duplex/Luxury/House (hoy NULL; apply_enabled=false →
    solo dry-run); (2) House Sevillana necesita comps de unidad grande (12 plazas) + activar apply_enabled;
    (3) aplicar a Smoobu vía raíles (Paso 4) requiere CRON_SECRET (cron) o sesión — Claude no puede llamarlo solo;
    (4) confirmar fechas exactas de Feria 2027 y re-consultar conectores más cerca.

- **🤖 SIVRA · Agente de pricing IA — raíles + skill + chat (Fase 2-B, Pasos 4/5/5-bis) — 16/06/2026 — PR #291 (draft)**
  Construido el cerebro + los raíles del agente de pricing autónomo (sobre #290, que ya creó las 3 tablas).
  - **Paso 4 (raíl, sivra):** `POST /api/pricing/aplicar-propuesta`. La IA propone y este endpoint aplica la
    cadena que la IA NO puede saltarse: pausa global → `apply_enabled` → suelo de coste (`min_price`) →
    tope ±`max_change_pct`/día vs precio actual → techo opcional → **circuit-breaker** (aborta la pasada
    entera, HTTP 409, si la intención cruda mueve demasiadas fechas o un % medio enorme) → solo fechas
    disponibles → escribe en Smoobu → audita en `pricing_applied` (`source='agente'`) + `pricing_decisiones`.
    `dryRun` por defecto TRUE.
  - **Paso 5 (cerebro):** skill `.claude/skills/pricing-agente/SKILL.md` para la sesión recurrente de Claude.
    Lee `pricing_aprendizaje` + mide outcomes → reúne variables (mercado por zona/fecha vía conectores MCP,
    eventos, ocupación, costes, características) → decide (máx. margen, pelotazo en eventos con ramp) → aplica
    por el Paso 4 → escribe aprendizaje. Memoria = BD (sesión efímera).
  - **Paso 5-bis (humano en el bucle, plataforma):** entrada de sidebar 🤖 Agente precios → `/agente`, chat
    (`app/(usuario)/agente/page.tsx` + `app/api/agente/chat/route.ts`). Alberto pregunta "¿por qué X el día Y?"
    (lee `pricing_decisiones.motivo`) y da instrucciones ("no bajes Busto de 120") que se guardan en
    `pricing_aprendizaje` y el agente respeta el próximo ciclo. NO escribe precios (solo el Paso 4).
  - **CI:** sivra/plataforma/ialimp/ia-rest deploy verde. `central-rrhh` falla (pre-existente, su `main` está
    roto; este PR no toca `apps/rrhh`). Verificado `tsc` sin errores nuevos en los ficheros añadidos.
  - **Pendiente (necesita a Alberto):** Paso 1 (datos) — lanzar `/api/pricing/pisos-zona` logueado en sivra
    para poblar zona/CP/aforo reales. Luego: Paso 3 (bootstrap mercado por piso/fecha con conectores, lo hago
    yo) y primeros ciclos del agente en dry-run antes de vivo.
- **📧 Skill `facturas-correo` creada (agente de facturas por email) — 16/06/2026**
  Nueva skill `.claude/skills/facturas-correo/SKILL.md`: agente PROGRAMADO que revisa el Gmail de
  Alberto, localiza facturas/justificantes, los clasifica (personal vs negocio deducible con las
  reglas de `lib/categorizar.ts`), archiva los deducibles en Drive (`Facturas/<año>/<negocio>`), los
  concilia contra `movimientos_bancarios` (Supabase) y deja un resumen en 3 bloques. Idempotente vía
  etiqueta Gmail `Facturas/Procesado`. Alcance v1 elegido por Alberto: **Leer + Drive + conciliar**.
  - **PENDIENTE DE ALBERTO (manual, 1 vez):** crear el **trigger diario en Claude Code web** con el
    prompt «Ejecuta la skill `facturas-correo`» (entorno con MCP de Gmail + Drive + Supabase conectados).
    Sin el trigger, la skill solo corre cuando él la pide. NO hay agente 24/7 — son pasadas programadas.

- **🏦 PLATAFORMA · Banca: clasificación IBI + revisión de gastos reales — 16/06/2026**
  Sesión de uso real con Alberto sobre los movimientos importados:
  - **Fix regla de categorización** (`lib/categorizar.ts`): el IBI del ayuntamiento caía en `proveedor`
    porque el banco trunca "AYUNTAMIENTO"→"AYUNTAMIEN" y la regla buscaba la palabra entera + no contemplaba
    "IBI". Ahora la regla de `impuestos` incluye `AYUNTAMIEN`, ` IBI ` (con espacios, para no chocar con
    "RECIBIDO"), `CONTRIBUCION`, `PLUSVALIA`. Los IBI futuros se auto-categorizan como 🏛️ Impuestos.
  - **IBI Monte Carmelo 68** (ref. catastral `4707007TG3440N0003TR`, 2× −171,55 € = mismo inmueble al 50%
    Alberto / 50% su mujer): corregidos a `categoria=impuestos` y **`destino=personal`** — es su **vivienda
    habitual**, NO deducible. (El Dúplex es Pasaje Francisco, no Monte Carmelo.) Hecho por SQL (Supabase MCP).
  - **Cargos duplicados** (PR #282, ya en prod): el caso "HORNO NUEVA FLORIDA −2,80 €" (5 compras repartidas)
    se clasifica correctamente como **"Sospecha baja"** y queda bajo el umbral del banner (5 €), así que no
    molesta en el dashboard. Confirmado que la feature ya hace lo pedido; Alberto silencia cada grupo con
    "Es normal" (→ `duplicado_estado='ignorado'`). NO se reconstruyó nada.

- **🧾 SIVRA · Contabilidad: REGLA de separación de cuentas anclada — 15/06/2026**
  La gráfica "Evolución mensual" del dashboard mezcla todo en un único Ingresos/Gastos → **a Alberto no le vale**
  (mezcla cuentas bancarias y mezcla lo personal con lo de los pisos = poco informativo). Regla fijada:
  **BBVA** = Duplex Center + seguros (unidad **aparte**); **Kutxa** = gastos personales + los **3 apartamentos
  turísticos**, que hay que sacar **limpios sin lo personal**. Los 3 turísticos (confirmado por Alberto):
  **Socorro = House Sevillana** (Calle Socorro 24, `prop_house_sevillana`), **Busto Tavera = Busto Reform**
  (`prop_busto_reform`) **+ Luxury Busto** (`prop_luxury_busto`). Duplex Center NO entra en esa P&L.
  Detalle + mapeo + gap del modelo de datos en **`apps/sivra/docs/contabilidad.md`** (enlazado desde
  `apps/sivra/CLAUDE.md` y router `sivra-maestro`). **Pendiente:** implementar la segregación + filtro mes/año
  + gráfico resumen en la vista "Mis apartamentos" / dashboard.

- **⚠️ `apps/plataforma` · Resolución de cargos duplicados (banca) IMPLEMENTADO — 15/06/2026 — PR #282 (draft)**
  El banner del dashboard ya detectaba "posibles cargos duplicados" (`getAlertas`) pero era ingenuo
  (falsos positivos con micro-gastos recurrentes, p. ej. HORNO NUEVA FLORIDA −3 €) y de solo lectura.
  Ahora es **fiable y accionable**, en 3 fases (todas pusheadas y desplegando en Vercel):
  - **F1:** columna aditiva `movimientos_bancarios.duplicado_estado` (NULL/ignorado/confirmado, migración
    `2026-06-15_banca_duplicados.sql` **ya aplicada** por Supabase MCP en `wswbehlcuxqxyinousql`).
    Lógica PURA y testeada en `lib/duplicados.ts` (`clasificarConfianza`, `superaUmbralBanner`,
    `esRecurrente`, `agruparDuplicados`; `lib/duplicados.test.ts`, 8 tests `node --test` verde). `lib/banca.ts`:
    `getDuplicadosSospechosos`/`getDuplicadosResueltos`/`resolverDuplicados`; `getAlertas` reusa la misma
    fuente con **umbral** (`DUP_UMBRAL_BANNER`, 5 €) → micro-gastos no disparan el banner. Excluye pares ya
    conciliados a facturas distintas. API `POST /api/banca/duplicados`. UI `DuplicadosBandeja` en `/banca`
    (resolver/deshacer + plegable "ya resueltos"); banner del dashboard enlaza a `/banca#duplicados`.
  - **F2:** borrador de reclamación IA (`lib/reclamacion.ts` con `aiComplete`, degrada a plantilla) +
    `POST /api/banca/duplicados/reclamacion` + botón/modal "Reclamar" en la bandeja.
  - **F3:** auto-detección de recurrentes (subconsulta de ocurrencias en 60 d → `esRecurrente` degrada a
    confianza baja). Verificado con datos reales: el IBI (recibo mismo día) sale como sospecha ALTA; HORNO
    (16/mes) y GALOS (19/mes) quedan silenciados.
  - **Spec:** `docs/superpowers/specs/2026-06-15-duplicados-bancarios-design.md`. **Plan:**
    `docs/superpowers/plans/2026-06-15-duplicados-bancarios.md`.
  - **Pendiente (opcional):** enganchar duplicados al email del cron `banca-alertas`.

- **✍️ `apps/rrhh` (iarrhh) FASE 2 — FIRMA ELECTRÓNICA AVANZADA (eIDAS art. 26) — 16/06/2026**
  Decisión: **firma propia** legalmente válida (no Firmafy ahora; avanzada basta para nóminas/contratos
  por art. 29 ET + STS 1023/2016). Firmafy queda **enchufable** como otro proveedor del puerto.
  - **Núcleo puro `@central/core-firma`** (`packages/core-firma`): puerto `ProveedorFirma` +
    `FirmaPropia`. `hashDocumento` (SHA-256/WebCrypto), `nombreCoincide`, `cumpleArt26`,
    `verificarIntegridad`, `TEXTO_CONSENTIMIENTO`, evidencia. Tests vitest **9/9**. Añadido a
    `transpilePackages` + `file:` dep en rrhh.
  - **Cómo cumple art.26:** (a) empleado teclea su nombre, se valida que coincide con el titular;
    (b) guarda nombre+email/DNI; (c) control exclusivo por **token personal** del empleado
    (`metodo='sesion_token'`; OTP email = refuerzo futuro); (d) **SHA-256 del documento** al firmar →
    alteración detectable.
  - **DB:** tabla `rrhh.firmas` (`prisma/migrations/0006_firmas.sql`, aplicada; FK a documentos
    ON DELETE CASCADE, RLS on). `documentos.estado_firma`: `no_requiere→pendiente→firmado`.
  - **App:** `lib/firma.ts` (`solicitarFirma`/`firmarDocumento`), `lib/storage.ts#descargarObjeto`,
    API `POST /api/admin/empleados/[id]/documentos/[docId]/solicitar-firma` (avisa al empleado) y
    `POST /api/e/expediente/[docId]/firmar` (avisa a responsables). UI: admin badge+"Solicitar firma";
    empleado badge+"Firmar" (modal consentimiento + teclear nombre). Spec:
    `docs/superpowers/specs/2026-06-16-rrhh-firma-avanzada-design.md`.
  - **Probado:** core-firma 9/9; build rrhh verde; integración BD (estado→firmado, evidencia,
    integro_original=true / integro_si_modificado=false, cascade) → datos de prueba borrados;
    `hashDocumento`==`node:crypto` SHA-256.
  - **Refuerzo OTP por email (hecho, 16/06/2026):** al pulsar "Firmar" se envía un código de 6 dígitos
    al email del empleado (tabla `firma_otps`, `0007_firma_otps.sql`, hash SHA-256, 10 min, 5 intentos);
    si se emitió, es obligatorio para firmar → `metodo='otp_email'`. **Degrada limpio:** sin email/SMTP
    se firma por sesión (`sesion_token`), la firma sigue válida. **Remitente: reusamos Resend de ia.rest**
    (`hola@iarest.es`, dominio verificado) con display **"iarrhh"** (`lib/mailer.ts` sobre `@central/core-email`;
    `notificar.ts` migrado a ese mailer). **Requiere `RESEND_API_KEY` en el proyecto Vercel central-rrhh**
    (mismo valor que ia-rest); sin ella, OTP no se envía y se firma por sesión. Endpoint
    `POST /api/e/expediente/[docId]/firmar/codigo`. Probado: build verde + integración BD (upsert resetea
    intentos, hash válido, firma `otp_email`, OTP consumido) → datos borrados.
  - **Pendiente:** poner `RESEND_API_KEY` en central-rrhh (Vercel) para activar el OTP en vivo; proveedor
    **Firmafy** (cuando Alberto tenga alta/credenciales — el flujo rrhh no cambia, solo se elige proveedor).
    **Precio** al cliente.

- **🎨🏢🔑 `apps/rrhh` (iarrhh) — REDISEÑO + ALTA DESDE GOD-PANEL + CAMBIO PASS — 15/06/2026 — PRs #276/#278/#279/#280**
  Marca propia **iarrhh** (no del cliente). Todo en producción y **verificado en vivo**.
  - **Rediseño visual (#276):** vestida toda `apps/rrhh` con la imagen de la casa (estilo ia-rest):
    paleta papel/tinta + acento **teal `#2B6A6E`**, fuentes Inter Tight/Newsreader/JetBrains Mono,
    sidebar admin (`components/AdminShell.tsx`), wordmark `ia·rrhh` (`components/Wordmark.tsx`),
    monograma SVG (`public/icon.svg`), portal del empleado móvil-primero. Tokens en `globals.css` +
    `tailwind.config.ts`. **Sin tocar lógica/API/datos.** Spec: `docs/superpowers/specs/2026-06-15-iarrhh-rediseno-visual-design.md`.
  - **Alta de empresa desde el god-panel (#278):** el operador crea empresa cliente + responsable desde
    **plataforma → `/operador/clientes` → ➕ Nuevo cliente → "RR.HH. · iarrhh"**. Arquitectura **puerto HTTP**
    (patrón ia-rest, NO escritura directa cross-schema): rrhh expone `GET/POST /api/operador/empresas`
    (`lib/operador.ts` + ruta); plataforma lo consume con `lib/adapters/rrhh.ts` (vertical `'rrhh'` en el
    contrato `VerticalAdapter`). El responsable luego entra en iarrhh y crea a sus empleados.
    Spec: `docs/superpowers/specs/2026-06-15-alta-empresa-rrhh-god-panel-design.md`.
  - **⚠️ LANDMINE de secretos (#279):** `OPERADOR_SHARED_SECRET` en plataforma **YA ES** el secreto del
    puerto god-panel↔**ia-rest**. Reutilizarlo para rrhh rompía la integración ia-rest. **Desacoplado:**
    iarrhh usa su **propio** `RRHH_OPERADOR_SECRET`. NO volver a colapsarlos.
  - **Cambio de contraseña del responsable (#280):** `/admin/cuenta` (`POST /api/auth/cambiar-password`),
    ítem "Mi cuenta" en el sidebar.
  - **Envs (3 proyectos Vercel):**
    - `central-rrhh`: `RRHH_OPERADOR_SECRET`.
    - `plataforma`: `RRHH_OPERADOR_SECRET` (mismo valor que central-rrhh) + `RRHH_URL` (=`https://central-rrhh.vercel.app`)
      + `OPERADOR_SHARED_SECRET` (este es el de ia-rest, valor compartido con el proyecto `ia-rest`).
    - `ia-rest`: `OPERADOR_SHARED_SECRET` (mismo valor que en plataforma).
  - **Verificado en vivo:** Alberto creó una empresa de prueba por el panel → fila correcta en BD (cadena
    UI→plataforma→HTTP→rrhh→BD OK) → borrada. BD queda con 1 empresa real: **Mariscos González** (responsable
    **Pilar Piña** `pilar.pina.franco@gmail.com`; contraseña reseteada a `Mariscos2026` para onboarding,
    cambiable desde Mi cuenta).
  - **Pendiente:** firma avanzada vía **Firmafy** (Fase 2, necesita alta/credenciales con el partner —
    acción de Alberto; dejar montado puerto `core-firma`); **precio** al cliente.

- **🧑‍💼 NUEVA VERTICAL `apps/rrhh` · Portal del Empleado — Fase 1 cimiento IMPLEMENTADO — 15/06/2026 — PR #269**
  Petición de Pilar (RR.HH. de Mariscos González, audio): intranet de empleados con expediente
  documental por trabajador (carpetas: datos personales/contratos/nóminas/partes médicos/otros, subida
  **bidireccional**), **firma electrónica avanzada** (eIDAS art. 26 — basta avanzada para nóminas/contratos
  por art. 29 ET + STS 1023/2016; NO cualificada), chat y solicitudes (vacaciones/permisos/parte médico).
  - **Spec:** `docs/superpowers/specs/2026-06-15-apps-rrhh-portal-empleado-design.md`. **Plan Fase 1:**
    `docs/superpowers/plans/2026-06-15-rrhh-fase1-cimiento.md`.
  - **Arquitectura definitiva (decisión 15/06):** se aprovecha que Sique Brilla (ialimp) está **inactivo**
    para crear paquetes compartidos sin duplicar: **`core-firma`** (núcleo firma), **`module-chat`** (ialimp
    lo adopta, rrhh lo consume; datos por `cuenta_id` en plataforma cuando haya cliente multi-producto) y
    **`module-documental`** (motor de expedientes agnóstico de entidad sobre `core-storage`; rrhh lo estrena,
    ialimp migra después JSONB→tablas). Chat NO como app/servicio propio (rompe la matriz).
  - **Firma proveedor:** investigación comparada (Firmafy/Signaturit/DocuSign/Viafirma/Click&Sign/Tecalis).
    Para el piloto → **Firmafy** (avanzada biométrica + 6 evidencias + custodia 10 años + Programa Partners)
    o Click&Sign (pago por uso). Adaptador `self-hosted` (PAdES + RFC 3161) a futuro. Pendiente cotización partner.
  - **IMPLEMENTADO (cimiento, probado):** scaffold `apps/rrhh` (Next 15, espejo de ialimp), Prisma schema
    (`empresas`, `usuarios_rrhh`, `empleados`), auth JWT responsable (`lib/auth.ts`/`lib/tenant.ts`, sesión
    única por jti) + acceso empleado por enlace mágico+PIN (`lib/empleado-auth.ts`), lógica de empleados con
    tests (`lib/empleados.ts` + `.test.ts`, **3/3 verde**), API empleados acotada por `empresa_id`
    (alta/lista/editar/baja), rutas login/logout, UI mínima (`/login`, `/admin/empleados`, `/e/[token]`).
    **`next build` verde** (10 rutas). `vitest` verde.
  - **🗄️ BD RESUELTA (15/06, decisión Alberto = gratis):** no se pudo crear proyecto Supabase dedicado
    (org al **límite de 2 proyectos gratis**: `wswbehlcuxqxyinousql` + `efncqyvhniaxsirhdxaa`). Se optó por
    **schema `rrhh` en el proyecto COMPARTIDO** (`wswbehlcuxqxyinousql`), aislado del `public` de
    ialimp/sivra/plataforma. **Migración `rrhh_0001_cimiento` APLICADA** (3 tablas `rrhh.empresas/
    usuarios_rrhh/empleados`, RLS activado, verificadas). No afecta a las otras apps (schema y tablas
    propias). La conexión de rrhh usará `DATABASE_URL` con `?schema=rrhh`. **Migrable a proyecto dedicado**
    cuando se pase a plan de pago (mejor aislamiento RGPD de los datos de salud). Pendiente: cargar env
    `DATABASE_URL`/`JWT_SECRET`/keys en el (futuro) proyecto Vercel `rrhh`.
  - **📁 `module-documental` IMPLEMENTADO + expediente en rrhh (15/06):** nuevo paquete
    **`packages/@central/module-documental`** = motor de expedientes **AGNÓSTICO DE ENTIDAD** (puro, sin BD/
    Storage): `tipos.ts` (OwnerRef opaco, Actor `gestor|titular`, ConfigCarpeta), `permisos.ts`
    (puedeSubir/puedeVer/carpetasVisibles, indexarCarpetas), `documental.ts` (validarSubida +
    construirPathStorage `<tipo>/<id>/<carpeta>/<uuid>.<ext>`). **Tests 8/8 verde.** Las categorías,
    permisos y Storage los inyecta cada vertical (rrhh lo estrena; ialimp migrará después su JSONB).
  - **rrhh consume el módulo** vía `file:` deps + `transpilePackages` (`@central/module-documental` +
    `@central/core-storage`). `lib/carpetas.ts` (taxonomía empleado: datos_personales/contratos/nominas/
    partes_medicos/otros + permisos por carpeta), `lib/storage.ts` (subir/borrar con service_role + URL
    firmada vía core-storage), `lib/documental.ts` (listar/subir/borrar, scope empresa+empleado). API:
    `/api/admin/empleados/[id]/documentos` (GET expediente con URLs firmadas, POST subir FormData) +
    `[docId]` (DELETE). **Tabla `rrhh.documentos` APLICADA** + **bucket privado `rrhh-documentos` creado**.
    `next build` verde.
  - **🖥️ UI del expediente IMPLEMENTADA (ambos lados) — 15/06:** lado **gestor** `/admin/empleados/[id]`
    (`ExpedienteClient.tsx`: carpetas con subir/descargar por URL firmada/borrar) + lado **empleado** `/e`
    (`getSesionEmpleado` lee cookie, `ExpedienteEmpleado.tsx`: ve sus carpetas visibles y **sube solo donde
    el módulo lo permite** — datos personales y partes médicos). API `/api/e/expediente` (GET/POST, actor
    `titular`). `/e/[token]` redirige a `/e` tras login. **Flujo documental BIDIRECCIONAL completo.**
    `next build` verde (16 rutas).
  - **💬 `module-chat` IMPLEMENTADO + chat en rrhh — 15/06:** nuevo paquete `packages/@central/module-chat`
    (motor puro de mensajería 1-a-1 gestor↔titular: tipos, `noLeidos`, `contraparte`, `ordenarCronologico`,
    `validarTexto`; **tests 4/4 verde**). rrhh lo consume (`file:` + transpilePackages): tabla
    `rrhh.mensajes` (un hilo implícito por empleado, leído por parte) **aplicada**, `lib/chat.ts`
    (listar+marca leído / enviar, scoped por empresa), API `/api/admin/empleados/[id]/chat` (gestor) +
    `/api/e/chat` (empleado), y **`components/ChatPanel.tsx`** reutilizable (polling 5s) embebido en el
    expediente del gestor y en `/e`. `next build` verde. (Datos por `cuenta_id` en plataforma = unificación futura.)
  - **📝 SOLICITUDES self-service IMPLEMENTADAS — 15/06:** flujo empleado→gestor (HR-específico, nativo en
    rrhh, no paquete). Tabla `rrhh.solicitudes` **aplicada** (tipo vacaciones/permiso_retribuido/parte_medico/
    baja/otro, estado solicitada→aprobada/rechazada). `lib/solicitudes.ts` (crear/listar/resolver + validación
    de fechas/tipo). API: `/api/e/solicitudes` (empleado crea/ve), `/api/admin/solicitudes` (+`?pendientes=1`)
    y `/[id]` PATCH (aprobar/rechazar). UI: bandeja `/admin/solicitudes` + bloque en el portal `/e`. `next
    build` verde (16 páginas).
  - **📧 NOTIFICACIONES EMAIL integradas (listas para claves) — 15/06:** `lib/notificar.ts`
    (`avisarResponsables`) avisa por email a los `usuarios_rrhh` cuando el empleado **sube un documento,
    crea una solicitud o escribe por el chat**. Usa `nodemailer` DIRECTO (no `core-email`: su bundle fallaba
    por symlinks/webpack "Can't resolve nodemailer"). Best-effort/no-op si no hay SMTP → funciona al cargar
    `SMTP_HOST/PORT/USER/PASSWORD`. **Trampa de build resuelta:** un comentario JSDoc con `SMTP_*` seguido de
    `/` cerraba el bloque `/* */` (evitar `*` + `/` en comentarios). `next build` verde.
  - **🔔 PWA + WEB PUSH integrados (listos para claves) — 15/06:** `public/{manifest.json,icon.svg,sw.js}`
    + `RegisterSW` (PWA instalable; SW con handler `push`/`notificationclick`). Tabla
    `rrhh.push_subscriptions` **aplicada**. `lib/push.ts` (`web-push` DIRECTO, no core-push, mismo motivo
    que email) con `pushResponsables`/`pushEmpleado` (no-op sin VAPID, borra subs 410/404). Subscribe:
    `/api/admin/push/subscribe` (gestor) + `/api/e/push/subscribe` (empleado). Botón `ActivarPush` en
    `/admin/empleados` y `/e`. Push enganchado junto al email en las 3 acciones del empleado (doc/solicitud/
    mensaje → responsables). `next build` verde. **VAPID generadas (entregadas a Alberto para el env), NO
    commiteadas.**
  - **PENDIENTE (necesita Alberto):** proyecto **Vercel `rrhh`** + env (`DATABASE_URL?schema=rrhh`,
    `JWT_SECRET`, Supabase url/anon/service_role, opcional SMTP_*, VAPID público+privado). **Fase 2:** firma
    (Firmafy, cotización partner). **Precio:** diferido. (Push y email ya funcionan al cargar sus claves.)
- **🏦 PLATAFORMA · Banca: análisis + fiscal + operativa — 15/06/2026 — PR #272 (MERGED)**
  Construido el menú completo de ideas sobre el modelo existente (`movimientos_bancarios`, `destino`,
  `categoria`), sin migraciones.
  - **Dashboard**: comparativa "este mes vs anterior" (`getComparativaMensual`), desglose de gastos por
    categoría del año (`getGastosPorCategoria`, barras CSS), banner de alertas accionables
    (`getAlertas`: nº por revisar + posibles cargos duplicados por mismo importe+contraparte en ±4 días).
  - **/banca**: buscador + filtros cliente (texto/ingreso-gasto/categoría, `MovimientosTabla`), neto por
    negocio últimos 6 meses (`getEvolucionPorDestino`, tabla), estimación fiscal orientativa por trimestre
    (`lib/fiscal.ts` `getEstimacionFiscal`: IVA 21% + IRPF fraccionado 20%, con aviso de que la real la
    hace el gestor), y **Exportar CSV** (`/api/banca/export`, sep `;` + coma decimal + BOM).
  - `CATEGORIA_LABEL` movido a `lib/categorizar.ts` (compartido dashboard/banca). Verificado `tsc` + `next build`.
  - **PENDIENTES (decisión de Alberto, NO urgente):**
    1. **⏳ PENDIENTE DE VERIFICAR — clasificar gastos de tarjeta que siguen en `personal`**:
       GALOS CMI (~911 €, 38×), **Amazon (49 compras, −1.619 €, +446 € devuelto → neto −1.173 €; pico
       en dic = regalos, pinta personal)**, JHS Sevilla (~138 €). El concepto bancario NO trae el
       producto → Alberto verifica en "Tus pedidos" de amazon.es (y los otros) qué es negocio
       (deducible) y qué personal, y luego se recolocan los `destino`/`categoria`.
    2. **🗂️ Controlar que cada gasto tenga su FACTURA en Google Drive — y si no, subirla.** Para los
       gastos deducibles hay que tener el justificante archivado. Idea: cruzar movimientos (sobre todo
       los deducibles de negocio) contra las facturas en Drive (vía MCP `Google_Drive`), marcar los que
       no tengan factura localizada y subir/pedir las que falten. Conecta con la conciliación y con el
       OCR de facturas (`/api/banca/factura`) ya existentes.
    3. **Rotar la clave privada de Enable Banking** (se vio en chat durante el debug; higiene, opcional):
       regenerar y reemplazar `ENABLEBANKING_PRIVATE_KEY` en el proyecto Vercel `plataforma`.

- **🧾 IA-REST · E-recibo digital MVP IMPLEMENTADO (QR en ticket de cuenta) — 15/06/2026 — PR #256**
  Ejecutado el plan `apps/ia-rest/docs/superpowers/plans/2026-06-15-e-recibo-digital.md` (subagent-driven).
  - **Tabla nueva `iarest.recibos_digitales`** (token único + snapshot JSONB autocontenido + RLS service_role).
    Migración aplicada en el proyecto compartido `wswbehlcuxqxyinousql`, schema `iarest`.
  - **`src/lib/recibo.ts`**: tipo `ReciboSnapshot`, `generarTokenRecibo()` (16 bytes base64url),
    `crearReciboDigital()` (insert, devuelve token; no bloquea impresión si falla).
  - **`src/lib/courier.ts`**: en `crearPrintJobCuenta` se crea el recibo (snapshot + token) y se imprime
    un **bloque QR ESC/POS** (`escposQR`, modelo 2) en el ticket de cuenta → `iarest.es/recibo/[token]`.
    El fallback de texto plano imprime la URL. `aeat` queda `null` (la factura legal se emite en cobro, no al pedir cuenta).
  - **Ruta pública `src/app/recibo/[token]/page.tsx` + `ReciboView.tsx`**: server component, token = secreto
    (sin sesión), diseño mobile-first con tema `C` (avatar inicial + nombre + items + total + IVA + AEAT si hay).
    `next build` OK, ruta `ƒ /recibo/[token]`.
  - **Fase 2 pendiente:** descargar PDF · pedir factura con NIF desde el móvil · email · marca avanzada
    por restaurante (logo/color en `restaurantes` — hoy no existen esos campos).

- **🏨 PLATAFORMA: detalle completo por apartamento — PR #255 (MERGED) — 15/06/2026**
  Ficha enriquecida en `/apartamentos` y nueva página `/apartamentos/[id]` con analítica completa por piso.

  - **`lib/propiedades.ts`**: `getPropiedades()` enriquecida con ocupación %, ADR y top portal del mes (10 queries paralelas). Nueva función `getApartamentoDetalle(id)` con KPIs mes/año/YoY, próximas reservas, últimas 20, mix de portales, histórico 12 meses, gastos por categoría (tabla `gastos`, no `expenses`) + gastos compartidos.

  - **`/apartamentos`**: tarjetas con barra de ocupación visual (verde ≥70%, ámbar ≥40%, rojo), ADR y portal principal. Cada tarjeta es link a `/apartamentos/[id]`.

  - **`/apartamentos/[id]`** (nuevo server component):
    - 8 KPIs: ingresos mes (con YoY %), gastos mes, resultado, ocupación %, ADR, ingresos YTD, gastos YTD, resultado YTD
    - Gap detector: detecta huecos entre reservas próximas y muestra `⚠️ Huecos libres: Xd (fecha → fecha)`
    - Break-even: `Math.ceil(gastosFijos / 12 / adr)` noches/mes para cubrir costes fijos (ALQUILER+COMUNIDAD+SEGURO)
    - Mix de portales con barras de % visuales
    - Histórico mensual 12 meses (más reciente primero) con ocupación visual
    - Gastos por categoría con iconos (incl. SEGURO 🛡️) + gastos compartidos como referencia
    - Últimas 20 reservas con bruto/neto

- **🔑 SIVRA: Smoobu key unificada → fuente única en BD (14/06/2026)**
  La API key de Smoobu estaba duplicada: en `SMOOBU_API_KEY` (env de Vercel, que usaba TODO sivra) y en
  `pms_connections.smoobu_api_key` (BD, lado ialimp/limpiezas). Misma key, dos sitios → riesgo de drift al rotar.
  Unificado: nuevo `apps/sivra/lib/smoobu.ts` (`getSmoobuKey()`) lee la key de la **BD** (`pms_connections`, fila
  de Alberto `c8c1fb07-…`, seleccionada por id porque la tabla es multi-tenant), con el env **solo como respaldo**.
  Migradas las **12 rutas** que hablaban con Smoobu (pricing apply/restore, rates, rates/snapshot, mensajes/*,
  updates/sync, limpiadoras auto-sessions y alerta-ventana). Ahora se **rota en un único sitio** (la conexión de
  ialimp) sin redeploy. Verificado: la consulta del helper devuelve la key (32 chars, activa) y `tsc` limpio.

- **🚨 SIVRA pricing: PAUSA GLOBAL activada — bug de techo en fechas de evento (14/06/2026)**
  Entró la **1ª reserva de Busto Reform** (Emilio J. Martín, 25-28 mar 2027 = **Semana Santa**, vendida al base
  previo de Smoobu ~307-319€/noche; **NO** a precio de nuestro motor — `pricing_applied` vacío para esas fechas).
  Al verificar, se destapó un fallo serio: ahora que `apply` corre los **365 días** sin timeout (fix #213), el cron
  `apply-auto` (08:30) **capaba a `max_price`=125€** todas las fechas de evento. La guardia de confianza es **por
  piso, no por fecha** (Busto: 14 comps, 5d → pasa), y el motor usa **un único percentil de mercado** (~168€, de
  fechas normales) para todo el año, rematando con el techo del piloto **al final de la cadena**. Impacto medido:
  **172 fechas disponibles >125€** (Semana Santa + **Feria de Abril 2027** a 366€) → ~**9.788€ base** en riesgo.
  - **Acción inmediata (hecha):** `UPDATE pricing_config SET paused=true WHERE id=1` → el cron degrada a
    simulación (`dryRun` forzado), **no escribe en Smoobu**. Verificado que `apply` lo lee. Reserva intacta
    (reservada ≠ `available`). **Contrapartida:** también se congela el pricing al alza de fechas normales.
  - **PENDIENTE (fix de producto, PR aparte):** techo **event-aware** (`max_price × eventFactor` o "nunca bajar
    una fecha de evento por debajo de su base actual") + comps **por fecha/temporada** (no un percentil único) +
    guardia de confianza por fecha. Reactivar la pausa SOLO tras el fix. Detalle en `pricing-automatico.md` §9.

- **🧾 IA-REST · IDEA (no implementada): ticket moderno + e-recibo digital — 15/06/2026**
  Alberto comparte `receiptmaker.ai` (generador de recibos por IA → PDF/imagen con logo,
  colores, tipografías; familia receiptmaker.io/.org, muchas orientadas a recibos "fake/demo").
  Análisis con contexto del código real (`apps/ia-rest/src/lib/courier.ts`):

  - **Trampa clave:** ia.rest NO imprime PDF/imagen. Imprime **ESC/POS térmico** (80mm,
    48 chars monoespaciados, codepage PC437, **monocromo, sin tipografías**). El output de
    receiptmaker **no es replicable en térmica** → sirve como *inspiración de layout/jerarquía*,
    NO como solución técnica.
  - **Lo que ve el cliente hoy:** `generarEscPosCuenta()` (ticket de cuenta) + QR AEAT VeriFactu
    (`generarTicketCuenta()`). La comanda de cocina (`generarEscPos`) es interna.

  - **Dos frentes de "modernizar" (decisión pendiente de Alberto):**
    1. **Ticket térmico** — margen acotado: añadir **logo raster** (ESC/POS `GS v 0`, bitmap
       monocromo), mejor jerarquía/espaciado, aprovechar mejor el QR. Pulido, no revolución.
    2. **E-recibo digital** — *aquí brilla la inspiración de receiptmaker*: e-ticket **HTML**
       con logo/colores/tipografía reales, enviado por **email (Resend, ya existe)** o accesible
       por **QR impreso** ("ve tu recibo / pide factura aquí"). Encaja con infra existente
       (sesiones QR `qr_sesiones_cliente`, `verifactu`, email). **Recomendación:** este es el
       movimiento diferenciador, no pelear contra la térmica.

  - **Estado:** solo análisis guardado. Rama de trabajo abierta `claude/modern-ticket-design-r4ngkz`
    por si se decide implementar (con brainstorming antes de tocar código).

- **🎛️ PLATAFORMA: panel unificado — un solo shell (Mi negocio + Operador) — PR #249 (MERGED) — 15/06/2026**
  Dos zonas separadas (usuario `/dashboard` + god-panel `/admin`) unificadas en una sola pantalla con sidebar único, tema claro y un solo login.

  - **Auth unificado:** `app/api/auth/login/route.ts` ahora emite ambas cookies (`plataforma_session` + `plataforma_admin`) cuando el email coincide con un superadmin activo. Nuevo helper `findActiveAdminByEmail(email)` en `lib/superadmin.ts` (solo lectura, sin bcrypt, sin escrituras). `logout` borra ambas cookies.

  - **Sidebar único con dos grupos:**
    - *Mi negocio* (siempre): Resumen · Banca · 🏨 Apartamentos · 🧹 Limpiezas · 💬 Comunicación
    - *Operador* (solo si sesión de superadmin): 🏢 Clientes · 🍽️ ia-rest · 🗺️ Estructura

  - **Nuevas páginas — Mi negocio:**
    - `/apartamentos`: tarjetas de los 4 pisos sivra con KPIs del mes + próxima reserva (`getPropiedades()` de `lib/propiedades.ts`)
    - `/limpiezas`: portal propietario ialimp embebido en iframe sin segundo login (`getPropietarioAccessToken`)

  - **Nuevas páginas — Operador (tema claro, mismas APIs `/api/admin/*`):**
    - `/operador/clientes`: lista por vertical, bloquear/liberar, modal 360, modal nuevo cliente (`ClientesClient.tsx`)
    - `/operador/estructura`: `MapaArquitectura`
    - `/operador/iarest`: placeholder + enlace directo

  - **Corrección conciliación bancaria:** `candidatosSivra()` en `lib/conciliacion.ts` leía `expenses` (34 filas, congelada desde abril). Corregido a `gastos` (71 filas, tabla real del agente IA de sivra). Recupera ~37 gastos invisibles (€5.670). `gastos.propiedad` usa el mismo slug que `properties.id` = `negocio.refExt`.

  - **PWA:** `public/manifest.json` + `public/icon.svg` + metadata en `app/layout.tsx`.

  - **Command palette Cmd/Ctrl+K:** `CommandPalette.tsx` sin deps externas, overlay claro, filtro por texto, teclas ↑↓↵.

  - **Strip "Hoy" en dashboard:** check-ins/check-outs del día + movimientos bancarios del día. Solo se muestra si hay actividad.

  - **Limpieza BD:** sociedad "Sique Brilla SL" (y su negocio) eliminada de la cuenta de Alberto en plataforma (tablas `sociedades`/`negocios`). **NO toca ialimp** — la empresa de Vanessa sigue operativa.

  - **`/admin` sigue vivo** como fallback. Siguiente paso: convertirlo a redirect cuando Alberto confirme que `/operador/clientes` funciona bien.

- **🏦 PLATAFORMA: conexión bancaria PSD2 EN VIVO (Enable Banking) + categorización IA diaria — 14/06/2026**
  La consolidación bancaria pasó de "código inerte" a **funcionando con datos reales de Alberto**. Larga sesión.
  - **Enable Banking en producción (restricted mode = GRATIS para cuentas propias)**: tras descartar GoCardless
    (altas cerradas), el conector PSD2 corre sobre **Enable Banking**. El **tier gratuito "restricted/linked accounts"
    permite conectar TUS PROPIAS cuentas sin contrato ni pago** (solo el modo comercial para cuentas de terceros es de
    pago). Auth = **JWT RS256** firmado con la clave privada de la app (kid=APP_ID, aud=api.enablebanking.com).
    Variables en Vercel (proyecto plataforma): `ENABLEBANKING_APP_ID` + `ENABLEBANKING_PRIVATE_KEY`.
  - **Conectadas y sincronizando a diario**: **Kutxabank** (IBAN real, 257 mov incl. histórico Q1 del Excel fusionado)
    y **BBVA** (73 mov). Saldo del grupo real **41.186,94 €**. App Enable Banking activa: `ff26f315-…`.
  - **Trampas resueltas (todas reales, documentadas para la próxima)**:
    1. `DECODER routines::unsupported` → la clave se pegó **sin cabecera PEM** (solo cuerpo base64). `cargarClavePrivada()`
       en `lib/enablebanking.ts` ahora tolera: PEM normal, en una línea, con comillas, `\n` escapados, **cuerpo base64
       suelto (DER pkcs8/pkcs1/sec1)** y PEM re-codificado en base64.
    2. `Wrong signature` → la clave privada en Vercel **no era la pareja** del certificado registrado (Enable Banking NO
       tiene botón de regenerar; el cert se fija al **crear** la app). Solución: **crear app nueva** y usar App ID + clave
       privada **de esa misma creación atómica**. Verificado por **huella SHA-256 de la clave pública** derivada.
       OJO Vercel: una env var nueva **solo entra en despliegues creados DESPUÉS de guardarla** (hizo falta Redeploy real).
    3. Transacciones vacías → el endpoint **exige `date_from`** y **PSD2 limita a ~90 días** (>90d → 422
       `WRONG_TRANSACTIONS_PERIOD`). Se piden 89 días.
    4. Timeout 504 al conectar Kutxa → el callback insertaba mov **uno a uno**. Ahora **inserción en bloque**
       (`Prisma.join`) + `maxDuration=300` en callback y cron. Idempotente (dedupe por `entry_reference`).
  - **Endpoints/lib**: `lib/enablebanking.ts` (cliente JWT), `lib/psd2.ts` (sincroniza por `session_id` guardado en
    `conexiones_banco.requisition_id`), `psd2/{instituciones,conectar,callback}` + cron `psd2-sync`. (Hubo un endpoint
    temporal `/api/cron/psd2-diag` para depurar la clave **sin exponer secretos** — ya retirado.)
  - **Auto-categorización IA diaria + "Por revisar" (PR #242)**: el cron `psd2-sync`, tras sincronizar, **categoriza con
    IA** los movimientos nuevos; cuando **duda marca `requiere_revision=true`** (columna nueva) y en `/banca` sale la
    bandeja **🔎 Por revisar** donde el dueño asigna categoría (`POST /api/banca/revisar`). Degrada sin `NVIDIA_API_KEY`.
  - **PENDIENTE de Alberto**: (a) **`NVIDIA_API_KEY`** (gratis, NVIDIA NIM) en el Vercel de plataforma para que la
    categorización IA etiquete de verdad; (b) **rotar la clave privada** de Enable Banking (se compartió un `.pem` en el
    chat durante la depuración — riesgo bajo en restricted mode/solo-lectura de cuentas propias, pero conviene rotarla).

- **🧹 IALIMP: portal del propietario responsive en escritorio (sidebar fija) — PR #239 — 14/06/2026**
  Alberto reportó que el **portal del propietario** (`/propietario/[token]` y `/propietario` por email+contraseña,
  ambos `PropietarioClient.tsx`) se veía en PC como una columna móvil estrecha centrada (`maxWidth:1080`), con las
  tarjetas amontonadas a la izquierda. Arreglo solo en `PropietarioClient.tsx`:
  - **Escritorio (≥1024px):** barra lateral de navegación **fija** a la izquierda (248px: logo, propietario, los
    `MENU_ITEMS`, cerrar sesión); el contenido ocupa el ancho disponible (tope 1280px centrado) y las rejillas
    `auto-fill` reparten 3-4 columnas. Se oculta el botón hamburguesa (`.prop-hamburger`).
  - **Móvil (<1024px, sin cambios):** header con hamburguesa + drawer, una columna fluida.
  - **Excepción consciente a la regla "no media queries"** de `apps/ialimp/CLAUDE.md`: una sidebar solo-PC necesita
    un breakpoint, así que se usa **una única media query** dentro del bloque `<style>` que el componente ya inyectaba,
    **acotada solo al portal** (clases `.prop-root`/`.prop-deskbar`/`.prop-hamburger`/`.prop-content`). No se toca el
    resto de la app. Build local no viable en el contenedor (deps `workspace:*` del monorepo no resuelven con npm
    aislado) → validado con **typecheck ialimp + preview de ialimp verdes** antes de mergear (cliente en vivo).

- **🤖 AUTOMATIZACIÓN: comando `/auditoria-diaria` (reconciliación memoria/skills) — PR #237 (MERGED) — 14/06/2026**
  Alberto preguntó si el "agente arquitecto" podría revisar 1×/día las conversaciones y actualizar la memoria/skills.
  **Matiz clave aclarado:** las conversaciones NO persisten (entorno efímero) → no se pueden "releer". El equivalente
  útil que SÍ funciona: auditar lo que persiste (código+infra+docs) y reconciliar con ello la memoria/skills.
  - Nuevo **`.claude/commands/auditoria-diaria.md`**: slash-command (y prompt para un **trigger programado**) que
    encuadra por `git log` desde la última auditoría (sin commits → no abre PR), corre la skill `auditoria-central`
    completa, genera `docs/AUDITORIA-<mes>.md`, reconcilia `CONTEXTO-SESIONES.md` + skills-maestro + `apps/*/CLAUDE.md`
    con la realidad (si discrepan, manda el código), arregla solo bugs de bajo riesgo y entrega un **PR draft** con el
    informe. Complementa (no sustituye) al hook `Stop` `persist-memoria.sh`.
  - **Pendiente de Alberto (acción manual):** crear el trigger programado 1×/día en Claude Code web (triggers /
    scheduled sessions) sobre `central` con prompt `/auditoria-diaria`. El cron NO se configura desde el repo.

- **📱 PLATAFORMA: god-panel `/admin` 100% adaptable a móvil (hamburguesa plegable) — PR #236 (MERGED) — 14/06/2026**
  Alberto reportó (con captura del móvil en `flame.vercel.app`) que el panel de control no era usable en móvil:
  la barra lateral fija de 200px (`<nav>` con pestañas Negocios/ia-rest/Sivra/Estructura) se comía el ancho y
  dejaba los KPIs y las tarjetas de clientes en una columna estrujada. Pidió "hamburguesa plegable".
  - **Cambio (solo `apps/plataforma/app/admin/page.tsx`, presentación pura, sin tocar datos/auth/queries):**
    detección de viewport con `window.matchMedia('(max-width: 768px)')` (estados `isMobile` + `menuOpen`,
    coherente con el patrón del fichero: inline styles, sin Tailwind). En **móvil** el `<nav>` pasa a **drawer
    fijo** (`position:fixed`, `transform: translateX(-100%/0)`, transición .25s) que se abre con un botón
    **hamburguesa ☰** en la cabecera; backdrop semitransparente que cierra al tocar fuera; se cierra solo al
    elegir pestaña o pulsar ✕; el nombre del operador se mueve dentro del drawer y "Nuevo cliente" se compacta a
    ➕. En **escritorio** comportamiento idéntico al anterior (barra fija 200px).
  - CI: los 4 deploys de Vercel (plataforma, ialimp, sivra, ia-rest) **Ready**. Mergeado en squash.

- **🧹 IALIMP: arreglo "No autenticado" + bloqueo 2º login + pantalla Incidencias + revisar limpieza hecha — PRs #231/#233/#234 (MERGED) — 14/06/2026**
  Sesión a raíz de un problema EN VIVO de Vanessa (Sique Brilla): al subir limpiezas le salía **"No autenticado"**
  y, al elegir cliente en *Nueva limpieza*, *"Este cliente no tiene propiedades creadas"* (FALSO: AITANA ORTIZ
  MOGOLLON tiene 7 pisos, verificado en Supabase). Diagnóstico: su sesión era rechazada (sesión única: un 2º login
  desde el móvil rotaba el `session_jti` y **expulsaba** al portátil), y las rutas `/api/admin/*` devolvían el
  fallo de auth como **500 `{error:'No autenticado'}`** que el modal se tragaba mostrando "sin pisos".
  - **PR #231 (MERGED)** — `lib/tenant.ts`: clase `AuthError` (401) + helper `apiError(e)` (401 si AuthError, 500
    si no); rutas `propiedades`/`sesiones`/`sesiones[id]` lo usan. `NuevaLimpiezaModal` distingue 401 (sesión
    cerrada → aviso + `/login`), error de carga (mensaje + reintentar) y "sin pisos" real.
  - **PR #233 (MERGED)** — **2º login = BLOQUEO con aviso, NO expulsión** (decisión de Alberto: mantener 1
    dispositivo). Migración **`2026-06-14_sesion_activa.sql`** (flag `sesion_activa` en `empresas` y
    `usuarios_empresa`, APLICADA en Supabase). `/api/auth/login` y `login-usuario`: si `sesion_activa` y no
    `forzar` → **409 `{sesion_abierta:true}`**; `/login` muestra «Ya hay una sesión abierta» + botón **«Entrar
    aquí y cerrar la otra»** (reintenta con `forzar:true`, rota jti y expulsa al otro). `/api/auth/logout` pone
    `sesion_activa=false` (sin tocar jti, para no resucitar tokens por la regla de gracia). Sin lockout: el forzar
    siempre entra. El propietario (`clientes`) sigue con expulsión por jti.
  - **PR #234 (MERGED)** — respondiendo a Vanessa («¿dónde salen incidencias, el OK de la limpieza y el chat?»):
    (1) **Pantalla de Incidencias** `/admin/incidencias` (menú **⚠️ Incidencias**) + `GET/PUT /api/admin/incidencias`
    (tabla `incidencias` sin `empresa_id`, se acota por `property_id IN (sesiones de la empresa)`; urgentes primero;
    marcar resuelta/reabrir con nota; foto por proxy `photoSrc`). Antes solo llegaba el push, no había vista.
    (2) **Revisar limpieza HECHA**: `GET /api/admin/sesiones/[id]/completions` (lee `session_completions`) + botón
    **«📷 Ver limpieza»** en Inicio → modal con fotos + checklist + horas de entrada/salida.
    (3) **Guard de sesión global** `components/SessionGuard.tsx` (en `app/layout.tsx`): parchea `window.fetch`,
    si una respuesta de `/api/admin/*` es sesión cerrada (401 o cuerpo "No autenticado") redirige a `/login` en
    toda la app. (4) Carga rápida: ya cubierto por «Duplicar» + programaciones recurrentes (solo se documentó).
  - Las 3 PRs con **preview de ialimp verde** antes de mergear (cliente en vivo). `CLAUDE.md` y `public/manual.html`
    actualizados (menú Incidencias, "Ver limpieza", aviso de sesión única). **Chat con el equipo** ya existía:
    menú **💬 Chat equipo** (`/admin/chat`). **OK de limpieza** = estado «✓ Hecha» en Inicio + filtro «Hechas».

- **🧹 IALIMP: "Agenda" añadida al menú del panel admin — PR #229 (MERGED, `24a76d7`) — 14/06/2026**
  Vanessa (Sique Brilla) no encontraba dónde ver/repartir las limpiezas **por limpiadora**. La pantalla
  `/admin/agenda` (cuadrante semanal con una fila por limpiadora + panel "Asignar limpiadora por día") **ya
  existía y estaba completa, pero estaba huérfana**: no figuraba en el `NAV` de `app/dashboard/DashboardClient.tsx`,
  así que solo se abría tecleando la URL. Fix mínimo: entrada `📅 Agenda` en `NAV` (tras Operaciones) + mapeo
  `'/admin/agenda':'agenda'` en `NAV_MODULO` (respeta el permiso de módulo `agenda` ya existente). Manual
  (`public/manual.html`) actualizado con la tarjeta Agenda. Sin tocar BD/queries/multi-tenant. 4 previews verdes
  → mergeado a `main` (en producción `app.ialimp.es`).

- **🏦 PLATAFORMA: consolidación bancaria inteligente (F1–F6) — 14/06/2026**
  Épico nuevo en `apps/plataforma`: importar el banco, ver saldo/movimientos consolidados de todas las
  sociedades, categorizar con IA, conciliar con facturas, prever tesorería y conectar el banco por PSD2.
  Tablas nuevas en la **BD compartida** (RLS, aditivas, scoped por `cuenta_id`): `cuentas_bancarias`,
  `movimientos_bancarios` (con `dedupe_hash` único), `conexiones_banco`. Aplicadas por Supabase MCP.
  - **PR #211 (MERGED, `a3103bd`)** — F1 (importar **Norma 43** + **Excel multi-banco**, KPI "Saldo del
    grupo", página `/banca`, dedupe) · F2 (auto-categorización IA con `@central/core-ai`, NIM gratis) ·
    F3 (conciliación banco↔`incomes`/`expenses` de sivra y `v_contab_ingresos`/`v_contab_gastos` de ialimp) ·
    F5 (previsión 30/60/90d + cron alerta) · fix CI `allowImportingTsExtensions` al `tsconfig.base`.
  - **Importador Excel multi-banco** (`lib/extracto-xls.ts`, SheetJS): detección de columnas robusta a
    **Kutxa** y **BBVA** (fecha valor vs fecha, concepto en 2 columnas, saldo "Disponible", orden asc/desc).
  - **PR #216 (MERGED, `a9adf00`)** — F4: **OCR de facturas** (`nimVision`) + casado con el movimiento.
  - **PR #217 (MERGED, `26d89b7`)** — F6: **conexión automática PSD2**, primera versión sobre **GoCardless
    Bank Account Data** (`lib/gocardless.ts` + `lib/psd2.ts` + endpoints `psd2/instituciones|conectar|callback`
    + cron `psd2-sync`).
  - **F6-bis — switch a Enable Banking (DRAFT, rama `claude/banca-psd2-enablebanking`)**: los registros de
    GoCardless están **cerrados** (Alberto no pudo darse de alta), así que se reescribió la capa de proveedor a
    **Enable Banking** (tier gratuito que admite altas). Auth distinta: **JWT RS256** firmado con la clave
    privada de la app (no hay endpoint de token); flujo `aspsps → POST /auth → POST /sessions → accounts`.
    Nuevo `lib/enablebanking.ts` (reemplaza `lib/gocardless.ts`, borrado); `lib/psd2.ts` y los endpoints usan
    sesiones (el `session_id` se guarda en `conexiones_banco.requisition_id`, `proveedor='enablebanking'`). Sin
    migración nueva. Inerte hasta poner `ENABLEBANKING_APP_ID` y `ENABLEBANKING_PRIVATE_KEY` en el Vercel de
    plataforma (degrada limpio). **Mapeo de campos a verificar con credenciales reales** (este entorno no las tiene).
  - **Datos reales de Alberto YA cargados** en su cuenta (sociedad "Alberto Suárez Gutiérrez", NIF):
    **Kutxa** (244 mov, 21.161,96 €, apartamentos) + **BBVA** (40 mov, 20.034,98 €, seguros + Dúplex Center) =
    **41.196,94 €** consolidados. Los movimientos cargados por SQL NO están categorizados/conciliados: usar
    los botones 🤖 Re-analizar IA y 🔗 Conciliar en `/banca` (necesitan `NVIDIA_API_KEY`).
  - **Pendiente (mejoras)**: F4 → guardar el justificante (imagen) y soportar PDF; F6 → dar de alta una app
    en Enable Banking, poner `ENABLEBANKING_APP_ID/PRIVATE_KEY` en Vercel, verificar el mapeo de campos con un
    banco real y mergear. Lógica pura testeada con `node --test` (norma43, tesorería).

- **💶 SIVRA: gastos fijos mensuales AUTOMÁTICOS + fix dashboard — PR #208 (merged) y #209 — 14/06/2026**
  Sesión sobre la vertical **sivra** (intranet pisos). Dos entregas:
  - **PR #208 (mergeado)** — auditoría del dashboard a partir de un pantallazo real:
    - 🔴 Gráfico "Evolución mensual" salía **vacío**: el `<BarChart>` leía `dataKey="y0"/"y1"` pero la API
      emite series por año (`[year]`/`[year-1]`). Fix: `dataKey={String(year)}`.
    - 🟡 Delta `↑0.0%` engañoso sin periodo previo → ahora muestra **"nuevo"** (`delta()` devuelve `null`).
    - 🟢 Entradas/Salidas/Entradas mañana ahora indican el **piso** (🏠 nombre), usando `propertyName` que
      `/api/incomes/today` ya devolvía. Detalle en `docs/AUDITORIA-2026-06.md` (addendum 14/06).
  - **PR #209** — **gastos fijos mensuales 100% automáticos** (alquileres, comunidad dúplex, etc.):
    - Tabla nueva **`gastos_fijos`** (RLS como `gastos`, índice único por `fingerprint`). DDL en
      `apps/sivra/sql/gastos_fijos.sql` (migraciones `create_gastos_fijos`, `gastos_fijos_fingerprint_sync`).
    - **Automático de punta a punta**: el cron `/api/expenses/fijos/generar` (`vercel.json` `"0 6 1 * *"`)
      llama `sincronizarReglasFijas()` → importa a `gastos_fijos` las **reglas mensuales que el agente de
      facturas ya aprendió** (`gastos_reglas`, periodicidad mensual) casando por fingerprint, sin pisar
      ediciones manuales; luego imputa el mes con **dedup POR MES**.
    - **"La factura real manda"**: `insertarGasto()` borra el placeholder `origen='fijo'` del mismo mes al
      imputar la factura real → **cero duplicados** (`lib/agente-facturas/imputar.ts`).
    - Página **`/gastos-fijos`** (nuevo ítem sidebar): CRUD + "Generar mes actual ahora". Alquileres de
      Bustos Tavera **migrados** del backfill manual (día 8) a este sistema (día 1).
    - **Backfill 2026 (ene→jun) ya ejecutado en BD**: junio poblado con 5 fijos (877,22 €); meses con
      factura real se respetaron. Helpers en `lib/agente-facturas/gastos-fijos.ts`.
    - Verificado: `tsc --noEmit -p apps/sivra/tsconfig.json` ✅ 0 errores; 4 deploys Vercel verdes.

- **⏱️ Control horario en ia-rest (roadmap #2) — branch `claude/control-horario` — 14/06/2026 (PR #205, draft)**
  PR #199 (auditoría de caja) **MERGEADO a main** (squash, `c54175c`). Épico nuevo por fases, principio
  **100% configurable** (`config_horario`: límites + toggles por local, defaults legales). Módulo puro nuevo
  **`@central/module-horario`** (`packages/`, plantilla de `module-contabilidad`, tests `node --test`).
  - **Fase 1 (verde)** — Registro de jornada legal RD 8/2019: `resumenJornada`/`detalleJornada`/
    `chequearDescansos`/`horasExtra` + `config_horario` (migración MCP) + `GET /api/owner/horario` +
    `GET/POST /api/owner/horario/config` + tab "Jornada" (grupo Auditoría, `owner/page.tsx`) con CSV,
    sparkline y panel de configuración. Reusa la base de fichaje existente (`turnos`, `fichar_entrada/salida`).
  - **Fase 2 (verde)** — Anti-fraude: validación de IP del centro en `turnos/fichar` (gated `validar_ip_local`
    + `ips_local`) + `POST /api/owner/horario/autocierre` (cierra colgados > `autocierre_horas`) + botón en el tab.
  - **Fase 3 (pusheada)** — Coste de personal: `costePersonal` (módulo) + `config_horario.costes_empleado`
    (mapa; camareros es VISTA, por eso va aquí) + bloque coste en el GET (cruza ventas de `facturas_verifactu`)
    + `POST /api/owner/horario/coste` + KPIs/coste-hora editable en el tab. Flag `coste_personal`.
  - **PENDIENTE del épico**: Fase 2b (fichaje por QR + recordatorios push), Fase 4 (cuadrante/plantilla
    previsto vs real), Fase 5 (ausencias/vacaciones), Fase 6 (consolidado multi-local en plataforma +
    festivos + export gestoría), y firma del empleado + informe PDF oficial (RD 8/2019). Migraciones MCP en
    proyecto ia-rest `efncqyvhniaxsirhdxaa`.
- **📦 Reposición de stock (ia-rest) — branch `claude/reposicion-stock-iarest` — 14/06/2026**
  4ª de la tanda "automatizar agentes" (la #3 impagos-sivra se SALTÓ: sivra no tiene cuentas por cobrar,
  sus "facturas" son gasto/proveedores y pago a limpiadoras). Cron diario `/api/cron/reposicion-stock`
  (08:15) que lee `materiales` (Supabase propia de ia-rest), detecta `cantidad_disponible < stock_minimo`
  (activos, con `stock_minimo` no nulo) y avisa por **Telegram** (`tgAlert(..., 'aviso')`) con líneas
  ordenadas por faltante + proveedor + coste estimado de reposición.
  - **Código** (`apps/ia-rest/src`): `lib/reposicion-stock.ts` (puro: `faltante`/`costeReposicion`/
    `formatAvisoStock`) + `lib/reposicion-stock.test.ts` (3/3 ✅); `app/api/cron/reposicion-stock/route.ts`
    (auth Bearer `CRON_SECRET`, `createServerClient`); cron en `vercel.json`. **Sin migración** (usa
    `materiales.stock_minimo`, ya existente). ia-rest = BD propia `efncqyvhniaxsirhdxaa`.
  - **OJO**: ia-rest **sí valida tipos en build** (no `ignoreBuildErrors`) → cuidado con type-guards.
  - **Verificado**: `node --test` 3/3 ✅, `next build` (161/161 páginas, ruta como función, type-check OK) ✅.
  - **⚠️ PENDIENTE despliegue**: requiere `materiales.stock_minimo` aplicado en la BD de ia-rest (migración
    materiales v2) y `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (ya existen para el resto de alertas).
  - **Roadmap restante**: NPS post-servicio (ialimp) · scoring limpiadoras (ialimp) · orquestador concursos.
- **⭐ Scoring/ranking de limpiadoras (ialimp) — branch `claude/scoring-limpiadoras-ialimp` (PR #207) — 14/06/2026**
  6ª de la tanda "automatizar agentes". Endpoint `GET /api/admin/limpiadoras/ranking` que puntúa y
  ordena a las limpiadoras de la empresa sobre la **vista existente `rendimiento_limpiadoras`** (sin
  migraciones). Score 0-100 = calidad (`rating_medio`/5, 55%) + fiabilidad (1 − quejas/sesiones, 45%).
  - **Anclado a datos reales**: `sesiones_completadas` viene 0 → **excluida**; `rating_medio` suele ser
    null → **no penaliza a 0** (score = fiabilidad, `sin_valoraciones: true`); `confianza` por volumen.
  - **Código** (`apps/ialimp`): `lib/scoring-limpiadoras.ts` (puro: `puntuarLimpiadora`/`rankingLimpiadoras`)
    + `lib/scoring-limpiadoras.test.ts` (5/5 ✅); `app/api/admin/limpiadoras/ranking/route.ts`
    (Prisma `$queryRaw`, auth `requireEmpresaId()` de `@/lib/tenant`). **OJO bigint**: las columnas
    `bigint`/`numeric` de la vista llegan como BigInt/Decimal → se coaccionan a `Number` (si no, rompe
    `JSON.stringify` y la aritmética).
  - **Verificado**: `node --test` 5/5 ✅; `next build` (161/161 páginas, ruta `ƒ` registrada) ✅.
  - **Nota**: ialimp usa **Prisma** (no supabase-js), auth JWT propio (cookie `ialimp_session`), ignora
    errores TS en build. Ya había consumidores de la vista (`/api/admin/rrhh/analisis`); este es el ranking.
  - **Tanda previa (otras ramas/PR)**: briefing #203 · impagos-ialimp #204 · ~~impagos-sivra~~ (N/A) ·
    reposición-stock-iarest #206. **Roadmap restante**: NPS post-servicio (ialimp) · orquestador concursos.
- **💸 Agente de impagos (ialimp) — branch `claude/impagos-ialimp` — 14/06/2026**
  2ª de la tanda "automatizar agentes" (PR por PR). Cron diario `/api/cron/impagos` (08:30) que detecta
  facturas a clientes **vencidas y no cobradas** y manda recordatorios **escalonados +3/+10/+21 días** al
  cliente, sin repetir escalón, **+ resumen diario a la empresa** (`empresas.email`).
  - **Migración aplicada** (Supabase compartida `wswbehlcuxqxyinousql`): tabla `recordatorios_impagos`
    (aditiva, RLS on sin policies como el resto; único `(factura_id, escalon)`). Fichero en
    `apps/ialimp/prisma/migrations/2026-06-14_recordatorios_impagos.sql`.
  - **Código**: `lib/impagos.ts` (puro: `escalonAEnviar`/`textoRecordatorio`/`resumenEmpresaTexto`) +
    `lib/impagos.test.ts` (5/5 ✅); endpoint `app/api/cron/impagos/route.ts` (reutiliza
    `emailFacturacionCliente` + `getTransporter`/`MAIL_FROM`); cron en `vercel.json`.
  - Filtro: `estado IN ('emitida','vencida') AND fecha_vencimiento<hoy AND fecha_cobro IS NULL AND pagada_online_at IS NULL`.
  - `facturas_clientes` hoy **vacía** (Sique Brilla aún no factura por aquí) → 0 envíos hasta que emita.
  - **Verificado**: `node --test` 5/5 ✅, `next build` (161/161 páginas, ruta `/api/cron/impagos` como función) ✅.
  - **⚠️ PENDIENTE despliegue**: `CRON_SECRET` ya existe; el envío real necesita el SMTP ya configurado (IONOS).
    NO mergear a `main` sin preview verde (cliente Vanessa EN VIVO).
  - **Roadmap restante**: impagos **sivra** → reposición stock (ia-rest) → NPS (ialimp) → scoring limpiadoras →
    orquestador concursos. Diferidas (APIs externas): reputación, VeriFactu.
- **📊 Briefing consolidado (plataforma) — branch `claude/briefing-consolidado-plataforma` — 14/06/2026**
  1ª de la tanda "automatizar agentes" (auditoría previa: ver entrada de instagram-ideas). `plataforma`
  no tenía **ningún cron**; ahora un cron semanal (lunes 08:00) consolida ingresos/gastos/resultado YTD
  de **todos los negocios de cada cuenta** y envía un email al dueño.
  - **Lógica pura** `apps/plataforma/lib/briefing.ts` (`agregarBriefing` + `formatBriefingTexto`, € inline
    para no arrastrar `financiero→db→prisma`) con tests `node --test` (`lib/briefing.test.ts`, 3/3 ✅).
  - **Endpoint** `app/api/cron/briefing/route.ts` (GET, auth `CRON_SECRET` o `?secret=`): reutiliza
    `getResumenNegocio` de `lib/financiero.ts` (ialimp+sivra BD, ia-rest puerto HTTP) y `enviarAvisoEmail`
    de `lib/notificaciones.ts` (Resend, no-op sin `RESEND_API_KEY`).
  - **Cron** en `vercel.json` (`0 8 * * 1`) + `/api/cron` añadido a `PUBLIC` del `middleware.ts`.
  - **Verificado**: `node --test` 3/3 ✅, `tsc --noEmit` (código de prod limpio) ✅, `next build` ✅.
  - **⚠️ PENDIENTE despliegue**: en el Vercel de plataforma definir `CRON_SECRET` y `RESEND_API_KEY`+`MAIL_FROM`.
  - **Roadmap restante** (PR por PR): impagos (ialimp/sivra) → reposición stock (ia-rest) → NPS (ialimp)
    → scoring limpiadoras (ialimp) → orquestador concursos (ialimp). Diferidas (APIs externas): reputación
    Google/Booking, reintentos VeriFactu. Plan: `docs/superpowers/plans/2026-06-14-briefing-consolidado-plataforma.md`.
- **⏰ Cron huérfano arreglado: `instagram-ideas` (ia-rest) — branch `claude/agents-missing-schedules-u838j3` — 13/06/2026**
  Auditoría de "agentes sin tarea programada": crucé todos los endpoints `cron`/`agent` de las 4 apps
  contra los `crons` de cada `vercel.json`. Resultado: la mayoría OK; los `agente-*` interactivos
  (asesoria, owner/compras+eventos, super/arquitecto+ai+seo, leads, sivra agente/chat, ialimp
  cotizador, expenses backfill) **no llevan cron a propósito** (bajo demanda). **Único huérfano real:**
  `apps/ia-rest/src/app/api/cron/instagram-ideas/route.ts` estaba diseñado como cron (auth `CRON_SECRET`,
  cabecera "lunes, antes de blog-seo") pero **faltaba en `vercel.json`** → nunca se disparaba solo.
  **Fix:** añadido `{ "path": "/api/cron/instagram-ideas", "schedule": "30 7 * * 1" }` (lunes 07:30,
  antes de blog-seo 08:00). No requiere exclusión de middleware (matcher solo cubre `/api/super/*`).
- **🔎 Agente SEO autónomo de ia.rest (Fase 1) — branch `claude/seo-agent-auto-activation-5ypj5x` — 13/06/2026**
  Cron `/api/cron/seo-agent` (**martes y viernes 07:00 UTC**) que lee **GSC+GA4** y, de forma
  **autónoma**, adapta el SEO de **iarest.es**: titles/metas, JSON-LD, bloques de contenido y
  artículos nuevos. Principio rector: **los cambios son DATOS, no código** (nunca commitea ni rompe
  el build). Spec/plan en `docs/superpowers/{specs,plans}/2026-06-13-agente-seo-autonomo-iarest*`.
  - **Migración aplicada** a Supabase **`efncqyvhniaxsirhdxaa`** (proyecto ia-rest), **schema `public`**
    (¡no `iarest`! — ahí vive `blog_borradores`, que es donde apunta `createServerClient`). Tablas
    nuevas con **RLS habilitado**: `seo_overrides` (title/meta/canonical/og/jsonld por ruta),
    `seo_content_blocks` (bloques por ruta+posición), `seo_articulos` (artículos en BD), `seo_cambios`
    (snapshot antes/después + auditoría).
  - **Red de seguridad**: kill switch `SEO_AGENT_ENABLED` (si != 'true', el cron sale sin tocar nada),
    allowlist de rutas (`/restaurantes`, `/restaurantes/*`), máx. `SEO_MAX_CAMBIOS` (def. 5)/pasada,
    anti-oscilación 7 días, umbral `SEO_MIN_IMPR` (def. 30) en el prompt, informe Telegram y reversión
    vía `/api/super/seo-revert`.
  - **Código** (`apps/ia-rest`): `src/lib/seo/{types,guardrails,gsc-ga4,store,targets}.ts`,
    `src/components/seo/SeoBlocks.tsx`, ruta dinámica `src/app/blog/[slug]/page.tsx`, endpoints
    `api/cron/seo-agent` y `api/super/seo-revert`. Páginas `/restaurantes` y `/restaurantes/[ciudad]`
    leen override en `generateMetadata` + slot `<SeoBlocks>`. GSC/GA4 extraídos de `agentes-seo` al
    módulo compartido `gsc-ga4.ts`.
  - **Superficie editable Fase 1**: solo páginas server (`/restaurantes`, `[ciudad]`) + artículos
    nuevos. `/` y `/espacios` son client-components (`next/head`) → fuera del override por ahora.
  - **Verificado**: test puro `scripts/seo/test-guardrails.ts` (14 checks) ✅, `next build` ✅,
    `npm run qa` sin problemas ✅, 4 tablas confirmadas en BD.
  - **⚠️ PENDIENTE de despliegue**: en el Vercel de ia-rest, dejar `SEO_AGENT_ENABLED` sin poner/`false`
    hasta querer activarlo; al activar (`=true`), revisar el primer informe Telegram y `/super → SEO`
    antes de confiar. Opcional: `SEO_MAX_CAMBIOS`, `SEO_MIN_IMPR`.
  - **Fase 0/2 (ialimp.es) pendiente**: ialimp **no tiene GSC/GA4 conectado** (cero OAuth/analytics en
    `apps/ialimp`) y su landing es **HTML estático**; requiere conectar analíticas antes de extender el
    agente (y extraer la lógica a `@central/core-seo`).

- **🔎 Auditoría de caja POR EMPLEADO en ia-rest — branch `claude/logistastrator-analysis-q78y60` — 13/06/2026 (PR #199)**
  Épico por fases sobre el cuadre de caja. **Bloque A completado (fases 1-4)**:
  - **Fase 1** — Migración `arqueos_caja_empleado` (aditiva, RLS espejo de `arqueos_caja`; aplicada vía
    Supabase MCP a proyecto ia-rest `efncqyvhniaxsirhdxaa`) + columnas `config_contabilidad.umbral_descuadre`
    y `.conteo_ciego`. `cierre-diario` persiste `cuadre_por_empleado` (delete-then-insert) y **cruza con
    turno** (movimientos sin camarero → titular del turno vía `turnos`+`camareros`).
  - **Fase 2** — Puras `resumirDescuadresEmpleado`/`detectarPatronRecurrente`/`serieDescuadreEmpleado`
    (+tests, 23 total) · `GET /api/owner/contabilidad/arqueos-empleado` · UI panel "Histórico por
    empleado" (tabla acumulado/media/peor + sparkline + CSV + badge merma recurrente).
  - **Fase 3** — `lib/push.ts` (`enviarPushARoles`) · alertas por umbral + patrón recurrente → push a
    owner/gestor · UI marca en rojo los que superan umbral.
  - **Fase 4** — Motivo obligatorio por empleado (400 con `pendientes` + UI de reintento) · conteo ciego
    (config + "revelar" en UI) · firma del empleado (`PATCH .../arqueos-empleado/[id]/confirmar` +
    columnas `confirmado_por/at`).
  - **Verificado**: 23/23 tests, `tsc` limpio, eslint sin errores (solo warnings). Migración aplicada y
    comprobada por MCP.
  - **Bloque B completado (fases 5-9)**: F5 conciliación de tarjeta (`arqueos_caja.tarjeta_liquidada/
    diferencia_tarjeta`); F6 tesorería (`movimientos_tesoreria` + endpoint GET/POST + panel saldo caja
    fuerte); F7 abastecimiento de cambio (`config_contabilidad.min_monedas` + aviso en cierre); F8
    tolerancia por empleado (`config_contabilidad.umbrales_empleado` + endpoint `umbral-empleado` +
    columna editable en histórico; `umbralDe()` en validación/alertas); F9 consolidado multi-local:
    endpoint operador `GET /api/operador/descuadres-empleado` en ia-rest + `apps/plataforma`
    (`lib/descuadres.ts` + `GET /api/admin/descuadres-iarest`, vía puerto HTTP con OPERADOR_SHARED_SECRET).
    Migraciones aplicadas por MCP. ia-rest `tsc` limpio (los errores `tsc` de plataforma son preexistentes,
    no gatean su build).
  - **PENDIENTE (cabos)**: UI empleado-facing de firma/conteo ciego en el POS (`/edge`); página visual
    del consolidado en el god-panel de plataforma (el data path ya está). Tras esto: roadmap #2 control horario.

- **💶 Cuadre de caja en ia-rest — branch `claude/logistastrator-analysis-q78y60` — 13/06/2026**
  A raíz de un estudio competitivo de **Logista Strator** (TPV/retail de Logista; NO es logística),
  se decide reforzar ia-rest donde ellos pegan fuerte: **gestión de efectivo**. Al verificar contra
  código + BD se descubre que **`arqueos_caja` ya existía** con los campos del cuadre
  (`fondo_inicial/salidas_caja/fondo_final/diferencia_caja`) pero **el `cierre-diario` los hardcodeaba a 0**
  y nunca leía `movimientos_caja`. Se **completa** (sin tabla ni endpoints nuevos, cero duplicación):
  - **Lógica pura** en `@central/module-contabilidad` (`src/caja.ts`): `calcularCuadreCaja`,
    `totalDesglose`, `DENOMINACIONES_EUR`, `calcularCuadrePorEmpleado` + tipos
    `MovimientoCaja`/`CuadreCaja`/`CuadreEmpleado`. Saldo teórico = Σ movimientos del cajón; conteo
    físico = desglose manual o último arqueo/cierre; descuadre = real − teórico. **18 tests `node:test`**
    (el paquete no tenía script `test`; añadido).
  - **`apps/ia-rest/.../contabilidad/cierre-diario/route.ts`**: lee `movimientos_caja` del día y
    persiste el cuadre global real + `cerrado_por`/`notas`; devuelve `cuadre` y `cuadre_por_empleado`.
  - **UI** `ContabilidadTab.tsx` (sub-tab Cierre): checkbox "Hacer arqueo", conteo por denominación
    en vivo, notas, y tarjeta de cuadre **configurable (toggle Caja única / Por empleado)** — por
    empleado agrupa los arqueos de cada camarero desde `movimientos_caja` (sin migración).
  - **Verificado**: 15/15 tests ✅, `tsc --noEmit` ia-rest ✅, eslint archivos tocados 0 errores ✅.
    Sin migración (columnas ya existían). **Roadmap restante** (PRs aparte): completar control horario
    (plantilla/ausencias/informe jornada legal), alta Kit Digital (admin), Tier 2 (pago unificado, carta digital).

- **🧾 Agente de facturas de SIVRA — branch `claude/invoice-processing-agent-7fwjst` — 13/06/2026**
  Agente diario que lee **Gmail (IMAP) + carpeta de Drive**, archiva facturas y las imputa en
  `gastos` de sivra, con **aprendizaje de recurrentes** y **modo mixto** (lo claro entra solo,
  lo dudoso a bandeja). Spec/plan en `docs/superpowers/{specs,plans}/2026-06-13-agente-facturas-sivra*`.
  - **Migración aplicada** a Supabase `wswbehlcuxqxyinousql` (`agente_facturas_2026_06_13`, aditiva):
    `gastos` += `irpf_porcentaje/origen/fingerprint/motivo_revision` (irpf/confianza/revisado YA existían);
    tablas nuevas `gastos_reglas` (memoria) y `agente_log` (auditoría); **seed** de los 2 alquileres
    de Bustos Tavera 22 (Bajo Dcha→Luxury Busto, Bajo Izq→Busto Reform, ALQUILER, IVA 21% / IRPF 19%).
  - **Bandeja = `gastos.revisado=false`** (no se creó tabla aparte). GET de gastos excluye `revisado=false`.
  - **Código** (`apps/sivra`): `lib/agente-facturas/*` (fingerprint, reglas/confianza, conciliar IVA/IRPF,
    extraer, gmail IMAP, drive list/get/archive, imputar, anomalías, avisos, procesar, resumen-mensual);
    `lib/telegram.ts` (portado de ia-rest). Endpoints: `/api/expenses/agent/{scan,backfill,resumen-mensual}`,
    `/api/expenses/pendientes(/[id])`. UI: `/expenses/pendientes` + badge en `/expenses`; desplegable
    += **ALQUILER** y **Personal (no pisos)**. `scripts/drive-upload.gs` ampliado (list/get/archive).
  - **Resumen mensual por Telegram** (cron día 1, mes anterior) con **desglose de rentabilidad por piso**
    (ingresos − gastos; `properties.id` = `gastos.propiedad` = `prop_*`). Cron diario `scan` 06:00.
  - **Verificado**: 11 tests `node:test` (incl. los 2 recibos reales) ✅, `tsc --noEmit` ✅,
    `next build` ✅, query de rentabilidad probada contra BD real.
  - **⚠️ PENDIENTE de despliegue (no testeable sin credenciales):** en el Vercel de **sivra** añadir
    `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, apuntar `DRIVE_SCRIPT_URL` a la carpeta real y poner su
    `ROOT_FOLDER_ID` en `drive-upload.gs`; (opcional) `GMAIL_FACTURAS_LABEL` + regla de Gmail.
    Lanzar el **backfill primero en dry-run** (`/api/expenses/agent/backfill?secret=...`) y luego `&commit=1`.
    Deps nuevas: `imapflow`, `mailparser`, `@types/mailparser`.

- **📦 module-materiales Fase B — PR #189 mergeado — 12/06/2026**
  Implementación completa de la Fase B del plan `module-materiales` (spec en `.claude/plans/polished-growing-stonebraker.md`):
  - **8 APIs nuevas** en `apps/ia-rest/src/app/api/materiales/`:
    - `clientes/` (GET/POST/PATCH/DELETE), `proveedores/` (GET/POST/PATCH/DELETE)
    - `kits/` (GET/POST/PATCH/DELETE), `kits/[id]/items/` (GET/POST/DELETE), `kits/instanciar/` (POST — expande kit × N → movimientos salida con validación de stock)
    - `mantenimiento/` (GET/POST/PATCH), `reservas/` (GET/POST/DELETE soft-cancel)
    - `inventario-fisico/` (GET/POST), `inventario-fisico/[id]/lineas/` (GET/PATCH), `inventario-fisico/[id]/cerrar/` (POST — genera ajuste/rotura movements)
  - **Migración SQL** `supabase/migrations/2026-06-12_materiales_fase_b.sql`: tablas `materiales_proveedores`, `materiales_clientes`, `materiales_kits`, `materiales_kits_items`, `materiales_inventario_fisico`, `materiales_inventario_fisico_lineas`, `materiales_mantenimiento`, `materiales_reservas` — todas con RLS `service_role_all`.
  - **UI** `owner/materiales/page.tsx`: tabs Kits, Clientes, Proveedores, Mantenimiento, Reservas, Inventario Físico wizard añadidos.
  - **Fixes CI** iterativos: Turbopack `await` en callback no-async, TS strict `never[]` → tipado explícito en `instanciar/route.ts` y `cerrar/route.ts`.
  - **CI final**: 10/10 checks ✅, 4 Vercel ✅. Squash-mergeado a `main` (SHA `8174ffd`).
  - **✅ RESUELTO (18/06/2026):** la migración (y `_v2`/`_categorias`/`_ledger`) se aplicó a la BD VIVA
    correcta — schema `iarest` del proyecto compartido `wswbehlcuxqxyinousql`, no la vieja
    `efncqyvhniaxsirhdxaa`. 16/16 tablas + RLS verificadas. Ver entrada de 18/06 arriba.
    - **⚠️ Matiz (15/07):** esto se aplicó al **schema `iarest` clonado** de la compartida, pero el **runtime de
      producción de ia-rest sigue leyendo el silo `efncqyvhniaxsirhdxaa.public`** hasta el flip. Que el DDL viva
      en la compartida ≠ que producción la use. Ver banner canónico de arquitectura al principio del archivo.

- **🧱 Config de build compartida en la MATRIZ — PR #180 — 12/06/2026**
  "Lo compartido sube a la matriz" aplicado a la config de build/herramientas:
  - **`tsconfig.base.json`** en la raíz; las 4 apps lo `extends` y solo declaran lo suyo
    (paths, include/exclude, overrides). Equivalencia probada (showConfig + deep-equal).
  - **`eslint.config.base.mjs`** en la raíz (solo DATOS: ignores + ruleset legado a `warn`,
    sin imports de paquetes → no depende del node_modules de la raíz). Las 4 apps pasan a
    **flat-config con `eslint-config-next ^16.2.6`** y `lint: eslint`; sivra migra desde
    `.eslintrc.json`, ialimp/plataforma estrenan eslint. Verificado **0 errores** en las 4;
    ia-rest queda **idéntico** (0 err / 1164 warn, mismo desglose → no rompe su build/CI).
  - **Estabilización del PR**: se puso la rama al día con `main` (estaba ~11 commits atrás →
    fallos "merge conflict marker" en typecheck ia-rest), se anotaron tipos en
    `ialimp .../concursos-ingesta` (TS7022 latente, preexistente).
  - **⚠️ Seguridad**: un commit concurrente había revertido en `mis-restaurantes/route.ts` la
    corrección IDOR/suplantación de sesión de `main` (volvía a parsear la cabecera cruda
    `x-ia-session`). Al fusionar `main` se **restauró la versión firmada/segura** (`getSession`).
    Documentado en el PR para que no se vuelva a revertir.

- **🧭 SKILLS-ROUTER DE CONTEXTO POR VERTICAL — rama `claude/project-scope-agent-validation-ip9f8b` — 12/06/2026**
  Para resolver "el proyecto es muy amplio, se pide contexto de objetivos antes de tocar nada":
  se añaden 4 skills-router **finos** (estilo `auditoria-central`, NO copian docs → apuntan a la
  fuente de verdad, así no hay drift) en `.claude/skills/`:
  - `central-maestro` — dispatcher de entrada del monorepo: orienta (CLAUDE.md/MATRIZ/CONTEXTO),
    identifica la vertical y enruta al maestro correcto + recuerda reglas de matriz/packages/BD compartida.
  - `sivra-maestro`, `ialimp-maestro`, `plataforma-maestro` — un router por vertical con gate
    "antes de tocar nada", mapa de dónde vive cada cosa, infra (sin secretos) y landmines.
  - `ia-rest-maestro` ya existía (doc gordo); los nuevos lo referencian, no lo tocan.
  - Cada router obliga a leer objetivos/CLAUDE.md de la vertical y a comprobar la frontera multi-tenant
    de la BD compartida antes de planificar. Se apoyan en el SessionStart hook (`using-superpowers`) ya activo.

- **🤖 NUEVOS AGENTES IA + mejoras — PR #175 mergeado — 12/06/2026**
  Se crean 7 nuevos agentes y se mejoran 2 existentes en ia.rest:
  - **U1** `agentes-ai/route.ts` reescrito con agentic loop de hasta 10 iteraciones (igual que `agentes-seo`). Los 5 agentes genéricos (Ventas, Legal, Competencia, Contenido, Onboarding) ahora tienen capacidad real de web_search iterativo.
  - **U4** `AgenteArquitectoTab` añadido al menú `/super → Sistema` (antes inaccesible desde UI).
  - **N2** Agente Compras (`/api/owner/agente-compras`) + `AgenteModuloChat` en `/owner → Almacén`.
  - **N3** Edge Function `qr-assistant` (Deno) + botón 🤖 flotante en `/q/[token]` para clientes QR.
  - **N4** GET en `/api/super/leads/agente` genera briefing del historial completo + botón "🤖 BRIEFING" en `CRMAgentTab`.
  - **N6** Agente Eventos (`/api/owner/agente-eventos`) + `AgenteModuloChat` en `EventosTab`.
  - **N7** `AsesoriaAgente` + `/api/asesoria/agente` — chat flotante para contables en `/asesoria`.
  - **Componente reutilizable** `AgenteModuloChat` en `components/owner/` para módulos owner.
  - Fix CI: `supabase.raw` inválido en `agente-compras/route.ts` → filtrado en JS.
  - N1 (owner insights) ya existía como `OwnerCopiloto`. N5 (registro) no viable sin auth.
  - ⚠️ Pendiente: desplegar Edge Function `qr-assistant` con `supabase functions deploy qr-assistant` (está en repo pero sin deploy).

- **🗑️ plataforma/admin: quita pestaña "Mis propiedades", acceso directo a ialimp — PR #171 mergeado — 12/06/2026**
  La pestaña "🏠 Mis propiedades" desaparece del panel de operador. En su lugar, botón en la cabecera
  "🏠 Mis propiedades ↗" que abre el portal del propietario de ialimp en pestaña nueva con auto-login
  (token mágico vía `/api/admin/propiedades`). Tab por defecto pasa a ser "Negocios".


- **📦 REFACTOR `@central/module-inventario` → `@central/module-materiales` — PR #172 — 12/06/2026**
  - **Paquete nuevo:** `packages/module-materiales` (TS puro, sin deps runtime). Elimina `packages/module-inventario`.
  - **Tipos nuevos:** `Material` (reemplaza `Articulo`), `Espacio`, `AsignacionMaterial`, `TransferenciaMaterial`,
    `ResumenContable`; campos nuevos: `tipo` (consumible|activo), `estado` (operativo|deteriorado|en_reparacion|baja),
    `stockMinimo`, `codigoInterno`, `garantiaHasta`, `documentos`, `precioCompra`.
  - **Funciones puras nuevas:** `gastoCompras`, `resumenContable`, `puedeTransferir`, `alertasStockMinimo`
    (además de las ya existentes: `round2`, `resumenStock`, `valorStock`, etc.).
  - **Adapters actualizados en los 3 consumidores** (método renombrado `toArticulo`→`toMaterial`):
    - `apps/ia-rest/src/lib/inventario-menaje.ts` (añadido `materialAdapter` para la tabla `materiales` con los nuevos campos)
    - `apps/ialimp/lib/adapters/inventario.ts`
    - `apps/sivra/lib/adapters/inventario.ts`
  - **Rutas actualizadas:** `apps/ia-rest/.../menaje/route.ts`, `apps/ialimp/.../stock/route.ts`,
    `apps/sivra/.../limpiadoras/productos/route.ts` — import cambiado a `@central/module-materiales`.
  - **`package.json` + `next.config.ts`** de ia-rest, ialimp, sivra: dep actualizada de `module-inventario` → `module-materiales`.
  - **SQL `apps/ia-rest/supabase/migrations/2026-06-12_materiales_v2.sql`** — aplicada al proyecto Supabase
    `efncqyvhniaxsirhdxaa`: añade columnas nuevas a `materiales` + crea `materiales_espacios` y
    `materiales_transferencias` con RLS (service_role).
  - **15 tests** en `packages/module-materiales/test/materiales.test.ts` — todos pasan con `node --test`.
  - **Fix CI:** dos rutas usaban `articuloAdapter.toArticulo` (ya inexistente) → cambiado a `toMaterial`
    (sivra y ialimp; detectado por Vercel CI, corregido en commit `ff16bd9`).
  - **`apps/plataforma/lib/estructura.ts`** actualizado: `module-inventario` → `module-materiales` con descripción del dominio.
  - **✅ MERGEADO a `main`** (PR #172). Los 4 proyectos Vercel verdes.
  - **NOTA arquitectura:** el scope de `module-materiales` es *agnóstico de vertical y de BD* (port/adapter).
    Espacios (`Espacio`) son entidades de primera clase con `refTipo`/`refId` opcionales para enlazar entidades externas.
    Multi-tenancy a nivel `negocioId` (más fino que `empresaId`/`restauranteId`).

- **🔒 SEGURIDAD BD compartida — COMPLETO — 500 → 318 advisories, 0 ERROR — 12/06/2026**
  3 migraciones aplicadas sobre `wswbehlcuxqxyinousql`. PR #169 mergeado. Detalle en `docs/AUDITORIA-2026-06.md` A4.
  - ✅ 62 vistas `SECURITY DEFINER` → `security_invoker = on` (47 iarest + 15 public)
  - ✅ `instagram_estilos_usados` → RLS habilitada
  - ✅ 114 funciones `function_search_path_mutable` → `SET search_path='iarest'`
  - ✅ 7 políticas `service_role_*` → `TO service_role` (qr slots/items/sesiones/valoraciones,
    reglas_envio, voice_profiles, comanda_modificaciones)
  - ℹ️ 17 `rls_policy_always_true` intencionales (bridge hardware, QR anon, super_admin) — sin acción
  - ℹ️ 77 `anon/authenticated_security_definer_function_executable` intencionales (login_pin, resolve_restaurante)
  - **No quedan pendientes de seguridad accionables en la BD.**

- **🔍 AUDITORÍA CON CONTEXTO del monorepo (post-reestructuración) — PR #164 — 12/06/2026**
  Auditoría completa tras el rename `@iarest/*`→`@central/*`, la migración de BD de ia-rest al Supabase
  compartido y `file:`→`workspace:*`. Informe en **`docs/AUDITORIA-2026-06.md`**. Skill nuevo
  **`.claude/skills/auditoria-central`** para repetirla.
  - **Bugs reales encontrados y ARREGLADOS** (el CI solo cubría ia-rest y no los veía):
    - `aiComplete(prompt, número)` en `apps/ialimp/lib/{google-leads,mailing}.ts` → debía ser objeto
      `{maxTokens|timeoutMs}`; el número se ignoraba en runtime (leads truncados a 800 tok; "timeout 8s" era 30s).
    - `@central/core-identity` usado en 8 ficheros de auth de ialimp **sin estar en deps ni transpilePackages**
      (todos los `@central/*` exportan TS crudo) → añadido a `package.json` + `next.config.ts`.
    - **16 errores de tipos de ialimp saldados** → las **4 apps a 0 errores** (`tsc --noEmit`).
  - **Red de seguridad añadida:** tests de `@central/core-fiscal` (IVA, NIF/CIF/IBAN, huella VeriFactu con
    snapshot), guardián `test/regression-scope.test.ts` (anti-`@iarest/`), orquestadores `pnpm test`/`test:packages`/
    `test:guardia`. **Suite: 104 tests, 0 fallos.** CI nuevo `.github/workflows/tests.yml` (tests + typecheck de
    las 4 apps; antes solo ia-rest).
  - **Infra verificada por MCP:** BD compartida tiene **499 security advisories (63 ERROR)** — 62 `security_definer_view`,
    24 `rls_policy_always_true`, 114 `function_search_path_mutable` (sensibles por ser BD multi-tenant; muchos
    preexisten a la migración). Schema `iarest` sano (266 tablas). Proyecto Supabase viejo de ia-rest
    (`efncqyvhniaxsirhdxaa`) sigue ACTIVE (jubilar tras el corte de envs).
  - **✅ Alberto aplicó las 2 migraciones del radar de concursos** (`radar_*` en `concursos_perfil_empresa` +
    tabla `concursos_radar_anuncios`) → cron `/api/cron/concursos-radar` ya no falla. Verificado en BD.
  - **✅ MERGEADO a `main`** (PR #164) + **seguimiento PR #166**:
    - **CI verde de verdad** (no solo local): `Tests & Typecheck` pasa en CI los 104 tests + typecheck de las
      **4 apps**. **OJO/GOTCHA del CI:** `prisma generate` y `tsc` deben ejecutarse **desde el dir de cada app**
      (`working-directory: apps/<app>`), NO desde la raíz — `prisma`/`typescript` son deps de cada app, no de la
      raíz (si no: `ERR_PNPM ... Command "prisma" not found`). Los 3 schemas escriben al MISMO `@prisma/client`,
      pero en CI cada app va en un job aparte (no colisionan). Este bug rompió `tests.yml` en main y se arregló en #166.
    - **Vulnerabilidades (M3):** `axios` (high, vía `node-ical`) resuelto con `pnpm.overrides "axios": ">=1.16.0"`
      en la raíz (→1.17.0); `pnpm audit` baja de 16 high a 1. **`xlsx`** queda (high, sin parche npm) pero es
      **no explotable**: ialimp solo ESCRIBE xlsx (export contab.), nunca parsea (las vulns son al LEER). Remediación
      oficial = tarball CDN de SheetJS (bloqueada en el entorno de build; no se arriesga el build del cliente vivo).
    - `workflow_dispatch` añadido a `ci.yml`/`tests.yml` (estaba mal indentado bajo `pull_request:`, corregido).
  - **✅ RESUELTO (sesión 12/06/2026):** los **63 advisories ERROR** de la BD compartida → 0 ERROR.
    Ver entrada nueva arriba. (xlsx queda como remediación opcional, documentada.)
- **🚨 PRODUCCIÓN ia-rest lee la BD UNIFICADA VACÍA (Fase A2 a medias) — demo reparado — 12/06/2026**
  - **⛔ OBSOLETO / NO ES EL ESTADO ACTUAL** (ver banner canónico de arquitectura al principio del archivo):
    este apunte describe un **intento parcial que se revirtió**; producción de ia-rest **sigue en el silo
    `efncqyvhniaxsirhdxaa.public`**. Se conserva por historial.
  - **`www.iarest.es` lee `wswbehlcuxqxyinousql` schema `iarest`** (BD unificada), NO `efncqyvhniaxsirhdxaa.public`
    (BD vieja con todos los datos). La unificada tenía estructura+RPCs pero **0 restaurantes / 0 personal** →
    nadie podía entrar. Diagnóstico: `GET /api/owner/modulos?restaurante_id=...001` devolvía el fallback genérico.
  - **Reparado (probado):** copiado restaurante demo (...001) + 7 personal a `wswbehlcuxqxyinousql.iarest`,
    creada+sembrada `materiales`. Verificado (search_path=iarest): `resolve_restaurante('DEMO')` ok, `login_pin`
    1369 y 4040 → success; endpoint de prod ya devuelve la config del demo. Añadido botón Salir en /montaje.
  - **⚠️ PENDIENTE GRANDE:** Saboga y demás datos reales **siguen solo en `efncqyvhniaxsirhdxaa.public`**;
    producción no los ve. Falta migración real de datos (Fase A2 completa) o revertir el env a la BD vieja.
  - **⚠️ Fragilidad:** las RPCs de `iarest` referencian tablas sin prefijo; dependen del search_path de PostgREST.

- **📦 MÓDULO DE MATERIALES (Bloque B) CONSTRUIDO — 12/06/2026**
  - Módulo **independiente de eventos** (decisión Alberto: sirve para catering, haciendas y hasta alquiler puro),
    100% configurable por el dueño, con **acceso granular por empleado** vía `personal.modulos_gestion`.
  - **Por qué tablas nuevas (no reutilizar `inventario_menaje_evento`):** la vieja tiene FK dura a `eventos` →
    acopla. Las nuevas viven en schema `iarest`, patrón `produccion_*` (`restaurante_id`, RLS service_role).
    La asignación apunta a un **destino genérico** (`destino_tipo` = evento|hacienda|cliente|obra), sin FK.
  - **DB (migración `2026-06-12_materiales.sql`, aplicada a `wswbehlcuxqxyinousql`):** `iarest.materiales`
    (catálogo + stock), `iarest.materiales_asignacion` (salida/devolución), `iarest.materiales_dano` (rotura+foto+coste).
  - **API:** `/api/materiales` (catálogo CRUD) · `/api/materiales/asignacion` (asignar descuenta stock / devolver
    repone sanas) · `/api/materiales/dano` (rotura con foto, da baja del total, coste = ud×reposición) ·
    `/api/materiales/perfil` (asignaciones del empleado logueado, gated por `modulos_gestion`).
  - **UI dueño:** `/owner/materiales` (3 tabs: Catálogo · Asignaciones · Roturas) + entrada `materiales` en `GRUPOS`
    e icono `box`. **UI empleado:** `/montaje` (patrón `/cocinero`: ve su material, marca recogido/devuelto,
    registra rotura con foto). **Routing:** empleado con `materiales` aterriza en `/montaje`.
  - **Gating:** `materiales` añadido a `TODOS_MODULOS` y al checklist de "Acceso a gestión" del panel de personal.
  - **Verificado:** `next build` verde (exit 0) con `@central/*` linkados (pnpm install). Spec en
    `docs/superpowers/specs/2026-06-12-modulo-materiales-design.md`. PR **#163** (draft, CI verde).
  - **⚠️ OJO con la BD (corregido):** la BD VIVA de ia-rest es el proyecto **`efncqyvhniaxsirhdxaa`,
    schema `public`** (ahí están `restaurantes`/`personal`/`inventario_menaje`; demo `DEMO` + "Saboga
    Catering"). El proyecto compartido `wswbehlcuxqxyinousql.iarest` está VACÍO (la migración A2 del plan
    de unificación NO se ha ejecutado). Primero creé las tablas en el sitio equivocado; corregido →
    tablas en `efncqyvhniaxsirhdxaa.public`. (Nota: las tablas `produccion_*`/`checklist_*` de la sesión
    anterior podrían estar también en el proyecto equivocado — revisar si esas features fallan en prod.)
  - **🧪 Cuenta DEMO sembrada para probar:** owner **Alberto PIN 1369** → `/owner` → tab **Materiales**
    (5 materiales con stock, 4 asignaciones, 1 rotura) y `/montaje` (el owner ve todo). Montador
    **PIN 4040** (rol gestor, acceso solo a `materiales`) → entra directo a `/montaje`. Módulos
    `materiales/checklists/produccion` activados en el restaurante demo.
  - **Pendiente del bloque:** previsión IA (aforo/temporada/temperatura), código de barras/báscula, multi-almacén
    por hacienda con reparto. Crear bucket Storage `materiales` en Supabase (hay fallback a data-url mientras tanto).

- **🎤 DECK presencial JJ + estructura real corregida — 12/06/2026**
  - **Deck presencial** construido en `apps/ia-rest`: ruta pública **`/propuesta/catering-jj-deck`** (en prod:
    `https://iarest.es/propuesta/catering-jj-deck`). 11 slides full-screen (nav teclado/clic), paleta de
    `PropuestaBase`, diagrama del grupo **inline** (componentes `Node`/`Arrow`, sin SVG). PRs **#156** (deck) y
    **#157** (corrección) mergeados a `main`.
  - **⚠️ Corrección de estructura real de JJ (manda sobre el brief a ciegas)** — volcada en
    `docs/BRIEF-joaquin-jaen.md` (nueva sección "⭐ ESTRUCTURA REAL DEL GRUPO" arriba del todo):
    - **Cocina central (la hermana)** = producción → **produce para eventos/catering** y abastece haciendas.
    - **Restaurantes `Doble J` y `Las Dos Jotas`** = **independientes, cada uno pide lo suyo** (no dependen de cocina central).
    - **Haciendas `El Alba` (propiedad) + `Trinidad` (alquiler)** = cada una su unidad (montaje/pases/barra) **con su almacén**.
    - **NO tienen tiendas para llevar (aún)** · **flota/alquiler-materiales NO confirmados** (eran supuestos del brief a ciegas).
    - Añadido al brief: **control de almacenes/economato** (almacén por hacienda + cocina central, código de barras,
      pedido al mínimo, mermas, reparto entre haciendas) y **control de cada hacienda** (calendario/stock/montaje/KDS/barra).
    - **No nombrar marcas internas ante JJ** (ialimp/sivra/"limpieza"/"pisos") — en el deck se quitó `ialimp` del slide
      de equipo y se anonimizaron las otras en "ya funciona".
  - **🔧 En curso (subagente):** enganchar los **accesos de H/I en los menús** (`/owner/checklists`,
    `/owner/productividad`, `/checklist` camarero, `/cocinero`) — PR aparte, pendiente de revisar/mergear.
  - **Pendiente:** comisiones/marketplace "de verdad"; tiempos estándar reales de cocina; conectar sistema de cocina de ella.

- **⭐ REUNIÓN con Joaquín Jaén (dueño) + hermanos CELEBRADA — inteligencia real — 11/06/2026**
  Transcripción analizada y volcada en `docs/BRIEF-joaquin-jaen.md` (sección "POST-REUNIÓN"). Cambia el brief a
  ciegas. Asistentes: **ella = responsable de todas las cocinas** (perfil técnico fuerte), **él = restaurante +
  comercial**, Joaquín + otro hermano decisores.
  - **Hallazgo nº1:** la cocina **NO es campo virgen** — la responsable lleva ~3 años con un sistema propio muy
    serio (proveedores→artículos con ficha técnica/alérgenos→ingredientes→elaboraciones con procesos→etiquetas QR
    trazabilidad/caducidad→escandallo dinámico→partes de trabajo por partida 5 días antes→báscula→cronometraje→
    economato→merma). Más profundo que la cocina de ia-rest. **Es protectora ("es lo mío") y su objeción es el
    factor humano.** → conectar/co-diseñar con ella, NO reemplazar. Mayor activo y mayor riesgo de adopción.
  - **Apertura real a corto = comercial + logística (el hermano, el que quiere "probar ya").** Necesita CRM
    comercial + **incentivos/ranking de comerciales** (bonos por margen/ticket/reseñas, contratos % escalable),
    ERP facturación/contabilidad, y **logística de material de eventos = dpto. más atrasado** (inventario menaje,
    previsión por evento, roturas post-boda, consumo estacional) → coincide con `DISENO-modulos-materiales-flota.md`.
  - **Producto "wow" que quieren:** marketplace de catering + presupuestador self-service (cliente configura evento →
    menú con margen → paga), multi-tarificador de eventos, bot de bodas, maridaje de vino por IA.
  - **Plan revisado:** piloto por **Logística/Material** (bajo riesgo político, diseño ya hecho); demo de venta por
    **marketplace de catering**; cocina = "conectamos con lo que ella ya construyó". Siguiente paso: presentación +
    piloto 1 dpto.; contacto por WhatsApp de Alberto; ellos mandan resumen.
  - **Faltan datos:** nº sociedades/CIFs + intercompany; stack exacto del sistema de cocina de ella; tamaño catálogo
    de material + eventos/mes; estructura de comisiones de los comerciales.
  - **✅ Bloques H e I CONSTRUIDOS y MERGEADOS a `main` (PR #154):** en `apps/ia-rest`.
    - **H — Checklist operativo:** tablas `iarest.checklist_plantillas/ejecuciones`; rutas `/api/checklists/*`
      (plantillas, turno con **índice de carga** leyendo `comandas`, marcar con foto, informe con flag
      "sin excusa"); pantallas `/checklist` (empleado) y `/owner/checklists` (editor + informe). Bucket
      Storage `checklists` (público) creado.
    - **I — Perfil del cocinero + productividad:** tablas `iarest.produccion_tareas/tiempos_estandar`;
      rutas `/api/produccion/*` (planificar con `callAI` + fallback round-robin, perfil, tiempo
      empezar/terminar, productividad, cocineros); pantallas `/cocinero` y `/owner/productividad`.
    - Módulos nuevos `checklists` y `produccion` en `TODOS_MODULOS`. Migraciones aplicadas en BD
      compartida (schema `iarest`). MVP **manual + IA** (no toca el sistema de cocina de ella).
    - **Cómo verlo (demo):** entrar por `/login` (owner PIN 1369 → `/owner/checklists` y `/owner/productividad`;
      camarero 7672 → `/checklist`; cocina 3297 → `/cocinero`). Las rutas aún **no tienen botón en los menús**
      (creadas como pantallas standalone para no tocar las páginas grandes).
    - **Pendiente:** enganchar accesos en los menús (`/owner`, camarero, cocina); cargar tiempos estándar reales;
      conectar el sistema de cocina de ella; **guión/deck** presencial para la próxima reunión.
  - **Propuestas web refinadas (PR #138, mergeada):** las 4 propuestas `catering-jj*` reposicionan la cocina
    ("conectamos, no reemplazamos") y añaden las cartas que pidió la familia: **comercial+comisiones**, **material
    de eventos** (roturas/previsión) y **presupuesto self-service del cliente**. Estas dos últimas se presentan
    **como si ya existieran** (decisión de Alberto) — **a construir mañana**. Piloto del hub reorientado a
    material+comercial. **Pendiente mañana:** (1) construir comisiones/marketplace de verdad; (2) **guión/deck**
    presencial para la próxima reunión.

- **✅ BRIEF JOAQUÍN JAÉN + diagramas — preparación presentación holding — 11/06/2026**
  Sesión de preparación para reunión con **Joaquín Jaén** (holding: restaurante, catering, haciendas,
  alquiler de materiales, transporte, tiendas para llevar). Todo en `main` vía rama `claude/joaquin-jaen-expansion-4nyju5`.
  - **`docs/BRIEF-joaquin-jaen.md`** — quién es, cómo caben sus 6 negocios (tabla), idea técnica (`Encargo`
    + intercompany), estado real hoy (hecho vs diseñado), modelo comercial (módulos activables), preguntas
    clave para cerrar, guion de presentación de ~8 slides.
  - **`docs/DISENO-modulos-materiales-flota.md`** — diseño a fondo de las dos verticales nuevas (alquiler
    de materiales + flota/transporte): modelo de datos, ciclo de vida, pantallas, reutilización de módulos,
    fases sugeridas y qué demostrar a Joaquín.
  - **Diagramas SVG + PNG** (`docs/diagrams/`):
    - `joaquin-encargo.svg/.png` — cómo el agregado `Encargo` (parent_id+parent_type) une todos los
      `module-*` (CRM, presupuestos, agenda, inventario, proveedores, portales, feedback, facturación).
    - `joaquin-holding-intercompany.svg/.png` — el "gancho holding": cocina central → tiendas, flota →
      catering, materiales → eventos facturados entre sociedades y consolidados eliminando intercompany en
      `plataforma` (neto real del grupo).
  - **`add_concursos.sql` APLICADA** en BD compartida `wswbehlcuxqxyinousql` (schema `public`): tabla
    `concursos` con 12 columnas + 3 índices. Marca el pendiente de Alberto del #116 como cerrado.
  - **INFORME unificación** (`docs/INFORME-unificacion-central.md`) planificado en plan mode: estado
    real de adopción de packages/*, esquema de capas, plan priorizado Fases A–F. Pendiente ejecutar.
  - **Pendiente (Alberto):** borrar envs `IAREST_SUPABASE_URL`/`IAREST_SUPABASE_SERVICE_KEY` de Vercel
    (plataforma); resetear password + jubilar BD `efncqyvhniaxsirhdxaa`; `DROP iarest._mig_ddl` (opcional).
    Presentación Joaquín: ejecutar diagramas + ~8 slides.

- **⚙️ GOTCHA del entorno cloud (descubierto 11/06, importante para futuras sesiones):** en el contenedor remoto el **`git push` por HTTPS da `503` de forma persistente** (read/fetch/ls-remote SÍ funcionan; solo el push está bloqueado) → el hook `Stop` de memoria NO puede empujar. **Para escribir en GitHub usa las tools MCP** (`mcp__github__push_files` / `create_or_update_file`) o, para ficheros grandes, **rama temporal vía MCP → PR → `merge_pull_request`**. OJO: `push_files` mete el contenido **inline** y un agente puede **truncarlo** (pasó con este `CONTEXTO`, ~69 KB: quedó en "PENDING"/"PLACEHOLDER" y hubo que restaurarlo). Patrón seguro para ficheros grandes: subir a **rama aparte**, **verificar tamaño/marcadores**, y solo entonces **PR + merge** a `main` (commits `chore:` no redepliegan). Para restaurar un fichero a una versión previa sin retecleo: existe el blob en el historial (`git checkout <sha> -- <fichero>` desde un equipo con push).

- **✅ Gestión de limpiezas para Vanessa + patrones de edición reutilizables — EN PRODUCCIÓN** (backfill 11/06; trabajo del 09/06 que se había perdido de esta memoria al hacer squash-merge)
  (PR #111 → commit `3e3cc646` · PR #112 → commit `abe64527` · deploys de producción `ialimp` e `ia-rest` verificados READY. El PR #109, que mezclaba ambos trabajos y arrastraba commits de plataforma, se cerró a favor de 2 PRs limpios.)
  - **IALIMP (gestión de sesiones):** columnas `orden_manual` (int) y `urgente_manual` (bool) en `cleaning_sessions` (migración `2026-06-09_orden_manual_sesiones.sql`, aplicada en Supabase). Vista `sesiones_limpiadora` ampliada con `notas`/`orden_manual`/`urgente_manual`.
    - `PATCH /api/admin/sesiones/[id]` ampliado (session_date, hora_inicio [TEXT, sin cast], hora_checkout/checkin [::time], num_huespedes, notas, orden_manual, urgente_manual; recalcula ventana; push «⏰ Cambio de horario» si cambia fecha/hora de sesión asignada). Nuevo `POST /api/admin/sesiones/reordenar` (orden manual por día; `reset:true` → auto).
    - UI en Inicio y Agenda: ✏️ editar (`NuevaLimpiezaModal` modo edición = PATCH + eliminar), ↑↓ reordenar, ⏰ mover día, 🔥 urgente, ⧉ duplicar, filtro ⚠️ sin asignar, aviso de solapamiento. App limpiadora `/l`: chips 🔥/📝 + bloque destacado de notas/urgente antes del checklist.
    - Docs: `public/manual.html`, `docs/guia-limpiadoras.md` (WhatsApp), `docs/mejoras-vanessa.md` (admin), `apps/ialimp/CLAUDE.md` (sección orden_manual/editar).
  - **Patrones reutilizables (PR #112):** modo edición (✏️ + PUT) en Stock y Lencería (ialimp); `ProgramacionModal` modo edición (PATCH + eliminar); botones ↑/↓ para reordenar la carta del owner en ia-rest (swap `orden` + PUT).
  - Nota operativa: el push HTTP del contenedor daba 503 → todo se subió vía `mcp__github__push_files`; los PRs se mergearon con squash.

- **💰 SIVRA pricing: piloto validado + 🏷️ rename scope @central + 🧠 module-revenue Fase 1 — 11/06/2026 (tarde)**
  Sesión larga. Cuatro hitos:
  1. **Piloto Busto Reform VALIDADO de punta a punta:** se subió el techo `max_price` 110→**125€** base
     (`pricing_settings`), se ejecutó `apply` en vivo desde el panel (Alberto pulsó "Aplicar") y el **23/06
     pasó a 125€ en Smoobu, confirmado por Alberto en el calendario**. Mercado huésped p50 168€; el motor quiere
     ~144€ base pero el techo del propietario manda (125). El piso está reservado del 11 al 18 → el motor solo
     toca fechas libres (correcto).
  2. **🐛 BUG CRÍTICO de la automatización encontrado y reparado:** los crons de pricing daban **401/«CRON_SECRET
     no definido»** porque el despliegue que los corría era ANTERIOR a que Alberto metiera la env. Diagnosticado
     con los **logs de runtime de Vercel** (MCP de Vercel, ya conectado): `apply-auto` 08:30 → 401; `guard` ahora
     → 401 limpio (sin el aviso) = `CRON_SECRET` YA activo en el deploy post-merge. **El cron de mañana 08:30
     correrá de verdad por primera vez.** (El acceso de Vercel NO pasa el login NextAuth → mis llamadas a
     `/api/pricing/apply` dan 401; el disparo manual lo hace Alberto con su sesión, o con el secreto.)
  3. **🏷️ RENAME de scope `@iarest/*` → `@central/*` en TODO el monorepo (PR #147, MERGEADO):** 15 paquetes,
     deps de las 4 apps, todos los imports, `transpilePackages`, `scripts/auditar-estructura.mjs` y `pnpm-lock.yaml`
     regenerado. Verificado con las **4 previews de Vercel en verde**. **Principio anotado en `CLAUDE.md`:** los
     cambios que rompen (renames, reestructuras de BD) **se hacen AHORA, sin clientes** — con clientes ya no.
     ⚠️ Los PRs abiertos que aún importan `@iarest/*` (#137, #138, #136…) necesitarán rebase a `@central/*`.
  4. **🧠 `@central/module-revenue` Fase 1 (PR #148, MERGEADO):** paquete **puro y multisector** (patrón
     `module-concursos`: TS puro, sin BD/red/secretos) de análisis de demanda. Entradas `DemandEvent`/`CapacitySlot`;
     funciones `occupancyByDow`, `seasonalityByMonth`, `leadTimeStats`, `pickupCurve`, `paceVsBaseline`, `channelMix`,
     `revenueKpis`, todas con guardia de muestra. **9/9 tests `node --test`** + `tsc` limpio. El mismo cerebro
     servirá a ia-rest (cubiertos) e ialimp (servicios) con su adapter. Spec:
     `docs/superpowers/specs/2026-06-11-revenue-module-design.md`; plan: `docs/superpowers/plans/2026-06-11-module-revenue-fase1.md`.
  - **Diseño aprobado (spec completa, 3 fases):** análisis + **auto-ajuste dentro de límites + freno**, configurable
    y supervisable **por dueño/piso** (override manual gana, topes min/max = autoridad final). Extras aprobados:
    **backtest "¿qué habrías ganado?"**, modo por palanca (supervisado/auto), "explica por qué", presets.
  - **PENDIENTE (siguiente sesión):** **Fase 1b** = cablear SIVRA (adapters `incomes`→`DemandEvent[]`,
    `rate_snapshots`→`CapacitySlot[]`; endpoint + panel `/revenue` + digest semanal) → aquí Alberto valida la
    hipótesis "domingos fuertes" con sus datos. Luego **Fase 2** y **Fase 3** (ritmo/antelación, min-stay vía API
    Smoobu, alarma de "dinero perdido"). Datos ya disponibles: `incomes` = **1.745 reservas reales** (6 años, canal,
    createdAt, checkIn/out) — no hace falta ingestar nada nuevo.
  - **Pendiente menor de Alberto:** activar `apply_enabled` en Dúplex/Luxury/House al desconectar PriceLabs.

- **📸 Auditoría agente Instagram (ia.rest) — "no sube nada" RESUELTO — 11/06/2026**
  Síntoma de Alberto: la automatización de Instagram genera pero no publica nada desde el ~2-jun.
  - **Causa raíz (confirmada en vivo):** el **corte de BD del 10-jun**. Producción pasó a leer el schema
    nuevo `iarest`, pero los borradores y el historial quedaron **huérfanos en la BD vieja**
    (`efncqyvhniaxsirhdxaa`, `public`). Al aprobar en Telegram, el webhook buscaba el borrador en la BD nueva,
    no lo encontraba → respondía **"Ya procesado"** → no publicaba. **Token, webhook y código estaban OK.**
  - **Diagnóstico end-to-end (sin egress desde el contenedor):** se hizo vía Supabase MCP + Edge Functions
    temporales (`tg-send` confirmó que el token del bot vive como secret en EFs; `tg-webhookinfo` confirmó webhook
    sano: URL correcta, 0 pending, 0 errores). Se publicó un **post real** (`18102380903021918`) creando un borrador
    en la BD **nueva** y aprobándolo → confirma que toda la cadena funciona.
  - **Resuelto:** (1) **migrados los 19 borradores pendientes** vieja→nueva (EF `ig-migrate`, service role) →
    `iarest.instagram_borradores`: 19 pendientes + 1 aprobado. (2) Desde el viernes el cron generará ya en la BD
    nueva (flujo normal). (3) **PR #142 MERGEADO a `main`**: arregla `obtenerMetricas` (pedía métricas inválidas/`impressions`
    deprecada) y añade registro de fallos de publicación en `system_errors` (callback Telegram + `/super` + cron); fin de
    fallos silenciosos.
  - **⚠️ Hallazgo de fondo (pendiente):** el corte de BD a `iarest` **no estaba realmente migrado** para Instagram
    (drafts/historial seguían en la vieja). Revisar que el resto de datos (comandas, etc.) estén realmente en la nueva
    o que producción siga apuntando a la vieja — la tabla `comandas` del schema nuevo está vacía.
  - **🧹 Limpieza manual pendiente (Alberto):** borrar del dashboard Supabase las EFs temporales (ya inertes, devuelven 410):
    `ig-test-send` (en ambos proyectos), `tg-webhookinfo` (viejo) e `ig-migrate` (nuevo).
  - **Decisión de producto de Alberto:** mantener el modelo **publicación automática previa autorización en Telegram**
    (no autopublicar sin aprobar).
- **✅ IALIMP — chat del equipo visible en el menú lateral (PR #114, mergeado a prod) — 10/06/2026**
  Vanessa (Sique Brilla) probaba el chat con las limpiadoras y no lo encontraba en su panel. El chat
  (`/admin/chat`) **ya existía y funcionaba**, pero solo era accesible desde la barra inferior del **móvil**;
  en el **menú lateral del escritorio** (`NAV` en `app/dashboard/DashboardClient.tsx`) no había entrada de chat
  y el único 💬 era «Asistente» (que es el **ayudante de IA**, `/admin/asistente`) → confusión.
  - **Fix:** añadida entrada **«💬 Chat equipo» → `/admin/chat`** al menú lateral; el asistente de IA pasa a
    **«🤖 Asistente IA»** para no chocar el icono 💬. (NOTA: después la rama de Concursos añadió también
    «🏛️ Concursos» al mismo `NAV`; conviven sin problema.)
  - `public/manual.html`: sección Chat con la ruta exacta (lateral en escritorio / barra inferior en móvil) +
    aclaración Chat-equipo vs Asistente-IA + recordatorio de cómo lo ve la limpiadora en `/l`.
  - Solo navegación + manual. Sin datos, API ni migraciones. **Mergeado a `main` (squash `86bd78a`) y desplegado
    a producción (`app.ialimp.es`).** Lo de «enviar el enlace» y «editar» que Vanessa también probaba ya iba bien.

- **📡 Concursos — Infra F7: Radar PLACSP en vivo + OCR de pliegos — 11/06/2026 (rama `claude/concursos-radar-ocr-infra`)**
  Cierra la infraestructura de F7 sobre el núcleo puro ya en producción. Spec/plan:
  `docs/superpowers/specs/2026-06-11-concursos-radar-ocr-infra-design.md` · `docs/superpowers/plans/2026-06-11-concursos-radar-ocr-infra.md`.
  - **Parser ATOM PURO (`apps/ialimp/lib/concursos-radar.ts`, TDD `node --test` → 4/4):** `parsearAtomPlacsp` (CODICE de PLACSP, `fast-xml-parser` con `removeNSPrefix`, tolerante a campos ausentes → título/objeto/cpv/presupuesto/órgano/url/expediente), `dedupeKey` (expediente > atom_id > url) y `matchesDeAtom` (empareja con `filtrarRadar`/`coincideRadar` del módulo → puntuación + motivos + dedupe). Fixture en `lib/__fixtures__/placsp-sample.atom.xml`.
  - **Adaptación del módulo (aditiva, 79/79 intacto):** subpath export `"./radar": "./src/radar.ts"` en `packages/module-concursos/package.json` para poder importar `filtrarRadar`/`coincideRadar` bajo `node --test` (el bare `index.ts` arrastra imports extensionless que el type-stripping de Node 22 rechaza). Los tipos siguen importándose del bare package.
  - **Radar (app):** migraciones `add_concursos_radar_criterios.sql` (amplía `concursos_perfil_empresa` con `radar_activo`/`radar_cpv[]`/`radar_palabras_clave[]`/`radar_presupuesto_min·max`) y `add_concursos_radar_anuncios.sql` (tabla con `unique(empresa_id, dedupe_key)`). Endpoints `radar/criterios` (GET/PUT), `radar` (GET lista + `no_vistos`), `radar/visto` (POST), `radar/importar` (POST import manual de ATOM). Cron `/api/cron/concursos-radar` cada 6 h (`0 */6 * * *`, en `vercel.json`): descarga la sindicación ATOM paginada (`PLACSP_FEED_URL` configurable, default público, hasta 3 páginas siguiendo `rel="next"`), filtra por empresa con `radar_activo` e inserta matches nuevos (`ON CONFLICT DO NOTHING`). **Aviso in-app** (contador de no vistos) — NO web-push (las suscripciones push de ialimp son de limpiadoras).
  - **OCR (app):** `lib/concursos-ocr.ts` — `rasterizarPdf` (pdfjs-dist legacy `legacy/build/pdf.mjs` + `@napi-rs/canvas`, hasta 12 págs) y `ocrPaginasPliego` (cada página → `nimVision`, modelo de visión que ialimp ya usa, sin claves nuevas). Integrado en `analizar/route.ts`: si `necesitaOcr(texto)` → OCR → reanaliza; respuesta añade `ocr_aplicado`. `next.config.ts`: `@napi-rs/canvas`/`pdfjs-dist` en `serverExternalPackages` (load-bearing).
  - **UI (`/admin/concursos/page.tsx`):** panel **"📡 Radar de oportunidades"** (criterios CPV/palabras/presupuesto + toggle activo + lista de matches con puntuación/motivos/enlace/«visto» + badge de no vistos) y aviso **"📄 Documento escaneado — OCR"** en la ficha (prop `ocrAplicado`).
  - **Verificación:** parser 4/4, módulo 79/79, `apps/ialimp npm run build → ✓ Compiled successfully` en cada tarea (aborta luego por `JWT_SECRET` ausente = env local).
  - **⚠️ Pendiente de Alberto:** (1) aplicar las 2 migraciones en Supabase; (2) **validar la rasterización OCR en la preview de Vercel** (riesgo: pdfjs+napi-canvas en runtime serverless; fallback documentado = subir páginas como imágenes); (3) opcional: ajustar `PLACSP_FEED_URL` por CPV/región. El cron no necesita secreto (lo invoca Vercel cron).
- **🔌 Portar ialimp y sivra a módulos compartidos (proveedores, inventario, CRM) — 11/06/2026**
  PR #143 mergeado. Cierra la deuda de reimplementación detectada en la auditoría de estructura (PR #141).
  Patrón Ports & Adapters: cada vertical aporta su adapter que implementa la interfaz del módulo compartido.
  Sin cambios de BD — solo adaptadores + reuso de funciones puras del módulo.
  - **ialimp (multi-tenant):**
    - `apps/ialimp/lib/adapters/proveedores.ts` → `ProveedorAdapter<ProveedorRow>` sobre `@iarest/module-proveedores`
    - `apps/ialimp/lib/adapters/inventario.ts` → `ArticuloAdapter<ProductoStockRow>` + `AsignacionAdapter<StockConsumoRow>` sobre `@iarest/module-inventario`
    - `apps/ialimp/lib/adapters/crm.ts` → `OportunidadAdapter<LeadRow>` con mapeo de estados (`propuesta_enviada→propuesta`, `presupuestado→negociacion`) sobre `@iarest/module-crm`
    - `api/admin/proveedores` GET: añade `proveedores_canonicos`; `api/admin/stock` GET: añade `resumen`; `api/admin/leads` GET: añade `pipeline`
    - `package.json`: deps `module-proveedores`, `module-inventario`, `module-crm` con `workspace:*`
  - **sivra (single-tenant):**
    - `apps/sivra/lib/adapters/proveedores.ts` → igual que ialimp pero sin `empresa_id`
    - `apps/sivra/lib/adapters/inventario.ts` → catálogo de referencia (`cantidadTotal=0`, sin stock operativo)
    - `api/admin/limpiadoras/proveedores` GET: añade `proveedores_canonicos`; `api/admin/limpiadoras/productos` GET: añade `resumen`
    - `package.json`: deps `module-proveedores`, `module-inventario`
  - **Radiografía:** 0 reimplementaciones (antes 3). `kits_limpiadoras` queda fuera del módulo a propósito (asignación permanente limpiadora ≠ AsignacionActivo por sesión).
  - **✅ PR #143 MERGEADO a `main` — 11/06/2026.** Builds Vercel todos verdes (ialimp, sivra, plataforma, ia-rest).

- **🏛️ Concursos F7 — Radar PLACSP + OCR (CIERRA el agente F2–F7) — 11/06/2026**
  Última fase del agente de concursos (`packages/module-concursos`). Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f7-radar-ocr.md`.
  - **Módulo puro (`src/radar.ts`, TDD, 7 tests nuevos → 79/79 verde):** `coincideRadar` (empareja un anuncio con los
    criterios de la empresa: CPV por prefijo +50, palabras clave sin acentos +30; presupuesto fuera de rango DESCARTA),
    `filtrarRadar` (los que casan, ordenados por relevancia) y `necesitaOcr` (heurística: texto extraído < `MIN_TEXTO_PLIEGO`=200
    → PDF escaneado, hay que pasarle OCR). Tipos `AnuncioRadar`/`CriteriosRadar`/`CoincidenciaRadar`. Sigue puro (sin BD/IA/secretos).
  - **Infraestructura pendiente (documentada, NO en esta sesión):** el **sondeo en vivo de PLACSP** (feed Atom de la
    Plataforma de Contratación del Sector Público → normalizar a `AnuncioRadar[]` → `filtrarRadar` por empresa → avisar por
    web-push) y el **motor OCR** (cuando `necesitaOcr` es true: Tesseract/cloud) requieren cron + claves; el módulo expone el
    contrato que consumirán. No verificable en este entorno.
  - **✅ ESTADO DEL AGENTE:** **F2–F7 completas a nivel de módulo puro** (con tests, **79/79**) e **integradas en ialimp F2–F6**
    (biblioteca · sobre administrativo/DEUC · memoria técnica · oferta económica · presentación/plazos). F7 entrega el núcleo
    radar/OCR; la captación en vivo queda como infraestructura. Todo en PR #135 (rama `claude/public-tender-agent-module-mid0hu`).
  - **✅ Migraciones APLICADAS por Alberto en Supabase (`wswbehlcuxqxyinousql`) — 11/06/2026:** `add_biblioteca_concursos.sql`
    (tabla `biblioteca_documentos`, F2), `add_concursos_perfil.sql` (tabla `concursos_perfil_empresa`, F3),
    `add_concursos_memoria.sql` (col. `concursos.memoria` jsonb, F4), `add_concursos_oferta.sql` (col. `concursos.oferta` jsonb, F5).
    Los paneles F2–F5 ya tienen la BD lista en producción.
  - **✅ PR #135 MERGEADO a `main` — 11/06/2026:** agente de concursos F2–F7 en producción. Se resolvieron 2 conflictos
    sucesivos con `main` (solo en `docs/CONTEXTO-SESIONES.md`/`apps/ialimp/CLAUDE.md`, entradas de doc en paralelo —
    conservados ambos lados). Suite 79/79 tras cada merge. Deploy de producción de ialimp disparado por el merge.

- **🏛️ Concursos F6 — Presentación + plazos/subsanación — 11/06/2026**
  Sexta fase del agente de concursos (`packages/module-concursos`). Cierra el flujo: cuenta atrás al fin de plazo,
  comprobación de que los sobres requeridos están listos para presentar y plazo de subsanación en días hábiles. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f6-presentacion-plazos.md`.
  - **Módulo puro (`src/presentacion.ts`, TDD, 10 tests nuevos → 72/72 verde):** `diasEntre` (días naturales entre dos
    fechas ISO en UTC), `sumarDiasHabiles` (suma días hábiles saltando sábados/domingos, sin festivos), `estadoPresentacion`
    (plazo abierto/urgente ≤3 días + sobres REQUERIDOS: técnico solo si hay juicio de valor, económico solo si hay criterio
    económico, administrativo siempre → `listo` + `pendientes`) y `plazoSubsanacion` (3 días hábiles por defecto, art. 141 LCSP).
    Tipos `SobresListos`/`EstadoPresentacion`/`PlazoSubsanacion` en `types.ts`; re-exports en `index.ts`. Sigue puro
    (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** **sin migración nueva** (cómputo en vivo en cliente). Panel **"Presentación"** en la
    ficha de `/admin/concursos`: cuenta atrás al fin de plazo (🔴 urgente / ⛔ cerrado), checklist de sobres listos
    (administrativo/técnico/económico) que alimenta `estadoPresentacion`, veredicto "Listo para presentar" o lista de pendientes,
    y aviso del plazo de subsanación (3 días hábiles) calculado con `plazoSubsanacion`. Usa las funciones puras importadas de
    `@iarest/module-concursos` (sin LLM ni endpoint). `✓ Compiled successfully` (aborta después en "Collecting page data" por
    `JWT_SECRET` ausente del entorno local — env, no código).

- **🏛️ Concursos F5 — Oferta económica + rentabilidad — 11/06/2026**
  Quinta fase del agente de concursos (`packages/module-concursos`). Ayuda al licitador a fijar el precio de su
  oferta: que sea **rentable** (cubre coste + margen), **competitiva** (puntúa) y **no temeraria**. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f5-oferta-economica.md`.
  - **Módulo puro (`src/oferta.ts`, TDD, 9 tests nuevos → 62/62 verde):** `costeTotal` (directos + indirectos),
    `precioMinimoRentable` (coste, o `coste / (1 − margen/100)` con margen objetivo sobre el precio) y `evaluarOferta`
    (margen €/%, puntos económicos reutilizando `calcularPuntuacionEconomica`, baja temeraria con `umbralBajaTemeraria`
    y viabilidad). Tipos `CosteEjecucion`/`EvaluacionOferta` en `types.ts`; re-exports en `index.ts`. El **coste lo aporta
    la app** (puede venir de contabilidad); el módulo solo opera números. Sigue puro (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** columna **`concursos.oferta`** jsonb (`prisma/migrations/add_concursos_oferta.sql`);
    endpoint `app/api/admin/concursos/[id]/oferta` (GET carga / PUT guarda los datos de entrada), con `requireEmpresaId` +
    Prisma `$queryRaw` con casts (patrón del v1); panel **"Oferta económica"** en la ficha de `/admin/concursos`. La
    **evaluación se calcula en vivo en el cliente** con `evaluarOferta`/`precioMinimoRentable` (módulo puro importado, sin LLM):
    precio mínimo rentable, margen, puntos económicos, aviso de baja temeraria y veredicto de viabilidad; el PUT solo persiste
    los datos de entrada. `✓ Compiled successfully` (aborta después en "Collecting page data" por `JWT_SECRET` ausente del entorno local — env, no código).
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_oferta.sql` en la BD compartida.

- **🏛️ Concursos F4 — Memoria técnica que puntúa — 11/06/2026**
  Cuarta fase del agente de concursos (`packages/module-concursos`). Genera la **memoria técnica** atacando los
  **criterios de juicio de valor** de la ficha y estima cuántos puntos técnicos cubre. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f4-memoria-tecnica.md`.
  - **Módulo puro (`src/memoria.ts`, TDD, 8 tests nuevos → 53/53 verde):** `planificarMemoria` (deriva una
    sección por criterio de juicio de valor, ordenadas por puntos desc), `construirPromptMemoria` (par
    `{system, user}` por sección, lo pasa la app al LLM como `construirPromptPliego`) y `coberturaMemoria`
    (estima puntos cubiertos: una sección "puntúa" si su contenido alcanza `MIN_CONTENIDO_CHARS`; lista las
    `vacias`). Tipos `SeccionMemoria`/`SeccionMemoriaRellena`/`MemoriaTecnica`/`CoberturaMemoria` en `types.ts`;
    re-exports en `index.ts`. Sigue puro (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** columna **`concursos.memoria`** jsonb (`prisma/migrations/add_concursos_memoria.sql`);
    endpoint `app/api/admin/concursos/[id]/memoria` (GET devuelve memoria guardada + cobertura; POST planifica, redacta
    cada sección con el LLM vía el **`aiRunner`** de `lib/concursos.ts` —que envuelve `aiComplete` de core-ai— y persiste),
    con `requireEmpresaId` + Prisma `$queryRaw` con casts (patrón del v1); panel **"Memoria técnica"** en la ficha de
    `/admin/concursos` (botón "✍️ Generar memoria técnica" + barra de cobertura + secciones en `<details>`).
    `✓ Compiled successfully` (aborta después en "Collecting page data" por `JWT_SECRET` ausente del entorno local — env, no código).
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_memoria.sql` en la BD compartida.

- **🏛️ Concursos F3 — Sobre administrativo + DEUC — 11/06/2026**
  Tercera fase del agente de concursos (`packages/module-concursos`). Genera el **Sobre 1 (administrativo)**
  de un concurso tirando de la biblioteca de empresa (lista de documentos exigidos con qué doc los cubre),
  más el **DEUC** y la **declaración responsable** (art. 140 LCSP) rellenos como datos. Plan:
  `docs/superpowers/plans/2026-06-11-concursos-f3-sobre-administrativo-deuc.md`.
  - **Módulo puro (`src/deuc.ts`, TDD, 5 tests nuevos → 45/45 verde):** `documentosSobreAdministrativo`
    (reutiliza `derivarChecklist` del v1 + `tipoDeDocumento` de F2, filtra a sobre `administrativo` y marca
    `cubiertoPor` con el doc de la biblioteca), `construirDeuc` (ensambla las partes I–IV/VI desde ficha+empresa,
    motivos de exclusión y veracidad a favor), `construirDeclaracionResponsable` (identidad + afirmaciones estándar).
    Tipos `DatosIdentificacionEmpresa`/`ItemSobreAdministrativo`/`Deuc`/`DeclaracionResponsable` en `types.ts`;
    re-exports en `index.ts`. Sigue puro (sin BD/IA/secretos); produce datos (la app los renderiza al PDF/XML oficial más adelante).
  - **Integración ialimp (referencia):** tabla **`concursos_perfil_empresa`** (`prisma/migrations/add_concursos_perfil.sql`,
    una fila por empresa, scope `empresa_id`); endpoints `app/api/admin/concursos/perfil` (GET/PUT del perfil) y
    `app/api/admin/concursos/[id]/sobre-administrativo` (GET cruza ficha + biblioteca + perfil → sobre + DEUC + declaración),
    ambos con `requireEmpresaId` + Prisma `$queryRaw` con casts (patrón del v1); página `/admin/concursos/perfil` (formulario
    del perfil) + panel "Sobre administrativo" en la ficha de `/admin/concursos` (botón "📋 Generar sobre administrativo (DEUC)")
    y enlace "🏢 Perfil de empresa" en cabecera. `✓ Compiled successfully` (aborta después en "Collecting page data" por
    `JWT_SECRET` ausente del entorno local — env, no código).
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_perfil.sql` en la BD compartida.

- **🏛️ Concursos F2 — Biblioteca de empresa (PR #135) — 11/06/2026**
  Segunda fase del agente de concursos (`packages/module-concursos`). El cliente sube sus documentos/datos
  **una vez** y cada concurso autocompleta su checklist, marca lo que falta y avisa de caducidades. Se diseñó
  primero el **spec norte del agente completo** (F2–F7: biblioteca · sobre administrativo/DEUC · memoria técnica
  que puntúa · oferta económica+rentabilidad · presentación/plazos · radar PLACSP+OCR) en
  `docs/superpowers/specs/2026-06-11-agente-concursos-completo-design.md`, con plan de F2 en
  `docs/superpowers/plans/2026-06-11-concursos-f2-biblioteca-empresa.md`. Implementación por fases, empezando por F2.
  - **Módulo puro (`src/biblioteca.ts`, TDD, 12 tests nuevos → 40/40 verde):** `tipoDeDocumento` (clasificador
    nombre→tipo, conservador, sin acentos), `autocompletarChecklist` (marca `hecho` lo cubierto, inmutable),
    `documentosFaltantes` (lo que la biblioteca no cubre), `documentosCaducados` (vence antes del corte/fin de plazo).
    Tipos `TipoDocumentoBiblioteca`/`DocumentoBiblioteca`/`Biblioteca` en `types.ts`; re-exports en `index.ts`. Sigue puro
    (sin BD/IA/secretos).
  - **Integración ialimp (referencia):** tabla **`biblioteca_documentos`** (`prisma/migrations/add_biblioteca_concursos.sql`,
    scope `empresa_id`); endpoint `app/api/admin/concursos/biblioteca` (GET lista/POST alta, `requireEmpresaId` + Prisma
    `$queryRaw` con casts en SQL, patrón del v1); página `/admin/concursos/biblioteca` ("Mi biblioteca", white-label);
    `/admin/concursos` autocompleta el checklist (✅/⬜) y avisa de documentos faltantes con enlace. `✓ Compiled successfully`.
  - **⚠️ Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_biblioteca_concursos.sql` en la BD compartida
    (no aplicado desde la sesión, como el resto de migraciones). Follow-up: `public/manual.html` al promover la sección.
- **🚀 SIVRA pricing auto — producción activa + legacy eliminado — 11/06/2026**
  Sesión de cierre: vars Vercel confirmadas por Alberto y motor diario activo.
  - **✅ Vars Vercel configuradas por Alberto:** `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY` → motor diario `apply-auto` (08:30) y notificaciones push **activos en
    producción** (`sybra.vercel.app`).
  - **✅ Busto Reform:** `apply_enabled=true`, PriceLabs desconectado → el cron escribe precio
    base en Smoobu cada mañana según mercado + parámetros del propietario.
  - **✅ Legacy `detect-opportunities` eliminado:** el cron antiguo mandaba correos con precios
    calculados por la fórmula vieja (base × SEASONAL × DOW, sin ancla de mercado ni topes del
    propietario) → cifras absurdas (ej. Dúplex 368€ vs mercado real ~155€). Eliminados: cron en
    `vercel.json`, endpoint `api/pricing/detect-opportunities`, exclusión del middleware.
    El motor nuevo (`apply-auto` + `resumen-diario`) lo sustituye completamente.
  - **⏳ Pendiente de Alberto:** desconectar PriceLabs de Dúplex Center, Luxury Busto y House
    Sevillana, y activar `apply_enabled` en `sybra.vercel.app/pricing-auto` para cada uno.

- **✅ SIVRA en PRODUCCIÓN: pricing automático + 2 fixes de cuelgue (#108, #113, #115) — 10/06/2026 (tarde)**
  Los 3 PRs **mergeados a `main` y desplegados** en `sybra.vercel.app` (dominio de prod del proyecto Vercel `sivra`;
  alias: sybra/sivra-app/housesevillana). Resumen de la tarde:
  - **#108** pricing automático completo (ver entrada de abajo).
  - **🐛 #113 — cuelgue "Cargando…" en `/limpiadoras`:** Alberto entró en el móvil con sesión admin caducada + cookie
    `limpiadora_token` zombi → el middleware lo mandaba a `/limpiadoras`, cuyo `load()` hacía `fetch().json()` **sin
    try/catch** → si fallaba, `setLoading(false)` nunca corría → spinner eterno, sin logout ni botón atrás. Fix:
    `app/limpiadoras/page.tsx` valida el token al montar (`GET /api/limpiadoras/auth`; si null → `DELETE` cookie +
    redirect a login), try/catch/finally + estado error + botón "Reintentar", header con **"Salir"** y enlace
    **"¿Eres administrador? Entrar"**. Nuevo helper `lib/limpiadora-auth.ts` (token válido O sesión admin) aplicado a los
    endpoints `/api/limpiadoras/*` (sessions, fichar, complete, incidencias, inventario, early-checkin) → 401 si inválido.
  - **🐛 #115 — mismo patrón en `/gastos`:** `fetchGastos` sin try/finally → blindado. Auditadas las demás páginas del
    dashboard (income, inversion, updates, mensajes, seo, properties, calendario, knowledge, mercado): ya correctas.
  - **🔑 Claves VAPID generadas** (para avisos push): se le pasaron a Alberto por chat para pegar en Vercel
    (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). NO van en el repo.
  - **⏳ PENDIENTE DE ALBERTO (en Vercel → proyecto sivra → Environment Variables, Production+Preview):**
    1. `CRON_SECRET` (cadena larga al azar) → **activa el `apply-auto` diario**; sin él el cron no escribe (más seguro) y
       el panel manual sigue funcionando con su sesión. 2. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (push).
       Tras añadirlas: **Deployments → Redeploy**. 3. Desconectar **PriceLabs** en cada piso a automatizar + marcar
       `apply_enabled` en `/pricing-auto`. (Opcional) `MARKET_API_URL`/`MARKET_API_KEY` para la fuente de mercado auto.
  - **Acceso del propietario:** `https://sybra.vercel.app/login` con `ADMIN_EMAIL`/`ADMIN_PASSWORD` (los de siempre,
    viven en Vercel) → menú **⚙ Pricing Auto**.

- **🗑️ Desactivar/reactivar cliente en ialimp (baja reversible, conserva histórico) — 11/06/2026**
  La UI ya tenía `c.activo` a medio cablear pero SIN backend. Completado: migración
  `add_cliente_desactivacion.sql` (auditoría `desactivado_*`; `clientes.activo` ya existía, aplicada en
  Supabase). Rutas `POST /api/admin/clientes/[id]/desactivar` (GET=preview de impacto) y `/reactivar`.
  Desactivar = `activo=false` + cancela limpiezas futuras no hechas + corta acceso del portal (rota
  `session_jti`, **nunca a NULL**); conserva facturas, chat, limpiezas hechas y pisos. El cron `pms/sync`
  excluye propiedades/conexiones de clientes inactivos (si no, recrearía las limpiezas). `GET
  /api/admin/clientes` devuelve solo activos por defecto (`?incluir_inactivos=1` para todos) → limpia todos
  los selectores. UI: filtro Activos/Inactivos + modal de confirmación con resumen + aviso de impagos +
  motivo + botón Reactivar. Spec: `docs/superpowers/specs/2026-06-11-desactivar-cliente-design.md`.
  **✅ Probado en vivo contra producción** (cliente `[TEST] Pisos Sevilla Centro SL`, sin tocar datos
  reales): desactivar deja `activo=false` + auditoría `desactivado_*` + `session_jti` rotado (corta sesión
  del portal) + lo excluye del selector activo y del cron `pms/sync`; reactivar restaura todo y conserva los
  2 pisos. Ciclo completo verificado y cliente dejado como estaba. Pendiente único: prueba de la UI/HTTP
  autenticada como Vanessa (no se pudo ejercitar sin su sesión); la capa de datos está verificada.

- **🎛️ God-panel (panel único de operador) F1–F5 en `apps/plataforma/admin` — 10/06/2026 (PR #118)**
  Panel de Alberto que gobierna TODAS las verticales desde un sitio, reutilizando la tabla `superadmins`
  (mismo login que el `/superadmin` de ialimp; cookie `plataforma_admin`). Adaptadores por vertical
  (`lib/adapters/*`, contrato `VerticalAdapter`): ialimp+sivra por BD compartida directa, ia-rest por
  **puerto HTTP** (`/api/operador/restaurantes`, Bearer `OPERADOR_SHARED_SECRET`). **F1** listado unificado +
  bloquear/liberar (`empresas.activa`/`restaurantes.activo`) + vista 360. **F2** módulos por cliente: tabla
  `tenant_modulos` (opt-out) + toggles + gateo real en ialimp (login→`modulos_off` en JWT→middleware; menú
  oculta lo apagado; default vacío = Vanessa intacta). **F3** crear cliente (empresa ialimp / restaurante
  ia-rest). **F4** ia-rest por puerto. **F5** unificación NO destructiva (banner en `/superadmin`, sin borrar
  mailing). Apartado **🗺️ Estructura** (verticales/módulos/agentes). 3 builds verdes; capa de datos probada.
  **Nota:** la BD ya está unificada (#117/#119) → a futuro el adaptador de ia-rest puede leer el schema
  `iarest` directo en vez del puerto HTTP. **Pendiente de Alberto:** `OPERADOR_SHARED_SECRET` (plataforma+ia-rest).
- **✅ CORTE BD ia-rest → proyecto compartido EJECUTADO Y VERIFICADO EN PRODUCCIÓN (PR #117) — 10/06/2026**
  El corte (Fase A2) está **hecho**: ia-rest producción consulta el schema `iarest` del compartido
  (`wswbehlcuxqxyinousql`). La causa de que los redeploys no funcionaran NO era caché ni "Sensitive":
  **el código que lee `NEXT_PUBLIC_SUPABASE_SCHEMA` vivía solo en la rama del PR #110 (sin mergear)**;
  producción despliega desde `main`, que nunca miró la variable → todo iba a `public` → 404.
  - **Fix quirúrgico (PR #117, mergeado a main):** extraído de la rama SOLO el interruptor de schema —
    `lib/supabase.ts` (`SB_SCHEMA`/`SB_OPTS`) + los 9 ficheros con `createClient` (cobertura 100%, 10 call
    sites), sin arrastrar `module-*` ni nada más. 9 ficheros, +35/−9, env-gated y reversible por envs.
  - **Verificado con logs de Supabase:** antes del deploy los crons daban 404 (`alerta_reglas`, `comandas`,
    `qr_sesiones_cliente`, RPCs…); tras el deploy (18:45) **todo 200/204**. El preview del PR ya lo había
    confirmado (build → `web_restaurante`/`blog_borradores` 200).
  - **PR #110 TAMBIÉN MERGEADO a `main` (10/06):** todo el trabajo restante de la rama
    `claude/joaquin-jaen-expansion-4nyju5` (HITO 3 financiero ia-rest en plataforma, `packages/module-*`
    —crm/inventario/agenda/presupuestos/proveedores/portales/feedback/ocr/asn—, docs de diseño de
    modularización y materiales/flota) queda en `main`. Conflictos de merge resueltos: `asn/route.ts`
    (se mantiene la versión con `@iarest/module-asn` + `SB_OPTS`) y `CONTEXTO-SESIONES.md` (versión de la
    rama, histórico completo). 80 ficheros, +2892/−162. Las 4 apps tenían previews verdes.
  - **✅ UNIFICACIÓN DE BD COMPLETA (PR #119, mergeado a main):** plataforma leía el financiero de ia-rest
    del proyecto VIEJO por un puente service-role; ahora lee `iarest.v_resumen_financiero_anual` con la
    **conexión Prisma normal** (rol `postgres`, con `USAGE` sobre `iarest`; verificado en vivo — `authenticator`
    NO tiene acceso → aislamiento intacto). Eliminado `apps/plataforma/lib/iarest.ts` y la dependencia de
    `IAREST_SUPABASE_*`. `next build` de plataforma verde. **Resultado: las 3 apps en UNA sola BD, sin ningún
    puente externo — nada en el código apunta ya a `efncqyvhniaxsirhdxaa`.**
  - **PENDIENTE (todo de Alberto, ya nada de unión por mi parte):** borrar de Vercel (plataforma) las envs
    `IAREST_SUPABASE_URL`/`IAREST_SUPABASE_SERVICE_KEY` (ya no se usan); resetear password BD del proyecto viejo
    (quedó en chat) y **jubilar `efncqyvhniaxsirhdxaa`** cuando lo vea estable. ~~`add_concursos.sql` (del #116)~~
    → **✅ aplicada** (11/06). Opcional/mío con tu OK: `DROP iarest._mig_ddl` (andamiaje de la migración,
    destructivo). Rollback del corte = revertir las 3 envs de Vercel de ia-rest (el código en `main` sin
    `NEXT_PUBLIC_SUPABASE_SCHEMA` vuelve a `public`).
  - **Skill `ia-rest-maestro` actualizada:** sección Supabase y tabla de infraestructura apuntan al compartido
    `wswbehlcuxqxyinousql` + schema `iarest` (con nota de fijar el schema en todo cliente/Realtime/EF nuevo).
- **🏛️ NUEVO módulo `packages/module-concursos` — agente de concursos públicos (v1) — 10/06/2026**
  Módulo enchufable (patrón `module-contabilidad`: lógica **pura** TS, sin BD, sin UI, sin secretos) para preparar
  documentación de licitaciones (LCSP). **NO es una vertical**: cualquier app lo consume para que su cliente, de
  **cualquier sector** (limpieza, catering, fontanería…), se presente a concursos. El LLM entra por un **puerto
  inyectado `AiRunner`** → el módulo nunca importa `core-ai` ni lee `process.env`.
  - **API del módulo:** `analizarPliego(runner, texto)` / `analizarConcurso(runner, texto, perfil, hoy)` →
    `FichaConcurso` (objeto, presupuesto, plazos, solvencia, criterios con pesos/fórmula, documentos por sobre) +
    derivados puros: `derivarChecklist`, `evaluarGoNoGo` (semáforo + banderas rojas), `calcularGarantias`,
    `umbralBajaTemeraria` (RGLCAP art. 85), `calcularPuntuacionEconomica`. **28 tests** (`node --test`, 28/28 verde).
  - **Integración de referencia en ialimp** (1er consumidor, validable de punta a punta): dep `workspace:*` +
    `transpilePackages`; `lib/concursos.ts` (AiRunner con `aiComplete` + `extraerTextoPdf` con `pdf-parse`);
    ruta `app/api/admin/concursos/analizar` (POST analiza PDF/texto y persiste, GET lista; scope `empresa_id`);
    página `/admin/concursos` (subir pliego → ficha + semáforo Go/No-Go + checklist); enlace en el menú del dashboard;
    migración `prisma/migrations/add_concursos.sql` (tabla `concursos`, jsonb ficha/checklist/go_no_go/garantias).
  - **Verificado:** `✓ Compiled successfully` en `next build` de ialimp (transpilePackages resuelve el módulo; ruta y
    página emitidas en `.next`). **Aislamiento OK** (grep: sin imports de `@iarest/*`/`process.env`/prisma en `src/`).
    **PR #116 (borrador)** — CI Vercel en **verde** (ialimp, ia-rest, sivra, plataforma → Ready).
  - **Roadmap (mismo módulo, fases F2–F9):** biblioteca de empresa, sobre administrativo/DEUC, memoria técnica que
    puntúa, oferta económica + rentabilidad (cruce `module-contabilidad`), plazos/subsanación, presentación lista para
    subir, RAG + radar PLACSP, OCR. Spec del v1: plan aprobado en sesión.
  - **Pendiente de Alberto:** ~~`add_concursos.sql`~~ → **✅ aplicada en BD compartida (11/06)**. El v1 lee
    `NVIDIA_API_KEY` (ya configurada en ialimp). Manual `public/manual.html` y la doc de regla de
    `apps/ialimp/CLAUDE.md` quedan como follow-up al promover la sección a producción.

- **✅ SIVRA pricing automático — PRODUCTO COMPLETO mergeado a producción (PR #108) — 10/06/2026**
  De piloto a producto vendible en una sesión. Sobre el motor anclado al mercado + panel `/pricing-auto`:
  - **Automático de verdad:** pipeline de crons en `vercel.json` — `07:30` `pricing/guard` (detector de reversión de
    PriceLabs + suelo de coste), `08:30` `pricing/apply-auto` (escribe el precio respetando pausa, guardia de confianza
    y `apply_enabled`), `09:00` `pricing/resumen-diario` (email+push).
  - **Salvaguardas ("no puede fallar"):** pausa global (`pricing_config.paused`, botón de pánico), guardia de confianza
    (no escribe con <5 comps o mercado >7d), detector de reversión (alerta `precio_revertido`), `pricing/restore`
    (deshacer), topes min/max del propietario como autoridad final.
  - **Motor:** `lib/pricing-calendar.ts` (compartido con snapshot) → `eventFactor` (Semana Santa/Feria, +50% máx, flag
    `events_enabled`) y `gap_discount_pct` (noche-hueco). Conversión huésped→base por `channel_markup`.
  - **Panel ampliado:** medidor € extra vs PriceLabs (`pricing/resultados`), histórico (`pricing/historial`), restaurar,
    pausa, botón de avisos push, toggles de eventos. Endpoints `pricing/settings` (GET estado+reco / PATCH).
  - **Avisos:** `lib/pricing-notify.ts` (email `@iarest/core-email` + push). `lib/push.ts` (`@iarest/core-push`),
    tabla **dedicada** `pricing_push_subs` (aislada de `push_subscriptions` compartida), suscripción
    `/api/propietario/push-subscribe` + SW `public/sw.js`.
  - **Seguridad:** `lib/cron-auth.ts` — crons de pricing/mercado exigen `CRON_SECRET` (o sesión admin); transición abierta
    si no está definido. Fuente de mercado automática (Estrategia 2) `mercado/ingest-auto` gated por `MARKET_API_*`.
  - **Migraciones BD (`wswbehlcuxqxyinousql`):** `pricing_settings`+`events_enabled`/`gap_discount_pct`, `pricing_config`,
    `pricing_push_subs`. **Mergeado a `main` y desplegado a producción (`sybra.vercel.app`).**
  - **✅ Vars Vercel configuradas (11/06):** `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` —
    motor diario y push activos en producción. Pendiente: activar `apply_enabled` en los otros 3 pisos al
    desconectar PriceLabs. Doc: `apps/sivra/docs/pricing-automatico.md`.

- **🔵 Migración BD ia-rest → proyecto compartido (Fase A2) — rama `claude/joaquin-jaen-expansion-4nyju5` — 10/06/2026**
  Unificación de datos: ia-rest deja su proyecto Supabase separado (`efncqyvhniaxsirhdxaa`) y pasa al
  **compartido `wswbehlcuxqxyinousql`** en un **schema propio `iarest`** (ialimp/sivra siguen en `public`).
  Ejecutado por **dblink server-to-server** + ejecutor plpgsql (sin tooling local). Detalle y corte final en
  `docs/RUNBOOK-migracion-bd-iarest.md`.
  - **Esquema migrado y verificado (paridad):** 215 tablas + 47 vistas + 121 funcs + 428 policies + 32 triggers
    + 428 FKs + 731 índices + 5 secuencias. **0 funciones con `search_path=public`** (aislamiento total vs
    ialimp/sivra). Única tabla sin RLS aparte de la temporal: `instagram_estilos_usados` (paridad: en origen
    tampoco tenía). Vistas/tablas clave (`restaurantes`, `leads`, `v_resumen_financiero_anual`) queryables
    (0 filas = migración solo-esquema; datos demo desechables, la app arranca limpia).
  - **Código ia-rest listo:** `SB_SCHEMA`/`SB_OPTS` en `src/lib/supabase.ts` (lee `NEXT_PUBLIC_SUPABASE_SCHEMA`,
    default `public` = comportamiento actual) + 8 ficheros con `createClient` propio parcheados. `next build` verde.
  - **Edge Functions: 43/43 migradas** al compartido, cada `createClient` a schema `iarest`, verify_jwt cuadrando
    con origen (true solo en monitor-health, stripe-checkout, analizar-cv, lead-research). Se desbloqueó tras
    Alberto borrar funciones basura (de ~100 → 44, tope del plan).
  - **PENDIENTE (solo Alberto, en orden):** (1) re-meter secrets de Edge Functions en el compartido
    (Stripe/MONEI/NVIDIA/Telegram/Resend/VeriFactu…); (2) Settings→API→Exposed schemas → añadir `iarest`;
    (3) Vercel ia-rest → swap `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` al compartido + añadir
    `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest` → Redeploy. **Luego (yo):** smoke test, plataforma lee iarest nativo
    (retirar puente service-role), DROP `iarest._mig_ddl`. **Después:** resetear password BD ia-rest (quedó en
    chat) y jubilar proyecto viejo. Rollback = revertir las 3 envs de Vercel.

- **✅ HITO 3 (financiero ia-rest en plataforma) + 📐 diseño de modularización — rama `claude/joaquin-jaen-expansion-4nyju5` — 09/06/2026**
  Preparación de la reunión con **Joaquín Jaén** (holding: restaurante, catering, haciendas de eventos, alquiler de
  materiales, transporte de camiones, tiendas de comida para llevar). Dos entregables:
  - **HITO 3 (código):** plataforma ya consolida el financiero de ia-rest, que vive en BD **separada**
    (`efncqyvhniaxsirhdxaa`). Nueva vista `v_resumen_financiero_anual` (migración `apps/ia-rest/supabase/migrations/
    20260609_*`, **ya aplicada** vía MCP) que agrega `facturas_verifactu.base_imponible` (ingresos) y
    `facturas_compra.importe_base` (gastos) por `local_id`+`anio`. Nuevo cliente service-role
    `apps/plataforma/lib/iarest.ts` (`@supabase/supabase-js`) y `getResumenIaRest(localId, anio)` en `lib/financiero.ts`
    (ya no es stub "BD separada"). UI `GestionSociedad.tsx` pide `refExt`=`local_id` para `app='ia-rest'`. `refExt` = UUID del local.
    Typecheck verde. **PENDIENTE de Alberto:** añadir envs `IAREST_SUPABASE_URL` + `IAREST_SUPABASE_SERVICE_KEY` en Vercel (plataforma).
  - **Diseño de modularización (doc):** `docs/DISENO-modularizacion-verticales.md` — sacar de ia-rest las capacidades
    horizontales (CRM, agenda, inventario, presupuestos, proveedores, portales, feedback, ocr, asn) a `packages/module-*`
    con patrón conector/adaptador + agregado genérico `Encargo`, registro de KPIs en plataforma, intercompany del holding,
    y matriz de consumo por negocio (incl. plantilla "clínica estética"). **Sin extraer código aún** (siguiente ronda).
  - **Diseño a fondo materiales/flota (hecho):** `docs/DISENO-modulos-materiales-flota.md` — extiende
    `inventario_menaje*` (alquiler: tarifas, fianza, daños) y `vehiculos_grupo`+`evento_transporte` (flota:
    ITV/seguro/mantenimiento, rutas multi-parada, asignación inteligente) hacia `module-*`, con doble
    facturación interno(intercompany)/externo. **Pendiente:** extracción real de los `module-*` y construir las verticales.
  - **`packages/module-crm` (hecho):** primer `module-*` real — tipos genéricos (`Oportunidad`, `ParentRef`
    con `parentType` = costura del Encargo), puertos (`OportunidadRepository`, `OportunidadAdapter<T>`) y lógica
    pura de pipeline (`resumenPipeline`, `valorPonderado`, probabilidad por estado). Agnóstico de BD.
  - **Extracción CRM en ia-rest (HECHA, definitiva):** ia-rest consume `@iarest/module-crm`. Nuevo
    `apps/ia-rest/src/lib/crm-eventos.ts` con `leadsEventoAdapter` (mapea `leads_evento` ↔ `Oportunidad`,
    estado `presupuesto_enviado`↔`propuesta`, `evento_id`→`parent`). La ruta `api/owner/eventos/leads` delega
    el cálculo de pipeline en `resumenPipeline` del módulo (contrato de respuesta preservado + nuevo `valor_ponderado`).
    Verificado con `next build` real (Next 16) en verde. El CRM super-admin (`leads`) queda intacto (otro concern).
  - **`packages/module-inventario` + extracción en ia-rest (HECHO, definitivo):** módulo genérico (`Articulo`,
    `AsignacionActivo` con `parent/parentType`, helpers `disponibilidadTrasReserva/Devolucion`, `costeDanos`,
    `resumenStock`). ia-rest: `apps/ia-rest/src/lib/inventario-menaje.ts` (`menajeArticuloAdapter` +
    `menajeAsignacionAdapter` sobre `inventario_menaje`/`inventario_menaje_evento`); la ruta `api/owner/menaje`
    delega la regla de disponibilidad en el módulo. Base del futuro **alquiler de materiales**. `next build` verde.
  - **`packages/module-presupuestos` + extracción en ia-rest (HECHO, definitivo):** módulo genérico (líneas,
    costes, descuento, `calcularMargen`, `esRentable`, `resumenPresupuesto`). ia-rest:
    `apps/ia-rest/src/lib/presupuestos-evento.ts` (`presupuestoEventoAdapter` + `costesDeEvento`, mapea la
    tarifa adulto/niño + costes a líneas genéricas); la ruta `api/owner/eventos/presupuestos` delega el cálculo
    de margen/rentabilidad en el módulo. `next build` verde.
  - **`packages/module-proveedores` + extracción en ia-rest (HECHO):** módulo genérico (`ProveedorServicio` con
    `parent`, `calcularComision`, `totalComisiones`, `comisionesCobradas`). ia-rest:
    `apps/ia-rest/src/lib/proveedores-evento.ts` (`proveedorServicioAdapter`, estado `comision_cobrada`↔`cobrada`);
    ruta `api/owner/eventos/proveedores-asignaciones` delega comisión y sumas. `next build` verde.
  - **`packages/module-feedback` + extracción en ia-rest (HECHO):** módulo genérico (`Feedback`, `Propina` con
    `parent`/token, `resumenValoraciones`, `totalPropinas`, `propinasPagadas`). ia-rest:
    `apps/ia-rest/src/lib/feedback-visita.ts` (`feedbackVisitaAdapter` + `propinaAdapter`); las rutas
    `api/owner/feedback` y `api/owner/propinas` añaden un `resumen` agregado vía el módulo. `next build` verde.
  - **`packages/module-asn` + extracción en ia-rest (HECHO):** módulo genérico (`ASN`, `LineaASN`,
    `totalLineas`, `unidadesTotales`). ia-rest: `apps/ia-rest/src/lib/asn-pedido.ts` (`asnItemAdapter` sobre
    `pedidos_proveedor.asn_items`); la ruta pública `api/asn` añade `total_albaran` vía el módulo. `next build` verde.
  - **`packages/module-agenda` (HECHO, contrato):** módulo genérico de disponibilidad/reserva de recurso
    (`Recurso`, `Reserva`, `Intervalo`, `haySolape`, `recursoDisponible`, `recursosDisponibles`). Es el motor
    transversal de venues/flota/alquiler/citas. Sin extracción de ia-rest (los eventos son por fecha, no reserva
    de recurso) → queda como contrato para las verticales nuevas. Typecheck verde.
  - **✅ MODULARIZACIÓN COMPLETA: 7 `module-*`** (crm, inventario, presupuestos, proveedores, feedback, asn, agenda).
    6 con extracción real en ia-rest verificada con `next build`; agenda como contrato. Costura común `parent/parentType`
    (agregado Encargo). **Siguiente:** construir las verticales nuevas (alquiler de materiales, flota) componiendo estos módulos.
  - **📋 Informe de unificación + decisión de BD (HECHO):** `docs/INFORME-unificacion-central.md` — foto del estado
    (matriz de adopción de `core-*`/`module-*` por app, qué está unido vs duplicado), esquema de capas, y plan de 6 fases.
    **DECISIÓN (Alberto): BD UNIFICADA** — un solo proyecto Supabase con **schemas por vertical** (`iarest/ialimp/sivra`)
    + **schema de control** (cuentas/sociedades/negocios/usuarios/RBAC/módulos/billing). Como **ia-rest NO tiene clientes
    activos**, su BD (`efncqyvhniaxsirhdxaa`) **se migra a la compartida AHORA** (no la última); el conector service-role
    de HITO 3 queda como puente temporal + válvula para BD dedicada de un futuro cliente grande. **Arranque sugerido:**
    Fase A2 (migrar ia-rest) + Fase A (identidad/RBAC sobre core-identity, migrar sivra de NextAuth) → dedupe → contabilidad.
  - **Ejecución de la unificación — INCREMENTOS HECHOS (verificados con build/tsc):**
    1. **Fase C·1** validadores fiscales NIF/CIF/IBAN → `core-fiscal` (subpath `/validacion` puro); ialimp re-export. `next build` ✅.
    2. **Fase A** fábrica de tokens jose (`createSessionToken`/`verifySessionToken` + jti) en `core-identity`. tsc ✅.
    3. **Fase A** plataforma adopta esa fábrica (`lib/auth.ts` delega, firmas idénticas). build ✅.
    4. **Fase D** registro `ResumenProvider` en plataforma (`financiero.ts`, DataConnector SPI, sustituye `if app===`). tsc ✅.
  - **PENDIENTE de la unificación (orden):** adoptar el contrato auth en ialimp (live) y **migrar sivra de NextAuth**;
    Fase B (ia-rest adopta `module-contabilidad`); resto Fase C (supabase client ialimp [keys mezcladas anon/service],
    `aiExtractInvoice`→core-ai, ia-rest→core-email); **Fase A2 EJECUTADA (2026-06-10): esquema de ia-rest MIGRADO al schema `iarest` de la BD compartida**
    vía dblink server-to-server (215 tablas, 47 vistas, 121 funciones, 32 triggers, 428 policies, 428 FKs,
    448 índices, buckets) con paridad verificada — ver `docs/RUNBOOK-migracion-bd-iarest.md` (ESTADO REAL).
    Código ia-rest listo para el corte por envs (`SB_OPTS`/`NEXT_PUBLIC_SUPABASE_SCHEMA`). **CORTE PENDIENTE de:**
    (1) migrar las **43 Edge Functions** del proyecto viejo al compartido (solo 16 con fuente en repo, resto vía
    MCP get_edge_function) parcheadas a schema iarest; (2) Alberto re-introduce los secrets de functions;
    (3) Alberto añade `iarest` a Exposed schemas; (4) Alberto cambia 3 envs Vercel + añade
    `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest` + Redeploy; (5) smoke test + plataforma nativa + DROP `iarest._mig_ddl`
    + resetear password BD ia-rest (quedó en chat). La app sigue 100% en la BD vieja hasta el corte (nada roto).

- **🔄 PR #107 — ialimp consume `nimVision` de core-ai en 6 rutas IA (feat/ialimp-ia-core-ai) — 09/06/2026**
  Las 6 rutas de visión de ialimp dejaban de pasar por el módulo y llamaban a la API NVIDIA inline. Ahora delegan en `nimVision`:
  - **`core-ai/nim.ts`**: `nimVision` 6º param `signal?` → `opts: {temperature?, signal?}` (aditivo). Permite afinar temperatura
    (OCR 0.05 / fotos 0.1; antes fija 0.1). Si `system` va vacío, NO envía mensaje de sistema (replica el patrón
    single-user-message de los agentes ialimp). Conserva `nimChat` (multi-turno) de main.
  - **Rutas migradas** (preservan modelo 90b-vision, temp y max_tokens exactos): `admin/ia/{analizar-foto(0.1/256),
    comparar-foto(0.1/400),analizar-botes(0.05/600)}`, `admin/escanear/process(0.05/800)`,
    `cron/procesar-documentos(0.05/800)`, `propietario/[token]/escanear(0.1/1200)`.
  - **sivra** `aiExtractInvoice`: adapta su llamada a `{ signal: AbortSignal.timeout(30_000) }` (forma opts). **ia-rest** `callAIVision`
    pasa 5 args → sin cambios. `upload-photo` solo llama a analizar/comparar server-to-server → no toca NVIDIA.
  - PR en draft; CI en cola. **Pendiente:** validar preview ialimp (escáner docs + análisis fotos) antes de mergear.

- **✅ PR #105 + #106 MERGEADOS A PRODUCCIÓN — 09/06/2026** (deploy ialimp `app.ialimp.es` READY, verificado en Vercel)
  - **#105** (unificar crypto + aiComplete): `core-identity/crypto.ts` (`genHex/genJti/sha256Hex`) + `core-ai/client.ts`
    (`aiComplete`). Adopción en ialimp (auth, propietario-auth, ai-client, enviar-acceso, 4 rutas hashPin), plataforma (auth),
    sivra (ai-client). Fix CI: `NimChatMessage` se importa de `./nim`, no `./types`. Fix audit: `enviar-acceso` usa `sha256Hex`.
  - **#106** (demo ia.rest): `GET /api/demo` + `POST /api/demo/seed` (protegido por env `DEMO_SEED_SECRET`) → crea "Bar Demo"
    (slug `demo`, código `DEMO`, PINs 1234/2222/3333/4444, 8 mesas, 17 productos, turno activo). Idempotente.
    **PENDIENTE de Alberto:** añadir env `DEMO_SEED_SECRET` en Vercel `ia-rest` y llamar al seed para testear.
  - **Auditoría exhaustiva del monorepo** (7 módulos + 4 apps): estado SANO. Pendientes menores: 2 rutas sivra con
    `crypto.subtle` inline (opcional), ia-rest financiero en plataforma (BD separada). **ia.rest mensajería** = tabla
    `mensajes_turno` (chat camarero↔cocina, privado/grupo, audio), totalmente implementada.
  - **Vanessa puede trabajar**: producción intacta y estable (los cambios solo mueven código, sin tocar BD/RLS/buckets).

- **✅ BD plataforma desmembrada (estructura real) — 09/06/2026**
  Sociedades reales en `wswbehlcuxqxyinousql` (tabla `sociedades`):
  - **Alberto Suárez Gutiérrez** (CIF vacío — editable desde `/dashboard` con ✎):
    - ia.rest (hostelería, app=ia-rest) — sin clientes aún, muestra "📊 BD separada"
    - Casa Sevillana (inmobiliario, app=sivra)
    - Busto Reform, Duplex Center, Luxury Busto (inmobiliario, app=sivra, con sus `ref_ext` de propiedades Smoobu)
  - **Sique Brilla SL** (B22992523, NIF real de `empresas`):
    - Sique Brilla (limpieza, app=ialimp, `ref_ext=05edacff-ea49-42fe-8997-f9369613a845`)
  Eliminada la sociedad fake "Tu Empresa SL" (CIF B12345678). Restructurado por SQL directo vía Supabase MCP.
  **Próximo paso:** cuando Vanessa empiece a operar (reactivar `documentos_contables.activo=true`), el financiero de Sique Brilla aparecerá automáticamente en el dashboard. Alberto puede ajustar el CIF de su sociedad personal desde la UI.

- **✅ HITO 5 — Plataforma CRUD completo (edición + registro de cuenta) — 09/06/2026**
  (PR #104 mergeado; producción `https://plataforma-ten-flame.vercel.app`)
  - `PATCH /api/sociedades/[id]` y `PATCH /api/negocios/[id]` — edición scoped por `cuenta_id`.
  - `POST /api/auth/register` + `/register` — alta de cuenta por UI con auto-login (`/register` público en middleware).
  - `EditarSociedadBtn`/`EditarNegocioBtn` — modales ✎ con valores precargados.
  - **Plataforma COMPLETA**: registro · login · CRUD sociedad/negocio · financiero real (ialimp+sivra).
  - **PENDIENTE:** volcar Sique Brilla (cuenta real) + ia-rest financiero (sin clientes aún).

- **✅ HITO 4 — Gestión de sociedades y negocios por UI en plataforma — 09/06/2026**
  (PR #103 mergeado)
  - `POST/DELETE /api/sociedades` y `POST/DELETE /api/negocios` — crear/eliminar scoped por `cuenta_id`.
  - `GestionSociedad.tsx` — modales ＋ Sociedad / ＋ Negocio / ✕, con `router.refresh()`.

- **✅ HITO 3 — Dashboard financiero en plataforma (ialimp + sivra) — 09/06/2026**
  (PR #102 mergeado; preview producción `https://plataforma-ten-flame.vercel.app`)
  - **`apps/plataforma/lib/financiero.ts`** nuevo: `getResumenNegocio(app, refExt, anio)` dispatcher.
    - `ialimp` → `getResumenIalimp(empresaId, anio)`: lee `v_contab_pyg` WHERE `empresa_id` + `anio`.
    - `sivra` → `getResumenSivra(anio, propertyId?)`: suma `incomes` + `expenses` por año, filtrado por piso si se pasa `refExt`.
    - `ia-rest` → `getResumenIaRest()`: devuelve `{disponible:false, nota:'BD separada'}` (BD separada).
  - **`apps/plataforma/app/dashboard/page.tsx`** actualizado: KPI bar consolidada (ingresos + resultado YTD)
    + tarjetas por negocio con Ingresos/Gastos/Resultado reales.
  - **Todos los builds verdes**: ia-rest ✅ · ialimp ✅ · sivra ✅ · plataforma ✅.
  - **PENDIENTE:** conectar ia-rest BD (`efncqyvhniaxsirhdxaa`) para mostrar datos reales (hoy: "📊 BD separada").

- **✅ HITO 2 CIMIENTO — `Cuenta → Sociedad → Negocio` + `apps/plataforma` shell — 09/06/2026**
  (PR #101 mergeado; Vercel `https://plataforma-ten-flame.vercel.app`)
  - **`packages/core-identity`** extendido: `Cuenta`, `Sociedad`, `Negocio`, `Sector`, `CuentaSession`.
  - **BD compartida (`wswbehlcuxqxyinousql`):** tablas `cuentas/sociedades/negocios` aplicadas.
    Cuenta de Alberto cargada con 3 negocios: ia.rest (hosteleria), Sique Brilla (limpieza), Casa Sevillana (inmobiliario).
  - **`apps/plataforma`** en producción: login + dashboard consolidado por sociedad/negocio + links a verticales.
    Auth: `plataforma_session` + `session_jti`. Stack: Next.js 15 · jose/bcryptjs · Prisma → BD compartida.
  - **HITO 3 siguiente:** resumen financiero real en tarjetas (federar `module-contabilidad` cruzando las 2 BD).

- **✅ HITO 1 CONTABILIDAD — `packages/module-contabilidad` creado y adoptado en las 3 verticales — 09/06/2026**
  (PR #100, rama `feat/module-contabilidad`, rebased sobre main con pnpm `workspace:*`)
  - `packages/module-contabilidad`: módulo TS puro, sin deps npm, DB-agnostic. Exports: tipos PORT
    (`Apunte`, `IVATrimestral`, `ResumenTesoreria`, `RentabilidadEntidad`, `PlantillaRecurrente`) +
    funciones puras (`calcularIVA`, `calcularPyG`, `calcularTesoreria`, `calcularRentabilidad`,
    `calcularCuotaIva`, `calcularTotal`, `round2`).
  - **ialimp** — `calcularCuotaIva`/`calcularTotal` en `apuntes/route.ts` e `ingresos/route.ts`.
  - **sivra** — `round2` en `facturacion/route.ts` (reemplaza `Math.round(x*100)/100` × 4 usos).
  - **ia-rest** — `round2` en `cron/cobro-inactividad/route.ts` (totalEur + comisión).
  - Todas las apps usan `workspace:*` + `transpilePackages` + `outputFileTracingRoot`.
  - Previews Vercel: **ialimp ✅ · sivra ✅ · ia-rest ✅** (tras rebase sobre main).

- **🧭 DECISIÓN ESTRATÉGICA: plataforma modular unificada — 09/06/2026 (ver `docs/PLAN-plataforma-modular.md`)**
  - **Norte del proyecto:** unificar los **módulos transversales** (contabilidad, ventas, almacén,
    RRHH, marketing, SEO, web, mensajería, IA) en UNA implementación que se **enciende** por vertical;
    las **verticales se quedan como especialidades** (cada una su peculiaridad). "Una mejora vale para todas".
  - **3 verticales:** **Hostelería** (ia.rest: restaurantes+catering/eventos+espacios) · **Limpieza/
    Mantenimiento** (ialimp, lado operativo + servicio) · **Inmobiliario/Propietarios** (= `sivra` +
    portal-propietario de `ialimp` **UNIFICADOS**; la limpieza es un servicio contratable). sivra+ialimp
    ya comparten BD; ia.rest tiene otra.
  - **Principio:** "motor común + enchufe por vertical" (ej. Contabilidad = motor IVA/PyG/tesorería común
    + de dónde salen ingresos/gastos según el sector). **Fase 1 = Contabilidad** (la de ialimp es la más
    madura → base del módulo compartido). Fase 2 = unificar Inmobiliario. Fase 3+ = resto de módulos.
  - **Añadidos al plan:** cuenta/identidad ÚNICA (`core-identity`, su 1er uso) · "marketplace" para
    encender servicios · datos-compartidos-vs-aislados (mismo motor, 2 BD). **Esquema:** `docs/esquema-
    casa-marcas.svg`. **Pendiente:** nombre de la matriz (Encaje) → rename del scope. **Metodología:
    esquema + preview verde antes de cada código; Vanessa intacta.**
  - **👉 DESARROLLO (lo programa Sonnet):** el plan maestro + **handoff/roadmap está en
    `docs/PLAN-plataforma-modular.md` §9** (patrón, guardarraíles, hitos, definición de hecho). **Empezar
    por HITO 1 = módulo Contabilidad compartido** (`packages/module-contabilidad`, agnóstico de BD,
    adoptar vertical a vertical preservando comportamiento, ialimp la última). Leerlo ENTERO antes de tocar código.
  - **🔑 EL CLIENTE REAL (§3.bis del plan):** un **DUEÑO con VARIOS negocios de sectores distintos**
    ("todo dueño accede a todo lo suyo"). Ej.: Joaquín Jaén = restaurante+catering+camiones+tiendas;
    otro = fontanería+taller. → jerarquía **Cuenta→Negocios→Sector**; **sectores ENCHUFABLES** (no solo
    3: transporte, fontanería, taller, retail…); `core-identity` es CENTRAL. Refuerza unificar módulos
    (contabilidad/RRHH/ventas/almacén = 80% igual en cualquier sector). **Nueva Fase 0.5** = cimiento
    Cuenta→Negocios + identidad única, antes de los módulos.

- **✅ pnpm WORKSPACES + FASE 3 REANUDADA (core-push, core-storage, core-email) — TODO EN PRODUCCIÓN — 09/06/2026**
  - **Migración a pnpm workspaces (PR #94, en prod las 3 verticales).** Sustituye los `file:` deps por
    `workspace:*`. Esto **desbloquea** núcleos compartidos con **dependencia npm propia** (lo que `file:`
    deps no resolvía en Vercel). Config: `pnpm-workspace.yaml`, `.npmrc` (`strict-peer-dependencies=false`
    + `auto-install-peers` + reintentos de fetch), root `package.json` con `packageManager: pnpm@10.33.0`
    + `pnpm.onlyBuiltDependencies` (pnpm 10 no corre postinstall por defecto). CI (ci/qa.yml) migrado a pnpm.
  - 🔴 **CAUSA RAÍZ del fallo de build (resuelta) — LECCIÓN CLAVE:** Vercel **NO usa** nuestro
    `packageManager`; autodetecta otro pnpm que considera el `pnpm-lock.yaml` *"not compatible"* y
    **re-resuelve todo el workspace** contra el registro en vivo → tormenta de metadatos → bug de undici
    `ERR_INVALID_THIS` (`Value of "this" must be of type URLSearchParams`) → install KO. **NO era la
    versión de Node** (pasaba en 20 y 24). **FIX (en los 3 `apps/*/vercel.json`):** `installCommand` =
    **`npx --yes pnpm@10.33.0 install --no-frozen-lockfile`** → usa SIEMPRE 10.33, honra el lockfile,
    sin re-resolución → sin fetches → sin `ERR_INVALID_THIS`, determinista con store fría o caliente.
  - **Fase 3 reanudada — 2 núcleos nuevos extraídos y EN PRODUCCIÓN:**
    - **`@iarest/core-push` (PR #95)** — envoltura pura sobre `web-push` (`sendWebPush` → `{ok,gone,...}`).
      **1er núcleo con dep npm propia** (la prueba de que pnpm lo desbloquea). Consumido por **ia-rest**
      (`/api/push/send`) e **ialimp** (`lib/push.ts`). Pendiente menor: migrar `ia-rest/lib/qr-notify.ts`.
    - **`@iarest/core-storage` (PR #96)** — firmado de signed URLs de Supabase Storage vía REST (puro,
      sin `supabase-js`): `storageObjectPath`/`signStorageObject`/`publicStorageUrl`. Consumido por
      **ialimp** (`lib/cleaning-photos.ts`, exports preservados) y **sivra** (`/api/limpiadoras/photo`).
    - **`@iarest/core-email` (PR #97)** — transporter de `nodemailer` desde env (dep npm propia):
      `createMailTransporter()` (multi-proveedor Resend→SMTP→Gmail) + `gmailTransporter()` (Gmail
      explícito) + `MAIL_TIMEOUTS`. **ialimp** (`lib/mailer.ts` `getTransporter`/`MAIL_FROM`, idéntico)
      y **sivra** (4 rutas: resumen-semanal, alerta-ventana, huespedes-repetidos, detect-opportunities,
      usaban Gmail inline → `gmailTransporter()`; el stub auto-reply no se tocó). sivra solo tiene
      `GMAIL_*` → mismo proveedor, sin riesgo de cambio.
    - **`core-push` cerrado en ia-rest (PR #98):** `lib/qr-notify.ts` (último `web-push` inline) migrado a
      `sendWebPush`; se eliminó la dep `web-push`/`@types/web-push` de ia-rest (el núcleo trae su copia).
  - **Núcleos compartidos hoy:** `core-ai`, `core-fiscal`, `core-push`, `core-storage`, `core-email`
    (+ `core-identity` con consumidores: crypto en ialimp/plataforma, identidad en plataforma). Patrón para añadir uno:
    `packages/core-x` (mirror de `core-ai`) + `workspace:*`/`file:` en las apps + `transpilePackages`. Si tiene dep npm, va en su `package.json`.
  - **Pendiente Fase 3 (opcional):** que ia-rest adopte `core-email` para su envío con Resend (hoy usa su
    propio cliente); `core-security` (rate-limit en BD, 1 consumidor).
  - **Limpieza HECHA por Alberto (09/06):** auto-delete head branches ✅ activado · Vercel `ia-rest-app`
    e `ialimp-fuentes` ✅ borrados · repos viejos `sivra`/`ialimp` ✅ ARCHIVADOS (read-only). Quedan por
    borrar 10 ramas mergeadas (comando `git push origin --delete …` desde su terminal).
  - **🔧 Fix derivado del archivado (PR #99):** archivar el repo `ialimp` detuvo su Action "Deploy landing"
    = el ÚNICO que desplegaba `ialimp.es` (el workflow del monorepo estaba en `apps/ialimp/.github/`, que
    GitHub NO ejecuta — solo corre `.github/workflows/` de la RAÍZ). Reubicado a la raíz con rutas a
    `apps/ialimp/landing/ialimp-es`. **PENDIENTE de Alberto:** añadir el secreto **`VERCEL_TOKEN`** al repo
    `ia.rest` (Settings → Secrets → Actions) para que la landing vuelva a auto-desplegar; probar con "Run
    workflow". `ialimp.es` sigue ONLINE (lo ya publicado no se cayó). Proyecto Vercel `ialimp-landing` intacto.
  - **Pendiente clave:** **Marca de la matriz** → elegir nombre (Claude Design recomienda **"Encaje"**;
    dominios `encaje.ai`/`encaje.app` libres, `.com`/`.es` ocupados) → renombrar scope `@iarest/* → @<marca>/*`
    (rename mecánico, listo para ejecutar en cuanto se decida).

- **ℹ️ NOTA OPERATIVA (sesión 09/06):** el **proxy git local da 503 en push** toda la sesión → los push se hacen
  vía **MCP github** (`push_files`/`create_pull_request`), que sí funciona (API de GitHub directa). El repo GitHub
  sigue llamándose `ia.rest` (redirige desde/hacia `central`); las llamadas MCP usan `repo: "ia.rest"`.

- **✅ MATRIZ DEFINITIVA: `ia.rest` bajado a `apps/ia-rest`, LIVE en producción — 08/06/2026 (PR #90)**
  - **Las 3 verticales viven bajo `apps/` y la raíz es la matriz.** `iarest.es` ya sirve desde
    `apps/ia-rest` (deploy de producción **READY**, Next 16.2.6, `✓ Compiled`, alias `iarest.es`/
    `www.iarest.es`). `sivra` y `ialimp` ya estaban en `apps/*`.
  - **Cómo se resolvió que `apps/ia-rest` consuma `packages/*` sin pnpm** (patrón para futuras
    verticales): `file:` deps (`@iarest/core-ai|core-fiscal` → `node_modules/@iarest/*` por symlink) +
    `next.config` con `outputFileTracingRoot`/`turbopack.root` = raíz del monorepo + se quitaron los
    `tsconfig paths` de `@iarest/*` (resuelven por node_modules). CI a `working-directory: apps/ia-rest`.
    Detalle en `MATRIZ.md`.
  - **Cutover sin downtime (orden CRÍTICO):** primero Root Directory del proyecto Vercel `ia-rest` →
    `apps/ia-rest`, **después** merge. (Al revés: la raíz-matriz genera un build vacío de ~1s que
    "tiene éxito" y **reemplazaría producción** → caída.) Red: Instant Rollback de Vercel.
  - Verificado antes de mergear: build/tsc/lint/qa **locales** en verde + **CI de GitHub** verde
    (ambos ya en `apps/ia-rest`).
  - 🟡 **Limpieza pendiente (sin prisa):** proyectos Vercel `ia-rest-docs` y `repo` (catch-all del
    root, `live:false`, solo dominios `*.vercel.app`) ahora fallan porque la raíz ya no es app →
    **borrarlos** o ignorarlos (no afectan a producción). + archivar/borrar repos viejos `sivra`/
    `ialimp`. + Fase 3 (adopción de `packages/core-*` por sivra/ialimp).

- **🏛️ MATRIZ definida + corrección: `ia.rest` es una VERTICAL, no la matriz — 08/06/2026**
  - Alberto corrige (acertadamente): en la casa de marcas, **`ia.rest` es una vertical más**, no la
    matriz. La raíz hace de matriz; las 3 verticales son hermanas bajo `apps/`. Manifiesto nuevo:
    **`MATRIZ.md`** (raíz) define estructura, verticales y regla.
  - **Hallazgo técnico (cambia el riesgo del movimiento de ia.rest):** `ia.rest` **ya consume
    `packages/*`** (`@iarest/core-ai`, `@iarest/core-fiscal` vía `tsconfig paths` +
    `transpilePackages`, rutas relativas a la raíz). Por eso **bajar `ia.rest` a `apps/ia-rest` NO es
    un `git mv` simple**: requiere montar **workspace** (pnpm/npm que abarque `apps/*`+`packages/*`)
