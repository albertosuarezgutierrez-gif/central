# Spec — Cobros de grupo: comisión configurable por restaurante + ahorro de costes

Fecha: 2026-06-05 · Estado: aprobado el diseño (pendiente review del spec)

## 1. Contexto y problema

Los **cobros de grupo** (`/cobro/[slug]`, eventos/congresos) usan **destination charges**
de Stripe Connect: ia.rest es el comercio ante Stripe, **paga la comisión de Stripe**,
se queda el `application_fee` y transfiere el resto a la cuenta del restaurante.

- Stripe España: **1,5 % + 0,25 €** por cobro (tarjeta EEE). No-EEE/Amex: 2,5 %+; conversión +2 %.
- Comisión actual de ia.rest: **1 %** (`application_fee = totalBase * 0.01`), y el toggle
  `repercutir_comision` usa **2,5 % hardcodeado** (`COMISION_TOTAL = 0.025`).
- Resultado: `1% − (1,5% + 0,25€)` = **siempre negativo**. Balance plataforma verificado: **−5,85 €**.

Además, los cobros de grupo **no alimentan** `resumen_cobros_mensual` (sí lo hace el cobro QR vía
RPC `registrar_pago_cobro`), por eso el panel `/super → Cobro` (vista `v_cobro_resumen_super`)
muestra **0 €** para Saboga.

## 2. Objetivos

1. Que ia.rest **nunca pierda** (y gane un margen) en cada cobro de grupo.
2. **Comisión configurable POR RESTAURANTE** desde `/super` (% + fijo + mínimo).
3. **Quién paga** la comisión: configurable por portal (toggle `repercutir_comision` ya existe).
4. **Mínimo por producto** configurable (guardarraíl).
5. **Email de cierre al dueño** con pagados + pendientes (para organizar y reclamar).
6. **Recordatorio automático** a invitados que dejaron el pago a medias (recupera ventas).
7. `/super → Cobro` muestra el **margen real** (los cobros de grupo alimentan el resumen).

## 3. No-objetivos (v2 / fuera de alcance)

- "Cuenta tab" cobrada al cierre por persona (guardar tarjeta + cobro off-session).
- Política de reembolsos (solo anotada: **Stripe no devuelve sus comisiones en un refund** →
  una devolución cuesta dinero; decidir más adelante quién la asume).
- Detección de marca de tarjeta para tarifa exacta (se cubre con "colchón" en la config).
- Unificar el modelo de comisión del cobro QR (se mantiene como está).

## 4. Modelo económico

Fórmula única (en `lib/cobros-comision.ts`):

```
comision = pct · baseTotal + fija     // la parte fija, UNA vez por pago (no por menú)
```

Flujo destination charge (`T` = total cobrado al invitado):

| Modo (`repercutir_comision`) | Invitado paga `T` | `application_fee` | Restaurante recibe |
|---|---|---|---|
| **ON**  | `base + comision` (línea "Gastos de gestión") | `comision` | `base` íntegro |
| **OFF** | `base` | `comision` | `base − comision` |

Plataforma neto = `comision − (1,5%·T + 0,25)`. Con `pct ≥ 2 %` y `fija ≥ 0,35 €` es **siempre > 0**
y crece con el ticket. Ejemplos (2 % + 0,35 €): café 10 € → **+0,10 €** (antes −0,30); menú 40 € → **+0,30 €**.

**Colchón tarjetas caras:** sin detección de marca en v1; se absorbe subiendo `pct`/`fija` en la config.
Defaults de plataforma con margen suficiente.

## 5. Datos / esquema

- `cobro_config` (ya existe, 1 fila por restaurante) — añadir columnas **nullable**:
  - `comision_pct numeric(5,3)` (ej. 2.0)
  - `comision_fija_eur numeric(6,2)` (ej. 0.35)
  - `minimo_producto_eur numeric(8,2)` (ej. 3.00)
  - Si `null` → **fallback a defaults de plataforma** (constantes en `lib/cobros-comision.ts`).
- `cobros_grupo` — añadir `email_cierre_enviado boolean NOT NULL DEFAULT false`.
- `cobros_grupo_pagos` — añadir `recordatorio_enviado_at timestamptz` (idempotencia del recordatorio).
- `cobros_grupo.repercutir_comision` — se mantiene (quién paga, por portal).

Migraciones vía MCP Supabase (entorno web). `ALTER ... ADD COLUMN IF NOT EXISTS`.

## 6. Componentes y cambios

1. **`lib/cobros-comision.ts`** (nuevo, fuente única de la fórmula, testeable aislado):
   `PLATAFORMA_DEFAULT = { pct: 2.0, fija: 0.35, minimo: 3 }`,
   `resolverConfig(cobroConfig)` (aplica fallback), `calcularComision(baseTotal, cfg)`.
2. **`/api/cobros/[slug]/checkout`**: leer `cobro_config` del restaurante del portal; calcular
   `comision`; si `repercutir` → añadir line item "Gastos de gestión" = `comision`;
   `application_fee_amount = round(comision*100)`; eliminar `COMISION_TOTAL` hardcode.
   (Mantener el fix `pago_ids` + try/catch ya en producción.)
3. **`/api/cobros/[slug]` (GET)**: `precio_final_eur` mostrado al invitado con la fórmula nueva.
4. **Validación mínimo**: `/api/owner/cobros` (POST) y `/[id]/items` (PUT) rechazan precio < mínimo del restaurante.
5. **Webhook `stripe-connect`** (`checkout.session.completed`): al marcar pagado, llamar
   `registrar_pago_cobro(restaurante_id, importe, comision)` para que el cobro de grupo cuente
   en `resumen_cobros_mensual` → aparezca en `/super`. Idempotente (solo filas recién pagadas).
6. **`/super → Cobro`**:
   - UI: editar comisión por restaurante (pct, fija, mínimo) + ver volumen y **comisión ganada**.
   - API: `GET/POST /api/super/cobro-config-comision` (auth super_admin) leer/guardar en `cobro_config`.
7. **Email de cierre** — `lib/email.ts`: `enviarEmailCierreCobros({restaurante, portal, pagados, pendientes})`
   (sigue el patrón `enviarEmail*` + `layout()`). Disparo por **cron**: portales con
   `fecha_limite_pago` pasada, `estado='cerrado'`, `email_cierre_enviado=false` → arma resumen →
   envía a `restaurantes.email_contacto` → marca enviado. Sin email → log y skip (no rompe).
8. **Recordatorio a pagos a medias** — **cron**: portales activos con `fecha_limite_pago` próxima
   (< 24 h) → filas `pendiente` con contacto y `recordatorio_enviado_at IS NULL` → email Resend
   ("te quedó el pago a medias" + link al portal) → marca `recordatorio_enviado_at`.
   WhatsApp opcional si `whatsappConfigurado()`.

Crons: reutilizar un cron existente con cadencia adecuada o añadir entradas en `vercel.json`
(decisión de detalle en el plan; candidatos: un `cron/cobros-eventos` diario).

## 7. Flujo de datos

```
checkout → cobro_config(restaurante) → calcularComision()
        → Stripe session (items + "Gastos de gestión" si repercutir; application_fee=comision)
        → webhook completed → marca pagado (pago_ids) + registrar_pago_cobro()
        → /super refleja volumen + comisión ganada
cron cierre      → email al dueño (pagados + pendientes)
cron recordatorio→ email a invitados con pago a medias (antes del límite)
```

## 8. Errores y bordes

- `cobro_config` sin fila o con nulls → defaults de plataforma.
- Restaurante sin `email_contacto` → log + skip (no romper el cron).
- Idempotencia: `email_cierre_enviado`, `recordatorio_enviado_at`.
- La purga de pendientes (>48 h, ya en prod) no choca: el recordatorio se dispara por proximidad a
  `fecha_limite_pago`, no por edad de la fila.
- Tarjetas caras (no-EEE/Amex): cubiertas por colchón en la config; sin detección de marca en v1.

## 9. Testing / verificación

- **Unit** `calcularComision`: 10 €, 40 €, repercutir on/off, defaults vs config → neto plataforma > 0.
- `npx tsc --noEmit` + `npx next build` verdes (regla del proyecto: build real, no solo tsc).
- **Manual**: editar comisión en `/super`; crear portal; pago de prueba multi-menú; ver margen en
  `/super`; forzar cron de cierre y de recordatorio.

## 10. Decisiones tomadas

- Comisión **por restaurante** (no global) — fila en `cobro_config`, fallback a defaults de plataforma.
- "Quién paga" **por portal** (toggle existente), con la fórmula nueva (`% + fijo`).
- Alcance: las 4 piezas (comisión + email cierre + recordatorio + panel `/super` con margen).
- v2 aparcado: tab/charge-at-close y política de reembolsos.
