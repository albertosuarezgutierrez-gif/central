# Directorio de contactos por compañía: de UNO a VARIOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar `seguros.companias_dgs` de un contacto único por compañía a varios (tabla nueva `compania_contactos`, con área cerrada, orden y marca de último contacto), y actualizar el puerto + la UI de plataforma para listarlos y accionarlos (WhatsApp/mail).

**Architecture:** Tabla nueva en el schema `seguros` (referencia compartida, sin `correduria_id`, como `companias_dgs` hoy). Reglas puras en `@central/module-seguros`. El puerto `apps/asegura` expone `contactos: Contacto[]` por compañía y un `PATCH` para marcar contactado. `apps/plataforma` lee por el mismo patrón de dos capas (interpretación pura + red) ya usado en `companias-asegura.ts`, y las dos pantallas existentes (`Companias.tsx`, `/correduria/companias`) pasan de pintar un contacto a listar varios con botones de WhatsApp/mail.

**Tech Stack:** Next.js 15 / Prisma 5 (apps/asegura, schema `seguros` vía `?schema=seguros`) · TypeScript puro en `packages/module-seguros` (sin build, importado como `.ts` directo) · `node --test` para las pruebas puras.

---

## Antes de empezar

Spec aprobada: `docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md`. Léela si hace falta contexto de por qué (migración, aislamiento, qué queda fuera).

Reinicia la rama de trabajo desde `origin/main` si la designada ya tiene el PR anterior mergeado (regla del harness: nunca apilar sobre historia ya fusionada).

```bash
git fetch origin main -q && git checkout -B claude/cima-ingesta-cuarentena-lc54uq origin/main -q
```

---

### Task 1: Migración SQL — tabla `compania_contactos` + migrar datos + retirar columnas viejas

**Files:**
- Create: `apps/asegura/prisma/sql/2026-09-13_seguros_compania_contactos.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Directorio de contactos por compañía: de UNO a VARIOS (13/09/2026).
-- Spec: docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md
--
-- Hasta hoy `companias_dgs` guardaba un solo contacto (contacto_nombre/cargo/
-- email/telefono). Una compañía tiene varios según el motivo (Occident:
-- Rodríguez López, Francisco es el contacto COMERCIAL, distinto del ya
-- cargado). Esta tabla sustituye a esas 4 columnas; NO toca clave_mediador
-- ni telefono_siniestros/telefono_asistencia/whatsapp_siniestros/
-- horario_siniestros, que son atributos de la COMPAÑÍA, no de una persona.
--
-- Referencia compartida, igual que companias_dgs: sin correduria_id, no pasa
-- por lib/tenant (ver spec, sección «Aislamiento»).
create type seguros.area_contacto as enum (
  'comercial',
  'siniestros',
  'administracion',
  'tecnico',
  'general'
);

create table seguros.compania_contactos (
  id                   uuid primary key default gen_random_uuid(),
  compania_codigo_dgs  varchar(16) not null references seguros.companias_dgs(codigo_dgs),
  nombre               text not null,
  cargo                text,
  area                 seguros.area_contacto,
  email                text,
  telefono             text,
  notas                text,
  orden                integer not null default 0,
  activo               boolean not null default true,
  ultimo_contacto_en   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table seguros.compania_contactos is 'Varios contactos por compañía (comercial/siniestros/...). area=NULL = no clasificado, no es "general". Sustituye a companias_dgs.contacto_*.';

create index compania_contactos_compania_activo_idx
  on seguros.compania_contactos (compania_codigo_dgs, activo);

-- Migra el contacto único existente como primer contacto (orden=0, area=NULL:
-- no estaba capturada antes, no se inventa).
insert into seguros.compania_contactos (compania_codigo_dgs, nombre, cargo, email, telefono, orden)
select codigo_dgs, contacto_nombre, contacto_cargo, contacto_email, contacto_telefono, 0
from seguros.companias_dgs
where contacto_nombre is not null;

alter table seguros.companias_dgs
  drop column contacto_nombre,
  drop column contacto_cargo,
  drop column contacto_email,
  drop column contacto_telefono;

grant select, insert, update, delete on seguros.compania_contactos to prisma_seguros;
grant select on seguros.compania_contactos to crm_seguros;
grant usage on type seguros.area_contacto to prisma_seguros;
```

- [ ] **Step 2: Verificar el recuento antes de aplicar (Supabase MCP, proyecto central `wswbehlcuxqxyinousql` — NUNCA el conector `Supabase_asegura`, que es el origen CONGELADO de Manuel)**

Ejecuta primero, de solo lectura, para tener el número con el que contrastar después:

```sql
select count(*) from seguros.companias_dgs where contacto_nombre is not null;
```

Anota el resultado (llámalo `N`).

- [ ] **Step 3: Aplicar la migración (Supabase MCP `apply_migration`, proyecto central)**

Nombre de migración: `seguros_compania_contactos`. Pega el SQL completo del Step 1.

- [ ] **Step 4: Verificar tras aplicar**

```sql
select count(*) from seguros.compania_contactos;
```

Debe coincidir exactamente con `N` del Step 2. Si no coincide, no continúes: revisa antes de seguir (posible fila con `contacto_nombre` vacío en vez de NULL, o un `codigo_dgs` huérfano).

- [ ] **Step 5: Commit**

```bash
git add apps/asegura/prisma/sql/2026-09-13_seguros_compania_contactos.sql
git commit -m "$(cat <<'EOF'
feat(asegura): tabla compania_contactos — varios contactos por compañía

Sustituye a las 4 columnas planas de companias_dgs (contacto_nombre/cargo/
email/telefono). Migra los contactos existentes como primer contacto
(orden=0) y retira las columnas viejas. clave_mediador y los teléfonos de
siniestros/asistencia se quedan en companias_dgs: son de la compañía, no
de una persona.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 2: Prisma schema — modelo `CompaniaContacto` + regenerar cliente

**Files:**
- Modify: `apps/asegura/prisma/asegura.prisma:567-593` (modelo `CompaniaDgs`)

- [ ] **Step 1: Quitar las 4 columnas viejas de `CompaniaDgs` y añadir la relación**

Reemplaza el bloque actual del modelo (líneas 586-590, los 4 campos `contactoNombre`/`contactoCargo`/`contactoEmail`/`contactoTelefono`) por:

```prisma
  claveMediador     String?   @map("clave_mediador")
  contactos         CompaniaContacto[]

  @@map("companias_dgs")
}

enum AreaContacto {
  comercial
  siniestros
  administracion
  tecnico
  general

  @@map("area_contacto")
}

model CompaniaContacto {
  id                  String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companiaCodigoDgs   String        @map("compania_codigo_dgs") @db.VarChar(16)
  compania            CompaniaDgs   @relation(fields: [companiaCodigoDgs], references: [codigoDgs])
  nombre              String
  cargo               String?
  area                AreaContacto?
  email               String?
  telefono            String?
  notas               String?
  orden               Int           @default(0)
  activo              Boolean       @default(true)
  ultimoContactoEn    DateTime?     @map("ultimo_contacto_en") @db.Timestamptz(6)
  createdAt           DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime      @default(now()) @map("updated_at") @db.Timestamptz(6)

  @@map("compania_contactos")
}
```

⚠️ El bloque de comentario justo antes de `model CompaniaDgs` (líneas 563-566) sigue siendo válido tal cual — no lo toques.

- [ ] **Step 2: Regenerar los DOS clientes Prisma**

```bash
cd apps/asegura && pnpm run prisma:generate
```

Confirma que termina sin error y que genera tanto `lib/generated/asegura-client` (el de `asegura.prisma`) como el cliente por defecto — el script del `package.json` ya hace los dos (lección del `CLAUDE.md`: generar solo uno deja el otro con `TS2307`).

- [ ] **Step 3: Typecheck**

```bash
cd apps/asegura && npx tsc --noEmit -p tsconfig.json
```

Debe salir limpio (el modelo aún no tiene consumidores nuevos, así que esto solo confirma que el schema compila).

- [ ] **Step 4: Commit**

```bash
git add apps/asegura/prisma/asegura.prisma
git commit -m "$(cat <<'EOF'
feat(asegura): modelo Prisma CompaniaContacto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 3: Lógica pura en `@central/module-seguros`

**Files:**
- Create: `packages/module-seguros/src/compania-contactos.ts`
- Create: `packages/module-seguros/src/compania-contactos.test.ts`
- Modify: `packages/module-seguros/src/index.ts`

- [ ] **Step 1: Escribir el módulo puro**

```typescript
// packages/module-seguros/src/compania-contactos.ts
//
// Varios contactos por compañía aseguradora (docs/superpowers/specs/
// 2026-09-13-companias-contactos-multiples-design.md). `area` es una lista
// CERRADA a propósito: si fuera texto libre, el minado de correo acabaría
// escribiendo "ventas"/"comercial"/"vendedor" como si fueran tres cosas
// distintas, y no se podría resaltar el contacto correcto por contexto.

export const AREAS_CONTACTO = [
  'comercial',
  'siniestros',
  'administracion',
  'tecnico',
  'general',
] as const

export type AreaContacto = (typeof AREAS_CONTACTO)[number]

const ETIQUETAS_AREA: Record<AreaContacto, string> = {
  comercial: 'Comercial',
  siniestros: 'Siniestros',
  administracion: 'Administración',
  tecnico: 'Técnico',
  general: 'General',
}

/** `null` = no está en la lista cerrada (o no se ha clasificado) — nunca se inventa un valor. */
export function areaContacto(v: unknown): AreaContacto | null {
  return typeof v === 'string' && (AREAS_CONTACTO as readonly string[]).includes(v)
    ? (v as AreaContacto)
    : null
}

export function etiquetaArea(a: AreaContacto | null): string | null {
  return a === null ? null : ETIQUETAS_AREA[a]
}

export type ContactoCompania = {
  id: string
  nombre: string
  cargo: string | null
  area: AreaContacto | null
  email: string | null
  telefono: string | null
  notas: string | null
  orden: number
  ultimoContactoEn: string | null
}

/**
 * Orden de pintado: por `orden` ascendente (el migrado desde el contacto
 * único nace en 0 y sale primero salvo que se reordene a mano).
 */
export function ordenarContactos(contactos: ContactoCompania[]): ContactoCompania[] {
  return [...contactos].sort((a, b) => a.orden - b.orden)
}

/**
 * El contacto a DESTACAR cuando el llamador ya sabe el motivo (p. ej. una
 * ficha de siniestro abierto). Si hay uno con esa `area`, el primero por
 * orden; si no hay ninguno clasificado así, `null` — nunca se elige "el que
 * más se parece", eso sería inventar una coincidencia.
 */
export function contactoDestacado(
  contactos: ContactoCompania[],
  area: AreaContacto,
): ContactoCompania | null {
  const de = ordenarContactos(contactos).filter((c) => c.area === area)
  return de[0] ?? null
}
```

- [ ] **Step 2: Escribir los tests**

```typescript
// packages/module-seguros/src/compania-contactos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AREAS_CONTACTO,
  areaContacto,
  etiquetaArea,
  ordenarContactos,
  contactoDestacado,
  type ContactoCompania,
} from './compania-contactos.ts'

test('areaContacto solo acepta la lista cerrada', () => {
  assert.equal(areaContacto('comercial'), 'comercial')
  assert.equal(areaContacto('ventas'), null)
  assert.equal(areaContacto(''), null)
  assert.equal(areaContacto(undefined), null)
  assert.equal(areaContacto(null), null)
})

test('las 5 áreas tienen etiqueta', () => {
  for (const a of AREAS_CONTACTO) assert.ok(etiquetaArea(a))
})

test('etiquetaArea(null) es null, no un texto de relleno', () => {
  assert.equal(etiquetaArea(null), null)
})

function contacto(p: Partial<ContactoCompania>): ContactoCompania {
  return {
    id: 'x', nombre: 'X', cargo: null, area: null, email: null, telefono: null,
    notas: null, orden: 0, ultimoContactoEn: null, ...p,
  }
}

test('ordenarContactos ordena por orden ascendente', () => {
  const r = ordenarContactos([contacto({ id: 'b', orden: 2 }), contacto({ id: 'a', orden: 0 })])
  assert.deepEqual(r.map((c) => c.id), ['a', 'b'])
})

test('contactoDestacado devuelve el primero de esa área', () => {
  const cs = [
    contacto({ id: 'general', area: 'general', orden: 0 }),
    contacto({ id: 'com2', area: 'comercial', orden: 2 }),
    contacto({ id: 'com1', area: 'comercial', orden: 1 }),
  ]
  assert.equal(contactoDestacado(cs, 'comercial')?.id, 'com1')
})

test('contactoDestacado es null si no hay nadie de esa área — no elige el más parecido', () => {
  const cs = [contacto({ id: 'a', area: 'general' })]
  assert.equal(contactoDestacado(cs, 'siniestros'), null)
})
```

- [ ] **Step 3: Correr los tests**

```bash
cd packages/module-seguros && npx --yes tsx --test src/compania-contactos.test.ts
```

Expected: todos en verde (7 tests).

- [ ] **Step 4: Exportar desde `index.ts`**

Añade, en cualquier punto del fichero (mismo patrón que las demás exportaciones):

```typescript
export {
  AREAS_CONTACTO,
  areaContacto,
  etiquetaArea,
  ordenarContactos,
  contactoDestacado,
  type AreaContacto,
  type ContactoCompania,
} from './compania-contactos.ts'
```

- [ ] **Step 5: Commit**

```bash
git add packages/module-seguros/src/compania-contactos.ts packages/module-seguros/src/compania-contactos.test.ts packages/module-seguros/src/index.ts
git commit -m "$(cat <<'EOF'
feat(module-seguros): area cerrada y orden de los contactos de compañía

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 4: Puerto `apps/asegura` — `GET /api/operador/companias` con contactos

**Files:**
- Modify: `apps/asegura/app/api/operador/companias/route.ts`

- [ ] **Step 1: Reescribir la ruta para incluir `contactos`**

```typescript
import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias — el directorio de contacto por compañía
 * (`seguros.companias_dgs` + `seguros.compania_contactos`), que mantiene la
 * skill `agente-correduria`. No es cartera de cliente: no hace falta
 * `correduriaId` ni tenant-ámbito, es una tabla de REFERENCIA compartida
 * por toda la correduría.
 *
 * Desde el 13/09/2026 cada compañía trae VARIOS contactos (antes uno solo):
 * docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const companias = await prismaAsegura().companiaDgs.findMany({
      where: { activa: true },
      orderBy: { nombreComun: 'asc' },
      include: {
        contactos: {
          where: { activo: true },
          orderBy: { orden: 'asc' },
        },
      },
    })
    return NextResponse.json({ estado: 'ok', companias })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias', e) })
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/asegura && npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add apps/asegura/app/api/operador/companias/route.ts
git commit -m "$(cat <<'EOF'
feat(asegura): GET /api/operador/companias devuelve varios contactos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 5: Puerto `apps/asegura` — `PATCH` para marcar contactado

**Files:**
- Create: `apps/asegura/app/api/operador/companias/contacto/[id]/route.ts`

- [ ] **Step 1: Escribir la ruta**

```typescript
import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/operador/companias/contacto/[id] — marca `ultimo_contacto_en`
 * a AHORA. Lo dispara plataforma cuando Alberto pulsa el botón de WhatsApp
 * o de correo sobre un contacto (best-effort: si esto falla, el botón de
 * WhatsApp/mail igual se ha abierto — no bloquea nada).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (body?.accion !== 'contactado') {
      return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
    }
    await prismaAsegura().companiaContacto.update({
      where: { id },
      data: { ultimoContactoEn: new Date() },
    })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/contacto', e) })
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/asegura && npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add apps/asegura/app/api/operador/companias/contacto/
git commit -m "$(cat <<'EOF'
feat(asegura): PATCH para marcar un contacto de compañía como "contactado"

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 6: Plataforma — `lib/companias-asegura.ts` con contactos

**Files:**
- Modify: `apps/plataforma/lib/companias-asegura.ts`

- [ ] **Step 1: Sustituir el tipo `Compania` y `leerCompania`, añadir `leerContacto`/`leerContactos`, y la red de marcar contactado**

Reemplaza el contenido completo del fichero por:

```typescript
// Directorio de contacto por compañía aseguradora (`seguros.companias_dgs` +
// `seguros.compania_contactos`), servido por asegura en
// `GET /api/operador/companias`. Mismo patrón de dos partes que
// `duplicados-asegura.ts`: lo PURO (interpretar la respuesta) y la RED (solo
// desde la ruta API de plataforma).
//
// Desde el 13/09/2026 cada compañía trae VARIOS contactos (antes un contacto
// único plano): docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md.
//
// Es una tabla de REFERENCIA, no de cliente: sin cartera_id, sin PII de
// terceros — el contacto es de un empleado de la aseguradora, no de un
// asegurado. Aun así se sirve por el puerto porque esta app no tiene grant
// sobre el schema `seguros` (solo `prisma_seguros`/`crm_seguros` lo tienen).

import { areaContacto, type AreaContacto } from '@central/module-seguros'

export type Contacto = {
  id: string
  nombre: string
  cargo: string | null
  area: AreaContacto | null
  email: string | null
  telefono: string | null
  notas: string | null
  orden: number
  ultimoContactoEn: string | null
}

export type Compania = {
  codigoDgs: string
  nombreComun: string
  nombreCima: string | null
  enCima: boolean
  claveMediador: string | null
  notas: string | null
  contactos: Contacto[]
}

export type RespuestaCompanias =
  | { estado: 'ok'; companias: Compania[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function entero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0
}

function leerContacto(v: unknown): Contacto | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  const nombre = cadena(o.nombre)
  if (id === null || nombre === null) return null
  return {
    id,
    nombre,
    cargo: cadena(o.cargo),
    area: areaContacto(o.area),
    email: cadena(o.email),
    telefono: cadena(o.telefono),
    notas: cadena(o.notas),
    orden: entero(o.orden),
    ultimoContactoEn: cadena(o.ultimoContactoEn),
  }
}

/** Lista de contactos, o `[]` si no hay array — un contacto individual mal formado se descarta, no tumba la lista. */
function leerContactos(v: unknown): Contacto[] {
  if (!Array.isArray(v)) return []
  return v.map(leerContacto).filter((c): c is Contacto => c !== null)
}

function leerCompania(v: unknown): Compania | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const codigoDgs = cadena(o.codigoDgs)
  const nombreComun = cadena(o.nombreComun)
  if (codigoDgs === null || nombreComun === null) return null
  return {
    codigoDgs,
    nombreComun,
    nombreCima: cadena(o.nombreCima),
    enCima: o.enCima === true,
    claveMediador: cadena(o.claveMediador),
    notas: cadena(o.notas),
    contactos: leerContactos(o.contactos),
  }
}

/** Lista de compañías, o `null` si no llega o no es lista — nunca `[]` por defecto. */
export function leerCompanias(v: unknown): Compania[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerCompania).filter((c): c is Compania => c !== null)
}

export function interpretarCompanias(status: number, json: unknown): RespuestaCompanias {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 200 && o.estado === 'ok') {
    const companias = leerCompanias(o.companias)
    if (companias === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', companias }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

// ─── Red (solo desde la ruta API de plataforma) ──────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Reenvio = { status: number; json: unknown }

export async function companiasAsegura(): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/companias`, {
      headers: h,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** Marca un contacto como recién contactado. Best-effort: el llamador no bloquea el WhatsApp/mail por esto. */
export async function marcarContactoAsegura(contactoId: string): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/companias/contacto/${encodeURIComponent(contactoId)}`, {
      method: 'PATCH',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'contactado' }),
      signal: AbortSignal.timeout(10_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "companias-asegura|Companias\.tsx|companias/page\.tsx"
```

Habrá errores esperados en `Companias.tsx` y `companias/page.tsx` (siguen usando los 4 campos viejos) — se arreglan en las Tasks 8 y 9. Confirma que el error está SOLO en esos dos ficheros y no en `companias-asegura.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/companias-asegura.ts
git commit -m "$(cat <<'EOF'
feat(plataforma): lib/companias-asegura.ts lee varios contactos por compañía

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 7: Plataforma — proxy `POST /api/correduria/companias/contactado`

**Files:**
- Create: `apps/plataforma/app/api/correduria/companias/contactado/route.ts`

- [ ] **Step 1: Escribir el proxy**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { marcarContactoAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/companias/contactado — marca `ultimo_contacto_en` de
 * un contacto de compañía. Lo dispara el botón de WhatsApp/mail al pulsarse;
 * best-effort, sin bloquear la apertura del enlace.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const contactoId = typeof body?.contactoId === 'string' ? body.contactoId : null
  if (!contactoId) return NextResponse.json({ error: 'falta contactoId' }, { status: 400 })
  const r = await marcarContactoAsegura(contactoId)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "companias/contactado"
```

Sin salida = sin errores nuevos en este fichero.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/correduria/companias/contactado/
git commit -m "$(cat <<'EOF'
feat(plataforma): proxy para marcar un contacto de compañía como contactado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 8: Componente compartido `ContactoAcciones.tsx`

**Files:**
- Create: `apps/plataforma/app/(usuario)/correduria/ContactoAcciones.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
'use client'
import { Mail } from 'lucide-react'
import BotonWhatsapp from './BotonWhatsapp'

/**
 * Botones de WhatsApp y correo para UN contacto de compañía, compartidos
 * entre `Companias.tsx` (tabla, pestaña Datos) y `/correduria/companias`
 * (tarjetas). Al pulsar cualquiera, marca `ultimo_contacto_en` — best-effort,
 * fire-and-forget: si el PATCH falla, el WhatsApp/mail ya se ha abierto igual
 * (la propia navegación del `<a>` no espera a este fetch).
 */
export default function ContactoAcciones({
  contactoId, nombre, telefono, email, compacto = false,
}: {
  contactoId: string
  nombre: string
  telefono: string | null
  email: string | null
  compacto?: boolean
}) {
  function marcarContactado() {
    fetch('/api/correduria/companias/contactado', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contactoId }),
    }).catch(() => {})
  }

  if (!telefono && !email) return null
  const lado = compacto ? 32 : 44

  return (
    <div style={{ display: 'flex', gap: compacto ? 4 : 6 }}>
      {telefono && (
        <span onClick={marcarContactado}>
          <BotonWhatsapp telefono={telefono} compacto={compacto} />
        </span>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={marcarContactado}
          aria-label={`Escribir a ${nombre}`}
          title={`Escribir a ${nombre}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: lado, height: lado, borderRadius: 8,
            border: '1px solid var(--border)', color: 'var(--text)',
          }}
        >
          <Mail size={compacto ? 15 : 18} strokeWidth={1.75} aria-hidden />
        </a>
      )}
    </div>
  )
}
```

⚠️ El `<span onClick>` envolviendo `BotonWhatsapp` es necesario porque ese componente puede devolver `null` (teléfono no confirmado como móvil) y no acepta un prop `onClick` propio — envolverlo no cambia su comportamiento (sigue devolviendo `null` si no hay enlace, y entonces el `<span>` queda vacío, sin narrar nada).

- [ ] **Step 2: Typecheck**

```bash
cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ContactoAcciones"
```

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/'(usuario)'/correduria/ContactoAcciones.tsx
git commit -m "$(cat <<'EOF'
feat(plataforma): componente compartido de acciones por contacto de compañía

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 9: `Companias.tsx` — la tabla lista varios contactos por fila

**Files:**
- Modify: `apps/plataforma/app/(usuario)/correduria/Companias.tsx`

- [ ] **Step 1: Reescribir el fichero completo**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import Bloque from './Bloque'
import ContactoAcciones from './ContactoAcciones'
import { etiquetaArea } from '@central/module-seguros'
import { interpretarCompanias, type Compania, type Contacto, type RespuestaCompanias } from '@/lib/companias-asegura'

/**
 * Directorio de contacto por compañía aseguradora (`seguros.companias_dgs` +
 * `seguros.compania_contactos`), minado del correo de Alberto: a quién
 * llamar/escribir en cada compañía en vez de perder el hilo en el buzón
 * genérico. Es una tabla de REFERENCIA, no una cola de trabajo — sin
 * contador (no reporta `onContador`), igual que la matriz de comisiones no
 * cuenta como pendiente por existir.
 *
 * Desde el 13/09/2026 cada compañía puede listar VARIOS contactos (antes uno
 * solo): cada fila de compañía expande sus contactos, uno por línea.
 *
 * Tres pintados, como el resto de bloques de Datos:
 *   cargando → nada.
 *   sin_configurar / error → aviso discreto, nunca «sin compañías».
 *   ok → tabla, con `null` en cada campo pintado como «—», nunca vacío.
 */
type Estado = { fase: 'cargando' } | { fase: 'hecho'; r: RespuestaCompanias }

function celda(v: string | null) {
  return v ?? <span style={{ color: 'var(--muted)' }}>—</span>
}

export default function Companias() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/companias')
      .then(async (res) => interpretarCompanias(res.status, await res.json().catch(() => null)))
      .catch((): RespuestaCompanias => ({ estado: 'error', motivo: 'red' }))
      .then((r) => { if (vivo) setEstado({ fase: 'hecho', r }) })
    return () => { vivo = false }
  }, [])

  if (estado.fase === 'cargando') return null
  const r = estado.r

  if (r.estado !== 'ok') {
    return (
      <Bloque Icono={Building2} titulo="Contactos por compañía" sub="No se ha podido comprobar. No significa que el directorio esté vacío.">
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          {r.estado === 'sin_configurar' ? 'falta ASEGURA_OPERADOR_SECRET en este proyecto' : r.motivo}
        </p>
      </Bloque>
    )
  }

  const conContacto = r.companias.filter((c: Compania) => c.contactos.length > 0)
  const sinContacto = r.companias.filter((c: Compania) => c.contactos.length === 0)

  return (
    <Bloque
      Icono={Building2}
      titulo="Contactos por compañía"
      sub={`${conContacto.length} de ${r.companias.length} compañías con al menos un contacto conocido. Minado del correo — no es la ficha oficial de la aseguradora.`}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '4px 8px 4px 0' }}>Compañía</th>
              <th style={{ padding: '4px 8px' }}>Contacto</th>
              <th style={{ padding: '4px 8px' }}>Email</th>
              <th style={{ padding: '4px 8px' }}>Teléfono</th>
              <th style={{ padding: '4px 8px', width: 1 }} />
              <th style={{ padding: '4px 8px' }}>Clave mediador</th>
            </tr>
          </thead>
          <tbody>
            {conContacto.map((c) => (
              c.contactos.map((ct: Contacto, i: number) => (
                <tr key={ct.id} style={{ borderTop: i === 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {i === 0 ? c.nombreComun : null}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {celda(ct.nombre)}
                    {(ct.cargo || ct.area) && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}>
                    {ct.email ? <a href={`mailto:${ct.email}`}>{ct.email}</a> : celda(null)}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {ct.telefono ? <a href={`tel:${ct.telefono.replace(/[^0-9+]/g, '')}`}>{ct.telefono}</a> : celda(null)}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <ContactoAcciones contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} compacto />
                  </td>
                  <td style={{ padding: '6px 8px' }}>{i === 0 ? celda(c.claveMediador) : null}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
      {sinContacto.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
          Sin contacto todavía: {sinContacto.map((c) => c.nombreComun).join(' · ')}
        </p>
      )}
    </Bloque>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Companias\.tsx"
```

Sin salida.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/'(usuario)'/correduria/Companias.tsx
git commit -m "$(cat <<'EOF'
feat(plataforma): Companias.tsx lista varios contactos por fila de compañía

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 10: `/correduria/companias` — la página dedicada con tarjetas

**Files:**
- Modify: `apps/plataforma/app/(usuario)/correduria/companias/page.tsx`

- [ ] **Step 1: Reescribir el fichero completo**

```tsx
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { companiasAsegura, interpretarCompanias, type Compania, type Contacto } from '@/lib/companias-asegura'
import { etiquetaArea } from '@central/module-seguros'
import { PageHeader } from '@/components/ui'
import ContactoAcciones from '../ContactoAcciones'

export const dynamic = 'force-dynamic'

/**
 * Directorio de contacto por compañía, como página propia (12/09/2026): Alberto
 * quería llegar a esto desde el `+` de la cabecera, no buscarlo dentro de la
 * pestaña Datos. Misma fuente que `Companias.tsx` (que se queda montado ahí,
 * como referencia rápida); aquí se pinta en tarjetas, una por compañía, con
 * TODOS sus contactos (desde el 13/09/2026 una compañía puede tener varios)
 * y los botones de WhatsApp y correo a mano.
 */
export default async function CompaniasPage() {
  const { status, json } = await companiasAsegura()
  const r = interpretarCompanias(status, json)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo="Contactos por compañía"
          icono={<Building2 size={20} strokeWidth={1.75} />}
          sub="A quién llamar o escribir en cada aseguradora. Minado del correo de Alberto — no es la ficha oficial de la compañía."
        />
      </div>

      {r.estado !== 'ok' ? (
        <div style={tarjeta}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            No se ha podido comprobar el directorio. No significa que esté vacío.
            {r.estado === 'error' && <> <strong>{r.motivo}</strong></>}
            {r.estado === 'sin_configurar' && <> Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</>}
          </p>
        </div>
      ) : (
        <ListaCompanias companias={r.companias} />
      )}
    </div>
  )
}

const tarjeta: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  background: 'var(--surface)',
}

function ListaCompanias({ companias }: { companias: Compania[] }) {
  const conContacto = companias.filter((c) => c.contactos.length > 0)
  const sinContacto = companias.filter((c) => c.contactos.length === 0)

  return (
    <>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        {conContacto.length} de {companias.length} compañías con al menos un contacto conocido.
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {conContacto.map((c) => (
          <TarjetaCompania key={c.codigoDgs} c={c} />
        ))}
      </div>

      {sinContacto.length > 0 && (
        <div style={tarjeta}>
          <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Sin contacto todavía</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {sinContacto.map((c) => c.nombreComun).join(' · ')}
          </p>
        </div>
      )}
    </>
  )
}

function TarjetaCompania({ c }: { c: Compania }) {
  return (
    <div style={{ ...tarjeta, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{c.nombreComun}</h2>
        {c.claveMediador && (
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            Mediador {c.claveMediador}
          </span>
        )}
      </div>

      {c.contactos.map((ct) => (
        <TarjetaContacto key={ct.id} ct={ct} />
      ))}
    </div>
  )
}

function TarjetaContacto({ ct }: { ct: Contacto }) {
  return (
    <div style={{ display: 'grid', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{ct.nombre}</div>
        {(ct.cargo || ct.area) && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {(ct.email || ct.telefono) && (
        <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          {ct.email && <a href={`mailto:${ct.email}`} style={{ overflowWrap: 'anywhere' }}>{ct.email}</a>}
          {ct.telefono && <a href={`tel:${ct.telefono.replace(/[^0-9+]/g, '')}`}>{ct.telefono}</a>}
        </div>
      )}

      <ContactoAcciones contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "companias/page\.tsx"
```

Sin salida.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/'(usuario)'/correduria/companias/page.tsx
git commit -m "$(cat <<'EOF'
feat(plataforma): página /correduria/companias lista varios contactos por tarjeta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G7u7zUKNEuVJUoKsWrSgCQ
EOF
)"
```

---

### Task 11: Verificación final completa

- [ ] **Step 1: Typecheck completo de las dos apps**

```bash
cd apps/asegura && npx tsc --noEmit -p tsconfig.json; echo "asegura: $?"
cd ../plataforma && npx tsc --noEmit -p tsconfig.json; echo "plataforma: $?"
```

Ambos deben terminar en `0`.

- [ ] **Step 2: Tests de packages**

```bash
cd packages/module-seguros && npx --yes tsx --test src/*.test.ts 2>&1 | tail -20
```

Confirma que el total de tests OK subió respecto a antes de este plan (los 7 nuevos de `compania-contactos.test.ts` incluidos) y que no hay ningún fallo.

- [ ] **Step 3: Prueba manual (una vez desplegado)**

Abrir `/correduria` → pestaña Datos → bloque «Contactos por compañía»: confirmar que una compañía con el contacto migrado sigue mostrando su nombre/email/teléfono (verificación de que la migración de datos no perdió nada). Abrir `/correduria/companias` desde el menú "+" de la cabecera: mismo contenido en tarjetas.

- [ ] **Step 4: Disparar el minado de Francisco Rodríguez López (Occident, comercial)**

Fuera del alcance de código de este plan (lo dice la spec): invocar la skill `agente-correduria` (o el flujo de minado equivalente) para que añada esa fila a `compania_contactos` con `area='comercial'`. Verificar después que Occident aparece con 2 contactos en el directorio.

- [ ] **Step 5: Commit final si algo quedó suelto, y avisar que está listo para revisión**

Si todos los pasos anteriores ya se han commiteado por Task, no hay nada más que commitear aquí — este paso es solo el punto de "todo verificado, listo para que Alberto lo revise" que pidió explícitamente ("mergea para revisar ya terminado").
