# Concursos F2 — Biblioteca de empresa · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el licitador suba sus documentos/datos una sola vez (la "biblioteca de empresa") y que cada concurso autocomplete su checklist, marque lo que falta y avise de caducidades.

**Architecture:** Toda la lógica nueva es **TS puro** dentro de `packages/module-concursos/src/biblioteca.ts` (sin BD, sin IA, sin secretos), con sus tipos en `types.ts` y re-exports en `index.ts`. La app de referencia (ialimp) añade una tabla `biblioteca_documentos`, un endpoint y una página, y conecta el autocompletado a la pantalla `/admin/concursos` ya existente del v1.

**Tech Stack:** TypeScript puro; tests con `node --test` (type-stripping, sin bundler); Next.js + Prisma/Supabase en ialimp.

---

## File Structure

**Módulo puro (`packages/module-concursos/`):**
- Modify: `src/types.ts` — añade `TipoDocumentoBiblioteca`, `DocumentoBiblioteca`, `Biblioteca`.
- Create: `src/biblioteca.ts` — `tipoDeDocumento`, `autocompletarChecklist`, `documentosFaltantes`, `documentosCaducados`.
- Modify: `src/index.ts` — re-exporta lo nuevo.
- Modify: `test/concursos.test.ts` — bloque de tests de biblioteca (o `test/biblioteca.test.ts`).

**Integración de referencia (`apps/ialimp/`):**
- Create: `prisma/migrations/add_biblioteca_concursos.sql` — tabla `biblioteca_documentos`.
- Create: `app/api/admin/concursos/biblioteca/route.ts` — GET lista, POST alta.
- Create: `app/admin/concursos/biblioteca/page.tsx` — UI "Mi biblioteca".
- Modify: `app/admin/concursos/page.tsx` — autocompleta el checklist desde la biblioteca + enlace a "Mi biblioteca".

---

## Task 1: Tipos de la biblioteca

**Files:**
- Modify: `packages/module-concursos/src/types.ts` (al final, tras `EvaluacionGoNoGo`)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Biblioteca de empresa (F2) — documentos/datos reutilizables del licitador.
// Es lo que permite autocompletar el checklist de cada concurso.
// ────────────────────────────────────────────────────────────────────────────

/** Familia de documento del licitador (la app guarda el fichero aparte). */
export type TipoDocumentoBiblioteca =
  | 'escritura_constitucion'
  | 'poderes'
  | 'cif'
  | 'certificado_aeat'          // estar al corriente con Hacienda
  | 'certificado_ss'            // estar al corriente con la Seguridad Social
  | 'cuentas_anuales'
  | 'seguro_rc'                 // responsabilidad civil
  | 'clasificacion_empresarial'
  | 'certificado_iso'
  | 'declaracion_responsable'
  | 'deuc'
  | 'otro'

/** Un documento guardado en la biblioteca de la empresa. */
export interface DocumentoBiblioteca {
  tipo: TipoDocumentoBiblioteca
  nombre: string
  vigencia_hasta?: string                 // ISO 'YYYY-MM-DD' si caduca
  datos?: Record<string, unknown>         // metadatos (p.ej. nº de póliza)
}

export type Biblioteca = DocumentoBiblioteca[]
```

- [ ] **Step 2: Commit**

```bash
git add packages/module-concursos/src/types.ts
git commit -m "feat(concursos): tipos de la biblioteca de empresa (F2)"
```

---

## Task 2: Clasificador `tipoDeDocumento` (heurística pura)

Mapea el nombre de un documento requerido por el pliego a un `TipoDocumentoBiblioteca`. Es la base del autocompletado: conservador (ante la duda, `undefined`).

**Files:**
- Create: `packages/module-concursos/src/biblioteca.ts`
- Test: `packages/module-concursos/test/biblioteca.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-concursos/test/biblioteca.test.ts`:

```ts
// Tests de la lógica PURA de la biblioteca de empresa (F2).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipoDeDocumento } from '../src/biblioteca.ts'

test('tipoDeDocumento: reconoce AEAT y Seguridad Social', () => {
  assert.equal(tipoDeDocumento('Certificado de estar al corriente con la AEAT'), 'certificado_aeat')
  assert.equal(tipoDeDocumento('Certificado de la Agencia Tributaria'), 'certificado_aeat')
  assert.equal(tipoDeDocumento('Estar al corriente con la Seguridad Social'), 'certificado_ss')
})

test('tipoDeDocumento: reconoce escritura, poderes, CIF', () => {
  assert.equal(tipoDeDocumento('Escritura de constitución de la sociedad'), 'escritura_constitucion')
  assert.equal(tipoDeDocumento('Poder de representación / apoderamiento'), 'poderes')
  assert.equal(tipoDeDocumento('Tarjeta de identificación fiscal (CIF)'), 'cif')
})

test('tipoDeDocumento: reconoce seguro RC, ISO, clasificación, DEUC', () => {
  assert.equal(tipoDeDocumento('Póliza de responsabilidad civil'), 'seguro_rc')
  assert.equal(tipoDeDocumento('Certificado ISO 9001'), 'certificado_iso')
  assert.equal(tipoDeDocumento('Clasificación empresarial del contratista'), 'clasificacion_empresarial')
  assert.equal(tipoDeDocumento('Declaración responsable (DEUC o modelo del pliego)'), 'deuc')
})

test('tipoDeDocumento: devuelve undefined cuando no reconoce', () => {
  assert.equal(tipoDeDocumento('Memoria técnica de la propuesta'), undefined)
  assert.equal(tipoDeDocumento('Oferta económica (modelo del pliego)'), undefined)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: FAIL — `Cannot find module '../src/biblioteca.ts'`.

- [ ] **Step 3: Implementar `biblioteca.ts` (solo el clasificador)**

Crea `packages/module-concursos/src/biblioteca.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Biblioteca de empresa (F2) — PURO. Conecta los documentos requeridos por el
// pliego con los que la empresa ya tiene guardados, para autocompletar el
// checklist, listar lo que falta y avisar de caducidades. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  Biblioteca,
  DocumentoBiblioteca,
  DocumentoRequerido,
  FichaConcurso,
  ItemChecklist,
  TipoDocumentoBiblioteca,
} from './types'

/** Reglas nombre→tipo, evaluadas en orden (la primera que casa gana). */
const REGLAS: { tipo: TipoDocumentoBiblioteca; claves: string[] }[] = [
  { tipo: 'certificado_aeat', claves: ['aeat', 'agencia tributaria', 'hacienda'] },
  { tipo: 'certificado_ss', claves: ['seguridad social'] },
  { tipo: 'escritura_constitucion', claves: ['escritura'] },
  { tipo: 'poderes', claves: ['poder', 'apoderamiento'] },
  { tipo: 'cif', claves: ['cif', 'nif', 'identificacion fiscal'] },
  { tipo: 'cuentas_anuales', claves: ['cuentas anuales', 'balance'] },
  { tipo: 'seguro_rc', claves: ['responsabilidad civil', 'poliza', 'seguro'] },
  { tipo: 'clasificacion_empresarial', claves: ['clasificacion'] },
  { tipo: 'certificado_iso', claves: ['iso 9001', 'iso 14001', 'certificado iso'] },
  // DEUC antes que 'declaración responsable' genérica para que el DEUC gane.
  { tipo: 'deuc', claves: ['deuc'] },
  { tipo: 'declaracion_responsable', claves: ['declaracion responsable'] },
]

/** Normaliza: minúsculas, sin acentos, espacios colapsados. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // diacríticos combinados
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clasifica el nombre de un documento requerido en un tipo de biblioteca.
 * Conservador: devuelve `undefined` si no reconoce nada con confianza.
 */
export function tipoDeDocumento(nombre: string): TipoDocumentoBiblioteca | undefined {
  const n = norm(nombre)
  for (const regla of REGLAS) {
    if (regla.claves.some(c => n.includes(c))) return regla.tipo
  }
  return undefined
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/biblioteca.ts packages/module-concursos/test/biblioteca.test.ts
git commit -m "feat(concursos): clasificador tipoDeDocumento de la biblioteca (F2)"
```

---

## Task 3: `autocompletarChecklist`

Marca `hecho=true` los ítems del checklist cuyo documento esté cubierto por la biblioteca. No muta la entrada.

**Files:**
- Modify: `packages/module-concursos/src/biblioteca.ts`
- Modify: `packages/module-concursos/test/biblioteca.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/biblioteca.test.ts`:

```ts
import { autocompletarChecklist } from '../src/biblioteca.ts'
import type { Biblioteca, ItemChecklist } from '../src/types.ts'

const BIBLIO: Biblioteca = [
  { tipo: 'certificado_aeat', nombre: 'Certificado AEAT 2026' },
  { tipo: 'certificado_ss', nombre: 'Certificado SS 2026' },
]

test('autocompletarChecklist: marca hecho lo que cubre la biblioteca', () => {
  const checklist: ItemChecklist[] = [
    { sobre: 'administrativo', documento: 'Certificado de estar al corriente con la AEAT', obligatorio: true, hecho: false },
    { sobre: 'administrativo', documento: 'Certificado de la Seguridad Social', obligatorio: true, hecho: false },
    { sobre: 'tecnico', documento: 'Memoria técnica', obligatorio: true, hecho: false },
  ]
  const out = autocompletarChecklist(checklist, BIBLIO)
  assert.equal(out[0].hecho, true)
  assert.equal(out[1].hecho, true)
  assert.equal(out[2].hecho, false) // memoria no está en la biblioteca
})

test('autocompletarChecklist: no muta la entrada', () => {
  const checklist: ItemChecklist[] = [
    { sobre: 'administrativo', documento: 'Certificado AEAT', obligatorio: true, hecho: false },
  ]
  autocompletarChecklist(checklist, BIBLIO)
  assert.equal(checklist[0].hecho, false)
})

test('autocompletarChecklist: biblioteca vacía deja todo igual', () => {
  const checklist: ItemChecklist[] = [
    { sobre: 'administrativo', documento: 'Certificado AEAT', obligatorio: true, hecho: false },
  ]
  const out = autocompletarChecklist(checklist, [])
  assert.equal(out[0].hecho, false)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: FAIL — `autocompletarChecklist is not a function` / no exportada.

- [ ] **Step 3: Implementar**

Añade a `src/biblioteca.ts`:

```ts
/** Conjunto de tipos presentes en la biblioteca (para lookup O(1)). */
function tiposEnBiblioteca(biblioteca: Biblioteca): Set<TipoDocumentoBiblioteca> {
  return new Set(biblioteca.map(d => d.tipo))
}

/**
 * Devuelve una copia del checklist con `hecho=true` en los ítems cuyo documento
 * esté cubierto por la biblioteca. Conservador: solo marca lo que reconoce.
 */
export function autocompletarChecklist(
  checklist: ItemChecklist[],
  biblioteca: Biblioteca,
): ItemChecklist[] {
  const tipos = tiposEnBiblioteca(biblioteca)
  return checklist.map(item => {
    const tipo = tipoDeDocumento(item.documento)
    const cubierto = tipo !== undefined && tipos.has(tipo)
    return cubierto ? { ...item, hecho: true } : { ...item }
  })
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/biblioteca.ts packages/module-concursos/test/biblioteca.test.ts
git commit -m "feat(concursos): autocompletarChecklist desde la biblioteca (F2)"
```

---

## Task 4: `documentosFaltantes`

Lista los documentos del concurso que la biblioteca **no** cubre todavía (para que el usuario sepa qué subir).

**Files:**
- Modify: `packages/module-concursos/src/biblioteca.ts`
- Modify: `packages/module-concursos/test/biblioteca.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/biblioteca.test.ts`:

```ts
import { documentosFaltantes } from '../src/biblioteca.ts'
import type { FichaConcurso } from '../src/types.ts'

function fichaConDocs(): FichaConcurso {
  return {
    objeto: 'x', tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [],
    documentos: [
      { nombre: 'Certificado de estar al corriente con la AEAT', sobre: 'administrativo', obligatorio: true },
      { nombre: 'Póliza de responsabilidad civil', sobre: 'administrativo', obligatorio: true },
      { nombre: 'Memoria técnica', sobre: 'tecnico', obligatorio: true },
    ],
  }
}

test('documentosFaltantes: devuelve lo no cubierto por la biblioteca', () => {
  const biblio: Biblioteca = [{ tipo: 'certificado_aeat', nombre: 'AEAT' }]
  const faltan = documentosFaltantes(fichaConDocs(), biblio)
  const nombres = faltan.map(d => d.nombre)
  assert.ok(!nombres.includes('Certificado de estar al corriente con la AEAT')) // cubierto
  assert.ok(nombres.includes('Póliza de responsabilidad civil'))               // no en biblioteca
  assert.ok(nombres.includes('Memoria técnica'))                               // tipo no reconocido → falta
})

test('documentosFaltantes: biblioteca vacía → faltan todos', () => {
  const faltan = documentosFaltantes(fichaConDocs(), [])
  assert.equal(faltan.length, 3)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: FAIL — `documentosFaltantes is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/biblioteca.ts`:

```ts
/**
 * Documentos requeridos por el concurso que la biblioteca NO cubre todavía.
 * Un documento se considera cubierto solo si su tipo se reconoce y está en la
 * biblioteca; los de tipo no reconocido siempre cuentan como faltantes.
 */
export function documentosFaltantes(
  ficha: FichaConcurso,
  biblioteca: Biblioteca,
): DocumentoRequerido[] {
  const tipos = tiposEnBiblioteca(biblioteca)
  return ficha.documentos.filter(d => {
    const tipo = tipoDeDocumento(d.nombre)
    const cubierto = tipo !== undefined && tipos.has(tipo)
    return !cubierto
  })
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/biblioteca.ts packages/module-concursos/test/biblioteca.test.ts
git commit -m "feat(concursos): documentosFaltantes de la biblioteca (F2)"
```

---

## Task 5: `documentosCaducados`

Avisa de documentos caducados o que caducarán antes de una fecha límite (típicamente `fin_presentacion`). Las fechas son ISO `YYYY-MM-DD`, comparables lexicográficamente.

**Files:**
- Modify: `packages/module-concursos/src/biblioteca.ts`
- Modify: `packages/module-concursos/test/biblioteca.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/biblioteca.test.ts`:

```ts
import { documentosCaducados } from '../src/biblioteca.ts'

const BIBLIO_VIG: Biblioteca = [
  { tipo: 'certificado_aeat', nombre: 'AEAT', vigencia_hasta: '2026-05-01' }, // ya caducado
  { tipo: 'certificado_ss', nombre: 'SS', vigencia_hasta: '2026-07-15' },     // vigente hoy, caduca antes del límite
  { tipo: 'seguro_rc', nombre: 'RC' },                                        // sin vigencia → nunca caduca
]

test('documentosCaducados: con hoy detecta solo lo ya vencido', () => {
  const out = documentosCaducados(BIBLIO_VIG, '2026-06-11')
  assert.deepEqual(out.map(d => d.tipo), ['certificado_aeat'])
})

test('documentosCaducados: con límite (fin de plazo) detecta lo que vencerá antes', () => {
  const out = documentosCaducados(BIBLIO_VIG, '2026-06-11', '2026-08-01')
  assert.deepEqual(out.map(d => d.tipo), ['certificado_aeat', 'certificado_ss'])
})

test('documentosCaducados: documentos sin vigencia_hasta nunca se listan', () => {
  const out = documentosCaducados([{ tipo: 'otro', nombre: 'x' }], '2026-06-11')
  assert.equal(out.length, 0)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: FAIL — `documentosCaducados is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/biblioteca.ts`:

```ts
/**
 * Documentos cuya vigencia termina antes de la fecha de corte. La fecha de corte
 * es `limite` (p.ej. el fin de plazo de presentación) si se da; si no, `hoy`.
 * Así se avisa de lo que caducará ANTES de poder presentar. Fechas ISO
 * 'YYYY-MM-DD' (orden lexicográfico = orden cronológico).
 */
export function documentosCaducados(
  biblioteca: Biblioteca,
  hoy: string,
  limite?: string,
): DocumentoBiblioteca[] {
  const corte = limite ?? hoy
  return biblioteca.filter(d => d.vigencia_hasta !== undefined && d.vigencia_hasta < corte)
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd packages/module-concursos && node --test test/biblioteca.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/biblioteca.ts packages/module-concursos/test/biblioteca.test.ts
git commit -m "feat(concursos): documentosCaducados de la biblioteca (F2)"
```

---

## Task 6: Re-exports en `index.ts` y suite completa

**Files:**
- Modify: `packages/module-concursos/src/index.ts`

- [ ] **Step 1: Añadir los re-exports**

En `src/index.ts`, tras el bloque de scoring, añade:

```ts
// Biblioteca de empresa (puro): autocompletado del checklist + caducidades
export {
  tipoDeDocumento,
  autocompletarChecklist,
  documentosFaltantes,
  documentosCaducados,
} from './biblioteca'
```

Y dentro del `export type { … } from './types'` añade los tres tipos nuevos:

```ts
  TipoDocumentoBiblioteca,
  DocumentoBiblioteca,
  Biblioteca,
```

- [ ] **Step 2: Ejecutar TODA la suite del módulo**

Run: `cd packages/module-concursos && npm test`
Expected: PASS — los 28 tests del v1 + los nuevos de biblioteca, todos verdes.

- [ ] **Step 3: Commit**

```bash
git add packages/module-concursos/src/index.ts
git commit -m "feat(concursos): exporta la API de la biblioteca de empresa (F2)"
```

---

## Task 7: Integración ialimp — migración de BD

**Files:**
- Create: `apps/ialimp/prisma/migrations/add_biblioteca_concursos.sql`

> Nota: esta migración se aplica a mano en la BD compartida (como `add_concursos.sql` del v1); no se ejecuta en build.

- [ ] **Step 1: Leer la migración del v1 para imitar estilo/scope**

Run: `cat apps/ialimp/prisma/migrations/add_concursos.sql`
Observa cómo scopea por `empresa_id` y el uso de `jsonb`.

- [ ] **Step 2: Crear la migración**

Crea `apps/ialimp/prisma/migrations/add_biblioteca_concursos.sql`:

```sql
-- Biblioteca de empresa (F2 del módulo de concursos).
-- Documentos reutilizables del licitador, scopeados por empresa.
create table if not exists biblioteca_documentos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  tipo         text not null,            -- TipoDocumentoBiblioteca del módulo
  nombre       text not null,
  storage_key  text,                     -- ruta en Supabase Storage (fichero)
  vigencia_hasta date,                   -- null = no caduca
  datos        jsonb not null default '{}'::jsonb,
  creado_en    timestamptz not null default now()
);

create index if not exists biblioteca_documentos_empresa_idx
  on biblioteca_documentos (empresa_id);
```

- [ ] **Step 3: Commit**

```bash
git add apps/ialimp/prisma/migrations/add_biblioteca_concursos.sql
git commit -m "feat(ialimp): migración biblioteca_documentos (concursos F2)"
```

---

## Task 8: Integración ialimp — endpoint de la biblioteca

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/biblioteca/route.ts`

- [ ] **Step 1: Leer el endpoint del v1 para reutilizar auth/scope/cliente Supabase**

Run: `cat apps/ialimp/app/api/admin/concursos/analizar/route.ts`
Reutiliza el MISMO patrón de obtención de `empresa_id` (sesión) y el cliente Supabase con `SB_OPTS`/schema que ya usa esa ruta. No inventes uno nuevo.

- [ ] **Step 2: Crear el endpoint**

Crea `apps/ialimp/app/api/admin/concursos/biblioteca/route.ts` siguiendo el patrón del v1. Forma esperada (adapta los imports de auth/cliente a los reales del v1):

```ts
import { NextRequest, NextResponse } from 'next/server'
// import { getEmpresaId, supa } from '...'  // ← usar los MISMOS helpers que analizar/route.ts

// GET: lista los documentos de la biblioteca de la empresa.
export async function GET(_req: NextRequest) {
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'no auth' }, { status: 401 })
  const { data, error } = await supa()
    .from('biblioteca_documentos')
    .select('id, tipo, nombre, vigencia_hasta, datos, creado_en')
    .eq('empresa_id', empresaId)
    .order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documentos: data ?? [] })
}

// POST: alta de un documento { tipo, nombre, vigencia_hasta?, datos? }.
export async function POST(req: NextRequest) {
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'no auth' }, { status: 401 })
  const body = await req.json()
  if (!body?.tipo || !body?.nombre) {
    return NextResponse.json({ error: 'tipo y nombre son obligatorios' }, { status: 400 })
  }
  const { error } = await supa().from('biblioteca_documentos').insert({
    empresa_id: empresaId,
    tipo: String(body.tipo),
    nombre: String(body.nombre),
    vigencia_hasta: body.vigencia_hasta ?? null,
    datos: body.datos ?? {},
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd apps/ialimp && npm run build`
Expected: `✓ Compiled successfully`, con la ruta `/api/admin/concursos/biblioteca` emitida.

- [ ] **Step 4: Commit**

```bash
git add apps/ialimp/app/api/admin/concursos/biblioteca/route.ts
git commit -m "feat(ialimp): endpoint de la biblioteca de empresa (concursos F2)"
```

---

## Task 9: Integración ialimp — página "Mi biblioteca"

**Files:**
- Create: `apps/ialimp/app/admin/concursos/biblioteca/page.tsx`

- [ ] **Step 1: Leer la página del v1 para imitar layout/estilos**

Run: `cat apps/ialimp/app/admin/concursos/page.tsx`
Reutiliza el mismo contenedor/clases que la página de concursos.

- [ ] **Step 2: Crear la página**

Crea `apps/ialimp/app/admin/concursos/biblioteca/page.tsx`: un client component que lista los documentos (GET) y permite dar de alta uno nuevo (POST) con un `<select>` de `tipo` (los valores de `TipoDocumentoBiblioteca`) + `nombre` + `vigencia_hasta` opcional. Estructura mínima:

```tsx
'use client'
import { useEffect, useState } from 'react'

const TIPOS = [
  'escritura_constitucion', 'poderes', 'cif', 'certificado_aeat', 'certificado_ss',
  'cuentas_anuales', 'seguro_rc', 'clasificacion_empresarial', 'certificado_iso',
  'declaracion_responsable', 'deuc', 'otro',
] as const

type Doc = { id: string; tipo: string; nombre: string; vigencia_hasta: string | null }

export default function BibliotecaPage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [tipo, setTipo] = useState<string>('certificado_aeat')
  const [nombre, setNombre] = useState('')
  const [vigencia, setVigencia] = useState('')

  async function cargar() {
    const r = await fetch('/api/admin/concursos/biblioteca')
    const j = await r.json()
    setDocs(j.documentos ?? [])
  }
  useEffect(() => { cargar() }, [])

  async function alta(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/admin/concursos/biblioteca', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, nombre, vigencia_hasta: vigencia || undefined }),
    })
    setNombre(''); setVigencia('')
    cargar()
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h1>Mi biblioteca</h1>
      <p>Sube tus documentos una vez; cada concurso autocompletará su checklist.</p>
      <form onSubmit={alta} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Nombre del documento" value={nombre} onChange={e => setNombre(e.target.value)} required />
        <input type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} />
        <button type="submit">Añadir</button>
      </form>
      <ul>
        {docs.map(d => (
          <li key={d.id}>
            <strong>{d.tipo}</strong> — {d.nombre}
            {d.vigencia_hasta ? ` (vigente hasta ${d.vigencia_hasta})` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd apps/ialimp && npm run build`
Expected: `✓ Compiled successfully`, ruta `/admin/concursos/biblioteca` emitida.

- [ ] **Step 4: Commit**

```bash
git add apps/ialimp/app/admin/concursos/biblioteca/page.tsx
git commit -m "feat(ialimp): página Mi biblioteca (concursos F2)"
```

---

## Task 10: Conectar el autocompletado en `/admin/concursos`

Hace que, al ver un concurso, el checklist llegue autocompletado desde la biblioteca y se muestren los documentos que faltan.

**Files:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`
- Posible Modify: `apps/ialimp/lib/concursos.ts` (si ahí vive la carga de datos)

- [ ] **Step 1: Localizar dónde se construye/persiste el checklist**

Run: `cat apps/ialimp/app/admin/concursos/page.tsx apps/ialimp/lib/concursos.ts`
Identifica dónde se obtiene el `checklist` del concurso y dónde se podría cargar la biblioteca (GET a `/api/admin/concursos/biblioteca` o lectura directa en server).

- [ ] **Step 2: Aplicar el autocompletado**

Importa desde el módulo y aplica `autocompletarChecklist` sobre el checklist antes de renderizarlo, y muestra `documentosFaltantes`:

```ts
import { autocompletarChecklist, documentosFaltantes } from '@iarest/module-concursos'
import type { Biblioteca } from '@iarest/module-concursos'

// biblioteca: Biblioteca cargada de /api/admin/concursos/biblioteca (mapear filas → {tipo,nombre,vigencia_hasta})
const checklistMostrado = autocompletarChecklist(concurso.checklist, biblioteca)
const faltan = documentosFaltantes(concurso.ficha, biblioteca)
```

Renderiza un aviso "Te faltan N documentos en la biblioteca" enlazando a `/admin/concursos/biblioteca`. Añade también un enlace permanente a "Mi biblioteca" en la cabecera de la página.

- [ ] **Step 3: Build de ialimp + suite del módulo**

Run: `cd apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully`; módulo todos los tests verdes.

- [ ] **Step 4: Commit**

```bash
git add apps/ialimp/app/admin/concursos/page.tsx apps/ialimp/lib/concursos.ts
git commit -m "feat(ialimp): autocompleta el checklist desde la biblioteca (concursos F2)"
```

---

## Task 11: Actualizar memoria de sesión y empujar

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`

- [ ] **Step 1: Añadir entrada arriba en "Estado actual"**

Resume F2: biblioteca de empresa (módulo puro: `tipoDeDocumento`/`autocompletarChecklist`/`documentosFaltantes`/`documentosCaducados` + tests) e integración ialimp (tabla `biblioteca_documentos`, endpoint, página, autocompletado en `/admin/concursos`). Anota el pendiente de Alberto: aplicar `add_biblioteca_concursos.sql` en la BD compartida.

- [ ] **Step 2: Commit y push**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs: registro de sesión F2 biblioteca de empresa (concursos)"
git push -u origin claude/public-tender-agent-module-mid0hu
```

---

## Notas de cierre

- **Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_biblioteca_concursos.sql` en la BD compartida (no se aplica desde la sesión, igual que el v1).
- **Fuera de F2 (siguientes fases):** subida real del fichero a Storage (aquí solo se guardan metadatos + `storage_key`), DEUC (F3) y memoria técnica (F4) que consumen esta biblioteca.
