# Concursos F6 — Presentación + plazos/subsanación · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el flujo del concurso: cuenta atrás al fin de plazo, comprobar que los sobres requeridos están listos para presentar, y calcular el plazo de subsanación (días hábiles).

**Architecture:** Lógica nueva **TS pura** en `packages/module-concursos/src/presentacion.ts` (sin BD/IA/secretos): aritmética de fechas ISO, estado de presentación (plazo + sobres requeridos) y plazo de subsanación en días hábiles. La app de referencia (ialimp) muestra un panel "Presentación" con la cuenta atrás y el estado, calculado en vivo con las funciones puras.

**Tech Stack:** TypeScript puro; tests con `node --test` (type-stripping); Next.js en ialimp.

---

## File Structure

**Módulo puro (`packages/module-concursos/`):**
- Modify: `src/types.ts` — `SobresListos`, `EstadoPresentacion`, `PlazoSubsanacion`.
- Create: `src/presentacion.ts` — `diasEntre`, `sumarDiasHabiles`, `estadoPresentacion`, `plazoSubsanacion`.
- Modify: `src/index.ts` — re-exporta lo nuevo.
- Create: `test/presentacion.test.ts` — tests de las cuatro funciones.

**Integración de referencia (`apps/ialimp/`):**
- Modify: `app/admin/concursos/page.tsx` — panel "Presentación" en la ficha (cuenta atrás + estado + subsanación).

---

## Task 1: Tipos de F6

**Files:**
- Modify: `packages/module-concursos/src/types.ts` (al final, tras los tipos de F5)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Presentación + plazos/subsanación (F6) — cierra el flujo del concurso.
// ────────────────────────────────────────────────────────────────────────────

/** Si cada sobre está listo (lo decide la app a partir de F3/F4/F5). */
export interface SobresListos {
  administrativo: boolean
  tecnico: boolean
  economico: boolean
}

/** Estado de la presentación: plazo + sobres requeridos. */
export interface EstadoPresentacion {
  dias_para_fin: number | null   // días naturales hasta fin_presentacion (null si no consta)
  plazo_abierto: boolean         // aún se puede presentar (hoy <= fin)
  urgente: boolean               // plazo abierto y quedan <= 3 días
  listo: boolean                 // plazo abierto y todos los sobres REQUERIDOS listos
  pendientes: string[]           // qué falta para poder presentar
}

/** Plazo de subsanación (art. 141 LCSP): días hábiles desde el requerimiento. */
export interface PlazoSubsanacion {
  fecha_limite: string           // ISO 'YYYY-MM-DD'
  dias_habiles: number
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/module-concursos/src/types.ts
git commit -m "feat(concursos): tipos de presentación y plazos (F6)"
```

---

## Task 2: `diasEntre` y `sumarDiasHabiles`

Aritmética de fechas ISO en UTC (sin zonas horarias: las fechas del pliego son días naturales).

**Files:**
- Create: `packages/module-concursos/src/presentacion.ts`
- Test: `packages/module-concursos/test/presentacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-concursos/test/presentacion.test.ts`:

```ts
// Tests de la lógica PURA de presentación + plazos (F6).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diasEntre, sumarDiasHabiles } from '../src/presentacion.ts'

test('diasEntre: diferencia en días naturales (hasta − desde)', () => {
  assert.equal(diasEntre('2026-06-11', '2026-06-20'), 9)
  assert.equal(diasEntre('2026-06-20', '2026-06-11'), -9)
  assert.equal(diasEntre('2026-06-11', '2026-06-11'), 0)
})

test('sumarDiasHabiles: salta sábados y domingos', () => {
  // jueves 2026-06-11 + 3 hábiles → vie 12, lun 15, mar 16
  assert.equal(sumarDiasHabiles('2026-06-11', 3), '2026-06-16')
  // viernes 2026-06-12 + 1 hábil → lunes 15
  assert.equal(sumarDiasHabiles('2026-06-12', 1), '2026-06-15')
})

test('sumarDiasHabiles: 0 días devuelve la misma fecha', () => {
  assert.equal(sumarDiasHabiles('2026-06-11', 0), '2026-06-11')
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/presentacion.test.ts`
Expected: FAIL — `Cannot find module '../src/presentacion.ts'`.

- [ ] **Step 3: Implementar `presentacion.ts` (aritmética de fechas)**

Crea `packages/module-concursos/src/presentacion.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Presentación + plazos/subsanación (F6) — PURO. Aritmética de fechas ISO en
// UTC (días naturales del pliego), estado de presentación y subsanación en
// días hábiles. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  EstadoPresentacion,
  FichaConcurso,
  PlazoSubsanacion,
  SobresListos,
} from './types'

const MS_DIA = 86_400_000

/** Parsea 'YYYY-MM-DD' a epoch UTC de medianoche (NaN si no es válida). */
function epoch(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** ISO 'YYYY-MM-DD' de un epoch UTC. */
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Días naturales entre dos fechas ISO (hasta − desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((epoch(hasta) - epoch(desde)) / MS_DIA)
}

/**
 * Suma `dias` días HÁBILES (lun–vie) a una fecha ISO, saltando fines de semana.
 * No considera festivos (el pliego/órgano los precisa caso a caso).
 */
export function sumarDiasHabiles(desde: string, dias: number): string {
  let ms = epoch(desde)
  let restantes = dias
  while (restantes > 0) {
    ms += MS_DIA
    const dow = new Date(ms).getUTCDay() // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) restantes--
  }
  return iso(ms)
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/presentacion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/presentacion.ts packages/module-concursos/test/presentacion.test.ts
git commit -m "feat(concursos): aritmética de fechas y días hábiles (F6)"
```

---

## Task 3: `estadoPresentacion`

Combina el plazo con los sobres requeridos (técnico solo si hay juicio de valor; económico solo si hay criterio económico).

**Files:**
- Modify: `packages/module-concursos/src/presentacion.ts`
- Modify: `packages/module-concursos/test/presentacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/presentacion.test.ts`:

```ts
import { estadoPresentacion } from '../src/presentacion.ts'
import type { FichaConcurso, SobresListos } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'x', tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

const TODOS: SobresListos = { administrativo: true, tecnico: true, economico: true }

test('estadoPresentacion: listo cuando el plazo está abierto y los sobres requeridos están', () => {
  const ficha = fichaBase({
    plazos: { fin_presentacion: '2026-06-20' },
    criterios: [
      { nombre: 'Memoria', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' },
      { nombre: 'Precio', puntos: 60, tipo: 'automatico', sobre: 'economico' },
    ],
  })
  const e = estadoPresentacion(ficha, '2026-06-11', TODOS)
  assert.equal(e.dias_para_fin, 9)
  assert.equal(e.plazo_abierto, true)
  assert.equal(e.urgente, false)
  assert.equal(e.listo, true)
  assert.deepEqual(e.pendientes, [])
})

test('estadoPresentacion: marca pendientes los sobres requeridos que faltan', () => {
  const ficha = fichaBase({
    plazos: { fin_presentacion: '2026-06-20' },
    criterios: [{ nombre: 'Memoria', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' }],
  })
  const e = estadoPresentacion(ficha, '2026-06-11', { administrativo: true, tecnico: false, economico: false })
  assert.equal(e.listo, false)
  assert.ok(e.pendientes.some(p => /técnico/i.test(p)))
  // sin criterio económico, el sobre económico NO es requerido → no aparece
  assert.ok(!e.pendientes.some(p => /económic/i.test(p)))
})

test('estadoPresentacion: urgente cuando quedan <= 3 días', () => {
  const ficha = fichaBase({ plazos: { fin_presentacion: '2026-06-13' } })
  const e = estadoPresentacion(ficha, '2026-06-11', TODOS)
  assert.equal(e.dias_para_fin, 2)
  assert.equal(e.urgente, true)
})

test('estadoPresentacion: plazo cerrado si la fecha ya pasó', () => {
  const ficha = fichaBase({ plazos: { fin_presentacion: '2026-06-01' } })
  const e = estadoPresentacion(ficha, '2026-06-11', TODOS)
  assert.equal(e.plazo_abierto, false)
  assert.equal(e.listo, false)
  assert.ok(e.pendientes.some(p => /plazo/i.test(p)))
})

test('estadoPresentacion: sin fecha de fin, dias null y plazo abierto', () => {
  const e = estadoPresentacion(fichaBase(), '2026-06-11', TODOS)
  assert.equal(e.dias_para_fin, null)
  assert.equal(e.plazo_abierto, true)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/presentacion.test.ts`
Expected: FAIL — `estadoPresentacion is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/presentacion.ts`:

```ts
/**
 * Estado de presentación. El sobre TÉCNICO solo es requerido si hay criterios de
 * juicio de valor; el ECONÓMICO solo si hay criterio económico/automático; el
 * ADMINISTRATIVO siempre. `listo` exige plazo abierto y todos los requeridos.
 */
export function estadoPresentacion(
  ficha: FichaConcurso,
  hoy: string,
  sobres: SobresListos,
): EstadoPresentacion {
  const fin = ficha.plazos.fin_presentacion
  const dias_para_fin = fin ? diasEntre(hoy, fin) : null
  const plazo_abierto = dias_para_fin === null ? true : dias_para_fin >= 0
  const urgente = plazo_abierto && dias_para_fin !== null && dias_para_fin <= 3

  const requiereTecnico = ficha.criterios.some(c => c.tipo === 'juicio_valor')
  const requiereEconomico = ficha.criterios.some(c => c.sobre === 'economico' || c.tipo === 'automatico')

  const pendientes: string[] = []
  if (!plazo_abierto) pendientes.push('El plazo de presentación ya ha terminado')
  if (!sobres.administrativo) pendientes.push('Falta el sobre administrativo')
  if (requiereTecnico && !sobres.tecnico) pendientes.push('Falta el sobre técnico (memoria)')
  if (requiereEconomico && !sobres.economico) pendientes.push('Falta el sobre económico (oferta)')

  const listo = pendientes.length === 0
  return { dias_para_fin, plazo_abierto, urgente, listo, pendientes }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/presentacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/presentacion.ts packages/module-concursos/test/presentacion.test.ts
git commit -m "feat(concursos): estadoPresentacion (plazo + sobres requeridos) (F6)"
```

---

## Task 4: `plazoSubsanacion` + re-exports y suite

**Files:**
- Modify: `packages/module-concursos/src/presentacion.ts`
- Modify: `packages/module-concursos/test/presentacion.test.ts`
- Modify: `packages/module-concursos/src/index.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/presentacion.test.ts`:

```ts
import { plazoSubsanacion } from '../src/presentacion.ts'

test('plazoSubsanacion: 3 días hábiles por defecto (art. 141 LCSP)', () => {
  const p = plazoSubsanacion('2026-06-11') // jueves
  assert.equal(p.dias_habiles, 3)
  assert.equal(p.fecha_limite, '2026-06-16') // vie 12, lun 15, mar 16
})

test('plazoSubsanacion: admite otro número de días hábiles', () => {
  const p = plazoSubsanacion('2026-06-12', 1) // viernes + 1 hábil → lunes
  assert.equal(p.fecha_limite, '2026-06-15')
  assert.equal(p.dias_habiles, 1)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/presentacion.test.ts`
Expected: FAIL — `plazoSubsanacion is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/presentacion.ts`:

```ts
/**
 * Plazo de subsanación de defectos del sobre administrativo (art. 141 LCSP):
 * por defecto 3 días hábiles desde el requerimiento del órgano de contratación.
 */
export function plazoSubsanacion(fechaRequerimiento: string, diasHabiles = 3): PlazoSubsanacion {
  return { fecha_limite: sumarDiasHabiles(fechaRequerimiento, diasHabiles), dias_habiles: diasHabiles }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/presentacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-exports en `index.ts`**

En `src/index.ts`, tras el bloque de F5 (oferta), añade:

```ts
// Presentación + plazos/subsanación (puro)
export {
  diasEntre,
  sumarDiasHabiles,
  estadoPresentacion,
  plazoSubsanacion,
} from './presentacion'
```

Y dentro del `export type { … } from './types'` añade:

```ts
  SobresListos,
  EstadoPresentacion,
  PlazoSubsanacion,
```

- [ ] **Step 6: Ejecutar TODA la suite del módulo**

Run: `cd /home/user/central/packages/module-concursos && npm test`
Expected: PASS — v1 + F2 + F3 + F4 + F5 + los nuevos de F6, todos verdes.

- [ ] **Step 7: Commit**

```bash
git add packages/module-concursos/src/presentacion.ts packages/module-concursos/test/presentacion.test.ts packages/module-concursos/src/index.ts
git commit -m "feat(concursos): plazoSubsanacion y exporta la API de presentación (F6)"
```

---

## Task 5: Integración ialimp — panel "Presentación" en la ficha

**Files:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`

- [ ] **Step 1: Releer la página para imitar el patrón de paneles**

Run: `cat apps/ialimp/app/admin/concursos/page.tsx`
Fíjate en la línea de import de `@iarest/module-concursos` y en cómo `FichaView` monta los paneles de F4/F5.

- [ ] **Step 2: Ampliar el import del módulo**

En la línea de import de `@iarest/module-concursos` de `page.tsx`, añade `estadoPresentacion` y `plazoSubsanacion`:

```tsx
import { autocompletarChecklist, documentosFaltantes, evaluarOferta, precioMinimoRentable, estadoPresentacion, plazoSubsanacion } from '@iarest/module-concursos';
```

- [ ] **Step 3: Añadir el panel (cuenta atrás + estado + subsanación)**

En `FichaView`, junto a los otros estados, añade:

```tsx
const [sobresListos, setSobresListos] = useState({ administrativo:false, tecnico:false, economico:false });
const hoyISO = new Date().toISOString().slice(0,10);
const estadoPres = estadoPresentacion(c.ficha || {}, hoyISO, sobresListos);
const subsanacion = plazoSubsanacion(hoyISO);
const toggleSobre = (k:string) => (e:any) => setSobresListos({ ...sobresListos, [k]: e.target.checked });
```

Y en el render, tras el panel de oferta económica:

```tsx
{/* Presentación + plazos (F6) */}
<div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
  <strong style={{ fontSize:14 }}>Presentación</strong>
  <div style={{ fontSize:13, marginTop:6 }}>
    {estadoPres.dias_para_fin === null
      ? <span style={{ color:C.muted }}>Sin fecha de fin de plazo en la ficha.</span>
      : estadoPres.plazo_abierto
        ? <span style={{ color: estadoPres.urgente ? '#b91c1c' : C.text, fontWeight:800 }}>
            {estadoPres.urgente ? '🔴 ' : '🗓️ '}Quedan {estadoPres.dias_para_fin} día{estadoPres.dias_para_fin===1?'':'s'} para presentar
          </span>
        : <span style={{ color:'#b91c1c', fontWeight:800 }}>⛔ Plazo de presentación cerrado</span>}
  </div>
  <div style={{ display:'flex', gap:14, flexWrap:'wrap', margin:'8px 0', fontSize:13 }}>
    <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.administrativo} onChange={toggleSobre('administrativo')} /> Administrativo</label>
    <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.tecnico} onChange={toggleSobre('tecnico')} /> Técnico</label>
    <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.economico} onChange={toggleSobre('economico')} /> Económico</label>
  </div>
  {estadoPres.listo
    ? <div style={{ color:'#15803d', fontWeight:800, fontSize:13 }}>✅ Listo para presentar</div>
    : <ul style={{ margin:'4px 0', paddingLeft:18, fontSize:13, color:'#b45309' }}>{estadoPres.pendientes.map((p:string,i:number)=>(<li key={i}>{p}</li>))}</ul>}
  <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
    Si te requieren subsanar hoy, el plazo (3 días hábiles, art. 141 LCSP) vencería el <strong>{subsanacion.fecha_limite}</strong>.
  </div>
</div>
```

- [ ] **Step 4: Build de ialimp + suite del módulo**

Run: `cd /home/user/central/apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully` (puede abortar después en "Collecting page data" por `JWT_SECRET` ausente — env, no código); módulo todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/ialimp/app/admin/concursos/page.tsx
git commit -m "feat(ialimp): panel de presentación y plazos en la ficha (concursos F6)"
```

---

## Task 6: Actualizar memoria de sesión y docs, y empujar

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada F6: módulo puro (`presentacion.ts`: `diasEntre`/`sumarDiasHabiles`/`estadoPresentacion`/`plazoSubsanacion` + tests) e integración ialimp (panel "Presentación" en la ficha: cuenta atrás, estado de sobres requeridos, aviso de subsanación). Sin migración nueva.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de F6: panel "Presentación" en la ficha (cuenta atrás al fin de plazo, checklist de sobres requeridos, plazo de subsanación de 3 días hábiles). Sin BD nueva (cómputo en vivo).

- [ ] **Step 3: Commit y push**

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión F6 presentación y plazos (concursos)"
git push -u origin claude/public-tender-agent-module-mid0hu
```

---

## Notas de cierre

- **Sin migración:** F6 no añade tablas; el estado se calcula en vivo con la ficha + las casillas de sobres listos que marca el usuario.
- **Festivos:** `sumarDiasHabiles` salta sábados y domingos pero NO festivos (varían por municipio/CA y el órgano los precisa en cada requerimiento); el cálculo es orientativo.
- **Fuera de F6:** notificaciones/recordatorios automáticos al acercarse el fin de plazo (web-push, ya disponible en ialimp) quedan como mejora futura.
