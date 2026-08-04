# Almacén Fase 1 — Multi-almacén + libro de movimientos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Añadir control operativo multi-almacén a `apps/almacen`: almacenes (central+haciendas), stock por almacén vía ledger+snapshot, transferencias con "en tránsito", historial por material, motivo obligatorio en ajustes/roturas, valor por almacén y comentarios.

**Architecture:** Ledger (`almacen_movimientos`) fuente de verdad histórica + snapshot (`almacen_stock`) por (material, almacén) actualizados en la misma transacción Prisma. Lógica pura en `@central/module-materiales`. UI Next 15 App Router, corporativa (globals.css JJ) y responsive.

**Tech Stack:** Next.js 15, Prisma, PostgreSQL (Supabase compartida `wswbehlcuxqxyinousql`, rol `prisma_almacen`), TypeScript. Tests: vitest en `packages/module-materiales`.

Spec: `docs/superpowers/specs/2026-07-16-almacen-fase1-multialmacen-design.md`.

---

## File Structure

**Crear:**
- `apps/almacen/prisma/sql/2026-07-16_almacen_fase1_operativa.sql` — DDL tablas + grants + índices.
- `apps/almacen/lib/almacen.ts` — capa de servicio (transacciones stock+movimiento; helpers de sesión→identidad).
- `apps/almacen/app/(usuario)/almacenes/page.tsx`, `almacenes/[id]/page.tsx`, `almacenes/_forms.tsx`, `almacenes/almacenes-client.tsx`.
- `apps/almacen/app/(usuario)/materiales/[id]/page.tsx`, `materiales/[id]/material-detalle.tsx`.
- `apps/almacen/app/(usuario)/transferencias/page.tsx`, `transferencias/transferencias-client.tsx`.
- `apps/almacen/app/(usuario)/movimientos/page.tsx`, `movimientos/movimientos-client.tsx`.
- `apps/almacen/app/(usuario)/comentarios.tsx` — componente hilo reutilizable.
- API: `apps/almacen/app/api/espacios/route.ts` (+ `[id]/route.ts`), `api/movimientos/route.ts`, `api/transferencias/route.ts` (+ `[id]/confirmar`, `[id]/cancelar`), `api/comentarios/route.ts`.
- `packages/module-materiales/src/transferencias.ts` — lógica pura "en tránsito".
- `packages/module-materiales/test/transferencias.test.ts`.

**Modificar:**
- `apps/almacen/prisma/schema.prisma` — modelos AlmacenEspacio, AlmacenMovimiento, AlmacenStock, AlmacenTransferencia, AlmacenComentario; añadir relación stock a AlmacenMaterial.
- `apps/almacen/app/(usuario)/materiales/page.tsx` + `materiales-table.tsx` — stock por almacén + enlace a ficha.
- `apps/almacen/app/(usuario)/layout.tsx` + `nav-links.tsx` — nav ampliada + drawer móvil.
- `apps/almacen/app/(usuario)/page.tsx` — Panel con KPIs.
- `apps/almacen/app/globals.css` — estilos nav drawer, badges de estado, ficha de almacén.
- `packages/module-materiales/src/index.ts` — exportar lo nuevo.

---

## Task 1: Lógica pura de transferencias "en tránsito" (TDD)

**Files:**
- Create: `packages/module-materiales/src/transferencias.ts`
- Test: `packages/module-materiales/test/transferencias.test.ts`

- [ ] **Step 1: Test que falla** — transiciones crear/confirmar/parcial/cancelar sobre stock {disponible, enTransito}.

```ts
import { describe, it, expect } from 'vitest'
import { iniciarTraspaso, confirmarRecepcion, cancelarTraspaso } from '../src/transferencias'

describe('transferencias en tránsito', () => {
  it('iniciar mueve disponible→enTransito en origen', () => {
    expect(iniciarTraspaso({ disponible: 10, enTransito: 0 }, 4))
      .toEqual({ disponible: 6, enTransito: 4 })
  })
  it('iniciar no permite más de lo disponible', () => {
    expect(() => iniciarTraspaso({ disponible: 3, enTransito: 0 }, 4)).toThrow()
  })
  it('confirmar total: origen libera enTransito, destino suma recibidas', () => {
    const r = confirmarRecepcion({ disponible: 6, enTransito: 4 }, { disponible: 0, enTransito: 0 }, 4, 0)
    expect(r.origen).toEqual({ disponible: 6, enTransito: 0 })
    expect(r.destino).toEqual({ disponible: 4, enTransito: 0 })
    expect(r.rotas).toBe(0)
    expect(r.estado).toBe('recibida')
  })
  it('confirmar parcial con roturas', () => {
    const r = confirmarRecepcion({ disponible: 6, enTransito: 4 }, { disponible: 0, enTransito: 0 }, 3, 1)
    expect(r.destino.disponible).toBe(3)
    expect(r.rotas).toBe(1)
    expect(r.estado).toBe('parcial')
  })
  it('cancelar devuelve enTransito a disponible en origen', () => {
    expect(cancelarTraspaso({ disponible: 6, enTransito: 4 }, 4)).toEqual({ disponible: 10, enTransito: 0 })
  })
})
```

- [ ] **Step 2: Ejecutar test → falla** (`cd packages/module-materiales && npx vitest run test/transferencias.test.ts`).
- [ ] **Step 3: Implementar** `transferencias.ts`:

```ts
export interface StockCelda { disponible: number; enTransito: number }

export function iniciarTraspaso(origen: StockCelda, cantidad: number): StockCelda {
  if (cantidad <= 0) throw new Error('cantidad debe ser > 0')
  if (origen.disponible < cantidad) throw new Error('disponible insuficiente')
  return { disponible: origen.disponible - cantidad, enTransito: origen.enTransito + cantidad }
}

export function confirmarRecepcion(
  origen: StockCelda, destino: StockCelda, recibidas: number, rotas: number,
): { origen: StockCelda; destino: StockCelda; rotas: number; estado: 'recibida' | 'parcial' } {
  const enviadas = recibidas + rotas
  if (enviadas <= 0) throw new Error('nada que confirmar')
  if (origen.enTransito < enviadas) throw new Error('excede lo que hay en tránsito')
  return {
    origen: { disponible: origen.disponible, enTransito: origen.enTransito - enviadas },
    destino: { disponible: destino.disponible + recibidas, enTransito: destino.enTransito },
    rotas,
    estado: rotas > 0 || recibidas < enviadas ? 'parcial' : 'recibida',
  }
}

export function cancelarTraspaso(origen: StockCelda, cantidad: number): StockCelda {
  if (origen.enTransito < cantidad) throw new Error('excede lo que hay en tránsito')
  return { disponible: origen.disponible + cantidad, enTransito: origen.enTransito - cantidad }
}
```

- [ ] **Step 4: Ejecutar test → pasa.**
- [ ] **Step 5: Exportar** en `packages/module-materiales/src/index.ts` (añadir `export * from './transferencias'`).
- [ ] **Step 6: Commit** `feat(module-materiales): lógica pura de traspasos en tránsito`.

## Task 2: DDL y migración de datos

**Files:** Create `apps/almacen/prisma/sql/2026-07-16_almacen_fase1_operativa.sql`

- [ ] **Step 1** Escribir DDL: tablas `almacen_espacios`, `almacen_movimientos`, `almacen_stock` (UNIQUE material_id,espacio_id), `almacen_transferencias`, `almacen_comentarios`; índices por cuenta_id/material_id/espacio_id; `GRANT ALL ON <tablas> TO prisma_almacen;`. Todas las columnas según spec. Checks: cantidad<>0; disponible>=0; en_transito>=0.
- [ ] **Step 2** Aplicar por MCP `apply_migration` (project `wswbehlcuxqxyinousql`).
- [ ] **Step 3** Migración de datos (execute_sql): crear espacio "Central" (tipo central) para cuenta DEMO `0de50000-0000-4000-a000-000000000001`; insertar `almacen_stock` (material, Central, disponible=cantidad_disponible) + `almacen_movimientos` entrada (motivo 'Asiento de apertura Fase 1') para cada material con cantidad_disponible>0.
- [ ] **Step 4** Verificar: Σ almacen_stock.disponible == Σ materiales.cantidad_disponible; count espacios==1.
- [ ] **Step 5** Commit del `.sql`.

## Task 3: Prisma models

**Files:** Modify `apps/almacen/prisma/schema.prisma`

- [ ] **Step 1** Añadir modelos mapeando las tablas (snake_case @map). AlmacenEspacio, AlmacenMovimiento, AlmacenStock, AlmacenTransferencia, AlmacenComentario. Enums como String (validación en app).
- [ ] **Step 2** `cd apps/almacen && npx prisma generate`.
- [ ] **Step 3** `npx tsc --noEmit` (sin errores nuevos).
- [ ] **Step 4** Commit.

## Task 4: Capa de servicio (transacciones)

**Files:** Create `apps/almacen/lib/almacen.ts`

- [ ] **Step 1** Funciones que envuelven `prisma.$transaction`: `registrarMovimiento` (entrada/salida/ajuste/rotura → upsert stock + insert movimiento, con validaciones y motivo obligatorio en ajuste/rotura), `crearTransferencia` (iniciarTraspaso: -disp/+transito origen + header pendiente + movimiento salida), `confirmarTransferencia` (confirmarRecepcion: -transito origen, +disp destino, movimiento entrada + rotura, estado), `cancelarTransferencia`. Usan las funciones puras de Task 1. Identidad `realizadoPor` = nombre/email de la sesión.
- [ ] **Step 2** `valorPorAlmacen(cuentaId)` y `stockPorMaterial(materialId)` (lecturas agregadas para Panel/ficha).
- [ ] **Step 3** `npx tsc --noEmit`.
- [ ] **Step 4** Commit.

## Task 5: API routes

**Files:** Create rutas API (ver File Structure). Patrón: validar sesión (`getSession`), body, scope cuenta_id, try/catch→400/500, `revalidate` no aplica (force-dynamic).

- [ ] espacios: GET (list), POST (crear), PATCH `[id]` (editar), — sin borrado físico (activo=false).
- [ ] movimientos: GET (list filtrable), POST (entrada/salida/ajuste/rotura vía servicio).
- [ ] transferencias: POST (crear), POST `[id]/confirmar`, POST `[id]/cancelar`, GET (list).
- [ ] comentarios: GET (por entidad), POST (crear).
- [ ] `npx tsc --noEmit`; Commit.

## Task 6: UI — Almacenes

**Files:** `almacenes/page.tsx` (server: list + KPIs), `almacenes/[id]/page.tsx` (ficha + stock + comentarios), `almacenes/_forms.tsx`, `almacenes/almacenes-client.tsx`.

- [ ] Tarjetas por almacén (nombre, tipo badge, dirección, contacto). Form crear/editar (ficha completa). Responsive (grid → 1 col móvil). Commit.

## Task 7: UI — Materiales ampliada + ficha

**Files:** Modify `materiales/page.tsx`, `materiales-table.tsx`; Create `materiales/[id]/*`.

- [ ] Tabla materiales: columna "Stock" (total y por almacén en la ficha), nombre enlaza a `/materiales/[id]`.
- [ ] Ficha material: datos + foto + stock por almacén + acciones (Entrada/Salida/Ajuste/Rotura/Mover) + Historial (movimientos) + Comentarios. Commit.

## Task 8: UI — Transferencias y Movimientos

**Files:** `transferencias/*`, `movimientos/*`.

- [ ] Transferencias: form crear (material, cantidad, origen→destino); lista de pendientes con "Confirmar recepción" (recibidas + rotas) y "Cancelar". Badges de estado.
- [ ] Movimientos: feed global filtrable (almacén/material/tipo), paginación 50 + Ver más. Commit.

## Task 9: UI — Panel + navegación

**Files:** Modify `(usuario)/page.tsx`, `layout.tsx`, `nav-links.tsx`, `globals.css`.

- [ ] Panel: KPIs (valor total, valor por almacén, nº bajo mínimo, traspasos pendientes) con eur().
- [ ] Nav: enlaces Panel/Almacenes/Materiales/Transferencias/Movimientos; **drawer** en móvil (<640px). Táctil ≥44px. Commit.

## Task 10: Verificación integral

- [ ] `cd packages/module-materiales && npx vitest run` (verde).
- [ ] `cd apps/almacen && npx tsc --noEmit` (verde).
- [ ] `pnpm test:guardia` en raíz (secretos verde).
- [ ] Deploy preview (push) y ejercer flujo real: crear almacén "Hacienda X" → traspaso Central→Hacienda 10 uds → ver en tránsito → confirmar (8 ok, 2 rotas) → ver stock por almacén, historial del material, valor por almacén, comentario con registro.
- [ ] Responsive check a 320px (nav drawer, tablas scroll/cards).
- [ ] Actualizar `docs/CONTEXTO-SESIONES.md` + checklist del PR #929. Informe final a Alberto.

## Self-Review
- Cobertura spec: almacenes✓ movimientos✓ stock-por-almacén✓ en-tránsito✓ motivo-obligatorio✓ historial✓ valor-por-almacén✓ comentarios✓ responsive✓.
- Sin placeholders en lógica pura (Task 1 completa). Rutas/UI siguen patrón existente (`materiales-table.tsx`).
- Tipos consistentes: `StockCelda {disponible,enTransito}` usado en módulo y servicio.
