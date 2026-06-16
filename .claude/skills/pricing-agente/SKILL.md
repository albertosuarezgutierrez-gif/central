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
- Ventanas: 1 finde/mes próximos ~10 meses + cada fecha de evento.
- Mercado: usa los conectores con coords/aforo del piso (`pricing_piso_zona`). Guarda **precio Y
  rating** de los comps (paridad competitiva). Persiste lo que saques en `market_rates`
  (`scenario=prop_X`, `checkin_date`) para que quede y el motor lo reuse.
- Eventos: `eventFactor(fecha)` + `pricing_eventos_auto` (el más alto manda; cap 2.5).
- Ocupación/antelación: `rate_snapshots`. Coste/piso: ver tabla de arriba. Reglas: `pricing_settings`.

### 3. DECIDE precio (y min-stay en eventos) por piso/fecha
- Parte del percentil de mercado de su zona, ajusta por demanda (ocupación vs baseline), calidad
  (rating propio vs comps), evento (ramp anticipado → pelotazo) y antelación (last-minute suaviza).
- En eventos calientes: sube percentil, considera **min-stay** (p.ej. 2-3 noches) para capturar valor.
- Escribe un **`motivo`** claro por fecha (lo leerá Alberto en el chat) y un snapshot de `variables`
  (mercado p50 zona, evento, ocupación, coste, margen objetivo).

### 4. APLICA por los raíles (NUNCA escribas en Smoobu directo)
- `POST /api/pricing/aplicar-propuesta` con body
  `{ "dryRun": true, "fuente": "agente", "proposals": [{property_id, rate_date, price, min_stay?, motivo, variables}] }`.
- **Primer ciclo y tras cualquier cambio grande: `dryRun: true`.** Lee la respuesta y
  `pricing_decisiones` → revisa qué recortaron los raíles (suelo/tope/circuit-breaker) y los motivos.
- Si el circuit-breaker salta (HTTP 409), tu propuesta es demasiado agresiva en volumen/%: re-evalúa,
  NO lo fuerces; reparte la subida en varios ciclos (el tope ±/día está para eso).
- Solo cuando las decisiones se vean sanas, repite con `dryRun: false` (respeta pausa y `apply_enabled`).

### 5. Escribe el aprendizaje (memoria persistente)
- `INSERT ... ON CONFLICT (property_id, temporada)` en `pricing_aprendizaje`: elasticidad observada,
  antelación típica de reserva, qué precios convirtieron, qué eventos "petaron", overrides de Alberto.
  Esto es lo único que sobrevive a la sesión efímera → es de donde sale la mejora continua.

### 6. Informe semanal a Alberto
- Resumen: qué subió/bajó y por qué, margen proyectado, **fechas calientes** próximas (eventos donde
  ir a por el pelotazo), y alertas (mercado escaso, circuit-breaker, pisos sin `apply_enabled`).
- Señal de demanda resultante → útil para **ialimp** (limpiezas en picos) e **ia-rest** (afluencia).

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
