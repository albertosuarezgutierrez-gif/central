# module-materiales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `@central/module-inventario` → `@central/module-materiales` añadiendo tipos de espacio, transferencias, contabilidad de compra, estado físico, stock mínimo, código, garantía y documentos adjuntos.

**Architecture:** Nuevo paquete `packages/module-materiales/` con tipos extendidos (`Material`, `Espacio`, `TransferenciaMaterial`, `ResumenContable`) y funciones puras nuevas. Los tres adaptadores existentes (ia-rest, ialimp, sivra) se actualizan al nuevo API. El paquete viejo `packages/module-inventario/` se elimina. Una migración SQL añade las columnas nuevas a ia-rest.

**Tech Stack:** TypeScript puro · Node 22 `--test` runner · pnpm workspaces · Supabase SQL (ia-rest)

---

## Mapa de ficheros

| Acción | Ruta |
|---|---|
| Crear | `packages/module-materiales/package.json` |
| Crear | `packages/module-materiales/tsconfig.json` |
| Crear | `packages/module-materiales/src/types.ts` |
| Crear | `packages/module-materiales/src/stock.ts` |
| Crear | `packages/module-materiales/src/index.ts` |
| Crear | `packages/module-materiales/test/materiales.test.ts` |
| Eliminar | `packages/module-inventario/` (todo) |
| Modificar | `apps/ia-rest/package.json` |
| Modificar | `apps/ia-rest/src/lib/inventario-menaje.ts` |
| Modificar | `apps/ia-rest/src/app/api/owner/menaje/route.ts` |
| Modificar | `apps/ialimp/package.json` |
| Modificar | `apps/ialimp/next.config.ts` |
| Modificar | `apps/ialimp/lib/adapters/inventario.ts` |
| Modificar | `apps/sivra/package.json` |
| Modificar | `apps/sivra/lib/adapters/inventario.ts` |
| Modificar | `apps/plataforma/lib/estructura.ts` |
| Crear | `apps/ia-rest/supabase/migrations/2026-06-12_materiales_v2.sql` |

---

### Task 1: Scaffold del paquete

**Files:**
- Create: `packages/module-materiales/package.json`
- Create: `packages/module-materiales/tsconfig.json`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "@central/module-materiales",
  "version": "0.0.0",
  "private": true,
  "description": "Módulo de Materiales (casa de marcas): catálogo de activos físicos y consumibles + espacios + transferencias + contabilidad de compra/roturas. Agnóstico de vertical y de BD; cada app aporta adaptadores sobre sus tablas.",
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

- [ ] **Step 2: Crear `tsconfig.json`**

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
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Crear directorio de test**

```bash
mkdir -p packages/module-materiales/src packages/module-materiales/test
```

- [ ] **Step 4: Commit scaffold**

```bash
git add packages/module-materiales/
git commit -m "feat: scaffold @central/module-materiales package"
```

---

### Task 2: Tipos (`src/types.ts`)

**Files:**
- Create: `packages/module-materiales/src/types.ts`

- [ ] **Step 1: Escribir el fichero de tipos**

```typescript
// Tipos del módulo Materiales (casa de marcas). Agnósticos de vertical y de BD.
// Un Material es cualquier activo físico o consumible con ciclo de vida (compra →
// asignación a espacio/encargo → transferencia → baja/rotura). La costura
// negocioId + ParentRef permite anclarlo a cualquier jerarquía de negocio.

export type TipoMaterial = 'consumible' | 'activo'

export type EstadoMaterial =
  | 'operativo'
  | 'deteriorado'
  | 'en_reparacion'
  | 'baja'

export type ParentType =
  | 'evento'
  | 'porte'
  | 'alquiler'
  | 'cita_clinica'
  | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

export type EstadoAsignacion =
  | 'reservado'
  | 'entregado'
  | 'devuelto'
  | 'cerrado'
  | (string & {})

export interface Material {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string | null
  categoria: string
  tipo: TipoMaterial
  estado: EstadoMaterial
  cantidadTotal: number
  cantidadDisponible: number
  stockMinimo?: number | null
  espacioActualId?: string | null
  precioCompra: number
  costeReposicion: number
  codigo?: string | null
  proveedor?: {
    nombre?: string | null
    referencia?: string | null
    fechaCompra?: string | null
  } | null
  garantiaHasta?: string | null
  documentos?: string[] | null
  imagenUrl?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface Espacio {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string | null
  tipo: string
  refTipo?: string | null
  refId?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface AsignacionMaterial {
  id: string
  materialId: string
  espacioId?: string | null
  parent?: ParentRef | null
  cantidadReservada: number
  cantidadDevuelta?: number | null
  cantidadDanada?: number | null
  costeDanos?: number | null
  estado: EstadoAsignacion
  notas?: string | null
  createdAt?: string | null
}

export interface TransferenciaMaterial {
  id: string
  materialId: string
  espacioOrigenId: string
  espacioDestinoId: string
  cantidad: number
  fecha: string
  nota?: string | null
  realizadoPor?: string | null
  createdAt?: string | null
}

export interface ResumenStock {
  materiales: number
  unidadesTotales: number
  unidadesDisponibles: number
  unidadesComprometidas: number
  valorTotal: number
}

export interface ResumenContable {
  gastoCompras: number
  gastoRoturas: number
  valorInventario: number
  totalMateriales: number
  totalActivos: number
  totalConsumibles: number
}

// PORTs de adaptación: cada vertical mapea su fila de dominio <-> tipo genérico.
export interface MaterialAdapter<TDominio> {
  toMaterial(fila: TDominio): Material
  fromMaterial(m: Material): TDominio
}
export interface EspacioAdapter<TDominio> {
  toEspacio(fila: TDominio): Espacio
  fromEspacio(e: Espacio): TDominio
}
export interface AsignacionMaterialAdapter<TDominio> {
  toAsignacion(fila: TDominio): AsignacionMaterial
  fromAsignacion(a: AsignacionMaterial): TDominio
}
export interface TransferenciaAdapter<TDominio> {
  toTransferencia(fila: TDominio): TransferenciaMaterial
  fromTransferencia(t: TransferenciaMaterial): TDominio
}
```

- [ ] **Step 2: Commit tipos**

```bash
git add packages/module-materiales/src/types.ts
git commit -m "feat: add Material, Espacio, AsignacionMaterial, TransferenciaMaterial types"
```

---

### Task 3: Funciones puras con tests (TDD)

**Files:**
- Create: `packages/module-materiales/test/materiales.test.ts`
- Create: `packages/module-materiales/src/stock.ts`

- [ ] **Step 1: Escribir los tests primero**

```typescript
// packages/module-materiales/test/materiales.test.ts
// Tests de lógica pura del módulo de materiales.
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  round2,
  disponibilidadTrasReserva,
  disponibilidadTrasDevolucion,
  costeDanos,
  valorStock,
  resumenStock,
  gastoCompras,
  resumenContable,
  puedeTransferir,
  alertasStockMinimo,
} from '../src/stock.ts'
import type { Material, AsignacionMaterial } from '../src/types.ts'

// ── Helpers ─────────────────────────────────────────────────────────────────

function mat(over: Partial<Material> = {}): Material {
  return {
    id: '1',
    negocioId: 'n1',
    nombre: 'Sofá',
    categoria: 'mobiliario',
    tipo: 'activo',
    estado: 'operativo',
    cantidadTotal: 10,
    cantidadDisponible: 8,
    precioCompra: 300,
    costeReposicion: 350,
    activo: true,
    ...over,
  }
}

function asig(over: Partial<AsignacionMaterial> = {}): AsignacionMaterial {
  return {
    id: 'a1',
    materialId: '1',
    cantidadReservada: 2,
    estado: 'entregado',
    ...over,
  }
}

// ── round2 ───────────────────────────────────────────────────────────────────

test('round2: redondea a 2 decimales', () => {
  assert.equal(round2(1.005), 1.01)
  assert.equal(round2(1.004), 1)
  assert.equal(round2(0), 0)
})

// ── disponibilidad ───────────────────────────────────────────────────────────

test('disponibilidadTrasReserva: no baja de 0', () => {
  assert.equal(disponibilidadTrasReserva(2, 5), 0)
  assert.equal(disponibilidadTrasReserva(8, 3), 5)
})

test('disponibilidadTrasDevolucion: no supera el total', () => {
  assert.equal(disponibilidadTrasDevolucion(8, 10, 5), 10)
  assert.equal(disponibilidadTrasDevolucion(5, 10, 3), 8)
})

// ── costeDanos ───────────────────────────────────────────────────────────────

test('costeDanos: cantidad × costeReposicion redondeado', () => {
  assert.equal(costeDanos(2, 350), 700)
  assert.equal(costeDanos(1, 12.333), 12.33)
})

// ── valorStock ───────────────────────────────────────────────────────────────

test('valorStock: suma cantidadTotal × costeReposicion', () => {
  const mats = [mat({ cantidadTotal: 2, costeReposicion: 100 }), mat({ cantidadTotal: 3, costeReposicion: 50 })]
  assert.equal(valorStock(mats), 350)
})

test('valorStock: lista vacía = 0', () => {
  assert.equal(valorStock([]), 0)
})

// ── resumenStock ──────────────────────────────────────────────────────────────

test('resumenStock: agrega correctamente', () => {
  const mats = [
    mat({ cantidadTotal: 10, cantidadDisponible: 8, costeReposicion: 100 }),
    mat({ id: '2', cantidadTotal: 5, cantidadDisponible: 5, costeReposicion: 200 }),
  ]
  const r = resumenStock(mats)
  assert.equal(r.materiales, 2)
  assert.equal(r.unidadesTotales, 15)
  assert.equal(r.unidadesDisponibles, 13)
  assert.equal(r.unidadesComprometidas, 2)
  assert.equal(r.valorTotal, 2000)
})

// ── gastoCompras ──────────────────────────────────────────────────────────────

test('gastoCompras: suma cantidadTotal × precioCompra', () => {
  const mats = [
    mat({ cantidadTotal: 2, precioCompra: 300 }),
    mat({ id: '2', cantidadTotal: 5, precioCompra: 10 }),
  ]
  assert.equal(gastoCompras(mats), 650)
})

test('gastoCompras: lista vacía = 0', () => {
  assert.equal(gastoCompras([]), 0)
})

// ── resumenContable ───────────────────────────────────────────────────────────

test('resumenContable: acumula compras + roturas correctamente', () => {
  const mats = [
    mat({ tipo: 'activo', cantidadTotal: 2, precioCompra: 300, costeReposicion: 350, cantidadDisponible: 2 }),
    mat({ id: '2', tipo: 'consumible', cantidadTotal: 5, precioCompra: 10, costeReposicion: 12, cantidadDisponible: 3 }),
  ]
  const asigs = [
    asig({ costeDanos: 700 }),
    asig({ id: 'a2', materialId: '2', costeDanos: null }),
  ]
  const r = resumenContable(mats, asigs)
  assert.equal(r.gastoCompras, 650)   // 2*300 + 5*10
  assert.equal(r.gastoRoturas, 700)   // solo la primera asig tiene costeDanos
  assert.equal(r.valorInventario, round2(2 * 350 + 3 * 12))
  assert.equal(r.totalMateriales, 2)
  assert.equal(r.totalActivos, 1)
  assert.equal(r.totalConsumibles, 1)
})

// ── puedeTransferir ───────────────────────────────────────────────────────────

test('puedeTransferir: true si hay disponibles suficientes y estado operativo/deteriorado', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 3, estado: 'operativo' }), 2), true)
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 3, estado: 'deteriorado' }), 3), true)
})

test('puedeTransferir: false si no hay suficientes', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 1 }), 2), false)
})

test('puedeTransferir: false si estado en_reparacion o baja', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, estado: 'en_reparacion' }), 1), false)
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, estado: 'baja' }), 1), false)
})

test('puedeTransferir: false si no activo', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, activo: false }), 1), false)
})

// ── alertasStockMinimo ────────────────────────────────────────────────────────

test('alertasStockMinimo: devuelve solo los que están por debajo del mínimo', () => {
  const mats = [
    mat({ id: '1', cantidadDisponible: 2, stockMinimo: 5 }),   // bajo mínimo
    mat({ id: '2', cantidadDisponible: 10, stockMinimo: 5 }),  // OK
    mat({ id: '3', cantidadDisponible: 5, stockMinimo: 5 }),   // exactamente en límite = OK
    mat({ id: '4', cantidadDisponible: 1, stockMinimo: null }), // sin mínimo = no alerta
  ]
  const alertas = alertasStockMinimo(mats)
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].id, '1')
})
```

- [ ] **Step 2: Verificar que los tests fallan (el fichero stock.ts no existe)**

```bash
cd /path/to/central && node --test packages/module-materiales/test/materiales.test.ts
```
Expected: Error — `Cannot find module '../src/stock.ts'`

- [ ] **Step 3: Escribir `src/stock.ts`**

```typescript
// Lógica de stock del módulo Materiales. Funciones puras sobre tipos genéricos (sin BD).
import type { Material, AsignacionMaterial, ResumenStock, ResumenContable } from './types.ts'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Disponible tras reservar `cantidad` unidades (no baja de 0). */
export function disponibilidadTrasReserva(disponible: number, cantidad: number): number {
  return Math.max(0, disponible - cantidad)
}

/** Disponible tras devolver `cantidad` unidades (no supera el total). */
export function disponibilidadTrasDevolucion(disponible: number, total: number, cantidad: number): number {
  return Math.min(total, disponible + cantidad)
}

/** Coste de los daños = unidades dañadas × coste de reposición. */
export function costeDanos(cantidadDanada: number, costeReposicion: number): number {
  return round2(cantidadDanada * costeReposicion)
}

/** Valor del stock = Σ cantidadTotal × costeReposicion. */
export function valorStock(materiales: Material[]): number {
  return round2(materiales.reduce((s, m) => s + m.cantidadTotal * m.costeReposicion, 0))
}

/** Resumen agregado del catálogo (cantidades + valor de reposición). */
export function resumenStock(materiales: Material[]): ResumenStock {
  const unidadesTotales = materiales.reduce((s, m) => s + m.cantidadTotal, 0)
  const unidadesDisponibles = materiales.reduce((s, m) => s + m.cantidadDisponible, 0)
  return {
    materiales: materiales.length,
    unidadesTotales,
    unidadesDisponibles,
    unidadesComprometidas: unidadesTotales - unidadesDisponibles,
    valorTotal: valorStock(materiales),
  }
}

/** Gasto total de compra = Σ cantidadTotal × precioCompra. */
export function gastoCompras(materiales: Material[]): number {
  return round2(materiales.reduce((s, m) => s + m.cantidadTotal * m.precioCompra, 0))
}

/** Resumen contable: compras + roturas + valor de inventario disponible. */
export function resumenContable(materiales: Material[], asignaciones: AsignacionMaterial[]): ResumenContable {
  const gastoRoturas = round2(asignaciones.reduce((s, a) => s + (a.costeDanos ?? 0), 0))
  const valorInventario = round2(materiales.reduce((s, m) => s + m.cantidadDisponible * m.costeReposicion, 0))
  return {
    gastoCompras: gastoCompras(materiales),
    gastoRoturas,
    valorInventario,
    totalMateriales: materiales.length,
    totalActivos: materiales.filter(m => m.tipo === 'activo').length,
    totalConsumibles: materiales.filter(m => m.tipo === 'consumible').length,
  }
}

/** True si el material puede transferirse (operativo/deteriorado, activo, con disponibles suficientes). */
export function puedeTransferir(material: Material, cantidad: number): boolean {
  if (!material.activo) return false
  if (material.estado === 'en_reparacion' || material.estado === 'baja') return false
  return material.cantidadDisponible >= cantidad
}

/** Materiales consumibles cuya cantidad disponible está por debajo del stockMinimo. */
export function alertasStockMinimo(materiales: Material[]): Material[] {
  return materiales.filter(m => m.stockMinimo != null && m.cantidadDisponible < m.stockMinimo)
}
```

- [ ] **Step 4: Ejecutar tests — deben pasar todos**

```bash
node --test packages/module-materiales/test/materiales.test.ts
```
Expected: `▶ 14 tests passed`

- [ ] **Step 5: Commit**

```bash
git add packages/module-materiales/src/stock.ts packages/module-materiales/test/materiales.test.ts
git commit -m "feat: add pure functions with tests (gastoCompras, resumenContable, puedeTransferir, alertasStockMinimo)"
```

---

### Task 4: Barrel (`src/index.ts`)

**Files:**
- Create: `packages/module-materiales/src/index.ts`

- [ ] **Step 1: Escribir index.ts**

```typescript
// @central/module-materiales — Materiales genéricos de la casa de marcas.
// Catálogo de activos físicos y consumibles + espacios + transferencias +
// contabilidad de compra/roturas. Agnóstico de vertical y de BD.
// Cada vertical aporta adaptadores (MaterialAdapter/EspacioAdapter/…).

export type {
  TipoMaterial,
  EstadoMaterial,
  ParentType,
  ParentRef,
  EstadoAsignacion,
  Material,
  Espacio,
  AsignacionMaterial,
  TransferenciaMaterial,
  ResumenStock,
  ResumenContable,
  MaterialAdapter,
  EspacioAdapter,
  AsignacionMaterialAdapter,
  TransferenciaAdapter,
} from './types.ts'

export {
  round2,
  disponibilidadTrasReserva,
  disponibilidadTrasDevolucion,
  costeDanos,
  valorStock,
  resumenStock,
  gastoCompras,
  resumenContable,
  puedeTransferir,
  alertasStockMinimo,
} from './stock.ts'
```

- [ ] **Step 2: Verificar que el barrel compila**

```bash
cd packages/module-materiales && npx tsc --noEmit
```
Expected: Sin errores.

- [ ] **Step 3: Commit**

```bash
git add packages/module-materiales/src/index.ts
git commit -m "feat: export barrel for @central/module-materiales"
```

---

### Task 5: Eliminar `packages/module-inventario/`

**Files:**
- Delete: `packages/module-inventario/` (todo el directorio)

- [ ] **Step 1: Eliminar el paquete viejo**

```bash
rm -rf packages/module-inventario
```

- [ ] **Step 2: Commit la eliminación**

```bash
git add -A packages/module-inventario/
git commit -m "chore: remove @central/module-inventario (superseded by module-materiales)"
```

---

### Task 6: Actualizar adaptador de ia-rest

**Files:**
- Modify: `apps/ia-rest/package.json` (cambiar dep)
- Modify: `apps/ia-rest/src/lib/inventario-menaje.ts`
- Modify: `apps/ia-rest/src/app/api/owner/menaje/route.ts`

- [ ] **Step 1: Actualizar `apps/ia-rest/package.json`**

Cambiar:
```json
"@central/module-inventario": "workspace:*"
```
Por:
```json
"@central/module-materiales": "workspace:*"
```

- [ ] **Step 2: Reescribir `apps/ia-rest/src/lib/inventario-menaje.ts`**

```typescript
// Adaptador de menaje/materiales: mapea las tablas de ia-rest
// (`inventario_menaje`, `inventario_menaje_evento`, `materiales`) a los
// tipos genéricos de @central/module-materiales.
import type {
  Material,
  AsignacionMaterial,
  MaterialAdapter,
  AsignacionMaterialAdapter,
} from '@central/module-materiales'

// ── inventario_menaje ────────────────────────────────────────────────────────

export interface MenajeRow {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string
  cantidad_total: number
  cantidad_disponible: number
  coste_unitario: number | null
  proveedor_nombre: string | null
  imagen_url: string | null
  activo: boolean
  created_at: string | null
}

export interface MenajeEventoRow {
  id: string
  evento_id: string
  menaje_id: string
  cantidad_reservada: number
  cantidad_devuelta: number | null
  cantidad_rota: number | null
  coste_roturas: number | null
  estado: string
  notas: string | null
  created_at: string | null
}

export const menajeArticuloAdapter: MaterialAdapter<MenajeRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: '',
      nombre: row.nombre,
      descripcion: row.descripcion,
      categoria: row.categoria,
      tipo: 'activo',
      estado: 'operativo',
      cantidadTotal: row.cantidad_total,
      cantidadDisponible: row.cantidad_disponible,
      precioCompra: row.coste_unitario ?? 0,
      costeReposicion: row.coste_unitario ?? 0,
      proveedorNombre: row.proveedor_nombre,
      imagenUrl: row.imagen_url,
      activo: row.activo,
      createdAt: row.created_at,
    } as Material & { proveedorNombre: string | null }
  },
  fromMaterial(m): MenajeRow {
    return {
      id: m.id,
      nombre: m.nombre,
      descripcion: m.descripcion ?? null,
      categoria: m.categoria,
      cantidad_total: m.cantidadTotal,
      cantidad_disponible: m.cantidadDisponible,
      coste_unitario: m.costeReposicion ?? null,
      proveedor_nombre: m.proveedor?.nombre ?? null,
      imagen_url: m.imagenUrl ?? null,
      activo: m.activo,
      created_at: m.createdAt ?? null,
    }
  },
}

export const menajeAsignacionAdapter: AsignacionMaterialAdapter<MenajeEventoRow> = {
  toAsignacion(row): AsignacionMaterial {
    return {
      id: row.id,
      materialId: row.menaje_id,
      parent: { parentId: row.evento_id, parentType: 'evento' },
      cantidadReservada: row.cantidad_reservada,
      cantidadDevuelta: row.cantidad_devuelta,
      cantidadDanada: row.cantidad_rota,
      costeDanos: row.coste_roturas,
      estado: row.estado,
      notas: row.notas,
      createdAt: row.created_at,
    }
  },
  fromAsignacion(a): MenajeEventoRow {
    return {
      id: a.id,
      evento_id: a.parent?.parentId ?? '',
      menaje_id: a.materialId,
      cantidad_reservada: a.cantidadReservada,
      cantidad_devuelta: a.cantidadDevuelta ?? null,
      cantidad_rota: a.cantidadDanada ?? null,
      coste_roturas: a.costeDanos ?? null,
      estado: a.estado,
      notas: a.notas ?? null,
      created_at: a.createdAt ?? null,
    }
  },
}

// ── materiales (tabla nueva 2026-06-12) ──────────────────────────────────────

export interface MaterialRow {
  id: string
  restaurante_id: string
  nombre: string
  descripcion: string | null
  categoria: string
  tipo: string | null
  estado: string | null
  cantidad_total: number
  cantidad_disponible: number
  stock_minimo: number | null
  espacio_actual_id: string | null
  precio_compra: number | null
  coste_reposicion: number | null
  codigo: string | null
  proveedor_nombre: string | null
  proveedor_referencia: string | null
  proveedor_fecha_compra: string | null
  garantia_hasta: string | null
  documentos: string[] | null
  imagen_url: string | null
  activo: boolean
  created_at: string | null
}

export const materialAdapter: MaterialAdapter<MaterialRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: row.restaurante_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      categoria: row.categoria,
      tipo: (row.tipo as Material['tipo']) ?? 'consumible',
      estado: (row.estado as Material['estado']) ?? 'operativo',
      cantidadTotal: row.cantidad_total,
      cantidadDisponible: row.cantidad_disponible,
      stockMinimo: row.stock_minimo,
      espacioActualId: row.espacio_actual_id,
      precioCompra: row.precio_compra ?? 0,
      costeReposicion: row.coste_reposicion ?? 0,
      codigo: row.codigo,
      proveedor: row.proveedor_nombre != null ? {
        nombre: row.proveedor_nombre,
        referencia: row.proveedor_referencia,
        fechaCompra: row.proveedor_fecha_compra,
      } : null,
      garantiaHasta: row.garantia_hasta,
      documentos: row.documentos,
      imagenUrl: row.imagen_url,
      activo: row.activo,
      createdAt: row.created_at,
    }
  },
  fromMaterial(m): MaterialRow {
    return {
      id: m.id,
      restaurante_id: m.negocioId,
      nombre: m.nombre,
      descripcion: m.descripcion ?? null,
      categoria: m.categoria,
      tipo: m.tipo,
      estado: m.estado,
      cantidad_total: m.cantidadTotal,
      cantidad_disponible: m.cantidadDisponible,
      stock_minimo: m.stockMinimo ?? null,
      espacio_actual_id: m.espacioActualId ?? null,
      precio_compra: m.precioCompra,
      coste_reposicion: m.costeReposicion,
      codigo: m.codigo ?? null,
      proveedor_nombre: m.proveedor?.nombre ?? null,
      proveedor_referencia: m.proveedor?.referencia ?? null,
      proveedor_fecha_compra: m.proveedor?.fechaCompra ?? null,
      garantia_hasta: m.garantiaHasta ?? null,
      documentos: m.documentos ?? null,
      imagen_url: m.imagenUrl ?? null,
      activo: m.activo,
      created_at: m.createdAt ?? null,
    }
  },
}
```

**Nota:** El tipo `Material` no tiene `proveedorNombre` como campo de primer nivel. El cast `as Material & { proveedorNombre... }` es temporal para el adaptador `menajeArticuloAdapter` que mapea desde la tabla legacy. Si hay usos de `.proveedorNombre` en código de ia-rest fuera del adaptador, actualízalos a `.proveedor?.nombre`.

- [ ] **Step 3: Actualizar `apps/ia-rest/src/app/api/owner/menaje/route.ts`**

Cambiar la línea:
```typescript
import { disponibilidadTrasReserva } from '@central/module-inventario'
```
Por:
```typescript
import { disponibilidadTrasReserva } from '@central/module-materiales'
```

- [ ] **Step 4: Reinstalar deps en ia-rest**

```bash
cd /path/to/central && pnpm install
```

- [ ] **Step 5: Verificar que ia-rest compila**

```bash
cd apps/ia-rest && npx tsc --noEmit
```
Expected: Sin errores de import.

- [ ] **Step 6: Commit**

```bash
git add apps/ia-rest/
git commit -m "feat: update ia-rest adapter to @central/module-materiales"
```

---

### Task 7: Actualizar adaptador de ialimp

**Files:**
- Modify: `apps/ialimp/package.json`
- Modify: `apps/ialimp/next.config.ts`
- Modify: `apps/ialimp/lib/adapters/inventario.ts`

- [ ] **Step 1: Actualizar `apps/ialimp/package.json`**

Cambiar `"@central/module-inventario": "workspace:*"` por `"@central/module-materiales": "workspace:*"`.

- [ ] **Step 2: Actualizar `transpilePackages` en `apps/ialimp/next.config.ts`**

Cambiar `"@central/module-inventario"` por `"@central/module-materiales"` en el array `transpilePackages`.

- [ ] **Step 3: Reescribir `apps/ialimp/lib/adapters/inventario.ts`**

```typescript
// Adapter de inventario para ialimp → @central/module-materiales
//
// Mapea:
//   productos_stock → Material  (catálogo operativo)
//   stock_consumos  → AsignacionMaterial  (consumo en una sesión de limpieza)
//
// kits_limpiadoras (asignación permanente) NO mapea aquí — es dominio propio de ialimp.
import type {
  Material,
  MaterialAdapter,
  AsignacionMaterial,
  AsignacionMaterialAdapter,
  ResumenStock,
  ResumenContable,
} from '@central/module-materiales'
export { resumenStock, resumenContable, valorStock, disponibilidadTrasReserva } from '@central/module-materiales'
export type { ResumenStock, ResumenContable }

export interface ProductoStockRow {
  id: string
  empresa_id: string
  nombre: string
  categoria: string
  unidad?: string | null
  stock_actual: number
  stock_minimo: number
  precio_unitario: number | null
  proveedor_id?: string | null
  proveedor_nombre?: string | null
  activo: boolean
  created_at?: string | null
}

export interface StockConsumoRow {
  id: string
  empresa_id?: string
  session_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number | null
  created_at: string | null
}

export const articuloAdapter: MaterialAdapter<ProductoStockRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: row.empresa_id,
      nombre: row.nombre,
      descripcion: null,
      categoria: row.categoria,
      tipo: 'consumible',
      estado: 'operativo',
      cantidadTotal: row.stock_actual,
      cantidadDisponible: row.stock_actual,
      stockMinimo: row.stock_minimo,
      precioCompra: row.precio_unitario ?? 0,
      costeReposicion: row.precio_unitario ?? 0,
      proveedor: row.proveedor_nombre ? { nombre: row.proveedor_nombre } : null,
      activo: row.activo,
      createdAt: row.created_at ?? null,
    }
  },
  fromMaterial(m): ProductoStockRow {
    return {
      id: m.id,
      empresa_id: m.negocioId,
      nombre: m.nombre,
      categoria: m.categoria,
      stock_actual: m.cantidadTotal,
      stock_minimo: m.stockMinimo ?? 0,
      precio_unitario: m.costeReposicion ?? null,
      proveedor_nombre: m.proveedor?.nombre ?? null,
      activo: m.activo,
      created_at: m.createdAt ?? null,
    }
  },
}

export const asignacionAdapter: AsignacionMaterialAdapter<StockConsumoRow> = {
  toAsignacion(row): AsignacionMaterial {
    return {
      id: row.id,
      materialId: row.producto_id,
      parent: { parentId: row.session_id, parentType: 'sesion_limpieza' },
      cantidadReservada: row.cantidad,
      cantidadDevuelta: null,
      cantidadDanada: null,
      costeDanos: null,
      estado: 'entregado',
      notas: null,
      createdAt: row.created_at ?? null,
    }
  },
  fromAsignacion(a): StockConsumoRow {
    return {
      id: a.id,
      session_id: a.parent?.parentId ?? '',
      producto_id: a.materialId,
      cantidad: a.cantidadReservada,
      precio_unitario: null,
      created_at: a.createdAt ?? null,
    }
  },
}
```

- [ ] **Step 4: Verificar que ialimp compila**

```bash
cd apps/ialimp && npx tsc --noEmit
```
Expected: Sin errores de import.

- [ ] **Step 5: Commit**

```bash
git add apps/ialimp/
git commit -m "feat: update ialimp adapter to @central/module-materiales"
```

---

### Task 8: Actualizar adaptador de sivra

**Files:**
- Modify: `apps/sivra/package.json`
- Modify: `apps/sivra/lib/adapters/inventario.ts`

- [ ] **Step 1: Actualizar `apps/sivra/package.json`**

Cambiar `"@central/module-inventario": "workspace:*"` por `"@central/module-materiales": "workspace:*"`.

- [ ] **Step 2: Reescribir `apps/sivra/lib/adapters/inventario.ts`**

```typescript
// Adapter de inventario para sivra → @central/module-materiales
// SIVRA tiene un catálogo de productos de referencia (sin stock operativo en tiempo real).
// Solo se mapea Material; AsignacionMaterial no aplica actualmente.
import type { Material, MaterialAdapter } from '@central/module-materiales'
export { resumenStock, valorStock } from '@central/module-materiales'

export interface ProductoRow {
  id: string
  nombre: string
  referencia: string | null
  categoria: string
  subcategoria: string | null
  unidad: string
  precio_unitario: number | null
  iva_porcentaje: number | null
  proveedor_id: string | null
  notas: string | null
  activo: boolean
}

export const articuloAdapter: MaterialAdapter<ProductoRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: '',
      nombre: row.nombre,
      descripcion: row.notas ?? null,
      categoria: row.categoria,
      tipo: 'consumible',
      estado: 'operativo',
      cantidadTotal: 0,
      cantidadDisponible: 0,
      precioCompra: row.precio_unitario ?? 0,
      costeReposicion: row.precio_unitario ?? 0,
      codigo: row.referencia,
      activo: row.activo,
    }
  },
  fromMaterial(m): ProductoRow {
    return {
      id: m.id,
      nombre: m.nombre,
      referencia: m.codigo ?? null,
      categoria: m.categoria,
      subcategoria: null,
      unidad: 'unidad',
      precio_unitario: m.costeReposicion ?? null,
      iva_porcentaje: 21,
      proveedor_id: null,
      notas: m.descripcion ?? null,
      activo: m.activo,
    }
  },
}
```

- [ ] **Step 3: Verificar que sivra compila**

```bash
cd apps/sivra && npx tsc --noEmit
```
Expected: Sin errores de import.

- [ ] **Step 4: Commit**

```bash
git add apps/sivra/
git commit -m "feat: update sivra adapter to @central/module-materiales"
```

---

### Task 9: Actualizar plataforma (`estructura.ts`)

**Files:**
- Modify: `apps/plataforma/lib/estructura.ts`

- [ ] **Step 1: Cambiar la entrada `module-inventario` en `MODULOS`**

En `apps/plataforma/lib/estructura.ts`, línea 60, cambiar:
```typescript
{ id: 'module-inventario', tipo: 'module', desc: 'Dominio: catálogo de artículos + asignación de activos a un Encargo.' },
```
Por:
```typescript
{ id: 'module-materiales', tipo: 'module', desc: 'Dominio: materiales físicos y consumibles. Alta de catálogo, espacios, transferencias entre espacios, contabilidad de compra y roturas.' },
```

- [ ] **Step 2: Regenerar el JSON de estructura**

```bash
cd /path/to/central && npm run auditar
```
Expected: `estructura.generated.json` actualizado con `module-materiales`.

- [ ] **Step 3: Verificar que plataforma compila**

```bash
cd apps/plataforma && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/estructura.ts apps/plataforma/lib/estructura.generated.json
git commit -m "chore: rename module-inventario → module-materiales in plataforma estructura"
```

---

### Task 10: Migración SQL (ia-rest)

**Files:**
- Create: `apps/ia-rest/supabase/migrations/2026-06-12_materiales_v2.sql`

Esta migración añade las columnas nuevas del modelo extendido a la tabla `materiales` de ia-rest, y crea las tablas `materiales_espacios` y `materiales_transferencias`.

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================
-- Materiales v2 — Módulo extendido
-- BD: ia-rest (efncqyvhniaxsirhdxaa, schema public)
-- Añade columnas nuevas a `materiales` y crea tablas
-- `materiales_espacios` y `materiales_transferencias`.
-- ============================================================

-- ── Columnas nuevas en `materiales` ─────────────────────────

ALTER TABLE materiales
  ADD COLUMN IF NOT EXISTS tipo                 text NOT NULL DEFAULT 'consumible',
  ADD COLUMN IF NOT EXISTS estado               text NOT NULL DEFAULT 'operativo',
  ADD COLUMN IF NOT EXISTS stock_minimo         int,
  ADD COLUMN IF NOT EXISTS espacio_actual_id    uuid,
  ADD COLUMN IF NOT EXISTS precio_compra        numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo               text,
  ADD COLUMN IF NOT EXISTS proveedor_referencia text,
  ADD COLUMN IF NOT EXISTS proveedor_fecha_compra date,
  ADD COLUMN IF NOT EXISTS garantia_hasta       date,
  ADD COLUMN IF NOT EXISTS documentos           jsonb;

-- ── Espacios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiales_espacios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid NOT NULL,
  nombre          text NOT NULL,
  descripcion     text,
  tipo            text NOT NULL DEFAULT 'otro',   -- almacen|piso|furgoneta|taller|otro
  ref_tipo        text,                           -- tipo de entidad externa vinculada
  ref_id          uuid,                           -- id de la entidad externa (sin FK dura)
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_espacios_restaurante ON materiales_espacios (restaurante_id);

-- FK blanda: espacio_actual_id apunta a materiales_espacios
-- (no FK dura para no bloquear borrado de espacios)

-- ── Transferencias ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiales_transferencias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  espacio_origen_id   uuid NOT NULL,
  espacio_destino_id  uuid NOT NULL,
  cantidad            int NOT NULL DEFAULT 1,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  nota                text,
  realizado_por       uuid,                        -- personal_id opcional
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_transf_restaurante ON materiales_transferencias (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_transf_material    ON materiales_transferencias (material_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE materiales_espacios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_transferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON materiales_espacios;
CREATE POLICY service_role_all ON materiales_espacios
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON materiales_transferencias;
CREATE POLICY service_role_all ON materiales_transferencias
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

- [ ] **Step 2: Aplicar la migración en Supabase (ia-rest)**

Usar Supabase MCP: `mcp__Supabase__apply_migration` con `project_id=efncqyvhniaxsirhdxaa` y el SQL de arriba.

- [ ] **Step 3: Verificar las tablas en Supabase**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'materiales' AND table_schema = 'public'
ORDER BY ordinal_position;
```

- [ ] **Step 4: Commit**

```bash
git add apps/ia-rest/supabase/migrations/2026-06-12_materiales_v2.sql
git commit -m "feat: migration - add tipo/estado/stock_minimo/precio_compra/espacios/transferencias to ia-rest materiales"
```

---

### Task 11: Verificación final y push

- [ ] **Step 1: Reinstalar deps en el monorepo raíz**

```bash
pnpm install
```

- [ ] **Step 2: Ejecutar tests del módulo**

```bash
node --test packages/module-materiales/test/materiales.test.ts
```
Expected: Todos los tests pasan.

- [ ] **Step 3: Ejecutar tests globales del monorepo**

```bash
npm run test:packages
```
Expected: Verde en todos los paquetes con tests.

- [ ] **Step 4: Verificar TypeScript en todos los consumers**

```bash
cd apps/ia-rest && npx tsc --noEmit && echo "ia-rest OK"
cd ../ialimp && npx tsc --noEmit && echo "ialimp OK"
cd ../sivra && npx tsc --noEmit && echo "sivra OK"
cd ../plataforma && npx tsc --noEmit && echo "plataforma OK"
```

- [ ] **Step 5: Push y crear PR**

```bash
git push -u origin claude/focused-curie-d7gsnt
```

Luego crear PR draft en GitHub apuntando a `main`.
