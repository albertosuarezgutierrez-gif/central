# RR.HH. (`apps/rrhh`) · Fase 1 — Cimiento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar la vertical `apps/rrhh` (scaffold + BD Supabase propia + auth de responsable y empleado + alta/gestión de empleados), dejándola desplegable en Vercel y lista para colgar de ella el expediente documental, la firma y el chat en planes posteriores.

**Architecture:** Vertical Next.js 15 autónoma bajo `apps/rrhh` (Root Directory propio en Vercel), espejo del patrón de `apps/ialimp`. Multi-tenant por `empresa_id` con sesión JWT (`jose`). BD: **proyecto Supabase propio** (aislamiento RGPD), accedida con Prisma + `$queryRaw`. El responsable entra con email+contraseña; el empleado, con enlace mágico (token) + PIN.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma + Supabase (Postgres), `jose` (JWT), `bcryptjs`, Tailwind. Espejo de `apps/ialimp`.

**Decomposición de la Fase 1 (este plan = pieza 1 de 4):**
1. **Cimiento** (este documento): scaffold + BD + auth + empleados.
2. `module-documental` + expediente con carpetas y subida bidireccional (plan aparte).
3. `module-chat` (extracción de ialimp + adopción) + chat en rrhh (plan aparte).
4. Notificaciones (push + email) + PWA (plan aparte).

**Convención de verificación:** cada slice termina con `npm run build` en verde dentro de `apps/rrhh` y el commit correspondiente. Donde hay lógica pura (helpers en `lib/`) se escribe test unitario primero (TDD); las rutas API y la UI se verifican con build + comprobación manual descrita.

---

## File Structure

A crear bajo `apps/rrhh/`:
- `package.json`, `tsconfig.json`, `next.config.ts`, `vercel.json`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `next-env.d.ts` — scaffold (espejo de `apps/ialimp`).
- `prisma/schema.prisma` — datasource + 3 modelos base (`empresas`, `usuarios_rrhh`, `empleados`).
- `prisma/migrations/0001_cimiento.sql` — DDL inicial (se aplica al proyecto Supabase propio).
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx` — shell.
- `app/login/page.tsx` — login del responsable.
- `app/e/[token]/page.tsx` — entrada del empleado por enlace mágico + PIN.
- `lib/prisma.ts` — singleton Prisma (espejo de ialimp).
- `lib/auth.ts` — emisión/verificación de JWT del responsable (`jose`), helpers bcrypt.
- `lib/tenant.ts` — lectura de sesión desde cookie en rutas server (`empresa_id`, `usuario_id`).
- `lib/empleado-auth.ts` — verificación de token+PIN del empleado, emisión de su cookie.
- `lib/empleados.ts` — lógica de dominio de empleados (generar token, normalizar, validar).
- `app/api/auth/login/route.ts` — POST login responsable.
- `app/api/auth/logout/route.ts` — POST logout responsable.
- `app/api/admin/empleados/route.ts` — GET lista / POST alta.
- `app/api/admin/empleados/[id]/route.ts` — PATCH editar / DELETE.
- `app/api/e/login/route.ts` — POST login empleado (token + PIN).
- `app/admin/empleados/page.tsx` + `EmpleadosClient.tsx` — panel de empleados del responsable.
- `lib/empleados.test.ts` — tests unitarios de la lógica pura.

Variables de entorno nuevas (Vercel, proyecto `rrhh`): `DATABASE_URL`, `DIRECT_URL` (Supabase propio), `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Task 0: Provisión del proyecto Supabase propio (manual, fuera de código)

**Acción de infraestructura — requiere confirmación de Alberto antes de ejecutarse (coste).**

- [ ] **Step 1: Crear proyecto Supabase `rrhh`**

Usar el MCP de Supabase (`create_project`) o el panel. Región EU. Anotar `project-ref`, `DATABASE_URL` (pooler, puerto 6543) y `DIRECT_URL` (puerto 5432), `anon key`, `service_role key`.

- [ ] **Step 2: Cargar las env vars en el proyecto Vercel `rrhh`**

`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, y `JWT_SECRET` (generar con `openssl rand -base64 32`).

> Hasta que exista el proyecto Vercel (Task 1, Step 7) las env se cargan al crearlo. En local, `apps/rrhh/.env.local` (gitignored) con los mismos valores para `npm run build`/`dev`.

---

## Task 1: Scaffold de `apps/rrhh`

**Files:**
- Create: `apps/rrhh/package.json`, `apps/rrhh/tsconfig.json`, `apps/rrhh/next.config.ts`, `apps/rrhh/vercel.json`, `apps/rrhh/postcss.config.mjs`, `apps/rrhh/tailwind.config.ts`, `apps/rrhh/.gitignore`, `apps/rrhh/app/globals.css`, `apps/rrhh/app/layout.tsx`, `apps/rrhh/app/page.tsx`

- [ ] **Step 1: `package.json`** (espejo reducido de `apps/ialimp/package.json`, sin deps que aún no usamos)

```json
{
  "name": "rrhh",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "@supabase/supabase-js": "^2.46.2",
    "bcryptjs": "^2.4.3",
    "jose": "^5.9.3",
    "next": "^15.5.18",
    "prisma": "^5.22.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10.4.20",
    "eslint": "^9",
    "eslint-config-next": "^16.2.6",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.1",
    "typescript": "^5",
    "vitest": "^2.1.0"
  },
  "installCommand": "npm install --legacy-peer-deps"
}
```

- [ ] **Step 2: `tsconfig.json`** (idéntico a `apps/ialimp/tsconfig.json`)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `next.config.ts`** (espejo; sin `transpilePackages` todavía — se añadirán al introducir `module-*` en planes posteriores)

```ts
import type { NextConfig } from "next"
import path from "path"

const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
```

- [ ] **Step 4: `vercel.json`** (sin pnpm; install npm legacy, como pauta la matriz)

```json
{
  "buildCommand": "prisma generate && next build",
  "installCommand": "npm install --legacy-peer-deps",
  "framework": "nextjs"
}
```

- [ ] **Step 5: Ficheros de estilo y `.gitignore`**

`apps/rrhh/postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```
`apps/rrhh/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss"
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
} satisfies Config
```
`apps/rrhh/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
`apps/rrhh/.gitignore`:
```
/node_modules
/.next
/.env*.local
next-env.d.ts
```

- [ ] **Step 6: Shell mínimo** (`app/layout.tsx`, `app/page.tsx`)

`apps/rrhh/app/layout.tsx`:
```tsx
import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "RR.HH. · Portal del Empleado" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es"><body>{children}</body></html>
  )
}
```
`apps/rrhh/app/page.tsx`:
```tsx
export default function Home() {
  return <main style={{ padding: 32 }}><h1>RR.HH.</h1><p>Portal del Empleado — casa de marcas.</p></main>
}
```

- [ ] **Step 7: Instalar y verificar build local**

Run: `cd apps/rrhh && npm install --legacy-peer-deps && npm run build`
Expected: `✓ Compiled` (la generación de Prisma fallará hasta Task 2; si bloquea, comentar `prisma generate` del build temporalmente y restaurar tras Task 2).

- [ ] **Step 8: Commit**

```bash
git add apps/rrhh
git commit -m "feat(rrhh): scaffold de la vertical apps/rrhh (Next 15, espejo de ialimp)"
```

---

## Task 2: Esquema Prisma y migración inicial

**Files:**
- Create: `apps/rrhh/prisma/schema.prisma`, `apps/rrhh/prisma/migrations/0001_cimiento.sql`

- [ ] **Step 1: `schema.prisma`** — datasource + 3 modelos base

```prisma
generator client { provider = "prisma-client-js" }

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model empresas {
  id           String   @id @default(uuid()) @db.Uuid
  nombre       String
  marca_logo   String?
  marca_color  String?
  creada_at    DateTime @default(now()) @db.Timestamptz(6)
  usuarios     usuarios_rrhh[]
  empleados    empleados[]
}

model usuarios_rrhh {
  id          String   @id @default(uuid()) @db.Uuid
  empresa_id  String   @db.Uuid
  email       String   @unique
  pass_hash   String
  nombre      String
  session_jti String?
  creada_at   DateTime @default(now()) @db.Timestamptz(6)
  empresa     empresas @relation(fields: [empresa_id], references: [id])
}

model empleados {
  id            String    @id @default(uuid()) @db.Uuid
  empresa_id    String    @db.Uuid
  nombre        String
  dni           String?
  email         String?
  telefono      String?
  puesto        String?
  fecha_alta    DateTime? @db.Date
  estado        String    @default("activo")
  acceso_token  String    @unique
  pin_hash      String?
  creada_at     DateTime  @default(now()) @db.Timestamptz(6)
  empresa       empresas  @relation(fields: [empresa_id], references: [id])
  @@index([empresa_id])
}
```

- [ ] **Step 2: `migrations/0001_cimiento.sql`** — DDL equivalente (se aplica al Supabase propio vía MCP `apply_migration` o `prisma migrate deploy`)

```sql
create extension if not exists "uuid-ossp";

create table empresas (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  marca_logo text,
  marca_color text,
  creada_at timestamptz not null default now()
);

create table usuarios_rrhh (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id),
  email text not null unique,
  pass_hash text not null,
  nombre text not null,
  session_jti text,
  creada_at timestamptz not null default now()
);

create table empleados (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  dni text,
  email text,
  telefono text,
  puesto text,
  fecha_alta date,
  estado text not null default 'activo',
  acceso_token text not null unique,
  pin_hash text,
  creada_at timestamptz not null default now()
);
create index empleados_empresa_idx on empleados(empresa_id);
```

- [ ] **Step 3: Aplicar la migración al Supabase propio**

Con MCP Supabase: `apply_migration(project_id, name="0001_cimiento", query=<contenido SQL>)`. Verificar con `list_tables` que aparecen `empresas`, `usuarios_rrhh`, `empleados`.

- [ ] **Step 4: Generar cliente y build**

Run: `cd apps/rrhh && npx prisma generate && npm run build`
Expected: build en verde (restaurar `prisma generate` en el build si se comentó en Task 1).

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/prisma
git commit -m "feat(rrhh): esquema Prisma y migración inicial (empresas, usuarios_rrhh, empleados)"
```

---

## Task 3: Helpers de Prisma y auth del responsable

**Files:**
- Create: `apps/rrhh/lib/prisma.ts`, `apps/rrhh/lib/auth.ts`, `apps/rrhh/lib/tenant.ts`

- [ ] **Step 1: `lib/prisma.ts`** (idéntico a `apps/ialimp/lib/prisma.ts`)

```ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error'] : [] })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 2: `lib/auth.ts`** — JWT del responsable + bcrypt

```ts
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado') })()
      : 'rrhh-dev-secret-change-in-prod')
)

export type Sesion = { usuario_id: string; empresa_id: string; jti: string }

export async function hashPassword(plain: string) { return bcrypt.hash(plain, 10) }
export async function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash) }

export async function firmarSesion(s: Omit<Sesion, 'jti'>): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID()
  const token = await new SignJWT({ empresa_id: s.empresa_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.usuario_id)
    .setJti(jti)
    .setExpirationTime('30d')
    .sign(secret)
  return { token, jti }
}

export async function verificarSesion(token: string): Promise<Sesion> {
  const { payload } = await jwtVerify(token, secret)
  return { usuario_id: String(payload.sub), empresa_id: String(payload.empresa_id), jti: String(payload.jti) }
}
```

- [ ] **Step 3: `lib/tenant.ts`** — leer sesión desde cookie en rutas server (sesión única por `jti`, fail-open ante error de BD, espejo de la lógica de `apps/ialimp/lib/tenant.ts`)

```ts
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verificarSesion, type Sesion } from '@/lib/auth'

export class AuthError extends Error { status = 401; constructor(m = 'No autenticado') { super(m); this.name = 'AuthError' } }

export async function getSesion(): Promise<Sesion> {
  const token = (await cookies()).get('rrhh_session')?.value
  if (!token) throw new AuthError()
  let s: Sesion
  try { s = await verificarSesion(token) } catch { throw new AuthError('Sesión inválida') }
  // sesión única: el jti debe coincidir con el de la BD (fail-open si no hay)
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT session_jti FROM usuarios_rrhh WHERE id = ${s.usuario_id}::uuid LIMIT 1`)
    const dbJti = rows[0]?.session_jti
    if (dbJti && dbJti !== s.jti) throw new AuthError('Sesión cerrada en otro dispositivo')
  } catch (e) { if (e instanceof AuthError) throw e }
  return s
}
```

- [ ] **Step 4: Build**

Run: `cd apps/rrhh && npm run build`
Expected: build en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/lib
git commit -m "feat(rrhh): helpers de prisma, auth JWT del responsable y lectura de sesión"
```

---

## Task 4: Lógica de dominio de empleados (TDD)

**Files:**
- Create: `apps/rrhh/lib/empleados.ts`, `apps/rrhh/lib/empleados.test.ts`
- Create: `apps/rrhh/vitest.config.ts`

- [ ] **Step 1: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 2: Escribir el test que falla** — `lib/empleados.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { generarAccesoToken, normalizarEmpleado } from '@/lib/empleados'

describe('empleados', () => {
  it('genera un token de acceso url-safe de >= 20 chars', () => {
    const t = generarAccesoToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(20)
    expect(generarAccesoToken()).not.toBe(t)
  })
  it('normaliza recortando espacios y vaciando opcionales en blanco', () => {
    const e = normalizarEmpleado({ nombre: '  Ana  ', dni: '', email: ' a@b.com ', telefono: '   ' })
    expect(e).toEqual({ nombre: 'Ana', dni: null, email: 'a@b.com', telefono: null })
  })
  it('lanza si el nombre queda vacío', () => {
    expect(() => normalizarEmpleado({ nombre: '   ' })).toThrow()
  })
})
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `cd apps/rrhh && npx vitest run lib/empleados.test.ts`
Expected: FAIL ("Cannot find module '@/lib/empleados'").

- [ ] **Step 4: Implementar `lib/empleados.ts`**

```ts
export function generarAccesoToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

type EntradaEmpleado = { nombre: string; dni?: string; email?: string; telefono?: string }
type EmpleadoNormalizado = { nombre: string; dni: string | null; email: string | null; telefono: string | null }

export function normalizarEmpleado(e: EntradaEmpleado): EmpleadoNormalizado {
  const limpia = (v?: string) => { const t = (v ?? '').trim(); return t.length ? t : null }
  const nombre = (e.nombre ?? '').trim()
  if (!nombre) throw new Error('El nombre es obligatorio')
  return { nombre, dni: limpia(e.dni), email: limpia(e.email), telefono: limpia(e.telefono) }
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `cd apps/rrhh && npx vitest run lib/empleados.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/rrhh/lib/empleados.ts apps/rrhh/lib/empleados.test.ts apps/rrhh/vitest.config.ts
git commit -m "feat(rrhh): lógica de dominio de empleados (token de acceso + normalización) con tests"
```

---

## Task 5: Rutas de auth del responsable

**Files:**
- Create: `apps/rrhh/app/api/auth/login/route.ts`, `apps/rrhh/app/api/auth/logout/route.ts`

- [ ] **Step 1: `app/api/auth/login/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, firmarSesion } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pass_hash FROM usuarios_rrhh WHERE email = ${String(email).toLowerCase()} LIMIT 1`)
  const u = rows[0]
  if (!u || !(await verifyPassword(password, u.pass_hash))) return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
  const { token, jti } = await firmarSesion({ usuario_id: u.id, empresa_id: u.empresa_id })
  await prisma.$executeRaw(Prisma.sql`UPDATE usuarios_rrhh SET session_jti = ${jti} WHERE id = ${u.id}::uuid`)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rrhh_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return res
}
```

- [ ] **Step 2: `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server'
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rrhh_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
```

- [ ] **Step 3: Build**

Run: `cd apps/rrhh && npm run build`
Expected: rutas `ƒ /api/auth/login` y `ƒ /api/auth/logout` en la salida; build verde.

- [ ] **Step 4: Verificación manual (con un usuario sembrado)**

Sembrar un responsable: por SQL en Supabase, `INSERT INTO empresas (nombre) VALUES ('Mariscos González') RETURNING id;` y luego `INSERT INTO usuarios_rrhh (empresa_id, email, pass_hash, nombre) VALUES ('<id>', 'pilar@maricosgonzalez.com', '<bcrypt de prueba>', 'Pilar');` (generar el hash con un script Node usando `hashPassword`). Con `npm run dev`, `curl -i -X POST localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"email":"pilar@maricosgonzalez.com","password":"<clave>"}'` → 200 + `Set-Cookie: rrhh_session=`.

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/app/api/auth
git commit -m "feat(rrhh): login/logout del responsable de RR.HH. (JWT + sesión única)"
```

---

## Task 6: API de empleados (alta/lista/editar/baja)

**Files:**
- Create: `apps/rrhh/app/api/admin/empleados/route.ts`, `apps/rrhh/app/api/admin/empleados/[id]/route.ts`

- [ ] **Step 1: `app/api/admin/empleados/route.ts`** — GET lista + POST alta (scoped por `empresa_id` de la sesión)

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { generarAccesoToken, normalizarEmpleado } from '@/lib/empleados'

export async function GET() {
  try {
    const { empresa_id } = await getSesion()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, dni, email, telefono, puesto, estado, acceso_token, creada_at
      FROM empleados WHERE empresa_id = ${empresa_id}::uuid ORDER BY nombre ASC`)
    return NextResponse.json({ empleados: rows })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => ({}))
    const n = normalizarEmpleado(body)
    const token = generarAccesoToken()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO empleados (empresa_id, nombre, dni, email, telefono, puesto, acceso_token)
      VALUES (${empresa_id}::uuid, ${n.nombre}, ${n.dni}, ${n.email}, ${n.telefono}, ${body.puesto ?? null}, ${token})
      RETURNING id, nombre, acceso_token`)
    return NextResponse.json({ empleado: rows[0] }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('obligatorio')) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
```

- [ ] **Step 2: `app/api/admin/empleados/[id]/route.ts`** — PATCH editar + DELETE (siempre acotado por `empresa_id`)

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { normalizarEmpleado } from '@/lib/empleados'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const n = normalizarEmpleado(body)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE empleados SET nombre=${n.nombre}, dni=${n.dni}, email=${n.email}, telefono=${n.telefono},
        puesto=${body.puesto ?? null}, estado=${body.estado ?? 'activo'}
      WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('obligatorio')) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    await prisma.$executeRaw(Prisma.sql`DELETE FROM empleados WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
```

- [ ] **Step 3: Build**

Run: `cd apps/rrhh && npm run build`
Expected: rutas `ƒ /api/admin/empleados` y `ƒ /api/admin/empleados/[id]`; build verde.

- [ ] **Step 4: Verificación manual**

Con la cookie de sesión del Task 5: `curl` POST a `/api/admin/empleados` con `{"nombre":"Juan Pérez","email":"juan@x.com"}` → 201 con `acceso_token`. GET → lista con Juan. Repetir sin cookie → 401.

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/app/api/admin/empleados
git commit -m "feat(rrhh): API de empleados (alta/lista/editar/baja) acotada por empresa"
```

---

## Task 7: Acceso del empleado (enlace mágico + PIN)

**Files:**
- Create: `apps/rrhh/lib/empleado-auth.ts`, `apps/rrhh/app/api/e/login/route.ts`

- [ ] **Step 1: `lib/empleado-auth.ts`** — cookie de empleado (JWT corto con `empleado_id` + `empresa_id`)

```ts
import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET no configurado') })() : 'rrhh-dev-secret-change-in-prod')
)

export type SesionEmpleado = { empleado_id: string; empresa_id: string }

export async function firmarSesionEmpleado(s: SesionEmpleado): Promise<string> {
  return new SignJWT({ empresa_id: s.empresa_id })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(s.empleado_id).setExpirationTime('7d').sign(secret)
}

export async function verificarSesionEmpleado(token: string): Promise<SesionEmpleado> {
  const { payload } = await jwtVerify(token, secret)
  return { empleado_id: String(payload.sub), empresa_id: String(payload.empresa_id) }
}
```

- [ ] **Step 2: `app/api/e/login/route.ts`** — valida `acceso_token` + PIN, emite cookie `rrhh_empleado`

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { firmarSesionEmpleado } from '@/lib/empleado-auth'

export async function POST(req: Request) {
  const { token, pin } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pin_hash FROM empleados WHERE acceso_token = ${String(token)} AND estado = 'activo' LIMIT 1`)
  const e = rows[0]
  if (!e) return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  if (e.pin_hash) {
    if (!pin || !(await bcrypt.compare(String(pin), e.pin_hash))) return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }
  const cookie = await firmarSesionEmpleado({ empleado_id: e.id, empresa_id: e.empresa_id })
  const res = NextResponse.json({ ok: true, necesita_pin: !!e.pin_hash })
  res.cookies.set('rrhh_empleado', cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  return res
}
```

- [ ] **Step 3: Build**

Run: `cd apps/rrhh && npm run build`
Expected: `ƒ /api/e/login`; build verde.

- [ ] **Step 4: Verificación manual**

Con el `acceso_token` de Juan (Task 6, empleado sin PIN aún): `curl` POST `/api/e/login` con `{"token":"<acceso_token>"}` → 200 + cookie `rrhh_empleado`. Token inexistente → 401.

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/lib/empleado-auth.ts apps/rrhh/app/api/e/login
git commit -m "feat(rrhh): acceso del empleado por enlace mágico + PIN (cookie propia)"
```

---

## Task 8: UI mínima — login responsable, panel de empleados, entrada empleado

**Files:**
- Create: `apps/rrhh/app/login/page.tsx`, `apps/rrhh/app/admin/empleados/page.tsx`, `apps/rrhh/app/admin/empleados/EmpleadosClient.tsx`, `apps/rrhh/app/e/[token]/page.tsx`

- [ ] **Step 1: `app/login/page.tsx`** — formulario que postea a `/api/auth/login` y redirige a `/admin/empleados`

```tsx
'use client'
import { useState } from 'react'
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('')
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (r.ok) location.href = '/admin/empleados'; else setErr((await r.json()).error ?? 'Error')
  }
  return (
    <main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
      <h1>RR.HH. · Acceso responsable</h1>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit">Entrar</button>
        {err && <p style={{ color: 'crimson' }}>{err}</p>}
      </form>
    </main>
  )
}
```

- [ ] **Step 2: `app/admin/empleados/page.tsx`** — server component que exige sesión y carga la lista

```tsx
import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import EmpleadosClient from './EmpleadosClient'

export default async function Page() {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const { empresa_id } = await getSesion()
  const empleados = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, email, puesto, estado, acceso_token FROM empleados WHERE empresa_id = ${empresa_id}::uuid ORDER BY nombre ASC`)
  return <EmpleadosClient inicial={JSON.parse(JSON.stringify(empleados))} />
}
```

- [ ] **Step 3: `app/admin/empleados/EmpleadosClient.tsx`** — lista + alta

```tsx
'use client'
import { useState } from 'react'
type E = { id: string; nombre: string; email: string | null; puesto: string | null; estado: string; acceso_token: string }
export default function EmpleadosClient({ inicial }: { inicial: E[] }) {
  const [lista, setLista] = useState<E[]>(inicial); const [nombre, setNombre] = useState(''); const [email, setEmail] = useState('')
  async function alta(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre, email }) })
    if (r.ok) { setNombre(''); setEmail(''); const g = await (await fetch('/api/admin/empleados')).json(); setLista(g.empleados) }
  }
  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: 16 }}>
      <h1>Empleados</h1>
      <form onSubmit={alta} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button type="submit">Añadir</button>
      </form>
      <ul>{lista.map(e => <li key={e.id}>{e.nombre} {e.email && `· ${e.email}`} <code>/e/{e.acceso_token}</code></li>)}</ul>
    </main>
  )
}
```

- [ ] **Step 4: `app/e/[token]/page.tsx`** — entrada del empleado: postea token (+PIN si lo pide)

```tsx
'use client'
import { use, useState } from 'react'
export default function EntradaEmpleado({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [pin, setPin] = useState(''); const [necesitaPin, setNecesitaPin] = useState(false); const [err, setErr] = useState('')
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/e/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, pin }) })
    const j = await r.json()
    if (r.ok) { setNecesitaPin(false); /* siguiente plan: redirigir a /e (expediente) */ alert('Acceso correcto') }
    else { if (j.necesita_pin) setNecesitaPin(true); setErr(j.error ?? 'Error') }
  }
  return (
    <main style={{ maxWidth: 320, margin: '64px auto', padding: 16 }}>
      <h1>Acceso empleado</h1>
      <form onSubmit={entrar} style={{ display: 'grid', gap: 8 }}>
        {necesitaPin && <input placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />}
        <button type="submit">Entrar</button>
        {err && <p style={{ color: 'crimson' }}>{err}</p>}
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Build + verificación manual**

Run: `cd apps/rrhh && npm run build`
Expected: rutas `/login`, `/admin/empleados`, `/e/[token]` presentes; build verde. Con `npm run dev`: entrar en `/login`, crear un empleado, ver su enlace `/e/<token>`, abrirlo y verificar acceso.

- [ ] **Step 6: Commit**

```bash
git add apps/rrhh/app/login apps/rrhh/app/admin apps/rrhh/app/e
git commit -m "feat(rrhh): UI mínima — login responsable, panel de empleados y entrada del empleado"
```

---

## Task 9: Proyecto Vercel + despliegue del cimiento

- [ ] **Step 1: Crear proyecto Vercel `rrhh`** con Root Directory `apps/rrhh`, install `npm install --legacy-peer-deps`. Cargar las env vars de Task 0. **NO** añadir `apps/` al `.vercelignore` de la raíz (regla de la matriz).

- [ ] **Step 2: Verificar preview verde**

Empujar la rama y comprobar que el deploy del proyecto `rrhh` compila (`✓ Compiled`). Los otros 4 proyectos no deben verse afectados (no hemos tocado `packages/*` ni sus apps).

- [ ] **Step 3: Commit (si hubo ajustes de config)**

```bash
git add apps/rrhh
git commit -m "chore(rrhh): configuración de despliegue Vercel (Root Directory apps/rrhh)"
```

---

## Self-Review

- **Cobertura del spec (Fase 1 cimiento):** scaffold vertical ✅ (T1), proyecto Supabase propio ✅ (T0/T2), auth responsable ✅ (T3/T5), acceso empleado por enlace+PIN ✅ (T7), empleados (alta/lista/editar/baja) acotados por `empresa_id` ✅ (T6), UI mínima ✅ (T8), Vercel propio ✅ (T9). El **expediente con carpetas + subida bidireccional** (parte de la Fase 1 en el spec) se aborda en el **plan de `module-documental`** porque depende de ese módulo; queda fuera de este cimiento a propósito. Notificaciones y chat → sus propios planes.
- **Placeholders:** sin TODOs; cada paso lleva código o comando concreto. La redirección del empleado a su expediente queda marcada como gancho al siguiente plan (no es un placeholder de este alcance).
- **Consistencia de tipos:** `Sesion`/`getSesion` (responsable) y `SesionEmpleado`/`verificarSesionEmpleado` (empleado) usados de forma consistente; `generarAccesoToken`/`normalizarEmpleado` con la misma firma en tests, API y UI; cookie `rrhh_session` (responsable) y `rrhh_empleado` (empleado) sin solaparse.

## Notas de seguridad/RGPD aplicadas en este cimiento
- Todas las consultas de empleados van **acotadas por `empresa_id`** de la sesión (multi-tenant).
- Sesión única por `jti` para el responsable.
- Cookies `httpOnly`, `secure`, `sameSite=lax`.
- Aún no se tratan datos de salud (eso entra con el documental/`partes_medicos`): la EIPD y el contrato de encargo (art. 28) se abordan antes de ese plan.
