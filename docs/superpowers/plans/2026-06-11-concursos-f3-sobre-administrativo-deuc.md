# Concursos F3 — Sobre administrativo + DEUC · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar el Sobre 1 (administrativo) de un concurso tirando de la biblioteca de empresa: la lista de documentos con qué doc los cubre, más el DEUC y la declaración responsable rellenos como datos.

**Architecture:** Lógica nueva **TS pura** en `packages/module-concursos/src/deuc.ts` (sin BD/IA/secretos), reutilizando `derivarChecklist` (v1) y `tipoDeDocumento` (F2). El DEUC y la declaración responsable se producen como **estructura de datos** (la app los renderiza al formato oficial PDF/XML más adelante). La app de referencia (ialimp) persiste un perfil de identificación de la empresa y expone el sobre administrativo en la pantalla del concurso.

**Tech Stack:** TypeScript puro; tests con `node --test` (type-stripping); Next.js + Prisma/Supabase en ialimp.

---

## File Structure

**Módulo puro (`packages/module-concursos/`):**
- Modify: `src/types.ts` — `DatosIdentificacionEmpresa`, `ItemSobreAdministrativo`, `Deuc`, `DeclaracionResponsable`.
- Create: `src/deuc.ts` — `documentosSobreAdministrativo`, `construirDeuc`, `construirDeclaracionResponsable`.
- Modify: `src/index.ts` — re-exporta lo nuevo.
- Create: `test/deuc.test.ts` — tests de las tres funciones.

**Integración de referencia (`apps/ialimp/`):**
- Create: `prisma/migrations/add_concursos_perfil.sql` — tabla `concursos_perfil_empresa`.
- Create: `app/api/admin/concursos/perfil/route.ts` — GET carga / PUT guarda el perfil de identificación.
- Create: `app/api/admin/concursos/[id]/sobre-administrativo/route.ts` — GET genera sobre admin + DEUC + declaración.
- Modify: `app/admin/concursos/page.tsx` — botón/panel "Sobre administrativo" en la ficha + enlace a editar perfil.
- Create: `app/admin/concursos/perfil/page.tsx` — formulario del perfil de identificación.

---

## Task 1: Tipos de F3

**Files:**
- Modify: `packages/module-concursos/src/types.ts` (al final, tras los tipos de Biblioteca de F2)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Sobre administrativo + DEUC (F3)
// El módulo produce DATOS; la app los renderiza al formato oficial (PDF/XML).
// ────────────────────────────────────────────────────────────────────────────

/** Datos de identificación de la empresa para el DEUC y la declaración responsable. */
export interface DatosIdentificacionEmpresa {
  razon_social: string
  nif: string
  domicilio?: string
  representante?: string          // nombre del apoderado que firma
  representante_dni?: string
  email?: string
  telefono?: string
  es_pyme?: boolean               // Parte II del DEUC
}

/** Una entrada del Sobre 1: documento exigido + qué doc de la biblioteca lo cubre. */
export interface ItemSobreAdministrativo {
  documento: string
  obligatorio: boolean
  modelo?: string
  cubiertoPor?: DocumentoBiblioteca   // undefined = aún no cubierto por la biblioteca
}

/** DEUC por partes (estructura de datos; la app la vuelca al formulario oficial). */
export interface Deuc {
  // Parte I — sobre el procedimiento de contratación
  procedimiento: { objeto?: string; expediente?: string; organo?: string }
  // Parte II — datos del operador económico
  operador: DatosIdentificacionEmpresa
  // Parte III — motivos de exclusión (el licitador declara NO estar incurso)
  motivos_exclusion: {
    sin_condenas: boolean
    al_corriente_impuestos: boolean
    al_corriente_ss: boolean
    sin_quiebra: boolean
  }
  // Parte IV — criterios de selección (solvencia declarada, de la ficha)
  solvencia: { economica: string[]; tecnica: string[] }
  // Parte VI — declaraciones finales
  declaraciones_finales: { veracidad: boolean; fecha?: string }
}

/** Declaración responsable (art. 140 LCSP) como datos. */
export interface DeclaracionResponsable {
  empresa: DatosIdentificacionEmpresa
  objeto?: string
  expediente?: string
  declara: string[]               // afirmaciones que firma el representante
  fecha?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/module-concursos/src/types.ts
git commit -m "feat(concursos): tipos del sobre administrativo y DEUC (F3)"
```

---

## Task 2: `documentosSobreAdministrativo`

Lista del Sobre 1 reutilizando el checklist del v1 (filtrado a `administrativo`) y marcando qué doc de la biblioteca cubre cada requisito.

**Files:**
- Create: `packages/module-concursos/src/deuc.ts`
- Test: `packages/module-concursos/test/deuc.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-concursos/test/deuc.test.ts`:

```ts
// Tests de la lógica PURA del sobre administrativo + DEUC (F3).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { documentosSobreAdministrativo } from '../src/deuc.ts'
import type { Biblioteca, FichaConcurso } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'Servicio de limpieza de un colegio',
    tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

test('documentosSobreAdministrativo: incluye los administrativos base y marca cobertura', () => {
  const biblio: Biblioteca = [{ tipo: 'certificado_aeat', nombre: 'AEAT 2026' }]
  const items = documentosSobreAdministrativo(fichaBase(), biblio)
  // El checklist base mete AEAT, SS y la declaración responsable en 'administrativo'.
  const aeat = items.find(i => /AEAT|Agencia Tributaria/i.test(i.documento))
  const ss = items.find(i => /Seguridad Social/i.test(i.documento))
  assert.ok(aeat, 'debe listar el certificado de la AEAT')
  assert.ok(ss, 'debe listar el certificado de la Seguridad Social')
  assert.equal(aeat!.cubiertoPor?.tipo, 'certificado_aeat') // cubierto por la biblioteca
  assert.equal(ss!.cubiertoPor, undefined)                   // no está en la biblioteca
})

test('documentosSobreAdministrativo: solo devuelve documentos del sobre administrativo', () => {
  const ficha = fichaBase({
    documentos: [
      { nombre: 'Memoria técnica', sobre: 'tecnico', obligatorio: true },
      { nombre: 'Escritura de constitución', sobre: 'administrativo', obligatorio: true },
    ],
  })
  const items = documentosSobreAdministrativo(ficha, [])
  assert.ok(items.some(i => /Escritura/i.test(i.documento)))
  assert.ok(!items.some(i => /Memoria técnica/i.test(i.documento)))
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/deuc.test.ts`
Expected: FAIL — `Cannot find module '../src/deuc.ts'`.

- [ ] **Step 3: Implementar `deuc.ts` (solo esta función)**

Crea `packages/module-concursos/src/deuc.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Sobre administrativo + DEUC (F3) — PURO. Reutiliza el checklist del v1 y el
// clasificador de la biblioteca (F2). Produce datos; la app los renderiza al
// formato oficial. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  Biblioteca,
  DatosIdentificacionEmpresa,
  DeclaracionResponsable,
  Deuc,
  DocumentoBiblioteca,
  FichaConcurso,
  ItemSobreAdministrativo,
  TipoDocumentoBiblioteca,
} from './types'
import { derivarChecklist } from './checklist'
import { tipoDeDocumento } from './biblioteca'

/** Primer documento de la biblioteca por cada tipo (para resolver cobertura). */
function indicePorTipo(biblioteca: Biblioteca): Map<TipoDocumentoBiblioteca, DocumentoBiblioteca> {
  const m = new Map<TipoDocumentoBiblioteca, DocumentoBiblioteca>()
  for (const d of biblioteca) if (!m.has(d.tipo)) m.set(d.tipo, d)
  return m
}

/**
 * Documentos del Sobre 1 (administrativo): los del checklist filtrados a ese
 * sobre, cada uno con el documento de la biblioteca que lo cubre (si existe).
 */
export function documentosSobreAdministrativo(
  ficha: FichaConcurso,
  biblioteca: Biblioteca,
): ItemSobreAdministrativo[] {
  const idx = indicePorTipo(biblioteca)
  return derivarChecklist(ficha)
    .filter(i => i.sobre === 'administrativo')
    .map(i => {
      const tipo = tipoDeDocumento(i.documento)
      const cubiertoPor = tipo ? idx.get(tipo) : undefined
      const out: ItemSobreAdministrativo = { documento: i.documento, obligatorio: i.obligatorio }
      if (i.modelo) out.modelo = i.modelo
      if (cubiertoPor) out.cubiertoPor = cubiertoPor
      return out
    })
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/deuc.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/deuc.ts packages/module-concursos/test/deuc.test.ts
git commit -m "feat(concursos): documentosSobreAdministrativo con cobertura de biblioteca (F3)"
```

---

## Task 3: `construirDeuc`

Ensambla el DEUC por partes a partir de los datos de la empresa y la ficha. Determinista, sin LLM.

**Files:**
- Modify: `packages/module-concursos/src/deuc.ts`
- Modify: `packages/module-concursos/test/deuc.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/deuc.test.ts`:

```ts
import { construirDeuc } from '../src/deuc.ts'
import type { DatosIdentificacionEmpresa } from '../src/types.ts'

const EMPRESA: DatosIdentificacionEmpresa = {
  razon_social: 'Limpiezas Ejemplo SL', nif: 'B12345678', es_pyme: true,
}

test('construirDeuc: rellena procedimiento, operador y solvencia desde la ficha', () => {
  const ficha = fichaBase({
    objeto: 'Limpieza de un colegio', expediente: '2026/01', organo_contratacion: 'Ayto. de X',
    solvencia: [
      { ambito: 'economica', descripcion: 'Volumen anual ≥ 100.000 €' },
      { ambito: 'tecnica', descripcion: 'Servicios similares en 3 años' },
    ],
  })
  const deuc = construirDeuc(EMPRESA, ficha, '2026-06-11')
  assert.equal(deuc.procedimiento.objeto, 'Limpieza de un colegio')
  assert.equal(deuc.procedimiento.expediente, '2026/01')
  assert.equal(deuc.procedimiento.organo, 'Ayto. de X')
  assert.equal(deuc.operador.nif, 'B12345678')
  assert.deepEqual(deuc.solvencia.economica, ['Volumen anual ≥ 100.000 €'])
  assert.deepEqual(deuc.solvencia.tecnica, ['Servicios similares en 3 años'])
})

test('construirDeuc: motivos de exclusión y declaración final por defecto a favor', () => {
  const deuc = construirDeuc(EMPRESA, fichaBase(), '2026-06-11')
  assert.equal(deuc.motivos_exclusion.sin_condenas, true)
  assert.equal(deuc.motivos_exclusion.al_corriente_impuestos, true)
  assert.equal(deuc.motivos_exclusion.al_corriente_ss, true)
  assert.equal(deuc.motivos_exclusion.sin_quiebra, true)
  assert.equal(deuc.declaraciones_finales.veracidad, true)
  assert.equal(deuc.declaraciones_finales.fecha, '2026-06-11')
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/deuc.test.ts`
Expected: FAIL — `construirDeuc is not a function` / no exportada.

- [ ] **Step 3: Implementar**

Añade a `src/deuc.ts`:

```ts
/**
 * Ensambla el DEUC por partes. Los motivos de exclusión y la veracidad se
 * declaran a favor (el licitador afirma estar limpio y al corriente); la app
 * permite editarlos antes de firmar. La solvencia sale de la ficha.
 */
export function construirDeuc(
  empresa: DatosIdentificacionEmpresa,
  ficha: FichaConcurso,
  hoy?: string,
): Deuc {
  return {
    procedimiento: {
      objeto: ficha.objeto,
      expediente: ficha.expediente,
      organo: ficha.organo_contratacion,
    },
    operador: empresa,
    motivos_exclusion: {
      sin_condenas: true,
      al_corriente_impuestos: true,
      al_corriente_ss: true,
      sin_quiebra: true,
    },
    solvencia: {
      economica: ficha.solvencia.filter(s => s.ambito === 'economica').map(s => s.descripcion),
      tecnica: ficha.solvencia.filter(s => s.ambito === 'tecnica').map(s => s.descripcion),
    },
    declaraciones_finales: { veracidad: true, fecha: hoy },
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/deuc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/deuc.ts packages/module-concursos/test/deuc.test.ts
git commit -m "feat(concursos): construirDeuc por partes desde ficha y empresa (F3)"
```

---

## Task 4: `construirDeclaracionResponsable`

Genera la declaración responsable (art. 140 LCSP) como datos: identidad + afirmaciones estándar.

**Files:**
- Modify: `packages/module-concursos/src/deuc.ts`
- Modify: `packages/module-concursos/test/deuc.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/deuc.test.ts`:

```ts
import { construirDeclaracionResponsable } from '../src/deuc.ts'

test('construirDeclaracionResponsable: identidad + objeto + afirmaciones', () => {
  const ficha = fichaBase({ objeto: 'Limpieza de un colegio', expediente: '2026/01' })
  const dr = construirDeclaracionResponsable(EMPRESA, ficha, '2026-06-11')
  assert.equal(dr.empresa.razon_social, 'Limpiezas Ejemplo SL')
  assert.equal(dr.objeto, 'Limpieza de un colegio')
  assert.equal(dr.expediente, '2026/01')
  assert.equal(dr.fecha, '2026-06-11')
  assert.ok(dr.declara.length >= 3)
  assert.ok(dr.declara.some(a => /capacidad de obrar/i.test(a)))
  assert.ok(dr.declara.some(a => /al corriente/i.test(a)))
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/deuc.test.ts`
Expected: FAIL — `construirDeclaracionResponsable is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/deuc.ts`:

```ts
/** Afirmaciones estándar de la declaración responsable (art. 140 LCSP). */
const AFIRMACIONES_140: string[] = [
  'Que la empresa tiene plena capacidad de obrar y la habilitación profesional necesaria.',
  'Que cumple los requisitos de solvencia económica, financiera y técnica exigidos.',
  'Que no está incursa en ninguna prohibición de contratar del art. 71 LCSP.',
  'Que está al corriente de sus obligaciones tributarias y con la Seguridad Social.',
  'Que se somete a la jurisdicción de los juzgados y tribunales españoles.',
]

/** Declaración responsable (art. 140 LCSP) como datos, lista para renderizar. */
export function construirDeclaracionResponsable(
  empresa: DatosIdentificacionEmpresa,
  ficha: FichaConcurso,
  hoy?: string,
): DeclaracionResponsable {
  return {
    empresa,
    objeto: ficha.objeto,
    expediente: ficha.expediente,
    declara: [...AFIRMACIONES_140],
    fecha: hoy,
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/deuc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/deuc.ts packages/module-concursos/test/deuc.test.ts
git commit -m "feat(concursos): construirDeclaracionResponsable art.140 LCSP (F3)"
```

---

## Task 5: Re-exports en `index.ts` y suite completa

**Files:**
- Modify: `packages/module-concursos/src/index.ts`

- [ ] **Step 1: Añadir los re-exports**

En `src/index.ts`, tras el bloque de biblioteca (F2), añade:

```ts
// Sobre administrativo + DEUC (puro): sobre 1 + DEUC + declaración responsable
export {
  documentosSobreAdministrativo,
  construirDeuc,
  construirDeclaracionResponsable,
} from './deuc'
```

Y dentro del `export type { … } from './types'` añade los tipos nuevos:

```ts
  DatosIdentificacionEmpresa,
  ItemSobreAdministrativo,
  Deuc,
  DeclaracionResponsable,
```

- [ ] **Step 2: Ejecutar TODA la suite del módulo**

Run: `cd /home/user/central/packages/module-concursos && npm test`
Expected: PASS — los tests del v1 + F2 + los nuevos de F3, todos verdes.

- [ ] **Step 3: Commit**

```bash
git add packages/module-concursos/src/index.ts
git commit -m "feat(concursos): exporta la API del sobre administrativo y DEUC (F3)"
```

---

## Task 6: Integración ialimp — perfil de identificación (migración)

**Files:**
- Create: `apps/ialimp/prisma/migrations/add_concursos_perfil.sql`

> Se aplica a mano en la BD compartida, como el resto de migraciones del repo.

- [ ] **Step 1: Crear la migración**

Crea `apps/ialimp/prisma/migrations/add_concursos_perfil.sql`:

```sql
-- Perfil de identificación de la empresa para el DEUC / declaración responsable
-- (F3 del módulo de concursos). Una fila por empresa.
create table if not exists concursos_perfil_empresa (
  empresa_id        uuid primary key references empresas(id) on delete cascade,
  razon_social      text not null default '',
  nif               text not null default '',
  domicilio         text,
  representante      text,
  representante_dni  text,
  email             text,
  telefono          text,
  es_pyme           boolean not null default true,
  actualizado_en    timestamptz not null default now()
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/ialimp/prisma/migrations/add_concursos_perfil.sql
git commit -m "feat(ialimp): migración concursos_perfil_empresa (concursos F3)"
```

---

## Task 7: Integración ialimp — endpoint del perfil

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/perfil/route.ts`

- [ ] **Step 1: Releer el patrón de auth/BD del v1**

Run: `cat apps/ialimp/app/api/admin/concursos/biblioteca/route.ts`
Reutiliza EXACTAMENTE el mismo patrón: `requireEmpresaId()` de `@/lib/tenant`, `prisma.$queryRaw` con `Prisma.sql` de `@prisma/client` + `@/lib/prisma`, casts en el SQL.

- [ ] **Step 2: Crear el endpoint**

Crea `apps/ialimp/app/api/admin/concursos/perfil/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Perfil de identificación de la empresa para el DEUC (F3). Scope empresa_id.

export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT razon_social, nif, domicilio, representante, representante_dni, email, telefono, es_pyme
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ perfil: rows[0] ?? null })
}

export async function PUT(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO concursos_perfil_empresa
      (empresa_id, razon_social, nif, domicilio, representante, representante_dni, email, telefono, es_pyme, actualizado_en)
    VALUES (
      ${empresa_id}::uuid, ${String(b.razon_social ?? '')}, ${String(b.nif ?? '')},
      ${b.domicilio ?? null}, ${b.representante ?? null}, ${b.representante_dni ?? null},
      ${b.email ?? null}, ${b.telefono ?? null}, ${b.es_pyme !== false}, now()
    )
    ON CONFLICT (empresa_id) DO UPDATE SET
      razon_social = EXCLUDED.razon_social, nif = EXCLUDED.nif, domicilio = EXCLUDED.domicilio,
      representante = EXCLUDED.representante, representante_dni = EXCLUDED.representante_dni,
      email = EXCLUDED.email, telefono = EXCLUDED.telefono, es_pyme = EXCLUDED.es_pyme,
      actualizado_en = now()
  `)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (puede abortar después en "Collecting page data" por `JWT_SECRET` ausente del entorno local — eso es env, no código; reportarlo si ocurre).

- [ ] **Step 4: Commit**

```bash
git add apps/ialimp/app/api/admin/concursos/perfil/route.ts
git commit -m "feat(ialimp): endpoint del perfil de identificación (concursos F3)"
```

---

## Task 8: Integración ialimp — endpoint del sobre administrativo

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/[id]/sobre-administrativo/route.ts`

- [ ] **Step 1: Releer cómo se lee un concurso y la biblioteca**

Run: `cat apps/ialimp/app/api/admin/concursos/analizar/route.ts apps/ialimp/app/api/admin/concursos/biblioteca/route.ts`
Fíjate en cómo se consulta la tabla `concursos` (columnas `ficha`/`checklist` jsonb) y `biblioteca_documentos`, ambas scopeadas por `empresa_id`.

- [ ] **Step 2: Crear el endpoint**

Crea `apps/ialimp/app/api/admin/concursos/[id]/sobre-administrativo/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  documentosSobreAdministrativo,
  construirDeuc,
  construirDeclaracionResponsable,
} from '@iarest/module-concursos'
import type { Biblioteca, DatosIdentificacionEmpresa } from '@iarest/module-concursos'

// Genera el Sobre 1 (administrativo) + DEUC + declaración responsable de un
// concurso, cruzando su ficha con la biblioteca y el perfil de la empresa.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params

  const con = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ficha FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!con[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  const ficha = con[0].ficha

  const bibRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT tipo, nombre, vigencia_hasta FROM biblioteca_documentos WHERE empresa_id = ${empresa_id}::uuid
  `)
  const biblioteca: Biblioteca = bibRows.map(d => ({
    tipo: d.tipo, nombre: d.nombre, vigencia_hasta: d.vigencia_hasta ?? undefined,
  }))

  const perRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT razon_social, nif, domicilio, representante, representante_dni, email, telefono, es_pyme
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  const p = perRows[0]
  const empresa: DatosIdentificacionEmpresa = {
    razon_social: p?.razon_social ?? '', nif: p?.nif ?? '',
    domicilio: p?.domicilio ?? undefined, representante: p?.representante ?? undefined,
    representante_dni: p?.representante_dni ?? undefined, email: p?.email ?? undefined,
    telefono: p?.telefono ?? undefined, es_pyme: p?.es_pyme ?? true,
  }

  const hoy = new Date().toISOString().slice(0, 10)
  return NextResponse.json({
    sobre: documentosSobreAdministrativo(ficha, biblioteca),
    deuc: construirDeuc(empresa, ficha, hoy),
    declaracion: construirDeclaracionResponsable(empresa, ficha, hoy),
    perfil_completo: Boolean(p?.razon_social && p?.nif),
  })
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (ídem nota de `JWT_SECRET`).

- [ ] **Step 4: Commit**

```bash
git add 'apps/ialimp/app/api/admin/concursos/[id]/sobre-administrativo/route.ts'
git commit -m "feat(ialimp): endpoint del sobre administrativo + DEUC (concursos F3)"
```

---

## Task 9: Integración ialimp — UI (perfil + panel de sobre administrativo)

**Files:**
- Create: `apps/ialimp/app/admin/concursos/perfil/page.tsx`
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`

- [ ] **Step 1: Releer la página de concursos para imitar estilo**

Run: `cat apps/ialimp/app/admin/concursos/page.tsx`
Reutiliza la paleta `C` (con `var(--brand-*)`), `FONT` Nunito y el patrón de tarjeta/cabecera.

- [ ] **Step 2: Crear la página del perfil**

Crea `apps/ialimp/app/admin/concursos/perfil/page.tsx` (client component) que hace GET `/api/admin/concursos/perfil`, rellena un formulario (`razon_social`, `nif`, `domicilio`, `representante`, `representante_dni`, `email`, `telefono`, `es_pyme`) y al guardar hace PUT al mismo endpoint:

```tsx
'use client'
import { useEffect, useState } from 'react'

const C = { indigo:'var(--brand-primary)', soft:'var(--brand-light)', text:'#1e1b4b', bg:'#f1f5f9', card:'#fff', border:'#e2e8f0', muted:'#64748b' }
const FONT = 'Nunito, system-ui, sans-serif'

export default function PerfilConcursos() {
  const [p, setP] = useState<any>({ razon_social:'', nif:'', domicilio:'', representante:'', representante_dni:'', email:'', telefono:'', es_pyme:true })
  const [msg, setMsg] = useState('')

  useEffect(() => { (async () => {
    try { const r = await fetch('/api/admin/concursos/perfil').then(x=>x.json()); if (r.perfil) setP({ ...p, ...r.perfil }) } catch {}
  })() }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg('Guardando…')
    const r = await fetch('/api/admin/concursos/perfil', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(p) })
    setMsg(r.ok ? 'Guardado ✔' : 'Error al guardar')
  }
  const set = (k:string) => (e:any) => setP({ ...p, [k]: e.target.type==='checkbox' ? e.target.checked : e.target.value })

  return (
    <div style={{ fontFamily:FONT, color:C.text, background:C.bg, minHeight:'100vh', padding:16 }}>
      <h1 style={{ fontWeight:900, fontSize:24, margin:'0 0 4px' }}>Perfil de empresa (concursos)</h1>
      <p style={{ color:C.muted, fontSize:14, margin:'0 0 16px' }}>Estos datos rellenan el DEUC y la declaración responsable de cada concurso.</p>
      <form onSubmit={guardar} style={{ display:'grid', gap:10, maxWidth:560 }}>
        <input placeholder="Razón social" value={p.razon_social} onChange={set('razon_social')} required />
        <input placeholder="NIF / CIF" value={p.nif} onChange={set('nif')} required />
        <input placeholder="Domicilio" value={p.domicilio||''} onChange={set('domicilio')} />
        <input placeholder="Representante (apoderado)" value={p.representante||''} onChange={set('representante')} />
        <input placeholder="DNI del representante" value={p.representante_dni||''} onChange={set('representante_dni')} />
        <input placeholder="Email" value={p.email||''} onChange={set('email')} />
        <input placeholder="Teléfono" value={p.telefono||''} onChange={set('telefono')} />
        <label style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="checkbox" checked={p.es_pyme} onChange={set('es_pyme')} /> Es PYME
        </label>
        <button type="submit" style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'10px 16px', fontWeight:800 }}>Guardar</button>
        {msg && <span style={{ color:C.muted, fontSize:13 }}>{msg}</span>}
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Añadir el panel "Sobre administrativo" en la ficha**

En `apps/ialimp/app/admin/concursos/page.tsx`, dentro de `FichaView`, añade un botón "📋 Generar sobre administrativo" que hace GET `/api/admin/concursos/${c.id}/sobre-administrativo` y muestra: la lista del sobre (cada ítem con ✅ si `cubiertoPor`, ⬜ si no), un aviso enlazando a `/admin/concursos/perfil` si `perfil_completo===false`, y un resumen del DEUC (objeto, operador, nº de motivos de exclusión a favor) y de la declaración (nº de afirmaciones). Usa estado local `const [sobre, setSobre] = useState<any>(null)` y un `cargarSobre()` análogo a los fetch ya presentes. Añade además un enlace permanente "🏢 Perfil de empresa" junto al de "📚 Mi biblioteca" en la cabecera.

```tsx
// dentro de FichaView, tras los hooks existentes:
const [sobre, setSobre] = useState<any>(null)
const cargarSobre = async () => {
  try { const r = await fetch(`/api/admin/concursos/${c.id}/sobre-administrativo`).then(x=>x.json()); setSobre(r) } catch {}
}
// ...y en el render, tras el bloque de faltantes:
<button onClick={cargarSobre} style={{ background:C.soft, color:C.indigo, border:0, borderRadius:8, padding:'8px 14px', fontWeight:800, fontSize:13, marginTop:8 }}>
  📋 Generar sobre administrativo (DEUC)
</button>
{sobre && (
  <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
    {sobre.perfil_completo===false && (
      <div style={{ background:'#fef9c3', color:'#854d0e', borderRadius:8, padding:'6px 10px', fontSize:13, marginBottom:8 }}>
        Completa el <a href="/admin/concursos/perfil" style={{ color:C.indigo, fontWeight:800 }}>perfil de empresa</a> para rellenar el DEUC.
      </div>
    )}
    <strong style={{ fontSize:14 }}>Sobre administrativo</strong>
    <ul style={{ margin:'6px 0', paddingLeft:18, fontSize:14 }}>
      {sobre.sobre.map((it:any,i:number)=>(
        <li key={i}>{it.cubiertoPor ? '✅ ' : '⬜ '}{it.documento}{!it.obligatorio && <span style={{ color:C.muted }}> · opcional</span>}</li>
      ))}
    </ul>
    <div style={{ fontSize:13, color:C.muted }}>
      DEUC: {sobre.deuc?.operador?.razon_social || '(sin empresa)'} · objeto «{sobre.deuc?.procedimiento?.objeto||'—'}». Declaración responsable: {sobre.declaracion?.declara?.length||0} afirmaciones.
    </div>
  </div>
)}
```

- [ ] **Step 4: Añadir el enlace de perfil en la cabecera**

En el `<div>` de la cabecera de `page.tsx` (donde está el enlace "📚 Mi biblioteca →"), añade junto a él:

```tsx
<a href="/admin/concursos/perfil" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>🏢 Perfil de empresa →</a>
```

- [ ] **Step 5: Build de ialimp + suite del módulo**

Run: `cd /home/user/central/apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully`; módulo todos los tests verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/ialimp/app/admin/concursos/perfil/page.tsx apps/ialimp/app/admin/concursos/page.tsx
git commit -m "feat(ialimp): UI de perfil de empresa + sobre administrativo (concursos F3)"
```

---

## Task 10: Actualizar memoria y docs, y empujar

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada F3: módulo puro (`deuc.ts`: `documentosSobreAdministrativo`/`construirDeuc`/`construirDeclaracionResponsable` + tests) e integración ialimp (tabla `concursos_perfil_empresa`, endpoints de perfil y sobre administrativo, UI). Pendiente de Alberto: aplicar `add_concursos_perfil.sql`.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de F3: tabla `concursos_perfil_empresa`, endpoints `/api/admin/concursos/perfil` y `/api/admin/concursos/[id]/sobre-administrativo`, página `/admin/concursos/perfil`, y panel "Sobre administrativo" en la ficha. Aplicar `add_concursos_perfil.sql` a mano.

- [ ] **Step 3: Commit y push**

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión F3 sobre administrativo + DEUC (concursos)"
git push -u origin claude/public-tender-agent-module-mid0hu
```

---

## Notas de cierre

- **Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_perfil.sql` en la BD compartida.
- **Fuera de F3 (siguientes fases):** renderizado del DEUC/declaración al **PDF/XML oficial** (aquí solo se generan los datos); firma electrónica; F4 (memoria técnica) y F5 (oferta económica) consumen lo mismo.
- **Decisión de diseño:** el DEUC se modela como estructura de datos por partes (I–IV, VI) suficiente para un licitador PYME; la Parte V (reducción de candidatos) se omite por no aplicar en procedimiento abierto.
