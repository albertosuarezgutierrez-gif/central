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
- **2026-08-09 · facturas-correo (trigger diario)** · hizo: preflight canal alerta OK (200); Vía B
  sana (`dias_caido=1`, última copia 08/08 en `_buzon_pdf`; `agente_salud` actualizado), sin backlog
  en `PDF-pendiente`/`Revisar`/`Extraccion-fallida` (las 3 a 0). 0 candidatos nuevos en Gmail
  (`newer_than:2d` vacío — Booking/Stripe/Allianz/Anthropic de los últimos 7d ya estaban `Procesada`)
  y 0 subidas manuales nuevas en `_subir_aqui`/raíz 2026. Encontrado y cerrado 1 pendiente de pasadas
  anteriores: el recibo **Anthropic/Claude Max plan** (180,00€, 05/08/2026, Anthropic Ireland Ltd.)
  no estaba archivado — copiado a Drive `08-Agosto-2026` (`1IT9drkZm1g1oswhB9XAEWPAvG4hFBCPi`) y
  conciliado contra el cargo `-180,00€` del 07/08 (`destino=seguros`, exacto y sin ambigüedad).
  Roborock Amazon -247,92€ (House Sevillana) SIGUE sin aparecer en `movimientos_bancarios` —
  conciliación pendiente, a recoger en próximas pasadas. Las 3 facturas Booking de agosto
  (167,01/155,94/110,74€, ya archivadas) aún no vencen (16/08), sin cargo en banco todavía — normal.
  Papelera `_DUPLICADOS_BORRAR` con 19 avisos pendientes de borrado manual (sin cambios desde 06/08;
  no reverificada hoy). Etiqueta `Luz pendiente 2026` con 6 hilos TotalEnergies antiguos (abr–jun
  2026, contratos viejos de la SL fuera de `movimientos_bancarios`) sin tocar — llevan meses sin
  moverse, quedan para que Alberto decida si los quita a mano. dudas: —; fallos: —; PRs/commits: este
  commit (solo bitácora; el archivo+conciliación de Anthropic se hizo por Drive MCP + SQL directo,
  sin tocar código).
- **2026-08-09 · mercado-booking (pasada diaria, plan sin filtro)** · hizo: pedido el plan
  (`plan_total` 120, `pedidas` 12, `sin_medir_nunca` 12) y medidas las 12 ventanas devueltas —
  1 par de evento (22-nov Sevilla FC-Betis, aforo 4 y 5) + 8 de profundidad ronda-2 (oct/dic,
  aforo 2/4/5) + `prop_house_sevillana` aforo 12 (12-dic). **120 comps** escritos con
  `fuente='booking_mcp'`, 10/10 por ventana, 0 ventanas sin respuesta. Latido `ok:true`.
  dudas: —; fallos: —; PRs/commits: —

- **2026-08-09 · sivra_mercado_sweep (verificación del fix #1299)** · hizo: la pasada de las 03:07 UTC
  dejó por fin **`ultimo_ok_at`** — primera pasada buena desde que existe el latido, que llevaba en
  NULL desde el día 1. El fix #1299 (separar «¿se pudo mirar?» de «¿el dato distingue la fecha?»)
  funciona. dudas: el verde NO significa corpus bueno y conviene no leerlo así — el propio parte dice
  «**89% de las medianas se repiten en otra fecha**» y 84 de 120 ventanas con <3 comps. Verificado que
  la protección real sí actuó: **las 176 filas escritas salieron con `corpus_clonado = true`**, o sea
  excluidas de los buckets por mes y por fecha del motor. Es el comportamiento diseñado (`barridoFiable`
  juzga al agente, `midioTemporada` juzga al dato), no un verde de mentira. fallos: —. PRs/commits: —.

- **2026-08-08 · auditoria-diaria (pasada PROFUNDA, a petición de Alberto)** · hizo: verificación
  completa en verde (1031/1031 plataforma, 26/26 guardianes, 53/53 packages, `tsc` 0 en las **8**
  apps, build 0, lockfile en sync, `ignoreCommand` y `transpilePackages` OK en las 8, advisors sin
  ERROR, 12 heartbeats de dominio ✅, auto-merge de rutinas vivo) + **1 🔴 nuevo**: la sonda `pricing`
  de `agentes-latido` estaba en verde falso porque su huella (`market_rates prop_*`) dejó de ser
  exclusiva de la Rutina semanal al empezar a escribir ahí el barrido Serper y `mercado-booking`;
  cambiada a `pricing_decisiones.ciclo_at` por piso. dudas: —; fallos: **🔇 SIN TELEGRAM** — el
  preflight `GET /api/internal/alerta` NO llegó a dar 401 ni 200: el proxy de egress corta el CONNECT
  con **403** contra `plataforma-ten-flame.vercel.app` (curl 56). No es el token: es la política de
  red del environment, que deja mudo TODO el raíl HTTP (plan/ingest/latido/alerta) para cualquier
  sesión. Acción #1 de Alberto: abrir `*.vercel.app` en la allowlist. PRs/commits: **#1318 MERGEADO**
  (`d45d20f`), tras dos rondas de conflicto con `main` (PRs de registro de otras sesiones) resueltas
  conservando ambas entradas. Post-merge re-verificado sobre `main`: 1045/1045 · 26/26 · 53/53 ·
  `tsc` 0 en las 8 apps · build 0, y la sonda `pricing` nueva ejecutada contra la BD real da
  ✅ 130 h (umbral 192). Pendiente de mirar mañana: la pasada 03:04 del sweep, que debe dejar por fin
  `ultimo_ok_at` tras el fix #1299.
- **2026-08-08 · mercado-booking (2ª pasada MANUAL, desviación pedida por Alberto: solo rondas 2-3,
  sep→ene)** · hizo: 10 ventanas medidas y **100 comps** escritos con `fuente='booking_mcp'` —
  8-sep (2p **p50 105€** · 4p 110€ · 5p 134€ · 12p 386€), 14-nov (2p 128€ · 4p 160€ · 5p 189€ ·
  12p **486€**), 10-nov (4p 113€ · 5p 131€). El contraste finde/entre semana sale limpio: 4p pasa de
  160€ el sábado 14-nov a 113€ el martes 10-nov (−29%), que es justo lo que las rondas 2-3 vienen a
  medir. dudas: latido `sivra_mercado_booking` NO escrito — **corregido al mergear `main`**: el motivo
  que se dio (que la Rutina no se dispara) era FALSO, la Rutina corrió hoy 3 veces y dejó su `ok:true`;
  el motivo bueno es el contrario — la huella de hoy ya es de la Rutina y una pasada manual no debe
  pisarla. fallos: (1) el
  raíl HTTP está **inalcanzable desde el contenedor** — el proxy de egress da 403 al CONNECT contra
  `plataforma-ten-flame.vercel.app`, así que no hubo `/plan` ni `/ingest` ni `/latido`: el plan se
  reprodujo con los helpers puros contra datos reales de la BD y los comps se escribieron por SQL
  replicando el upsert de `/ingest`; (2) solo 10 de las 30 ventanas pedidas — 30 respuestas del
  conector no caben en el contexto de una sesión (**el tope real está en ~10-12, no en 30**); las 20
  restantes NO se midieron, que no es «no hay mercado»; (3) **era la Rutina diaria escribiendo a la vez**
  en `market_rates` (ventanas de las 13:04-13:17 UTC; identificada al mergear `main`: commits `fba3fbb`,
  `c45f564`, `f9a3fe6` — 3 disparos el mismo día) — sep y nov quedan
  ELEGIBLES para el bucket mensual en los 4 aforos, pero el mérito es compartido, no de esta pasada
  sola. dic-26 y ene-27 siguen cortos (2 y 1 fechas). PRs/commits: PR de `claude/mercado-booking-ronda-filter-ssg8cj`.
- **2026-08-08 · mercado-booking (2ª pasada MANUAL, para desbloquear el precio dinámico)** · hizo: 19
  ventanas más con el conector (190 comps, `booking_mcp`), eligiendo las fechas por el déficit REAL de
  cada bucket —el que ve el motor: fechas distintas SIN evento, contando `pricing_eventos_auto` además
  del calendario del repo—. Resultado: ago→ene con ≥3 fechas en los 4 pisos (p50 house 325/472/638/478/
  426/381€, dúplex 110/135/184/175/136/125€). dudas: 23-oct (12 pax, p50 ~830€ contra 615€ del resto de
  octubre) y 27-nov (4 pax, 247€ contra 163€ del 13-nov) parecen fechas de evento SIN catalogar; se
  escribieron igual —son mercado medido— pero convendría que el catalogador las mire, porque si lo son
  están inflando el bucket "normal" del mes; fallos: —. Latido NO escrito (pasada a mano, no es la
  Rutina). PRs/commits: este PR.
- **2026-08-08 · mercado-booking (2º disparo programado del mismo día)** · hizo: pidió el plan y
  recibió **las mismas 12 ventanas "nunca medidas"** que ya reportó como medidas el disparo de las
  12:28 UTC de hoy (mismo `checkin/checkout/aforo`, `ronda:1`, `comps:0`) — es decir, cuando este
  disparo consultó el plan, la escritura anterior NO estaba reflejada en `market_rates` pese al
  `ok:true` de aquel latido. Medidas de nuevo las 12 con Booking.com (120 comps, `fuente='booking_mcp'`,
  0 sin respuesta) y confirmado que esta vez SÍ hicieron avanzar la cola (el plan post-ingest ya
  ofrece ventanas distintas: 2 nuevas del partido Sevilla FC-Betis + 10 de ronda 2 "mes"). Latido
  `sivra_mercado_booking` reenviado con `ok:true`. **dudas: por qué el disparo de las 12:28 quedó sin
  huella en `market_rates` pese a loggear éxito — o el disparo se repitió por un fallo de scheduling
  (dos ejecuciones el mismo día) y algo entre medias limpió las filas, o aquel `ok:true` fue en falso
  (la escritura no llegó a persistir pese a que el latido la dio por buena); no se puede diferenciar
  con lo que hay aquí — pide revisar logs de Vercel de `/api/sivra/mercado/ingest` entre 12:28 y
  ahora, y confirmar si `CRON_JOBS`/el disparador de esta skill está configurado para disparar más de
  una vez al día.** fallos: —. PRs/commits: —.
- **2026-08-08 · mercado-booking (disparo programado)** · hizo: pidió el plan
  (`/api/sivra/mercado/plan?max=12`, 120 ventanas totales, 12 nunca medidas) y midió las 12 con el
  conector Booking.com — 120 comps escritos con `fuente='booking_mcp'`, 0 sin respuesta, 0 sin precio,
  0 fallos. p50 €/noche: house_sevillana 12p 4-sep n/d·16-oct **856€**·6-nov **604€**·11-dic **424€**·
  8-ene **368€** (temporada Feria→invierno clara); luxury_busto 5p 4-sep **196€**·16-oct **282€**·
  6-nov **206€**·11-dic **174€**; busto_reform 2p 16-oct **174€**·11-dic **106€**·8-ene **104€**;
  duplex_center 4p 11-dic **139€**. Latido `sivra_mercado_booking` escrito con `ok:true`. dudas: —;
  fallos: —. PRs/commits: —.

- **2026-08-08 · mercado-booking (primera pasada de la Rutina)** · hizo: pidió el plan
  (`/api/sivra/mercado/plan?max=12`, 120 ventanas totales, las 12 sin medir nunca), midió las 12 con
  el conector de Booking.com (aforos 2/4/5/12) y escribió 120 comps (`fuente='booking_mcp'`), 0
  ventanas sin respuesta, 0 sin precio utilizable. Cubrió: dúplex+luxury Feria abr-2027, las 4
  ventanas del evento Sevilla FC-Rayo (15-17 ago) y Athletic-Sevilla (22-24 ago), house_sevillana+
  busto_reform de la Bienal Flamenco (29 sep-1 oct). Latido `sivra_mercado_booking` escrito con
  `ok:true` (primera huella real de la Rutina — hasta ayer solo había una pasada manual). dudas: —;
  fallos: —; PRs/commits: esta rama.

- **2026-08-08 · mercado-booking (primera pasada de la Rutina programada)** · hizo: pidió el plan
  (`/api/sivra/mercado/plan?max=12`, 120 ventanas totales, las 12 devueltas eran las 12 nunca medidas)
  y midió las 12 con Booking respetando el aforo real (2/4/5/12 pax) en 4 fechas (8-ene, 5-feb, 5-mar,
  2-abr 2027); 120 comps escritos con `fuente='booking_mcp'`, 0 ventanas sin respuesta. Medianas
  destacadas: 5-feb 12p (house) **395€** vs 5-feb 2p (busto) **111€**; 2-abr 12p **659€** vs 2-abr 2p
  **186€** — confirma que sin aforo real el motor mezclaría precios de tamaños muy distintos. Latido
  `sivra_mercado_booking` = ok:true. dudas: —; fallos: —. PRs/commits: —.

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
