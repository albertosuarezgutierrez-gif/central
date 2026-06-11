# Concursos F4 — Memoria técnica que puntúa · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar la memoria técnica de un concurso atacando los criterios de juicio de valor, y estimar cuántos puntos técnicos cubre.

**Architecture:** Lógica nueva **TS pura** en `packages/module-concursos/src/memoria.ts` (sin BD/IA/secretos): deriva el **esquema** de la memoria desde los criterios de juicio de valor de la ficha, construye el **prompt** por sección (la app lo pasa al LLM vía `AiRunner`, igual que `construirPromptPliego`), y calcula la **cobertura** (puntos técnicos cubiertos vs totales). La app de referencia (ialimp) persiste la memoria en `concursos.memoria` (jsonb), llama a `aiComplete` por sección y la muestra/edita.

**Tech Stack:** TypeScript puro; tests con `node --test` (type-stripping); Next.js + Prisma/Supabase en ialimp; LLM NVIDIA vía core-ai.

---

## File Structure

**Módulo puro (`packages/module-concursos/`):**
- Modify: `src/types.ts` — `SeccionMemoria`, `SeccionMemoriaRellena`, `MemoriaTecnica`, `CoberturaMemoria`.
- Create: `src/memoria.ts` — `planificarMemoria`, `construirPromptMemoria`, `coberturaMemoria`.
- Modify: `src/index.ts` — re-exporta lo nuevo.
- Create: `test/memoria.test.ts` — tests de las tres funciones.

**Integración de referencia (`apps/ialimp/`):**
- Create: `prisma/migrations/add_concursos_memoria.sql` — columna `concursos.memoria` jsonb.
- Create: `app/api/admin/concursos/[id]/memoria/route.ts` — POST genera (LLM por sección) + persiste; GET devuelve memoria + cobertura.
- Modify: `app/admin/concursos/page.tsx` — panel "Memoria técnica" en la ficha.

---

## Task 1: Tipos de F4

**Files:**
- Modify: `packages/module-concursos/src/types.ts` (al final, tras los tipos de F3)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Memoria técnica (F4) — ataca los criterios de juicio de valor y estima puntos.
// El módulo planifica y construye el prompt; la app llama al LLM por sección.
// ────────────────────────────────────────────────────────────────────────────

/** Una sección de la memoria, ligada a un criterio de juicio de valor. */
export interface SeccionMemoria {
  criterio: string        // nombre del criterio de adjudicación
  puntos_max: number      // puntos que reparte ese criterio
  guia: string            // qué debe demostrar esta sección para puntuar
}

/** Sección con el texto ya redactado (por el LLM o a mano). */
export interface SeccionMemoriaRellena extends SeccionMemoria {
  contenido: string
}

/** Memoria técnica completa (todas las secciones redactadas). */
export interface MemoriaTecnica {
  secciones: SeccionMemoriaRellena[]
}

/** Estimación de cuántos puntos técnicos cubre la memoria redactada. */
export interface CoberturaMemoria {
  puntos_cubiertos: number   // suma de puntos de las secciones con contenido suficiente
  puntos_totales: number     // suma de puntos de todos los criterios de juicio de valor
  pct: number                // 0–100, redondeado a entero
  vacias: string[]           // criterios cuya sección sigue vacía/insuficiente
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/module-concursos/src/types.ts
git commit -m "feat(concursos): tipos de la memoria técnica (F4)"
```

---

## Task 2: `planificarMemoria`

Deriva el esquema de la memoria desde los criterios de juicio de valor de la ficha. Determinista.

**Files:**
- Create: `packages/module-concursos/src/memoria.ts`
- Test: `packages/module-concursos/test/memoria.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-concursos/test/memoria.test.ts`:

```ts
// Tests de la lógica PURA de la memoria técnica (F4).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { planificarMemoria } from '../src/memoria.ts'
import type { FichaConcurso } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'Servicio de limpieza de un colegio',
    tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

test('planificarMemoria: una sección por criterio de juicio de valor', () => {
  const ficha = fichaBase({ criterios: [
    { nombre: 'Plan de trabajo', puntos: 30, tipo: 'juicio_valor', sobre: 'tecnico' },
    { nombre: 'Mejoras', puntos: 10, tipo: 'juicio_valor', sobre: 'tecnico' },
    { nombre: 'Precio', puntos: 60, tipo: 'automatico', sobre: 'economico' },
  ] })
  const secciones = planificarMemoria(ficha)
  assert.equal(secciones.length, 2) // solo los de juicio de valor
  assert.equal(secciones[0].criterio, 'Plan de trabajo')
  assert.equal(secciones[0].puntos_max, 30)
  assert.ok(secciones[0].guia.length > 0)
})

test('planificarMemoria: ordena por puntos descendente', () => {
  const ficha = fichaBase({ criterios: [
    { nombre: 'B', puntos: 10, tipo: 'juicio_valor' },
    { nombre: 'A', puntos: 25, tipo: 'juicio_valor' },
  ] })
  const secciones = planificarMemoria(ficha)
  assert.deepEqual(secciones.map(s => s.criterio), ['A', 'B'])
})

test('planificarMemoria: sin criterios de juicio de valor → array vacío', () => {
  const ficha = fichaBase({ criterios: [{ nombre: 'Precio', puntos: 100, tipo: 'automatico' }] })
  assert.deepEqual(planificarMemoria(ficha), [])
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/memoria.test.ts`
Expected: FAIL — `Cannot find module '../src/memoria.ts'`.

- [ ] **Step 3: Implementar `memoria.ts` (solo `planificarMemoria`)**

Crea `packages/module-concursos/src/memoria.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Memoria técnica (F4) — PURO. Planifica las secciones desde los criterios de
// juicio de valor, construye el prompt por sección (la app llama al LLM) y
// estima la cobertura de puntos. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  CoberturaMemoria,
  FichaConcurso,
  SeccionMemoria,
  SeccionMemoriaRellena,
} from './types'

/** Longitud mínima de contenido para considerar que una sección "puntúa". */
export const MIN_CONTENIDO_CHARS = 80

/**
 * Esquema de la memoria: una sección por cada criterio de JUICIO DE VALOR,
 * ordenadas por puntos descendente (atacar primero lo que más reparte).
 */
export function planificarMemoria(ficha: FichaConcurso): SeccionMemoria[] {
  return ficha.criterios
    .filter(c => c.tipo === 'juicio_valor')
    .slice()
    .sort((a, b) => b.puntos - a.puntos)
    .map(c => ({
      criterio: c.nombre,
      puntos_max: c.puntos,
      guia: `Demuestra de forma concreta y verificable cómo la propuesta satisface «${c.nombre}» `
        + `(reparte hasta ${c.puntos} puntos). Aporta medios, metodología, plazos y ejemplos; evita el relleno genérico.`,
    }))
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/memoria.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/memoria.ts packages/module-concursos/test/memoria.test.ts
git commit -m "feat(concursos): planificarMemoria desde criterios de juicio de valor (F4)"
```

---

## Task 3: `construirPromptMemoria`

Construye el par `{system, user}` para que el LLM redacte una sección. Puro (como `construirPromptPliego`).

**Files:**
- Modify: `packages/module-concursos/src/memoria.ts`
- Modify: `packages/module-concursos/test/memoria.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/memoria.test.ts`:

```ts
import { construirPromptMemoria } from '../src/memoria.ts'
import type { SeccionMemoria } from '../src/types.ts'

const SECCION: SeccionMemoria = { criterio: 'Plan de trabajo', puntos_max: 30, guia: 'Detalla el plan.' }

test('construirPromptMemoria: incluye objeto, criterio, puntos y contexto', () => {
  const ficha = fichaBase({ objeto: 'Limpieza de un colegio' })
  const { system, user } = construirPromptMemoria(ficha, SECCION, 'Tenemos 12 limpiadoras y 8 años de experiencia.')
  assert.ok(system.length > 0)
  assert.ok(user.includes('Limpieza de un colegio'))
  assert.ok(user.includes('Plan de trabajo'))
  assert.ok(user.includes('30'))
  assert.ok(user.includes('12 limpiadoras'))
})

test('construirPromptMemoria: funciona sin contexto de empresa', () => {
  const { user } = construirPromptMemoria(fichaBase(), SECCION)
  assert.ok(user.includes('Plan de trabajo'))
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/memoria.test.ts`
Expected: FAIL — `construirPromptMemoria is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/memoria.ts`:

```ts
const SYSTEM_MEMORIA = `Eres un consultor experto en redactar memorias técnicas para concursos públicos españoles (LCSP).
Redactas la sección que responde a un criterio de adjudicación de "juicio de valor" para MAXIMIZAR la puntuación.

Reglas:
- Escribe en español, en prosa profesional y estructurada (puedes usar subtítulos y listas).
- Sé concreto y verificable: medios, metodología, plazos, indicadores, ejemplos. Nada de relleno genérico.
- No inventes datos de la empresa: usa solo el contexto aportado; si falta un dato, descríbelo como compromiso ("se asignará…").
- No te salgas del criterio de esta sección. No incluyas precios.
- Devuelve SOLO el texto de la sección (sin JSON, sin comentarios meta).`

/**
 * Prompt para redactar UNA sección de la memoria. La app pasa {system, user}
 * al LLM por el puerto AiRunner y guarda la respuesta como `contenido`.
 */
export function construirPromptMemoria(
  ficha: FichaConcurso,
  seccion: SeccionMemoria,
  contextoEmpresa?: string,
): { system: string; user: string } {
  const contexto = (contextoEmpresa || '').trim()
  const user = `Objeto del contrato: ${ficha.objeto}
Criterio a puntuar: «${seccion.criterio}» (hasta ${seccion.puntos_max} puntos).
Qué debe demostrar: ${seccion.guia}
${contexto ? `\nContexto de la empresa (úsalo, no lo contradigas):\n${contexto}\n` : ''}
Redacta la sección de la memoria técnica para este criterio. Devuelve SOLO el texto.`
  return { system: SYSTEM_MEMORIA, user }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/memoria.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/memoria.ts packages/module-concursos/test/memoria.test.ts
git commit -m "feat(concursos): construirPromptMemoria por sección (F4)"
```

---

## Task 4: `coberturaMemoria`

Estima los puntos técnicos cubiertos: una sección puntúa si su contenido alcanza `MIN_CONTENIDO_CHARS`.

**Files:**
- Modify: `packages/module-concursos/src/memoria.ts`
- Modify: `packages/module-concursos/test/memoria.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/memoria.test.ts`:

```ts
import { coberturaMemoria } from '../src/memoria.ts'
import type { SeccionMemoriaRellena } from '../src/types.ts'

const FICHA_2CRIT = fichaBase({ criterios: [
  { nombre: 'Plan de trabajo', puntos: 30, tipo: 'juicio_valor' },
  { nombre: 'Mejoras', puntos: 10, tipo: 'juicio_valor' },
] })

test('coberturaMemoria: cuenta puntos de las secciones con contenido suficiente', () => {
  const secciones: SeccionMemoriaRellena[] = [
    { criterio: 'Plan de trabajo', puntos_max: 30, guia: '', contenido: 'x'.repeat(120) }, // cubierta
    { criterio: 'Mejoras', puntos_max: 10, guia: '', contenido: 'corto' },                  // insuficiente
  ]
  const cob = coberturaMemoria(secciones, FICHA_2CRIT)
  assert.equal(cob.puntos_totales, 40)
  assert.equal(cob.puntos_cubiertos, 30)
  assert.equal(cob.pct, 75)
  assert.deepEqual(cob.vacias, ['Mejoras'])
})

test('coberturaMemoria: sin secciones → 0% y todos los criterios vacíos', () => {
  const cob = coberturaMemoria([], FICHA_2CRIT)
  assert.equal(cob.puntos_cubiertos, 0)
  assert.equal(cob.puntos_totales, 40)
  assert.equal(cob.pct, 0)
  assert.deepEqual(cob.vacias.sort(), ['Mejoras', 'Plan de trabajo'])
})

test('coberturaMemoria: sin criterios de juicio de valor → 0 totales y pct 0', () => {
  const cob = coberturaMemoria([], fichaBase({ criterios: [{ nombre: 'Precio', puntos: 100, tipo: 'automatico' }] }))
  assert.equal(cob.puntos_totales, 0)
  assert.equal(cob.pct, 0)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/memoria.test.ts`
Expected: FAIL — `coberturaMemoria is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/memoria.ts`:

```ts
/**
 * Estima la cobertura de puntos de la memoria. Una sección "puntúa" si su
 * contenido alcanza MIN_CONTENIDO_CHARS. Los criterios de juicio de valor sin
 * sección suficiente se listan en `vacias`. `pct` se redondea a entero (0 si no
 * hay puntos técnicos en juego).
 */
export function coberturaMemoria(
  secciones: SeccionMemoriaRellena[],
  ficha: FichaConcurso,
): CoberturaMemoria {
  const criteriosJV = ficha.criterios.filter(c => c.tipo === 'juicio_valor')
  const puntos_totales = criteriosJV.reduce((s, c) => s + c.puntos, 0)

  const suficiente = new Map<string, number>() // criterio → puntos, si está bien cubierto
  for (const s of secciones) {
    if ((s.contenido || '').trim().length >= MIN_CONTENIDO_CHARS) {
      suficiente.set(s.criterio, s.puntos_max)
    }
  }

  let puntos_cubiertos = 0
  const vacias: string[] = []
  for (const c of criteriosJV) {
    if (suficiente.has(c.nombre)) puntos_cubiertos += c.puntos
    else vacias.push(c.nombre)
  }

  const pct = puntos_totales > 0 ? Math.round((puntos_cubiertos / puntos_totales) * 100) : 0
  return { puntos_cubiertos, puntos_totales, pct, vacias }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/memoria.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/memoria.ts packages/module-concursos/test/memoria.test.ts
git commit -m "feat(concursos): coberturaMemoria estima puntos técnicos cubiertos (F4)"
```

---

## Task 5: Re-exports en `index.ts` y suite completa

**Files:**
- Modify: `packages/module-concursos/src/index.ts`

- [ ] **Step 1: Añadir los re-exports**

En `src/index.ts`, tras el bloque de F3 (DEUC), añade:

```ts
// Memoria técnica (puro): plan de secciones + prompt + cobertura de puntos
export {
  planificarMemoria,
  construirPromptMemoria,
  coberturaMemoria,
  MIN_CONTENIDO_CHARS,
} from './memoria'
```

Y dentro del `export type { … } from './types'` añade:

```ts
  SeccionMemoria,
  SeccionMemoriaRellena,
  MemoriaTecnica,
  CoberturaMemoria,
```

- [ ] **Step 2: Ejecutar TODA la suite del módulo**

Run: `cd /home/user/central/packages/module-concursos && npm test`
Expected: PASS — v1 + F2 + F3 + los nuevos de F4, todos verdes.

- [ ] **Step 3: Commit**

```bash
git add packages/module-concursos/src/index.ts
git commit -m "feat(concursos): exporta la API de la memoria técnica (F4)"
```

---

## Task 6: Integración ialimp — columna `concursos.memoria` (migración)

**Files:**
- Create: `apps/ialimp/prisma/migrations/add_concursos_memoria.sql`

- [ ] **Step 1: Crear la migración**

Crea `apps/ialimp/prisma/migrations/add_concursos_memoria.sql`:

```sql
-- Memoria técnica generada (F4 del módulo de concursos). Se guarda junto al
-- concurso, como ficha/checklist. Estructura: { secciones: [...] }.
alter table concursos add column if not exists memoria jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add apps/ialimp/prisma/migrations/add_concursos_memoria.sql
git commit -m "feat(ialimp): columna concursos.memoria (concursos F4)"
```

---

## Task 7: Integración ialimp — endpoint de la memoria

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/[id]/memoria/route.ts`

- [ ] **Step 1: Releer el AiRunner del v1 y el endpoint del sobre administrativo (F3)**

Run: `cat apps/ialimp/lib/concursos.ts apps/ialimp/app/api/admin/concursos/[id]/sobre-administrativo/route.ts`
Reutiliza el helper que respalda el `AiRunner` (la función que llama a `aiComplete`/core-ai) y el patrón de auth/lectura del concurso (`requireEmpresaId`, `prisma.$queryRaw` con `Prisma.sql`, `concursos` scopeado por `empresa_id`).

- [ ] **Step 2: Crear el endpoint**

Crea `apps/ialimp/app/api/admin/concursos/[id]/memoria/route.ts`. Adapta el import del runner de IA al real de `lib/concursos.ts` (p.ej. `aiComplete` directo de `@/lib/ai-client`, como hace `analizar`):

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { aiComplete } from '@/lib/ai-client'
import { planificarMemoria, construirPromptMemoria, coberturaMemoria } from '@iarest/module-concursos'
import type { SeccionMemoriaRellena } from '@iarest/module-concursos'

export const maxDuration = 60

// GET — devuelve la memoria guardada + su cobertura.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ficha, memoria FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!rows[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  const memoria = rows[0].memoria ?? { secciones: [] }
  const cobertura = coberturaMemoria(memoria.secciones ?? [], rows[0].ficha)
  return NextResponse.json({ memoria, cobertura })
}

// POST — planifica la memoria, redacta cada sección con el LLM y la persiste.
// body opcional { contexto?: string } con datos de la empresa para el LLM.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  let contexto = ''
  try { contexto = String((await req.json())?.contexto ?? '') } catch {}

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ficha FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!rows[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  const ficha = rows[0].ficha

  const plan = planificarMemoria(ficha)
  if (plan.length === 0) return NextResponse.json({ error: 'Este concurso no tiene criterios de juicio de valor (memoria no aplica).' }, { status: 400 })

  const secciones: SeccionMemoriaRellena[] = []
  for (const seccion of plan) {
    const { system, user } = construirPromptMemoria(ficha, seccion, contexto)
    let contenido = ''
    try { contenido = await aiComplete(system, user) } catch { contenido = '' }
    secciones.push({ ...seccion, contenido: (contenido || '').trim() })
  }
  const memoria = { secciones }

  await prisma.$queryRaw(Prisma.sql`
    UPDATE concursos SET memoria = ${JSON.stringify(memoria)}::jsonb
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ memoria, cobertura: coberturaMemoria(secciones, ficha) })
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (puede abortar después en "Collecting page data" por `JWT_SECRET` ausente — env, no código; reportar si ocurre). Verifica que `aiComplete` se importa con la firma real de `@/lib/ai-client` (si su firma difiere, adáptala — es `aiComplete(system, user)` en el v1 de concursos).

- [ ] **Step 4: Commit**

```bash
git add 'apps/ialimp/app/api/admin/concursos/[id]/memoria/route.ts'
git commit -m "feat(ialimp): endpoint de la memoria técnica (concursos F4)"
```

---

## Task 8: Integración ialimp — panel "Memoria técnica" en la ficha

**Files:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`

- [ ] **Step 1: Releer la página para imitar el patrón del panel de F3**

Run: `cat apps/ialimp/app/admin/concursos/page.tsx`
Fíjate en cómo `FichaView` montó el panel "Sobre administrativo" (estado local + `cargarSobre` + render condicional). Replica ese patrón para la memoria.

- [ ] **Step 2: Añadir el panel**

En `FichaView`, junto a los otros estados, añade el estado y el cargador de la memoria, y un panel con botón de generar, barra de cobertura y las secciones:

```tsx
const [memoria, setMemoria] = useState<any>(null);
const [genMem, setGenMem] = useState(false);
const generarMemoria = async () => {
  setGenMem(true);
  try {
    const r = await fetch(`/api/admin/concursos/${c.id}/memoria`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ contexto: '' }) }).then(x=>x.json());
    setMemoria(r);
  } catch {}
  setGenMem(false);
};
```

Y en el render, tras el panel del sobre administrativo:

```tsx
{/* Memoria técnica (F4) */}
<button onClick={generarMemoria} disabled={genMem} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer', opacity:genMem?0.6:1 }}>
  {genMem ? '✍️ Redactando…' : '✍️ Generar memoria técnica'}
</button>
{memoria?.cobertura && (
  <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
    <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>
      Cobertura técnica: {memoria.cobertura.puntos_cubiertos}/{memoria.cobertura.puntos_totales} puntos ({memoria.cobertura.pct}%)
    </div>
    <div style={{ height:8, background:C.soft, borderRadius:4, overflow:'hidden', marginBottom:10 }}>
      <div style={{ width:`${memoria.cobertura.pct}%`, height:'100%', background:C.indigo }} />
    </div>
    {(memoria.memoria?.secciones ?? []).map((s:any,i:number)=>(
      <details key={i} style={{ marginBottom:8 }}>
        <summary style={{ fontWeight:800, fontSize:14, cursor:'pointer' }}>{s.criterio} · {s.puntos_max} pts</summary>
        <p style={{ fontSize:13, whiteSpace:'pre-wrap', color:C.text, margin:'6px 0' }}>{s.contenido || '(vacío)'}</p>
      </details>
    ))}
  </div>
)}
```

- [ ] **Step 3: Build de ialimp + suite del módulo**

Run: `cd /home/user/central/apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully`; módulo todos los tests verdes.

- [ ] **Step 4: Commit**

```bash
git add apps/ialimp/app/admin/concursos/page.tsx
git commit -m "feat(ialimp): panel de memoria técnica en la ficha (concursos F4)"
```

---

## Task 9: Actualizar memoria de sesión y docs, y empujar

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada F4: módulo puro (`memoria.ts`: `planificarMemoria`/`construirPromptMemoria`/`coberturaMemoria` + tests) e integración ialimp (columna `concursos.memoria`, endpoint que redacta por sección vía `aiComplete`, panel con barra de cobertura). Pendiente de Alberto: aplicar `add_concursos_memoria.sql`.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de F4: columna `concursos.memoria`, endpoint `/api/admin/concursos/[id]/memoria` (POST genera con LLM por sección, GET devuelve memoria+cobertura), panel "Memoria técnica" en la ficha. Aplicar `add_concursos_memoria.sql` a mano.

- [ ] **Step 3: Commit y push**

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión F4 memoria técnica (concursos)"
git push -u origin claude/public-tender-agent-module-mid0hu
```

---

## Notas de cierre

- **Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_memoria.sql` en la BD compartida.
- **Fuera de F4:** edición/guardado manual de cada sección (aquí se genera y se muestra; la edición persistente puede añadirse luego), renderizado a PDF, y el contexto de empresa rico (de momento el POST acepta `contexto` libre, la UI lo manda vacío).
- **Decisión de diseño:** el LLM redacta sección a sección (un `aiComplete` por criterio) para acotar el contexto y poder reintentar por partes; la cobertura es un proxy por longitud de contenido (≥ `MIN_CONTENIDO_CHARS`), no una evaluación semántica.
