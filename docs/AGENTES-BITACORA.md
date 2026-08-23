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
- **2026-08-23 · mercado-booking** · hizo: pasada diaria, plan `?max=24` (512 ventanas candidatas,
  488 recortadas por el tope — todas las 24 pedidas eran de ronda 1/evento, `sin_medir_nunca:24`).
  238 comps reales escritos en `market_rates` (9-10 por ventana; medianas ~90-160€/noche en fechas
  normales, hasta ~1.300-3.500€/noche en Semana Santa 25-27/03 y Feria por el factor de evento).
  📐 4/4 ventanas de escaparate propio medidas (paso 2-bis) → `pricing_escaparate` para que el cron
  de canal recalibre `channel_markup`/`cuota_fija`. 🪞 2 anuncios propios descartados del corpus de
  comparables (HOUSE SEVILLANA en 2026-10-25 aforo12 y 2027-03-25 aforo12, este último con la
  ventana de Semana Santa a 3.957€/2 noches). ⚠️ 0 ventanas sin respuesta del conector. dudas: —;
  fallos: —; PRs/commits: — (solo escritura vía `/api/sivra/mercado/ingest`, sin cambios de código).
- **2026-08-22 · buscador-ia** · hizo: disparado por hallazgo del health-check diario (no pasada
  semanal): `z-ai/glm-5.2` (default NIM desde 17/08) murió por 410 Gone el 21/08, 3 días antes de
  su propia fecha de EOL anunciada. Confirmado contra `/v1/models` real vía harness temporal en
  edge function + `pg_net` (WebFetch a NVIDIA/Supabase bloqueado por el proxy de esta sesión).
  Mini-eval en vivo de 4 candidatos → swap a `meta/llama-3.1-70b-instruct` en TODO el radio
  (core-ai, plataforma, rrhh, ia-rest) + 4 edge functions redesplegadas y verificadas (200 OK).
  dudas: —; fallos: mistral-large-2-instruct listaba en el catálogo pero dio 404 para la cuenta
  (no toda entrada de `/v1/models` implica acceso real); PRs/commits: **PR #1583, mergeado (commit
  5e6bbed), re-verificado en vivo tras el merge (200 OK, sin 410)**.
- **2026-08-21 · psd2-health-check** · hizo: feed PSD2 **verde** (Kutxabank ****0855 último mov. 20/08,
  34 mov/30d vs 41 previos; BBVA ****1175 17/08, 23 vs 35 — dentro de sus huecos históricos, máx. 10d);
  investigada la contradicción Telegram↔panel que reportó Alberto y arreglada en PR #1575 (draft):
  el cron no aplicaba el corte ℹ️ del semáforo y `/banca` escondía las notas bajo el 🟢.
  dudas: —; fallos: —; PRs/commits: PR #1575, commit cdc48bb.
- **2026-08-21 · facturas-correo** · hizo: Vía B sana (1 día, última copia `_buzon_pdf` 20/08,
  actualizado `agente_salud`); backlog `PDF-pendiente`/`Revisar`/`Extraccion-fallida` vacío;
  barrido Paso 4.0 (`v_facturas_sin_cargo`) sin filas `sin_revisar` (las 8 ya `revisada_sin_cargo`,
  nada que reabrir); candidatos Gmail `newer_than:2d` → ninguna factura nueva (mensajes de
  huéspedes Booking, aviso de login, pedido personal Amazon sin adjunto, correspondencia del
  seguro de fallecimiento — todo descartado); `_subir_aqui` vacío; los PDF sueltos en la raíz de
  `FACTURAS Apartamentos/2026` (Castuera, 2× Endesa Bustos, 2× FACTURA JULIO SOCORRO) ya tenían
  aviso en `_DUPLICADOS_BORRAR` de pasadas previas, nada nuevo. dudas: hilo `Luz pendiente 2026`
  de TotalEnergies (abril-2026) sigue sin `Facturas/Procesada` — es del contrato viejo de la SL,
  fuera de alcance según la skill, no tocado; fallos: —; PRs/commits: — (solo bitácora + BD).
- **2026-08-21 · mercado-booking** · hizo: pasada de 24 ventanas de mercado (plan `?max=24`,
  488 candidatas, 464 recortadas por el tope — mismo aviso arrastrado que ayer) — 237 comps reales
  escritos vía Booking.com MCP, las 24 ventanas con respuesta (0 `sinRespuesta`). Paso 2-bis
  (escaparate propio) completo: 4/4 ventanas medidas (Luxury Busto 128,78€/n, House Sevillana
  464,80€/n, Busto Reform 94,65€/n, Dúplex center 112,54€/n), ingest reconoce cada una como propia
  (`propios[]` → `pricing_escaparate`), ninguna contaminó `market_rates`. 3 anuncios propios
  descartados al aparecer sueltos en ventanas de mercado (HOUSE SEVILLANA 6 habitaciones en las
  3 ventanas aforo 12 de eventos de diciembre: 04-06, 06-08 y 07-09) — no se escribieron como comps.
  Latido `ok:true`. dudas: —; fallos: —; PRs/commits: — (solo bitácora + BD).
- **2026-08-20 · facturas-correo** · hizo: preflight canal alerta OK (200); Vía B sana (1 día,
  última copia `_buzon_pdf` 19/08); backlog `PDF-pendiente`/`Revisar` vacío; barrido Paso 4.0
  (`v_facturas_sin_cargo`) sin filas `sin_revisar` (las 8 pendientes ya estaban `revisada_sin_cargo`,
  nada que reabrir); candidatos Gmail `newer_than:2d` → solo 2 avisos Endesa sin PDF/importe
  (Dúplex ref P26CON034750472, Socorro ref P26CON034910794 — el portal no adjunta PDF, se cuadran
  por banco cuando entre el cargo, aún sin postear) + 1 invitación de calendario de Pilar (descartada).
  Etiquetados `Facturas/Procesada`. Sin candidatos nuevos que archivar/conciliar. ⚠️ Hallazgo:
  la factura Giraldillo AFV-11808 (72,60€, ya bien archivada en `07-Julio-2026` y conciliada) se
  sigue duplicando cada pocos días en `ALBERTO 2026 PERSONAL (SEGUROS)/JULIO` junto con más basura
  no relacionada (PNGs, PDFs de otras empresas) — bug de cron ya avisado el 01/08 en la papelera
  `_DUPLICADOS_BORRAR`, sigue activo 20 días después y empeorando (3+ copias); no es corregible desde
  esta skill (código de `apps/plataforma`, agente `facturas-scan`). dudas: —; fallos: cron
  `facturas-scan` sigue mal-ubicando adjuntos en el árbol PERSONAL (ver arriba); PRs/commits: —
  (solo bitácora).
- **2026-08-20 · mercado-booking** · hizo: pasada de 24 ventanas de mercado (plan `?max=24`,
  488 candidatas totales, 464 recortadas por el tope — aviso arrastrado) — 237 comps reales
  escritos vía Booking.com MCP, todas con respuesta (0 `sinRespuesta`). Paso 2-bis (escaparate
  propio) completo: 4/4 ventanas medidas (Busto Reform 3021,05€/4n, Luxury Busto 3379,12€/4n,
  House Sevillana 10969,52€/4n, Dúplex center 2109,25€/3n), todas reconocidas como propias por
  el endpoint (`propios[]`) y desviadas a `pricing_escaparate`, ninguna contaminó `market_rates`.
  3 anuncios propios adicionales descartados al aparecer sueltos en ventanas de mercado (House
  Sevillana en 19-21 nov aforo 12 y en 26-28 mar Feria aforo 12) — no se escribieron como comps.
  Latido `ok:true`. dudas: —; fallos: —; PRs/commits: — (solo bitácora + BD).
- **2026-08-19 · psd2-health-check** · hizo: preflight canal alerta OK (200); consulta frescura
  `movimientos_bancarios WHERE origen='psd2'` → último movimiento 17/08/2026 (2 días, dentro de
  umbral 48h), mov_30d=63 vs mov_30d_prev=71 (caída ~11%, muy por debajo del umbral 50%). Estado
  ✅ OK, sin anomalía, sin aviso Telegram, sin entrada en CONTEXTO-SESIONES.md. dudas: —; fallos: —;
  PRs/commits: — (solo esta bitácora).
- **2026-08-19 · facturas-correo** · hizo: pasada completa (Paso 0→5). Vía B sana (dias_caido=1,
  última copia `_buzon_pdf` 18/08); sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`
  (verificado por `search_threads`). Paso 4.0 (`v_facturas_sin_cargo`): 8 filas, todas
  `revisada_sin_cargo`, sin novedades. Candidatos Gmail (`newer_than:2d`): 2 hilos, ninguno factura
  (hoja de medicación REMPe y pedido Amazon personal) → etiquetados Procesada. Paso 1-bis (`_subir_aqui`,
  raíz 2026): sin subidas manuales nuevas (lo más reciente en raíz es del 05/08, ya cubierto por avisos
  de papelera existentes). Auto-verificación papelera `_DUPLICADOS_BORRAR`: comprobados 20 de los ~38
  ficheros enlazados en los 20 avisos pendientes — los 20 siguen existiendo (0 zombis); quedan ~18 sin
  comprobar hoy por volumen, ningún aviso resuelto. **Seguimiento del hallazgo del 18/08** (cargos Vercel/
  Anthropic abr-jun sin fila en `facturas_drive`): localicé por Gmail (búsqueda histórica, no restringida
  a `_buzon_pdf`) los correos-recibo de 8 de los 11 cargos pendientes y los concilié por conciliación
  inversa — el cuerpo del correo (Stripe/Vercel siempre incluye el desglose en texto plano) dio el
  importe aunque no se pudo bajar el PDF adjunto (Vía A `gmail-adjuntos` sigue sin provisionar); archivé
  el texto del recibo como Google Doc en la carpeta del mes y actualicé `movimientos_bancarios`
  (`conciliado=true`, `factura_ref`) + inserté las filas en `facturas_drive` (proveedores `anthropic`,
  `anthropic-credit`, `vercel`, `vercel-reembolso` — la unique key `(proveedor,anio,mes)` obligó a
  diferenciar el proveedor cuando había 2 cargos del mismo emisor en el mismo mes). **Quedan 4 cargos sin
  resolver** (04-14 −163,21€, 04-27 −94,39€, 05-15 −180,00€, 06-14 −180,00€ · total 617,60€, todos
  `CLAUDE.AI SUBSCRIPTION`/`ANTHROPIC* CLAUDE SUB`): no aparece correo-recibo ni en bandeja ni en papelera/
  spam para esas fechas — no descarto que sean de otra cuenta/email o cargados sin notificación. dudas:
  si Alberto reconoce esos 4 cargos y de dónde vienen (¿otra suscripción, otro email, cargo duplicado de
  prueba?) — no los he tocado; fallos: —; PRs/commits: — (solo Gmail/Drive/Supabase + esta bitácora).
- **2026-08-19 · mercado-booking** · hizo: pasada de 24 ventanas (tope duro del endpoint;
  `plan_total`=468, `candidatas`=468, `recortadas`=444 — el aviso del plan dice que el tope dejó
  fuera ventanas que casaban). Rondas 0-1 (línea de temporada + eventos confirmados sep-nov),
  4 pisos (`prop_luxury_busto`, `prop_house_sevillana`, `prop_busto_reform`, `prop_duplex_center`).
  239 comparables reales escritos (`fuente:booking_mcp`), 0 ventanas sin respuesta del conector.
  Descartado 1 anuncio propio («HOUSE SEVILLANA 6 habitaciones») en la ventana 2026-11-01/11-03
  aforo 12 — no escrito en `market_rates`. dudas: —; fallos: —; PRs/commits: — (solo escritura BD +
  esta bitácora).
- **2026-08-18 · facturas-correo** · hizo: pasada completa (Paso 0→5). Vía B sana (dias_caido=1,
  última copia `_buzon_pdf` 17/08); sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`
  (verificado por `search_threads`, no por `list_labels`). Candidato Gmail (`newer_than:2d`): 1 hilo
  (tríptico comercial de Alquiber reenviado por Pilar, no es factura → etiquetado Procesada). Paso 4.0
  (`v_facturas_sin_cargo`): 8 filas, todas `revisada_sin_cargo`, sin novedades. **Hallazgo nuevo (fuera
  del radar de `facturas_drive`):** Vercel + Anthropic/Claude llevan desde **abril** con cargos en banco
  auto-clasificados `seguros` pero **sin fila en `facturas_drive`** (invisibles para el Paso 4.0, que solo
  mira facturas archivadas sin cargo — este es el caso inverso: cargos sin factura archivada). De los 13
  cargos ene-ago, julio SÍ estaba conciliado por otro mecanismo (probable cron `expenses/agent/scan`, con
  `factura_ref` propio). Archivé y concilié los 2 de agosto (Vercel 14/08 141,82US$↔cargo 17/08 126,77€
  cambio de divisa; Anthropic 05/08 180€↔cargo 07/08 180€ exacto) e inserté sus filas en `facturas_drive`.
  **Quedan 11 cargos abr-jun (~1.013€) sin factura archivada** — no tengo el PDF a mano (rotado de
  `_buzon_pdf`), haría falta una pasada dedicada buscando cada email por mes. dudas: si Alberto quiere ese
  backfill o lo deja así (SaaS recurrente, importe estable, bajo riesgo fiscal); fallos: **propio** — al
  conciliar el cargo Anthropic 07/08 (ya estaba `conciliado=true` de antes) sobreescribí su `factura_ref`
  sin leer el valor previo primero — no sé qué había ahí, aunque el nuevo enlace es un justificante válido.
  PRs/commits: commit directo a `docs/` + UPDATE/INSERT en Supabase (sin cambios de código).
- **2026-08-18 · mercado-booking** · hizo: pasada de 24 ventanas (plan `?max=24`, las 24 vírgenes —
  todas ronda 1/evento, sep-2026: Bienal/Feria dates 21-28 sep) × Booking.com, 238 comps reales
  escritos (`fuente:booking_mcp`). 6 anuncios propios descartados (HOUSE SEVILLANA 6 habitaciones
  colándose en las 6 ventanas de aforo 12, filtrado manual por nombre). 0 ventanas sin respuesta,
  0 fallos de escritura. dudas: —; fallos: —; PRs/commits: — (solo BD vía ingest, sin cambios de código).
- **2026-08-17 · pricing-agente (revisión post-ciclo)** · hizo: verificados los 2 accionables del
  ciclo 17/08 — las 3 fechas `no_disponible` de House tienen reserva real con income (el ciclo las
  reportó «sin income» en falso); el ruido de comps <12€/plaza en House es 100% `fuente='serper'`
  (364 filas/36 fechas desde 04/08); con OK de Alberto se aplicó el filtro €/plaza
  (`pricing-comps-plausibles.ts`) en apply+guard+recommend+pilot-track+settings, y la lección del
  cruce de incomes quedó en `references/ciclo.md`. Reservas Dúplex 16/08 verificadas OK en precio.
  2ª tanda: `mercado-booking` a 24 ventanas/pasada; suelo estacional House verificado contra serie
  2024+ (no está plano — pendiente del 01/08 cerrado, aprendizaje id 74); gastos_fijos House a 0
  (necesita datos de Alberto). 3ª tanda: FLOOR_SEASONAL nov ×1,10. dudas: —; fallos: —
- **2026-08-17 · buscador-ia** · hizo: hallazgo crítico (NIM retira el 3.3-70b el 25/08) → swap a
  Maverick (PR #1454, mergeado por Alberto) → al verificar en vivo con la key real (harness en edge
  function + pg_net), Maverick daba **410 Gone** (EOL 27/07, ficha web aún viva) → corrección final
  probada con llamadas reales: NIM default `z-ai/glm-5.2` (mini-eval A/B 2/2) y `CONTABLE_MODEL`
  `deepseek-ai/deepseek-v4-flash-0731` (el v3 ya no está en `/v1/models`); 4 edge functions
  redesplegadas + prueba end-to-end de `nim-sentiment`; 2 Telegram enviados. dudas: —. fallos: **elegí
  el 1er reemplazo por ficha web sin poder probarlo (sin key en sesión) y estaba muerto en el API** —
  regla nueva anotada en la skill: id vivo = está en `/v1/models` o responde a una llamada;
  PRs/commits: PR #1454 + PR de corrección (misma rama).

- **2026-08-17 · facturas-correo** · hizo: pasada completa (Paso 0→5). Vía B: dias_caido=3 (última
  copia 14/08), sin backlog en PDF-pendiente/Revisar; 1 hilo en Extraccion-fallida era falso positivo
  (mensaje de huésped Booking, etiqueta retirada). Paso 4.0: `v_facturas_sin_cargo` sin `sin_revisar`,
  pero investigando los ~30 PDFs sueltos en la raíz de Drive (ninguno backlog nuevo, casi todos ya en
  `_DUPLICADOS_BORRAR`) apareció un hueco real que esa vista no puede ver: SiQueBrilla julio (780,10€)
  archivada+conciliada desde el 03/08 pero SIN fila en `facturas_drive` (invisible para la vista al no
  existir la fila). Insertada. `agente_salud` actualizado. dudas: —; fallos: **propios** — copié 2
  duplicados nuevos (SiQueBrilla, Leroy) antes de comprobar que ya estaban archivados; avisos de
  borrado ya puestos en la papelera para ambos. Candidatos Gmail nuevos: 0. Papelera `_DUPLICADOS_BORRAR`
  con ~22 avisos acumulados sin vaciar (mencionado, no bloqueante). PRs/commits: commit directo a
  `docs/` (memoria + esta entrada), sin cambios de código.

- **2026-08-17 · pricing-agente** · hizo: ciclo semanal COMPLETO, los 4 pisos (no solo los en vivo).
  Paso 1: cruzó pricing_decisiones del 10/08 con rate_snapshots+incomes — ventas reales confirmadas
  (busto SS/Feria a precio decidido, luxury/duplex 4 ventas nuevas en oct). Paso 2: 12 ventanas
  (10 meses+SS+Feria) × 4 pisos vía Booking+Trivago+Tripadvisor MCP, 0 fechas a cero. Comps hoy:
  busto=406 duplex=263 luxury=322 house=186. Paso 4: 48 propuestas dry-run (ALERTA_TOKEN), circuit-breaker
  sano en los 4 (avg_abs_pct 0,18-0,46). Aprendizaje escrito (`ciclo_17_08_2026`). Telegram enviado.
  dudas: 3 fechas de House no_disponible sin income que lo confirme (posible reserva no sincronizada o
  bloqueo manual, igual que el caso ya documentado de busto Feria); fallos: Trivago caído en las 8 fechas
  lejanas de House (Booking solo cubrió igualmente, sin efecto en el resultado) — comps ruidosos en House
  29-ago (n=16, rango 44-388€, probable alojamiento no comparable colándose pese al filtro APARTMENT/
  HOLIDAY_HOME/VILLA, sin efecto porque cayó al suelo). PRs/commits: — (solo memoria/BD)
- **2026-08-17 · mercado-booking** · hizo: pasada de 12 ventanas (plan `?max=12`, las 12 vírgenes de
  ronda 1 — evento Feria confirmado, 17-23/09/2026 — `prop_luxury_busto`, `prop_house_sevillana`,
  `prop_busto_reform`, `prop_duplex_center`). 120 comps reales escritos (`fuente:"booking_mcp"`),
  0 ventanas sin respuesta, 0 sin precio utilizable, 0 anuncios propios descartados (revisado a
  propósito en la ventana de aforo 12, donde suele colarse el nuestro — esta vez limpio). Quedan
  452 ventanas candidatas sin medir del plan de 464 (aviso del propio endpoint). dudas: —; fallos: —
  (1 SSL transitorio en un POST, resuelto con retry inmediato); PRs/commits: — (solo memoria/BD)
- **2026-08-16 · facturas-correo** · hizo: pasada completa (Paso 0→5). Vía B sana (última copia
  _buzon_pdf 14/08, dias_caido=2, `agente_salud` actualizado). Sin backlog en `PDF-pendiente`/
  `Revisar`/`Extraccion-fallida`. Paso 4.0 (`v_facturas_sin_cargo`): 8 filas, TODAS ya
  `revisada_sin_cargo` (ninguna `sin_revisar`) — nada que trabajar. Candidatos Gmail (`newer_than:2d`):
  1 hilo (mensaje de huésped de Booking, no factura). Sin subidas manuales nuevas en `_subir_aqui` ni
  en la raíz de `2026`. Sin novedades reales que archivar/conciliar hoy. dudas: —; fallos: —;
  PRs/commits: — (solo memoria + `agente_salud`)
- **2026-08-16 · psd2-health-check** · hizo: pasada profunda tras escalado de la auditoría — 🚨 crítica
  confirmada (último mov 10/08, 6 días; 30d 61 vs 72). Hallazgo: sesión EB VIVA (saldo BBVA al 15/08) pero
  `/transactions` seco desde 08-10/08, tragado por `catch(()=>[])`; BBVA …2620 muerta desde 27/06. Fix de
  observabilidad en `lib/psd2.ts` + Telegram del cron (rama `claude/psd2-sync-no-movements-yw0gig`, PR draft).
  Telegram enviado; anotado en CONTEXTO-SESIONES. dudas: causa exacta la dirá la pasada de las 06:00; fallos: —
- **2026-08-16 · agentes-entrenador** · hizo: pasada semanal (rango 09/08→16/08, 27 entradas
  procesadas y podadas). Sin pendientes en `FEEDBACK-AGENTES.md`. Backlog de PRs abiertos: **3**
  (#1436/#1437/#1440, todos de hoy — sano, sigue bajando desde el pico de 73 del 29/07, sin
  crecimiento que escalar). Diagnóstico por agente: **facturas-correo** — el "fallo" repetido 5
  pasadas seguidas (12→16/08, `search_threads label:Facturas/Extraccion-fallida` vacío pese a
  `list_labels` marcando `messagesTotal:1` en Label_16) NO era un bug de la skill: verificado en
  vivo (Gmail MCP) que `search_threads` con el ID, con el nombre con y sin comillas, y con
  `in:anywhere`/`includeTrash` da 0 hilos de forma consistente y reproducible — el contador de
  `list_labels` está desincronizado (quirk conocido de Gmail en etiquetas de uso raro), la búsqueda
  real siempre tuvo razón. Añadida caveat en `SKILL.md` (aditivo, 2 frases) para que la próxima
  pasada no vuelva a anotarlo como fallo. **mercado-booking** y **pricing-agente** — las dos únicas
  dudas/fallos del rango (exclusión del anuncio propio circular; congelación de #1416 con valores
  contaminados) ya estaban resueltas en código/skill antes de esta pasada (`lib/sivra/mercado-propios.ts`,
  `pricing-suelo-pl.ts` + `estado-y-protocolo.md`) — sin acción. Resto de agentes con evidencia en
  rango (ialimp-client-health, psd2-health-check, facturas-correo el resto de pasadas) sin patrones
  repetidos (2+) que justifiquen tocar prompt. Revisión transversal: sin contradicciones ni
  redundancias nuevas entre skills detectadas. dudas: —; fallos: —; PRs/commits: rama
  `claude/upbeat-shannon-hmrhil` (`SKILL.md` de `facturas-correo` + mantenimiento de esta bitácora/
  memoria).

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-08-16 · pasada semanal (rango 09/08→16/08) · 27 entradas procesadas y podadas (mercado-booking
×9, facturas-correo ×8, pricing-agente ×4, ialimp-client-health, psd2-health-check, buscador-ia, y el
auto-informe del entrenador del 09/08). Backlog de PRs abiertos: **3** (#1436/#1437/#1440, todos del
16/08 — sano, sin crecimiento). Único fix aplicado: caveat en `facturas-correo/SKILL.md` sobre el
contador stale de `list_labels` en `Facturas/Extraccion-fallida` (falsa alarma repetida 5 días, ya
diagnosticada — ver entrada de esta pasada arriba).
