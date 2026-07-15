# Almacén Fase 2 — Cimientos (apps/almacen + maestro de materiales) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar la vertical `apps/almacen` (producto a vender, SaaS multi-tenant) sobre la BD compartida del holding, con auth propia y el primer flujo end-to-end: **maestro de materiales por familias**, editable 100% desde oficina.

**Architecture:** Copia estructural de `apps/alquiler` (Next.js 15 App Router, sin carpeta `src/`, alias `@/*→./*`), sustituyendo `@central/module-alquiler` por `@central/module-materiales`. Tablas nuevas `almacen_*` en `public` de la BD compartida `wswbehlcuxqxyinousql`, scoped por `cuenta_id` (tenant) + `negocio_id` (negocio dentro de la cuenta, para casar con `module-materiales.Material.negocioId` y la consolidación de plataforma). Rol de BD dedicado `prisma_almacen` (clon de `prisma_sivra`: login + BYPASSRLS + DML en `public`, sin CREATE). Motor de dominio puro `@central/module-materiales` compuesto vía un adaptador Prisma↔`Material` local (modelo: `apps/ia-rest/src/lib/inventario-menaje.ts`).

**Tech Stack:** Next.js `^15.5.18`, React 19, Prisma `^5.22.0` + `@prisma/client`, `@central/core-identity` (JWT sesión), `@central/module-materiales`, `jose`, `bcryptjs`, `zod`. Tests de dominio con `node --test` (type-stripping nativo).

---

## Alcance y NO-alcance

**Este plan (cimientos):** scaffold de la app + auth + conexión a BD + **maestro de familias (CRUD)** + **maestro de materiales (CRUD)** con «RAKI» (unidades por bandeja) y familia. Deja una app desplegable con login y una pantalla de oficina usable.

**Fuera (planes posteriores):** tipos de evento + bloques/plantillas, alta de evento + calendario, salidas/entradas con firma, inventario físico, lugares/haciendas, app operativa de campo (tablet/móvil), consolidación en plataforma. Ver `docs/ALMACEN-JJ-reunion-y-auditoria.md` para el alcance funcional completo.

**Acciones de mano de Alberto (no las hace el agente):** (1) crear el **proyecto Vercel** `almacen` con Root Directory `apps/almacen`; (2) `ALTER ROLE prisma_almacen WITH PASSWORD …` y pegar `DATABASE_URL`/`DIRECT_URL`/`ALMACEN_SESSION_SECRET` en las envs de Vercel. El agente crea el rol inerte y el DDL por MCP como `postgres`.

---

## File Structure

```
apps/almacen/
├── package.json               # name "almacen"; deps @central/* con workspace:*
├── vercel.json                # buildCommand prisma generate && next build
├── next.config.ts             # transpilePackages: core-identity, module-materiales
├── tsconfig.json              # extends ../../tsconfig.base.json; paths @/*→./*
├── eslint.config.mjs
├── .gitignore
├── middleware.ts              # gate de sesión (rutas públicas /login, /api/auth)
├── prisma/
│   ├── schema.prisma          # Cuenta, Negocio, AlmacenFamilia, AlmacenMaterial
│   └── sql/
│       └── 2026-07-15_almacen_schema.sql   # DDL a mano (aplica postgres)
├── lib/
│   ├── auth.ts                # cookie almacen_session, ALMACEN_SESSION_SECRET
│   ├── session.ts             # getSession()/requireSession()
│   ├── db.ts                  # singleton PrismaClient
│   ├── format.ts              # eur()
│   └── materiales-repo.ts     # adaptador Prisma↔module-materiales + queries maestro
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx               # redirect a /materiales o /login
│   ├── login/page.tsx
│   ├── (usuario)/
│   │   ├── layout.tsx
│   │   ├── logout-button.tsx
│   │   ├── _forms.tsx         # client components: alta/edición/borrado
│   │   ├── materiales/page.tsx
│   │   └── familias/page.tsx
│   └── api/
│       ├── auth/login/route.ts
│       ├── auth/logout/route.ts
│       ├── familias/route.ts  # GET/POST/PATCH/DELETE
│       └── materiales/route.ts# GET/POST/PATCH/DELETE
└── test/
    └── materiales-repo.test.ts

packages/module-materiales/     # SIN CAMBIOS (se consume tal cual)
```

---

### Task 0: DDL del schema almacén en la BD compartida

**Files:**
- Create: `apps/almacen/prisma/sql/2026-07-15_almacen_schema.sql`

Reutiliza tablas compartidas existentes (`cuentas`, `negocios`) y añade `almacen_familias` y `almacen_materiales`. `almacen_materiales` refleja `module-materiales.Material` + la columna «RAKI» (`unidades_por_bandeja`).

- [ ] **Step 1: Escribir el DDL**

```sql
-- apps/almacen/prisma/sql/2026-07-15_almacen_schema.sql
-- Vertical ALMACÉN — BD compartida wswbehlcuxqxyinousql, schema public.
-- Aplicar como `postgres` (preview→prod). El rol prisma_almacen NO tiene CREATE.
-- Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS almacen_familias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  negocio_id  uuid REFERENCES negocios(id) ON DELETE SET NULL,
  nombre      text NOT NULL,                 -- "Vajilla", "Cristalería", "Mantelería"…
  orden       int DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_familias_cuenta ON almacen_familias (cuenta_id);

CREATE TABLE IF NOT EXISTS almacen_materiales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id            uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  negocio_id           uuid REFERENCES negocios(id) ON DELETE SET NULL,
  familia_id           uuid REFERENCES almacen_familias(id) ON DELETE SET NULL,
  nombre               text NOT NULL,
  categoria            text NOT NULL DEFAULT 'otro',   -- espejo de module-materiales
  tipo                 text NOT NULL DEFAULT 'activo',  -- 'consumible' | 'activo'
  estado               text NOT NULL DEFAULT 'operativo',
  cantidad_total       int  NOT NULL DEFAULT 0,
  cantidad_disponible  int  NOT NULL DEFAULT 0,
  unidades_por_bandeja int  NOT NULL DEFAULT 1,         -- «RAKI» = bandeja de almacenaje
  stock_minimo         int,
  coste_reposicion     numeric(10,2) NOT NULL DEFAULT 0,
  precio_compra        numeric(10,2) NOT NULL DEFAULT 0,
  codigo               text,
  imagen_url           text,
  activo               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_materiales_cuenta  ON almacen_materiales (cuenta_id);
CREATE INDEX IF NOT EXISTS idx_almacen_materiales_familia ON almacen_materiales (familia_id);
```

- [ ] **Step 2: Aplicar el DDL a la BD compartida (por MCP, como postgres)**

Ejecutar con `mcp__Supabase__apply_migration` sobre `project_id: wswbehlcuxqxyinousql`, `name: almacen_schema_cimientos`, `query:` (el SQL de arriba).
Expected: `{"success":true}`.

- [ ] **Step 3: Verificar tablas creadas**

Ejecutar con `mcp__Supabase__execute_sql` sobre `wswbehlcuxqxyinousql`:
```sql
SELECT count(*) FILTER (WHERE tablename='almacen_familias')   AS familias,
       count(*) FILTER (WHERE tablename='almacen_materiales') AS materiales
FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'almacen_%';
```
Expected: `familias=1, materiales=1`.

- [ ] **Step 4: Crear el rol de BD inerte `prisma_almacen`** (clon de `prisma_sivra`, sin password)

Ejecutar con `mcp__Supabase__apply_migration` sobre `wswbehlcuxqxyinousql`, `name: rol_prisma_almacen`:
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='prisma_almacen') THEN
    CREATE ROLE prisma_almacen WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO prisma_almacen;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prisma_almacen;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prisma_almacen;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prisma_almacen;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO prisma_almacen;
```
Expected: `{"success":true}`. (Alberto luego: `ALTER ROLE prisma_almacen WITH PASSWORD '…';` — su mano.)

- [ ] **Step 5: Commit**

```bash
git add apps/almacen/prisma/sql/2026-07-15_almacen_schema.sql
git commit -m "feat(almacen): DDL de cimientos (familias + materiales) en BD compartida"
```

---

### Task 1: Scaffold de la app (config + boilerplate)

**Files:**
- Create: `apps/almacen/package.json`, `vercel.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `middleware.ts`, `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "almacen",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@central/core-identity": "workspace:*",
    "@central/module-materiales": "workspace:*",
    "@prisma/client": "^5.22.0",
    "bcryptjs": "^2.4.3",
    "jose": "^5.9.3",
    "next": "^15.5.18",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "^16.2.6",
    "prisma": "^5.22.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: `vercel.json`**

```json
{
  "buildCommand": "prisma generate && next build",
  "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
  "framework": "nextjs"
}
```

- [ ] **Step 3: `next.config.ts`**

```ts
import path from 'node:path'
import type { NextConfig } from 'next'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/core-identity', '@central/module-materiales'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
```

- [ ] **Step 4: `tsconfig.json`, `eslint.config.mjs`, `.gitignore`**

Copiar verbatim de `apps/alquiler/tsconfig.json`, `apps/alquiler/eslint.config.mjs`, `apps/alquiler/.gitignore` (no llevan nada específico de vertical; el `tsconfig` ya usa `extends: ../../tsconfig.base.json` y `paths @/*→./*`).

- [ ] **Step 5: `middleware.ts`**

Copiar de `apps/alquiler/middleware.ts` verbatim (gate de sesión con rutas públicas `['/login', '/api/auth']`, matcher que excluye `_next/static|_next/image|favicon`). No requiere cambios (lee la cookie por nombre en `lib/auth.ts`, no hardcodea el nombre).

- [ ] **Step 6: `app/globals.css` y `app/layout.tsx`**

Copiar de `apps/alquiler/app/globals.css` y `apps/alquiler/app/layout.tsx`, cambiando el `metadata.title` a `"Almacén"`.

- [ ] **Step 7: Commit**

```bash
git add apps/almacen/package.json apps/almacen/vercel.json apps/almacen/next.config.ts apps/almacen/tsconfig.json apps/almacen/eslint.config.mjs apps/almacen/.gitignore apps/almacen/middleware.ts apps/almacen/app/globals.css apps/almacen/app/layout.tsx
git commit -m "feat(almacen): scaffold de la vertical (config + boilerplate)"
```

---

### Task 2: Capa de datos (Prisma + auth + sesión + dinero)

**Files:**
- Create: `apps/almacen/prisma/schema.prisma`, `apps/almacen/lib/db.ts`, `apps/almacen/lib/auth.ts`, `apps/almacen/lib/session.ts`, `apps/almacen/lib/format.ts`

- [ ] **Step 1: `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Cuenta {
  id       String  @id @default(uuid()) @db.Uuid
  email    String?
  password String?
  nombre   String?
  @@map("cuentas")
}

model Negocio {
  id        String  @id @default(uuid()) @db.Uuid
  cuentaId  String  @map("cuenta_id") @db.Uuid
  nombre    String?
  @@map("negocios")
}

model AlmacenFamilia {
  id        String   @id @default(uuid()) @db.Uuid
  cuentaId  String   @map("cuenta_id") @db.Uuid
  negocioId String?  @map("negocio_id") @db.Uuid
  nombre    String
  orden     Int      @default(0)
  activo    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  @@index([cuentaId])
  @@map("almacen_familias")
}

model AlmacenMaterial {
  id                 String   @id @default(uuid()) @db.Uuid
  cuentaId           String   @map("cuenta_id") @db.Uuid
  negocioId          String?  @map("negocio_id") @db.Uuid
  familiaId          String?  @map("familia_id") @db.Uuid
  nombre             String
  categoria          String   @default("otro")
  tipo               String   @default("activo")
  estado             String   @default("operativo")
  cantidadTotal      Int      @default(0) @map("cantidad_total")
  cantidadDisponible Int      @default(0) @map("cantidad_disponible")
  unidadesPorBandeja Int      @default(1) @map("unidades_por_bandeja")
  stockMinimo        Int?     @map("stock_minimo")
  costeReposicion    Decimal  @default(0) @map("coste_reposicion") @db.Decimal(10, 2)
  precioCompra       Decimal  @default(0) @map("precio_compra") @db.Decimal(10, 2)
  codigo             String?
  imagenUrl          String?  @map("imagen_url")
  activo             Boolean  @default(true)
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @default(now()) @updatedAt @map("updated_at")
  @@index([cuentaId])
  @@index([familiaId])
  @@map("almacen_materiales")
}
```

- [ ] **Step 2: `lib/db.ts`** — copiar de `apps/alquiler/lib/db.ts` verbatim (singleton global `PrismaClient`; no lleva nada específico de vertical).

- [ ] **Step 3: `lib/auth.ts`** — copiar de `apps/alquiler/lib/auth.ts` con estas sustituciones exactas: nombre de cookie `alquiler_session` → `almacen_session`; env `ALQUILER_SESSION_SECRET` → `ALMACEN_SESSION_SECRET`. Mantiene el patrón `@central/core-identity` (`genJti, createSessionToken, verifySessionToken`), payload `{ cuentaId, email }`, y la guarda sin literal en producción.

- [ ] **Step 4: `lib/session.ts`** — copiar de `apps/alquiler/lib/session.ts` verbatim (valida firma JWT + existencia de `cuenta` con `prisma.cuenta.findFirst`; expone `getSession()` que devuelve `{ id: cuentaId, email }` o `null`).

- [ ] **Step 5: `lib/format.ts`** — copiar de `apps/alquiler/lib/format.ts` verbatim (`eur()` = `n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'`).

- [ ] **Step 6: Generar el cliente Prisma y verificar que compila**

Run: `cd apps/almacen && npx prisma generate`
Expected: `Generated Prisma Client` sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/almacen/prisma/schema.prisma apps/almacen/lib/db.ts apps/almacen/lib/auth.ts apps/almacen/lib/session.ts apps/almacen/lib/format.ts
git commit -m "feat(almacen): capa de datos (prisma + auth + sesion + eur)"
```

---

### Task 3: Adaptador de dominio (Prisma↔module-materiales) + test

**Files:**
- Create: `apps/almacen/lib/materiales-repo.ts`
- Test: `apps/almacen/test/materiales-repo.test.ts`

El adaptador mapea la fila Prisma `AlmacenMaterial` al tipo `Material` de `@central/module-materiales`, para poder componer el motor puro en fases posteriores (informes/stock). En cimientos se usa para el listado; se testea el mapeo y la lógica de ajuste de `cantidad_disponible` por delta (mismo comportamiento que `apps/ia-rest/src/app/api/materiales/route.ts:82-93`).

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/almacen/test/materiales-repo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aMaterial, disponibleTrasEditarTotal } from '../lib/materiales-repo.ts'

test('aMaterial mapea fila Prisma a Material del modulo', () => {
  const fila = {
    id: 'm1', cuentaId: 'c1', negocioId: 'n1', familiaId: 'f1',
    nombre: 'Plato llano', categoria: 'vajilla', tipo: 'activo', estado: 'operativo',
    cantidadTotal: 100, cantidadDisponible: 80, unidadesPorBandeja: 12,
    stockMinimo: 10, costeReposicion: '2.50', precioCompra: '1.20',
    codigo: 'PLL', imagenUrl: null, activo: true,
  }
  const m = aMaterial(fila as any)
  assert.equal(m.id, 'm1')
  assert.equal(m.negocioId, 'n1')
  assert.equal(m.nombre, 'Plato llano')
  assert.equal(m.tipo, 'activo')
  assert.equal(m.cantidadTotal, 100)
  assert.equal(m.cantidadDisponible, 80)
  assert.equal(m.costeReposicion, 2.5)
})

test('disponibleTrasEditarTotal ajusta por delta sin perder lo que esta fuera', () => {
  // 100 total, 80 disponible (20 fuera). Subir total a 120 => disponible 100 (20 siguen fuera).
  assert.equal(disponibleTrasEditarTotal(100, 80, 120), 100)
  // Bajar total a 90 => disponible 70.
  assert.equal(disponibleTrasEditarTotal(100, 80, 90), 70)
  // Nunca negativo.
  assert.equal(disponibleTrasEditarTotal(100, 80, 10), 0)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/almacen && node --test test/materiales-repo.test.ts`
Expected: FAIL con "Cannot find module '../lib/materiales-repo.ts'".

- [ ] **Step 3: Implementar el adaptador**

```ts
// apps/almacen/lib/materiales-repo.ts
import type { Material } from '@central/module-materiales'
import { prisma } from './db'

// Fila Prisma (Decimal llega como string/Decimal según driver): tipamos laxo.
type FilaMaterial = {
  id: string; cuentaId: string; negocioId: string | null; familiaId: string | null
  nombre: string; categoria: string; tipo: string; estado: string
  cantidadTotal: number; cantidadDisponible: number; unidadesPorBandeja: number
  stockMinimo: number | null; costeReposicion: unknown; precioCompra: unknown
  codigo: string | null; imagenUrl: string | null; activo: boolean
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))

/** Mapea una fila almacen_materiales al tipo Material de @central/module-materiales. */
export function aMaterial(f: FilaMaterial): Material {
  return {
    id: f.id,
    negocioId: f.negocioId ?? '',
    nombre: f.nombre,
    categoria: f.categoria,
    tipo: f.tipo as Material['tipo'],
    estado: f.estado as Material['estado'],
    cantidadTotal: f.cantidadTotal,
    cantidadDisponible: f.cantidadDisponible,
    stockMinimo: f.stockMinimo ?? undefined,
    precioCompra: num(f.precioCompra),
    costeReposicion: num(f.costeReposicion),
    codigo: f.codigo ?? undefined,
    imagenUrl: f.imagenUrl ?? undefined,
    activo: f.activo,
  }
}

/** Ajusta cantidad_disponible por el delta al editar cantidad_total (no pierde lo que está fuera). */
export function disponibleTrasEditarTotal(totalActual: number, dispActual: number, totalNuevo: number): number {
  return Math.max(0, dispActual + (totalNuevo - totalActual))
}

/** Lista los materiales activos de una cuenta, ordenados por familia y nombre. */
export async function listarMateriales(cuentaId: string) {
  return prisma.almacenMaterial.findMany({
    where: { cuentaId, activo: true },
    orderBy: [{ familiaId: 'asc' }, { nombre: 'asc' }],
  })
}
```

> Nota: si `Material['tipo']`/`['estado']` no aceptan el cast directo, revisar los literales exactos en `packages/module-materiales/src/types.ts:33` y ajustar el `as`. No inventar nuevos estados.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/almacen && node --test test/materiales-repo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/almacen/lib/materiales-repo.ts apps/almacen/test/materiales-repo.test.ts
git commit -m "feat(almacen): adaptador Prisma<->module-materiales + test de mapeo/delta"
```

---

### Task 4: Familias — API CRUD + página

**Files:**
- Create: `apps/almacen/app/api/familias/route.ts`, `apps/almacen/app/(usuario)/familias/page.tsx`
- Modify: `apps/almacen/app/(usuario)/_forms.tsx` (se crea aquí; ampliado en Task 5)

- [ ] **Step 1: `app/api/familias/route.ts`** — patrón de `apps/alquiler/app/api/materiales/route.ts` (zod + `getSession()`→401 + scope por `s.id`).

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const nueva = z.object({ nombre: z.string().min(1), orden: z.number().int().optional() })
const edita = z.object({ id: z.string().uuid(), nombre: z.string().min(1).optional(), orden: z.number().int().optional() })

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const familias = await prisma.almacenFamilia.findMany({
    where: { cuentaId: s.id, activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json({ familias })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nueva.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const f = await prisma.almacenFamilia.create({ data: { cuentaId: s.id, nombre: p.data.nombre, orden: p.data.orden ?? 0 } })
  return NextResponse.json({ familia: f })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = edita.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const { id, ...campos } = p.data
  const r = await prisma.almacenFamilia.updateMany({ where: { id, cuentaId: s.id }, data: campos })
  if (r.count === 0) return NextResponse.json({ error: 'no-encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta-id' }, { status: 400 })
  await prisma.almacenFamilia.updateMany({ where: { id, cuentaId: s.id }, data: { activo: false } }) // soft delete
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: `app/(usuario)/familias/page.tsx`** — server component con `export const dynamic = 'force-dynamic'`, `getSession()`→`redirect('/login')`, lista familias y renderiza el form cliente.

```tsx
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { FamiliaForm } from '../_forms'

export const dynamic = 'force-dynamic'

export default async function FamiliasPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const familias = await prisma.almacenFamilia.findMany({
    where: { cuentaId: s.id, activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
  return (
    <main style={{ padding: 16 }}>
      <h1>Familias</h1>
      <FamiliaForm />
      <ul>{familias.map((f) => <li key={f.id}>{f.nombre}</li>)}</ul>
    </main>
  )
}
```

- [ ] **Step 3: `app/(usuario)/_forms.tsx`** — crear con el client component `FamiliaForm` (alta por `fetch('/api/familias', {method:'POST'})` + `router.refresh()`). Modelo: `apps/alquiler/app/(usuario)/_forms.tsx`.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FamiliaForm() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    await fetch('/api/familias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre }) })
    setNombre(''); router.refresh()
  }
  return (
    <form onSubmit={crear} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nueva familia" />
      <button type="submit">Añadir</button>
    </form>
  )
}
```

- [ ] **Step 4: Verificación manual (tras deploy/preview con envs)** — Login → `/familias`, crear "Vajilla", refresca y aparece. (Verificación end-to-end en Task 6.)

- [ ] **Step 5: Commit**

```bash
git add apps/almacen/app/api/familias/route.ts "apps/almacen/app/(usuario)/familias/page.tsx" "apps/almacen/app/(usuario)/_forms.tsx"
git commit -m "feat(almacen): maestro de familias (API CRUD + pagina)"
```

---

### Task 5: Materiales — API CRUD + página (con RAKI y familia)

**Files:**
- Create: `apps/almacen/app/api/materiales/route.ts`, `apps/almacen/app/(usuario)/materiales/page.tsx`
- Modify: `apps/almacen/app/(usuario)/_forms.tsx` (añadir `MaterialForm`)

- [ ] **Step 1: `app/api/materiales/route.ts`** — CRUD con zod, scope `s.id`; POST inicializa `cantidadDisponible = cantidadTotal`; PATCH ajusta disponible por delta con `disponibleTrasEditarTotal`; DELETE soft.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { disponibleTrasEditarTotal } from '@/lib/materiales-repo'

const nuevo = z.object({
  nombre: z.string().min(1),
  familiaId: z.string().uuid().nullish(),
  categoria: z.string().optional(),
  tipo: z.enum(['consumible', 'activo']).optional(),
  cantidadTotal: z.number().int().min(0).optional(),
  unidadesPorBandeja: z.number().int().min(1).optional(),
  costeReposicion: z.number().min(0).optional(),
})
const edita = nuevo.partial().extend({ id: z.string().uuid() })

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const materiales = await prisma.almacenMaterial.findMany({
    where: { cuentaId: s.id, activo: true }, orderBy: [{ familiaId: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json({ materiales })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nuevo.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const total = p.data.cantidadTotal ?? 0
  const m = await prisma.almacenMaterial.create({
    data: {
      cuentaId: s.id, nombre: p.data.nombre, familiaId: p.data.familiaId ?? null,
      categoria: p.data.categoria ?? 'otro', tipo: p.data.tipo ?? 'activo',
      cantidadTotal: total, cantidadDisponible: total,
      unidadesPorBandeja: p.data.unidadesPorBandeja ?? 1,
      costeReposicion: p.data.costeReposicion ?? 0,
    },
  })
  return NextResponse.json({ material: m })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = edita.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const { id, cantidadTotal, ...resto } = p.data
  const actual = await prisma.almacenMaterial.findFirst({ where: { id, cuentaId: s.id } })
  if (!actual) return NextResponse.json({ error: 'no-encontrado' }, { status: 404 })
  const data: Record<string, unknown> = { ...resto }
  if (cantidadTotal != null) {
    data.cantidadTotal = cantidadTotal
    data.cantidadDisponible = disponibleTrasEditarTotal(actual.cantidadTotal, actual.cantidadDisponible, cantidadTotal)
  }
  await prisma.almacenMaterial.updateMany({ where: { id, cuentaId: s.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta-id' }, { status: 400 })
  await prisma.almacenMaterial.updateMany({ where: { id, cuentaId: s.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: `app/(usuario)/materiales/page.tsx`** — lista materiales con familia y muestra bandejas (RAKI) y coste con `eur()`.

```tsx
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { eur } from '@/lib/format'
import { MaterialForm } from '../_forms'

export const dynamic = 'force-dynamic'

export default async function MaterialesPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const [materiales, familias] = await Promise.all([
    prisma.almacenMaterial.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }] }),
    prisma.almacenFamilia.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }] }),
  ])
  const nombreFamilia = new Map(familias.map((f) => [f.id, f.nombre]))
  return (
    <main style={{ padding: 16 }}>
      <h1>Materiales</h1>
      <MaterialForm familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))} />
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Material</th><th>Familia</th><th>Total</th><th>Disp.</th><th>Ud/bandeja</th><th>Coste rep.</th></tr></thead>
          <tbody>
            {materiales.map((m) => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>{m.familiaId ? nombreFamilia.get(m.familiaId) ?? '—' : '—'}</td>
                <td>{m.cantidadTotal}</td>
                <td>{m.cantidadDisponible}</td>
                <td>{m.unidadesPorBandeja}</td>
                <td>{eur(Number(m.costeReposicion))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Añadir `MaterialForm` a `app/(usuario)/_forms.tsx`** — alta con nombre, familia (select), cantidad total, unidades por bandeja, coste.

```tsx
export function MaterialForm({ familias }: { familias: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: '', familiaId: '', cantidadTotal: '0', unidadesPorBandeja: '1', costeReposicion: '0' })
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nombre.trim()) return
    await fetch('/api/materiales', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre,
        familiaId: f.familiaId || null,
        cantidadTotal: Number(f.cantidadTotal) || 0,
        unidadesPorBandeja: Number(f.unidadesPorBandeja) || 1,
        costeReposicion: Number(f.costeReposicion) || 0,
      }),
    })
    setF({ nombre: '', familiaId: '', cantidadTotal: '0', unidadesPorBandeja: '1', costeReposicion: '0' }); router.refresh()
  }
  return (
    <form onSubmit={crear} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <input placeholder="Material" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <select value={f.familiaId} onChange={(e) => setF({ ...f, familiaId: e.target.value })}>
        <option value="">(sin familia)</option>
        {familias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      </select>
      <input type="number" min={0} placeholder="Total" value={f.cantidadTotal} onChange={(e) => setF({ ...f, cantidadTotal: e.target.value })} style={{ width: 80 }} />
      <input type="number" min={1} placeholder="Ud/bandeja" value={f.unidadesPorBandeja} onChange={(e) => setF({ ...f, unidadesPorBandeja: e.target.value })} style={{ width: 90 }} />
      <input type="number" min={0} step="0.01" placeholder="Coste" value={f.costeReposicion} onChange={(e) => setF({ ...f, costeReposicion: e.target.value })} style={{ width: 90 }} />
      <button type="submit">Añadir material</button>
    </form>
  )
}
```

- [ ] **Step 4: Verificación de la tabla responsive** — confirmar que la tabla va dentro de `<div style={{ overflowX: 'auto' }}>` (regla responsive del monorepo, `CLAUDE.md`). Ya incluido en Step 2.

- [ ] **Step 5: Commit**

```bash
git add apps/almacen/app/api/materiales/route.ts "apps/almacen/app/(usuario)/materiales/page.tsx" "apps/almacen/app/(usuario)/_forms.tsx"
git commit -m "feat(almacen): maestro de materiales (RAKI + familia, API CRUD + pagina)"
```

---

### Task 6: Login, layout de usuario, y arranque end-to-end

**Files:**
- Create: `apps/almacen/app/login/page.tsx`, `apps/almacen/app/api/auth/login/route.ts`, `apps/almacen/app/api/auth/logout/route.ts`, `apps/almacen/app/(usuario)/layout.tsx`, `apps/almacen/app/(usuario)/logout-button.tsx`, `apps/almacen/app/page.tsx`

- [ ] **Step 1: Auth endpoints y login** — copiar de `apps/alquiler`: `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/login/page.tsx`. Cambios: ninguno funcional (usan `lib/auth.ts` de almacen, que ya tiene cookie/secret propios). Verificar que el import de `verifyPassword`/`bcrypt` apunta a lo mismo que en alquiler.

- [ ] **Step 2: Layout de usuario + logout** — copiar `app/(usuario)/layout.tsx` y `app/(usuario)/logout-button.tsx` de alquiler; en el layout, cambiar el nav para enlazar `/materiales` y `/familias`.

- [ ] **Step 3: `app/page.tsx`** — redirige a `/materiales` si hay sesión, si no a `/login`.

```tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
export default async function Home() {
  const s = await getSession()
  redirect(s ? '/materiales' : '/login')
}
```

- [ ] **Step 4: Seed del tenant de Joaquín** — crear (o localizar) la `cuenta` "Catering Joaquín Jaén" con owner y un `negocio`. Ejecutar por MCP `mcp__Supabase__execute_sql` sobre `wswbehlcuxqxyinousql` (o incluir en `prisma/sql/`), generando un hash bcrypt para la contraseña del owner **fuera del repo** (no commitear credenciales). Anotar el `cuenta_id` resultante para pasárselo a Alberto (accesos de Joaquín).

- [ ] **Step 5: Build local completo**

Run: `cd apps/almacen && npx prisma generate && npx next build`
Expected: `✓ Compiled successfully` sin errores de tipo bloqueantes.

- [ ] **Step 6: Verificación end-to-end (preview Vercel, tras envs de Alberto)** — usar la skill `verify`/`run`: login con el owner de Joaquín → crear familia "Vajilla" → crear material "Plato llano" (total 100, ud/bandeja 12, coste 2,50€) → aparece en la tabla con la familia y `2,50€` bien formateado → logout. Observar el flujo real, no solo el build.

- [ ] **Step 7: Commit + push + PR**

```bash
git add apps/almacen/app
git commit -m "feat(almacen): login + layout usuario + arranque end-to-end del maestro"
git push -u origin claude/warehouse-module-review-angvve
```
Abrir PR draft si no existe para la rama.

---

## Self-Review

- **Cobertura del alcance (cimientos):** scaffold (Task 1) ✓, datos/auth (Task 2) ✓, adaptador+motor (Task 3) ✓, familias CRUD (Task 4) ✓, materiales CRUD con RAKI+familia (Task 5) ✓, login+e2e (Task 6) ✓. Fuera de alcance documentado arriba.
- **Placeholders:** los "copiar de alquiler" citan fichero fuente exacto + sustituciones concretas (no son TODO). El único texto abierto deliberado: revisar literales de `Material['tipo'|'estado']` en `module-materiales/src/types.ts:33` (nota en Task 3) — es una verificación, no un placeholder de implementación.
- **Consistencia de tipos:** `disponibleTrasEditarTotal(totalActual, dispActual, totalNuevo)` misma firma en test (Task 3) y uso (Task 5). `aMaterial` devuelve `Material` de `@central/module-materiales`. Modelos Prisma (`AlmacenFamilia`/`AlmacenMaterial`) con nombres de campo consistentes entre schema (Task 2), adaptador (Task 3) y rutas (Tasks 4-5).
- **Reglas del monorepo:** `eur()` (no `€${x.toFixed(2)}`), tabla con `overflow-x:auto` (responsive), secreto de sesión sin literal, `workspace:*` deps, `transpilePackages`. ✓

## Fuentes
`docs/ALMACEN-JJ-reunion-y-auditoria.md`, `apps/alquiler/**` (plantilla), `packages/module-materiales/src/{index,types,stock}.ts`, `apps/ia-rest/src/lib/inventario-menaje.ts` + `apps/ia-rest/src/app/api/materiales/route.ts` (referencia de maestro), `MATRIZ.md` (arquitectura de datos + alta de vertical), `docs/CONTEXTO-SESIONES.md` (receta rol `prisma_<vertical>`).
