---
name: pricing-agente
description: >
  El AGENTE de pricing IA autónomo de SIVRA (pisos turísticos en Sevilla). Úsalo cuando Alberto
  pida "corre el agente de precios", "revisa precios", "estudia el mercado y pon precios", o en la
  sesión recurrente de Claude programada para tarificar. El agente reúne TODAS las variables
  (mercado real por zona/fecha vía conectores MCP, eventos, ocupación, costes, características del
  piso), DECIDE el precio para máximo margen (pelotazo en eventos), lo APLICA por los raíles del
  Paso 4 (nunca escribe en Smoobu directo), mide resultados y se RETROALIMENTA en la BD. Memoria =
  BD (`pricing_aprendizaje`), no la sesión (efímera). Sin secretos: solo nombres de variable.
---

# Agente de pricing IA — sivra

> **El cerebro.** La IA decide, pero la escritura a Smoobu pasa SIEMPRE por los raíles del
> `POST /api/pricing/aplicar-propuesta` (Paso 4) que la IA **no puede saltarse**: suelo de coste,
> tope ±/día, pausa global, circuit-breaker, auditoría. Lección de los 125€: los raíles van en el
> código, no en la confianza al LLM. **Arranca SIEMPRE en `dryRun`** y pasa a vivo solo tras revisar.

## Función objetivo (lo que Alberto quiere)
Maximizar **margen neto esperado** = `(precio − comisión_canal − coste_limpieza − fijos_prorrateados) ×
prob_reserva`. Reglas:
- **Nunca por debajo de coste** (el suelo lo garantiza el Paso 4, pero propón ya por encima).
- **Lejos de la fecha y libre:** agresivo (margen alto, hay tiempo).
- **Cerca y libre:** suaviza (last-minute) sin bajar del coste.
- **Eventos importantes a futuro:** ir a por el **"pelotazo"** — percentil alto, sin techo, **subiendo
  con antelación** (el tope ±/día obliga a EMPEZAR meses antes; si esperas, no llegas al precio).
- Empuja **reserva directa** en noches premium.

## Datos / herramientas (todo por zona y características REALES de cada piso — innegociable)
| Variable | Fuente |
|---|---|
| Zona/CP, coords, aforo, tipo de cada piso | tabla `pricing_piso_zona` (Paso 1; pobla `/api/pricing/pisos-zona`) |
| Mercado real por fecha (≤90d) | MCP `mcp__Booking_com__accommodations_search` (coords+radio, `number_of_adults`=aforo, APARTMENT, EUR) |
| Mercado real a futuro (>90d) | MCP `mcp__Tripadvisor__search_hotels` / `mcp__Trivago__trivago-accommodation-radius-search` |
| Comps históricos por `checkin_date` | tabla `market_rates` (barrido `/api/mercado/sweep`) |
| Eventos (puentes/festivos + aforo) | `apps/sivra/lib/pricing-calendar.ts` (`eventFactor`) + tabla `pricing_eventos_auto` (Ticketmaster) |
| Ocupación + antelación de reserva | tablas `rate_snapshots` (`available`, `was_booked`), `incomes` |
| Costes por piso (suelo) | `gastos_fijos`/`gastos` + limpieza (`coste_por_sesion`/`sesiones_con_precio`) + `channel_markup` |
| Reglas por piso | tabla `pricing_settings` (`min_price`, `max_change_pct`, `apply_enabled`, percentiles…) |
| **Memoria/aprendizaje** | tabla `pricing_aprendizaje` (se lee al empezar, se escribe al final) |
| **Trazabilidad de decisiones** | tabla `pricing_decisiones` (precio+motivo+snapshot de variables por ciclo) |

Pisos (property_id → smoobu_id): `prop_house_sevillana` 352007 · `prop_busto_reform` 352418 ·
`prop_duplex_center` 352928 · `prop_luxury_busto` 352943.

## El ciclo (cada ~7 días; autónomo). Hazlo en este orden:

### 0. Verifica fundación
- `SELECT * FROM pricing_piso_zona` → si vacío o sin CP/coords/aforo, pide a Alberto lanzar
  `/api/pricing/pisos-zona` (logueado) y PARA. Sin zona real no hay comps por zona.

### 1. Lee memoria + mide el ciclo anterior (retroalimentación)
- `SELECT * FROM pricing_aprendizaje` → insights/overrides previos por piso/temporada (p.ej.
  "Busto no bajar de 120", "Semana Santa muy elástica al alza"). **Respétalos.**
- Mide outcomes del ciclo anterior: cruza `pricing_decisiones` (lo que decidiste) con
  `rate_snapshots.was_booked` + `incomes` (lo que pasó: ¿se reservó?, ¿a qué precio?, ¿con cuánta
  antelación?). Calcula por piso/temporada: ocupación, ADR, **RevPAR**, margen.

### 2. Reúne TODAS las variables (por piso, por fecha)
- Ventanas: **1 finde/mes hasta ~12 meses + cada fecha de evento**, e **incluye SIEMPRE las semanas
  altas a futuro** (Semana Santa, Feria, septiembre). El `sweep` de Serper (cron) solo cubre ~8 meses
  y se queda corto a futuro → si no barres tú las fechas lejanas, el motor las tarifica a ciegas y las
  **hunde al suelo** (lección cara: Busto abril'27 se vendió a 99€ con mercado real ~150-179€).
- Mercado — **triangula 2-3 OTAs por fecha** (resiliencia: si una falla, las otras cubren; pasó el
  23/06 con Trivago/Tripadvisor caídos):
  - `mcp__Booking_com__accommodations_search` con `accommodation_types:["APARTMENT"]`, coords+radio y
    `number_of_adults`=aforo del piso (`pricing_piso_zona`). **Es la mejor: apartamentos reales, no hoteles.**
  - `mcp__Expedia__search_hotels` y `mcp__lastminute_com__search_only_hotel` como 2ª/3ª fuente.
  - `mcp__Trivago__*` / `mcp__Tripadvisor__search_hotels` solo si las de arriba fallan (Tripadvisor da
    HOTELES, sesga al alza — usa solo el clúster apartamento-style más barato).
- **Persiste por el endpoint, NO con SQL a mano:** `POST /api/mercado/ingest` (en plataforma) con
  `{ portal:"booking|expedia|lastminute", scenario:"prop_X", checkin, checkout, guests, apartments:[{name,
  price_night, score, review_count, location}] }`. Es **idempotente** (clave search_date+portal+scenario+
  comp+checkin) y deja el `portal` por fuente → el motor reusa todo. (Auth: `CRON_SECRET`; pídeselo a
  Alberto o que lo dispare él si no lo tienes en sesión.) Guarda **precio Y rating** (paridad competitiva).
- Eventos: `eventFactor(fecha)` (calendario) + `pricing_eventos_auto` — ahora alimentada por DOS crons:
  **Ticketmaster** (`/eventos/sync`, conciertos/deportes) y **web_search** (`/eventos/websearch`, Gemini:
  LaLiga/ferias/congresos/festivos). El motor toma el más alto (MAX; cap 2.5).
- Ocupación/antelación: `rate_snapshots`. Coste/piso: ver tabla de arriba. Reglas: `pricing_settings`.
- **Demanda adelantada por vuelos (opcional, Fase 3):** con `mcp__Expedia__search_flights` a **SVQ**
  desde mercados emisores, calcula un `demand_index` por fecha (≥1 = pico) y POSTéalo a
  `/api/sivra/mercado/flights` (`{days:[{rate_date,demand_index,median_fare?,fares_sample?}]}`). El motor
  solo lo aplica si `pricing_settings.flight_demand_k>0` (default 0 = inerte hasta que Alberto lo active).

### 3. DECIDE precio (y min-stay en eventos) por piso/fecha
- Parte del percentil de mercado de su zona, ajusta por demanda (ocupación vs baseline), calidad
  (rating propio vs comps), evento (ramp anticipado → pelotazo) y antelación (last-minute suaviza).
- En eventos calientes: sube percentil, considera **min-stay** (p.ej. 2-3 noches) para capturar valor.
- Escribe un **`motivo`** claro por fecha (lo leerá Alberto en el chat) y un snapshot de `variables`
  (mercado p50 zona, evento, ocupación, coste, margen objetivo).

### 4. APLICA por los raíles (NUNCA escribas en Smoobu directo)
- **🚨 USA SIEMPRE PLATAFORMA, NO SIVRA (27/07/2026).** La política de red del entorno de esta rutina
  solo permite `plataforma-ten-flame.vercel.app`; **los dominios de sivra dan 403 en el CONNECT del proxy**
  (`sivra-app`/`sybra`/`housesevillana`.vercel.app), así que sus endpoints son INALCANZABLES desde aquí —
  con o sin secreto. Fue la causa (junto al token) de 3 ciclos bloqueados. Endpoints a usar:
  - Mercado: `POST {PLATAFORMA_URL}/api/sivra/mercado/ingest`
  - Raíles:  `POST {PLATAFORMA_URL}/api/sivra/pricing/aplicar-propuesta`
- **Auth: `Authorization: Bearer {ALERTA_TOKEN}`** (ya está en el entorno de la rutina). **NO pidas el
  `CRON_SECRET`**: es la llave maestra y el campo de variables del entorno es texto plano visible — la
  regla de `apps/plataforma/CLAUDE.md` prohíbe ponerla en prompts de rutinas.
- **Con `ALERTA_TOKEN` el Paso 4 es SIEMPRE dry-run** (el endpoint lo fuerza y responde
  `dryRunForzado:true`). Es lo correcto: tú propones y auditas, y **Alberto aplica en vivo** desde su
  sesión de admin tras revisar. No trates ese dry-run forzado como un fallo ni escales por Telegram.
- **URLs (prod):** plataforma = `https://plataforma-ten-flame.vercel.app` (motor, crons, endpoints
  `/api/sivra/*` y chat 🤖 Agente IA en `/agente`). `apps/sivra` conserva copias de estos endpoints, pero
  **no las uses desde la rutina** (inalcanzables por red).
- `POST /api/sivra/pricing/aplicar-propuesta` (en plataforma) con body
  `{ "dryRun": true, "fuente": "agente", "proposals": [{property_id, rate_date, price, min_stay?, motivo, variables}] }`.
- **Primer ciclo y tras cualquier cambio grande: `dryRun: true`.** Lee la respuesta y
  `pricing_decisiones` → revisa qué recortaron los raíles (suelo/tope/circuit-breaker) y los motivos.
- Si el circuit-breaker salta (HTTP 409), tu propuesta es demasiado agresiva en volumen/%: re-evalúa,
  NO lo fuerces; reparte la subida en varios ciclos (el tope ±/día está para eso).
- Solo cuando las decisiones se vean sanas, repite con `dryRun: false` (respeta pausa y `apply_enabled`).
- **NUNCA fabriques `pricing_decisiones` a mano** (sería simular una decisión que nunca pasó por los raíles
  reales — peor que dejarlo en blanco). Con la vía de plataforma + `ALERTA_TOKEN` ya no deberías quedarte
  bloqueado; si aun así el Paso 4 falla **dos ciclos seguidos**, no lo dejes solo como «pendiente» en la
  bitácora: avisa por Telegram (`POST {PLATAFORMA_URL}/api/internal/alerta`, Bearer `ALERTA_TOKEN`, mismo
  patrón que `psd2-health-check`) — el bloqueo silencioso repetido es peor que una alerta. **Antes de
  escalar, comprueba el diagnóstico de 3 patas del 27/07:** (1) ¿el dominio que llamas es el de plataforma?
  (2) ¿mandas `ALERTA_TOKEN` por CABECERA? (es header-only a propósito) (3) ¿el 401 viene del endpoint o el
  403 del proxy? — son fallos distintos con arreglos distintos.
- **El Paso 2 (mercado) también puede hacerse por Supabase** si el endpoint fallara: replica el
  `INSERT ... ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date)` EXACTO de la ruta
  (idempotente, mismo efecto). Lo que **no** es replicable a mano es el Paso 4: ahí están los raíles.

### 5. Escribe el aprendizaje (memoria persistente)
- `INSERT ... ON CONFLICT (property_id, temporada)` en `pricing_aprendizaje`: elasticidad observada,
  antelación típica de reserva, qué precios convirtieron, qué eventos "petaron", overrides de Alberto.
  Esto es lo único que sobrevive a la sesión efímera → es de donde sale la mejora continua.

### 6. Informe semanal a Alberto
- Resumen: qué subió/bajó y por qué, margen proyectado, **fechas calientes** próximas (eventos donde
  ir a por el pelotazo), y alertas (mercado escaso, circuit-breaker, pisos sin `apply_enabled`).
- Señal de demanda resultante → útil para **ialimp** (limpiezas en picos) e **ia-rest** (afluencia).

### 7. Repara y mejora, no solo reportes (decisión de Alberto, 19/07/2026)
En **toda** pasada de verificación/auditoría del pricing (no solo el ciclo semanal): si detectas algo
roto (código desconectado del motor real, alertas falsas, guardas que no disparan cuando deberían),
**arréglalo en el momento** dentro de este mismo repo — no te limites a apuntarlo para "otro día". Antes
de cerrar, dedica un pase explícito a preguntarte **"¿qué le falta a esto para funcionar perfecto?"**:
raíles sin cubrir, alertas ruidosas/duplicadas, guardas incompletas, cron legado que ya no aporta. Aplica
las mejoras que sean seguras y acotadas (siguiendo la regla de arriba); dryRun-first y OK explícito de
Alberto solo si el cambio afecta al comportamiento de PRECIO en vivo (raíles, factores, suelos) — los
arreglos de "ruido/exactitud" (p.ej. una alerta comparando contra un dato hardcodeado) no necesitan
esperar. Precedente: la auditoría del 18/07 encontró Karol G rampando a 2.000€ y NO esperó — mergeó R1-R3
en el mismo PR. El hallazgo del 19/07 (`/api/sivra/mercado/cron` generando alertas "precio_bajo" falsas
por comparar contra precios hardcodeados en vez del motor real) se arregló igual, en la misma pasada.

## Raíles (recordatorio — los aplica el Paso 4, no tú)
pausa global (`pricing_config.paused`) · suelo `min_price` (coste) · tope ±`max_change_pct`/día vs
precio actual · techo opcional `max_price` · circuit-breaker (aborta la pasada entera si mueve
demasiadas fechas o % medio enorme) · solo fechas disponibles · auditoría en `pricing_applied` +
`pricing_decisiones`. **Si quieres más margen del que el raíl permite, sube en varios ciclos.**

## Seguridad
- Sin secretos en chat/commits: solo nombres de variable. La key de Smoobu la resuelve el endpoint
  (`getSmoobuKey`), tú nunca la manejas.
- BD compartida con ialimp/plataforma: no toques RLS/buckets/GRANTs (ver `sivra-maestro`).
- Memoria del proyecto: al cerrar, actualiza `docs/CONTEXTO-SESIONES.md`.

## Estado vivo (13/07/2026) — leer al empezar el ciclo

### Actualización 22/07/2026 (MERGEADO a main, PR #1065, producción verde)
- **Motor — «premio de mercado por fecha» (lever NUEVO, `apply/route.ts` + helper puro
  `lib/sivra/pricing-premio-mercado.ts`).** Antes el motor solo consultaba el mercado por FECHA EXACTA dentro
  de `if (ev>1)` (factor de evento del CALENDARIO). Karol G/Feria se malvendieron (344€/140€) porque
  Ticketmaster/websearch NO las flaguearon → el conector tenía 931€/424€ pero se tarifaban por el bucket del
  MES. Ahora: si el mercado del PROPIO día va **≥1,5× (`PREMIO_MERCADO_RATIO`)** su base normal del mes, se
  ancla a la mediana de ESA fecha TAL CUAL (con el ajuste demanda/calidad, **sin ×factor** → sin el doble
  conteo del 18/07), **solo SUBE** (salta el raíl ±%/día como el evento de calendario), respeta `max_price`,
  gateado por `events_enabled`. Umbral 1,5 separa EVENTO (1,5-5×) de FINDE normal (~1,1-1,4×; la mediana del
  mes mezcla findes/entre semana → no encarece un sábado). Es ADITIVO al salto de evento del calendario
  (compiten por MAX). Si un premium se dispara donde no toca, **sube el umbral**, no lo quites.
- **Guardián (`/api/sivra/pricing/guard`) — 2 arreglos de ruido/exactitud:** (1) dedup SIN límite de tiempo
  (antes «24h» + cron diario apilaba una fila `suelo_coste`/día → Telegram DUPLICADO); ahora no recrea un aviso
  mientras siga abierto (al resolverlo y persistir, la siguiente pasada crea uno nuevo). (2) `reserva_bajo_mercado`
  compara contra el p50 de la FECHA EXACTA (≥8 comps; fallback al blended por escenario si esa fecha no tiene
  comps) — el blended aplanaba a ~186€ TODAS las fechas y hacía INVISIBLE el infraprecio de eventos (Karol G
  344€ salía «+85% vs mercado» cuando su día real era 931€). Helpers puros testeados: `pricing-guardia.ts` +
  `pricing-premio-mercado.ts` (16/16). Umbral `suelo_coste` (≥3 fechas al suelo) es estructural (Busto tarifica
  al suelo en ~100/358 fechas) → con el dedup ya no spamea, pero es señal de bajo valor.
- **Copia LEGADA:** `apps/sivra/app/api/pricing/guard/route.ts` NO está programada (solo la de plataforma) y
  arrastra el bug viejo de dedup + solo tiene checks #1/#3 — candidata a retirar; no la reactives.

- **Zona** poblada (`pricing_piso_zona`): 4 pisos, CP 41003 (Bustos Tavera / Casco Antiguo).
- **Costes/suelos** ya calibrados (`pricing_aprendizaje/ALL/costes` + `pricing_settings.min_price`):
  busto 90 · duplex 85 · luxury 95 · house 180. Coste real/noche ~14-30€ (limpieza + fijos; busto y luxury
  son **subarriendo** → la renta es coste duro). El suelo es protección, no precio.
- **Motor por temporada (B2)** YA en prod: `apply/route.ts` tarifica por mes de `checkin_date` con fallback al
  global. NO hace falta reimplementar bucketing; solo alimentar `market_rates` con comps fechados por mes.
- **EN VIVO `busto_reform` y `luxury_busto`** (`apply_enabled=true`; Luxury desde 13/07 con OK de Alberto,
  desconectado de PriceLabs). Duplex/House en dry-run — plan: activarlos el ~27/07 si los dos primeros
  validan, luego desconectarlos de PL y cancelar la suscripción (~3/08). NO actives `apply_enabled` de
  otros pisos sin OK explícito de Alberto.
- **Mercado cargado a 12 meses** (Booking MCP, barrido F1 13/07): verano, Semana Santa 2027 (~462€ p50),
  Feria 2027, may/jun/jul 2027. **Ticketmaster VIVO** (cron semanal; busca por latlong — postalCode da 0
  fuera de EE.UU.). **🔥 KAROL G 3 noches en La Cartuja 11-13 jun 2027** (mercado 4-8x, factor 2,5) — rampar.
- **🕳️ LANDMINE CANAL BOOKING (corregido 13/07):** el precio EFECTIVO en estancias ≥7 noches caía hasta
  ≈ listado × 0,56-0,65 por los **planes "Tarifa semanal" (−30%) y "mensual" (−40%; Dúplex −30%)** de la
  extranet + móvil 10% + Genius dinámico ~11%. Los planes de tarifa NO salen en Promociones. EJECUTADO
  13/07 (Alberto, Booking confirmó los 8 planes): semanal y mensual → −5% (busto/luxury/duplex) y −10%
  (house); ratio esperado ≥7 noches ≈0,76. Detalle y métrica en `pricing-automatico.md` §12 y
  `pricing_aprendizaje` (`canal_booking`). Al valorar margen por reserva, usar el bruto real de `incomes`.
- **Checker anticipado (13/07):** `pricing_experiments.was_booked` se marca al detectar el income que cubre la
  noche futura — la evidencia para la baja de PL crece sin esperar a que pasen las fechas.
- **Websearch de eventos RESTAURADO (13/07):** `lib/websearch.ts::buscarWeb` en plataforma — Gemini
  grounding (gratis) → plugin `web` de OpenRouter (de pago, ~0,02€/pasada) cuando Gemini da 429. Cubre
  LaLiga/ferias/congresos/festivos que Ticketmaster no lista. Gasto trazado en `ai_usos` (endpoint `eventos`).
- **Pendiente de datos:** comps de unidad grande (12 plazas) para House Sevillana.

## Recurrencia / autonomía (importante, no prometer 24/7 de más)
- **Va solo (crons in-app):** `apply-auto` (tarifica Busto a diario), `rates/snapshot` (mide `was_booked`),
  `mercado/sweep` + `eventos/sync` (refrescan datos), `resumen-diario`/`pilot-track` (KPIs). Bucle determinista
  que se retroalimenta sin Claude.
- **Solo con sesión de Claude:** este agente con los **conectores de viajes** (Booking/Tripadvisor/Trivago) —
  los conectores viven en la sesión, no en la app. Para que corra periódicamente: **sesión programada de Claude
  Code on web** apuntando a este skill. Sin ella, el motor sigue con los datos que tenga (plan B).

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
