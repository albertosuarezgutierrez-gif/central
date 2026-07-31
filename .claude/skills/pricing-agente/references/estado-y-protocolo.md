# Estado vivo, recurrencia y protocolo de aviso — pricing-agente

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

### Revisión de eventos y costes (31/07/2026, a petición de Alberto)
- **🚨 Feria de Abril 2027 estaba MAL FECHADA en `pricing-calendar.ts`** (corregido): el calendario la tenía
  «estimada 18-25 abr» (patrón de 2026 calcado) cuando las fechas oficiales son **13-18 abr, alumbrado el 12**.
  Doble daño: 19-25 abr (semana normal) se tarificaba de Feria —hasta ×2,5 de precio y ×2 de SUELO, que además
  impide corregir a la baja— y los días de Feria REAL se quedaban sin suelo de evento. Comprobado contra mercado
  real: 15-abr p50 417€ y 17-abr 304€ frente a 20-abr 162€. **Lección: las fechas de Feria NO se estiman
  «dos semanas después de Semana Santa» — se confirman contra el mercado (un p50 que se dispara) o fuente oficial.**
- **Semana Santa 2027 (21-28 mar) SÍ está bien** en el calendario y el pico casa con el mercado (25-mar p50 554€,
  26-mar 462€). No está en `pricing_eventos_auto`, pero el motor toma el MAX de ambas fuentes.
- **⚠️ El suelo estacional solo mira el CALENDARIO, no `pricing_eventos_auto`** (`seasonalFloorFactor` lee `EVENTS`).
  Un evento que solo exista en la tabla (los que descubren Ticketmaster/websearch) sube el precio objetivo pero
  **no protege el suelo**. Si un evento importante se descubre por la tabla, añádelo también al calendario.
- **Horizonte vs calendario:** `PRICING_HORIZON_DAYS`=365 y el calendario acaba el **2027-05-02** → may-jul 2027
  se tarifica sin eventos de calendario (solo lo que traiga la tabla). El watchdog de `pilot-track` avisa.
- **Costes por noche (recalculados con datos vivos; detalle en `pricing_aprendizaje/ALL/costes_por_noche_31_07_2026`):**
  busto **19,40€** (suelo 65€ → 3,3×) · luxury **29,70€** (suelo 72€ → 2,4×, el más ajustado: su estancia media de
  2,7 noches encarece la limpieza por noche) · duplex **10,60€** (suelo 85€ → 8×) · house **≥30€** (suelo 180€).
  **Ningún suelo vende bajo coste.** Huecos: House **no tiene ni un gasto fijo registrado** (290 m², 6 dorm — su
  coste está infravalorado) y Dúplex/House **no tienen calibración de suelo contra competencia** (la de Busto y
  Luxury es del 28/07). Recuerda que el suelo protege el LISTADO, no el efectivo (canal ≈0,76× a ≥7 noches).

- **Zona** poblada (`pricing_piso_zona`): 4 pisos, CP 41003 (Bustos Tavera / Casco Antiguo).
- **Costes/suelos** ya calibrados (`pricing_aprendizaje/ALL/costes` + `pricing_settings.min_price`):
  **busto 65 · duplex 85 · luxury 72 · house 180** (busto/luxury recalibrados 28/07/2026 con OK explícito
  de Alberto tras análisis de comps reales — detalle en `pricing_aprendizaje` temporada `suelo`; los 115/95
  anteriores quedaban por encima del mercado flojo → fechas al suelo y días sin reserva). Coste real/noche
  ~14-30€ (limpieza + fijos; busto y luxury son **subarriendo** → la renta es coste duro). El suelo es
  protección, no precio. NO volver a subirlos por encima del p25 de fechas flojas sin OK de Alberto.
- **Motor por temporada (B2)** YA en prod: `apply/route.ts` tarifica por mes de `checkin_date` con fallback al
  global. NO hace falta reimplementar bucketing; solo alimentar `market_rates` con comps fechados por mes.
- **EN VIVO `busto_reform` y `luxury_busto`** (`apply_enabled=true`; Luxury desde 13/07 con OK de Alberto,
  desconectado de PriceLabs). Duplex/House siguen en dry-run a 30/07 — plan: activarlos antes del ~3/08
  (cierre PriceLabs), desconectarlos de PL y cancelar la suscripción. La activación la hace Alberto
  (`apply_enabled=true`); auditoría 30/07 no encontró bloqueantes técnicos. NO actives `apply_enabled` de
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

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
