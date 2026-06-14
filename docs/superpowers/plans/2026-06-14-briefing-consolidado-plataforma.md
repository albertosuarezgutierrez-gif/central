# Briefing consolidado (plataforma) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un cron semanal en `apps/plataforma` que, por cada cuenta, consolida ingresos/gastos/resultado YTD de **todos sus negocios** (ialimp+sivra por BD compartida, ia-rest por puerto HTTP) y envía un **briefing por email** al dueño.

**Architecture:** Lógica PURA en `lib/briefing.ts` (agregación + formato de texto, sin red ni BD → testeable con `node --test`). Endpoint `app/api/cron/briefing/route.ts` (GET, auth por `CRON_SECRET`) que carga cuentas+negocios por Prisma, reutiliza `getResumenNegocio` de `lib/financiero.ts` y envía con `enviarAvisoEmail` de `lib/notificaciones.ts` (Resend HTTP, sin deps nuevas). Cron en `vercel.json` (lunes 08:00) + exclusión en `middleware.ts`.

**Tech Stack:** Next.js 15 (App Router, route handler GET), Prisma 5 (modelos `Cuenta/Sociedad/Negocio`), Resend HTTP (email, ya usado por `notificaciones.ts`), tests `node --test` (type-stripping, Node 22).

**Reutiliza (no reinventar):**
- `lib/financiero.ts`: `getResumenNegocio(app, refExt, anio)` → `ResumenFinanciero` y `fmtEur(n)`.
- `lib/notificaciones.ts`: `enviarAvisoEmail(emails, asunto, cuerpo)` (no-op sin `RESEND_API_KEY`).
- `lib/db.ts`: `prisma`.
- Patrón de auth de cron de las otras apps: `authorization === \`Bearer ${process.env.CRON_SECRET}\``.

**Pendiente de despliegue (no testeable sin credenciales):** en el Vercel de `plataforma` definir `CRON_SECRET` (Bearer del cron) y `RESEND_API_KEY` + `MAIL_FROM` (envío real; sin ellos el cron corre y degrada limpio sin enviar).

---

### Task 1: Lógica pura del briefing (agregación + formato)

**Files:**
- Create: `apps/plataforma/lib/briefing.ts`
- Test: `apps/plataforma/lib/briefing.test.ts`

- [ ] **Step 1: Write the failing test**

Crea `apps/plataforma/lib/briefing.test.ts`:

```ts
// Tests de la lógica PURA del briefing consolidado. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { agregarBriefing, formatBriefingTexto, type NegocioResumen } from './briefing.ts'

const items: NegocioResumen[] = [
  { nombre: 'Sique Brilla', sector: 'limpieza', ingresosYtd: 1000, gastosYtd: 400, resultadoYtd: 600, disponible: true },
  { nombre: 'Busto Reform', sector: 'turístico', ingresosYtd: 2000, gastosYtd: 500, resultadoYtd: 1500, disponible: true },
  { nombre: 'Bar Pepe', sector: 'hostelería', ingresosYtd: 0, gastosYtd: 0, resultadoYtd: 0, disponible: false, nota: 'sin local vinculado' },
]

test('agregarBriefing: suma solo lo disponible y cuenta negocios', () => {
  const t = agregarBriefing(items)
  assert.equal(t.ingresos, 3000)
  assert.equal(t.gastos, 900)
  assert.equal(t.resultado, 2100)
  assert.equal(t.negocios, 3)
  assert.equal(t.disponibles, 2)
})

test('agregarBriefing: lista vacía da ceros', () => {
  const t = agregarBriefing([])
  assert.deepEqual(t, { ingresos: 0, gastos: 0, resultado: 0, negocios: 0, disponibles: 0 })
})

test('formatBriefingTexto: asunto con nombre y año, cuerpo con líneas y total', () => {
  const { asunto, cuerpo } = formatBriefingTexto('Alberto', items, agregarBriefing(items), 2026)
  assert.match(asunto, /Alberto/)
  assert.match(asunto, /2026/)
  assert.match(cuerpo, /Sique Brilla/)
  assert.match(cuerpo, /Busto Reform/)
  // negocio no disponible aparece con su nota, no con cifras
  assert.match(cuerpo, /Bar Pepe.*sin local vinculado/s)
  // total consolidado presente
  assert.match(cuerpo, /TOTAL/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/user/central/apps/plataforma && node --test lib/briefing.test.ts`
Expected: FAIL — `Cannot find module './briefing.ts'`.

- [ ] **Step 3: Write minimal implementation**

Crea `apps/plataforma/lib/briefing.ts`:

```ts
// Lógica PURA del briefing consolidado: agrega los resúmenes financieros de los
// negocios de una cuenta y compone el texto del email. Sin red ni BD → testeable
// con `node --test`. La E/S (Prisma, fetch financiero, Resend) vive en el endpoint.
import { fmtEur } from './financiero'

export type NegocioResumen = {
  nombre: string
  sector: string
  ingresosYtd: number
  gastosYtd: number
  resultadoYtd: number
  disponible: boolean
  nota?: string
}

export type BriefingTotales = {
  ingresos: number
  gastos: number
  resultado: number
  negocios: number
  disponibles: number
}

export function agregarBriefing(items: NegocioResumen[]): BriefingTotales {
  return items.reduce<BriefingTotales>((acc, n) => {
    acc.negocios += 1
    if (n.disponible) {
      acc.disponibles += 1
      acc.ingresos += n.ingresosYtd
      acc.gastos += n.gastosYtd
      acc.resultado += n.resultadoYtd
    }
    return acc
  }, { ingresos: 0, gastos: 0, resultado: 0, negocios: 0, disponibles: 0 })
}

export function formatBriefingTexto(
  nombreCuenta: string,
  items: NegocioResumen[],
  totales: BriefingTotales,
  anio: number,
): { asunto: string; cuerpo: string } {
  const asunto = `📊 Briefing semanal ${anio} — ${nombreCuenta}`
  const lineas = items.map(n =>
    n.disponible
      ? `• ${n.nombre} (${n.sector}): ${fmtEur(n.ingresosYtd)} ingresos − ${fmtEur(n.gastosYtd)} gastos = ${fmtEur(n.resultadoYtd)}`
      : `• ${n.nombre} (${n.sector}): sin datos${n.nota ? ` — ${n.nota}` : ''}`,
  )
  const cuerpo = [
    `Hola ${nombreCuenta}, este es el resumen de tus negocios (año ${anio}, acumulado):`,
    '',
    ...lineas,
    '',
    `TOTAL consolidado (${totales.disponibles}/${totales.negocios} con datos):`,
    `  Ingresos:  ${fmtEur(totales.ingresos)}`,
    `  Gastos:    ${fmtEur(totales.gastos)}`,
    `  Resultado: ${fmtEur(totales.resultado)}`,
  ].join('\n')
  return { asunto, cuerpo }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/user/central/apps/plataforma && node --test lib/briefing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/plataforma/lib/briefing.ts apps/plataforma/lib/briefing.test.ts
git commit -m "feat(plataforma): lógica pura del briefing consolidado + tests"
```

---

### Task 2: Endpoint cron del briefing

**Files:**
- Create: `apps/plataforma/app/api/cron/briefing/route.ts`

- [ ] **Step 1: Write the implementation**

Crea `apps/plataforma/app/api/cron/briefing/route.ts`:

```ts
// /api/cron/briefing — Briefing semanal consolidado por cuenta.
// Para cada cuenta: agrega ingresos/gastos/resultado YTD de TODOS sus negocios
// (ialimp+sivra por BD compartida, ia-rest por puerto HTTP — vía getResumenNegocio)
// y envía un email al dueño (Resend, vía enviarAvisoEmail). Auth: Bearer CRON_SECRET
// (o ?secret= para disparo manual). Degrada limpio sin RESEND_API_KEY.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getResumenNegocio } from '@/lib/financiero'
import { enviarAvisoEmail } from '@/lib/notificaciones'
import { agregarBriefing, formatBriefingTexto, type NegocioResumen } from '@/lib/briefing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const isCron = !!secret && auth === `Bearer ${secret}`
  const isManual = !!secret && req.nextUrl.searchParams.get('secret') === secret
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const anio = new Date().getFullYear()
  const cuentas = await prisma.cuenta.findMany({
    include: { sociedades: { include: { negocios: true } } },
  })

  let enviados = 0
  for (const cuenta of cuentas) {
    const negocios = cuenta.sociedades.flatMap(s => s.negocios)
    if (negocios.length === 0) continue

    const items: NegocioResumen[] = await Promise.all(
      negocios.map(async (n): Promise<NegocioResumen> => {
        const r = await getResumenNegocio(n.app, n.refExt, anio)
        return {
          nombre: n.nombre,
          sector: n.sector,
          ingresosYtd: r.ingresosYtd,
          gastosYtd: r.gastosYtd,
          resultadoYtd: r.resultadoYtd,
          disponible: r.disponible,
          nota: r.nota,
        }
      }),
    )

    const totales = agregarBriefing(items)
    const { asunto, cuerpo } = formatBriefingTexto(cuenta.nombre, items, totales, anio)
    await enviarAvisoEmail([cuenta.email], asunto, cuerpo)
    enviados += 1
  }

  return NextResponse.json({ ok: true, cuentas: cuentas.length, enviados, anio })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/user/central/apps/plataforma && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
cd /home/user/central
git add apps/plataforma/app/api/cron/briefing/route.ts
git commit -m "feat(plataforma): endpoint cron del briefing consolidado"
```

---

### Task 3: Programar el cron + excluir del middleware

**Files:**
- Modify: `apps/plataforma/vercel.json`
- Modify: `apps/plataforma/middleware.ts:6`

- [ ] **Step 1: Añadir el cron a `vercel.json`**

`apps/plataforma/vercel.json` no tiene clave `crons`. Añádela tras `installCommand`:

```json
{
  "buildCommand": "prisma generate && next build",
  "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/briefing",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

- [ ] **Step 2: Excluir `/api/cron` del gate de cuenta del middleware**

En `apps/plataforma/middleware.ts`, añade `/api/cron` al array `PUBLIC` (el endpoint se autoprotege con `CRON_SECRET`):

```ts
const PUBLIC = ['/login', '/register', '/api/auth', '/admin', '/api/admin', '/api/cron']
```

- [ ] **Step 3: Validar JSON + typecheck + build**

Run: `cd /home/user/central/apps/plataforma && node -e "require('./vercel.json')" && npx tsc --noEmit && npm run build`
Expected: JSON OK, 0 errores TS, build exitoso.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/plataforma/vercel.json apps/plataforma/middleware.ts
git commit -m "feat(plataforma): programar cron semanal del briefing (lunes 08:00) + exclusión de middleware"
```

---

### Task 4: Verificación final, push y PR

- [ ] **Step 1: Re-run tests + build limpio**

Run: `cd /home/user/central/apps/plataforma && node --test lib/briefing.test.ts && npx tsc --noEmit && npm run build`
Expected: tests PASS, 0 TS, build OK.

- [ ] **Step 2: Push**

```bash
cd /home/user/central
git push -u origin claude/agents-missing-schedules-u838j3
```

- [ ] **Step 3: Actualizar el PR existente (#201) o crear uno nuevo** según corresponda, y actualizar `docs/CONTEXTO-SESIONES.md` con una entrada del briefing consolidado.

---

## Self-Review

- **Spec coverage:** cron semanal ✅ (Task 3, `0 8 * * 1`), consolida todos los negocios por cuenta ✅ (Task 2 flatMap), 3 verticales vía `getResumenNegocio` ✅ (reutiliza el dispatcher de `financiero.ts`), envío por email ✅ (`enviarAvisoEmail`).
- **Placeholder scan:** sin TODOs ni "manejar errores apropiadamente"; código completo en cada step.
- **Type consistency:** `NegocioResumen` definido en Task 1 y consumido en Task 2; campos coinciden con `ResumenFinanciero` (`ingresosYtd/gastosYtd/resultadoYtd/disponible/nota`). `agregarBriefing`/`formatBriefingTexto` mismas firmas en test, impl y endpoint.
- **Reglas plataforma:** se itera por cuenta (multi-tenant ✅); ia-rest se lee por puerto HTTP (vía `getResumenNegocio`, no Prisma sobre `iarest.*`) ✅.
