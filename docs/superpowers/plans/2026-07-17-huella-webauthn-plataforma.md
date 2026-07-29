# Login con huella (WebAuthn/passkey) en plataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir entrar en `apps/plataforma` con la huella/Face ID del dispositivo (WebAuthn/passkey) como atajo, manteniendo email+contraseña como respaldo.

**Architecture:** Se añade WebAuthn encima del login actual (cookie `plataforma_session`, JWT HS256). La lógica pura vive en `lib/webauthn.ts` (testeable con `node --test`), los wrappers de la librería en `lib/webauthn-ceremony.ts`, y el acceso a datos en `lib/webauthn-store.ts` (Prisma `$queryRaw` sobre una tabla nueva `webauthn_credentials`). Cuatro endpoints (register/options+verify, login/options+verify) y dos toques de UI (botón "Entrar con huella" en `/login`, botón "Activar huella" en una página `/seguridad`). Passkeys **descubribles** (residentKey required) → login sin escribir email.

**Tech Stack:** Next.js 15 (App Router) · React 19 · Prisma 5 (`$queryRaw`) · `@simplewebauthn/server` + `@simplewebauthn/browser` v13 · Supabase Postgres compartida.

**Spec:** `docs/superpowers/specs/2026-07-17-huella-webauthn-plataforma-design.md`

**Nota de verificación real:** WebAuthn exige HTTPS + sensor físico. El flujo completo (activar + entrar) se prueba a mano en un despliegue de Vercel, no en local. Todo lo automatizable (`node --test`, `tsc`, `next build`) se corre en cada tarea.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `apps/plataforma/package.json` | +2 deps `@simplewebauthn/*` |
| `apps/plataforma/prisma/sql/2026-07-17_webauthn_credentials.sql` | Tabla `webauthn_credentials` (aplicar por Supabase MCP) |
| `apps/plataforma/lib/webauthn.ts` | Helpers PUROS: rpID/origin, etiqueta de dispositivo, base64, nombres de cookie |
| `apps/plataforma/lib/webauthn.test.ts` | Tests `node --test` de los helpers puros |
| `apps/plataforma/lib/webauthn-ceremony.ts` | Wrappers de `@simplewebauthn/server` (generar/verificar) |
| `apps/plataforma/lib/webauthn-store.ts` | CRUD de credenciales (`$queryRaw`, scoped `cuenta_id`) |
| `apps/plataforma/app/api/auth/webauthn/register/options/route.ts` | Opciones de registro (sesión requerida) |
| `apps/plataforma/app/api/auth/webauthn/register/verify/route.ts` | Verifica y guarda la credencial |
| `apps/plataforma/app/api/auth/webauthn/login/options/route.ts` | Opciones de autenticación |
| `apps/plataforma/app/api/auth/webauthn/login/verify/route.ts` | Verifica y emite `plataforma_session` |
| `apps/plataforma/app/login/page.tsx` | +Botón "Entrar con huella" |
| `apps/plataforma/app/(usuario)/seguridad/page.tsx` | Página server (cuenta credenciales) |
| `apps/plataforma/app/(usuario)/seguridad/SeguridadClient.tsx` | Botón "Activar huella" |
| `apps/plataforma/app/(usuario)/UserSidebar.tsx` | +Entrada de nav "🔒 Seguridad" |

Todos los comandos se ejecutan desde `apps/plataforma/` salvo que se indique otra cosa.

---

## Task 1: Instalar dependencias

**Files:**
- Modify: `apps/plataforma/package.json`

- [ ] **Step 1: Instalar las dos librerías en el workspace de plataforma**

Run (desde `apps/plataforma/`):
```bash
npx --yes pnpm@10.33.0 add @simplewebauthn/server@^13.1.0 @simplewebauthn/browser@^13.1.0
```
Expected: `package.json` gana ambas deps y el lockfile se actualiza.

- [ ] **Step 2: Verificar que quedaron declaradas**

Run:
```bash
grep -nE "@simplewebauthn/(server|browser)" package.json
```
Expected: dos líneas, ambas `^13.1.0`.

- [ ] **Step 3: Commit**

```bash
git add package.json ../../pnpm-lock.yaml
git commit -m "feat(plataforma): añade deps @simplewebauthn para login con huella"
```

---

## Task 2: Migración de la tabla `webauthn_credentials`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-17_webauthn_credentials.sql`

- [ ] **Step 1: Escribir el SQL de la migración**

Crear `apps/plataforma/prisma/sql/2026-07-17_webauthn_credentials.sql`:
```sql
-- Credenciales WebAuthn/passkey por cuenta (login con huella, enfoque ATAJO).
-- La huella NUNCA llega aquí: solo se guarda la clave pública + metadatos de la credencial.
-- BD compartida (misma Supabase que sivra/ialimp). Scope por cuenta_id (multi-tenant).
-- Aplicar por Supabase MCP como `postgres` (como el resto de migraciones del repo).

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,          -- id de la credencial (base64url)
  public_key    text NOT NULL,                 -- clave pública COSE en base64
  counter       bigint NOT NULL DEFAULT 0,     -- contador anti-clonado
  transports    text[] NOT NULL DEFAULT '{}',  -- ej. {internal,hybrid}
  device_name   text NOT NULL DEFAULT 'Dispositivo',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_webauthn_cred_cuenta ON webauthn_credentials (cuenta_id);

-- Datos de seguridad de la cuenta: fuera del alcance de los roles públicos de Supabase.
REVOKE ALL ON webauthn_credentials FROM anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar el contenido del fichero con la tool `mcp__Supabase__apply_migration` (proyecto de la BD compartida `wswbehlcuxqxyinousql`), name `2026-07-17_webauthn_credentials`.
Expected: ejecución sin error.

- [ ] **Step 3: Verificar que la tabla existe**

Con `mcp__Supabase__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'webauthn_credentials' ORDER BY ordinal_position;
```
Expected: `id, cuenta_id, credential_id, public_key, counter, transports, device_name, created_at, last_used_at`.

- [ ] **Step 4: Commit**

```bash
git add prisma/sql/2026-07-17_webauthn_credentials.sql
git commit -m "feat(plataforma): migración webauthn_credentials"
```

---

## Task 3: Helpers puros `lib/webauthn.ts` (TDD)

**Files:**
- Create: `apps/plataforma/lib/webauthn.ts`
- Test: `apps/plataforma/lib/webauthn.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/plataforma/lib/webauthn.test.ts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rpConfigFromHost, deviceLabelFromUA, b64FromBytes, bytesFromB64 } from './webauthn.ts'

test('rpConfigFromHost usa env si está presente', () => {
  const r = rpConfigFromHost('loquesea', { rpId: 'x.com', origin: 'https://x.com' })
  assert.deepEqual(r, { rpID: 'x.com', origin: 'https://x.com' })
})

test('rpConfigFromHost deriva https en producción', () => {
  const r = rpConfigFromHost('plataforma-ten-flame.vercel.app')
  assert.equal(r.rpID, 'plataforma-ten-flame.vercel.app')
  assert.equal(r.origin, 'https://plataforma-ten-flame.vercel.app')
})

test('rpConfigFromHost deriva http en localhost', () => {
  const r = rpConfigFromHost('localhost:3000')
  assert.equal(r.rpID, 'localhost')
  assert.equal(r.origin, 'http://localhost:3000')
})

test('deviceLabelFromUA reconoce iPhone', () => {
  assert.equal(deviceLabelFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'iPhone')
})

test('deviceLabelFromUA cae a Dispositivo con UA vacío', () => {
  assert.equal(deviceLabelFromUA(''), 'Dispositivo')
})

test('b64 roundtrip conserva los bytes', () => {
  const bytes = new Uint8Array([1, 2, 3, 250, 255])
  assert.deepEqual(bytesFromB64(b64FromBytes(bytes)), bytes)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run:
```bash
node --test lib/webauthn.test.ts
```
Expected: FAIL — no se resuelve `./webauthn.ts` (módulo aún no existe).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `apps/plataforma/lib/webauthn.ts`:
```ts
// Helpers PUROS de WebAuthn (sin Prisma ni `@/`). Runner de tests: `node --test`.

export const CHAL_REG_COOKIE = 'webauthn_chal_reg'
export const CHAL_AUTH_COOKIE = 'webauthn_chal_auth'

/**
 * Resuelve el rpID (dominio) y el origin esperados por WebAuthn.
 * Prioriza las envs WEBAUTHN_RP_ID/WEBAUTHN_ORIGIN (estables en prod);
 * si no, los deriva del host de la petición (útil en local/preview).
 */
export function rpConfigFromHost(
  host: string,
  env?: { rpId?: string; origin?: string },
): { rpID: string; origin: string } {
  if (env?.rpId && env?.origin) return { rpID: env.rpId, origin: env.origin }
  const h = (host || 'localhost').trim()
  const hostname = h.split(':')[0]
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const scheme = isLocal ? 'http' : 'https'
  return { rpID: hostname, origin: `${scheme}://${h}` }
}

/** Etiqueta legible del dispositivo a partir del User-Agent. */
export function deviceLabelFromUA(ua: string): string {
  const s = (ua || '').toLowerCase()
  if (s.includes('iphone')) return 'iPhone'
  if (s.includes('ipad')) return 'iPad'
  if (s.includes('android')) return 'Android'
  if (s.includes('mac os') || s.includes('macintosh')) return 'Mac'
  if (s.includes('windows')) return 'Windows'
  return 'Dispositivo'
}

export function b64FromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function bytesFromB64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run:
```bash
node --test lib/webauthn.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/webauthn.ts lib/webauthn.test.ts
git commit -m "feat(plataforma): helpers puros de WebAuthn + tests"
```

---

## Task 4: Acceso a datos `lib/webauthn-store.ts`

**Files:**
- Create: `apps/plataforma/lib/webauthn-store.ts`

- [ ] **Step 1: Escribir el store**

Crear `apps/plataforma/lib/webauthn-store.ts`:
```ts
import { prisma } from '@/lib/db'

export type StoredCredential = {
  cuentaId: string
  credentialId: string
  publicKeyB64: string
  counter: number
  transports: string[]
}

/** IDs de credenciales ya registradas por la cuenta (para excludeCredentials). */
export async function listCredentialIds(cuentaId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ credential_id: string }[]>`
    SELECT credential_id FROM webauthn_credentials WHERE cuenta_id = ${cuentaId}::uuid
  `
  return rows.map((r) => r.credential_id)
}

export async function countCredentials(cuentaId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM webauthn_credentials WHERE cuenta_id = ${cuentaId}::uuid
  `
  return Number(rows[0]?.n ?? 0)
}

export async function saveCredential(params: {
  cuentaId: string
  credentialId: string
  publicKeyB64: string
  counter: number
  transports: string[]
  deviceName: string
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO webauthn_credentials
      (cuenta_id, credential_id, public_key, counter, transports, device_name)
    VALUES
      (${params.cuentaId}::uuid, ${params.credentialId}, ${params.publicKeyB64},
       ${params.counter}, ${params.transports}, ${params.deviceName})
    ON CONFLICT (credential_id) DO NOTHING
  `
}

export async function findByCredentialId(credentialId: string): Promise<StoredCredential | null> {
  const rows = await prisma.$queryRaw<{
    cuenta_id: string
    credential_id: string
    public_key: string
    counter: number
    transports: string[] | null
  }[]>`
    SELECT cuenta_id, credential_id, public_key, counter, transports
    FROM webauthn_credentials WHERE credential_id = ${credentialId} LIMIT 1
  `
  const r = rows[0]
  if (!r) return null
  return {
    cuentaId: r.cuenta_id,
    credentialId: r.credential_id,
    publicKeyB64: r.public_key,
    counter: Number(r.counter),
    transports: r.transports ?? [],
  }
}

export async function updateCounter(credentialId: string, newCounter: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE webauthn_credentials
    SET counter = ${newCounter}, last_used_at = now()
    WHERE credential_id = ${credentialId}
  `
}
```

- [ ] **Step 2: Comprobar que compila**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores nuevos en `lib/webauthn-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/webauthn-store.ts
git commit -m "feat(plataforma): store de credenciales WebAuthn (scoped cuenta_id)"
```

---

## Task 5: Wrappers de ceremonia `lib/webauthn-ceremony.ts`

**Files:**
- Create: `apps/plataforma/lib/webauthn-ceremony.ts`

- [ ] **Step 1: Escribir los wrappers**

Crear `apps/plataforma/lib/webauthn-ceremony.ts`:
```ts
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import { b64FromBytes, bytesFromB64 } from './webauthn'

const RP_NAME = 'plataforma'

export async function buildRegistrationOptions(params: {
  rpID: string
  cuentaId: string
  email: string
  nombre: string
  excludeIds: string[]
}) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: params.rpID,
    userID: new TextEncoder().encode(params.cuentaId),
    userName: params.email,
    userDisplayName: params.nombre,
    attestationType: 'none',
    excludeCredentials: params.excludeIds.map((id) => ({ id })),
    authenticatorSelection: {
      residentKey: 'required',      // credencial DESCUBRIBLE → login sin escribir email
      userVerification: 'preferred',
    },
  })
}

export type RegOk = {
  ok: true
  credentialId: string
  publicKeyB64: string
  counter: number
  transports: string[]
}

export async function checkRegistration(params: {
  response: unknown
  expectedChallenge: string
  origin: string
  rpID: string
}): Promise<RegOk | { ok: false }> {
  let v: VerifiedRegistrationResponse
  try {
    v = await verifyRegistrationResponse({
      response: params.response as never,
      expectedChallenge: params.expectedChallenge,
      expectedOrigin: params.origin,
      expectedRPID: params.rpID,
      requireUserVerification: false,
    })
  } catch {
    return { ok: false }
  }
  if (!v.verified || !v.registrationInfo) return { ok: false }
  const c = v.registrationInfo.credential
  return {
    ok: true,
    credentialId: c.id,
    publicKeyB64: b64FromBytes(c.publicKey),
    counter: c.counter,
    transports: (c.transports ?? []) as string[],
  }
}

export async function buildAuthenticationOptions(rpID: string) {
  return generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
}

export async function checkAuthentication(params: {
  response: unknown
  expectedChallenge: string
  origin: string
  rpID: string
  credentialId: string
  publicKeyB64: string
  counter: number
  transports: string[]
}): Promise<{ ok: true; newCounter: number } | { ok: false }> {
  let v: VerifiedAuthenticationResponse
  try {
    v = await verifyAuthenticationResponse({
      response: params.response as never,
      expectedChallenge: params.expectedChallenge,
      expectedOrigin: params.origin,
      expectedRPID: params.rpID,
      requireUserVerification: false,
      credential: {
        id: params.credentialId,
        publicKey: bytesFromB64(params.publicKeyB64),
        counter: params.counter,
        transports: params.transports as never,
      },
    })
  } catch {
    return { ok: false }
  }
  if (!v.verified) return { ok: false }
  return { ok: true, newCounter: v.authenticationInfo.newCounter }
}
```

- [ ] **Step 2: Comprobar que compila**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores. (Si los nombres de campo de la v13 difieren —p.ej. `registrationInfo.credential`—, ajústalos según los tipos instalados en `node_modules/@simplewebauthn/server`; la forma esperada es la de la v13.)

- [ ] **Step 3: Commit**

```bash
git add lib/webauthn-ceremony.ts
git commit -m "feat(plataforma): wrappers de ceremonia WebAuthn (@simplewebauthn)"
```

---

## Task 6: Endpoints de registro (activar huella)

**Files:**
- Create: `apps/plataforma/app/api/auth/webauthn/register/options/route.ts`
- Create: `apps/plataforma/app/api/auth/webauthn/register/verify/route.ts`

- [ ] **Step 1: Endpoint de opciones de registro**

Crear `apps/plataforma/app/api/auth/webauthn/register/options/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { rpConfigFromHost, CHAL_REG_COOKIE } from '@/lib/webauthn'
import { buildRegistrationOptions } from '@/lib/webauthn-ceremony'
import { listCredentialIds } from '@/lib/webauthn-store'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { rpID } = rpConfigFromHost(req.headers.get('host') || '', {
    rpId: process.env.WEBAUTHN_RP_ID,
    origin: process.env.WEBAUTHN_ORIGIN,
  })
  const excludeIds = await listCredentialIds(session.id)
  const options = await buildRegistrationOptions({
    rpID,
    cuentaId: session.id,
    email: session.email,
    nombre: session.nombre,
    excludeIds,
  })

  const res = NextResponse.json(options)
  res.cookies.set(CHAL_REG_COOKIE, options.challenge, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 120,
  })
  return res
}
```

- [ ] **Step 2: Endpoint de verificación de registro**

Crear `apps/plataforma/app/api/auth/webauthn/register/verify/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { rpConfigFromHost, CHAL_REG_COOKIE, deviceLabelFromUA } from '@/lib/webauthn'
import { checkRegistration } from '@/lib/webauthn-ceremony'
import { saveCredential } from '@/lib/webauthn-store'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const expectedChallenge = req.cookies.get(CHAL_REG_COOKIE)?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'Challenge caducado' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { rpID, origin } = rpConfigFromHost(req.headers.get('host') || '', {
    rpId: process.env.WEBAUTHN_RP_ID,
    origin: process.env.WEBAUTHN_ORIGIN,
  })
  const result = await checkRegistration({ response: body, expectedChallenge, origin, rpID })
  if (!result.ok) {
    const bad = NextResponse.json({ error: 'No se pudo verificar la huella' }, { status: 400 })
    bad.cookies.set(CHAL_REG_COOKIE, '', { path: '/', maxAge: 0 })
    return bad
  }

  await saveCredential({
    cuentaId: session.id,
    credentialId: result.credentialId,
    publicKeyB64: result.publicKeyB64,
    counter: result.counter,
    transports: result.transports,
    deviceName: deviceLabelFromUA(req.headers.get('user-agent') || ''),
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(CHAL_REG_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
```

- [ ] **Step 3: Comprobar que compila**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/webauthn/register
git commit -m "feat(plataforma): endpoints WebAuthn de registro (activar huella)"
```

---

## Task 7: Endpoints de login (entrar con huella)

**Files:**
- Create: `apps/plataforma/app/api/auth/webauthn/login/options/route.ts`
- Create: `apps/plataforma/app/api/auth/webauthn/login/verify/route.ts`

- [ ] **Step 1: Endpoint de opciones de autenticación**

Crear `apps/plataforma/app/api/auth/webauthn/login/options/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { rpConfigFromHost, CHAL_AUTH_COOKIE } from '@/lib/webauthn'
import { buildAuthenticationOptions } from '@/lib/webauthn-ceremony'

export async function POST(req: NextRequest) {
  const { rpID } = rpConfigFromHost(req.headers.get('host') || '', {
    rpId: process.env.WEBAUTHN_RP_ID,
    origin: process.env.WEBAUTHN_ORIGIN,
  })
  const options = await buildAuthenticationOptions(rpID)
  const res = NextResponse.json(options)
  res.cookies.set(CHAL_AUTH_COOKIE, options.challenge, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 120,
  })
  return res
}
```

- [ ] **Step 2: Endpoint de verificación de login (emite la sesión)**

Crear `apps/plataforma/app/api/auth/webauthn/login/verify/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'
import {
  findActiveAdminByEmail, createAdminToken, ADMIN_COOKIE, ADMIN_COOKIE_OPTS,
} from '@/lib/superadmin'
import { rpConfigFromHost, CHAL_AUTH_COOKIE } from '@/lib/webauthn'
import { checkAuthentication } from '@/lib/webauthn-ceremony'
import { findByCredentialId, updateCounter } from '@/lib/webauthn-store'

export async function POST(req: NextRequest) {
  const expectedChallenge = req.cookies.get(CHAL_AUTH_COOKIE)?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'Challenge caducado' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const cred = await findByCredentialId(body.id)
  if (!cred) return NextResponse.json({ error: 'Huella no reconocida' }, { status: 401 })

  const { rpID, origin } = rpConfigFromHost(req.headers.get('host') || '', {
    rpId: process.env.WEBAUTHN_RP_ID,
    origin: process.env.WEBAUTHN_ORIGIN,
  })
  const result = await checkAuthentication({
    response: body,
    expectedChallenge,
    origin,
    rpID,
    credentialId: cred.credentialId,
    publicKeyB64: cred.publicKeyB64,
    counter: cred.counter,
    transports: cred.transports,
  })
  if (!result.ok) {
    const bad = NextResponse.json({ error: 'No se pudo verificar la huella' }, { status: 401 })
    bad.cookies.set(CHAL_AUTH_COOKIE, '', { path: '/', maxAge: 0 })
    return bad
  }

  await updateCounter(cred.credentialId, result.newCounter)

  const cuenta = await prisma.cuenta.findFirst({
    where: { id: cred.cuentaId },
    select: { id: true, nombre: true, email: true },
  })
  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 401 })

  const { token, jti } = await createSessionToken(cuenta.id, cuenta.email)
  await prisma.cuenta.update({ where: { id: cuenta.id }, data: { sessionJti: jti } })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  res.cookies.set(CHAL_AUTH_COOKIE, '', { path: '/', maxAge: 0 })

  // Si el email es superadmin activo, emite también la cookie de operador (igual que /api/auth/login).
  const sa = await findActiveAdminByEmail(cuenta.email)
  if (sa) res.cookies.set(ADMIN_COOKIE, await createAdminToken(sa.id, sa.email, sa.rol), ADMIN_COOKIE_OPTS)

  return res
}
```

- [ ] **Step 3: Comprobar que compila**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/webauthn/login
git commit -m "feat(plataforma): endpoints WebAuthn de login (entrar con huella)"
```

---

## Task 8: Botón "Entrar con huella" en `/login`

**Files:**
- Modify: `apps/plataforma/app/login/page.tsx`

- [ ] **Step 1: Añadir imports de React y del browser SDK**

En `apps/plataforma/app/login/page.tsx`, línea 2, sustituir:
```tsx
import { useState, FormEvent } from 'react'
```
por:
```tsx
import { useState, useEffect, FormEvent } from 'react'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
```

- [ ] **Step 2: Añadir estado y handler de huella**

En el cuerpo de `LoginPage`, justo después de la línea `const [loading, setLoading] = useState(false)`, insertar:
```tsx
  const [webauthnOk, setWebauthnOk] = useState(false)
  useEffect(() => { setWebauthnOk(browserSupportsWebAuthn()) }, [])

  async function loginHuella() {
    setError('')
    setLoading(true)
    try {
      const optRes = await fetch('/api/auth/webauthn/login/options', { method: 'POST' })
      if (!optRes.ok) throw new Error('options')
      const optionsJSON = await optRes.json()
      const asseResp = await startAuthentication({ optionsJSON })
      const verRes = await fetch('/api/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asseResp),
      })
      if (verRes.ok) {
        router.push('/banca')
      } else {
        const data = await verRes.json().catch(() => ({}))
        setError(data.error || 'No se pudo entrar con huella')
        setLoading(false)
      }
    } catch {
      setError('Se canceló la huella')
      setLoading(false)
    }
  }
```

- [ ] **Step 3: Renderizar el botón encima del formulario**

En el JSX, localizar la línea `<form onSubmit={submit}` e insertar JUSTO ANTES:
```tsx
        {webauthnOk && (
          <>
            <button
              type="button"
              onClick={loginHuella}
              disabled={loading}
              style={{
                width: '100%', minHeight: '44px', marginBottom: '16px',
                borderRadius: '8px', border: '1px solid var(--primary)',
                background: 'transparent', color: 'var(--primary)',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              🔑 Entrar con huella
            </button>
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', marginBottom: '8px' }}>
              o con tu contraseña
            </div>
          </>
        )}
```

- [ ] **Step 4: Comprobar que compila y construye**

Run:
```bash
npx tsc --noEmit && npx --yes pnpm@10.33.0 exec next build
```
Expected: `tsc` sin errores; `next build` termina con exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat(plataforma): botón 'Entrar con huella' en /login"
```

---

## Task 9: Página `/seguridad` con "Activar huella"

**Files:**
- Create: `apps/plataforma/app/(usuario)/seguridad/page.tsx`
- Create: `apps/plataforma/app/(usuario)/seguridad/SeguridadClient.tsx`
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx`

- [ ] **Step 1: Página server (protegida por el layout `(usuario)`)**

Crear `apps/plataforma/app/(usuario)/seguridad/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { countCredentials } from '@/lib/webauthn-store'
import SeguridadClient from './SeguridadClient'

export default async function SeguridadPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const registradas = await countCredentials(session.id)
  return <SeguridadClient registradas={registradas} />
}
```

- [ ] **Step 2: Componente cliente con el botón**

Crear `apps/plataforma/app/(usuario)/seguridad/SeguridadClient.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'

export default function SeguridadClient({ registradas }: { registradas: number }) {
  const [ok, setOk] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(registradas)

  useEffect(() => { setOk(browserSupportsWebAuthn()) }, [])

  async function activar() {
    setMsg('')
    setBusy(true)
    try {
      const optRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST' })
      if (!optRes.ok) throw new Error('options')
      const optionsJSON = await optRes.json()
      const attResp = await startRegistration({ optionsJSON })
      const verRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      })
      if (verRes.ok) {
        setMsg('✅ Huella activada en este dispositivo')
        setCount((c) => c + 1)
      } else {
        const data = await verRes.json().catch(() => ({}))
        setMsg(data.error || 'No se pudo activar')
      }
    } catch {
      setMsg('Se canceló la activación')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '560px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>🔒 Seguridad</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '20px' }}>
        Entra en el panel con la huella / Face ID de este dispositivo, sin escribir la contraseña.
        La contraseña sigue funcionando como respaldo.
      </p>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px',
      }}>
        <p style={{ marginBottom: '12px' }}>
          Dispositivos con huella: <strong>{count}</strong>
        </p>
        {ok ? (
          <button
            onClick={activar}
            disabled={busy}
            style={{
              minHeight: '44px', padding: '0 20px', borderRadius: '8px', border: 'none',
              background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {busy ? 'Activando…' : '🔑 Activar huella en este dispositivo'}
          </button>
        ) : (
          <p style={{ color: 'var(--muted)' }}>Este navegador no admite huella.</p>
        )}
        {msg && <p style={{ marginTop: '12px' }}>{msg}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Añadir la entrada de nav**

En `apps/plataforma/app/(usuario)/UserSidebar.tsx`, dentro de `NAV_NEGOCIO`, añadir tras la línea de Concursos (`{ href: '/concursos', icon: '🏛️', label: 'Concursos' },`):
```tsx
  { href: '/seguridad', icon: '🔒', label: 'Seguridad' },
```

- [ ] **Step 4: Comprobar que compila y construye**

Run:
```bash
npx tsc --noEmit && npx --yes pnpm@10.33.0 exec next build
```
Expected: `tsc` sin errores; `next build` exit 0; la ruta `/seguridad` aparece en el listado de rutas.

- [ ] **Step 5: Commit**

```bash
git add "app/(usuario)/seguridad" "app/(usuario)/UserSidebar.tsx"
git commit -m "feat(plataforma): página /seguridad para activar la huella + nav"
```

---

## Task 10: Envs de producción + verificación real (acción de Alberto)

**Files:** ninguno (configuración en Vercel).

- [ ] **Step 1: Definir las envs estables en el proyecto Vercel `plataforma`**

En Vercel → proyecto `plataforma` → Settings → Environment Variables (Production), añadir:
- `WEBAUTHN_RP_ID` = `plataforma-ten-flame.vercel.app`
- `WEBAUTHN_ORIGIN` = `https://plataforma-ten-flame.vercel.app`

(Sin estas envs el sistema deriva rpID/origin del host de cada petición; funciona, pero fijarlas evita sorpresas entre preview y prod.)

- [ ] **Step 2: Desplegar y probar el flujo completo en el móvil**

1. Merge de la rama → despliegue de producción.
2. En el móvil: entrar con email+contraseña → ir a **🔒 Seguridad** → **Activar huella** → confirmar con el sensor.
3. Cerrar sesión → en `/login` pulsar **Entrar con huella** → confirmar con el sensor → debe entrar al panel.
4. Confirmar la fila creada:
```sql
SELECT cuenta_id, device_name, counter, created_at, last_used_at
FROM webauthn_credentials ORDER BY created_at DESC LIMIT 5;
```
Expected: una fila con `device_name` del móvil y `last_used_at` actualizado tras el login.

---

## Verificación final (antes de dar por cerrada la prueba)

- [ ] `node --test lib/webauthn.test.ts` → PASS.
- [ ] `npx tsc --noEmit` → sin errores.
- [ ] `npx --yes pnpm@10.33.0 exec next build` → exit 0.
- [ ] Flujo activar+entrar probado en un dispositivo real (Task 10).
- [ ] Anotar la prueba en `docs/CONTEXTO-SESIONES.md` (memoria entre sesiones del repo).
```
