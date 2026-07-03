# Agente de contabilidad conversacional — Fase 2 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: implementar tarea a tarea; un subagente fresco por tarea con revisión entre medias. Pasos con checkbox (`- [ ]`).

**Goal:** Que el agente `/contable` no solo informe, sino que **proponga acciones** que Alberto **confirma en pantalla** y entonces se ejecutan sobre `movimientos_bancarios` (clasificar destino + aprender regla, marcar amortizable, confirmar clasificación).

**Architecture:** El modelo emite un canal lateral `ACCION: {json}` (calcado del `APRENDER:` de la Fase 1) referenciando movimientos por un handle corto `#n`. El cerebro resuelve `#n`→id real, valida, y **persiste** cada acción propuesta en la tabla nueva `contable_accion` (estado `pendiente`). La UI muestra tarjetas Confirmar/Descartar; al confirmar, `POST /api/contable/accion` ejecuta **por id** (nunca confía en params del cliente) reutilizando los writers existentes (`aprenderReglaMovimiento`, UPDATEs de `/api/banca/*`). Read libre, **escritura confirmada**.

**Tech Stack:** Next.js 15 / React 19, Prisma raw SQL sobre Supabase compartida, `@central/core-ai`, tests `node --test`.

**Alcance de esta fase:** acciones sobre `movimientos_bancarios` — `clasificar` (destino + `propiedad_id` + aprende regla), `amortizable` (toggle), `confirmar` (aceptar destino actual). **Fuera de alcance** (fases posteriores): conciliar factura y gestionar pagos de proveedor (dependen de documentos/`facturas_proveedor`), y Telegram (Fase 4). Referencia: `docs/superpowers/specs/2026-07-03-agente-contabilidad-conversacional-design.md` §4.

**Base:** rama `claude/ai-accounting-agent-3a9o22` reiniciada desde `main` (Fase 1 ya mergeada, PR #726). Todo en `apps/plataforma`, scoped por `cuenta_id`.

---

## Estructura de ficheros

| Fichero | Cambio |
|---|---|
| `apps/plataforma/prisma/sql/2026-07-03_contable_accion.sql` | **Nuevo** — tabla de acciones propuestas/ejecutadas |
| `apps/plataforma/lib/contable/parse.ts` | **Modificar** — añadir `extraerAcciones` (canal `ACCION:`) |
| `apps/plataforma/lib/contable/parse.test.ts` | **Modificar** — tests de `extraerAcciones` |
| `apps/plataforma/lib/contable/acciones-tipos.ts` | **Nuevo** (puro) — validación + resumen de acciones |
| `apps/plataforma/lib/contable/acciones-tipos.test.ts` | **Nuevo** — tests del validador |
| `apps/plataforma/lib/contable/formato.ts` | **Modificar** — `CtxData.ultimos` → `candidatos` (con `#ref`+id) |
| `apps/plataforma/lib/contable/contexto.ts` | **Modificar** — devolver `{ texto, candidatos }` con ids |
| `apps/plataforma/lib/contable/contexto.test.ts` | **Modificar** — test del formateador con `candidatos` |
| `apps/plataforma/lib/contable/acciones.ts` | **Nuevo** — persistir + ejecutar acciones (DB) |
| `apps/plataforma/lib/contable/cerebro.ts` | **Modificar** — nuevo SYSTEM + parseo/persistencia de acciones |
| `apps/plataforma/app/api/contable/chat/route.ts` | **Modificar** — devolver `acciones` |
| `apps/plataforma/app/api/contable/accion/route.ts` | **Nuevo** — ejecutar/descartar acción confirmada |
| `apps/plataforma/app/(usuario)/contable/page.tsx` | **Modificar** — tarjetas de acción Confirmar/Descartar |

---

## Task 1: Migración `contable_accion`

**Files:** Create `apps/plataforma/prisma/sql/2026-07-03_contable_accion.sql`

- [ ] **Step 1: Escribir el fichero**

```sql
-- Acciones que el agente de contabilidad PROPONE y Alberto CONFIRMA (Fase 2).
-- Multi-tenant: scoped por cuenta_id. Aplicar como postgres (Supabase MCP).

CREATE TABLE IF NOT EXISTS contable_accion (
  id          BIGSERIAL PRIMARY KEY,
  cuenta_id   UUID NOT NULL,
  tipo        TEXT NOT NULL,                 -- clasificar | amortizable | confirmar
  params      JSONB NOT NULL,                -- {movId, concepto, destino?, propiedad?, valor?}
  resumen     TEXT,                          -- frase legible para la tarjeta de confirmación
  estado      TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | ejecutada | descartada | error
  resultado   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contable_accion_cuenta_estado ON contable_accion (cuenta_id, estado);
```

- [ ] **Step 2: Aplicar en Supabase**

Vía Supabase MCP `apply_migration` (name `contable_accion`, project `wswbehlcuxqxyinousql`) con ese SQL.

- [ ] **Step 3: Verificar**

`execute_sql`: `SELECT to_regclass('public.contable_accion');` → no nulo.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-03_contable_accion.sql
git commit -m "feat(contable): migración contable_accion (fase 2)"
```

---

## Task 2: Parser del canal `ACCION:` (puro, TDD)

**Files:** Modify `apps/plataforma/lib/contable/parse.ts`; Test `apps/plataforma/lib/contable/parse.test.ts`

- [ ] **Step 1: Añadir tests al final de `parse.test.ts`**

```ts
import { extraerAcciones } from './parse.ts'

test('extraerAcciones: sin línea ACCION → vacío, texto intacto', () => {
  const r = extraerAcciones('Te propongo clasificarlo.')
  assert.equal(r.limpio, 'Te propongo clasificarlo.')
  assert.deepEqual(r.acciones, [])
})

test('extraerAcciones: una acción → parseada y quitada del texto', () => {
  const r = extraerAcciones('Voy a clasificarlo.\nACCION: {"tipo":"clasificar","ref":"#3","destino":"turistico_pisos"}')
  assert.equal(r.limpio, 'Voy a clasificarlo.')
  assert.equal(r.acciones.length, 1)
  assert.equal(r.acciones[0].tipo, 'clasificar')
  assert.equal(r.acciones[0].ref, '#3')
  assert.equal(r.acciones[0].destino, 'turistico_pisos')
})

test('extraerAcciones: JSON sin "tipo" o mal formado → ignorado', () => {
  const r = extraerAcciones('X\nACCION: {"ref":"#1"}\nACCION: {roto')
  assert.deepEqual(r.acciones, [])
  assert.equal(r.limpio, 'X')
})

test('extraerAcciones: dos acciones', () => {
  const r = extraerAcciones('Ok.\nACCION: {"tipo":"clasificar","ref":"#1","destino":"personal"}\nACCION: {"tipo":"amortizable","ref":"#1","valor":true}')
  assert.equal(r.acciones.length, 2)
  assert.equal(r.limpio, 'Ok.')
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

Run: `cd apps/plataforma && node --test lib/contable/parse.test.ts`
Expected: FAIL — `extraerAcciones` no exportado.

- [ ] **Step 3: Añadir la implementación a `parse.ts`** (al final del fichero, tras `extraerAprendizajes`)

```ts
export type AccionCruda = {
  tipo?: string; ref?: string; destino?: string; propiedad?: string | null; valor?: boolean
}

export function extraerAcciones(texto: string): { limpio: string; acciones: AccionCruda[] } {
  const re = /ACCION:\s*(\{[\s\S]*?\})/g
  const acciones: AccionCruda[] = []
  for (const m of texto.matchAll(re)) {
    try {
      const o = JSON.parse(m[1])
      if (o && typeof o.tipo === 'string') acciones.push(o)
    } catch { /* mal formada: ignorar */ }
  }
  const limpio = texto.replace(/^[ \t]*ACCION:.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  return { limpio, acciones }
}
```

- [ ] **Step 4: Ejecutar y ver PASS**

Run: `cd apps/plataforma && node --test lib/contable/parse.test.ts`
Expected: PASS (los 5 de la Fase 1 + los 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/contable/parse.ts apps/plataforma/lib/contable/parse.test.ts
git commit -m "feat(contable): parser del canal ACCION (puro, con tests)"
```

---

## Task 3: Validación de acciones (puro, TDD)

**Files:** Create `apps/plataforma/lib/contable/acciones-tipos.ts`; Test `apps/plataforma/lib/contable/acciones-tipos.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
// apps/plataforma/lib/contable/acciones-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarAccion, resumenAccion } from './acciones-tipos.ts'

test('clasificar válida con propiedad', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'turistico_pisos', propiedad:'prop_house_sevillana' })
  assert.equal(r.ok, true)
  if (r.ok && r.accion.tipo === 'clasificar') assert.equal(r.accion.propiedad, 'prop_house_sevillana')
})

test('clasificar con propiedad inválida → propiedad null', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'personal', propiedad:'prop_x' })
  assert.equal(r.ok, true)
  if (r.ok && r.accion.tipo === 'clasificar') assert.equal(r.accion.propiedad, null)
})

test('clasificar con destino inválido → error', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'basura' })
  assert.equal(r.ok, false)
})

test('amortizable sin valor → true por defecto', () => {
  const r = validarAccion({ tipo:'amortizable', ref:'#1' })
  assert.equal(r.ok, true)
  if (r.ok && r.accion.tipo === 'amortizable') assert.equal(r.accion.valor, true)
})

test('confirmar válida', () => {
  const r = validarAccion({ tipo:'confirmar', ref:'#5' })
  assert.equal(r.ok, true)
})

test('sin ref → error', () => {
  const r = validarAccion({ tipo:'confirmar' })
  assert.equal(r.ok, false)
})

test('tipo desconocido → error', () => {
  const r = validarAccion({ tipo:'borrar', ref:'#1' })
  assert.equal(r.ok, false)
})

test('resumenAccion legible', () => {
  const s = resumenAccion({ tipo:'clasificar', ref:'#1', destino:'seguros', propiedad:null }, 'RECIBO IONOS')
  assert.match(s, /RECIBO IONOS/)
  assert.match(s, /Correduría/)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

Run: `cd apps/plataforma && node --test lib/contable/acciones-tipos.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `acciones-tipos.ts`** (puro, sin `@/`)

```ts
// apps/plataforma/lib/contable/acciones-tipos.ts
// Validación y resumen de las acciones que propone el agente. Puro y testeable.

export type AccionCruda = { tipo?: string; ref?: string; destino?: string; propiedad?: string | null; valor?: boolean }

export type AccionValida =
  | { tipo: 'clasificar'; ref: string; destino: string; propiedad: string | null }
  | { tipo: 'amortizable'; ref: string; valor: boolean }
  | { tipo: 'confirmar'; ref: string }

// destino permitido = el mismo set que valida POST /api/banca/destino (5 valores).
export const DESTINOS_ACCION = ['turistico_pisos', 'turistico_duplex', 'seguros', 'traspaso_interno', 'personal'] as const
export const PROPIEDADES = ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto', 'prop_duplex_center'] as const

const DEST_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos turísticos', turistico_duplex: 'Dúplex/Villasís',
  seguros: 'Correduría', traspaso_interno: 'Traspaso interno', personal: 'Personal',
}
const PROP_LABEL: Record<string, string> = {
  prop_house_sevillana: 'House Sevillana', prop_busto_reform: 'Busto Reform',
  prop_luxury_busto: 'Luxury Busto', prop_duplex_center: 'Dúplex Center',
}

export function validarAccion(a: AccionCruda): { ok: true; accion: AccionValida } | { ok: false; error: string } {
  const ref = typeof a.ref === 'string' ? a.ref.trim() : ''
  if (!ref) return { ok: false, error: 'falta ref del movimiento' }
  if (a.tipo === 'clasificar') {
    const destino = String(a.destino || '')
    if (!(DESTINOS_ACCION as readonly string[]).includes(destino)) return { ok: false, error: `destino no válido: ${destino}` }
    const propiedad = a.propiedad && (PROPIEDADES as readonly string[]).includes(a.propiedad) ? a.propiedad : null
    return { ok: true, accion: { tipo: 'clasificar', ref, destino, propiedad } }
  }
  if (a.tipo === 'amortizable') return { ok: true, accion: { tipo: 'amortizable', ref, valor: a.valor !== false } }
  if (a.tipo === 'confirmar') return { ok: true, accion: { tipo: 'confirmar', ref } }
  return { ok: false, error: `tipo no soportado: ${a.tipo}` }
}

export function resumenAccion(a: AccionValida, concepto: string): string {
  const c = (concepto || '').slice(0, 40)
  if (a.tipo === 'clasificar') {
    return `Clasificar «${c}» como ${DEST_LABEL[a.destino] || a.destino}${a.propiedad ? ` · ${PROP_LABEL[a.propiedad]}` : ''}`
  }
  if (a.tipo === 'amortizable') return `Marcar «${c}» como ${a.valor ? 'amortizable' : 'NO amortizable'}`
  return `Confirmar la clasificación de «${c}»`
}
```

- [ ] **Step 4: Ejecutar y ver PASS**

Run: `cd apps/plataforma && node --test lib/contable/acciones-tipos.test.ts` → PASS (8).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/contable/acciones-tipos.ts apps/plataforma/lib/contable/acciones-tipos.test.ts
git commit -m "feat(contable): validación y resumen de acciones (puro, con tests)"
```

---

## Task 4: Contexto con movimientos accionables (`#ref` + id)

**Files:** Modify `formato.ts`, `contexto.ts`, `contexto.test.ts`

El contexto de la Fase 1 NO expone ids de movimiento → el modelo no puede señalar cuál accionar. Sustituimos `ultimos` por `candidatos` (con `#ref`, id, y marca "por revisar"), que el modelo referencia en `ACCION`.

- [ ] **Step 1: Reescribir el test del formateador** (`contexto.test.ts`)

```ts
// apps/plataforma/lib/contable/contexto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearContexto } from './formato.ts'

test('formatea candidatos con #ref y marca por revisar', () => {
  const txt = formatearContexto({
    year: 2026,
    porDestino: [{ destino: 'turistico_pisos', gastos: 1200, ingresos: 5000 }],
    candidatos: [
      { ref: '#1', movId: 'uuid-a', fecha: '2026-07-01', concepto: 'RECIBO ENDESA', importe: -66.98, destino: 'turistico_pisos', porRevisar: true },
      { ref: '#2', movId: 'uuid-b', fecha: '2026-06-30', concepto: 'BIZUM', importe: -30, destino: 'personal', porRevisar: false },
    ],
    facturas: [{ proveedor: 'IONOS', importe: 12.1, estado: 'nueva' }],
    memoria: [{ clave: 'criterio_gasto', insight: 'Meter todo el gasto en el año' }],
    historial: [],
  })
  assert.match(txt, /#1 · 2026-07-01 · RECIBO ENDESA · -66\.98€/)
  assert.match(txt, /por revisar/)
  assert.match(txt, /#2 /)
  assert.match(txt, /\[criterio_gasto\] Meter todo el gasto en el año/)
})

test('sin candidatos → texto por defecto', () => {
  const txt = formatearContexto({ year: 2026, porDestino: [], candidatos: [], facturas: [], memoria: [], historial: [] })
  assert.match(txt, /sin movimientos/)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

Run: `cd apps/plataforma && node --test lib/contable/contexto.test.ts` → FAIL (`candidatos` no existe en `CtxData`).

- [ ] **Step 3: Editar `formato.ts`** — reemplazar el tipo `CtxData.ultimos` por `candidatos` y su render

Sustituir el `export type CtxData` y la sección "Últimos movimientos" del `formatearContexto` por:

```ts
export type Candidato = {
  ref: string; movId: string; fecha: string; concepto: string; importe: number; destino: string; porRevisar: boolean
}

export type CtxData = {
  year: number
  porDestino: { destino: string; gastos: number; ingresos: number }[]
  candidatos: Candidato[]
  facturas: { proveedor: string; importe: number; estado: string }[]
  memoria: { clave: string; insight: string }[]
  historial: { rol: string; mensaje: string }[]
}
```

Y dentro de `formatearContexto`, reemplazar la variable `ult` y su bloque por:

```ts
  const cand = d.candidatos.length
    ? d.candidatos.map(x =>
        `- ${x.ref} · ${x.fecha} · ${(x.concepto || '').slice(0, 50)} · ${Number(x.importe).toFixed(2)}€ [${DESTINO_LABEL[x.destino] || x.destino}]${x.porRevisar ? ' ⚠️ por revisar' : ''}`
      ).join('\n')
    : '- (sin movimientos recientes)'
```

Y en el template de retorno, cambiar la sección `# Últimos movimientos\n${ult}` por:

```
# Movimientos (usa el #ref para proponer una ACCION)
${cand}
```

*(El resto del formateador —porDestino, facturas, memoria, historial— no cambia. `DESTINO_LABEL` ya existe en formato.ts; se reutiliza para el destino del candidato.)*

- [ ] **Step 4: Editar `contexto.ts`** — devolver `{ texto, candidatos }` y consultar ids

Reemplazar la firma y el cuerpo de `construirContexto` por:

```ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getMemoria, getHistorial } from './memoria'
import { formatearContexto, type CtxData, type Candidato } from './formato'

export type { CtxData, Candidato } from './formato'
export { formatearContexto } from './formato'

export async function construirContexto(cuentaId: string): Promise<{ texto: string; candidatos: Candidato[] }> {
  const year = new Date().getFullYear()

  const porDestino = await prisma.$queryRaw<CtxData['porDestino']>(Prisma.sql`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           sum(CASE WHEN mb.importe < 0 THEN -mb.importe ELSE 0 END)::float8 AS gastos,
           sum(CASE WHEN mb.importe > 0 THEN  mb.importe ELSE 0 END)::float8 AS ingresos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    GROUP BY 1 ORDER BY 2 DESC`).catch(() => [])

  // Candidatos accionables: los "por revisar" primero, luego los recientes. Con id real.
  const rows = await prisma.$queryRaw<{ mov_id: string; fecha: string; concepto: string | null; importe: number; destino: string; por_revisar: boolean }[]>(Prisma.sql`
    SELECT mb.id::text AS mov_id, mb.fecha_operacion::text AS fecha,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.importe::float8 AS importe, coalesce(mb.destino, '?') AS destino,
           (mb.requiere_revision OR NOT coalesce(mb.destino_confirmado, false)) AS por_revisar
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    ORDER BY (mb.requiere_revision OR NOT coalesce(mb.destino_confirmado, false)) DESC, mb.fecha_operacion DESC
    LIMIT 12`).catch(() => [])
  const candidatos: Candidato[] = rows.map((r, i) => ({
    ref: `#${i + 1}`, movId: r.mov_id, fecha: r.fecha, concepto: r.concepto || '', importe: r.importe, destino: r.destino, porRevisar: r.por_revisar,
  }))

  const facturas = await prisma.$queryRaw<CtxData['facturas']>(Prisma.sql`
    SELECT proveedor, importe::float8 AS importe, estado
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')
    ORDER BY fecha_factura DESC NULLS LAST LIMIT 10`).catch(() => [])

  const [memoria, historial] = await Promise.all([getMemoria(cuentaId), getHistorial(cuentaId, 8)])

  const texto = formatearContexto({ year, porDestino, candidatos, facturas, memoria, historial })
  return { texto, candidatos }
}
```

- [ ] **Step 5: Ejecutar el test del formateador y ver PASS**

Run: `cd apps/plataforma && node --test lib/contable/contexto.test.ts` → PASS (2).

- [ ] **Step 6: Commit**

```bash
git add apps/plataforma/lib/contable/formato.ts apps/plataforma/lib/contable/contexto.ts apps/plataforma/lib/contable/contexto.test.ts
git commit -m "feat(contable): contexto con movimientos accionables (#ref + id)"
```

---

## Task 5: Ejecutor de acciones (DB)

**Files:** Create `apps/plataforma/lib/contable/acciones.ts`

Reutiliza `aprenderReglaMovimiento`/`getMovParaCallback` de `@/lib/agente-movimientos` y las mismas UPDATEs que el webhook `mov_*` (destino+confirmado+revision, propiedad_id, amortizable), siempre **scoped por cuenta**.

- [ ] **Step 1: Implementar**

```ts
// apps/plataforma/lib/contable/acciones.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { aprenderReglaMovimiento, getMovParaCallback } from '@/lib/agente-movimientos'

export type AccionPropuesta = { id: string; tipo: string; resumen: string }

// Persiste cada acción propuesta (estado 'pendiente') y devuelve sus ids para la UI.
export async function guardarAcciones(
  cuentaId: string, props: { tipo: string; params: Record<string, any>; resumen: string }[],
): Promise<AccionPropuesta[]> {
  const out: AccionPropuesta[] = []
  for (const p of props) {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO contable_accion (cuenta_id, tipo, params, resumen)
      VALUES (${cuentaId}::uuid, ${p.tipo}, ${JSON.stringify(p.params)}::jsonb, ${p.resumen})
      RETURNING id`).catch(() => [])
    if (rows[0]) out.push({ id: String(rows[0].id), tipo: p.tipo, resumen: p.resumen })
  }
  return out
}

async function marcar(accionId: string, estado: string, resultado: string | null): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE contable_accion SET estado = ${estado}, resultado = ${resultado}
    WHERE id = ${accionId}::bigint`).catch(() => {})
}

export async function descartarAccion(cuentaId: string, accionId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE contable_accion SET estado = 'descartada'
    WHERE id = ${accionId}::bigint AND cuenta_id = ${cuentaId}::uuid AND estado = 'pendiente'`).catch(() => {})
}

// Ejecuta una acción PENDIENTE por id (nunca confía en params del cliente: los lee de la BD).
export async function ejecutarAccion(cuentaId: string, accionId: string): Promise<{ ok: boolean; mensaje: string }> {
  const rows = await prisma.$queryRaw<{ tipo: string; params: any; estado: string }[]>(Prisma.sql`
    SELECT tipo, params, estado FROM contable_accion
    WHERE id = ${accionId}::bigint AND cuenta_id = ${cuentaId}::uuid LIMIT 1`).catch(() => [])
  const acc = rows[0]
  if (!acc) return { ok: false, mensaje: 'Acción no encontrada' }
  if (acc.estado !== 'pendiente') return { ok: false, mensaje: `La acción ya está ${acc.estado}` }

  const p = acc.params || {}
  const movId = String(p.movId || '')
  const mov = movId ? await getMovParaCallback(movId) : null
  if (!mov || mov.cuentaId !== cuentaId) { await marcar(accionId, 'error', 'Movimiento no válido'); return { ok: false, mensaje: 'Movimiento no válido' } }

  const scope = Prisma.sql`AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)`
  try {
    if (acc.tipo === 'clasificar') {
      const destino = String(p.destino || '')
      const propiedad = p.propiedad ? String(p.propiedad) : null
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET destino = ${destino}, destino_confirmado = true, requiere_revision = false, propiedad_id = ${propiedad}
        WHERE id = ${movId}::uuid ${scope}`)
      if (mov.concepto) await aprenderReglaMovimiento(cuentaId, mov.concepto, destino)
    } else if (acc.tipo === 'amortizable') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios SET amortizable = ${p.valor !== false}
        WHERE id = ${movId}::uuid ${scope}`)
    } else if (acc.tipo === 'confirmar') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios SET destino_confirmado = true, requiere_revision = false
        WHERE id = ${movId}::uuid ${scope}`)
    } else {
      await marcar(accionId, 'error', 'Tipo no soportado')
      return { ok: false, mensaje: 'Tipo no soportado' }
    }
  } catch (e: any) {
    await marcar(accionId, 'error', String(e?.message || e).slice(0, 140))
    return { ok: false, mensaje: 'No se pudo ejecutar la acción' }
  }
  await marcar(accionId, 'ejecutada', null)
  return { ok: true, mensaje: 'Hecho ✓' }
}
```

- [ ] **Step 2: Typecheck ligero**

Run: `cd apps/plataforma && npx tsc --noEmit` (o se cubre en el build de Task 8). Expected: sin errores en `lib/contable/acciones.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/contable/acciones.ts
git commit -m "feat(contable): ejecutor de acciones con scope por cuenta"
```

---

## Task 6: Cerebro — proponer acciones

**Files:** Modify `apps/plataforma/lib/contable/cerebro.ts`

- [ ] **Step 1: Reescribir `cerebro.ts`** (nuevo SYSTEM sin "solo lectura" + parseo/persistencia)

```ts
// apps/plataforma/lib/contable/cerebro.ts
// Un turno del agente: contexto → IA → aprende hábitos → PROPONE acciones (que Alberto confirma).
import { aiComplete } from '@central/core-ai'
import { construirContexto } from './contexto'
import { extraerAprendizajes, extraerAcciones, type Aprendizaje } from './parse'
import { validarAccion, resumenAccion } from './acciones-tipos'
import { guardarInsight, logTurno } from './memoria'
import { guardarAcciones, type AccionPropuesta } from './acciones'

const SYSTEM = `Eres el agente de CONTABILIDAD de Alberto (pisos turísticos, correduría de seguros, gastos personales). Hablas con él en español, claro y breve.

Puedes:
1. RESPONDER preguntas sobre su contabilidad usando SOLO el contexto que te doy. No inventes cifras.
2. APRENDER su rutina: cuando te dé un hábito/criterio a recordar, añade una línea:
APRENDER: {"clave":"<slug>","insight":"<frase>"}
3. PROPONER acciones sobre un movimiento. NO las ejecutas tú: Alberto las CONFIRMA en pantalla. Para proponer, añade AL FINAL una línea por acción, EXACTAMENTE así:
ACCION: {"tipo":"clasificar","ref":"#3","destino":"turistico_pisos","propiedad":"prop_house_sevillana"}
ACCION: {"tipo":"amortizable","ref":"#3","valor":true}
ACCION: {"tipo":"confirmar","ref":"#3"}

Reglas de acciones:
- "ref" = el #N del movimiento tal cual aparece en la sección "Movimientos". No inventes refs.
- clasificar.destino ∈ turistico_pisos | turistico_duplex | seguros | traspaso_interno | personal.
- "propiedad" es OPCIONAL y solo para turistico_pisos: prop_house_sevillana | prop_busto_reform | prop_luxury_busto | prop_duplex_center.
- amortizable: recuerda que Alberto NUNCA amortiza de oficio; solo si te lo pide explícitamente.
- Explica en el texto qué propones y por qué. Si solo es una pregunta, no añadas ACCION.
- Nada se ejecuta hasta que Alberto pulse Confirmar.`

export async function responder(
  cuentaId: string, mensaje: string, canal = 'web',
): Promise<{ respuesta: string; guardados: Aprendizaje[]; acciones: AccionPropuesta[] }> {
  const { texto: ctx, candidatos } = await construirContexto(cuentaId).catch(() => ({ texto: '(no se pudo leer el contexto)', candidatos: [] as any[] }))
  await logTurno(cuentaId, canal, 'user', mensaje)

  const prompt = `${ctx}\n\n# Mensaje de Alberto\n${mensaje}\n\n# Tu respuesta`
  const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 800, timeoutMs: 25_000 })

  // 1) Aprendizajes (canal APRENDER)
  const paso1 = extraerAprendizajes(raw)
  for (const a of paso1.aprendizajes) await guardarInsight(cuentaId, a)

  // 2) Acciones (canal ACCION) — resolver #ref → movimiento y validar
  const paso2 = extraerAcciones(paso1.limpio)
  const mapa = new Map(candidatos.map((c: any) => [c.ref, c]))
  const propuestas: { tipo: string; params: Record<string, any>; resumen: string }[] = []
  for (const cruda of paso2.acciones) {
    const v = validarAccion(cruda)
    if (!v.ok) continue
    const cand = mapa.get(v.accion.ref)
    if (!cand) continue
    const params: Record<string, any> = { movId: cand.movId, concepto: cand.concepto }
    if (v.accion.tipo === 'clasificar') { params.destino = v.accion.destino; params.propiedad = v.accion.propiedad }
    if (v.accion.tipo === 'amortizable') { params.valor = v.accion.valor }
    propuestas.push({ tipo: v.accion.tipo, params, resumen: resumenAccion(v.accion, cand.concepto) })
  }
  const acciones = propuestas.length ? await guardarAcciones(cuentaId, propuestas) : []

  await logTurno(cuentaId, canal, 'assistant', paso2.limpio)
  return { respuesta: paso2.limpio, guardados: paso1.aprendizajes, acciones }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/lib/contable/cerebro.ts
git commit -m "feat(contable): cerebro propone acciones (canal ACCION + resolución de #ref)"
```

---

## Task 7: Endpoints web (chat devuelve acciones + ejecutar/descartar)

**Files:** Modify `app/api/contable/chat/route.ts`; Create `app/api/contable/accion/route.ts`

- [ ] **Step 1: Editar `chat/route.ts`** — devolver `acciones`

En el `try`, sustituir la desestructuración y la respuesta por:

```ts
    const { respuesta, guardados, acciones } = await responder(session.id, mensaje, 'web')
    return NextResponse.json({ respuesta, guardados, acciones })
```

*(El resto del route —auth `requireSession`, validación de `mensaje`, manejo de error NVIDIA_API_KEY— no cambia.)*

- [ ] **Step 2: Crear `accion/route.ts`**

```ts
// apps/plataforma/app/api/contable/accion/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { ejecutarAccion, descartarAccion } from '@/lib/contable/acciones'

export const maxDuration = 20
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const accionId = typeof body?.accionId === 'string' && /^\d+$/.test(body.accionId) ? body.accionId : ''
  if (!accionId) return NextResponse.json({ error: 'accionId requerido' }, { status: 400 })

  if (body?.op === 'descartar') {
    await descartarAccion(session.id, accionId)
    return NextResponse.json({ ok: true, estado: 'descartada' })
  }
  const r = await ejecutarAccion(session.id, accionId)
  return NextResponse.json({ ok: r.ok, mensaje: r.mensaje, estado: r.ok ? 'ejecutada' : 'error' })
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/plataforma/app/api/contable/chat/route.ts" "apps/plataforma/app/api/contable/accion/route.ts"
git commit -m "feat(contable): endpoints — chat devuelve acciones + /api/contable/accion"
```

---

## Task 8: UI — tarjetas de confirmación + build

**Files:** Modify `app/(usuario)/contable/page.tsx`

Añadir al chat: cuando un mensaje del agente trae `acciones`, se muestran como tarjetas con **Confirmar** / **Descartar**; al pulsar, `POST /api/contable/accion` y la tarjeta pasa a estado final.

- [ ] **Step 1: Editar `page.tsx`** — tipos, estado y render de acciones

1) Sustituir el `type Msg` por:

```tsx
type Guardado = { clave: string; insight: string }
type Accion = { id: string; tipo: string; resumen: string; estado?: 'pendiente' | 'ejecutada' | 'descartada' | 'error'; mensaje?: string }
type Msg = { rol: 'tu' | 'agente'; texto: string; guardados?: Guardado[]; acciones?: Accion[] }
```

2) En `enviar`, al recibir la respuesta del agente, incluir las acciones (estado inicial `pendiente`):

```tsx
      const data = await r.json().catch(() => ({}))
      setMsgs(m => [...m, {
        rol: 'agente',
        texto: data?.respuesta || data?.error || 'Sin respuesta.',
        guardados: data?.guardados || [],
        acciones: (data?.acciones || []).map((a: any) => ({ ...a, estado: 'pendiente' as const })),
      }])
```

3) Añadir el manejador de confirmación (dentro del componente, junto a `enviar`):

```tsx
  const resolverAccion = useCallback(async (msgIdx: number, accId: string, op: 'ejecutar' | 'descartar') => {
    setMsgs(m => m.map((msg, i) => i !== msgIdx ? msg : {
      ...msg, acciones: msg.acciones?.map(a => a.id === accId ? { ...a, estado: op === 'descartar' ? 'descartada' : a.estado, mensaje: '…' } : a),
    }))
    try {
      const r = await fetch('/api/contable/accion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op === 'descartar' ? { accionId: accId, op: 'descartar' } : { accionId: accId }),
      })
      const data = await r.json().catch(() => ({}))
      setMsgs(m => m.map((msg, i) => i !== msgIdx ? msg : {
        ...msg, acciones: msg.acciones?.map(a => a.id === accId ? { ...a, estado: data?.estado || 'error', mensaje: data?.mensaje } : a),
      }))
    } catch {
      setMsgs(m => m.map((msg, i) => i !== msgIdx ? msg : {
        ...msg, acciones: msg.acciones?.map(a => a.id === accId ? { ...a, estado: 'error', mensaje: 'Error de red' } : a),
      }))
    }
  }, [])
```

4) En el render de cada mensaje del agente, tras el bloque de `m.guardados`, añadir el bloque de acciones (usa `i` como índice del `msgs.map((m, i) => ...)`):

```tsx
              {m.acciones && m.acciones.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {m.acciones.map(a => (
                    <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: 'var(--surface)', color: 'var(--text)' }}>
                      <div style={{ fontSize: 13 }}>⚙️ {a.resumen}</div>
                      {a.estado === 'pendiente' ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => resolverAccion(i, a.id, 'ejecutar')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Confirmar</button>
                          <button onClick={() => resolverAccion(i, a.id, 'descartar')} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Descartar</button>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: a.estado === 'ejecutada' ? '#16a34a' : a.estado === 'descartada' ? 'var(--muted)' : '#dc2626' }}>
                          {a.estado === 'ejecutada' ? '✓ Hecho' : a.estado === 'descartada' ? 'Descartada' : `⚠️ ${a.mensaje || 'Error'}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
```

5) Actualizar los textos de ayuda/SUGERENCIAS para reflejar que ya puede actuar, p. ej. cambiar la última sugerencia por `'Clasifica el recibo de Endesa como pisos'` y la línea de subtítulo a: `Pregúntale por tus finanzas, dale criterios que recuerde, o pídele que clasifique un cargo (lo confirmas tú).`

- [ ] **Step 2: Build de la app**

Run: `cd apps/plataforma && npx --yes pnpm@10.33.0 install --no-frozen-lockfile && pnpm build`
Expected: build OK; en la salida deben figurar las rutas `ƒ /contable`, `ƒ /api/contable/chat` y `ƒ /api/contable/accion`.

- [ ] **Step 3: Commit**

```bash
git add "apps/plataforma/app/(usuario)/contable/page.tsx"
git commit -m "feat(contable): tarjetas de confirmación de acciones en /contable"
```

---

## Verificación end-to-end

Tras desplegar el preview de `plataforma` (o local con `DATABASE_URL` + `NVIDIA_API_KEY`):

1. **Tests unitarios:** `cd apps/plataforma && node --test lib/contable/parse.test.ts lib/contable/acciones-tipos.test.ts lib/contable/contexto.test.ts` → todo PASS.
2. **Proponer + confirmar clasificación:** en `/contable`, con un cargo por revisar visible, pedir *"clasifica el #1 como pisos"* → el agente responde y aparece una tarjeta ⚙️. Pulsar **Confirmar** → "✓ Hecho". Verificar por SQL: `SELECT destino, destino_confirmado, requiere_revision FROM movimientos_bancarios WHERE id='<uuid>'` → `turistico_pisos, true, false`. Verificar la regla: `SELECT * FROM banca_destino_reglas WHERE cuenta_id='<cuenta>' AND destino='turistico_pisos'`.
3. **Descartar:** proponer otra acción y pulsar **Descartar** → la tarjeta queda "Descartada" y `contable_accion.estado='descartada'`; el movimiento NO cambia.
4. **Seguridad:** llamar `POST /api/contable/accion` con un `accionId` de otra cuenta → "Acción no encontrada" (scope por `cuenta_id`); reintentar una acción ya ejecutada → "La acción ya está ejecutada" (idempotente).
5. **Amortizable:** *"marca el #2 como amortizable"* → confirmar → `SELECT amortizable FROM movimientos_bancarios WHERE id='…'` = true. (Recordar: el agente no debe proponerlo de oficio.)
6. **Responsive:** tarjetas usables en móvil ≥320px; botones ≥44px de zona táctil.

---

## Self-review (hecho)

- **Cobertura del spec (Fase 2 §4):** acciones con confirmación ✓ (`clasificar`/`amortizable`/`confirmar`); persistencia server-side + ejecución por id ✓; regla dura "no amortizar de oficio" en el SYSTEM ✓. `conciliar_factura`/`gestionar_pago` quedan declarados fuera de alcance (fases con documentos/proveedor).
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** `AccionCruda` en `parse.ts` y `acciones-tipos.ts` tienen la misma forma; `validarAccion`→`AccionValida`→`resumenAccion` encajan; `guardarAcciones`/`ejecutarAccion`/`descartarAccion` comparten la tabla `contable_accion` y el id como string; `responder()` devuelve `{respuesta, guardados, acciones}` y route/UI consumen esos nombres; `construirContexto` ahora devuelve `{texto, candidatos}` y cerebro usa ambos; `Candidato.ref` (`#n`) es la clave del `Map` que resuelve las acciones.
- **Landmines respetadas:** columna de fecha `fecha_operacion` (no `fecha`); filtro `duplicado_estado`; scope `cuenta_bancaria_id IN (… cuenta_id)` en toda escritura; destino validado contra el set de `/api/banca/destino`.
