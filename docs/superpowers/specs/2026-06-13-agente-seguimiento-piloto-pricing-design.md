# Agente de seguimiento del piloto de pricing — SIVRA

> Fecha: 2026-06-13 · Vertical: `apps/sivra` · Branch: `claude/dynamic-pricing-uhvnak`
> Fuente de verdad del módulo: `apps/sivra/docs/pricing-automatico.md`

## Problema (qué disparó esto)

El piloto de Busto Reform (precio subido por el sistema 65€→110€ el 10/06, →125€ el 11/06) lleva
**0 reservas nuevas** desde el cambio (la única reserva de junio se creó el 08/06, **antes**). Al
revisarlo se descubrió que **no podíamos leer el piloto** porque la instrumentación está rota:

1. **`rates/snapshot` solo guarda una ventana de 7 días** (8 filas por `snapshot_date`, de
   `snapshot_date` a `+7`). Las fechas que encarecemos (p.ej. 23/06) se salen de la ventana → no se
   pueden seguir.
2. **`rate_snapshots.was_booked` está NULL en todas las filas** → el bucle de experimentos
   (`experiments/check-results`) que mide "la fecha que encarecimos, ¿se reservó?" está **ciego**.
3. **`available=0` ≠ vendido.** Una reserva larga preexistente (12 noches) tapó la ventana y se
   confundió con "100% ocupado / el precio funciona". Falso positivo.

**Objetivo:** un agente autónomo (cron en la app, persistente, no efímero) que vigile el/los pilotos,
distinga señal de ruido, y avise por email + push — **sin tocar precio salvo con red de seguridad**.

## Alcance aprobado por Alberto: "lo más completo"

Parte A (instrumentación, bloqueante) + Parte B (agente) + extras 1-6.

---

## Parte A — Arreglar la instrumentación (bloqueante)

### A1. Horizonte del snapshot 7 → 60 días
`app/api/rates/snapshot` (cron 07:00) debe capturar `rate_date` de hoy a **+60 días** por piso, no +7.
Verificar contra Smoobu que la API devuelve ese rango; si pagina, iterar.

### A2. Rellenar `was_booked`
Cruzar `rate_snapshots.rate_date` con `incomes` (`checkIn`/`checkOut` por `propertyId` → `property_id`
del piso) y marcar `was_booked=true` en las fechas cubiertas por una reserva, guardando también el
**precio al que se reservó** (de `incomes.amount`/`nights`). Backfill histórico + mantenimiento diario.
Cuidado con el mapeo de id: `rate_snapshots.property_id` (p.ej. `prop_busto_reform`) vs
`incomes.propertyId` (id de `properties`); se resuelve por `properties.smoobuId`/nombre.

---

## Parte B — Agente: cron `pricing/pilot-track`

**Endpoint:** `GET/POST /api/pricing/pilot-track` · **Cron:** ~09:15 hora Sevilla (`vercel.json`).
**Auth:** `lib/cron-auth.ts` (`CRON_SECRET` o sesión admin), igual que el resto de crons de pricing.
**Excluir del middleware** (como el resto de `/api/pricing/*`).

Por cada piso con piloto activo (`pricing_settings.enabled=true` + flag de piloto), calcula:

| Métrica | Fuente | Nota |
|---|---|---|
| Reservas nuevas desde el cambio | `incomes.createdAt ≥ fecha de subida` (de `pricing_applied`) | KPI principal |
| Días consecutivos sin reserva (sobre fechas LIBRES) | `rate_snapshots` (extra #1) | dispara veredicto |
| Ocupación a 60d | `rate_snapshots` (A1) | ya bien medida |
| Ingreso/noche vs baseline | `incomes` pre-piloto / año anterior | |
| ¿Precio se mantiene? | reusa `guard` (`pricing_applied` vs `price_pricelabs`) | reversión PriceLabs |

**Veredicto** por piso: 🟢 funciona · 🟡 sin señal aún · 🔴 demanda cayó (≥ **7 días** sin reserva
sobre fechas libres a precio nuevo; umbral por piso, default 7, alineado con el análisis del 16/06).

Persiste una fila diaria en tabla nueva **`pricing_pilot_tracking`** (histórico para la curva) y
manda **email + push** vía `lib/pricing-notify.ts` (sin infra nueva). Tarjeta **"Seguimiento del
piloto"** en `/pricing-auto` con la curva y el veredicto.

---

## Extras (1-6, todos incluidos)

1. **Anti-falso-🔴.** "Días sin reserva" se mide **solo sobre fechas que estaban libres** (excluye las
   tapadas por reservas largas). Evita el falso positivo de hoy.
2. **Watchdog del pipeline.** Avisa si: un cron no corrió (último `snapshot_date`/`pricing_applied`
   viejo), el snapshot vino vacío, o el `ingest` de mercado (`market_rates`) está obsoleto. "El agente
   que vigila al agente" (ya hubo crons silenciosamente caídos por el middleware).
3. **€ extra vs PriceLabs.** Reusa `/api/pricing/resultados`: reporta a diario "+X€ / −X€ vs el precio
   viejo". Métrica de venta del producto.
4. **Diagnóstico de POR QUÉ no se reserva.** Al saltar el umbral, compara nuestro **precio-huésped** vs
   el **mercado en esas mismas fechas** (`market_rates`; refresco vía conectores Booking/Trivago por
   `ingest`): distingue "estamos caros" de "esas fechas no tienen demanda ni para la competencia".
5. **Booking pace.** Ritmo de reservas vs el año anterior a los mismos días-vista (de `incomes` +
   `pricing_pilot_tracking` histórico). Señal temprana, mejor que la ocupación puntual.
6. **Auto-bajada con red (gated).** Si se supera el umbral sin reservas, el agente **propone** un
   escalón de bajada hacia el mercado. **Solo aplica** (escribe en Smoobu) si el piso tiene
   `apply_enabled=true`, dentro de `max_change_pct` y **nunca por debajo de `min_price`** (suelo de
   coste). Reusa `/api/pricing/apply`. Por defecto: solo propone + avisa; aplicar exige los flags
   existentes. No se inventa salvaguarda nueva.

---

## Componentes y límites

- `app/api/pricing/pilot-track/route.ts` — orquesta; **solo lee + escribe tracking + notifica**;
  delega cálculo de € en `resultados`, reversión en `guard`, aplicación en `apply`.
- `lib/pilot-track.ts` — lógica pura de métricas/veredicto (testeable sin DB/red).
- Migración: `pricing_pilot_tracking` (fila diaria por piso) + columnas de piloto en `pricing_settings`
  si hacen falta (`pilot_enabled`, `pilot_no_booking_threshold` default 7).
- Reusa sin duplicar: `lib/pricing-notify.ts`, `lib/cron-auth.ts`, `/api/pricing/resultados`,
  `/api/pricing/guard`, `/api/pricing/apply`.

## Lo que NO se hace (YAGNI)
- No se crea infra de notificación nueva (se reusa email+push existentes).
- El agente no cambia precio por sí mismo salvo el camino gated de #6 con los flags ya existentes.
- No se toca RLS / buckets / GRANTs (BD compartida con ialimp).

## Verificación
- `lib/pilot-track.ts`: tests unitarios del veredicto (incl. caso "reserva larga tapa la ventana" →
  NO 🔴) y del cálculo de días-sin-reserva.
- Snapshot a 60d: verificar contra Smoobu real en preview (no solo `tsc`).
- `was_booked`: verificar el backfill contra `incomes` reales de Busto Reform en Supabase.
- Dry-run del endpoint en preview antes de habilitar el cron.

## Envs / despliegue
- Ya requeridos por el módulo: `CRON_SECRET` (¡definir en prod antes de mergear!), VAPID push.
- Cron nuevo en `vercel.json` (~09:15). Excluir ruta del middleware.
</content>
</invoke>
