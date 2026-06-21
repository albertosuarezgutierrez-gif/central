# Módulo Organizador de Trabajo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el paquete compartido `@central/module-organizador-trabajo` — lógica PURA que, dadas tareas (con tiempo estimado, prioridad y caducidad), trabajadores disponibles y una señal de carga, planifica por caducidad, asigna trabajo con equidad, decide la siguiente tarea de un trabajador ocioso e imputa el tiempo en partes de trabajo.

**Architecture:** Paquete puro ESM en `packages/` siguiendo el patrón de `module-concursos`/`module-horario`: sin BD, sin `process.env`, sin LLM. Recibe filas ya normalizadas (puertos por tipos) y devuelve resultados deterministas. Cada vertical (ia-rest cocina/sala, ialimp limpiadoras) le enchufará su adaptador en un plan posterior — este plan entrega SOLO el paquete puro y sus tests.

**Tech Stack:** TypeScript ESM, runner nativo `node --test` (type-stripping de Node 22), pnpm workspaces (`workspace:*`).

**Branch:** `claude/great-feynman-ec9366`.

**Scope note:** Subsistema único = el paquete puro. La integración en cada vertical (rutas, tablas `tareas_operativas`, UI de fichaje, señal de comandas abiertas) son subsistemas aparte → planes separados. NO se tocan las apps en vivo en este plan.

---

## File Structure

- `packages/module-organizador-trabajo/package.json` — manifiesto del paquete (`@central/module-organizador-trabajo`).
- `packages/module-organizador-trabajo/tsconfig.json` — TS standalone (copia del de `module-concursos`).
- `packages/module-organizador-trabajo/src/types.ts` — PUERTOS: `Tarea`, `Trabajador`, `EstadoCarga`, y tipos de salida.
- `packages/module-organizador-trabajo/src/carga.ts` — `estaOcioso` (¿hay hueco de trabajo?).
- `packages/module-organizador-trabajo/src/planificar.ts` — `planificarPorCaducidad` (cuándo empezar cada elaboración).
- `packages/module-organizador-trabajo/src/asignar.ts` — `asignarTrabajo` (reparto por prioridad/rol/equidad + tiempo imputado).
- `packages/module-organizador-trabajo/src/siguiente.ts` — `siguienteTarea` (caso camarero: tarea para el ocioso).
- `packages/module-organizador-trabajo/src/partes.ts` — `construirParte` + `resumirPartes` (tiempo estimado vs real).
- `packages/module-organizador-trabajo/src/index.ts` — barrel de exports.
- `packages/module-organizador-trabajo/test/*.test.ts` — un fichero de test por módulo de lógica.

---

## Task 0: Scaffold del paquete

**Files:**
- Create: `packages/module-organizador-trabajo/package.json`
- Create: `packages/module-organizador-trabajo/tsconfig.json`
- Create: `packages/module-organizador-trabajo/src/index.ts` (vacío temporal)
- Create: `packages/module-organizador-trabajo/test/smoke.test.ts`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "@central/module-organizador-trabajo",
  "version": "0.0.0",
  "private": true,
  "description": "Organizador de trabajo (casa de marcas): lógica pura que orquesta TAREAS por carga de trabajo. Dadas tareas (tiempo estimado, prioridad, caducidad), trabajadores disponibles y una señal de carga, planifica por caducidad, asigna con equidad, decide la siguiente tarea de un trabajador ocioso e imputa el tiempo en partes de trabajo. Agnóstico de BD/vertical: lo enchufa ia-rest (cocina/sala), ialimp (limpiadoras), etc. Sin BD, sin secretos, sin LLM.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "node --test test/*.test.ts"
  },
  "sideEffects": false,
  "license": "UNLICENSED"
}
```

- [ ] **Step 2: Crear `tsconfig.json`** (idéntico a `packages/module-concursos/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["esnext", "dom"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Crear `src/index.ts` temporal**

```typescript
// Organizador de Trabajo (casa de marcas) — entry point único. Lógica pura.
export {}
```

- [ ] **Step 4: Crear `test/smoke.test.ts`**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('el paquete carga', () => {
  assert.equal(1 + 1, 2)
})
```

- [ ] **Step 5: Enlazar el workspace y verificar que el runner funciona**

Run: `cd /home/user/central && pnpm install`
Expected: instala sin error y crea el symlink del nuevo paquete.

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/*.test.ts`
Expected: PASS (1 test, 0 fail).

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo docs/superpowers/plans
git commit -m "feat(organizador-trabajo): scaffold del paquete puro + plan"
```

---

## Task 1: Puertos y tipos (`types.ts`)

**Files:**
- Create: `packages/module-organizador-trabajo/src/types.ts`

- [ ] **Step 1: Escribir `src/types.ts`** (no necesita test propio; lo cubren las tareas siguientes)

```typescript
// PUERTOS del Organizador de Trabajo. Cada vertical normaliza sus filas a estos tipos.
// El módulo es PURO: no consulta BD, solo recibe estructuras ya normalizadas.

export type Prioridad = 'urgente' | 'alta' | 'normal' | 'baja'
export type EstadoTarea = 'pendiente' | 'en_proceso' | 'hecha'

/** Una unidad de trabajo: una elaboración de cocina, una tarea operativa de sala, una limpieza… */
export interface Tarea {
  id: string
  nombre: string
  tipo: string                     // 'elaboracion' | 'operativa' | 'limpieza' | ...
  duracion_estimada_min: number    // tiempo estimado (escandallo / catalogo_tarifas.tiempo_min)
  prioridad: Prioridad
  vence_at?: string | null         // ISO 8601: cuándo debe estar HECHA (caducidad / "listo para")
  requiere_rol?: string | null     // rol/capacidad requerida; null/ausente = cualquiera la puede hacer
  estado?: EstadoTarea             // ausente = se trata como 'pendiente'
}

/** Quien ejecuta el trabajo: cocinero, camarero, limpiadora… */
export interface Trabajador {
  id: string
  nombre: string
  rol: string                      // 'cocinero' | 'camarero' | 'limpiadora' | ...
  disponible: boolean              // fichado/activo AHORA
  roles?: string[]                 // capacidades extra (qué `requiere_rol` puede cubrir además del suyo)
}

/** Señal de carga viva. `nivel` = carga actual (p.ej. nº de comandas abiertas u horas en cola). */
export interface EstadoCarga {
  nivel: number
  umbral_ocioso: number            // nivel <= umbral_ocioso → el trabajador está "ocioso"
}

export interface Asignacion {
  trabajador_id: string
  tarea_id: string
}

export interface PlanAsignacion {
  asignaciones: Asignacion[]
  sin_asignar: string[]                            // ids de tareas que nadie pudo coger
  minutos_por_trabajador: Record<string, number>   // tiempo imputado por trabajador
}

export interface TareaPlanificada {
  tarea_id: string
  empezar_antes_de: string | null  // ISO = vence_at − duracion_estimada; null si la tarea no vence
  holgura_min: number | null       // minutos desde "ahora" hasta empezar_antes_de; null si no vence
  en_riesgo: boolean               // holgura < 0 → no llega a tiempo
}

export interface ParteTrabajo {
  trabajador_id: string
  tarea_id: string
  concepto: string
  minutos_estimados: number
  minutos_reales: number | null
  desviacion_min: number | null    // minutos_reales − minutos_estimados (null si no hay real)
}

export interface ResumenTrabajador {
  trabajador_id: string
  tareas: number
  minutos_estimados: number
  minutos_reales: number
}
```

- [ ] **Step 2: Verificar que compila** (sin tests aún, solo tipos)

Run: `cd /home/user/central/packages/module-organizador-trabajo && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/types.ts
git commit -m "feat(organizador-trabajo): puertos y tipos de dominio"
```

---

## Task 2: Señal de carga (`carga.ts`)

**Files:**
- Create: `packages/module-organizador-trabajo/src/carga.ts`
- Test: `packages/module-organizador-trabajo/test/carga.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estaOcioso } from '../src/carga.ts'

test('estaOcioso: nivel por debajo del umbral → ocioso', () => {
  assert.equal(estaOcioso({ nivel: 1, umbral_ocioso: 3 }), true)
})

test('estaOcioso: nivel igual al umbral → ocioso (borde inclusivo)', () => {
  assert.equal(estaOcioso({ nivel: 3, umbral_ocioso: 3 }), true)
})

test('estaOcioso: nivel por encima del umbral → hay trabajo', () => {
  assert.equal(estaOcioso({ nivel: 5, umbral_ocioso: 3 }), false)
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/carga.test.ts`
Expected: FAIL ("Cannot find module '../src/carga.ts'").

- [ ] **Step 3: Implementar `src/carga.ts`**

```typescript
import type { EstadoCarga } from './types'

/** ¿El trabajador tiene un hueco? Carga actual por debajo (o igual) del umbral configurado. */
export function estaOcioso(carga: EstadoCarga): boolean {
  return carga.nivel <= carga.umbral_ocioso
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/carga.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/carga.ts packages/module-organizador-trabajo/test/carga.test.ts
git commit -m "feat(organizador-trabajo): estaOcioso (señal de carga)"
```

---

## Task 3: Planificación por caducidad (`planificar.ts`)

**Files:**
- Create: `packages/module-organizador-trabajo/src/planificar.ts`
- Test: `packages/module-organizador-trabajo/test/planificar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planificarPorCaducidad } from '../src/planificar.ts'
import type { Tarea } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'elaboracion', duracion_estimada_min: 60, prioridad: 'normal', ...over }
}

test('calcula empezar_antes_de = vence_at − duracion', () => {
  const [p] = planificarPorCaducidad(
    [tarea({ id: 'a', duracion_estimada_min: 60, vence_at: '2026-06-17T12:00:00.000Z' })],
    '2026-06-17T09:00:00.000Z',
  )
  assert.equal(p.empezar_antes_de, '2026-06-17T11:00:00.000Z')
  assert.equal(p.holgura_min, 120) // de 09:00 a 11:00
  assert.equal(p.en_riesgo, false)
})

test('en_riesgo cuando ya no se llega a tiempo', () => {
  const [p] = planificarPorCaducidad(
    [tarea({ id: 'b', duracion_estimada_min: 120, vence_at: '2026-06-17T10:00:00.000Z' })],
    '2026-06-17T09:00:00.000Z', // empezar_antes_de = 08:00 < ahora
  )
  assert.equal(p.holgura_min, -60)
  assert.equal(p.en_riesgo, true)
})

test('tarea sin vencimiento: campos nulos, no en riesgo', () => {
  const [p] = planificarPorCaducidad([tarea({ id: 'c', vence_at: null })], '2026-06-17T09:00:00.000Z')
  assert.equal(p.empezar_antes_de, null)
  assert.equal(p.holgura_min, null)
  assert.equal(p.en_riesgo, false)
})

test('ordena por empezar_antes_de ascendente; las sin vencimiento al final', () => {
  const res = planificarPorCaducidad([
    tarea({ id: 'tarde', duracion_estimada_min: 30, vence_at: '2026-06-17T20:00:00.000Z' }),
    tarea({ id: 'sin', vence_at: null }),
    tarea({ id: 'pronto', duracion_estimada_min: 30, vence_at: '2026-06-17T12:00:00.000Z' }),
  ], '2026-06-17T09:00:00.000Z')
  assert.deepEqual(res.map(r => r.tarea_id), ['pronto', 'tarde', 'sin'])
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/planificar.test.ts`
Expected: FAIL ("Cannot find module '../src/planificar.ts'").

- [ ] **Step 3: Implementar `src/planificar.ts`**

```typescript
import type { Tarea, TareaPlanificada } from './types'

/**
 * Para cada tarea con caducidad, calcula a más tardar CUÁNDO hay que empezarla
 * (vence_at − duración estimada) y la holgura desde "ahora". Ordena por el
 * momento de inicio más temprano; las tareas sin caducidad quedan al final.
 *
 * @param ahoraIso instante de referencia (ISO 8601)
 */
export function planificarPorCaducidad(tareas: Tarea[], ahoraIso: string): TareaPlanificada[] {
  const ahora = new Date(ahoraIso).getTime()
  const planificadas = tareas.map((t): TareaPlanificada => {
    if (!t.vence_at) {
      return { tarea_id: t.id, empezar_antes_de: null, holgura_min: null, en_riesgo: false }
    }
    const vence = new Date(t.vence_at).getTime()
    const empezarMs = vence - t.duracion_estimada_min * 60_000
    const holgura = Math.round((empezarMs - ahora) / 60_000)
    return {
      tarea_id: t.id,
      empezar_antes_de: new Date(empezarMs).toISOString(),
      holgura_min: holgura,
      en_riesgo: holgura < 0,
    }
  })
  return planificadas.sort((a, b) => {
    if (a.empezar_antes_de === null) return b.empezar_antes_de === null ? 0 : 1
    if (b.empezar_antes_de === null) return -1
    return a.empezar_antes_de < b.empezar_antes_de ? -1 : a.empezar_antes_de > b.empezar_antes_de ? 1 : 0
  })
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/planificar.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/planificar.ts packages/module-organizador-trabajo/test/planificar.test.ts
git commit -m "feat(organizador-trabajo): planificarPorCaducidad"
```

---

## Task 4: Asignación de trabajo (`asignar.ts`)

**Files:**
- Create: `packages/module-organizador-trabajo/src/asignar.ts`
- Test: `packages/module-organizador-trabajo/test/asignar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asignarTrabajo } from '../src/asignar.ts'
import type { Tarea, Trabajador } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'elaboracion', duracion_estimada_min: 30, prioridad: 'normal', ...over }
}
function trab(over: Partial<Trabajador> = {}): Trabajador {
  return { id: 'w', nombre: 'W', rol: 'cocinero', disponible: true, ...over }
}

test('reparte equilibrando minutos imputados (equidad de carga)', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a', duracion_estimada_min: 60 }), tarea({ id: 'b', duracion_estimada_min: 30 })],
    [trab({ id: 'w1' }), trab({ id: 'w2' })],
  )
  // a (más prioritaria por orden estable) → w1; b → w2 (el de menos carga)
  assert.deepEqual(plan.asignaciones, [
    { trabajador_id: 'w1', tarea_id: 'a' },
    { trabajador_id: 'w2', tarea_id: 'b' },
  ])
  assert.deepEqual(plan.minutos_por_trabajador, { w1: 60, w2: 30 })
  assert.deepEqual(plan.sin_asignar, [])
})

test('respeta requiere_rol y deja sin asignar si nadie puede', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a', requiere_rol: 'pastelero' })],
    [trab({ id: 'w1', rol: 'cocinero' })],
  )
  assert.deepEqual(plan.asignaciones, [])
  assert.deepEqual(plan.sin_asignar, ['a'])
})

test('un trabajador con capacidad extra (roles) cubre el rol requerido', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a', requiere_rol: 'pastelero' })],
    [trab({ id: 'w1', rol: 'cocinero', roles: ['pastelero'] })],
  )
  assert.deepEqual(plan.asignaciones, [{ trabajador_id: 'w1', tarea_id: 'a' }])
})

test('prioridad manda sobre el orden de entrada', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'baja', prioridad: 'baja' }), tarea({ id: 'urge', prioridad: 'urgente' })],
    [trab({ id: 'w1' })],
  )
  // urge se asigna primero aunque venga después
  assert.deepEqual(plan.asignaciones.map(a => a.tarea_id), ['urge', 'baja'])
})

test('ignora tareas ya hechas y trabajadores no disponibles', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a' }), tarea({ id: 'hecha', estado: 'hecha' })],
    [trab({ id: 'w1', disponible: false }), trab({ id: 'w2', disponible: true })],
  )
  assert.deepEqual(plan.asignaciones, [{ trabajador_id: 'w2', tarea_id: 'a' }])
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/asignar.test.ts`
Expected: FAIL ("Cannot find module '../src/asignar.ts'").

- [ ] **Step 3: Implementar `src/asignar.ts`**

```typescript
import type { Tarea, Trabajador, PlanAsignacion } from './types'

const PESO_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 }

/** ¿Este trabajador puede ejecutar la tarea? (rol propio o capacidad extra en `roles`). */
function puede(trab: Trabajador, tarea: Tarea): boolean {
  if (!tarea.requiere_rol) return true
  if (trab.rol === tarea.requiere_rol) return true
  return !!trab.roles?.includes(tarea.requiere_rol)
}

/**
 * Reparte las tareas pendientes entre los trabajadores disponibles.
 * Orden de servicio: prioridad → caducidad más próxima (vence antes) → orden estable.
 * Para cada tarea elige al trabajador apto con MENOS minutos imputados (equidad).
 * Imputa el tiempo estimado de la tarea al trabajador asignado.
 */
export function asignarTrabajo(tareas: Tarea[], trabajadores: Trabajador[]): PlanAsignacion {
  const disponibles = trabajadores.filter(t => t.disponible)
  const minutos: Record<string, number> = {}
  for (const t of disponibles) minutos[t.id] = 0

  const pendientes = tareas
    .filter(t => (t.estado ?? 'pendiente') === 'pendiente')
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const pa = PESO_PRIORIDAD[a.t.prioridad] ?? 2
      const pb = PESO_PRIORIDAD[b.t.prioridad] ?? 2
      if (pa !== pb) return pa - pb
      const va = a.t.vence_at ?? '~'   // '~' > cualquier ISO → las sin caducidad al final
      const vb = b.t.vence_at ?? '~'
      if (va !== vb) return va < vb ? -1 : 1
      return a.i - b.i                 // estable
    })
    .map(x => x.t)

  const asignaciones: PlanAsignacion['asignaciones'] = []
  const sin_asignar: string[] = []
  for (const tarea of pendientes) {
    const cand = disponibles
      .filter(t => puede(t, tarea))
      .sort((a, b) => minutos[a.id] - minutos[b.id])[0]
    if (!cand) { sin_asignar.push(tarea.id); continue }
    asignaciones.push({ trabajador_id: cand.id, tarea_id: tarea.id })
    minutos[cand.id] += tarea.duracion_estimada_min
  }
  return { asignaciones, sin_asignar, minutos_por_trabajador: minutos }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/asignar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/asignar.ts packages/module-organizador-trabajo/test/asignar.test.ts
git commit -m "feat(organizador-trabajo): asignarTrabajo (prioridad/rol/equidad)"
```

---

## Task 5: Siguiente tarea del ocioso (`siguiente.ts`)

**Files:**
- Create: `packages/module-organizador-trabajo/src/siguiente.ts`
- Test: `packages/module-organizador-trabajo/test/siguiente.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siguienteTarea } from '../src/siguiente.ts'
import type { Tarea, Trabajador, EstadoCarga } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'operativa', duracion_estimada_min: 10, prioridad: 'normal', ...over }
}
const camarero: Trabajador = { id: 'c1', nombre: 'C', rol: 'camarero', disponible: true }
const OCIOSO: EstadoCarga = { nivel: 1, umbral_ocioso: 3 }
const OCUPADO: EstadoCarga = { nivel: 9, umbral_ocioso: 3 }

test('con carga alta no empuja ninguna tarea', () => {
  assert.equal(siguienteTarea(camarero, [tarea()], OCUPADO), null)
})

test('ocioso: devuelve la tarea pendiente que puede hacer', () => {
  const t = siguienteTarea(camarero, [tarea({ id: 'barrer' })], OCIOSO)
  assert.equal(t?.id, 'barrer')
})

test('ocioso: prioridad manda, y a igualdad la más corta primero', () => {
  const t = siguienteTarea(camarero, [
    tarea({ id: 'larga', prioridad: 'normal', duracion_estimada_min: 30 }),
    tarea({ id: 'corta', prioridad: 'normal', duracion_estimada_min: 5 }),
    tarea({ id: 'urge', prioridad: 'urgente', duracion_estimada_min: 60 }),
  ], OCIOSO)
  assert.equal(t?.id, 'urge')
})

test('ocioso pero sin tareas que pueda hacer → null', () => {
  const t = siguienteTarea(camarero, [tarea({ id: 'cocina', requiere_rol: 'cocinero' })], OCIOSO)
  assert.equal(t, null)
})

test('trabajador no disponible → null aunque esté ocioso', () => {
  const t = siguienteTarea({ ...camarero, disponible: false }, [tarea()], OCIOSO)
  assert.equal(t, null)
})

test('ignora tareas no pendientes', () => {
  const t = siguienteTarea(camarero, [tarea({ id: 'a', estado: 'en_proceso' })], OCIOSO)
  assert.equal(t, null)
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/siguiente.test.ts`
Expected: FAIL ("Cannot find module '../src/siguiente.ts'").

- [ ] **Step 3: Implementar `src/siguiente.ts`**

```typescript
import type { Tarea, Trabajador, EstadoCarga } from './types'
import { estaOcioso } from './carga'

const PESO_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 }

function puede(trab: Trabajador, tarea: Tarea): boolean {
  if (!tarea.requiere_rol) return true
  if (trab.rol === tarea.requiere_rol) return true
  return !!trab.roles?.includes(tarea.requiere_rol)
}

/**
 * Caso "camarero en hora floja": si la carga viva es baja (trabajador ocioso),
 * devuelve la siguiente tarea operativa pendiente que puede hacer. Si hay
 * trabajo (carga alta), no está disponible, o no hay tareas aptas → null.
 * Selección: prioridad y, a igualdad, la tarea más corta (cabe en el hueco).
 */
export function siguienteTarea(
  trabajador: Trabajador,
  tareas: Tarea[],
  carga: EstadoCarga,
): Tarea | null {
  if (!trabajador.disponible) return null
  if (!estaOcioso(carga)) return null
  const candidatas = tareas
    .filter(t => (t.estado ?? 'pendiente') === 'pendiente')
    .filter(t => puede(trabajador, t))
    .sort((a, b) => {
      const pa = PESO_PRIORIDAD[a.prioridad] ?? 2
      const pb = PESO_PRIORIDAD[b.prioridad] ?? 2
      if (pa !== pb) return pa - pb
      return a.duracion_estimada_min - b.duracion_estimada_min
    })
  return candidatas[0] ?? null
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/siguiente.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/siguiente.ts packages/module-organizador-trabajo/test/siguiente.test.ts
git commit -m "feat(organizador-trabajo): siguienteTarea (ocioso por carga viva)"
```

---

## Task 6: Partes de trabajo + tiempo imputado (`partes.ts`)

**Files:**
- Create: `packages/module-organizador-trabajo/src/partes.ts`
- Test: `packages/module-organizador-trabajo/test/partes.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirParte, resumirPartes } from '../src/partes.ts'
import type { Tarea } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'Cortar queso', tipo: 'elaboracion', duracion_estimada_min: 30, prioridad: 'normal', ...over }
}

test('construirParte con tiempo real calcula la desviación', () => {
  const p = construirParte(tarea({ id: 'a' }), 'w1', 20)
  assert.deepEqual(p, {
    trabajador_id: 'w1', tarea_id: 'a', concepto: 'Cortar queso',
    minutos_estimados: 30, minutos_reales: 20, desviacion_min: -10,
  })
})

test('construirParte sin tiempo real deja real y desviación en null', () => {
  const p = construirParte(tarea({ id: 'b' }), 'w1', null)
  assert.equal(p.minutos_reales, null)
  assert.equal(p.desviacion_min, null)
})

test('resumirPartes agrega por trabajador (real null cuenta como 0)', () => {
  const partes = [
    construirParte(tarea({ id: 'a', duracion_estimada_min: 30 }), 'w1', 20),
    construirParte(tarea({ id: 'b', duracion_estimada_min: 15 }), 'w1', null),
    construirParte(tarea({ id: 'c', duracion_estimada_min: 10 }), 'w2', 12),
  ]
  assert.deepEqual(resumirPartes(partes), [
    { trabajador_id: 'w1', tareas: 2, minutos_estimados: 45, minutos_reales: 20 },
    { trabajador_id: 'w2', tareas: 1, minutos_estimados: 10, minutos_reales: 12 },
  ])
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/partes.test.ts`
Expected: FAIL ("Cannot find module '../src/partes.ts'").

- [ ] **Step 3: Implementar `src/partes.ts`**

```typescript
import type { Tarea, ParteTrabajo, ResumenTrabajador } from './types'

/** Crea el parte de trabajo de una tarea ejecutada, con la desviación estimado↔real. */
export function construirParte(
  tarea: Tarea,
  trabajadorId: string,
  minutosReales: number | null,
): ParteTrabajo {
  const desviacion = minutosReales == null ? null : minutosReales - tarea.duracion_estimada_min
  return {
    trabajador_id: trabajadorId,
    tarea_id: tarea.id,
    concepto: tarea.nombre,
    minutos_estimados: tarea.duracion_estimada_min,
    minutos_reales: minutosReales,
    desviacion_min: desviacion,
  }
}

/** Agrega los partes por trabajador (base de nómina / productividad). */
export function resumirPartes(partes: ParteTrabajo[]): ResumenTrabajador[] {
  const m = new Map<string, ResumenTrabajador>()
  for (const p of partes) {
    const cur = m.get(p.trabajador_id)
      ?? { trabajador_id: p.trabajador_id, tareas: 0, minutos_estimados: 0, minutos_reales: 0 }
    cur.tareas += 1
    cur.minutos_estimados += p.minutos_estimados
    cur.minutos_reales += p.minutos_reales ?? 0
    m.set(p.trabajador_id, cur)
  }
  return [...m.values()]
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/partes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/partes.ts packages/module-organizador-trabajo/test/partes.test.ts
git commit -m "feat(organizador-trabajo): construirParte + resumirPartes (tiempo imputado)"
```

---

## Task 7: Barrel `index.ts` + verificación global

**Files:**
- Modify: `packages/module-organizador-trabajo/src/index.ts`
- Delete: `packages/module-organizador-trabajo/test/smoke.test.ts`

- [ ] **Step 1: Reescribir `src/index.ts`**

```typescript
// Organizador de Trabajo (casa de marcas) — entry point único. Lógica PURA:
// sin BD, sin secretos, sin LLM. Cada vertical normaliza sus filas a los puertos.

// Puertos y tipos de dominio
export type {
  Prioridad,
  EstadoTarea,
  Tarea,
  Trabajador,
  EstadoCarga,
  Asignacion,
  PlanAsignacion,
  TareaPlanificada,
  ParteTrabajo,
  ResumenTrabajador,
} from './types'

// Señal de carga
export { estaOcioso } from './carga'

// Planificación por caducidad
export { planificarPorCaducidad } from './planificar'

// Asignación de trabajo
export { asignarTrabajo } from './asignar'

// Siguiente tarea del trabajador ocioso (carga viva)
export { siguienteTarea } from './siguiente'

// Partes de trabajo / tiempo imputado
export { construirParte, resumirPartes } from './partes'
```

- [ ] **Step 2: Borrar el smoke test temporal**

Run: `cd /home/user/central/packages/module-organizador-trabajo && rm test/smoke.test.ts`

- [ ] **Step 3: Añadir un test del barrel**

Create: `packages/module-organizador-trabajo/test/index.test.ts`

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as mod from '../src/index.ts'

test('el barrel exporta toda la API pública', () => {
  for (const fn of ['estaOcioso', 'planificarPorCaducidad', 'asignarTrabajo', 'siguienteTarea', 'construirParte', 'resumirPartes']) {
    assert.equal(typeof (mod as Record<string, unknown>)[fn], 'function', `falta export: ${fn}`)
  }
})
```

- [ ] **Step 4: Ejecutar TODA la suite del paquete**

Run: `cd /home/user/central/packages/module-organizador-trabajo && node --test test/*.test.ts`
Expected: PASS (todos los tests, 0 fail).

- [ ] **Step 5: Typecheck del paquete**

Run: `cd /home/user/central/packages/module-organizador-trabajo && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 6: Verificar que la guardia del monorepo sigue verde**

Run: `cd /home/user/central && pnpm --filter @central/module-organizador-trabajo test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/user/central
git add packages/module-organizador-trabajo/src/index.ts packages/module-organizador-trabajo/test/index.test.ts
git rm packages/module-organizador-trabajo/test/smoke.test.ts
git commit -m "feat(organizador-trabajo): barrel de API pública + verificación global"
```

- [ ] **Step 8: Push**

```bash
cd /home/user/central
git push -u origin claude/great-feynman-ec9366
```

---

## Self-Review (hecho)

- **Cobertura del spec:** carga viva (`estaOcioso`, Task 2) · caducidad/cuándo elaborar (`planificarPorCaducidad`, Task 3) · reparto con tiempo imputado (`asignarTrabajo`, Task 4) · camarero ocioso (`siguienteTarea`, Task 5) · partes de trabajo estimado↔real (`partes`, Task 6). Los tres adaptadores por vertical = plan aparte (fuera de scope, declarado).
- **Sin placeholders:** cada step lleva código o comando real con salida esperada.
- **Consistencia de tipos:** `Tarea`, `Trabajador`, `EstadoCarga`, `PlanAsignacion`, `TareaPlanificada`, `ParteTrabajo`, `ResumenTrabajador` definidos en Task 1 y usados con las mismas firmas en Tasks 2-7. `PESO_PRIORIDAD` y `puede()` se repiten a propósito en `asignar.ts` y `siguiente.ts` (módulos independientes; helpers locales pequeños, no merece un fichero compartido — YAGNI).
