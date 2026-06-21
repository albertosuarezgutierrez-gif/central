# Concursos F5 — Oferta económica + rentabilidad · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ayudar al licitador a fijar el precio de su oferta: que sea rentable (cubre coste + margen), competitiva (puntúa) y no caiga en baja temeraria.

**Architecture:** Lógica nueva **TS pura** en `packages/module-concursos/src/oferta.ts` (sin BD/IA/secretos), reutilizando `calcularPuntuacionEconomica`, `umbralBajaTemeraria` y `round2` de `scoring.ts` (v1). El **coste** lo aporta la app (puede venir de contabilidad); el módulo solo opera números. La app de referencia (ialimp) persiste la oferta en `concursos.oferta` (jsonb) y evalúa en vivo con las funciones puras importadas (sin LLM).

**Tech Stack:** TypeScript puro; tests con `node --test` (type-stripping); Next.js + Prisma/Supabase en ialimp.

---

## File Structure

**Módulo puro (`packages/module-concursos/`):**
- Modify: `src/types.ts` — `CosteEjecucion`, `EvaluacionOferta`.
- Create: `src/oferta.ts` — `costeTotal`, `precioMinimoRentable`, `evaluarOferta`.
- Modify: `src/index.ts` — re-exporta lo nuevo.
- Create: `test/oferta.test.ts` — tests de las tres funciones.

**Integración de referencia (`apps/ialimp/`):**
- Create: `prisma/migrations/add_concursos_oferta.sql` — columna `concursos.oferta` jsonb.
- Create: `app/api/admin/concursos/[id]/oferta/route.ts` — GET carga / PUT guarda la oferta.
- Modify: `app/admin/concursos/page.tsx` — panel "Oferta económica" en la ficha (inputs + evaluación en vivo).

---

## Task 1: Tipos de F5

**Files:**
- Modify: `packages/module-concursos/src/types.ts` (al final, tras los tipos de F4)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Oferta económica + rentabilidad (F5) — el módulo opera números; el coste lo
// aporta la app (puede venir de contabilidad). Reutiliza scoring.ts.
// ────────────────────────────────────────────────────────────────────────────

/** Coste de ejecutar el contrato, en euros (lo estima la app/empresa). */
export interface CosteEjecucion {
  directos: number               // mano de obra, materiales, subcontratas…
  indirectos?: number            // estructura, overheads
  margen_objetivo_pct?: number   // beneficio deseado sobre el PRECIO (0–100)
}

/** Evaluación de una oferta concreta frente a coste, competencia y pliego. */
export interface EvaluacionOferta {
  oferta: number                 // importe ofertado (€, sin IVA)
  coste_total: number            // directos + indirectos
  margen_euros: number           // oferta − coste_total
  margen_pct: number             // margen_euros / oferta * 100 (0 si oferta<=0)
  puntos_economicos: number      // puntos del criterio económico (0 si no aplica)
  temeraria: boolean             // por debajo del umbral de baja temeraria
  umbral_temeraria: number | null
  viable: boolean                // margen_euros >= 0 && !temeraria
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/module-concursos/src/types.ts
git commit -m "feat(concursos): tipos de la oferta económica (F5)"
```

---

## Task 2: `costeTotal` y `precioMinimoRentable`

**Files:**
- Create: `packages/module-concursos/src/oferta.ts`
- Test: `packages/module-concursos/test/oferta.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-concursos/test/oferta.test.ts`:

```ts
// Tests de la lógica PURA de la oferta económica (F5).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { costeTotal, precioMinimoRentable } from '../src/oferta.ts'
import type { CosteEjecucion } from '../src/types.ts'

test('costeTotal: suma directos + indirectos', () => {
  assert.equal(costeTotal({ directos: 1000 }), 1000)
  assert.equal(costeTotal({ directos: 1000, indirectos: 250 }), 1250)
})

test('precioMinimoRentable: sin margen objetivo = coste (umbral de equilibrio)', () => {
  assert.equal(precioMinimoRentable({ directos: 1000, indirectos: 200 }), 1200)
})

test('precioMinimoRentable: con margen objetivo sube el precio (margen sobre precio)', () => {
  // coste 800, margen 20% sobre precio → precio = 800 / (1 - 0.20) = 1000
  assert.equal(precioMinimoRentable({ directos: 800, margen_objetivo_pct: 20 }), 1000)
})

test('precioMinimoRentable: margen >= 100% se trata como coste (evita dividir por 0)', () => {
  assert.equal(precioMinimoRentable({ directos: 500, margen_objetivo_pct: 100 }), 500)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/oferta.test.ts`
Expected: FAIL — `Cannot find module '../src/oferta.ts'`.

- [ ] **Step 3: Implementar `oferta.ts` (coste + precio mínimo)**

Crea `packages/module-concursos/src/oferta.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Oferta económica + rentabilidad (F5) — PURO. Reutiliza scoring.ts (puntuación
// económica y baja temeraria). El coste lo aporta la app. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  CosteEjecucion,
  EvaluacionOferta,
  FichaConcurso,
} from './types'
import { round2, calcularPuntuacionEconomica, umbralBajaTemeraria } from './scoring.ts'

/** Coste total de ejecutar el contrato (directos + indirectos). */
export function costeTotal(coste: CosteEjecucion): number {
  return round2((coste.directos || 0) + (coste.indirectos || 0))
}

/**
 * Precio mínimo para ser rentable. Sin margen objetivo = coste (equilibrio).
 * Con margen objetivo m% SOBRE EL PRECIO: precio = coste / (1 − m/100). Si m>=100
 * (sin sentido), se devuelve el coste para no dividir por cero o negativo.
 */
export function precioMinimoRentable(coste: CosteEjecucion): number {
  const ct = costeTotal(coste)
  const m = coste.margen_objetivo_pct
  if (m === undefined || m <= 0 || m >= 100) return ct
  return round2(ct / (1 - m / 100))
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/oferta.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/oferta.ts packages/module-concursos/test/oferta.test.ts
git commit -m "feat(concursos): costeTotal y precioMinimoRentable (F5)"
```

---

## Task 3: `evaluarOferta`

Evalúa una oferta: margen, puntos económicos (reutiliza scoring), y si cae en baja temeraria.

**Files:**
- Modify: `packages/module-concursos/src/oferta.ts`
- Modify: `packages/module-concursos/test/oferta.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/oferta.test.ts`:

```ts
import { evaluarOferta } from '../src/oferta.ts'
import type { FichaConcurso } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'x', tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

const FICHA_ECON = fichaBase({
  presupuesto_base: 100000,
  criterios: [
    { nombre: 'Precio', puntos: 60, tipo: 'automatico', sobre: 'economico' },
    { nombre: 'Calidad', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' },
  ],
})

test('evaluarOferta: margen y viabilidad con coste por debajo de la oferta', () => {
  const e = evaluarOferta(90000, { directos: 70000, indirectos: 10000 }, FICHA_ECON)
  assert.equal(e.coste_total, 80000)
  assert.equal(e.margen_euros, 10000)
  assert.equal(e.margen_pct, round2(10000 / 90000 * 100))
  assert.equal(e.viable, true)
})

test('evaluarOferta: margen negativo => no viable', () => {
  const e = evaluarOferta(70000, { directos: 80000 }, FICHA_ECON)
  assert.equal(e.margen_euros, -10000)
  assert.equal(e.viable, false)
})

test('evaluarOferta: puntos económicos máximos si es la oferta más baja', () => {
  const e = evaluarOferta(80000, { directos: 50000 }, FICHA_ECON, { ofertas: [80000, 90000, 100000] })
  assert.equal(e.puntos_economicos, 60) // proporcional_inversa: la mínima saca el máximo
})

test('evaluarOferta: detecta baja temeraria (1 licitador, 25% bajo presupuesto)', () => {
  // presupuesto 100000 → umbral = 75000; ofertar 70000 es temerario
  const e = evaluarOferta(70000, { directos: 40000 }, FICHA_ECON, { ofertas: [70000] })
  assert.equal(e.umbral_temeraria, 75000)
  assert.equal(e.temeraria, true)
  assert.equal(e.viable, false) // temeraria => no viable aunque haya margen
})

test('evaluarOferta: sin criterio económico => 0 puntos económicos', () => {
  const ficha = fichaBase({ presupuesto_base: 100000, criterios: [{ nombre: 'Calidad', puntos: 100, tipo: 'juicio_valor', sobre: 'tecnico' }] })
  const e = evaluarOferta(90000, { directos: 50000 }, ficha)
  assert.equal(e.puntos_economicos, 0)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/oferta.test.ts`
Expected: FAIL — `evaluarOferta is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/oferta.ts`:

```ts
/**
 * Evalúa una oferta. `opts.ofertas` son TODOS los importes en juego (incluida la
 * propia), si se conocen: sirven para los puntos económicos y la baja temeraria.
 * Sin competencia conocida se usa solo la propia oferta. Una oferta temeraria no
 * es viable aunque tenga margen (habría que justificarla).
 */
export function evaluarOferta(
  oferta: number,
  coste: CosteEjecucion,
  ficha: FichaConcurso,
  opts: { ofertas?: number[] } = {},
): EvaluacionOferta {
  const coste_total = costeTotal(coste)
  const margen_euros = round2(oferta - coste_total)
  const margen_pct = oferta > 0 ? round2((margen_euros / oferta) * 100) : 0

  const ofertas = opts.ofertas && opts.ofertas.length ? opts.ofertas : [oferta]

  const crit = ficha.criterios.find(c => c.sobre === 'economico' || (c.tipo === 'automatico' && c.sobre !== 'tecnico'))
  const puntos_economicos = crit
    ? calcularPuntuacionEconomica(oferta, ofertas, crit.puntos, { presupuestoBase: ficha.presupuesto_base })
    : 0

  const { umbral } = umbralBajaTemeraria(ofertas, ficha.presupuesto_base)
  const temeraria = umbral !== null && oferta < umbral

  const viable = margen_euros >= 0 && !temeraria

  return { oferta, coste_total, margen_euros, margen_pct, puntos_economicos, temeraria, umbral_temeraria: umbral, viable }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/oferta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/oferta.ts packages/module-concursos/test/oferta.test.ts
git commit -m "feat(concursos): evaluarOferta (margen, puntos, baja temeraria) (F5)"
```

---

## Task 4: Re-exports en `index.ts` y suite completa

**Files:**
- Modify: `packages/module-concursos/src/index.ts`

- [ ] **Step 1: Añadir los re-exports**

En `src/index.ts`, tras el bloque de F4 (memoria), añade:

```ts
// Oferta económica + rentabilidad (puro): coste, precio mínimo y evaluación
export {
  costeTotal,
  precioMinimoRentable,
  evaluarOferta,
} from './oferta'
```

Y dentro del `export type { … } from './types'` añade:

```ts
  CosteEjecucion,
  EvaluacionOferta,
```

- [ ] **Step 2: Ejecutar TODA la suite del módulo**

Run: `cd /home/user/central/packages/module-concursos && npm test`
Expected: PASS — v1 + F2 + F3 + F4 + los nuevos de F5, todos verdes.

- [ ] **Step 3: Commit**

```bash
git add packages/module-concursos/src/index.ts
git commit -m "feat(concursos): exporta la API de la oferta económica (F5)"
```

---

## Task 5: Integración ialimp — columna `concursos.oferta` (migración)

**Files:**
- Create: `apps/ialimp/prisma/migrations/add_concursos_oferta.sql`

- [ ] **Step 1: Crear la migración**

Crea `apps/ialimp/prisma/migrations/add_concursos_oferta.sql`:

```sql
-- Oferta económica del licitador (F5 del módulo de concursos). Guarda los datos
-- de entrada (coste, margen objetivo, importe ofertado y, opcional, ofertas de
-- la competencia). La evaluación se recalcula en vivo con el módulo puro.
alter table concursos add column if not exists oferta jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add apps/ialimp/prisma/migrations/add_concursos_oferta.sql
git commit -m "feat(ialimp): columna concursos.oferta (concursos F5)"
```

---

## Task 6: Integración ialimp — endpoint de la oferta

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/[id]/oferta/route.ts`

- [ ] **Step 1: Releer el patrón del endpoint de memoria (F4)**

Run: `cat apps/ialimp/app/api/admin/concursos/[id]/memoria/route.ts`
Reutiliza EXACTAMENTE el patrón: `requireEmpresaId`, `prisma.$queryRaw` con `Prisma.sql`, `concursos` scopeado por `empresa_id`, casts `::uuid`/`::jsonb`.

- [ ] **Step 2: Crear el endpoint**

Crea `apps/ialimp/app/api/admin/concursos/[id]/oferta/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET — devuelve los datos de oferta guardados (o null).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT oferta FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!rows[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  return NextResponse.json({ oferta: rows[0].oferta ?? null })
}

// PUT — guarda los datos de entrada de la oferta { directos, indirectos?, margen_objetivo_pct?, oferta?, ofertas_competencia? }.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const r = await prisma.$queryRaw<any[]>(Prisma.sql`
    UPDATE concursos SET oferta = ${JSON.stringify(body ?? {})}::jsonb
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    RETURNING oferta
  `)
  if (!r[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, oferta: r[0].oferta })
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (puede abortar después en "Collecting page data" por `JWT_SECRET` ausente — env, no código; reportar si ocurre).

- [ ] **Step 4: Commit**

```bash
git add 'apps/ialimp/app/api/admin/concursos/[id]/oferta/route.ts'
git commit -m "feat(ialimp): endpoint de la oferta económica (concursos F5)"
```

---

## Task 7: Integración ialimp — panel "Oferta económica" en la ficha

La evaluación se calcula EN VIVO en el cliente con `evaluarOferta` (módulo puro, importable); el PUT solo guarda los datos de entrada.

**Files:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`

- [ ] **Step 1: Releer la página para imitar el patrón de paneles F3/F4**

Run: `cat apps/ialimp/app/admin/concursos/page.tsx`
Fíjate en los imports de `@iarest/module-concursos` ya presentes (F2/F3) y en cómo `FichaView` monta los paneles.

- [ ] **Step 2: Ampliar el import del módulo**

En la línea de import de `@iarest/module-concursos` de `page.tsx`, añade `evaluarOferta` y `precioMinimoRentable`:

```tsx
import { autocompletarChecklist, documentosFaltantes, evaluarOferta, precioMinimoRentable } from '@iarest/module-concursos';
```

- [ ] **Step 3: Añadir el panel (estado + cálculo en vivo + guardar)**

En `FichaView`, junto a los otros estados, añade:

```tsx
const [oferta, setOferta] = useState<any>({ directos:'', indirectos:'', margen_objetivo_pct:'', oferta:'' });
const num = (v:any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const coste = { directos:num(oferta.directos), indirectos:num(oferta.indirectos), margen_objetivo_pct:num(oferta.margen_objetivo_pct) };
const evalOferta = num(oferta.oferta) > 0 ? evaluarOferta(num(oferta.oferta), coste, c.ficha || {}) : null;
const minRent = precioMinimoRentable(coste);
const setO = (k:string) => (e:any) => setOferta({ ...oferta, [k]: e.target.value });
const guardarOferta = async () => {
  try { await fetch(`/api/admin/concursos/${c.id}/oferta`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(coste) }); } catch {}
};
```

Y en el render, tras el panel de memoria técnica:

```tsx
{/* Oferta económica (F5) */}
<div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
  <strong style={{ fontSize:14 }}>Oferta económica</strong>
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, margin:'8px 0' }}>
    <input placeholder="Costes directos (€)" value={oferta.directos} onChange={setO('directos')} />
    <input placeholder="Costes indirectos (€)" value={oferta.indirectos} onChange={setO('indirectos')} />
    <input placeholder="Margen objetivo (%)" value={oferta.margen_objetivo_pct} onChange={setO('margen_objetivo_pct')} />
    <input placeholder="Tu oferta (€)" value={oferta.oferta} onChange={setO('oferta')} />
  </div>
  <div style={{ fontSize:13, color:C.muted }}>Precio mínimo rentable: <strong>{minRent.toLocaleString('es-ES')} €</strong></div>
  {evalOferta && (
    <div style={{ fontSize:13, marginTop:6 }}>
      Margen: <strong>{evalOferta.margen_euros.toLocaleString('es-ES')} € ({evalOferta.margen_pct}%)</strong> ·
      Puntos económicos: <strong>{evalOferta.puntos_economicos}</strong>
      {evalOferta.temeraria && <span style={{ color:'#b91c1c', fontWeight:800 }}> · ⚠️ Baja temeraria (umbral {evalOferta.umbral_temeraria?.toLocaleString('es-ES')} €)</span>}
      {' '}<span style={{ color: evalOferta.viable ? '#15803d' : '#b91c1c', fontWeight:800 }}>{evalOferta.viable ? '✅ Viable' : '❌ No viable'}</span>
    </div>
  )}
  <button onClick={guardarOferta} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer' }}>Guardar oferta</button>
</div>
```

- [ ] **Step 4: Build de ialimp + suite del módulo**

Run: `cd /home/user/central/apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully`; módulo todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/ialimp/app/admin/concursos/page.tsx
git commit -m "feat(ialimp): panel de oferta económica en la ficha (concursos F5)"
```

---

## Task 8: Actualizar memoria de sesión y docs, y empujar

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada F5: módulo puro (`oferta.ts`: `costeTotal`/`precioMinimoRentable`/`evaluarOferta` + tests, reutiliza scoring.ts) e integración ialimp (columna `concursos.oferta`, endpoint GET/PUT, panel con evaluación en vivo: margen, puntos económicos, baja temeraria, viabilidad). Pendiente de Alberto: aplicar `add_concursos_oferta.sql`.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de F5: columna `concursos.oferta`, endpoint `/api/admin/concursos/[id]/oferta` (GET/PUT), panel "Oferta económica" con evaluación en vivo (`evaluarOferta` cliente). Aplicar `add_concursos_oferta.sql` a mano.

- [ ] **Step 3: Commit y push**

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión F5 oferta económica (concursos)"
git push -u origin claude/public-tender-agent-module-mid0hu
```

---

## Notas de cierre

- **Pendiente de Alberto:** aplicar `apps/ialimp/prisma/migrations/add_concursos_oferta.sql` en la BD compartida.
- **Cruce con contabilidad (spec norte):** el módulo solo recibe el coste como números; la app puede prerrellenar `directos` desde `module-contabilidad`/los datos de la empresa. Esa precarga queda como mejora futura (de momento el usuario teclea el coste).
- **Decisión de diseño:** la evaluación se calcula en el cliente con la función pura (sin LLM ni endpoint de cómputo); el endpoint solo persiste los datos de entrada. Las ofertas de la competencia son opcionales (si no se conocen, se evalúa solo con la propia oferta y el presupuesto base).
