# Bitácora de auto-informes de agentes — `central`

> **Para qué.** Cada agente programado (skill de `docs/SKILLS.md` § "Agentes programados")
> deja aquí UNA entrada por ejecución: qué hizo, qué dudó, qué falló. Es la materia prima
> del `agentes-entrenador` (rutina semanal) para mejorar los prompts por RENDIMIENTO real,
> no por intuición. El contenedor es efímero: si no queda escrito aquí, no existió.
>
> **Cómo se mantiene.** Los agentes SOLO añaden entradas arriba del todo (3-5 líneas máx.,
> en el mismo commit/PR de su pasada, o en un commit propio a `main` si su pasada no tocó
> el repo). El `agentes-entrenador` PODA las entradas ya procesadas en su pasada semanal
> (git guarda el histórico; este archivo no engorda). Nadie más borra aquí.
>
> **Formato por entrada (una línea de lista, multilinea si hace falta):**
> `- **YYYY-MM-DD · <skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx / SHA / —`
> Sin dudas ni fallos → escribir `dudas: —; fallos: —` (el "todo bien" también es señal).

## Entradas pendientes de procesar (lo más reciente arriba)
- **2026-08-08 · mercado-booking (2ª pasada MANUAL, para desbloquear el precio dinámico)** · hizo: 19
  ventanas más con el conector (190 comps, `booking_mcp`), eligiendo las fechas por el déficit REAL de
  cada bucket —el que ve el motor: fechas distintas SIN evento, contando `pricing_eventos_auto` además
  del calendario del repo—. Resultado: ago→ene con ≥3 fechas en los 4 pisos (p50 house 325/472/638/478/
  426/381€, dúplex 110/135/184/175/136/125€). dudas: 23-oct (12 pax, p50 ~830€ contra 615€ del resto de
  octubre) y 27-nov (4 pax, 247€ contra 163€ del 13-nov) parecen fechas de evento SIN catalogar; se
  escribieron igual —son mercado medido— pero convendría que el catalogador las mire, porque si lo son
  están inflando el bucket "normal" del mes; fallos: —. Latido NO escrito (pasada a mano, no es la
  Rutina). PRs/commits: este PR.
- **2026-08-08 · mercado-booking (pasada MANUAL, la Rutina no existe)** · hizo: reprodujo
  `/api/sivra/mercado/plan` con los helpers puros (120 ventanas de plan, 10 pedidas, las 10 sin medir
  nunca) y midió 5 con el conector: 4-sep 2p **p50 110€** · 4-sep 12p **474€** · 16-oct 4p **184€** ·
  6-nov 2p **156€** · 6-nov 4p **180€**. 50 comps escritos con `fuente='booking_mcp'`. dudas: se dejó
  el latido `sivra_mercado_booking` SIN escribir a propósito — una pasada a mano no es la Rutina, y un
  verde de cortesía habría apagado el aviso que dice justo lo que hay que arreglar; fallos: la Rutina
  diaria no ha dejado ni una huella desde que existe (`booking_mcp` = 10 filas sueltas del 06/08).
  Hallazgo: contra el corpus Serper del MISMO día, Booking desvía +85%/+96%/+53%/+44% a la baja en los
  aforos pequeños y **−45% a la alta en House** (12 pax: 260€ Serper contra 474€ reales).
  PRs/commits: #1299.
- **2026-08-08 · ialimp-client-health (semanal)** · hizo: pasada de salud de Sique Brilla
  (`empresa_id=05edacff-...a845`). PMS sync OK (Smoobu, `sync_error=null`, `last_sync_at` hoy
  07:40 UTC, 21 `cleaning_sessions` en 24h/7d). Programaciones sin cubrir: 0. Impagos activos
  en `facturas_clientes`: 0. Canal de alerta preflight 200 OK, sin aviso enviado (nada que
  reportar). dudas: —; fallos: —; PRs/commits: este commit (solo bitácora, sin cambios de código).
- **2026-08-08 · facturas-correo (trigger diario)** · hizo: Vía B sana (`dias_caido=1`, última copia
  07/08 en `_buzon_pdf` — PriceLabs; `agente_salud` sin cambios porque ya estaba en `ok=true`), sin
  backlog en `PDF-pendiente`/`Revisar` (ambas etiquetas a 0). 0 candidatos nuevos en Gmail
  (`newer_than:2d` vacío) y 0 subidas manuales nuevas en `_subir_aqui`/raíz 2026 (los 2 "FACTURA JULIO
  SOCORRO.pdf" sueltos de la raíz ya tenían aviso en `_DUPLICADOS_BORRAR` desde 03/08 y 06/08 — sin
  duplicar). Papelera con 19 avisos pendientes de borrado manual, sin verificación de zombis hoy (ya
  se hizo 06/08, nada cambió desde entonces). Roborock Amazon -247,92€ (House Sevillana, confirmado
  06/08) SIGUE sin aparecer en `movimientos_bancarios` — conciliación pendiente, a recoger en próximas
  pasadas. Booking dúplex 587,23€ aún no vence (16/08). dudas: —; fallos: —; PRs/commits: este commit
  (solo bitácora/memoria, sin cambios de código).
- **2026-08-07 · facturas-correo (a petición de Alberto, factura suelta)** · hizo: factura 47/2026 de
  **Jaime Salas Calderón** (instalaciones eléctricas, NIF 47010941-E) — reparación de avería en CGP +
  sustitución/conexión en cuadro eléctrico, base 230,00€ + IVA 21% 48,30€ = **278,30€**, fecha 06/08/2026,
  a nombre de Alberto en **C/ Socorro 24** → `turistico_pisos` / `prop_house_sevillana`, deducible.
  Archivada en Drive `08-Agosto-2026` (`1BNr2lF0FupYngJ_gxCheQ1da-0Z5XTZL`) + fila en `facturas_drive`
  (`jaime-salas-electricidad`, 2026-08). **Conciliación PENDIENTE**: no hay cargo de -278,30€ en
  `movimientos_bancarios` (feed PSD2 fresco, último movimiento 06/08; Alberto pagó por transferencia hoy
  07/08) — recoger el cargo en la próxima pasada e imputar `propiedad_id=prop_house_sevillana`.
  dudas: —; fallos: el Apps Script de Drive (`script.google.com`) está **bloqueado por la política de red**
  de este entorno (403 en CONNECT), así que la subida fue por el MCP de Drive; el PDF original pesa 563 KB
  (5 fuentes CID incrustadas) y no cabe en una llamada MCP → se archivó una copia **rasterizada 200 dpi
  1-bit (11 KB), legible al 100%** pero sin capa de texto. Si hace falta el original para el gestor, que
  Alberto lo suelte en `_subir_aqui`.
- **2026-08-07 · facturas-correo (trigger diario)** · hizo: Vía B sana (dias_caido=2, última copia
  05/08 en `_buzon_pdf` — Stripe/Anthropic, Allianz, Parte Sevilla; `agente_salud` actualizado), sin
  backlog en `PDF-pendiente`/`Revisar`, papelera `_DUPLICADOS_BORRAR` sin novedad (la 2ª copia de
  FACTURA JULIO SOCORRO ya estaba avisada 03/08 y 06/08). 2 candidatos Gmail: aviso PriceLabs de
  próximo cargo 49,97 USD (08/08, sin PDF aún — se archivará/conciliará cuando llegue la factura real
  por Vía B) y factura de impuestos de Stripe para la cuenta ia.rest (VAT propio de Stripe, no es
  compra de Alberto → fuera de alcance de esta skill); ambos `Facturas/Procesada`. `Luz pendiente 2026`
  revisada: mismos 6 hilos TotalEnergies (abr-jun) ya documentados como contratos viejos de la SL, no
  conciliables aquí — sin cambios. dudas: —; fallos: —; PRs/commits: PR #1286 (cerrado en conflicto,
  bitácora rescatada en la pasada de resolución del 07/08).
- **2026-08-06 · facturas-correo (trigger diario)** · hizo: Vía B sana (`dias_caido=1`, `agente_salud`
  actualizado); backlog `Extraccion-fallida` limpiado (8→0: 1 DIGI ya archivada/conciliada, 2 Parkinglibre
  sin gasto real o personal, 5 correspondencia Mapfre — ninguno era factura pendiente real, solo residuo
  de etiqueta); 4 candidatos nuevos de Gmail (Amazon tinte+leche infantil = personal, Booking pregunta de
  huésped, expediente propio) sin acción, marcados `Procesada`; factura SIQUE BRILLA nº 2025/333 (780,10€,
  lavandería Luxury/Bustos Reforma/Duplex/Casa Socorro, subida manual duplicada 2×) conciliada contra banco
  (estaba mal clasificada `personal`, corregida a `turistico_pisos`) — 2ª copia duplicada registrada en
  `_DUPLICADOS_BORRAR`; auto-verificación de 15 avisos antiguos de la papelera: ninguno zombi, todos
  siguen pendientes de borrado manual. Roborock Aspirador (Amazon, 247,92€, envío a Costa Ballena/Rota,
  Cádiz) confirmado por Alberto en la misma sesión como gasto deducible de House Sevillana → archivado en
  Drive (sin PDF adjunto en el pedido, guardado el cuerpo del pedido como justificante), `Facturas/Revisar`
  quitada, `Facturas/Procesada` puesta; conciliación bancaria pendiente (el cargo -247,92€ aún no aparece
  en `movimientos_bancarios`, a recoger en la próxima pasada). dudas: —; fallos: —.
  PRs/commits: PR #1279 (cerrado en conflicto, bitácora rescatada en la pasada de resolución del 07/08).
- **2026-08-05 · psd2-health-check** · hizo: preflight canal alerta OK (200); consulta frescura
  `movimientos_bancarios WHERE origen='psd2'` → último movimiento 05/08/2026 (hoy), mov_30d=68 vs
  mov_30d_prev=71 (sin caída >50%) → **✅ OK**, sin anomalía, sin aviso Telegram. dudas: —; fallos: la
  consulta SQL de la skill usa columna `fecha` que no existe en la tabla (es `fecha_operacion`) —
  drift de esquema, corregido ad-hoc en esta pasada pero el `.md` de la skill sigue con el nombre
  viejo. PRs/commits: este commit (solo bitácora).
- **2026-08-05 · facturas-correo (trigger diario)** · hizo: Vía B sana (dias_caido=1, `agente_salud`
  actualizado), `PDF-pendiente` vacío. Re-archivadas 3 facturas Booking (comisión julio, 110,74+155,94+167,01€,
  `turistico_pisos`) de "ALBERTO 2026 PERSONAL (SEGUROS)/AGOSTO" a `08-Agosto-2026` — mismo bug del cron
  `facturas-scan` visto el 01/08 y 10/07; avisos en `_DUPLICADOS_BORRAR`. **Metí la pata con DIGI**: intenté
  re-archivarla sin comprobar antes si ya estaba archivada — ya lo estaba (30/07, `07-Julio-2026` canónica,
  conciliada) y además la copié a una carpeta `07-Julio-2026` DUPLICADA (no canónica, sin limpiar desde 07/07)
  → dejé nota de corrección en `_DUPLICADOS_BORRAR` anulando mi propio aviso erróneo. **2 hallazgos fuera
  de Gmail, en `gastos` (cron `facturas-scan`):** (1) 2 facturas "Allianz" (301,70€ y 291,73€) son en
  realidad extractos de cuenta de MEDIADOR sobre pólizas de UN CLIENTE (Jaenes Amarillo), no gasto de
  Alberto — importes que ni siquiera casan con ninguna cifra del documento (parecen inventados por la
  extracción); (2) documento "Reserva San Luis 9" (Ariste Investments, compra del edificio San Luis 9 por
  3.300.000€, reserva de 33.000€ pagadera en 2 días hábiles desde el 31/07) generó 2 filas de "gasto" de
  3,3M€ y 33.000€ — es una operación de venta de un inmueble (San Luis 9 CB, del que Alberto podría ser
  copropietario vía Punto y Coma), no un gasto deducible; el 33.000€ tenía plazo de pago ~03-04/08. Avisado
  a Alberto por Telegram — ninguna de las 4 filas debe contarse como gasto. dudas: si Alberto es
  copropietario de San Luis 9 CB y qué hacer con el plazo de la reserva (probablemente ya vencido); fallos:
  mi propio error de duplicar DIGI sin comprobar primero si ya estaba archivada (corregido en la misma
  pasada); PRs/commits: PR #1254 (cerrado en conflicto, bitácora rescatada en la pasada de resolución del 07/08).
- **2026-08-01 · facturas-correo (trigger diario)** · hizo: Vía B sana (dias_caido=0, `agente_salud`
  actualizado), sin backlog en `PDF-pendiente`/`Revisar`. 2 candidatos: Giraldillo AFV-11808 (72,60€,
  lavandería, deducible `turistico_pisos`) archivado en Drive con nombre normalizado, conciliación
  bancaria pendiente (factura sigue "PENDIENTE" de pago, sin cargo aún) — y ParkingLibre (extracto a
  0,00€, sin gasto real, sin archivar). Ambos hilos `Facturas/Procesada`. **Hallazgo:** el cron de
  producción `facturas-scan` (`apps/plataforma/lib/agente-facturas/drive.ts`) sigue archivando TODO lo
  que procesa (Giraldillo y ParkingLibre de hoy incl.) en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` en vez
  de la estructura de negocio — mismo patrón ya visto con Castuera el 10/07 (aviso aún sin borrar);
  registrado nuevo aviso en `_DUPLICADOS_BORRAR` para Giraldillo. dudas: —; fallos: — (la mis-ubicación
  del cron no es de esta skill, pero convendría revisar `DRIVE_SCRIPT_URL`/resolución de carpeta);
  PRs/commits: rama `claude/inspiring-gauss-us1b8v`.

- **2026-08-03 · pricing-agente (sesión interactiva, pregunta de Alberto por una reserva)** · hizo:
  auditada reserva Dúplex 25-28 sep (159,63€/noche bruto, infrapreciada: mercado del finde p50 258€ a
  4pl), Bienal de Flamenco 2026 (9 sep–3 oct oficial) dada de alta en `pricing-calendar.ts`
  (plataforma+sivra), 60 comps de 4 findes ingestados en `market_rates` (Booking MCP, upsert del
  ingest), aprendizaje en `pricing_aprendizaje`; dudas: el pico ×1,5 del finde 25-27 vs 18-20 no está
  atribuido a un acto concreto de la Bienal; fallos: —; PRs/commits: rama `claude/duplex-dynamic-pricing-435igu`.
- **2026-08-01 · health-check (sesión interactiva, continuación 30/07)** · hizo: verificado por logs
  Vercel que el sync Smoobu corre (200 el 31/07 y 01/08) y que el 🔴 del Check 4 era sequía de reservas,
  no avería; a petición de Alberto, Check 4 reescrito sobre latido real (`agente_latidos.smoobu_sync`,
  registrado por `runSync`) — 🔴 solo con sync parado >26h, sequía → ✅ informativo; dudas: —; fallos: —;
  PRs/commits: rama `claude/health-check-2026-07-30-vlv4c7` (2º PR).
- **2026-08-01 · rrhh-compliance-calendar** · hizo: pasada mensual sobre `docs/ROADMAP-rrhh.md`;
  9 ítems 🔴 obligatorios pendientes (fichaje RD 8/2019, geolocalización, TSA, art.28 RGPD, canal
  denuncias Ley 2/2023, informe ITSS, Modelo 145, alerta NIE, borrado RGPD automatizado — PRL ya
  marcado ✅ hecho); aviso Telegram enviado (canal 200 en preflight). dudas: —; fallos: —;
  PRs/commits: commit directo a `main` (solo doc).
- **2026-07-31 · pricing-agente (check-in programado del cutover)** · hizo: verificado que el sync de
  Smoobu NO está roto (cron 05:01 → 200; `incomes` parado desde 25/07 es sequía real, corroborada por
  `available` de Smoobu) y que el motor tarifica en mercado (Busto 81€ vs p50 80€). Documentada en
  `references/ciclo.md` la trampa `price_ours` (fórmula legacy congelada) que ya ha provocado DOS falsas
  alarmas — la del 27/07 y una mía hoy, detectada antes de reportarla. Aprendizaje escrito en
  `pricing_aprendizaje` (ALL/2026-08). dudas: por qué Luxury liberó 1-12 agosto sin reserva en `incomes`
  (¿bloqueo manual?); fallos: — (hallazgo comercial: agosto arranca a 0/31 en tres pisos, escalado a
  Alberto); PRs/commits: rama `claude/pricing-check-31-07`.
- **2026-07-30 · pricing-agente (auditoría pre-cutover, sesión interactiva)** · hizo: auditoría de
  preparación 100% dinámico (BD + crons + raíles + evidencia piloto) — sin bloqueantes; actualizada la
  doc de skill (suelos 65/72 del 28/07) y programado re-check del apply-auto de hoy; dudas: aforo Luxury
  4 vs 5 camas pendiente de Alberto; fallos: `incomes` sin insertar desde 25/07 (esperado hasta el sync
  de mañana 05:00 UTC post-dispatcher); PRs/commits: rama `claude/dynamic-pricing-audit-4cbdxv`.
- **2026-07-30 · health-check (sesión interactiva, skill psd2-health-check)** · hizo: resueltos los 2 🔴
  del health-check — duplicado PSD2 por drift del concepto (`Nº`→`N`, guarda nueva en `lib/psd2.ts` +
  saneo SQL aplicado) y Smoobu stale (causa: crons mudos pre-dispatcher #1165; sync a `?days=7`);
  dudas: el Check 4 mide "última reserva nueva", no salud del sync (`incomes` sin `updatedAt`) — puede
  dar falsos 🔴 en rachas sin reservas; fallos: —; PRs/commits: rama `claude/health-check-2026-07-30-vlv4c7`.
- **2026-07-29 · agentes-entrenador** · hizo: pasada a petición de Alberto ("repara todo") tras
  descubrir que 2 pasadas semanales previas (26/07 PR #1090, 27/07 PR #1108) y varios PRs de otros
  agentes se habían quedado **cerrados sin mergear** en un barrido manual de Alberto (73→31 PR
  abiertos en minutos) — cerrar sin mergear perdió contenido real, no solo ruido. Verificado uno a
  uno contra `main` qué sobrevivió y qué no: **ya estaba** (llegó por otras sesiones) el filtro
  `origen='psd2'` de `psd2-health-check`, el aviso Telegram tras 2 ciclos bloqueados de
  `pricing-agente`, el recordatorio de auto-informe de `facturas-correo`, y el caso de prueba
  numérico de `auditoria-central`. **Se había perdido y se ha reaplicado en esta pasada:** (1) queries
  de `ialimp-client-health` (PR #1084 cerrado 29/07 sin mergear) seguían señalando tablas inexistentes
  (`reservas`/`facturas`) — confirmado con Supabase que aún no existen, reaplicado el fix real
  (`pms_connections`+`cleaning_sessions`, `facturas_clientes`); (2) limpieza de 4 deps muertas
  (`date-fns`/`clsx`/`lucide-react` de ia-rest, `nodemailer` de rrhh — PR #748 cerrado 29/07, aún
  presentes y sin uso real hoy, verificado por grep) — reaplicada + lockfile regenerado + `tsc` 0 en
  ambas apps; (3) doc de `GITHUB_TOKEN` en `apps/sivra/CLAUDE.md` (PR #765 cerrado 29/07, env var
  aún ausente del doc y el código sigue exigiéndola) — reaplicado. Regla del `SKILL.md` propio
  (backlog de PRs) tampoco había sobrevivido → reaplicada con nota nueva sobre este mismo incidente
  (cerrar ≠ resuelto). Limpieza del propio backlog: cerrados 10 PR docs-only ya superados (verificado
  contenido factual ya capturado o resuelto en `main` antes de cerrar, no a ciegas) + reabierto y
  actualizado #1108. Diagnóstico de los pendientes 27-28/07 (ver abajo): sin acción de prompt en
  ninguno (buscador-ia/pricing-agente ya se habían resuelto solos; el guardián `avisado_at` de
  pricing-agente se mergeó minutos antes de esta pasada, PR #1118). **Aviso para seguimiento de
  Alberto (no es acción de prompt):** `pricing_decisiones` sigue vacía desde el 05/07 pese a que el
  fix de middleware (27/07) ya está en producción — verificar que el ciclo semanal del lunes
  produce decisiones reales. dudas: —; fallos: el patrón "PR cerrado sin mergear = trabajo perdido en
  silencio" ya es la 2ª vez que golpea a este mismo agente (antes fue "PR abierto sin mergear");
  PRs/commits: PR de esta pasada (reabre y sustituye #1108).

- **2026-07-27 · buscador-ia** · hizo: watch de deprecación de los 4 eslabones cableados de la
  cadena directa (NIM, Groq, Gemini, Kimi) — todos VIVOS, ninguno con retirada anunciada; descarte
  de un hilo de 404 intermitentes en el alias Gemini por ser anterior al swap del 12/07 y a la GA
  de Gemini 3.5 Flash de julio. Descubrimiento: Cerebras como 4º proveedor gratis independiente
  (infra WSE, 1M tok/día, mismo modelo `gpt-oss-120b` que Groq) — plumbing añadido
  (`packages/core-ai/src/cerebras.ts` + eslabón en `client.ts`, gateado por `CEREBRAS_API_KEY`,
  inactivo sin la key) vía PR draft `claude/youthful-gates-ntyg6c`; Mistral anotado como candidato
  secundario sin plumbing (rate limits no publicados, "solo evaluación" según el propio proveedor).
  Doc `docs/BUSCADOR-IA.md` actualizado. dudas: —; fallos: (1) no se pudo `tsc`/build en el
  contenedor — sin `node_modules` instalados, igual que otras pasadas anteriores; (2) **el aviso
  Telegram falló** (`POST /api/internal/alerta` → `401 No autorizado`) — mismo síntoma ya detectado
  por `agentes-entrenador` el 26/07 (`ALERTA_TOKEN` no coincide o falta en Vercel prod); avisado por
  push en su lugar. **Pendiente de Alberto:** revisar `ALERTA_TOKEN` en Vercel plataforma — sigue
  mudo para todos los agentes programados. PRs/commits: PR draft #1098 (`claude/youthful-gates-ntyg6c`).
- **2026-07-26 · agentes-entrenador** · hizo: pasada semanal (rango real 03/07→26/07 — el intento previo del
  19/07 quedó en un PR draft sin mergear, `claude/entrenador-auditoria-central-2026-07-19` #1008, así que la
  poda de main nunca se aplicó; esta pasada la retoma y la completa). Evidencia de 24 entradas de bitácora
  (repartidas en 11 PRs abiertos sin mergear + main) más `docs/FEEDBACK-AGENTES.md`. Diagnóstico por agente:
  **pricing-agente** — bloqueo REPETIDO (20/07 y 22/07) del Paso 4 (`aplicar-propuesta` dryRun) por falta de
  `CRON_SECRET` en la sesión programada, quedando solo como «pendiente» silencioso en la bitácora dos
  semanas seguidas → añadida regla de escalado por Telegram tras 2 ciclos bloqueados (`SKILL.md`); el doble
  conteo de evento del 18/07 ya tenía su lección capturada (ver abajo, reaplicada de #1008 que seguía sin
  mergear). **facturas-correo** — patrón repetido 3ª vez (11/07, 12/07, 24/07) de sesiones que procesan
  correo real sin dejar entrada aquí → reforzado en Paso 0 que la entrada es obligatoria aunque la sesión
  sea ad-hoc o se corte a medias. **psd2-health-check** — falsa alarma 22/07 por no filtrar `origen='psd2'`
  (mezclaba el feed real con importaciones manuales) → añadido el filtro + nota explicativa. **auditoria-
  central** — reaplicada la regla de caso de prueba numérico para cambios de fórmula de pricing (ya
  redactada en el PR #1008 sin mergear; se repite aquí para no depender de que Alberto rescate ese PR).
  **ialimp-client-health** — esquema real ≠ el asumido en el SKILL.md (tablas `reservas`/`facturas`
  inexistentes) ya autocorregido por la propia sesión en PR #1084 (abierto, sin mergear) — sin acción
  adicional, solo señalado para que se mergee. **agente-huésped** — feedback del 04/07 y la regla «nos
  vemos» del 25/07 ya resueltas en `decidir.ts` en sus propias tandas (PRs #1088 y anterior, ambos
  mergeados) → feedback marcado procesado. **buscador-ia** — pasada 20/07 sana, WebFetch 403 puntual
  (resuelto con WebSearch) sin repetirse aún, sin acción. Sin evidencia suficiente para juzgar
  `trading-analista`, `github-vigia`, `fiscal-novedades`, `rrhh-compliance-calendar`, `correo-triaje` en
  este rango (no dejan entrada en esta bitácora — actividad real la hay, ver `CONTEXTO-SESIONES.md`, pero
  no en el formato que consume este agente). **Hallazgo transversal (no accionado, para que Alberto
  decida):** hay ≥11 PRs `claude/*` abiertos sin mergear solo con cambios de `docs/AGENTES-BITACORA.md` u
  otros docs de auto-informe — mientras sigan abiertos, la poda de este agente no "cuadra" con main y cada
  pasada tiene que ir a buscar la evidencia PR a PR en vez de solo leer el archivo. dudas: —; fallos: (1)
  el intento del 19/07 (rama `claude/upbeat-shannon-5j9re4`/PR #1008) hizo el trabajo pero nunca se
  mergeó — posible causa: el carril 2 abre PR pero nadie lo revisa si no hay aviso Telegram que aterrice
  o si el aviso se pierde; (2) **el propio aviso Telegram de ESTA pasada falló** —
  `POST {PLATAFORMA_URL}/api/internal/alerta` con el `ALERTA_TOKEN` de la sesión devolvió `401 No
  autorizado` (token no coincide con el `ALERTA_TOKEN`/`CRON_SECRET` real en Vercel prod, o la env no
  está puesta) — mismo síntoma que el bloqueo de `pricing-agente` por secreto ausente/incorrecto en
  sesión programada. Avisado a Alberto por el canal nativo de la rutina (push) en su lugar; **pendiente
  de Alberto:** verificar que `ALERTA_TOKEN` en Vercel plataforma coincide con el que reciben las
  sesiones programadas — si este endpoint falla en silencio, TODOS los avisos Telegram de agentes
  (`psd2-health-check`, `pricing-agente`, `facturas-correo`…) están mudos ahora mismo; PRs/commits: esta
  rama (`claude/upbeat-shannon-934ce5`, PR #1090)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-29 · pasada a petición de Alberto ("repara todo") · 6 entradas procesadas y podadas
(auto-informe del entrenador del 26/07 + buscador-ia 27/07 + pricing-agente 27/07 ×3 + pricing-agente
28/07 + facturas-correo 28/07). Causa raíz de esta pasada: Alberto cerró en bloque ~40 PR sin mergear
(73→31), incl. 2 pasadas propias del entrenador (#1090, #1108) y varios de otros agentes — verificado
uno a uno qué contenido sobrevivió a `main` por otras vías y qué se había perdido de verdad. Reaplicado
lo perdido: fix de esquema real en `ialimp-client-health` (PR #1084), limpieza de 4 deps muertas
(PR #748), doc `GITHUB_TOKEN` de sivra (PR #765), regla de backlog de PRs del propio `SKILL.md`
(PR #1108, ampliada con la lección de "cerrado ≠ resuelto"). Ya estaba en `main` por otras sesiones
(sin re-aplicar): escalado Telegram de `pricing-agente`, recordatorio de auto-informe de
`facturas-correo`, filtro `origen='psd2'`, caso de prueba numérico de `auditoria-central`. Sin acción
de prompt en los agentes: `buscador-ia`/`pricing-agente` (27-28/07) ya resueltos en sus propias
sesiones. Limpieza del backlog de PRs: 10 cerrados (contenido verificado ya capturado/resuelto en
`main`), #1108 reabierto y actualizado. Auto-informe de esta pasada añadido como entrada pendiente
para la siguiente.
