# Agente de seguimiento del piloto de pricing — Plan de implementación

> **For agentic workers:** plan ejecutable tarea a tarea. Pasos con checkbox `- [ ]`.

**Goal:** Un agente autónomo (cron en sivra) que vigile el piloto de precio dinámico de Busto Reform,
distinga señal de ruido, y avise por email + push — sin escribir precio salvo camino gated.

**Architecture:** Endpoint `/api/pricing/pilot-track` (cron diario) + lógica pura en `lib/pilot-track.ts`.
Reusa `cron-auth`, `pricing-notify`, `resultados` (€ extra) y `guard` (reversión). Persiste histórico
en tabla nueva `pricing_pilot_tracking`. Tarjeta en `/pricing-auto`.

**Tech Stack:** Next.js 15 App Router, Prisma `$queryRaw` sobre Supabase, NVIDIA NIM no usado aquí.

**Verificación:** el repo NO tiene runner de tests; se verifica con `npx tsc --noEmit` + dry-run de las
consultas SQL contra Supabase real (read-only) antes de desplegar, según `docs/pricing-automatico.md`.

**Hallazgos de la investigación (ground truth):**
- `rates/snapshot` captura solo `+7` días (no 21 como dice su comentario). → A1 lo sube a 60.
- `update_rate_snapshots_booked()` solo marca pasado; `was_booked` futuro es NULL por diseño → NO se
  toca esa función; las reservas futuras se leen al vuelo de `incomes` (`checkIn<=date<checkOut`).
- `pricing_settings` (cols): enabled, target_pctl, floor_pctl, ceil_pctl, position_factor, quality_k,
  own_score, min_price, max_price, demand_k, demand_baseline, apply_enabled, max_change_pct,
  channel_markup, events_enabled, gap_discount_pct. → añadir `pilot_enabled`, `pilot_no_booking_days`.
- `pricing_applied` cols: id, applied_at, property_id, rate_date, old_price, new_price, dry_run, source.
- Props: prop_busto_reform=352418, prop_duplex_center=352928, prop_luxury_busto=352943, prop_house_sevillana=352007.

---

### Task 1: Migración — columnas de piloto + tabla de tracking

**Files:** Supabase migration (vía `apply_migration`).

- [ ] **Step 1:** Añadir columnas a `pricing_settings` (additivas, default seguro):

```sql
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS pilot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pilot_no_booking_days integer NOT NULL DEFAULT 7;
```

- [ ] **Step 2:** Crear tabla de histórico diario del piloto:

```sql
CREATE TABLE IF NOT EXISTS pricing_pilot_tracking (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracked_on date NOT NULL,
  property_id text NOT NULL,
  verdict text NOT NULL,                 -- 'verde' | 'amarillo' | 'rojo'
  free_nights_60 integer,                -- noches libres en ventana 60d
  booked_nights_60 integer,
  occupancy_60 numeric,
  days_since_booking integer,            -- días sin reserva NUEVA
  current_base integer,                  -- precio base actual Smoobu
  extra_eur integer,                     -- € extra vs PriceLabs acumulado
  pace_vs_last_year numeric,             -- ratio reservas vs año anterior
  market_p50_guest integer,              -- mediana mercado (precio huésped)
  diagnosis text,                        -- por qué (caros / sin demanda / ok)
  proposal text,                         -- propuesta (p.ej. bajar a X)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tracked_on, property_id)
);
```

- [ ] **Step 3:** Semilla del piloto en Busto Reform:

```sql
UPDATE pricing_settings SET pilot_enabled = true WHERE property_id = 'prop_busto_reform';
```

- [ ] **Step 4:** Verificar: `SELECT pilot_enabled, pilot_no_booking_days FROM pricing_settings WHERE property_id='prop_busto_reform';` → `true, 7`.

---

### Task 2: A1 — Horizonte del snapshot 7 → 60 días

**Files:** Modify `app/api/rates/snapshot/route.ts:30` y el comentario obsoleto `:48`.

- [ ] **Step 1:** Cambiar `endDay.setDate(endDay.getDate() + 7)` → `+ 60`.
- [ ] **Step 2:** Corregir comentario "Iterar los 21 días" → "Iterar la ventana (60 días)".
- [ ] **Step 3:** Verificar `npx tsc --noEmit` (sin errores nuevos).
- [ ] **Step 4:** Commit `feat(sivra): ampliar horizonte del snapshot de precios a 60 días`.

Nota: 4 pisos × 61 días = 244 upserts secuenciales; `maxDuration=60` lo cubre. Si en preview tarda,
agrupar en un único INSERT multi-fila por piso (no bloqueante para el plan).

---

### Task 3: Lógica pura del agente — `lib/pilot-track.ts`

**Files:** Create `lib/pilot-track.ts`.

Funciones puras (sin DB) testeables por inspección; reciben datos y devuelven veredicto/diagnóstico:

```ts
export type PilotInput = {
  freeNights60: number; bookedNights60: number;
  daysSinceBooking: number; threshold: number;
  currentBase: number | null; marketP50Guest: number | null;
  channelMarkup: number; minPrice: number | null;
}
export type PilotVerdict = {
  verdict: "verde" | "amarillo" | "rojo";
  diagnosis: string; proposal: string | null; proposedBase: number | null;
}

// Anti-falso-🔴 (#1): rojo solo si hay fechas LIBRES y se superó el umbral sin reservas.
export function evaluatePilot(i: PilotInput): PilotVerdict {
  const guestPrice = i.currentBase != null ? Math.round(i.currentBase * i.channelMarkup) : null
  const overMarket = guestPrice != null && i.marketP50Guest != null && guestPrice > i.marketP50Guest
  if (i.freeNights60 === 0) {
    return { verdict: "verde", diagnosis: "Sin inventario libre en 60d (todo reservado).", proposal: null, proposedBase: null }
  }
  if (i.daysSinceBooking >= i.threshold) {
    // Diagnóstico (#4): distinguir caros vs sin demanda
    const diagnosis = overMarket
      ? `Sin reservas ${i.daysSinceBooking}d y por encima del mercado (huésped ${guestPrice}€ > p50 ${i.marketP50Guest}€).`
      : `Sin reservas ${i.daysSinceBooking}d pero NO estamos caros (huésped ${guestPrice ?? "?"}€ ≤ mercado). Puede ser demanda baja general.`
    // Propuesta (#6) solo si estamos caros: bajar hacia el mercado, nunca por debajo de min_price
    let proposedBase: number | null = null
    if (overMarket && i.marketP50Guest != null) {
      const target = Math.round(i.marketP50Guest / i.channelMarkup)
      proposedBase = i.minPrice != null ? Math.max(target, i.minPrice) : target
    }
    const proposal = proposedBase != null && i.currentBase != null && proposedBase < i.currentBase
      ? `Bajar base ${i.currentBase}€ → ${proposedBase}€ (huésped ~${Math.round(proposedBase * i.channelMarkup)}€).`
      : null
    return { verdict: "rojo", diagnosis, proposal, proposedBase }
  }
  if (i.daysSinceBooking >= Math.ceil(i.threshold / 2)) {
    return { verdict: "amarillo", diagnosis: `Sin reservas ${i.daysSinceBooking}d (umbral ${i.threshold}d).`, proposal: null, proposedBase: null }
  }
  return { verdict: "verde", diagnosis: "Ritmo de reservas normal.", proposal: null, proposedBase: null }
}
```

- [ ] **Step 1:** Crear el archivo con el contenido de arriba.
- [ ] **Step 2:** Repasar a mano los casos: freeNights60=0 → verde; daysSinceBooking≥umbral & caros → rojo+propuesta; ≥umbral & no caros → rojo sin propuesta; medio → amarillo.
- [ ] **Step 3:** `npx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(sivra): lógica pura del veredicto del piloto (anti-falso-positivo + diagnóstico)`.

---

### Task 4: Endpoint/cron `/api/pricing/pilot-track`

**Files:** Create `app/api/pricing/pilot-track/route.ts`.

- [ ] **Step 1:** Implementar GET (auth cron+sesión). Por cada piso con `pilot_enabled=true`:
  - **Ocupación/libres 60d** desde `rate_snapshots` (último snapshot) + reservas futuras de `incomes`.
  - **days_since_booking**: `CURRENT_DATE - MAX(incomes.createdAt::date)` para ese piso.
  - **current_base**: `price_pricelabs` del último snapshot para una fecha futura libre representativa.
  - **market_p50_guest**: `percentile_cont(0.5)` de `market_rates.price_night` del scenario del piso.
  - **extra_eur**: reusar la consulta de `resultados` filtrada por piso.
  - **pace_vs_last_year**: nº reservas creadas últimos 30d vs mismas fechas año anterior (`incomes.createdAt`).
  - Llamar `evaluatePilot(...)`, upsert en `pricing_pilot_tracking` (ON CONFLICT tracked_on,property_id).
- [ ] **Step 2:** Watchdog (#2): si `MAX(snapshot_date) < CURRENT_DATE` o `market_rates` > 7d viejo → añadir aviso.
- [ ] **Step 3:** Si algún piso es 🔴 o hay watchdog → `notifyOwner` (email+push) con tabla resumen.
- [ ] **Step 4:** Responder JSON con el detalle por piso (para dry-run).
- [ ] **Step 5:** `?dryRun=1` no escribe en `pricing_pilot_tracking` ni notifica (solo calcula) — para verificar.
- [ ] **Step 6:** `npx tsc --noEmit`.
- [ ] **Step 7:** Commit `feat(sivra): endpoint agente de seguimiento del piloto (pilot-track)`.

**Importante (#6 gated):** el endpoint **NO escribe precio en Smoobu**. Solo propone (`proposal`,
`proposedBase`) y lo guarda/avisa. Aplicar la bajada sigue siendo decisión manual vía `/api/pricing/apply`.

---

### Task 5: Cron + middleware

**Files:** Modify `vercel.json`, `middleware.ts:77`.

- [ ] **Step 1:** Añadir cron `{ "path": "/api/pricing/pilot-track", "schedule": "15 9 * * *" }`.
- [ ] **Step 2:** Excluir `api/pricing/pilot-track` del matcher del middleware (como el resto de crons).
- [ ] **Step 3:** `npx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(sivra): cron diario del agente de seguimiento + exclusión de middleware`.

---

### Task 6: Tarjeta en el panel `/pricing-auto`

**Files:** Create `app/api/pricing/pilot-track/historial/route.ts` (GET histórico), Modify la página `/pricing-auto`.

- [ ] **Step 1:** GET que devuelve las últimas N filas de `pricing_pilot_tracking` por piso.
- [ ] **Step 2:** Tarjeta "Seguimiento del piloto" con veredicto (semáforo), días sin reserva, € extra,
  diagnóstico y propuesta. Botón "Ejecutar ahora" → `POST /api/pricing/pilot-track`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx next build` (compila).
- [ ] **Step 4:** Commit `feat(sivra): tarjeta de seguimiento del piloto en /pricing-auto`.

---

### Task 7: Verificación end-to-end + despliegue

- [ ] **Step 1:** Dry-run del endpoint contra Supabase (consultas read-only) para Busto Reform; comprobar
  que el veredicto refleja la realidad (0 reservas nuevas desde 10/06 → 🔴 o 🟡 según fechas libres).
- [ ] **Step 2:** `npx next build` final.
- [ ] **Step 3:** Push `-u origin claude/dynamic-pricing-uhvnak`.
- [ ] **Step 4:** Crear PR (draft).
- [ ] **Step 5:** Mergear (pedido por Alberto) **tras** confirmar CI verde y que el endpoint es proposal-only.
- [ ] **Step 6:** Aplicar a Busto Reform = `pilot_enabled=true` (Task 1.3, ya hecho en BD).

**⚠️ Gate de seguridad antes de mergear a producción:** `CRON_SECRET` debe estar definido en Vercel
(sivra) o los endpoints `/api/pricing/*` quedan públicos. pilot-track es proposal-only (no escribe
precio), pero `apply`/`apply-auto` ya existen → recordar a Alberto definir `CRON_SECRET`.
</content>
