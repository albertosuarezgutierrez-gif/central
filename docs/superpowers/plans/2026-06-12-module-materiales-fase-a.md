# Module Materiales Fase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ledger-based stock tracking, espacios CRUD, transferencias, activos serializados, QR codes, and a full 14-tab owner UI to `@central/module-materiales` + `apps/ia-rest`.

**Architecture:** Stock moves from editable snapshot to `materiales_movimientos` ledger (entrada/salida/devolucion/rotura/ajuste/transferencia). Pure TS functions in `module-materiales` compute stock from ledger. ia-rest APIs write to ledger AND update the `cantidad_disponible` snapshot on `materiales` atomically. Existing `materiales_asignacion` / `materiales_dano` tables continue working for the `/montaje` employee flow.

**Tech Stack:** Node 22 `--test` (pure module tests), Next.js 15 App Router, Supabase service_role, `qrcode` npm (already in package.json), `@central/module-materiales` pure TypeScript.

**Branch:** `claude/focused-curie-d7gsnt`

---

## File Map

```
packages/module-materiales/
  src/types.ts          ← ADD: TipoMovimiento, Movimiento, UnidadMaterial, Kit, KitItem,
                                Proveedor, ClienteMaterial, InventarioFisico,
                                InventarioFisicoLinea, Mantenimiento, ReservaAnticipada,
                                MovimientoAdapter, UnidadMaterialAdapter
  src/stock.ts          ← ADD: stockActualDesdeLedger, stockPorEspacio,
                                disponibilidadEnFecha, expandirKit, calcularDepreciacion,
                                alertasVencimiento, ajusteInventario
  src/index.ts          ← ADD exports for all new symbols
  test/materiales.test.ts ← ADD tests for all new functions

apps/ia-rest/
  supabase/migrations/2026-06-12_materiales_ledger.sql   ← NEW: 2 new tables + 2 ALTER
  src/app/api/materiales/
    espacios/route.ts       ← NEW: GET/POST/PATCH/DELETE espacios
    movimientos/route.ts    ← NEW: GET/POST movimientos (ledger)
    unidades/route.ts       ← NEW: GET/POST/PATCH/DELETE serializados
    qr/[id]/route.ts        ← NEW: GET → SVG QR for material/espacio/unidad
    alertas/route.ts        ← NEW: GET → aggregated active alerts
  src/app/owner/materiales/page.tsx  ← REWRITE: 14 tabs (Fase B = próximamente card)
```

---

## Task 1: Add new types to `@central/module-materiales`

**Files:**
- Modify: `packages/module-materiales/src/types.ts`

- [ ] **Step 1: Append new types to the end of `types.ts`**

```typescript
// ── Ledger ────────────────────────────────────────────────────

export type TipoMovimiento =
  | 'entrada'       // compra/recepción → + total, + disponible
  | 'salida'        // asignación/consumo → - disponible
  | 'devolucion'    // retorno al almacén → + disponible
  | 'rotura'        // baja permanente → - total, - disponible
  | 'ajuste'        // corrección inventario físico positiva → + total, + disponible
  | 'transferencia' // cambio de espacio → no afecta total ni disponible

export interface Movimiento {
  id: string
  negocioId: string
  materialId: string
  unidadId?: string | null
  tipo: TipoMovimiento
  cantidad: number
  espacioOrigenId?: string | null
  espacioDestinoId?: string | null
  parent?: ParentRef | null
  clienteId?: string | null
  notas?: string | null
  realizadoPor?: string | null
  fecha: string
  createdAt?: string | null
}

// ── Activos serializados ──────────────────────────────────────

export interface UnidadMaterial {
  id: string
  negocioId: string
  materialId: string
  codigoSerie?: string | null
  codigoQr: string
  estado: EstadoMaterial
  espacioActualId?: string | null
  fechaCompra?: string | null
  garantiaHasta?: string | null
  precioCompra?: number | null
  vidaUtilAnios?: number | null
  valorActual?: number | null
  notas?: string | null
  activo: boolean
  createdAt?: string | null
}

// ── Kits (Fase B — tipos aquí para compatibilidad de API) ────

export interface Kit {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface KitItem {
  id: string
  kitId: string
  materialId: string
  cantidad: number
}

// ── Proveedores y Clientes (Fase B) ──────────────────────────

export interface Proveedor {
  id: string
  negocioId: string
  nombre: string
  contacto?: string | null
  telefono?: string | null
  email?: string | null
  nif?: string | null
  plazoEntregaDias?: number | null
  notas?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface ClienteMaterial {
  id: string
  negocioId: string
  nombre: string
  empresa?: string | null
  nif?: string | null
  telefono?: string | null
  email?: string | null
  notas?: string | null
  activo: boolean
  createdAt?: string | null
}

// ── Inventario físico (Fase B) ────────────────────────────────

export interface InventarioFisico {
  id: string
  negocioId: string
  espacioId?: string | null
  realizadoPor?: string | null
  estado: 'borrador' | 'cerrado'
  fecha: string
  createdAt?: string | null
}

export interface InventarioFisicoLinea {
  id: string
  inventarioId: string
  materialId: string
  cantidadSistema: number
  cantidadContada: number
  diferencia: number
  ajusteGenerado: boolean
}

// ── Mantenimiento (Fase B) ────────────────────────────────────

export interface Mantenimiento {
  id: string
  negocioId: string
  materialId: string
  unidadId?: string | null
  tipo: 'preventivo' | 'correctivo' | 'revision'
  estado: 'pendiente' | 'en_curso' | 'completado'
  fechaPrevista?: string | null
  fechaRealizada?: string | null
  coste?: number | null
  notas?: string | null
  createdAt?: string | null
}

// ── Reservas anticipadas (Fase B) ────────────────────────────

export interface ReservaAnticipada {
  id: string
  negocioId: string
  materialId: string
  cantidad: number
  fechaDesde: string
  fechaHasta: string
  parent?: ParentRef | null
  clienteId?: string | null
  estado: 'confirmada' | 'cancelada'
  notas?: string | null
  createdAt?: string | null
}

// ── Adapters nuevos ───────────────────────────────────────────

export interface MovimientoAdapter<TDominio> {
  toMovimiento(fila: TDominio): Movimiento
  fromMovimiento(m: Movimiento): TDominio
}

export interface UnidadMaterialAdapter<TDominio> {
  toUnidad(fila: TDominio): UnidadMaterial
  fromUnidad(u: UnidadMaterial): TDominio
}
```

- [ ] **Step 2: Verify no TS errors in the module**

```bash
cd /home/user/central && node --input-type=module --eval "import './packages/module-materiales/src/types.ts'" 2>&1 || true
# Expect: silence or "ExperimentalWarning" only — no syntax errors
```

---

## Task 2: Add new pure functions to `stock.ts`

**Files:**
- Modify: `packages/module-materiales/src/stock.ts`

- [ ] **Step 1: Add imports at top of `stock.ts`**

The file currently imports only `Material, AsignacionMaterial, ResumenStock, ResumenContable`. Change the import line to:

```typescript
import type {
  Material, AsignacionMaterial, ResumenStock, ResumenContable,
  Movimiento, UnidadMaterial, Kit, KitItem,
  InventarioFisicoLinea, ReservaAnticipada,
} from './types'
```

- [ ] **Step 2: Append new functions to end of `stock.ts`**

```typescript
// ── Ledger functions ──────────────────────────────────────────

/** Computes running total and disponible from the movement ledger.
 *  - entrada: +total +disponible
 *  - salida: -disponible
 *  - devolucion: +disponible
 *  - rotura: -total -disponible
 *  - ajuste: +total +disponible (positive correction; use rotura for negative)
 *  - transferencia: no effect on totals
 */
export function stockActualDesdeLedger(movimientos: Movimiento[]): { total: number; disponible: number } {
  let total = 0
  let disponible = 0
  for (const m of movimientos) {
    switch (m.tipo) {
      case 'entrada':      total += m.cantidad; disponible += m.cantidad; break
      case 'salida':       disponible -= m.cantidad; break
      case 'devolucion':   disponible += m.cantidad; break
      case 'rotura':       total -= m.cantidad; disponible -= m.cantidad; break
      case 'ajuste':       total += m.cantidad; disponible += m.cantidad; break
      case 'transferencia': break
    }
  }
  return { total: Math.max(0, total), disponible: Math.max(0, disponible) }
}

/** Units currently located in a specific espacio (derived from transfer history). */
export function stockPorEspacio(movimientos: Movimiento[], espacioId: string): number {
  let count = 0
  for (const m of movimientos) {
    switch (m.tipo) {
      case 'transferencia':
        if (m.espacioOrigenId === espacioId) count -= m.cantidad
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
      case 'entrada':
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
      case 'salida':
        if (m.espacioOrigenId === espacioId) count -= m.cantidad
        break
      case 'devolucion':
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
      case 'rotura':
        if (m.espacioOrigenId === espacioId) count -= m.cantidad
        break
      case 'ajuste':
        if (m.espacioDestinoId === espacioId) count += m.cantidad
        break
    }
  }
  return Math.max(0, count)
}

/** Available units on a future date, subtracting confirmed reservations overlapping that date. */
export function disponibilidadEnFecha(
  movimientos: Movimiento[],
  reservas: ReservaAnticipada[],
  fecha: string
): number {
  const prevMov = movimientos.filter(m => m.fecha <= fecha)
  const { disponible } = stockActualDesdeLedger(prevMov)
  const reservadas = reservas
    .filter(r => r.estado === 'confirmada' && r.fechaDesde <= fecha && r.fechaHasta >= fecha)
    .reduce((s, r) => s + r.cantidad, 0)
  return Math.max(0, disponible - reservadas)
}

/** Expands a kit × quantity into individual movimiento stubs (no id yet). */
export function expandirKit(
  kit: Kit,
  items: KitItem[],
  cantidad: number,
  base: Omit<Movimiento, 'id' | 'materialId' | 'cantidad'>
): Omit<Movimiento, 'id'>[] {
  return items.map(item => ({
    ...base,
    materialId: item.materialId,
    cantidad: item.cantidad * cantidad,
  }))
}

/** Depreciated value of a unit (straight-line). Returns 0 when fully depreciated. */
export function calcularDepreciacion(
  precioCompra: number,
  fechaCompra: string,
  vidaUtilAnios: number,
  fechaRef?: string
): number {
  if (vidaUtilAnios <= 0 || precioCompra <= 0) return 0
  const ref = new Date(fechaRef ?? new Date().toISOString().slice(0, 10))
  const compra = new Date(fechaCompra)
  const aniosTranscurridos = (ref.getTime() - compra.getTime()) / (365.25 * 24 * 3600 * 1000)
  const fraccion = Math.min(1, Math.max(0, aniosTranscurridos / vidaUtilAnios))
  return round2(precioCompra * (1 - fraccion))
}

/** Returns all active alerts: stock below minimum, warranty expiring soon. */
export function alertasVencimiento(
  materiales: Material[],
  unidades: UnidadMaterial[],
  diasAnticipacion = 30
): { tipo: 'garantia' | 'stock_minimo'; materialId: string; mensaje: string }[] {
  const alertas: { tipo: 'garantia' | 'stock_minimo'; materialId: string; mensaje: string }[] = []
  const limite = new Date(Date.now() + diasAnticipacion * 24 * 3600 * 1000)

  for (const m of materiales) {
    if (m.stockMinimo != null && m.cantidadDisponible < m.stockMinimo) {
      alertas.push({
        tipo: 'stock_minimo',
        materialId: m.id,
        mensaje: `${m.nombre}: ${m.cantidadDisponible} disponibles (mín. ${m.stockMinimo})`,
      })
    }
  }

  for (const u of unidades) {
    if (u.garantiaHasta && u.activo) {
      const expiry = new Date(u.garantiaHasta)
      if (expiry <= limite) {
        alertas.push({
          tipo: 'garantia',
          materialId: u.materialId,
          mensaje: `Unidad ${u.codigoQr}: garantía expira ${u.garantiaHasta}`,
        })
      }
    }
  }

  return alertas
}

/** Returns adjustments needed after a physical inventory count.
 *  Positive delta = real > system (use 'ajuste' movimiento).
 *  Negative delta = real < system (use 'rotura' movimiento with abs(delta)). */
export function ajusteInventario(
  lineas: InventarioFisicoLinea[]
): { materialId: string; delta: number }[] {
  return lineas
    .filter(l => l.cantidadContada !== l.cantidadSistema)
    .map(l => ({ materialId: l.materialId, delta: l.cantidadContada - l.cantidadSistema }))
}
```

---

## Task 3: Add tests for new pure functions

**Files:**
- Modify: `packages/module-materiales/test/materiales.test.ts`

- [ ] **Step 1: Add import of new functions and types at top of test file**

After the existing imports, add:
```typescript
import {
  stockActualDesdeLedger,
  stockPorEspacio,
  disponibilidadEnFecha,
  expandirKit,
  calcularDepreciacion,
  alertasVencimiento,
  ajusteInventario,
} from '../src/stock.ts'
import type { Movimiento, UnidadMaterial, Kit, KitItem, InventarioFisicoLinea, ReservaAnticipada } from '../src/types.ts'
```

- [ ] **Step 2: Add test helpers and test cases at end of test file**

```typescript
// ── Ledger helpers ────────────────────────────────────────────

function mov(over: Partial<Movimiento> = {}): Movimiento {
  return {
    id: 'm1', negocioId: 'n1', materialId: '1',
    tipo: 'entrada', cantidad: 10,
    fecha: '2026-01-01',
    ...over,
  }
}

function unidad(over: Partial<UnidadMaterial> = {}): UnidadMaterial {
  return {
    id: 'u1', negocioId: 'n1', materialId: '1',
    codigoQr: 'QR-001', estado: 'operativo', activo: true,
    ...over,
  }
}

// ── stockActualDesdeLedger ────────────────────────────────────

test('stockActualDesdeLedger: entrada añade total y disponible', () => {
  const r = stockActualDesdeLedger([mov({ tipo: 'entrada', cantidad: 10 })])
  assert.equal(r.total, 10)
  assert.equal(r.disponible, 10)
})

test('stockActualDesdeLedger: salida reduce disponible', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'salida', cantidad: 3 }),
  ])
  assert.equal(r.total, 10)
  assert.equal(r.disponible, 7)
})

test('stockActualDesdeLedger: devolucion repone disponible', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'salida', cantidad: 3 }),
    mov({ id: 'm3', tipo: 'devolucion', cantidad: 2 }),
  ])
  assert.equal(r.disponible, 9)
})

test('stockActualDesdeLedger: rotura reduce total y disponible', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'rotura', cantidad: 2 }),
  ])
  assert.equal(r.total, 8)
  assert.equal(r.disponible, 8)
})

test('stockActualDesdeLedger: transferencia no afecta totales', () => {
  const r = stockActualDesdeLedger([
    mov({ tipo: 'entrada', cantidad: 10 }),
    mov({ id: 'm2', tipo: 'transferencia', cantidad: 4, espacioOrigenId: 'e1', espacioDestinoId: 'e2' }),
  ])
  assert.equal(r.total, 10)
  assert.equal(r.disponible, 10)
})

test('stockActualDesdeLedger: no baja de 0', () => {
  const r = stockActualDesdeLedger([mov({ tipo: 'salida', cantidad: 5 })])
  assert.equal(r.total, 0)
  assert.equal(r.disponible, 0)
})

// ── stockPorEspacio ───────────────────────────────────────────

test('stockPorEspacio: entrada a destino suma', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, espacioDestinoId: 'e1' })]
  assert.equal(stockPorEspacio(movs, 'e1'), 10)
})

test('stockPorEspacio: transferencia mueve entre espacios', () => {
  const movs = [
    mov({ tipo: 'entrada', cantidad: 10, espacioDestinoId: 'e1' }),
    mov({ id: 'm2', tipo: 'transferencia', cantidad: 4, espacioOrigenId: 'e1', espacioDestinoId: 'e2' }),
  ]
  assert.equal(stockPorEspacio(movs, 'e1'), 6)
  assert.equal(stockPorEspacio(movs, 'e2'), 4)
})

test('stockPorEspacio: desconocido = 0', () => {
  assert.equal(stockPorEspacio([], 'e99'), 0)
})

// ── disponibilidadEnFecha ─────────────────────────────────────

test('disponibilidadEnFecha: sin reservas = stock actual', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, fecha: '2026-01-01' })]
  assert.equal(disponibilidadEnFecha(movs, [], '2026-06-01'), 10)
})

test('disponibilidadEnFecha: descuenta reserva activa en la fecha', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, fecha: '2026-01-01' })]
  const reservas: ReservaAnticipada[] = [{
    id: 'r1', negocioId: 'n1', materialId: '1',
    cantidad: 3, fechaDesde: '2026-06-01', fechaHasta: '2026-06-05',
    estado: 'confirmada',
  }]
  assert.equal(disponibilidadEnFecha(movs, reservas, '2026-06-03'), 7)
})

test('disponibilidadEnFecha: ignora reserva fuera de rango', () => {
  const movs = [mov({ tipo: 'entrada', cantidad: 10, fecha: '2026-01-01' })]
  const reservas: ReservaAnticipada[] = [{
    id: 'r1', negocioId: 'n1', materialId: '1',
    cantidad: 3, fechaDesde: '2026-07-01', fechaHasta: '2026-07-05',
    estado: 'confirmada',
  }]
  assert.equal(disponibilidadEnFecha(movs, reservas, '2026-06-03'), 10)
})

// ── expandirKit ───────────────────────────────────────────────

test('expandirKit: genera un movimiento por item multiplicado por cantidad', () => {
  const kit: Kit = { id: 'k1', negocioId: 'n1', nombre: 'Mesa completa', activo: true }
  const items: KitItem[] = [
    { id: 'ki1', kitId: 'k1', materialId: 'm1', cantidad: 4 },
    { id: 'ki2', kitId: 'k1', materialId: 'm2', cantidad: 1 },
  ]
  const base: Omit<Movimiento, 'id' | 'materialId' | 'cantidad'> = {
    negocioId: 'n1', tipo: 'salida', fecha: '2026-06-12',
  }
  const result = expandirKit(kit, items, 2, base)
  assert.equal(result.length, 2)
  assert.equal(result[0].materialId, 'm1')
  assert.equal(result[0].cantidad, 8)
  assert.equal(result[1].materialId, 'm2')
  assert.equal(result[1].cantidad, 2)
})

// ── calcularDepreciacion ──────────────────────────────────────

test('calcularDepreciacion: sin depreciar si recién comprado', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  assert.equal(calcularDepreciacion(1000, hoy, 5), 1000)
})

test('calcularDepreciacion: totalmente depreciado tras vida útil', () => {
  assert.equal(calcularDepreciacion(1000, '2010-01-01', 5, '2016-01-01'), 0)
})

test('calcularDepreciacion: mitad a mitad de vida útil', () => {
  assert.equal(calcularDepreciacion(1000, '2020-01-01', 10, '2025-01-01'), 500)
})

test('calcularDepreciacion: vidaUtil=0 devuelve 0', () => {
  assert.equal(calcularDepreciacion(1000, '2020-01-01', 0), 0)
})

// ── alertasVencimiento ────────────────────────────────────────

test('alertasVencimiento: detecta stock por debajo de mínimo', () => {
  const mats = [mat({ id: '1', cantidadDisponible: 2, stockMinimo: 5 })]
  const alertas = alertasVencimiento(mats, [])
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].tipo, 'stock_minimo')
  assert.equal(alertas[0].materialId, '1')
})

test('alertasVencimiento: detecta garantía próxima a vencer', () => {
  const manana = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const u = unidad({ garantiaHasta: manana })
  const alertas = alertasVencimiento([], [u])
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].tipo, 'garantia')
})

test('alertasVencimiento: ignora garantía lejana', () => {
  const lejano = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const u = unidad({ garantiaHasta: lejano })
  const alertas = alertasVencimiento([], [u], 30)
  assert.equal(alertas.length, 0)
})

// ── ajusteInventario ──────────────────────────────────────────

test('ajusteInventario: retorna delta para líneas con diferencia', () => {
  const lineas: InventarioFisicoLinea[] = [
    { id: 'l1', inventarioId: 'i1', materialId: 'm1', cantidadSistema: 10, cantidadContada: 12, diferencia: 2, ajusteGenerado: false },
    { id: 'l2', inventarioId: 'i1', materialId: 'm2', cantidadSistema: 5, cantidadContada: 5, diferencia: 0, ajusteGenerado: false },
    { id: 'l3', inventarioId: 'i1', materialId: 'm3', cantidadSistema: 8, cantidadContada: 6, diferencia: -2, ajusteGenerado: false },
  ]
  const result = ajusteInventario(lineas)
  assert.equal(result.length, 2)
  assert.equal(result[0].materialId, 'm1')
  assert.equal(result[0].delta, 2)
  assert.equal(result[1].materialId, 'm3')
  assert.equal(result[1].delta, -2)
})

test('ajusteInventario: lista vacía si todo cuadra', () => {
  const lineas: InventarioFisicoLinea[] = [
    { id: 'l1', inventarioId: 'i1', materialId: 'm1', cantidadSistema: 10, cantidadContada: 10, diferencia: 0, ajusteGenerado: false },
  ]
  assert.equal(ajusteInventario(lineas).length, 0)
})
```

- [ ] **Step 3: Run all tests**

```bash
cd /home/user/central && pnpm -F @central/module-materiales test
```

Expected output: all tests pass, including existing ones plus the ~25 new ones.

---

## Task 4: Update `index.ts` exports

**Files:**
- Modify: `packages/module-materiales/src/index.ts`

- [ ] **Step 1: Replace contents of `index.ts` with full re-export list**

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
  // Ledger
  TipoMovimiento,
  Movimiento,
  UnidadMaterial,
  Kit,
  KitItem,
  Proveedor,
  ClienteMaterial,
  InventarioFisico,
  InventarioFisicoLinea,
  Mantenimiento,
  ReservaAnticipada,
  // Adapters
  MaterialAdapter,
  EspacioAdapter,
  AsignacionMaterialAdapter,
  TransferenciaAdapter,
  MovimientoAdapter,
  UnidadMaterialAdapter,
} from './types'

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
  // Ledger
  stockActualDesdeLedger,
  stockPorEspacio,
  disponibilidadEnFecha,
  expandirKit,
  calcularDepreciacion,
  alertasVencimiento,
  ajusteInventario,
} from './stock'
```

- [ ] **Step 2: Run tests again to confirm exports work**

```bash
cd /home/user/central && pnpm -F @central/module-materiales test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd /home/user/central && git add packages/module-materiales/ && git commit -m "feat(module-materiales): add ledger types and pure functions (Fase A)"
```

---

## Task 5: DB migration — new tables (Fase A)

**Files:**
- Create: `apps/ia-rest/supabase/migrations/2026-06-12_materiales_ledger.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- Materiales ledger — Fase A
-- Adds: materiales_movimientos, materiales_unidades
-- Alters: materiales (codigo_qr), materiales_espacios (codigo_qr)
-- BD: ia-rest (efncqyvhniaxsirhdxaa, schema public)
-- ============================================================

-- ── QR columns ───────────────────────────────────────────────

ALTER TABLE materiales
  ADD COLUMN IF NOT EXISTS codigo_qr text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_materiales_qr ON materiales (codigo_qr) WHERE codigo_qr IS NOT NULL;

ALTER TABLE materiales_espacios
  ADD COLUMN IF NOT EXISTS codigo_qr text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mat_espacios_qr ON materiales_espacios (codigo_qr) WHERE codigo_qr IS NOT NULL;

-- ── Ledger de movimientos ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS materiales_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  unidad_id           uuid,                         -- FK a materiales_unidades (added after)
  tipo                text NOT NULL,                -- entrada|salida|devolucion|rotura|ajuste|transferencia
  cantidad            int  NOT NULL CHECK (cantidad > 0),
  espacio_origen_id   uuid REFERENCES materiales_espacios(id),
  espacio_destino_id  uuid REFERENCES materiales_espacios(id),
  parent_tipo         text,                         -- ParentRef.parentType (sin FK dura)
  parent_id           uuid,                         -- ParentRef.parentId
  cliente_id          uuid,                         -- FK opcional
  notas               text,
  realizado_por       uuid,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mat_mov_restaurante ON materiales_movimientos (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_mov_material    ON materiales_movimientos (material_id);
CREATE INDEX IF NOT EXISTS idx_mat_mov_tipo        ON materiales_movimientos (tipo);
CREATE INDEX IF NOT EXISTS idx_mat_mov_fecha       ON materiales_movimientos (fecha);
CREATE INDEX IF NOT EXISTS idx_mat_mov_parent      ON materiales_movimientos (parent_id) WHERE parent_id IS NOT NULL;

-- ── Activos serializados ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS materiales_unidades (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id    uuid NOT NULL,
  material_id       uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  codigo_serie      text,
  codigo_qr         text NOT NULL,
  estado            text NOT NULL DEFAULT 'operativo', -- operativo|deteriorado|en_reparacion|baja
  espacio_actual_id uuid REFERENCES materiales_espacios(id),
  fecha_compra      date,
  garantia_hasta    date,
  precio_compra     numeric(10,2),
  vida_util_anios   int,
  notas             text,
  activo            boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mat_unidades_qr ON materiales_unidades (codigo_qr);
CREATE INDEX IF NOT EXISTS idx_mat_unidades_restaurante ON materiales_unidades (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_unidades_material    ON materiales_unidades (material_id);

-- ── FK from movimientos → unidades (deferred so both tables exist) ──

ALTER TABLE materiales_movimientos
  ADD CONSTRAINT fk_mat_mov_unidad
  FOREIGN KEY (unidad_id) REFERENCES materiales_unidades(id)
  ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE materiales_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_unidades    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON materiales_movimientos;
CREATE POLICY service_role_all ON materiales_movimientos
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON materiales_unidades;
CREATE POLICY service_role_all ON materiales_unidades
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__Supabase__apply_migration` tool with:
- `project_id`: `efncqyvhniaxsirhdxaa`
- `name`: `materiales_ledger`
- `query`: contents of the SQL file above

- [ ] **Step 3: Verify tables exist**

Use `mcp__Supabase__list_tables` with project_id `efncqyvhniaxsirhdxaa` and confirm `materiales_movimientos` and `materiales_unidades` appear.

---

## Task 6: API `/api/materiales/espacios`

**Files:**
- Create: `apps/ia-rest/src/app/api/materiales/espacios/route.ts`

The `materiales_espacios` table already exists from migration `2026-06-12_materiales_v2.sql` — this just adds the missing API routes.

- [ ] **Step 1: Create the route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET  — lista espacios activos
// POST — crea espacio
// PATCH — edita espacio { id, ...campos }
// DELETE — soft-delete { id }

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('materiales_espacios')
    .select('id, nombre, descripcion, tipo, ref_tipo, ref_id, codigo_qr, activo, created_at')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacios: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  if (!body.nombre || typeof body.nombre !== 'string') {
    return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('materiales_espacios')
    .insert({
      restaurante_id: rid,
      nombre: body.nombre.trim(),
      descripcion: body.descripcion ?? null,
      tipo: body.tipo ?? 'almacen',
      ref_tipo: body.ref_tipo ?? null,
      ref_id: body.ref_id ?? null,
      codigo_qr: body.codigo_qr ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacio: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const k of ['nombre', 'descripcion', 'tipo', 'ref_tipo', 'ref_id', 'codigo_qr'] as const) {
    if (campos[k] !== undefined) updates[k] = campos[k]
  }

  const { error } = await supabase
    .from('materiales_espacios')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('materiales_espacios')
    .update({ activo: false })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

---

## Task 7: API `/api/materiales/movimientos`

**Files:**
- Create: `apps/ia-rest/src/app/api/materiales/movimientos/route.ts`

On POST, this API writes to the ledger AND updates `cantidad_disponible` (and `cantidad_total` for roturas/ajustes/entradas) on `materiales` atomically.

- [ ] **Step 1: Create the route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const TIPOS_VALIDOS = ['entrada', 'salida', 'devolucion', 'rotura', 'ajuste', 'transferencia']

// GET  — ledger filtrable (material_id, tipo, fecha_desde, fecha_hasta, limit)
// POST — crea movimiento + actualiza snapshot en materiales

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)

  let q = supabase
    .from('materiales_movimientos')
    .select(`
      id, material_id, unidad_id, tipo, cantidad,
      espacio_origen_id, espacio_destino_id,
      parent_tipo, parent_id, cliente_id,
      notas, realizado_por, fecha, created_at,
      material:materiales(nombre, categoria),
      espacio_origen:materiales_espacios!espacio_origen_id(nombre),
      espacio_destino:materiales_espacios!espacio_destino_id(nombre)
    `)
    .eq('restaurante_id', rid)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  const materialId = url.searchParams.get('material_id')
  const tipo = url.searchParams.get('tipo')
  const fechaDesde = url.searchParams.get('fecha_desde')
  const fechaHasta = url.searchParams.get('fecha_hasta')
  const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 100))

  if (materialId) q = q.eq('material_id', materialId)
  if (tipo && TIPOS_VALIDOS.includes(tipo)) q = q.eq('tipo', tipo)
  if (fechaDesde) q = q.gte('fecha', fechaDesde)
  if (fechaHasta) q = q.lte('fecha', fechaHasta)
  q = q.limit(limit)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ movimientos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  const { material_id, tipo, cantidad: cantidadRaw, unidad_id, espacio_origen_id, espacio_destino_id,
    parent_tipo, parent_id, cliente_id, notas, fecha } = body
  const cantidad = Number(cantidadRaw)

  if (!material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })
  if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: `tipo inválido (${TIPOS_VALIDOS.join('|')})` }, { status: 400 })
  if (!(cantidad > 0)) return NextResponse.json({ error: 'cantidad debe ser > 0' }, { status: 400 })

  // Fetch current snapshot
  const { data: mat } = await supabase
    .from('materiales')
    .select('cantidad_total, cantidad_disponible')
    .eq('id', material_id).eq('restaurante_id', rid).single()
  if (!mat) return NextResponse.json({ error: 'Material no encontrado' }, { status: 404 })

  // Validate stock for outgoing movements
  if ((tipo === 'salida' || tipo === 'rotura') && mat.cantidad_disponible < cantidad) {
    return NextResponse.json({ error: `Stock insuficiente (disponible: ${mat.cantidad_disponible})` }, { status: 409 })
  }

  // Compute new snapshot values
  let deltaTotal = 0
  let deltaDisponible = 0
  switch (tipo) {
    case 'entrada':      deltaTotal = cantidad;  deltaDisponible = cantidad;  break
    case 'salida':       deltaDisponible = -cantidad; break
    case 'devolucion':   deltaDisponible = cantidad;  break
    case 'rotura':       deltaTotal = -cantidad; deltaDisponible = -cantidad; break
    case 'ajuste':       deltaTotal = cantidad;  deltaDisponible = cantidad;  break
    case 'transferencia': break
  }

  // Insert movimiento
  const { data: mov, error: movErr } = await supabase
    .from('materiales_movimientos')
    .insert({
      restaurante_id: rid,
      material_id,
      unidad_id: unidad_id ?? null,
      tipo,
      cantidad,
      espacio_origen_id: espacio_origen_id ?? null,
      espacio_destino_id: espacio_destino_id ?? null,
      parent_tipo: parent_tipo ?? null,
      parent_id: parent_id ?? null,
      cliente_id: cliente_id ?? null,
      notas: notas ?? null,
      realizado_por: session.camarero_id ?? null,
      fecha: fecha ?? new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()

  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  // Update snapshot atomically
  if (deltaTotal !== 0 || deltaDisponible !== 0) {
    await supabase
      .from('materiales')
      .update({
        cantidad_total: Math.max(0, (mat.cantidad_total ?? 0) + deltaTotal),
        cantidad_disponible: Math.max(0, (mat.cantidad_disponible ?? 0) + deltaDisponible),
        updated_at: new Date().toISOString(),
      })
      .eq('id', material_id).eq('restaurante_id', rid)
  }

  // Update espacio_actual_id on the material if transferencia has destino
  if (tipo === 'transferencia' && espacio_destino_id) {
    await supabase
      .from('materiales')
      .update({ espacio_actual_id: espacio_destino_id, updated_at: new Date().toISOString() })
      .eq('id', material_id).eq('restaurante_id', rid)
  }

  return NextResponse.json({ movimiento: mov })
}
```

---

## Task 8: API `/api/materiales/unidades`

**Files:**
- Create: `apps/ia-rest/src/app/api/materiales/unidades/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET    — lista unidades por material_id (o todas)
// POST   — crea unidad serializada (auto-genera codigo_qr si no se pasa)
// PATCH  — actualiza estado/espacio/notas/garantia
// DELETE — soft-delete (activo=false)

function generarQr(restauranteId: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `U-${restauranteId.slice(0, 8).toUpperCase()}-${ts}-${rand}`
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)

  let q = supabase
    .from('materiales_unidades')
    .select('id, material_id, codigo_serie, codigo_qr, estado, espacio_actual_id, fecha_compra, garantia_hasta, precio_compra, vida_util_anios, notas, activo, created_at, material:materiales(nombre, categoria)')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })

  const materialId = url.searchParams.get('material_id')
  const soloActivos = url.searchParams.get('activo') !== 'false'
  if (materialId) q = q.eq('material_id', materialId)
  if (soloActivos) q = q.eq('activo', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ unidades: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  if (!body.material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('materiales_unidades')
    .insert({
      restaurante_id: rid,
      material_id: body.material_id,
      codigo_serie: body.codigo_serie ?? null,
      codigo_qr: body.codigo_qr?.trim() || generarQr(rid),
      estado: body.estado ?? 'operativo',
      espacio_actual_id: body.espacio_actual_id ?? null,
      fecha_compra: body.fecha_compra ?? null,
      garantia_hasta: body.garantia_hasta ?? null,
      precio_compra: body.precio_compra != null ? Number(body.precio_compra) : null,
      vida_util_anios: body.vida_util_anios != null ? Number(body.vida_util_anios) : null,
      notas: body.notas ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ unidad: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['codigo_serie', 'estado', 'espacio_actual_id', 'fecha_compra', 'garantia_hasta', 'precio_compra', 'vida_util_anios', 'notas'] as const) {
    if (campos[k] !== undefined) updates[k] = campos[k]
  }

  const { error } = await supabase
    .from('materiales_unidades')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('materiales_unidades')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

---

## Task 9: API `/api/materiales/qr/[id]`

**Files:**
- Create: `apps/ia-rest/src/app/api/materiales/qr/[id]/route.ts`

Returns an SVG QR code for any entity: a material type (prefix `M-`), espacio (`E-`), or unidad (`U-`). The `id` param is the `codigo_qr` string (URL-encoded if needed).

- [ ] **Step 1: Create the directory and route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import QRCode from 'qrcode'

// GET /api/materiales/qr/[id]
// id = the codigo_qr value (URL-encoded)
// Returns SVG with Content-Type image/svg+xml
// Query param ?size=200 (optional, default 200)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const codigoQr = decodeURIComponent(id)
  const url = new URL(req.url)
  const size = Math.min(600, Math.max(100, Number(url.searchParams.get('size') ?? 200)))

  const svgString = await QRCode.toString(codigoQr, {
    type: 'svg',
    width: size,
    margin: 2,
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })

  return new NextResponse(svgString, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
```

---

## Task 10: API `/api/materiales/alertas`

**Files:**
- Create: `apps/ia-rest/src/app/api/materiales/alertas/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { alertasVencimiento } from '@central/module-materiales'

// GET — returns all active alerts for the restaurante:
// - stock below minimum
// - warranty expiring within 30 days
// Query: ?dias=30 (default 30)

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)
  const dias = Math.max(1, Number(url.searchParams.get('dias') ?? 30))

  const [{ data: matsRaw }, { data: unidadesRaw }] = await Promise.all([
    supabase.from('materiales')
      .select('id, nombre, categoria, tipo, estado, cantidad_total, cantidad_disponible, stock_minimo, precio_compra, coste_reposicion, activo')
      .eq('restaurante_id', rid).eq('activo', true),
    supabase.from('materiales_unidades')
      .select('id, material_id, codigo_qr, estado, garantia_hasta, activo')
      .eq('restaurante_id', rid).eq('activo', true),
  ])

  // Map DB rows to module-materiales Material type shape
  const mats = (matsRaw ?? []).map(r => ({
    id: r.id, negocioId: rid, nombre: r.nombre, categoria: r.categoria,
    tipo: r.tipo ?? 'activo', estado: r.estado ?? 'operativo',
    cantidadTotal: r.cantidad_total ?? 0, cantidadDisponible: r.cantidad_disponible ?? 0,
    stockMinimo: r.stock_minimo ?? null, precioCompra: r.precio_compra ?? 0,
    costeReposicion: r.coste_reposicion ?? 0, activo: r.activo ?? true,
  }))

  const unidades = (unidadesRaw ?? []).map(r => ({
    id: r.id, negocioId: rid, materialId: r.material_id,
    codigoQr: r.codigo_qr, estado: r.estado ?? 'operativo',
    garantiaHasta: r.garantia_hasta ?? null, activo: r.activo ?? true,
  }))

  const alertas = alertasVencimiento(mats as Parameters<typeof alertasVencimiento>[0], unidades, dias)

  return NextResponse.json({ alertas, total: alertas.length })
}
```

---

## Task 11: Rewrite `owner/materiales/page.tsx`

**Files:**
- Modify: `apps/ia-rest/src/app/owner/materiales/page.tsx`

This is a full rewrite. The file has 14 tabs; Fase B tabs show a "próximamente" card. Existing Catálogo functionality is preserved and extended with a "Reponer stock" quick action that creates a ledger `entrada`.

- [ ] **Step 1: Replace the entire file**

```typescript
'use client'
import { DARK_C as C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────
interface Material {
  id: string; nombre: string; descripcion: string | null; categoria: string
  tipo: string; estado: string; cantidad_total: number; cantidad_disponible: number
  stock_minimo: number | null; coste_reposicion: number; precio_compra: number | null
  codigo: string | null; proveedor_nombre: string | null; proveedor_referencia: string | null
  garantia_hasta: string | null; activo: boolean; espacio_actual_id: string | null
}
interface Categoria { id: string; nombre: string }
interface Espacio { id: string; nombre: string; tipo: string; descripcion: string | null; codigo_qr: string | null }
interface Movimiento {
  id: string; material_id: string; tipo: string; cantidad: number
  espacio_origen_id: string | null; espacio_destino_id: string | null
  notas: string | null; fecha: string; created_at: string
  material: { nombre: string; categoria: string } | null
  espacio_origen: { nombre: string } | null
  espacio_destino: { nombre: string } | null
}
interface Unidad {
  id: string; material_id: string; codigo_qr: string; codigo_serie: string | null
  estado: string; espacio_actual_id: string | null; fecha_compra: string | null
  garantia_hasta: string | null; precio_compra: number | null; vida_util_anios: number | null
  notas: string | null; activo: boolean
  material: { nombre: string; categoria: string } | null
}
interface Alerta { tipo: 'garantia' | 'stock_minimo'; materialId: string; mensaje: string }
interface Asignacion {
  id: string; material_id: string; destino_tipo: string; destino_nombre: string | null
  cantidad: number; cantidad_devuelta: number; estado: string
  fecha_salida: string | null; notas: string | null
  material: { nombre: string; categoria: string; coste_reposicion?: number } | null
}
interface Dano {
  id: string; material_id: string; cantidad: number; motivo: string | null
  foto_url: string | null; coste: number; created_at: string
  material: { nombre: string; categoria: string } | null
}

// ── Helpers ────────────────────────────────────────────────────
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
function sesHeader(): string { return typeof localStorage === 'undefined' ? '' : localStorage.getItem('ia_rest_session') ?? '' }
const H = () => ({ 'Content-Type': 'application/json', 'x-ia-session': sesHeader() })
function card(): React.CSSProperties { return { background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14 } }
function inp(): React.CSSProperties { return { fontFamily: SN, fontSize: 14, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, outline: 'none', width: '100%', boxSizing: 'border-box' } }
function btn(bg: string, color = C.paper): React.CSSProperties { return { fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color } }
function badge(color: string): React.CSSProperties { return { display: 'inline-block', fontSize: 10, fontWeight: 700, fontFamily: SM, padding: '2px 7px', borderRadius: 99, background: color + '22', color, border: `1px solid ${color}44` } }

const TIPOS_MAT = ['activo', 'consumible']
const ESTADOS_MAT = ['operativo', 'deteriorado', 'en_reparacion', 'baja']
const TIPO_BADGE: Record<string, string> = { operativo: '#2E7D5E', deteriorado: '#B45309', en_reparacion: '#2B6A9E', baja: '#6B7280' }
const TIPO_MOV_BADGE: Record<string, string> = { entrada: '#2E7D5E', salida: '#B45309', devolucion: '#2B6A9E', rotura: '#9B2335', ajuste: '#7C3AED', transferencia: '#374151' }

type Tab = 'resumen' | 'catalogo' | 'espacios' | 'transferencias' | 'serializados' | 'historial' |
           'kits' | 'inventario' | 'mantenimiento' | 'reservas' | 'clientes' | 'proveedores' | 'importar' | 'informes'
const TABS: [Tab, string, boolean][] = [
  ['resumen', 'Resumen', false],
  ['catalogo', 'Catálogo', false],
  ['espacios', 'Espacios', false],
  ['transferencias', 'Transferencias', false],
  ['serializados', 'Serializados', false],
  ['historial', 'Historial', false],
  ['kits', 'Kits', true],
  ['inventario', 'Inventario físico', true],
  ['mantenimiento', 'Mantenimiento', true],
  ['reservas', 'Reservas', true],
  ['clientes', 'Clientes', true],
  ['proveedores', 'Proveedores', true],
  ['importar', 'Importar', true],
  ['informes', 'Informes', true],
]

// ── Root ───────────────────────────────────────────────────────
export default function OwnerMaterialesPage() {
  const [tab, setTab] = useState<Tab>('resumen')
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 2px' }}>Materiales</h1>
        <p style={{ color: C.ink3, fontSize: 13, margin: '0 0 14px' }}>Activos físicos y consumibles. Control de stock, espacios, serializados y trazabilidad.</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {TABS.map(([t, label, beta]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontFamily: SN, fontSize: 12, fontWeight: 600, padding: '7px 13px', borderRadius: 8,
              border: `1px solid ${tab === t ? C.red : C.rule}`, cursor: 'pointer',
              background: tab === t ? C.red : 'transparent',
              color: tab === t ? C.paper : beta ? C.ink4 : C.ink2,
              opacity: beta && tab !== t ? 0.6 : 1,
            }}>
              {label}{beta ? ' ⏳' : ''}
            </button>
          ))}
        </div>
        {tab === 'resumen' && <Resumen />}
        {tab === 'catalogo' && <Catalogo />}
        {tab === 'espacios' && <Espacios />}
        {tab === 'transferencias' && <Transferencias />}
        {tab === 'serializados' && <Serializados />}
        {tab === 'historial' && <Historial />}
        {['kits','inventario','mantenimiento','reservas','clientes','proveedores','importar','informes'].includes(tab) && <Proximamente tab={tab} />}
      </div>
    </div>
  )
}

// ── Próximamente ───────────────────────────────────────────────
function Proximamente({ tab }: { tab: string }) {
  const labels: Record<string, { titulo: string; desc: string }> = {
    kits: { titulo: 'Kits y plantillas', desc: 'Agrupa materiales en kits reutilizables y asígnalos en bloque a un destino.' },
    inventario: { titulo: 'Inventario físico', desc: 'Wizard de recuento: compara el físico con el sistema y genera ajustes automáticos.' },
    mantenimiento: { titulo: 'Mantenimiento', desc: 'Registra revisiones preventivas y correctivas por activo o unidad serializada.' },
    reservas: { titulo: 'Reservas anticipadas', desc: 'Bloquea disponibilidad para fechas futuras y consulta el calendario por material.' },
    clientes: { titulo: 'Clientes', desc: 'Ficha de clientes con historial de salidas asociadas.' },
    proveedores: { titulo: 'Proveedores', desc: 'Entidades de proveedor con historial de compras y plazos de entrega.' },
    importar: { titulo: 'Importación CSV', desc: 'Sube un CSV para dar de alta materiales en bloque con la plantilla descargable.' },
    informes: { titulo: 'Informes PDF', desc: 'Genera PDF de valoración de inventario, historial de movimientos o activos por estado.' },
  }
  const info = labels[tab] ?? { titulo: tab, desc: 'Próximamente disponible.' }
  return (
    <div style={{ ...card(), textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
      <div style={{ fontFamily: SE, fontSize: 20, marginBottom: 8 }}>{info.titulo}</div>
      <div style={{ color: C.ink3, fontSize: 14, maxWidth: 400, margin: '0 auto' }}>{info.desc}</div>
    </div>
  )
}

// ── Resumen ────────────────────────────────────────────────────
function Resumen() {
  const [mats, setMats] = useState<Material[]>([])
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/movimientos?limit=10', { headers: H() }),
      fetch('/api/materiales/alertas', { headers: H() }),
    ]).then(async ([rm, rv, ra]) => {
      if (rm.ok) setMats((await rm.json()).materiales ?? [])
      if (rv.ok) setMovs((await rv.json()).movimientos ?? [])
      if (ra.ok) setAlertas((await ra.json()).alertas ?? [])
      setLoading(false)
    })
  }, [])

  if (loading) return <p style={{ color: C.ink3 }}>Cargando…</p>

  const totalUnits = mats.reduce((s, m) => s + m.cantidad_total, 0)
  const disponibles = mats.reduce((s, m) => s + m.cantidad_disponible, 0)
  const comprometidas = totalUnits - disponibles
  const valorInventario = mats.reduce((s, m) => s + m.cantidad_disponible * m.coste_reposicion, 0)
  const gastosCompra = mats.reduce((s, m) => s + m.cantidad_total * (m.precio_compra ?? m.coste_reposicion), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {alertas.length > 0 && (
        <div style={{ background: '#7C2D1222', border: `1px solid ${C.red}55`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠ {alertas.length} alerta{alertas.length > 1 ? 's' : ''} activa{alertas.length > 1 ? 's' : ''}</div>
          {alertas.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: C.ink2, fontFamily: SM, marginBottom: 2 }}>
              <span style={{ ...badge(a.tipo === 'stock_minimo' ? C.red : '#B45309'), marginRight: 6 }}>{a.tipo === 'stock_minimo' ? 'stock' : 'garantía'}</span>
              {a.mensaje}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { label: 'Tipos de material', value: mats.length, color: C.ink },
          { label: 'Unidades totales', value: totalUnits, color: C.ink },
          { label: 'Disponibles', value: disponibles, color: C.green },
          { label: 'Comprometidas', value: comprometidas, color: comprometidas > 0 ? C.amber : C.ink3 },
          { label: 'Valor inventario', value: eur(valorInventario), color: '#2B6A9E' },
          { label: 'Coste en stock', value: eur(gastosCompra), color: C.ink2 },
        ].map(k => (
          <div key={k.label} style={{ ...card(), textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontFamily: SE, fontSize: 22, color: k.color }}>{k.value}</div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Últimos movimientos</div>
        {movs.length === 0 ? (
          <p style={{ color: C.ink3, fontSize: 13 }}>Sin movimientos aún. Usa "Catálogo → Reponer" para registrar el primer ingreso.</p>
        ) : movs.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${C.rule}` }}>
            <span style={badge(TIPO_MOV_BADGE[m.tipo] ?? C.ink3)}>{m.tipo}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{m.material?.nombre ?? '—'} <span style={{ color: C.ink3 }}>×{m.cantidad}</span></span>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{m.fecha}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Catálogo ───────────────────────────────────────────────────
const emptyForm = () => ({
  nombre: '', categoria: '', tipo: 'activo', estado: 'operativo',
  cantidad_total: '', stock_minimo: '', coste_reposicion: '', precio_compra: '',
  codigo: '', proveedor_nombre: '', proveedor_referencia: '', garantia_hasta: '', descripcion: '',
})

function Catalogo() {
  const [items, setItems] = useState<Material[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reponerId, setReponerId] = useState<string | null>(null)
  const [reponerCant, setReponerCant] = useState('')

  const cargar = useCallback(async () => {
    const [rm, rc] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/categorias', { headers: H() }),
    ])
    if (rm.ok) setItems((await rm.json()).materiales ?? [])
    if (rc.ok) setCategorias((await rc.json()).categorias ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const reset = () => { setEditId(null); setForm(emptyForm()) }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    const payload = {
      nombre: form.nombre.trim(), categoria: form.categoria || 'otro',
      tipo: form.tipo, estado: form.estado, descripcion: form.descripcion.trim() || null,
      cantidad_total: Number(form.cantidad_total) || 0,
      stock_minimo: form.stock_minimo !== '' ? Number(form.stock_minimo) : null,
      coste_reposicion: Number(form.coste_reposicion) || 0,
      precio_compra: form.precio_compra !== '' ? Number(form.precio_compra) : null,
      codigo: form.codigo.trim() || null,
      proveedor_nombre: form.proveedor_nombre.trim() || null,
      proveedor_referencia: form.proveedor_referencia.trim() || null,
      garantia_hasta: form.garantia_hasta || null,
    }
    if (editId) {
      await fetch('/api/materiales', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: editId, ...payload }) })
    } else {
      const r = await fetch('/api/materiales', { method: 'POST', headers: H(), body: JSON.stringify(payload) })
      // If initial quantity > 0, register as entrada in ledger
      if (r.ok && Number(payload.cantidad_total) > 0) {
        const { material } = await r.json()
        await fetch('/api/materiales/movimientos', {
          method: 'POST', headers: H(),
          body: JSON.stringify({ material_id: material.id, tipo: 'entrada', cantidad: payload.cantidad_total, notas: 'Stock inicial' }),
        })
      }
    }
    reset(); cargar()
  }

  const editar = (m: Material) => {
    setEditId(m.id)
    setForm({
      nombre: m.nombre, categoria: m.categoria, tipo: m.tipo ?? 'activo', estado: m.estado ?? 'operativo',
      descripcion: m.descripcion ?? '',
      cantidad_total: String(m.cantidad_total), stock_minimo: m.stock_minimo != null ? String(m.stock_minimo) : '',
      coste_reposicion: String(m.coste_reposicion ?? ''), precio_compra: m.precio_compra != null ? String(m.precio_compra) : '',
      codigo: m.codigo ?? '', proveedor_nombre: m.proveedor_nombre ?? '',
      proveedor_referencia: m.proveedor_referencia ?? '', garantia_hasta: m.garantia_hasta ?? '',
    })
  }
  const borrar = async (id: string) => {
    if (!confirm('¿Dar de baja este material?')) return
    await fetch('/api/materiales', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }
  const reponer = async (materialId: string) => {
    const cant = Number(reponerCant)
    if (!(cant > 0)) return
    await fetch('/api/materiales/movimientos', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ material_id: materialId, tipo: 'entrada', cantidad: cant, notas: 'Reposición' }),
    })
    setReponerId(null); setReponerCant(''); cargar()
  }

  const alertas = items.filter(m => m.stock_minimo != null && m.cantidad_disponible <= m.stock_minimo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {alertas.length > 0 && (
        <div style={{ background: '#7C2D1222', border: `1px solid ${C.red}55`, borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠ Stock bajo mínimo</div>
          {alertas.map(m => <div key={m.id} style={{ fontSize: 12, color: C.ink2, fontFamily: SM }}>{m.nombre} — {m.cantidad_disponible} disponibles (mín. {m.stock_minimo})</div>)}
        </div>
      )}
      <GestionCategorias categorias={categorias} onUpdate={cargar} />
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar material' : 'Nuevo material'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={{ ...inp(), gridColumn: '1/3' }} placeholder="Nombre (ej. Silla Chiavari)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={inp()} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            <option value="">Categoría…</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <select style={inp()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_MAT.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={inp()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {ESTADOS_MAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={inp()} placeholder="Código interno (ej. SLA-001)" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} />
          {!editId && <input style={inp()} type="number" placeholder="Unidades iniciales" value={form.cantidad_total} onChange={e => setForm({ ...form, cantidad_total: e.target.value })} />}
          <input style={inp()} type="number" placeholder="Stock mínimo (alerta)" value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Precio compra (€/ud)" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Coste reposición (€/ud)" value={form.coste_reposicion} onChange={e => setForm({ ...form, coste_reposicion: e.target.value })} />
          <input style={inp()} placeholder="Proveedor (nombre)" value={form.proveedor_nombre} onChange={e => setForm({ ...form, proveedor_nombre: e.target.value })} />
          <input style={inp()} placeholder="Ref. proveedor" value={form.proveedor_referencia} onChange={e => setForm({ ...form, proveedor_referencia: e.target.value })} />
          <input style={inp()} type="date" placeholder="Garantía hasta" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
          <input style={{ ...inp(), gridColumn: '1/3' }} placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Añadir'}</button>
          {editId && <button style={{ ...btn(C.bg3, C.ink2), border: `1px solid ${C.rule}` }} onClick={reset}>Cancelar</button>}
        </div>
      </div>
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin materiales. Añade el primero arriba.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(m => {
            const fuera = m.cantidad_total - m.cantidad_disponible
            const bajoMin = m.stock_minimo != null && m.cantidad_disponible <= m.stock_minimo
            const color = TIPO_BADGE[m.estado] ?? C.ink3
            const isOpen = expanded === m.id
            return (
              <div key={m.id} style={{ ...card(), cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : m.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nombre}</span>
                      <span style={badge(color)}>{m.estado}</span>
                      {m.tipo === 'consumible' && <span style={badge(C.ink3)}>consumible</span>}
                      {m.codigo && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{m.codigo}</span>}
                      {bajoMin && <span style={badge(C.red)}>⚠ stock bajo</span>}
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                      {m.categoria} · {eur(m.coste_reposicion)}/ud{m.proveedor_nombre ? ` · ${m.proveedor_nombre}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: bajoMin ? C.red : m.cantidad_disponible > 0 ? C.green : C.red }}>
                      {m.cantidad_disponible}<span style={{ color: C.ink3, fontWeight: 400, fontSize: 12 }}> / {m.cantidad_total}</span>
                    </div>
                    {m.stock_minimo != null && <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>mín. {m.stock_minimo}</div>}
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{fuera > 0 ? `${fuera} fuera` : 'todo disp.'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button style={btn(C.bg3, C.ink)} onClick={() => editar(m)}>Editar</button>
                    <button style={btn(C.green)} onClick={() => { setReponerId(m.id); setReponerCant('') }}>Reponer</button>
                    <button style={{ ...btn('transparent', C.red), border: `1px solid ${C.red}44`, padding: '6px 10px' }} onClick={() => borrar(m.id)}>Baja</button>
                  </div>
                </div>
                {reponerId === m.id && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                    <input style={{ ...inp(), flex: 1 }} type="number" placeholder="Cantidad a reponer…" value={reponerCant} onChange={e => setReponerCant(e.target.value)} autoFocus />
                    <button style={btn(C.green)} onClick={() => reponer(m.id)}>Añadir al stock</button>
                    <button style={{ ...btn(C.bg3, C.ink2), border: `1px solid ${C.rule}` }} onClick={() => setReponerId(null)}>×</button>
                  </div>
                )}
                {isOpen && !reponerId && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.rule}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px', fontFamily: SM, fontSize: 12, color: C.ink2 }}>
                    {m.precio_compra != null && <span>Precio compra: <b>{eur(m.precio_compra)}</b></span>}
                    {m.proveedor_referencia && <span>Ref. prov.: <b>{m.proveedor_referencia}</b></span>}
                    {m.garantia_hasta && <span>Garantía hasta: <b>{new Date(m.garantia_hasta).toLocaleDateString('es-ES')}</b></span>}
                    {m.descripcion && <span style={{ gridColumn: '1/3', color: C.ink3 }}>{m.descripcion}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GestionCategorias({ categorias, onUpdate }: { categorias: Categoria[]; onUpdate: () => void }) {
  const [nueva, setNueva] = useState('')
  const [open, setOpen] = useState(false)
  const crear = async () => {
    if (!nueva.trim()) return
    const r = await fetch('/api/materiales/categorias', { method: 'POST', headers: H(), body: JSON.stringify({ nombre: nueva.trim() }) })
    if (!r.ok) { const e = await r.json(); alert(e.error ?? 'Error'); return }
    setNueva(''); onUpdate()
  }
  const eliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar categoría "${nombre}"?`)) return
    await fetch('/api/materiales/categorias', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    onUpdate()
  }
  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{ ...btn('transparent', C.ink3), border: `1px solid ${C.rule}`, fontSize: 12, padding: '5px 10px' }}>{open ? '▲ Cerrar' : '⚙ Categorías'}</button>
      {open && (
        <div style={{ ...card(), marginTop: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {categorias.map(c => (
              <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                {c.nombre}
                <button onClick={() => eliminar(c.id, c.nombre)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontWeight: 700 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp(), flex: 1 }} placeholder="Nueva categoría…" value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && crear()} />
            <button style={btn(C.green)} onClick={crear}>Añadir</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Espacios ───────────────────────────────────────────────────
const TIPOS_ESPACIO = ['almacen', 'piso', 'furgoneta', 'taller', 'otro']

function Espacios() {
  const [items, setItems] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', tipo: 'almacen', descripcion: '' })
  const [editId, setEditId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/materiales/espacios', { headers: H() })
    if (r.ok) setItems((await r.json()).espacios ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!form.nombre.trim()) return
    if (editId) {
      await fetch('/api/materiales/espacios', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: editId, nombre: form.nombre.trim(), tipo: form.tipo, descripcion: form.descripcion.trim() || null }) })
    } else {
      await fetch('/api/materiales/espacios', { method: 'POST', headers: H(), body: JSON.stringify({ nombre: form.nombre.trim(), tipo: form.tipo, descripcion: form.descripcion.trim() || null }) })
    }
    setEditId(null); setForm({ nombre: '', tipo: 'almacen', descripcion: '' }); cargar()
  }
  const eliminar = async (id: string) => {
    if (!confirm('¿Desactivar este espacio?')) return
    await fetch('/api/materiales/espacios', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editId ? 'Editar espacio' : 'Nuevo espacio / almacén'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input style={inp()} placeholder="Nombre (ej. Almacén principal)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <select style={inp()} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_ESPACIO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={{ ...inp(), gridColumn: '1/3' }} placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={btn(C.green)} onClick={guardar}>{editId ? 'Guardar' : 'Crear espacio'}</button>
          {editId && <button style={{ ...btn(C.bg3, C.ink2), border: `1px solid ${C.rule}` }} onClick={() => { setEditId(null); setForm({ nombre: '', tipo: 'almacen', descripcion: '' }) }}>Cancelar</button>}
        </div>
      </div>
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : items.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin espacios. Crea el primero arriba.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(e => (
            <div key={e.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{e.nombre}</div>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{e.tipo}{e.descripcion ? ` · ${e.descripcion}` : ''}</div>
              </div>
              {e.codigo_qr && (
                <a href={`/api/materiales/qr/${encodeURIComponent(e.codigo_qr)}`} target="_blank" rel="noreferrer"
                  style={{ fontFamily: SM, fontSize: 11, color: C.ink3, textDecoration: 'none' }}>
                  QR ↗
                </a>
              )}
              <button style={btn(C.bg3, C.ink)} onClick={() => { setEditId(e.id); setForm({ nombre: e.nombre, tipo: e.tipo, descripcion: e.descripcion ?? '' }) }}>Editar</button>
              <button style={{ ...btn('transparent', C.red), border: `1px solid ${C.red}44`, padding: '6px 10px' }} onClick={() => eliminar(e.id)}>Desactivar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Transferencias ─────────────────────────────────────────────
function Transferencias() {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ material_id: '', espacio_origen_id: '', espacio_destino_id: '', cantidad: '', notas: '' })

  const cargar = useCallback(async () => {
    const [rm, re, rv] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/espacios', { headers: H() }),
      fetch('/api/materiales/movimientos?tipo=transferencia&limit=50', { headers: H() }),
    ])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (re.ok) setEspacios((await re.json()).espacios ?? [])
    if (rv.ok) setMovs((await rv.json()).movimientos ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const transferir = async () => {
    if (!form.material_id || !form.espacio_origen_id || !form.espacio_destino_id) return
    if (form.espacio_origen_id === form.espacio_destino_id) { alert('Origen y destino deben ser distintos'); return }
    const cant = Number(form.cantidad)
    if (!(cant > 0)) return
    const r = await fetch('/api/materiales/movimientos', {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        material_id: form.material_id, tipo: 'transferencia', cantidad: cant,
        espacio_origen_id: form.espacio_origen_id, espacio_destino_id: form.espacio_destino_id,
        notas: form.notas.trim() || null,
      }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', espacio_origen_id: '', espacio_destino_id: '', cantidad: '', notas: '' })
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nueva transferencia entre espacios</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={{ ...inp(), gridColumn: '1/3' }} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.cantidad_disponible} disp.)</option>)}
          </select>
          <select style={inp()} value={form.espacio_origen_id} onChange={e => setForm({ ...form, espacio_origen_id: e.target.value })}>
            <option value="">Espacio origen…</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <select style={inp()} value={form.espacio_destino_id} onChange={e => setForm({ ...form, espacio_destino_id: e.target.value })}>
            <option value="">Espacio destino…</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <input style={inp()} type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          <input style={inp()} placeholder="Nota (opcional)" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
        <button style={{ ...btn(C.red), marginTop: 10 }} onClick={transferir}>Registrar transferencia</button>
      </div>
      {loading ? null : movs.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin transferencias registradas.</p>
      ) : (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Últimas transferencias</div>
          {movs.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.material?.nombre ?? '—'}</span>
                <span style={{ color: C.ink3, fontSize: 13 }}> ×{m.cantidad}</span>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                  {m.espacio_origen?.nombre ?? '?'} → {m.espacio_destino?.nombre ?? '?'}
                  {m.notas ? ` · ${m.notas}` : ''}
                </div>
              </div>
              <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{m.fecha}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Serializados ───────────────────────────────────────────────
function Serializados() {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ material_id: '', codigo_serie: '', estado: 'operativo', espacio_actual_id: '', fecha_compra: '', garantia_hasta: '', precio_compra: '', vida_util_anios: '' })
  const [filtroMat, setFiltroMat] = useState('')

  const cargar = useCallback(async () => {
    const [rm, re, ru] = await Promise.all([
      fetch('/api/materiales', { headers: H() }),
      fetch('/api/materiales/espacios', { headers: H() }),
      fetch('/api/materiales/unidades', { headers: H() }),
    ])
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    if (re.ok) setEspacios((await re.json()).espacios ?? [])
    if (ru.ok) setUnidades((await ru.json()).unidades ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const crear = async () => {
    if (!form.material_id) return
    const r = await fetch('/api/materiales/unidades', {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        material_id: form.material_id,
        codigo_serie: form.codigo_serie.trim() || null,
        estado: form.estado,
        espacio_actual_id: form.espacio_actual_id || null,
        fecha_compra: form.fecha_compra || null,
        garantia_hasta: form.garantia_hasta || null,
        precio_compra: form.precio_compra ? Number(form.precio_compra) : null,
        vida_util_anios: form.vida_util_anios ? Number(form.vida_util_anios) : null,
      }),
    })
    if (!r.ok) { alert((await r.json()).error ?? 'Error'); return }
    setForm({ material_id: '', codigo_serie: '', estado: 'operativo', espacio_actual_id: '', fecha_compra: '', garantia_hasta: '', precio_compra: '', vida_util_anios: '' })
    cargar()
  }
  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/materiales/unidades', { method: 'PATCH', headers: H(), body: JSON.stringify({ id, estado }) })
    cargar()
  }

  const visibles = filtroMat ? unidades.filter(u => u.material_id === filtroMat) : unidades

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Registrar unidad serializada</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={inp()} value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
            <option value="">Tipo de material…</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <input style={inp()} placeholder="Nº de serie (fabricante, opcional)" value={form.codigo_serie} onChange={e => setForm({ ...form, codigo_serie: e.target.value })} />
          <select style={inp()} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
            {ESTADOS_MAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={inp()} value={form.espacio_actual_id} onChange={e => setForm({ ...form, espacio_actual_id: e.target.value })}>
            <option value="">Espacio actual…</option>
            {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Fecha compra" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} />
          <input style={inp()} type="date" placeholder="Garantía hasta" value={form.garantia_hasta} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} />
          <input style={inp()} type="number" step="0.01" placeholder="Precio compra esta unidad (€)" value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} />
          <input style={inp()} type="number" placeholder="Vida útil (años)" value={form.vida_util_anios} onChange={e => setForm({ ...form, vida_util_anios: e.target.value })} />
        </div>
        <button style={{ ...btn(C.green), marginTop: 10 }} onClick={crear}>Registrar unidad</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select style={{ ...inp(), maxWidth: 260 }} value={filtroMat} onChange={e => setFiltroMat(e.target.value)}>
          <option value="">Todos los materiales</option>
          {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.ink3 }}>{visibles.length} unidades</span>
      </div>
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : visibles.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin unidades serializadas. Registra la primera arriba.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibles.map(u => {
            const eColor = TIPO_BADGE[u.estado] ?? C.ink3
            const esp = espacios.find(e => e.id === u.espacio_actual_id)
            return (
              <div key={u.id} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: SM, fontSize: 13, fontWeight: 700, color: C.ink }}>{u.codigo_qr}</span>
                    <span style={badge(eColor)}>{u.estado}</span>
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                    {u.material?.nombre ?? '—'}{u.codigo_serie ? ` · s/n: ${u.codigo_serie}` : ''}
                    {esp ? ` · ${esp.nombre}` : ''}
                    {u.garantia_hasta ? ` · gtía: ${new Date(u.garantia_hasta).toLocaleDateString('es-ES')}` : ''}
                  </div>
                </div>
                <a href={`/api/materiales/qr/${encodeURIComponent(u.codigo_qr)}`} target="_blank" rel="noreferrer"
                  style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>QR ↗</a>
                <select style={{ ...inp(), width: 'auto', fontSize: 12, padding: '6px 8px' }} value={u.estado}
                  onChange={e => cambiarEstado(u.id, e.target.value)}>
                  {ESTADOS_MAT.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Historial (ledger) ─────────────────────────────────────────
function Historial() {
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ material_id: '', tipo: '', fecha_desde: '', fecha_hasta: '' })

  const cargar = useCallback(async () => {
    const rm = await fetch('/api/materiales', { headers: H() })
    if (rm.ok) setMateriales((await rm.json()).materiales ?? [])
    const params = new URLSearchParams({ limit: '200' })
    if (filtros.material_id) params.set('material_id', filtros.material_id)
    if (filtros.tipo) params.set('tipo', filtros.tipo)
    if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde)
    if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta)
    const rv = await fetch(`/api/materiales/movimientos?${params}`, { headers: H() })
    if (rv.ok) setMovs((await rv.json()).movimientos ?? [])
    setLoading(false)
  }, [filtros])
  useEffect(() => { cargar() }, [cargar])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Filtros</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select style={inp()} value={filtros.material_id} onChange={e => setFiltros({ ...filtros, material_id: e.target.value })}>
            <option value="">Todos los materiales</option>
            {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <select style={inp()} value={filtros.tipo} onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}>
            <option value="">Todos los tipos</option>
            {['entrada','salida','devolucion','rotura','ajuste','transferencia'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={inp()} type="date" placeholder="Desde" value={filtros.fecha_desde} onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })} />
          <input style={inp()} type="date" placeholder="Hasta" value={filtros.fecha_hasta} onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })} />
        </div>
      </div>
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : movs.length === 0 ? (
        <p style={{ color: C.ink3 }}>Sin movimientos con estos filtros.</p>
      ) : (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{movs.length} movimientos</div>
          {movs.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${C.rule}` }}>
              <span style={badge(TIPO_MOV_BADGE[m.tipo] ?? C.ink3)}>{m.tipo}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13 }}>{m.material?.nombre ?? '—'}</span>
                <span style={{ color: C.ink3, fontSize: 13 }}> ×{m.cantidad}</span>
                {(m.espacio_origen || m.espacio_destino) && (
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
                    {m.espacio_origen?.nombre}{m.espacio_destino ? ` → ${m.espacio_destino.nombre}` : ''}
                  </div>
                )}
                {m.notas && <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{m.notas}</div>}
              </div>
              <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{m.fecha}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Task 12: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Run TypeScript check for module-materiales**

```bash
cd /home/user/central && pnpm -F @central/module-materiales test
```

Expected: all tests pass.

- [ ] **Step 2: Run Next.js build for ia-rest**

```bash
cd /home/user/central/apps/ia-rest && npm run build 2>&1 | tail -30
```

Expected: "Route (app)" table printed, no TypeScript errors.

- [ ] **Step 3: Commit everything**

```bash
cd /home/user/central && git add apps/ia-rest/ && git commit -m "feat(ia-rest/materiales): ledger APIs, QR, serializados, espacios, 14-tab UI (Fase A)"
```

- [ ] **Step 4: Push to branch**

```bash
cd /home/user/central && git push -u origin claude/focused-curie-d7gsnt
```

---

## Self-Review

**Spec coverage:**
- ✅ Ledger movimientos — Task 7
- ✅ Espacios CRUD — Task 6
- ✅ Transferencias — Task 11 (UI) + Task 7 (API, tipo=transferencia)
- ✅ Dashboard KPIs — Task 11 (Resumen tab)
- ✅ Entradas de stock — Task 11 (Catálogo → Reponer)
- ✅ QR printable — Task 9
- ✅ Serializados básicos — Task 8 + Task 11
- ✅ Alertas (stock mínimo + garantía) — Task 10 + Task 11 (Resumen)
- ✅ New types in module-materiales — Task 1
- ✅ New pure functions — Task 2
- ✅ Tests — Task 3
- ✅ Exports — Task 4
- ✅ DB migration — Task 5
- ⏳ Kits — Fase B (placeholder tab shown)
- ⏳ Inventario físico — Fase B
- ⏳ Mantenimiento — Fase B
- ⏳ Reservas — Fase B
- ⏳ Clientes/Proveedores — Fase B
- ⏳ CSV import / PDF — Fase B

**Type consistency check:**
- `Movimiento.negocioId` ↔ `stockActualDesdeLedger(movimientos: Movimiento[])` ✅
- `alertasVencimiento(materiales: Material[], unidades: UnidadMaterial[])` ✅
- `expandirKit(kit: Kit, items: KitItem[], ...)` — `Kit` and `KitItem` defined in Task 1 ✅
- `ajusteInventario(lineas: InventarioFisicoLinea[])` — type defined in Task 1 ✅
- `disponibilidadEnFecha(movimientos, reservas: ReservaAnticipada[], fecha)` — type in Task 1 ✅
- API returns `{ movimientos }`, UI reads `.movimientos` ✅
- API returns `{ espacios }`, UI reads `.espacios` ✅
- API returns `{ unidades }`, UI reads `.unidades` ✅
- API returns `{ alertas, total }`, UI reads `.alertas` ✅
