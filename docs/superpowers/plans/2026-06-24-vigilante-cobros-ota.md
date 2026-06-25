# Vigilante de cobros OTA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar en el dashboard de plataforma cuando una reserva OTA (Booking/Airbnb/Expedia) hizo check-out hace más del margen del canal y Booking/Airbnb/Expedia aún no ha pagado.

**Architecture:** Lógica pura testeable (`reconciliarCobrosOTA`) que empareja reservas vencidas ↔ abonos del banco por importe+fecha (margen tomado del canal de la RESERVA, no del abono). Una función con BD (`getEstadoCobrosOTA`) que alimenta a la pura desde `incomes` + `movimientos_bancarios`. Se engancha al `getAlertas` existente y se pinta en el `AlertasBanner` del dashboard. Sin tablas, crons ni envs nuevos.

**Tech Stack:** Next.js 15 (App Router, RSC), Prisma `$queryRaw` (Supabase compartida), tests `node --test` (type-stripping, Node ≥22), CSS variables (sin Tailwind).

**Spec:** `docs/superpowers/specs/2026-06-24-vigilante-cobros-ota-design.md`

---

## File Structure

- **Create** `apps/plataforma/lib/sivra/cobros-ota.ts` — tipos + lógica pura `reconciliarCobrosOTA` + lectura BD `getEstadoCobrosOTA`. Responsabilidad única: estado de cobros OTA.
- **Create** `apps/plataforma/lib/sivra/cobros-ota.test.ts` — tests `node --test` de la lógica pura.
- **Modify** `apps/plataforma/lib/banca.ts` — `type Alertas` + `getAlertas()` para incluir `cobrosOTA`.
- **Modify** `apps/plataforma/app/(usuario)/dashboard/page.tsx` — default de `safe(getAlertas…)` + `AlertasBanner`.

---

## Task 1: Lógica pura de reconciliación + tipos

**Files:**
- Create: `apps/plataforma/lib/sivra/cobros-ota.ts`
- Test: `apps/plataforma/lib/sivra/cobros-ota.test.ts`

- [ ] **Step 1: Escribir el fichero con tipos y función pura**

Crea `apps/plataforma/lib/sivra/cobros-ota.ts` con exactamente este contenido (la parte pura; la BD se añade en Task 2):

```ts
// lib/sivra/cobros-ota.ts — vigilante de cobros OTA (Booking/Airbnb/Expedia).
// Empareja reservas con check-out pasado contra los abonos del banco para detectar dinero que
// las OTAs ya deberían haber pagado y no ha entrado. La parte pura (reconciliarCobrosOTA) no toca
// BD y se testea con node --test. Decisión de diseño: el canal del abono NO se puede deducir con
// fiabilidad (los cobros del Dúplex llegan con concepto genérico "ABONO... LIQ. OP.") → el match es
// OTA-wide por importe+fecha, y el margen lo aporta el canal de la RESERVA (fiable, de incomes.portal).

export type CanalOTA = 'BOOKING' | 'AIRBNB' | 'EXPEDIA'

export interface ReservaOTA {
  reservationId: string
  canal: CanalOTA
  guestName: string | null
  checkOut: string // 'YYYY-MM-DD'
  neto: number
}

export interface AbonoOTA {
  fecha: string // 'YYYY-MM-DD'
  importe: number
}

export interface ConfigCobros {
  margenDias: Record<CanalOTA, number>
  umbralEur: number
  toleranciaEur: number
}

// Booking/Airbnb pagan a los pocos días del checkout; Expedia ~1 mes después.
export const CONFIG_COBROS_DEFAULT: ConfigCobros = {
  margenDias: { BOOKING: 7, AIRBNB: 7, EXPEDIA: 35 },
  umbralEur: 50,
  toleranciaEur: 0.02,
}

export interface Pendiente {
  reservationId: string
  guestName: string | null
  checkOut: string
  neto: number
  canal: CanalOTA
}

export interface ResultadoCobros {
  hayDescuadre: boolean
  pendientes: Pendiente[]
  huerfanos: AbonoOTA[]
  pendientesEur: number
  huerfanosEur: number
}

// Suma una cantidad de días a una fecha 'YYYY-MM-DD' (en UTC, sin tocar zona horaria).
function addDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function reconciliarCobrosOTA(
  reservas: ReservaOTA[],
  abonos: AbonoOTA[],
  hoy: string, // 'YYYY-MM-DD'
  config: ConfigCobros = CONFIG_COBROS_DEFAULT,
): ResultadoCobros {
  // Reservas ya terminadas (checkout pasado), de más antigua a más reciente.
  const vencidas = reservas
    .filter(r => r.checkOut <= hoy)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))
  // Abonos ordenados por fecha asc para emparejar con el más antiguo que encaje.
  const abonosOrd = [...abonos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const usado = new Array(abonosOrd.length).fill(false)
  const matched = new Set<number>()

  vencidas.forEach((r, ri) => {
    const limite = addDias(r.checkOut, config.margenDias[r.canal])
    const idx = abonosOrd.findIndex((a, ai) =>
      !usado[ai] &&
      Math.abs(a.importe - r.neto) <= config.toleranciaEur &&
      a.fecha >= r.checkOut && a.fecha <= limite,
    )
    if (idx >= 0) { usado[idx] = true; matched.add(ri) }
  })

  // Pendiente = reserva vencida, sin abono, y que YA pasó su margen (si está dentro de plazo, no avisa).
  const pendientes: Pendiente[] = vencidas
    .map((r, ri) => ({ r, ri }))
    .filter(({ r, ri }) => !matched.has(ri) && addDias(r.checkOut, config.margenDias[r.canal]) < hoy)
    .map(({ r }) => ({
      reservationId: r.reservationId, guestName: r.guestName,
      checkOut: r.checkOut, neto: r.neto, canal: r.canal,
    }))

  const huerfanos: AbonoOTA[] = abonosOrd.filter((_, ai) => !usado[ai])
  const pendientesEur = round2(pendientes.reduce((s, p) => s + p.neto, 0))
  const huerfanosEur = round2(huerfanos.reduce((s, a) => s + a.importe, 0))
  // v1: dispara SOLO por pendientes (dinero que debían pagar). Huérfanos = contexto, no disparo.
  const hayDescuadre = pendientesEur > config.umbralEur

  return { hayDescuadre, pendientes, huerfanos, pendientesEur, huerfanosEur }
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `apps/plataforma/lib/sivra/cobros-ota.test.ts`:

```ts
// Tests de la lógica pura de cobros OTA. Runner: `node --test` (type-stripping, Node >=22).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reconciliarCobrosOTA, type ReservaOTA, type AbonoOTA } from './cobros-ota.ts'

const HOY = '2026-06-24'

function reserva(p: Partial<ReservaOTA> & { reservationId: string; checkOut: string; neto: number }): ReservaOTA {
  return { canal: 'BOOKING', guestName: 'Test', ...p }
}

test('reserva pagada (abono que casa importe+fecha) → no pendiente', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 200 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-12', importe: 200 }]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.huerfanos.length, 0)
})

test('reserva con checkout pasado de margen y sin abono → pendiente y descuadre', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 200 })] // +7d = 17, < 24
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, true)
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].reservationId, 'A')
  assert.equal(r.pendientesEur, 200)
})

test('reserva reciente DENTRO del margen → no avisa aunque no haya abono', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-22', neto: 200 })] // +7d = 29 > 24
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('Expedia usa margen largo (35d): a 20 días aún no avisa', () => {
  const reservas = [reserva({ reservationId: 'A', canal: 'EXPEDIA', checkOut: '2026-06-04', neto: 200 })] // +35 = jul9
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('importe por debajo del umbral (50€) no dispara', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 40 })]
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 1) // sí es pendiente, pero por debajo de umbral no avisa
})

test('mismo importe en dos reservas: cada abono se usa una sola vez', () => {
  const reservas = [
    reserva({ reservationId: 'A', checkOut: '2026-06-05', neto: 150 }),
    reserva({ reservationId: 'B', checkOut: '2026-06-06', neto: 150 }),
  ]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-08', importe: 150 }] // solo cubre una
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 1) // la otra queda pendiente
  assert.equal(r.huerfanos.length, 0)
})

test('abono sin reserva que case → huérfano (pero NO dispara solo en v1)', () => {
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-10', importe: 999 }]
  const r = reconciliarCobrosOTA([], abonos, HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.huerfanos.length, 1)
  assert.equal(r.huerfanosEur, 999)
})

test('tolerancia de céntimos: 200.01 casa con 200.00', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 200 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-12', importe: 200.01 }]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 0)
})
```

- [ ] **Step 3: Ejecutar los tests y verificar que pasan**

Run: `cd apps/plataforma && node --test lib/sivra/cobros-ota.test.ts`
Expected: PASS (8 tests). (Node ≥22 hace type-stripping de `.ts`; es el mismo runner que `lib/destino.test.ts`.)

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/sivra/cobros-ota.ts apps/plataforma/lib/sivra/cobros-ota.test.ts
git commit -m "feat(plataforma/cobros-ota): lógica pura de reconciliación de cobros OTA + tests"
```

---

## Task 2: Lectura de datos `getEstadoCobrosOTA`

**Files:**
- Modify: `apps/plataforma/lib/sivra/cobros-ota.ts` (añadir al final; importa `prisma` + `Prisma`)

- [ ] **Step 1: Añadir imports al principio del fichero**

Al inicio de `apps/plataforma/lib/sivra/cobros-ota.ts`, **encima** del comentario de cabecera, añade:

```ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
```

- [ ] **Step 2: Añadir la función con BD al final del fichero**

Pega al final de `apps/plataforma/lib/sivra/cobros-ota.ts`:

```ts
// Lee reservas OTA vencidas (últimos 120 d) y abonos OTA del banco (últimos 160 d, scoped por cuenta)
// y devuelve el estado de cobros. Los abonos NO se clasifican por canal (ver nota de cabecera).
export async function getEstadoCobrosOTA(cuentaId: string): Promise<ResultadoCobros> {
  const hoy = new Date().toISOString().slice(0, 10)

  const [resRows, abonoRows] = await Promise.all([
    prisma.$queryRaw<Array<{ reservationId: string; canal: string; guestName: string | null; checkOut: Date; neto: number }>>(Prisma.sql`
      SELECT "reservationId", portal AS canal, "guestName", "checkOut", amount::float AS neto
      FROM incomes
      WHERE portal IN ('BOOKING', 'AIRBNB', 'EXPEDIA')
        AND "checkOut" IS NOT NULL
        AND "checkOut"::date <= ${hoy}::date
        AND "checkOut"::date >= (${hoy}::date - INTERVAL '120 days')
        AND amount IS NOT NULL
    `),
    prisma.$queryRaw<Array<{ fecha: Date; importe: number }>>(Prisma.sql`
      SELECT mb.fecha_operacion AS fecha, mb.importe::float AS importe
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.importe > 0
        AND mb.destino IN ('turistico_duplex', 'turistico_pisos')
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion >= (${hoy}::date - INTERVAL '160 days')
    `),
  ])

  const reservas: ReservaOTA[] = resRows.map(r => ({
    reservationId: r.reservationId,
    canal: r.canal as CanalOTA,
    guestName: r.guestName,
    checkOut: new Date(r.checkOut).toISOString().slice(0, 10),
    neto: Number(r.neto),
  }))
  const abonos: AbonoOTA[] = abonoRows.map(a => ({
    fecha: new Date(a.fecha).toISOString().slice(0, 10),
    importe: Number(a.importe),
  }))

  return reconciliarCobrosOTA(reservas, abonos, hoy)
}
```

- [ ] **Step 3: Verificar que la lógica pura sigue verde**

Run: `cd apps/plataforma && node --test lib/sivra/cobros-ota.test.ts`
Expected: PASS (8 tests) — añadir la función BD no rompe la pura. (El typecheck real del import de Prisma lo valida el build de Vercel en el PR; aquí no hay `node_modules`.)

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/sivra/cobros-ota.ts
git commit -m "feat(plataforma/cobros-ota): lectura de incomes + movimientos_bancarios (getEstadoCobrosOTA)"
```

---

## Task 3: Enganchar en `getAlertas`

**Files:**
- Modify: `apps/plataforma/lib/banca.ts` (`type Alertas` ~355-361; `getAlertas` return ~404-414)

- [ ] **Step 1: Importar el tipo y la función al principio de `lib/banca.ts`**

Tras los imports existentes de `lib/banca.ts`, añade:

```ts
import { getEstadoCobrosOTA, type Pendiente } from './sivra/cobros-ota'
```

- [ ] **Step 2: Extender el tipo `Alertas`**

En `apps/plataforma/lib/banca.ts`, sustituye el bloque `export type Alertas = { … }` por:

```ts
export type Alertas = {
  porRevisar: number
  sinJustificante: number
  duplicados: number
  duplicadosDetalle: Array<{ concepto: string; importe: number; fecha: string | null }>
  facturasFaltantes: number
  cobrosPendientes: number              // nº de reservas OTA con cobro pendiente pasado de margen
  cobrosPendientesEur: number           // € que faltan por cobrar
  cobrosDetalle: Pendiente[]            // hasta 3 reservas citadas en el banner
}
```

- [ ] **Step 3: Calcular el estado de cobros dentro de `getAlertas`**

En `getAlertas`, añade `getEstadoCobrosOTA(cuentaId)` al `Promise.all` y úsalo en el return. Sustituye el `const [rev, sinJustif, grupos, registrosPrev] = await Promise.all([ … ])` por la versión con un quinto elemento:

```ts
  const [rev, sinJustif, grupos, registrosPrev, cobros] = await Promise.all([
    // (… las 4 queries existentes SIN CAMBIOS …)
    getEstadoCobrosOTA(cuentaId),
  ])
```

(Inserta `getEstadoCobrosOTA(cuentaId),` como último elemento del array, tras la query de `facturas_drive`.)

- [ ] **Step 4: Añadir los campos al objeto `return` de `getAlertas`**

En el `return { … }` final de `getAlertas`, añade tras `facturasFaltantes,`:

```ts
    cobrosPendientes: cobros.hayDescuadre ? cobros.pendientes.length : 0,
    cobrosPendientesEur: cobros.hayDescuadre ? cobros.pendientesEur : 0,
    cobrosDetalle: cobros.hayDescuadre ? cobros.pendientes.slice(0, 3) : [],
```

- [ ] **Step 5: Verificar la lógica pura (no se rompió nada importable)**

Run: `cd apps/plataforma && node --test lib/sivra/cobros-ota.test.ts`
Expected: PASS (8 tests). (El typecheck de `banca.ts` lo valida el build de Vercel en el PR.)

- [ ] **Step 6: Commit**

```bash
git add apps/plataforma/lib/banca.ts
git commit -m "feat(plataforma/banca): getAlertas incluye cobros OTA pendientes"
```

---

## Task 4: Pintar el aviso en el dashboard

**Files:**
- Modify: `apps/plataforma/app/(usuario)/dashboard/page.tsx` (default del `safe(getAlertas…)` ~191; `AlertasBanner` ~508-545)

- [ ] **Step 1: Actualizar el valor por defecto de `safe(getAlertas…)`**

En `apps/plataforma/app/(usuario)/dashboard/page.tsx` (~línea 191), el fallback de `safe(getAlertas(session.id), {…})` debe incluir los campos nuevos. Sustituye ese fallback por:

```ts
    safe(getAlertas(session.id), { porRevisar: 0, sinJustificante: 0, duplicados: 0, duplicadosDetalle: [], facturasFaltantes: 0, cobrosPendientes: 0, cobrosPendientesEur: 0, cobrosDetalle: [] }),
```

- [ ] **Step 2: Actualizar la guarda de `AlertasBanner` (no ocultar si hay cobros)**

En `AlertasBanner` (~línea 512), añade la condición de cobros al early-return. Sustituye la línea:

```ts
  if (alertas.porRevisar === 0 && alertas.sinJustificante === 0 && alertas.duplicados === 0 && alertas.facturasFaltantes === 0) return null
```

por:

```ts
  if (alertas.porRevisar === 0 && alertas.sinJustificante === 0 && alertas.duplicados === 0 && alertas.facturasFaltantes === 0 && alertas.cobrosPendientes === 0) return null
```

- [ ] **Step 3: Añadir la línea de aviso de cobros en `AlertasBanner`**

Dentro del JSX de `AlertasBanner`, **tras** el bloque `{alertas.facturasFaltantes > 0 && ( … )}` (~línea 545), añade:

```tsx
      {alertas.cobrosPendientes > 0 && (
        <div style={{ marginTop: 6 }}>
          💸 <strong>{fmtEur(alertas.cobrosPendientesEur)}</strong> sin cobrar de OTAs ({alertas.cobrosPendientes} {alertas.cobrosPendientes === 1 ? 'reserva' : 'reservas'} pasadas de plazo)
          {alertas.cobrosDetalle.length > 0 && (
            <> — {alertas.cobrosDetalle.map(c => `${c.guestName || c.reservationId} ${c.canal} (checkout ${c.checkOut.slice(8, 10)}/${c.checkOut.slice(5, 7)}, ${fmtEur(c.neto)})`).join(', ')}</>
          )}
        </div>
      )}
```

(`fmtEur` ya existe y se usa en el mismo componente. `Pendiente` se infiere del tipo `Alertas`; no hace falta importarlo en el page si ya importas `type Alertas`.)

- [ ] **Step 4: Verificar (build de Vercel en el PR)**

No hay `node_modules` local para `next build`/`tsc`. La verificación de tipos/JSX se hace en el **preview de Vercel** del PR (las 5 apps deben quedar Ready). Antes de commitear, revisa a ojo que: el fallback de `safe(...)` tiene los 8 campos, la guarda incluye `cobrosPendientes === 0`, y el bloque JSX usa `fmtEur` y campos existentes.

- [ ] **Step 5: Commit**

```bash
git add "apps/plataforma/app/(usuario)/dashboard/page.tsx"
git commit -m "feat(plataforma/dashboard): banner de cobros OTA pendientes"
```

---

## Task 5: Memoria + PR

- [ ] **Step 1: Anotar en `docs/CONTEXTO-SESIONES.md`** una entrada nueva arriba en "Estado actual" resumiendo: vigilante de cobros OTA (lógica pura + getAlertas + banner dashboard), márgenes 7/7/35d, umbral 50€, sin tablas. Mencionar el spec/plan en `docs/superpowers/`.

- [ ] **Step 2: Commit de memoria**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs(memoria): vigilante de cobros OTA"
```

- [ ] **Step 3: Push + PR draft**

```bash
git push -u origin claude/auto-respond-guest-messages-ai-syzmhb
```
Crear PR draft a `main` (vía MCP github) con resumen del spec. Verificar que el preview de Vercel deja `plataforma` en Ready. La verificación funcional la hace Alberto mirando su dashboard (o se simula creando una reserva OTA con checkout pasado sin abono).

---

## Notas de verificación

- **Tests pure:** `node --test lib/sivra/cobros-ota.test.ts` (8 casos) — única verificación ejecutable en este entorno.
- **Tipos/build:** los validan los previews de Vercel del PR (no hay `node_modules` local).
- **Falsos positivos:** el umbral de 50 € + tolerancia de céntimos + márgenes por canal están pensados para que el banner solo salte ante un descuadre real y persistente. Si en producción saltara con ruido, subir `umbralEur` o el margen del canal afectado en `CONFIG_COBROS_DEFAULT`.
