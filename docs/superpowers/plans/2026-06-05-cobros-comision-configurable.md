# Plan — Cobros: comisión configurable por restaurante + ahorro de costes

> Spec: `docs/superpowers/specs/2026-06-05-cobros-comision-configurable-design.md`
> Verificación del proyecto: `npx tsc --noEmit` + `npx next build` (no hay framework de tests;
> para la fórmula se añade un smoke script ejecutable con `npx tsx`).

**Goal:** que ia.rest gane en cada cobro de grupo, con comisión configurable por restaurante
desde `/super`, email de cierre al dueño, recordatorio a pagos a medias y panel con margen real.

**Branch:** `claude/price-discrepancy-480-280-bFj1E`

---

## Tarea 1 — Migración de esquema (Supabase MCP)
- `cobro_config`: `comision_pct numeric(5,3)`, `comision_fija_eur numeric(6,2)`, `minimo_producto_eur numeric(8,2)` (nullable).
- `cobros_grupo`: `email_cierre_enviado boolean NOT NULL DEFAULT false`.
- `cobros_grupo_pagos`: `recordatorio_enviado_at timestamptz`.
- Guardar copia en `supabase/migrations/20260605_cobros_comision_config.sql`.

## Tarea 2 — `lib/cobros-comision.ts` (fórmula, fuente única) + smoke
- `PLATAFORMA_DEFAULT = { pct: 2.0, fija: 0.35, minimo: 3 }`.
- `resolverComisionConfig(cfg?)` → aplica fallback a defaults.
- `calcularComision(baseTotalEur, cfg)` → `{ comisionEur, totalConRepercusionEur }`.
- `scripts/smoke-cobros-comision.ts`: casos 10/40 €, repercutir on/off, neto plataforma > 0.

## Tarea 3 — Checkout usa la config (`/api/cobros/[slug]/checkout`)
- Cargar `cobro_config` del restaurante del portal (`cobros_grupo.restaurante_id`).
- `comision = calcularComision(totalBase, cfg)`.
- repercutir ON → line item "Gastos de gestión" = comisión; OFF → no.
- `application_fee_amount = round(comisionEur*100)`. Quitar `COMISION_TOTAL`.

## Tarea 4 — GET portal (`/api/cobros/[slug]`) precio mostrado
- `precio_final_eur` con la comisión nueva (repercutir): prorratea la comisión por ítem o muestra
  el desglose; mantener `precio_base_eur`. Quitar `COMISION_TOTAL`.

## Tarea 5 — Mínimo por producto
- `/api/owner/cobros` POST y `/api/owner/cobros/[id]/items` PUT: rechazar `precio_eur < minimo`
  del `cobro_config` del restaurante (con default).

## Tarea 6 — Webhook alimenta el resumen (`/api/webhook/stripe-connect`)
- Al marcar pagado (filas recién pagadas), agrupar por restaurante, calcular comisión real y
  llamar RPC `registrar_pago_cobro(restaurante_id, importe, comision)`. Idempotente.

## Tarea 7 — `/super → Cobro`: editar comisión + ver margen
- API `GET/POST /api/super/cobro-config-comision` (auth super_admin, service role).
- UI en el tab Cobro de `src/app/super/page.tsx`: por restaurante, inputs pct/fija/mínimo + guardar;
  mostrar `comision_anio`/`comision_mes_actual` (ya en la vista) ahora que el webhook los rellena.

## Tarea 8 — Email de cierre (`lib/email.ts` + cron)
- `enviarEmailCierreCobros({ restaurante, portal, pagados, pendientes })` (patrón `enviarEmail*`).
- Cron `app/api/cron/cobros-eventos`: portales `estado='cerrado'` + `fecha_limite_pago` pasada +
  `email_cierre_enviado=false` → enviar a `restaurantes.email_contacto` → marcar. Sin email → skip+log.

## Tarea 9 — Recordatorio a pagos a medias (mismo cron)
- Portales activos con `fecha_limite_pago` < 24 h → filas `pendiente` con contacto y
  `recordatorio_enviado_at IS NULL` → email Resend con link → marcar `recordatorio_enviado_at`.

## Tarea 10 — `vercel.json` cron + verificación final
- Añadir `cron/cobros-eventos` (ej. `0 * * * *` cada hora; el cierre y el recordatorio toleran
  ventanas). `npx tsc --noEmit` + `npx next build` verdes. PR.
