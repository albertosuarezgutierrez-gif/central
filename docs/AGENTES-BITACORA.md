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
- **2026-08-15 · pricing-agente (reparación a demanda de Alberto)** · hizo: destapó que la curva
  «PL» congelada por #1416 era el propio motor (la migración re-etiquetó `captured_at` sin restaurar
  precios) → reconstruyó `pricing_pl_referencia` (Busto/Luxury fuera, Dúplex/House con el snapshot
  limpio del 08/08), cota de cordura del suelo vs ancla de fecha (`pricing-suelo-pl.ts`), y descartó
  el Sevilla-Rayo fantasma del 16/08; dudas: —; fallos: el propio #1416 (congeló valores contaminados
  — al congelar una referencia, verificar VALORES contra la fuente real, no solo la fecha); PR: draft de esta rama.
- **2026-08-15 · mercado-booking** · hizo: pasada de 12 ventanas (plan `?max=12`, sin filtro —
  las 12 candidatas eran `sin_medir_nunca`, todas ronda 1/evento: Bienal de Flamenco 11/12/14-sep,
  las 4 propiedades por aforo 12/5/4/2). 110 comparables reales escritos en `market_rates`
  (`fuente:booking_mcp`); 0 anuncios propios detectados entre los resultados. Medianas €/noche
  por fecha×aforo (12/5/4/2): 11-sep 593/184/147/132 · 12-sep 461/182/143/— · 14-sep 279/114/106/104.
  dudas: —; fallos: 1 ventana sin respuesta del conector (12-sep→14-sep, aforo 2,
  `prop_busto_reform`: Booking devolvió `not_found` — no se inventó comp, se cuenta como
  "no se ha podido mirar" y no como "no hay mercado", queda pendiente de reintento). Latido
  `ok:true`. Aviso del plan: tope `max=12` dejó fuera 460 de las 472 ventanas candidatas —
  cobertura normal, se acumula en próximas pasadas; PRs/commits: — (solo Booking MCP + HTTP a
  plataforma + esta entrada).
- **2026-08-14 · ialimp-client-health (pasada semanal)** · hizo: preflight `/api/internal/alerta`
  200 OK; empresa Sique Brilla SL (`05edacff-…`) — PMS sync Smoobu activo, `sync_error` null,
  `last_sync_at` hoy 15:10, 23 `cleaning_sessions` actualizadas en 7 días; 0 programaciones activas
  sin limpiadora; 0 impagos en `facturas_clientes`. Todo verde, no se envió aviso Telegram (protocolo
  solo alerta si hay ⚠️); dudas: —; fallos: —; PRs/commits: — (solo lectura, esta entrada).

- **2026-08-14 · mercado-booking (a petición de Alberto, fuera del disparo diario)** · hizo: pasada
  acotada `?max=12&rondas=1&desde=2026-08-15&hasta=2026-10-31` (rondas de EVENTO, que son las que
  congelan precio) → **119 comps reales en 12/12 ventanas**, 0 sin respuesta del conector; 3 fechas
  × 4 aforos. Medianas por noche (aforo 12 / 5 / 4 / 2): 16-ago 265 / 104 / 103 / 72 · 9-sep
  346 / 135 / 109 / 89 · 10-sep **506** / 159 / 128 / 99. El salto 9→10 sep (+46% en aforo 12)
  confirma que el evento del 10 es real y que la línea de temporada de Serper no lo veía.
  dudas: **excluí a propósito el propio anuncio «HOUSE SEVILLANA 6 habitaciones»** de los comps del
  16-ago aforo 12 — Booking lo devuelve como resultado y meterlo anclaría el mercado a nuestro
  propio precio (circular). La skill no dice nada al respecto y `ingest` no filtra: si se confirma
  el criterio, debería ir escrito en la skill o en el endpoint **[RESUELTO el mismo día: va en las dos
  — regla en «No romper» de la skill + raíl `lib/sivra/mercado-propios.ts` en `/mercado/ingest`]**;
  fallos: el tope `max=12` dejó
  **120 de 132** ventanas candidatas del filtro sin medir (el aviso del plan lo declara) — las
  congeladas de sep-oct siguen en cola; PRs/commits: — (solo `market_rates` vía MCP + esta entrada).

- **2026-08-14 · facturas-correo (trigger diario)** · hizo: preflight `/api/internal/alerta` 200
  OK; Paso 0 salud: Vía B con `dias_caido=3` (última copia `_buzon_pdf` 11/08 IONOS, `newer_than:2d`
  vacío) — cruza el umbral `>2` de "corte activo" pero no el `>3` de escalado Telegram, así que
  actualicé `agente_salud` a `ok=false` sin avisar por Telegram; backlog `PDF-pendiente`/`Revisar`
  a 0. 0 candidatos nuevos en Gmail (`newer_than:2d` vacío), 0 subidas manuales nuevas
  (`_subir_aqui` vacío). Barrido raíz `FACTURAS Apartamentos/2026` (mismos 20 ficheros sueltos que
  el 13/08): todos ya cubiertos por avisos existentes en `_DUPLICADOS_BORRAR`, nada nuevo. Paso 4.0
  (`v_facturas_sin_cargo`): 0 filas `sin_revisar`, las 8 `revisada_sin_cargo` (Pepephone ene-jun,
  Giraldillo mayo, CREATE junio duplicada) sin cambios, siguen esperando a Alberto. dudas: —;
  fallos: `search_threads label:Facturas/Extraccion-fallida` (Label_16, 1 mensaje según
  `list_labels`) sigue vacío por **3er día consecutivo** (12/08, 13/08, 14/08) — ya no parece lag
  puntual, convendría que `agentes-entrenador` lo mire esta semana; PRs/commits: — (solo
  Gmail/Drive/Supabase vía MCP + esta entrada).
- **2026-08-14 · mercado-booking** · hizo: pasada de 12 ventanas (plan `?max=12`, sin filtro
  de rondas — las 12 candidatas eran `sin_medir_nunca`, ronda 1/evento y ronda 3): Sevilla FC-
  Barcelona (20-sep) y Levante-Sevilla (11-oct) en las 4 propiedades (aforos 12/5/4/2), más
  profundidad de bucket ronda 3 en feb/mar-2027 (luxury_busto, house_sevillana, busto_reform,
  duplex_center). 119 comparables reales escritos en `market_rates` (`fuente:booking_mcp`),
  0 ventanas sin respuesta, 0 sin precio utilizable; excluido 1 listado (HOUSE SEVILLANA propio
  en la ventana de house_sevillana 11-oct — no es comparable de mercado). `price_night` =
  `price.book/2` (todas 2 noches). Latido `ok:true`. Aviso del plan: tope `max=12` dejó fuera
  108 de las 120 ventanas candidatas — cobertura normal, se acumula en próximas pasadas.
  dudas: —; fallos: —; PRs/commits: — (solo Booking MCP + HTTP a plataforma + esta entrada).
- **2026-08-13 · facturas-correo (trigger diario)** · hizo: Paso 0 salud OK (Vía B sana,
  `dias_caido=2` — última copia `_buzon_pdf` 11/08 IONOS, dentro del umbral ≤2; `agente_salud`
  ya en verde, sin tocar); labels `PDF-pendiente`/`Revisar` a 0. 0 candidatos nuevos en Gmail
  (`newer_than:2d` vacío) y 0 subidas manuales nuevas (`_subir_aqui` vacío). Barrido raíz
  `FACTURAS Apartamentos/2026` (20 ficheros sueltos): todos ya cubiertos por avisos existentes
  en `_DUPLICADOS_BORRAR` de pasadas previas, nada nuevo que archivar. Paso 4.0
  (`v_facturas_sin_cargo`): 0 filas `sin_revisar`, las 8 `revisada_sin_cargo` (Pepephone
  ene-jun, Giraldillo mayo, CREATE junio duplicada) sin cambios, siguen esperando a Alberto.
  dudas: —; fallos: `search_threads label:Facturas/Extraccion-fallida` (Label_16, 1 mensaje
  según `list_labels`) sigue devolviendo vacío por 2º día consecutivo (visto ya el 12/08) —
  posible lag/bug del índice del conector Gmail, no bloquea nada pero convendría mirarlo a
  mano si persiste; PRs/commits: — (solo Gmail/Drive/Supabase vía MCP + esta entrada).
- **2026-08-13 · mercado-booking** · hizo: pasada de 12 ventanas (plan `?max=12`, sin filtro
  de rondas — las 12 candidatas eran ronda 1/evento, `sin_medir_nunca`): Sevilla FC-Atlético
  (29-ago), Espanyol-Sevilla (6-sep) y Pan de oro Pedro el Granaíno (13-sep), las 4 propiedades
  de SIVRA (aforos 12/5/4/2) en cada fecha. 120 comparables reales escritos en `market_rates`
  (`fuente:booking_mcp`), 0 ventanas sin respuesta, 0 sin precio utilizable. `price_night` =
  `price.book/2` (todas 2 noches). Latido `ok:true`. dudas: —; fallos: —; PRs/commits: — (solo
  Booking MCP + Supabase vía HTTP + esta entrada de bitácora).
- **2026-08-12 · psd2-health-check** · hizo: preflight `/api/internal/alerta` 200 OK (canal
  vivo); consulta de frescura `movimientos_bancarios WHERE origen='psd2'` → último movimiento
  2026-08-10 (hace 2 días, dentro del umbral de 48h), mov_30d=75 vs mov_30d_prev=72 (sin caída).
  Estado ✅ OK, sin anomalía, sin alerta Telegram. dudas: —; fallos: —; PRs/commits: — (solo
  esta entrada de bitácora, commit directo a main).
- **2026-08-12 · facturas-correo (trigger diario)** · hizo: Paso 0 salud OK (Vía B sana,
  `dias_caido=0`, última copia 11/08 IONOS; `agente_salud` ya en verde, sin tocar); backlog
  `PDF-pendiente`/`Revisar` a 0. 0 candidatos nuevos en Gmail (`newer_than:2d` vacío) y 0
  subidas manuales nuevas en `_subir_aqui`/raíz 2026. Paso 4.0 (`v_facturas_sin_cargo`):
  solo 1 fila `sin_revisar` (Endesa-Dúplex marzo, 69,21€) — resultó ya conciliada de una
  pasada anterior (cargo −78,91€ 23/03, `factura_ref` apuntaba al mismo PDF), solo faltaba
  el FK; backfilleado `movimiento_id`. El resto de la cola sigue en `revisada_sin_cargo`
  (Pepephone ene-jun, Giraldillo mayo, CREATE junio duplicada) sin cambios, esperando a
  Alberto. dudas: —; fallos: `search_threads label:Facturas/Extraccion-fallida` (Label_16,
  1 mensaje según `list_labels`) devuelve vacío pese a probar con/sin `includeTrash` — posible
  lag de índice del conector Gmail, revisar a mano si persiste; PRs/commits: — (solo
  Gmail/Drive/Supabase vía MCP + esta entrada de bitácora).
- **2026-08-12 · mercado-booking** · hizo: pasada de 12 ventanas (plan `?max=12`, ronda 3 —
  profundidad de bucket, nunca medidas antes) entre nov-2026 y feb-2027, las 4 propiedades de
  SIVRA. 120 comparables reales escritos en `market_rates` (`fuente:booking_mcp`), 0 ventanas sin
  respuesta, 0 sin precio utilizable. `price_night` = `price.book/noches` (2 noches en las 12
  ventanas) para no repetir el bug de unidad del 06/08. Latido `ok:true`. dudas: el plan trae
  120 ventanas candidatas y el tope de 12/pasada solo cubre ~10%/día — a este ritmo el plan
  completo tarda ~10 pasadas, no las 3-4 días que asume la skill; fallos: —; PRs/commits: —
  (solo escritura HTTP a `market_rates`, sin cambios de código).
- **2026-08-11 · facturas-correo (FK real, orden de Alberto)** · hizo: aplicada la migración
  `2026-08-11_facturas_drive_movimiento_fk.sql` — `facturas_drive.movimiento_id` (FK a
  `movimientos_bancarios`) + `sin_cargo_motivo` + vista `v_facturas_sin_cargo`, con TRES estados para
  que un NULL no pueda leerse como «no hay cargo». Backfill 2026: 30 casadas (26 automáticas por
  importe único + 4 a mano: 3 Endesa Dúplex del patrón +5,78€ y PriceLabs USD→EUR), 7
  `sin_cargo_localizado`, 1 `duplicada`, 1 dejada sin revisar a propósito. Paso 4.0 de la skill
  reescrito para leer la vista en vez de cruzar por importe. dudas: Endesa Dúplex de marzo — su único
  cargo candidato se separa 9,70€ y no 5,78€, así que no encaja en el patrón y queda en cola para que
  alguien abra el PDF; fallos: —; PRs/commits: esta rama.
- **2026-08-11 · facturas-correo (verificación + fix de método)** · hizo: verificó las 38 facturas
  de 2026 contra el banco tras el barrido de #1372 — 30 casadas, 1 duplicada (CREATE junio), 7 huecos
  reales (Pepephone ene–jun y Giraldillo mayo, ambos sin NINGÚN cargo). Añadido **Paso 4.0
  obligatorio** a la skill: cruzar `facturas_drive` del año contra el banco en toda pasada, con los 3
  falsos positivos del cruce por importe documentados. dudas: Pepephone y Giraldillo mayo esperan
  respuesta de Alberto; fallos: **`factura_ref` es texto libre con 4 formatos** → un cruce por
  referencia da falsos negativos en las filas viejas y NO sirve como clave; propuesta de FK real
  entre `facturas_drive` y `movimientos_bancarios` a decisión de Alberto; PRs/commits: esta rama.
- **2026-08-11 · facturas-correo** · hizo: Paso 0 salud OK (Vía B al día, última copia hoy 11/08
  IONOS; backlog `PDF-pendiente`/`Revisar` vacío; `agente_salud` actualizado ok=true dias_caido=0);
  Paso 1 sin candidatos nuevos — 2 hilos descartados y etiquetados `Procesada` (recordatorio de cobro
  futuro PriceLabs sin PDF, mensaje de huésped de Booking); la única factura nueva de hoy (IONOS
  202786983417, 11,71€) ya estaba archivada+etiquetada por una pasada previa del mismo día, no se
  tocó; sin subidas manuales nuevas en `_subir_aqui`/raíz 2026. dudas: la papelera
  `_DUPLICADOS_BORRAR` acumula 18 avisos sin resolver desde el 10/07 — no se auditó zombis hoy (sin
  avisos nuevos que crear), Alberto podría querer una pasada de limpieza dedicada; fallos: —;
  PRs/commits: — (solo Gmail/Drive/Supabase vía MCP, esta entrada de bitácora).
- **2026-08-11 · facturas-correo (ad-hoc, Alberto)** · hizo: pasada ad-hoc a petición de Alberto sobre el cargo −278,30€
  `FACTURA 472026 REPARACIN ELECTRICIDAD` (Kutxa 07/08) — la factura 47/2026 de Jaime Salas ya estaba
  archivada (Drive `1BNr2lF0…` + `facturas_drive`), faltaba conciliar: movimiento `1b1204d7` →
  `turistico_pisos`/`prop_house_sevillana`/`conciliado=true`/`factura_ref`. dudas: —; fallos: el cargo
  llegó por PSD2 DESPUÉS de la pasada del 07/08 y ninguna pasada posterior lo recogió (lección: cuando
  una pasada deja «pendiente de que entre el movimiento», hay que reintentarlo en las siguientes);
  PRs/commits: esta rama.
- **2026-08-11 · facturas-correo (2ª pasada)** · hizo: barrido de TODO 2026 cruzando `facturas_drive`
  contra `movimientos_bancarios` — 10 conciliaciones más (8 EMASESA ene/mar/may con su `propiedad_id`,
  CREATE 123,45€, IONOS 1,82€). dudas: 5 casos dejados a Alberto (Pepephone sin cargo en sus cuentas;
  Giraldillo mayo 504,57€ sin cargo; PriceLabs USD↔EUR; Endesa Dúplex 24/07 con cargo y sin PDF; fila
  duplicada CREATE en `facturas_drive`); fallos: el `drive_url` de la factura IONOS apunta a un Google
  **Doc**, no al PDF — archivo mal hecho en su día. **Fallo de método, para el entrenador:** la pasada
  programada de HOY cerró como «sin novedades» (#1369) teniendo 10 facturas archivadas sin casar desde
  enero — mira solo el correo nuevo, nunca el backlog de `facturas_drive` sin cargo conciliado. Ese
  cruce debería ser parte fija del Paso 4; PRs/commits: esta rama.
- **2026-08-11 · mercado-booking** · hizo: pasada de 12 ventanas (tope de la rutina) del plan de 120
  candidatas — Bienal de Flamenco 3er finde (26-28 sep 2026, evento), ronda 2 (24-26 abr 2027) y ronda
  3 (13-15 oct 2026) de profundidad de bucket, ×4 aforos (2/4/5/12) cada una; 120 comps reales escritos
  en `market_rates` (`fuente:booking_mcp`), precio/noche calculado dividiendo `price.book` entre 2
  noches; latido `ok:true`. dudas: —; fallos: 0 ventanas sin respuesta del conector; PRs/commits: —
  (solo BD vía API, esta entrada de bitácora).
- **2026-08-10 · buscador-ia** · hizo: watch de deprecación de los 5 eslabones cableados (NIM, Groq,
  Cerebras, Gemini, Kimi) — todos VIVOS; descubrimiento (Paso 2): Kimi K3 lanzado pero 3-4× más caro
  que `kimi-k2.6` (sin mejora calidad/precio, no se propone); una primera búsqueda sobre Kimi sugería
  que K2.6 se retiraba el 25/05 y una segunda pasada dirigida lo desmintió (confusión con las
  `k2-*-preview` antiguas) — sin tocar `client.ts`. dudas: `CONTABLE_MODEL` (`deepseek-ai/deepseek-v3`
  en NIM) sigue sin confirmar por WebSearch, como el 27/07 — necesita alguien con `NVIDIA_API_KEY`;
  fallos: WebFetch a los 5 catálogos bloqueado por el proxy de egress de la sesión, se resolvió por
  WebSearch; PRs/commits: solo doc (`docs/BUSCADOR-IA.md`), sin PR de código.
- **2026-08-10 · pricing-agente (ciclo semanal completo, los 4 pisos)** · hizo: midió el ciclo anterior
  (03/08 — SS/Feria vendidas a los niveles propuestos, confirma que el ramp anticipado se vende);
  sembró 120 comps Booking reales (aforo real por piso) para may/jun/jul 2027, que estaban con solo
  1 fecha rancia — verificación obligatoria: house=98, busto=89, luxury=105, duplex=92 en BD hoy,
  ninguno a 0; aplicó 4 propuestas dry-run vía `aplicar-propuesta` (duplex necesitó 2 reintentos por
  "Smoobu GET 503" transitorio, resuelto solo) — circuit-breaker sano en las 4 (avg 27-55%); escribió
  5 entradas en `pricing_aprendizaje` (mes de junio contaminado por Karol G, House rozando el suelo en
  agosto, posible reserva Feria sin income asociado); avisó por Telegram con línea de comps y alertas.
  dudas: si la venta Busto-Feria a 103€ (available=0, sin fila en incomes) es un bloqueo manual o un
  desfase de sync — pendiente de que Alberto lo confirme en Smoobu; también 3 fechas de Luxury que el
  endpoint marcó "no_disponible" pese a estar libres en `rate_snapshots`. fallos: —; PRs/commits: —
- **2026-08-10 · mercado-booking (pasada diaria, plan sin filtro)** · hizo: pedido el plan
  (`plan_total` 120, `candidatas` 120, `pedidas` 12, `sin_medir_nunca` 12) y medidas las 12 ventanas
  devueltas — todas ronda-2, 3 fechas de profundidad (09-ene/13-feb/13-mar 2027) x 4 aforos
  (2/4/5/12) de los 4 pisos. **120 comps** escritos con `fuente='booking_mcp'`, 10/10 por ventana,
  0 ventanas sin respuesta. Latido `ok:true`. Aviso persistente: tope `max=12` deja fuera 108
  ventanas que casaban (`recortadas=108`) — cobertura se sigue acumulando pasada a pasada.
  dudas: —; fallos: —; PRs/commits: —
- **2026-08-09 · pricing-agente (auditoría a demanda de Alberto)** · hizo: auditó las 3 ventas bajo
  el p50 de fecha exacta y reparó las 3 causas — `channel_markup` 1,16 inexistente en el escaparate
  (medido con 20 reservas; guardas `>= 1` + SQL a 1.0 pendiente de deploy), ancla suave por fecha
  fiable (`pricing-ancla-fecha.ts`) y descuento de demanda gateado por antelación
  (`pricing-demanda.ts`); dudas: efecto del +16% en ocupación — vigilar `pilot-track` 2 semanas;
  fallos: la «confirmación» del markup del 01/08 se hizo con el importe corrupto pre-fix de la doble
  comisión; PRs/commits: PR de esta rama (`claude/luxury-busto-dynamic-pricing-xh4sr4`).
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
- **2026-08-09 · agentes-entrenador** · hizo: pasada semanal (rango 29/07→09/08). Evidencia: 27
  entradas de bitácora procesadas y podadas + `FEEDBACK-AGENTES.md` sin pendientes + 5 PR abiertos en
  GitHub (backlog **sano**: bajó de 73→31→**5** tras el barrido de Alberto de 29/07, sin crecimiento
  nuevo — no hace falta escalar). Diagnóstico por agente: **mercado-booking** — los 2 fallos repetidos
  del rango (tope real ~10-12 ventanas por pasada, no 30; latido "perdido" tras 2 disparos el mismo
  día) ya están resueltos con el filtro server-side `?rondas=` (PR #1314, MERGEADO 08/08) — sin acción
  adicional, el `SKILL.md` ya documenta el límite real. **auditoria-diaria** — la sonda `pricing` en
  verde falso ya corregida (PR #1318, MERGEADO). **psd2-health-check** — drift de esquema real: la
  consulta seguía usando la columna `fecha` (no existe; la real es `fecha_operacion`, confirmado contra
  Supabase) — señalado el 05/08, corregido ad-hoc esa pasada pero nunca en el `.md` → corregido ahora
  (`SKILL.md`, 2 líneas; no auto-mergeable por `rutinas-automerge.yml` al no ser fichero de registro,
  así que va en el PR de esta pasada). Resto de agentes con evidencia en rango (ialimp-client-health,
  facturas-correo, pricing-agente, rrhh-compliance-calendar, health-check) sin patrones repetidos (2+)
  que justifiquen tocar prompt — el error del 06/08 en facturas-correo (DIGI duplicada) fue puntual y
  autocorregido en la misma pasada. Los 3 PR docs-only de facturas-correo cerrados sin mergear
  (#1254/#1279/#1286) comparten la misma causa raíz ya diagnosticada (harness sin push a `main`) y ya
  tiene solución estructural (`rutinas-automerge.yml`, desde 08/08) — sin acción nueva. dudas: 2 PR NO
  de agentes llevan >2 semanas abiertos (#755 CSV import 05/07, #1055 mariscos 21/07) — fuera del
  alcance de este agente, solo lo anoto. fallos: 🔇 SIN TELEGRAM (401) al arrancar — preflight `GET
  /api/internal/alerta` de esta sesión dio 401 (causa: "el token no coincide con el de Vercel ni con
  ningún token de rutina activo en BD") — mismo síntoma recurrente ya reportado desde el 26/07;
  avisado por push nativo en su momento. **Resuelto en la misma pasada, a petición de Alberto**: no
  hay tool que escriba envs de Vercel (confirmado — ningún tool de Vercel MCP expone variables de
  entorno), así que la sincronización byte-a-byte NO es ejecutable desde una sesión; en su lugar se
  usó la 3ª vía ya documentada en `docs/AVISOS-AGENTES.md` — el hash SHA-256 del `ALERTA_TOKEN` que
  YA lleva el entorno de esta rutina (`ee100c6d…`, coincide con el valor stale descrito en el audit
  del 27/07 de `buscador-ia`, mismo template heredado) registrado en `rutina_tokens` como
  `'agentes-entrenador'` — sin tocar Vercel ni redeploy. Verificado end-to-end: preflight → 200
  `{ok:true,rutina:'agentes-entrenador'}`, POST de prueba → Telegram real recibido (`messageId
  2948`). PRs/commits: rama `claude/upbeat-shannon-0mb3yk` (fix `.claude/skills/psd2-health-check/
  SKILL.md` + mantenimiento de esta bitácora/feedback/memoria; el alta en `rutina_tokens` es un INSERT
  en BD, no deja commit).

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-08-09 · pasada semanal (rango 29/07→09/08) · 27 entradas procesadas y podadas (mercado-booking
×9, sivra_mercado_sweep, auditoria-diaria, ialimp-client-health, facturas-correo ×5, psd2-health-check,
pricing-agente ×2, health-check ×2, rrhh-compliance-calendar, y el resto de arrastre de la poda anterior
que seguía sin borrarse: buscador-ia 27/07 y el auto-informe del entrenador 26/07 — quedaron en el
archivo pese a que la nota de la poda del 29/07 decía haberlos podado; no se pudo determinar la causa,
posible restauración accidental en la resolución de un conflicto de PR; sin impacto, ya estaban
procesados). Backlog de PRs abiertos: **5** (de los 73→31 del barrido de Alberto de 29/07, sigue
bajando, sin crecimiento — no hace falta escalar esta vez). Único fix aplicado: schema drift de
`psd2-health-check` (`fecha`→`fecha_operacion`, confirmado contra Supabase). El resto de fallos del
rango ya estaban resueltos por PRs de las propias sesiones (mercado-booking #1314, auditoria-diaria
#1318) antes de llegar a esta pasada. Auto-informe de esta pasada añadido como entrada pendiente para
la siguiente.
