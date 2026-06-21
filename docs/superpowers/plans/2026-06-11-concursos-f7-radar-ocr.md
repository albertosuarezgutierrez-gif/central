# Concursos F7 — Radar PLACSP + OCR · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente avise de licitaciones que le encajan a la empresa (radar) y que sepa cuándo un pliego está escaneado y hay que pasarle OCR.

**Architecture:** La parte **pura y testable** va en `packages/module-concursos/src/radar.ts` (sin BD/IA/secretos): emparejar anuncios con los criterios de la empresa (CPV, palabras clave, presupuesto) y detectar pliegos que necesitan OCR. El **sondeo en vivo de PLACSP** (feed Atom de la Plataforma de Contratación del Sector Público) y el **motor OCR** (Tesseract/cloud) son INFRAESTRUCTURA de la app (cron + claves) y quedan documentados como pendiente; el módulo solo opera sobre datos ya normalizados.

**Tech Stack:** TypeScript puro; tests con `node --test` (type-stripping).

---

## File Structure

**Módulo puro (`packages/module-concursos/`):**
- Modify: `src/types.ts` — `AnuncioRadar`, `CriteriosRadar`, `CoincidenciaRadar`.
- Create: `src/radar.ts` — `coincideRadar`, `filtrarRadar`, `necesitaOcr`.
- Modify: `src/index.ts` — re-exporta lo nuevo.
- Create: `test/radar.test.ts` — tests de las tres funciones.

**Integración (infraestructura, documentada — NO en este plan):**
- El sondeo de PLACSP (parseo del Atom oficial → `AnuncioRadar[]`) y el OCR (PDF escaneado → texto) los wirea la app con su cron y sus claves. El módulo expone el contrato (`filtrarRadar`, `necesitaOcr`) que esa infraestructura consume.

---

## Task 1: Tipos de F7

**Files:**
- Modify: `packages/module-concursos/src/types.ts` (al final, tras los tipos de F6)

- [ ] **Step 1: Añadir los tipos**

Añade al final de `src/types.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Radar PLACSP + OCR (F7) — el módulo empareja anuncios ya normalizados con los
// criterios de la empresa y detecta pliegos escaneados. El sondeo en vivo y el
// OCR son infraestructura de la app.
// ────────────────────────────────────────────────────────────────────────────

/** Un anuncio de licitación captado del radar (normalizado por la app). */
export interface AnuncioRadar {
  titulo: string
  objeto?: string
  cpv?: string[]            // códigos CPV del anuncio
  presupuesto?: number      // € sin IVA si consta
  organo?: string
  url?: string
}

/** Qué busca la empresa en el radar. */
export interface CriteriosRadar {
  cpv?: string[]            // códigos/prefijos CPV de interés
  palabras_clave?: string[] // términos a buscar en título/objeto
  presupuesto_min?: number
  presupuesto_max?: number
}

/** Resultado de evaluar un anuncio contra los criterios. */
export interface CoincidenciaRadar {
  coincide: boolean
  puntuacion: number        // 0–100 (relevancia)
  motivos: string[]         // por qué coincide
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/module-concursos/src/types.ts
git commit -m "feat(concursos): tipos del radar PLACSP (F7)"
```

---

## Task 2: `coincideRadar`

Empareja un anuncio con los criterios: CPV (por prefijo), palabras clave (sin acentos) y rango de presupuesto. Puntúa la relevancia.

**Files:**
- Create: `packages/module-concursos/src/radar.ts`
- Test: `packages/module-concursos/test/radar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-concursos/test/radar.test.ts`:

```ts
// Tests de la lógica PURA del radar PLACSP (F7).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { coincideRadar } from '../src/radar.ts'
import type { AnuncioRadar, CriteriosRadar } from '../src/types.ts'

const LIMPIEZA: AnuncioRadar = {
  titulo: 'Servicio de limpieza de colegios',
  objeto: 'Limpieza integral de centros educativos',
  cpv: ['90910000'],
  presupuesto: 120000,
}

test('coincideRadar: casa por CPV (prefijo) y palabra clave', () => {
  const crit: CriteriosRadar = { cpv: ['9091'], palabras_clave: ['limpieza'] }
  const r = coincideRadar(LIMPIEZA, crit)
  assert.equal(r.coincide, true)
  assert.ok(r.puntuacion > 0)
  assert.ok(r.motivos.some(m => /CPV/i.test(m)))
  assert.ok(r.motivos.some(m => /limpieza/i.test(m)))
})

test('coincideRadar: descarta por presupuesto fuera de rango', () => {
  const crit: CriteriosRadar = { palabras_clave: ['limpieza'], presupuesto_max: 50000 }
  const r = coincideRadar(LIMPIEZA, crit)
  assert.equal(r.coincide, false)
  assert.ok(r.motivos.some(m => /presupuesto/i.test(m)))
})

test('coincideRadar: sin coincidencias no casa', () => {
  const crit: CriteriosRadar = { cpv: ['4500'], palabras_clave: ['obra'] }
  const r = coincideRadar(LIMPIEZA, crit)
  assert.equal(r.coincide, false)
  assert.equal(r.puntuacion, 0)
})

test('coincideRadar: sin criterios no casa (evita ruido)', () => {
  const r = coincideRadar(LIMPIEZA, {})
  assert.equal(r.coincide, false)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/radar.test.ts`
Expected: FAIL — `Cannot find module '../src/radar.ts'`.

- [ ] **Step 3: Implementar `radar.ts` (solo `coincideRadar`)**

Crea `packages/module-concursos/src/radar.ts`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Radar PLACSP + OCR (F7) — PURO. Empareja anuncios ya normalizados con los
// criterios de la empresa y detecta pliegos escaneados. Determinista.
// El sondeo en vivo de PLACSP y el OCR son infraestructura de la app.
// ────────────────────────────────────────────────────────────────────────────

import type {
  AnuncioRadar,
  CoincidenciaRadar,
  CriteriosRadar,
} from './types'

/** Normaliza: minúsculas, sin acentos, espacios colapsados. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Evalúa un anuncio contra los criterios de la empresa. Casa si hay al menos un
 * match (CPV por prefijo o palabra clave) y el presupuesto, si se conoce y hay
 * límites, cae dentro del rango. Un presupuesto fuera de rango DESCARTA.
 */
export function coincideRadar(anuncio: AnuncioRadar, criterios: CriteriosRadar): CoincidenciaRadar {
  const motivos: string[] = []
  let puntuacion = 0

  // CPV por prefijo
  const cpvCrit = criterios.cpv ?? []
  const cpvAnun = anuncio.cpv ?? []
  for (const c of cpvCrit) {
    if (cpvAnun.some(a => a.startsWith(c))) {
      motivos.push(`CPV ${c} de interés`)
      puntuacion += 50
      break
    }
  }

  // Palabras clave en título + objeto
  const texto = norm(`${anuncio.titulo} ${anuncio.objeto ?? ''}`)
  for (const kw of criterios.palabras_clave ?? []) {
    if (texto.includes(norm(kw))) {
      motivos.push(`Palabra clave «${kw}»`)
      puntuacion += 30
    }
  }

  // Presupuesto: si hay límites y el anuncio trae importe, debe caer dentro.
  let presupuestoOk = true
  if (anuncio.presupuesto !== undefined) {
    if (criterios.presupuesto_min !== undefined && anuncio.presupuesto < criterios.presupuesto_min) presupuestoOk = false
    if (criterios.presupuesto_max !== undefined && anuncio.presupuesto > criterios.presupuesto_max) presupuestoOk = false
    if (!presupuestoOk) motivos.push('Presupuesto fuera del rango buscado')
  }

  const coincide = puntuacion > 0 && presupuestoOk
  return { coincide, puntuacion: coincide ? Math.min(100, puntuacion) : 0, motivos }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/radar.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/radar.ts packages/module-concursos/test/radar.test.ts
git commit -m "feat(concursos): coincideRadar empareja anuncio con criterios (F7)"
```

---

## Task 3: `filtrarRadar` y `necesitaOcr`

**Files:**
- Modify: `packages/module-concursos/src/radar.ts`
- Modify: `packages/module-concursos/test/radar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `test/radar.test.ts`:

```ts
import { filtrarRadar, necesitaOcr } from '../src/radar.ts'

test('filtrarRadar: devuelve solo los que casan, ordenados por puntuación', () => {
  const anuncios: AnuncioRadar[] = [
    { titulo: 'Obra de carretera', cpv: ['45200000'] },
    { titulo: 'Limpieza de oficinas', objeto: 'limpieza', cpv: ['90910000'], presupuesto: 30000 },
    { titulo: 'Limpieza y mantenimiento', objeto: 'limpieza integral', cpv: ['90910000'] },
  ]
  const crit: CriteriosRadar = { cpv: ['9091'], palabras_clave: ['limpieza'] }
  const out = filtrarRadar(anuncios, crit)
  assert.equal(out.length, 2)               // la obra se descarta
  assert.ok(/Limpieza/.test(out[0].titulo)) // el de más puntos primero
})

test('necesitaOcr: texto demasiado corto sugiere PDF escaneado', () => {
  assert.equal(necesitaOcr('   '), true)
  assert.equal(necesitaOcr('x'.repeat(50)), true)
  assert.equal(necesitaOcr('x'.repeat(500)), false)
})

test('necesitaOcr: umbral configurable', () => {
  assert.equal(necesitaOcr('x'.repeat(120), 100), false)
  assert.equal(necesitaOcr('x'.repeat(80), 100), true)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/packages/module-concursos && node --test test/radar.test.ts`
Expected: FAIL — `filtrarRadar is not a function`.

- [ ] **Step 3: Implementar**

Añade a `src/radar.ts`:

```ts
/** Anuncios que casan, ordenados por relevancia descendente. */
export function filtrarRadar(anuncios: AnuncioRadar[], criterios: CriteriosRadar): AnuncioRadar[] {
  return anuncios
    .map(a => ({ a, m: coincideRadar(a, criterios) }))
    .filter(x => x.m.coincide)
    .sort((x, y) => y.m.puntuacion - x.m.puntuacion)
    .map(x => x.a)
}

/** Caracteres mínimos de texto útil; por debajo, el PDF probablemente es escaneado. */
export const MIN_TEXTO_PLIEGO = 200

/**
 * Heurística: si el texto extraído del pliego es demasiado corto, el PDF está
 * escaneado (imagen) y hay que pasarle OCR antes de analizarlo.
 */
export function necesitaOcr(texto: string, minChars = MIN_TEXTO_PLIEGO): boolean {
  return (texto || '').trim().length < minChars
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/packages/module-concursos && node --test test/radar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-concursos/src/radar.ts packages/module-concursos/test/radar.test.ts
git commit -m "feat(concursos): filtrarRadar y necesitaOcr (F7)"
```

---

## Task 4: Re-exports en `index.ts` y suite completa

**Files:**
- Modify: `packages/module-concursos/src/index.ts`

- [ ] **Step 1: Añadir los re-exports**

En `src/index.ts`, tras el bloque de F6 (presentación), añade:

```ts
// Radar PLACSP + OCR (puro): emparejado de anuncios y detección de OCR
export {
  coincideRadar,
  filtrarRadar,
  necesitaOcr,
  MIN_TEXTO_PLIEGO,
} from './radar'
```

Y dentro del `export type { … } from './types'` añade:

```ts
  AnuncioRadar,
  CriteriosRadar,
  CoincidenciaRadar,
```

- [ ] **Step 2: Ejecutar TODA la suite del módulo**

Run: `cd /home/user/central/packages/module-concursos && npm test`
Expected: PASS — v1 + F2 + F3 + F4 + F5 + F6 + los nuevos de F7, todos verdes.

- [ ] **Step 3: Commit**

```bash
git add packages/module-concursos/src/index.ts
git commit -m "feat(concursos): exporta la API del radar PLACSP (F7)"
```

---

## Task 5: Actualizar memoria de sesión y docs, y empujar

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada F7: módulo puro (`radar.ts`: `coincideRadar`/`filtrarRadar`/`necesitaOcr` + tests) — emparejado de anuncios con el perfil (CPV/palabras clave/presupuesto) y detección de pliegos escaneados. Documenta que el **sondeo en vivo de PLACSP** (feed Atom + cron) y el **motor OCR** son infraestructura pendiente de wiring (claves/cron) en la app; el módulo expone el contrato que consumirán. Cierra: agente de concursos F2–F7 completo a nivel de módulo puro + integración ialimp de F2–F6.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de F7: módulo `radar.ts` (emparejado de anuncios + `necesitaOcr`); el sondeo PLACSP (Atom) y el OCR quedan como infraestructura pendiente (cron + claves) que consumirá `filtrarRadar`/`necesitaOcr`.

- [ ] **Step 3: Commit y push**

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión F7 radar PLACSP + OCR (concursos)"
git push -u origin claude/public-tender-agent-module-mid0hu
```

---

## Notas de cierre

- **Infraestructura pendiente (no verificable en este entorno):**
  - **Radar PLACSP en vivo:** un cron que descarga el feed Atom de la Plataforma de Contratación del Sector Público, lo normaliza a `AnuncioRadar[]` y aplica `filtrarRadar` con los criterios de cada empresa; los matches se avisan por web-push (ya disponible en ialimp). Requiere la URL del feed y un cron en `vercel.json`.
  - **OCR:** cuando `necesitaOcr(textoExtraído)` es `true`, pasar el PDF por un motor OCR (Tesseract self-host o un servicio cloud) y reanalizar. Requiere el motor/clave.
- **Decisión de diseño:** el módulo se queda en lo puro y determinista (emparejado y heurística de OCR) para ser testable y portable; la captación en vivo y el OCR, que dependen de red/binarios/claves, viven en la app.
- **Estado del agente tras F7:** F2–F7 completas a nivel de módulo puro (con tests) e integradas en ialimp F2–F6; F7 entrega el núcleo de radar/OCR y deja la captación en vivo como infraestructura.
