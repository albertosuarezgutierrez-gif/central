# Agente SEO autónomo iarest.es — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un cron 2×/semana que lee GSC+GA4 de iarest.es y, de forma autónoma, adapta el SEO (titles, metas, JSON-LD, bloques de contenido y artículos nuevos) guardando todo como DATOS en BD, con red de seguridad (snapshot, kill switch, allowlist, límites, informe Telegram, reversión).

**Architecture:** Endpoint `/api/cron/seo-agent` con bucle agéntico Anthropic + tools de lectura (GSC/GA4/web_search) y de escritura. Las escrituras persisten en 4 tablas del schema `iarest` (`seo_overrides`, `seo_content_blocks`, `seo_articulos`, `seo_cambios`) y las páginas las leen en render (`generateMetadata` + `<SeoBlocks>` + ruta dinámica `/blog/[slug]`). Ningún cambio toca código ni rompe el build.

**Tech Stack:** Next.js (App Router) en `apps/ia-rest`, Supabase (`createServerClient`, schema `iarest`), API Anthropic (`claude-haiku-4-5-20251001`) con `web_search`, Telegram Bot API, Google OAuth (GSC/GA4/Indexing). Verificación: `npx tsx` para lógica pura (no hay test runner) + `next build` para integración.

**Ajustes respecto al spec (superficie editable Fase 1):**
- `/` y `/espacios` son client-components (`next/head`) → **fuera** del override de metadatos en esta fase.
- Superficie editable: `/restaurantes`, `/restaurantes/[ciudad]` (server, ya con `metadata`/`generateMetadata`) + artículos nuevos en `/blog/[slug]`.

---

## File Structure

| Archivo | Responsabilidad | Crear/Modificar |
|---|---|---|
| `supabase/migrations/20260613_seo_agent_tables.sql` | 4 tablas en `iarest` | Crear |
| `src/lib/seo/types.ts` | Tipos compartidos | Crear |
| `src/lib/seo/guardrails.ts` | Lógica pura: kill switch, allowlist, límites, cooldown, umbral | Crear |
| `src/lib/seo/gsc-ga4.ts` | Lectores GSC + GA4 (extraídos de `agentes-seo`) | Crear |
| `src/lib/seo/store.ts` | CRUD overrides/blocks/articulos + snapshot en `seo_cambios` | Crear |
| `src/lib/seo/targets.ts` | Allowlist + resolución de SEO actual por ruta | Crear |
| `src/components/seo/SeoBlocks.tsx` | Render server de bloques por ruta | Crear |
| `src/app/restaurantes/page.tsx` | `metadata`→`generateMetadata` con merge + slot `<SeoBlocks>` | Modificar |
| `src/app/restaurantes/[ciudad]/page.tsx` | merge override en `generateMetadata` + slot | Modificar |
| `src/app/blog/[slug]/page.tsx` | Render de artículos desde `seo_articulos` | Crear |
| `src/app/api/cron/seo-agent/route.ts` | Bucle agéntico + tools + indexación + Telegram | Crear |
| `src/app/api/super/seo-revert/route.ts` | Listar `seo_cambios` y revertir | Crear |
| `vercel.json` | +2 crons (mar/vie 07:00 UTC) | Modificar |
| `scripts/seo/test-guardrails.ts` | Verificación de lógica pura | Crear |

Rutas relativas a `apps/ia-rest/`.

---

### Task 1: Migración SQL — 4 tablas en `iarest`

**Files:**
- Create: `apps/ia-rest/supabase/migrations/20260613_seo_agent_tables.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Agente SEO autónomo — tablas de datos (schema iarest)
-- Todos los cambios del agente son DATOS aquí; nunca tocan código.

create table if not exists iarest.seo_overrides (
  id          uuid primary key default gen_random_uuid(),
  ruta        text not null unique,
  title       text,
  description text,
  canonical   text,
  og          jsonb,
  jsonld      jsonb,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'seo-agent'
);

create table if not exists iarest.seo_content_blocks (
  id         uuid primary key default gen_random_uuid(),
  ruta       text not null,
  posicion   int  not null,
  titulo     text,
  html       text not null,
  activo     boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (ruta, posicion)
);
create index if not exists seo_content_blocks_ruta_idx on iarest.seo_content_blocks (ruta) where activo;

create table if not exists iarest.seo_articulos (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  titulo          text not null,
  meta_description text,
  keyword         text,
  bloques         jsonb not null default '[]'::jsonb,
  activo          boolean not null default true,
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists iarest.seo_cambios (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null,
  ruta          text not null,
  tipo          text not null,            -- 'metadata' | 'schema' | 'content_block' | 'articulo'
  valor_antes   jsonb,
  valor_despues jsonb,
  motivo        text,
  created_at    timestamptz not null default now()
);
create index if not exists seo_cambios_ruta_fecha_idx on iarest.seo_cambios (ruta, created_at desc);
```

- [ ] **Step 2: Aplicar la migración**

Aplicar al proyecto Supabase de la BD unificada vía MCP `mcp__Supabase__apply_migration` (name `seo_agent_tables`, schema `iarest`). Si la sesión no tiene MCP de Supabase, ejecutar el SQL en el SQL editor del proyecto.

- [ ] **Step 3: Verificar tablas creadas**

Run (MCP): `mcp__Supabase__list_tables` con schema `iarest`.
Expected: aparecen `seo_overrides`, `seo_content_blocks`, `seo_articulos`, `seo_cambios`.

- [ ] **Step 4: Commit**

```bash
git add apps/ia-rest/supabase/migrations/20260613_seo_agent_tables.sql
git commit -m "feat(seo): migración tablas del agente SEO autónomo (iarest)"
```

---

### Task 2: Tipos compartidos

**Files:**
- Create: `apps/ia-rest/src/lib/seo/types.ts`

- [ ] **Step 1: Escribir los tipos**

```typescript
// Tipos del agente SEO autónomo (iarest)

export interface SeoOverride {
  ruta: string
  title?: string | null
  description?: string | null
  canonical?: string | null
  og?: Record<string, unknown> | null
  jsonld?: Record<string, unknown> | null
  activo?: boolean
}

export interface SeoContentBlock {
  ruta: string
  posicion: number
  titulo?: string | null
  html: string
  activo?: boolean
}

export interface SeoArticuloBloque {
  h2: string
  html: string
}

export interface SeoArticulo {
  slug: string
  titulo: string
  meta_description?: string | null
  keyword?: string | null
  bloques: SeoArticuloBloque[]
  activo?: boolean
  published_at?: string | null
}

export type TipoCambio = 'metadata' | 'schema' | 'content_block' | 'articulo'

export interface SeoCambio {
  run_id: string
  ruta: string
  tipo: TipoCambio
  valor_antes: unknown
  valor_despues: unknown
  motivo?: string
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/ia-rest && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos referidos a `src/lib/seo/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/lib/seo/types.ts
git commit -m "feat(seo): tipos del agente SEO"
```

---

### Task 3: Guardarraíles (lógica pura) + verificación

**Files:**
- Create: `apps/ia-rest/src/lib/seo/guardrails.ts`
- Test: `apps/ia-rest/scripts/seo/test-guardrails.ts`

- [ ] **Step 1: Escribir el test de verificación (debe fallar primero)**

```typescript
// apps/ia-rest/scripts/seo/test-guardrails.ts
// Verificación de lógica pura (no hay test runner; se corre con tsx).
import {
  agenteHabilitado, rutaEditable, dentroDeLimite, rutaEnCooldown, superaUmbral,
} from '../../src/lib/seo/guardrails'

let fallos = 0
function check(nombre: string, cond: boolean) {
  if (!cond) { console.error(`✗ ${nombre}`); fallos++ } else { console.log(`✓ ${nombre}`) }
}

check('habilitado solo con "true"', agenteHabilitado({ SEO_AGENT_ENABLED: 'true' }) === true)
check('deshabilitado por defecto', agenteHabilitado({}) === false)
check('deshabilitado con "false"', agenteHabilitado({ SEO_AGENT_ENABLED: 'false' }) === false)

const allow = ['/restaurantes', '/restaurantes/*']
check('ruta exacta editable', rutaEditable('/restaurantes', allow) === true)
check('ruta wildcard editable', rutaEditable('/restaurantes/sevilla', allow) === true)
check('ruta no editable', rutaEditable('/registro', allow) === false)
check('wildcard no matchea padre distinto', rutaEditable('/espacios', allow) === false)

check('dentro de límite', dentroDeLimite(4, 5) === true)
check('en el límite (no permite)', dentroDeLimite(5, 5) === false)

const ahora = new Date('2026-06-13T07:00:00Z')
const recientes = [{ ruta: '/restaurantes', created_at: '2026-06-10T07:00:00Z' }]
check('en cooldown (3 días < 7)', rutaEnCooldown('/restaurantes', recientes, ahora, 7) === true)
check('fuera de cooldown (otra ruta)', rutaEnCooldown('/restaurantes/sevilla', recientes, ahora, 7) === false)
const viejos = [{ ruta: '/restaurantes', created_at: '2026-06-01T07:00:00Z' }]
check('fuera de cooldown (12 días > 7)', rutaEnCooldown('/restaurantes', viejos, ahora, 7) === false)

check('supera umbral', superaUmbral(50, 30) === true)
check('no supera umbral', superaUmbral(10, 30) === false)

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1) }
console.log('\nTodos los checks de guardrails OK')
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `cd apps/ia-rest && npx tsx scripts/seo/test-guardrails.ts`
Expected: FALLA (módulo `guardrails` no existe / funciones no definidas).

- [ ] **Step 3: Implementar `guardrails.ts`**

```typescript
// apps/ia-rest/src/lib/seo/guardrails.ts
// Lógica pura del agente SEO. Sin I/O: testeable con tsx.

export const SEO_MAX_CAMBIOS_DEFAULT = 5
export const SEO_MIN_IMPR_DEFAULT = 30
export const SEO_COOLDOWN_DIAS = 7

/** El agente solo corre si SEO_AGENT_ENABLED === 'true' (kill switch). */
export function agenteHabilitado(env: { SEO_AGENT_ENABLED?: string }): boolean {
  return env.SEO_AGENT_ENABLED === 'true'
}

/** Una ruta es editable si matchea un patrón de la allowlist.
 *  Patrón con sufijo '/*' = prefijo (p.ej. '/restaurantes/*'). */
export function rutaEditable(ruta: string, allowlist: string[]): boolean {
  return allowlist.some((pat) => {
    if (pat.endsWith('/*')) return ruta.startsWith(pat.slice(0, -1)) && ruta.length > pat.length - 1
    return ruta === pat
  })
}

/** ¿Quedan cambios por debajo del máximo por pasada? */
export function dentroDeLimite(cambiosEnRun: number, max: number): boolean {
  return cambiosEnRun < max
}

/** ¿La ruta se tocó en los últimos `dias` días? (anti-oscilación) */
export function rutaEnCooldown(
  ruta: string,
  recientes: { ruta: string; created_at: string }[],
  ahora: Date,
  dias = SEO_COOLDOWN_DIAS,
): boolean {
  const limite = ahora.getTime() - dias * 86400000
  return recientes.some((c) => c.ruta === ruta && new Date(c.created_at).getTime() >= limite)
}

/** ¿Las impresiones superan el umbral mínimo para actuar? */
export function superaUmbral(impresiones: number, min: number): boolean {
  return impresiones >= min
}

export function maxCambios(env: { SEO_MAX_CAMBIOS?: string }): number {
  const n = Number(env.SEO_MAX_CAMBIOS)
  return Number.isFinite(n) && n > 0 ? n : SEO_MAX_CAMBIOS_DEFAULT
}

export function minImpresiones(env: { SEO_MIN_IMPR?: string }): number {
  const n = Number(env.SEO_MIN_IMPR)
  return Number.isFinite(n) && n > 0 ? n : SEO_MIN_IMPR_DEFAULT
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `cd apps/ia-rest && npx tsx scripts/seo/test-guardrails.ts`
Expected: PASS — "Todos los checks de guardrails OK".

- [ ] **Step 5: Commit**

```bash
git add apps/ia-rest/src/lib/seo/guardrails.ts apps/ia-rest/scripts/seo/test-guardrails.ts
git commit -m "feat(seo): guardarraíles puros del agente (kill switch, allowlist, límites, cooldown, umbral)"
```

---

### Task 4: Lectores GSC + GA4 (extraídos de `agentes-seo`)

**Files:**
- Create: `apps/ia-rest/src/lib/seo/gsc-ga4.ts`
- Modify: `apps/ia-rest/src/app/api/super/agentes-seo/route.ts` (importar desde el nuevo módulo)

- [ ] **Step 1: Crear `gsc-ga4.ts` moviendo las funciones existentes**

Mover `getOAuthToken`, `getGscData`, `getGa4Data` desde `agentes-seo/route.ts` a este módulo y exportarlas. Contenido idéntico al actual (ver `route.ts:11-147`), con `export` y constantes al inicio:

```typescript
// apps/ia-rest/src/lib/seo/gsc-ga4.ts
// Lectura de Google Search Console + GA4. Compartido por agentes-seo y seo-agent.
const GA4_PROPERTY = '536881804'
const GSC_SITE     = 'https://www.iarest.es/'

export async function getOAuthToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!refreshToken) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN no configurado.')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`)
  return data.access_token
}

export async function getGscData(input: { type: 'queries'|'pages'|'countries'|'devices'; days?: number; rowLimit?: number }): Promise<string> {
  // ... cuerpo idéntico al de agentes-seo/route.ts (líneas 31-73)
}

export async function getGa4Data(input: { report: 'overview'|'pages'|'sources'|'conversions'|'landing'; days?: number }): Promise<string> {
  // ... cuerpo idéntico al de agentes-seo/route.ts (líneas 76-147)
}
```

> Copiar los cuerpos completos tal cual están hoy en `route.ts` (no reescribir la lógica).

- [ ] **Step 2: Reemplazar en `agentes-seo/route.ts` por imports**

Borrar las definiciones locales de `getOAuthToken`/`getGscData`/`getGa4Data` y `GA4_PROPERTY`/`GSC_SITE`, y añadir:

```typescript
import { getGscData, getGa4Data } from '@/lib/seo/gsc-ga4'
```

(`executeTool` sigue llamando `getGscData(input)` / `getGa4Data(input)` igual.)

- [ ] **Step 3: Verificar build**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: sin errores. (El comportamiento de `agentes-seo` no cambia.)

- [ ] **Step 4: Commit**

```bash
git add apps/ia-rest/src/lib/seo/gsc-ga4.ts apps/ia-rest/src/app/api/super/agentes-seo/route.ts
git commit -m "refactor(seo): extraer lectores GSC/GA4 a módulo compartido"
```

---

### Task 5: Store (CRUD + snapshot en `seo_cambios`)

**Files:**
- Create: `apps/ia-rest/src/lib/seo/store.ts`

- [ ] **Step 1: Implementar el store**

```typescript
// apps/ia-rest/src/lib/seo/store.ts
import { createServerClient } from '@/lib/supabase'
import type { SeoOverride, SeoContentBlock, SeoArticulo, SeoCambio } from './types'

export async function getOverride(ruta: string): Promise<SeoOverride | null> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_overrides').select('*').eq('ruta', ruta).eq('activo', true).maybeSingle()
  return (data as SeoOverride) ?? null
}

export async function getBlocks(ruta: string): Promise<SeoContentBlock[]> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_content_blocks').select('*').eq('ruta', ruta).eq('activo', true).order('posicion')
  return (data as SeoContentBlock[]) ?? []
}

export async function getArticulo(slug: string): Promise<SeoArticulo | null> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_articulos').select('*').eq('slug', slug).eq('activo', true).maybeSingle()
  return (data as SeoArticulo) ?? null
}

export async function getArticulosPublicados(): Promise<{ slug: string }[]> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_articulos').select('slug').eq('activo', true)
  return (data as { slug: string }[]) ?? []
}

/** Registra el snapshot antes/después de un cambio. */
export async function registrarCambio(c: SeoCambio): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_cambios').insert({
    run_id: c.run_id, ruta: c.ruta, tipo: c.tipo,
    valor_antes: c.valor_antes ?? null, valor_despues: c.valor_despues ?? null, motivo: c.motivo ?? null,
  })
}

export async function upsertOverride(o: SeoOverride): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_overrides').upsert(
    { ...o, activo: o.activo ?? true, updated_at: new Date().toISOString(), updated_by: 'seo-agent' },
    { onConflict: 'ruta' },
  )
}

export async function upsertBlock(b: SeoContentBlock): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_content_blocks').upsert(
    { ...b, activo: b.activo ?? true, updated_at: new Date().toISOString() },
    { onConflict: 'ruta,posicion' },
  )
}

export async function insertArticulo(a: SeoArticulo): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_articulos').insert({
    slug: a.slug, titulo: a.titulo, meta_description: a.meta_description ?? null,
    keyword: a.keyword ?? null, bloques: a.bloques, activo: true, published_at: new Date().toISOString(),
  })
}

/** Cambios recientes (para cooldown). */
export async function cambiosRecientes(dias = 7): Promise<{ ruta: string; created_at: string }[]> {
  const sb = createServerClient()
  const desde = new Date(Date.now() - dias * 86400000).toISOString()
  const { data } = await sb.from('seo_cambios').select('ruta, created_at').gte('created_at', desde)
  return (data as { ruta: string; created_at: string }[]) ?? []
}

export async function listarCambios(limit = 50) {
  const sb = createServerClient()
  const { data } = await sb.from('seo_cambios').select('*').order('created_at', { ascending: false }).limit(limit)
  return data ?? []
}
```

- [ ] **Step 2: Verificar compila**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/lib/seo/store.ts
git commit -m "feat(seo): store CRUD + snapshot de cambios"
```

---

### Task 6: Targets (allowlist + SEO actual por ruta)

**Files:**
- Create: `apps/ia-rest/src/lib/seo/targets.ts`

- [ ] **Step 1: Implementar targets**

```typescript
// apps/ia-rest/src/lib/seo/targets.ts
import { getOverride, getBlocks, getArticulosPublicados } from './store'

/** Rutas editables por el agente. '/*' = prefijo. NUNCA incluir áreas privadas/legales/checkout. */
export const RUTAS_SEO_EDITABLES = ['/restaurantes', '/restaurantes/*']

/** Defaults de SEO por ruta estática (los que viven hoy en el código). Sirve para que
 *  el agente vea el "estado actual" y para que list_seo_targets sea informativo. */
export const SEO_DEFAULTS: Record<string, { title: string; description: string }> = {
  '/restaurantes': {
    title: 'Directorio de Restaurantes — ia.rest',
    description: 'Descubre restaurantes con carta digital, reserva directa y sin comisiones. Encuentra tu mesa en los mejores restaurantes de España.',
  },
}

/** Devuelve el SEO efectivo (default + override) y los bloques de una ruta. */
export async function resolverSeoActual(ruta: string) {
  const [override, blocks] = await Promise.all([getOverride(ruta), getBlocks(ruta)])
  const def = SEO_DEFAULTS[ruta]
  return {
    ruta,
    title: override?.title ?? def?.title ?? null,
    description: override?.description ?? def?.description ?? null,
    jsonld: override?.jsonld ?? null,
    bloques: blocks.map((b) => ({ posicion: b.posicion, titulo: b.titulo })),
  }
}

/** Inventario para la tool list_seo_targets. */
export async function listarTargets() {
  const rutasBase = ['/restaurantes']
  const seo = await Promise.all(rutasBase.map(resolverSeoActual))
  const articulos = await getArticulosPublicados()
  return {
    rutas_editables: RUTAS_SEO_EDITABLES,
    paginas: seo,
    articulos_existentes: articulos.map((a) => a.slug),
  }
}
```

- [ ] **Step 2: Verificar compila**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/lib/seo/targets.ts
git commit -m "feat(seo): allowlist y resolución de SEO actual por ruta"
```

---

### Task 7: Componente `SeoBlocks` (render server)

**Files:**
- Create: `apps/ia-rest/src/components/seo/SeoBlocks.tsx`

- [ ] **Step 1: Implementar el componente**

```tsx
// apps/ia-rest/src/components/seo/SeoBlocks.tsx
// Server component: renderiza los bloques SEO activos de una ruta desde BD.
import { getBlocks } from '@/lib/seo/store'

export default async function SeoBlocks({ ruta }: { ruta: string }) {
  const bloques = await getBlocks(ruta)
  if (!bloques.length) return null
  return (
    <section aria-label="Información adicional" style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 48px' }}>
      {bloques.map((b) => (
        <div key={b.posicion} style={{ marginBottom: 32 }}>
          {b.titulo ? <h2 style={{ fontSize: 24, margin: '0 0 12px' }}>{b.titulo}</h2> : null}
          <div style={{ fontSize: 15, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: b.html }} />
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: Verificar compila**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/components/seo/SeoBlocks.tsx
git commit -m "feat(seo): componente SeoBlocks (render de bloques desde BD)"
```

---

### Task 8: Integrar override + bloques en `/restaurantes`

**Files:**
- Modify: `apps/ia-rest/src/app/restaurantes/page.tsx`

- [ ] **Step 1: Sustituir `export const metadata` por `generateMetadata` con merge**

Reemplazar el bloque `export const metadata: Metadata = { ... }` (líneas ~10-22) por:

```typescript
import { getOverride } from '@/lib/seo/store'
import { SEO_DEFAULTS } from '@/lib/seo/targets'

export async function generateMetadata(): Promise<Metadata> {
  const def = SEO_DEFAULTS['/restaurantes']
  const ov = await getOverride('/restaurantes')
  const title = ov?.title ?? def.title
  const description = ov?.description ?? def.description
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', ...(ov?.og ?? {}) },
    alternates: { canonical: ov?.canonical ?? 'https://www.iarest.es/restaurantes' },
    ...(ov?.jsonld ? { other: { 'script:ld+json': JSON.stringify(ov.jsonld) } } : {}),
  }
}
```

> Nota: el `import type { Metadata }` ya existe en el fichero. Mantener `export const revalidate = 3600`.

- [ ] **Step 2: Insertar el slot `<SeoBlocks>` en el render**

Importar al inicio: `import SeoBlocks from '@/components/seo/SeoBlocks'`. Añadir `<SeoBlocks ruta="/restaurantes" />` cerca del final del JSX devuelto (antes del cierre del contenedor principal).

- [ ] **Step 3: Verificar build real**

Run: `cd apps/ia-rest && npx pnpm@10.33.0 install --no-frozen-lockfile && npm run build`
Expected: build OK; la ruta `/restaurantes` compila (server, dynamic por lectura BD o ISR — aceptable).

- [ ] **Step 4: Commit**

```bash
git add apps/ia-rest/src/app/restaurantes/page.tsx
git commit -m "feat(seo): /restaurantes lee override de metadatos + bloques"
```

---

### Task 9: Integrar override en `/restaurantes/[ciudad]`

**Files:**
- Modify: `apps/ia-rest/src/app/restaurantes/[ciudad]/page.tsx`

- [ ] **Step 1: Mergear override dentro de `generateMetadata` existente**

En la función `generateMetadata({ params })` (línea ~41), tras calcular el `Metadata` base, leer el override de la ruta concreta y mergear. Patrón a añadir al final, antes del `return`:

```typescript
import { getOverride } from '@/lib/seo/store'
// dentro de generateMetadata, con `const { ciudad } = await params` ya resuelto:
const rutaActual = `/restaurantes/${ciudad}`
const ov = await getOverride(rutaActual)
// construir baseTitle/baseDescription como hoy, y luego:
const title = ov?.title ?? baseTitle
const description = ov?.description ?? baseDescription
return {
  title,
  description,
  openGraph: { title, description, type: 'website', ...(ov?.og ?? {}) },
  alternates: { canonical: ov?.canonical ?? `https://www.iarest.es${rutaActual}` },
  ...(ov?.jsonld ? { other: { 'script:ld+json': JSON.stringify(ov.jsonld) } } : {}),
}
```

> Adaptar `baseTitle`/`baseDescription` a como ya se construyen en la función actual (reutilizar los valores existentes; solo se les antepone el override si existe).

- [ ] **Step 2: Insertar slot de bloques**

`import SeoBlocks from '@/components/seo/SeoBlocks'` y `<SeoBlocks ruta={\`/restaurantes/${ciudad}\`} />` en el JSX (la página ya recibe `ciudad`).

- [ ] **Step 3: Verificar build**

Run: `cd apps/ia-rest && npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/ia-rest/src/app/restaurantes/[ciudad]/page.tsx"
git commit -m "feat(seo): /restaurantes/[ciudad] lee override + bloques"
```

---

### Task 10: Ruta dinámica `/blog/[slug]` para artículos del agente

**Files:**
- Create: `apps/ia-rest/src/app/blog/[slug]/page.tsx`

- [ ] **Step 1: Implementar la ruta**

```tsx
// apps/ia-rest/src/app/blog/[slug]/page.tsx
// Artículos generados por el agente SEO (datos en iarest.seo_articulos).
// Convive con los artículos estáticos (carpetas hermanas): Next prioriza el segmento estático.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getArticulo } from '@/lib/seo/store'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const a = await getArticulo(slug)
  if (!a) return {}
  return {
    title: a.titulo,
    description: a.meta_description ?? undefined,
    alternates: { canonical: `https://www.iarest.es/blog/${slug}` },
    openGraph: { title: a.titulo, description: a.meta_description ?? undefined, type: 'article' },
    keywords: a.keyword ? [a.keyword] : undefined,
  }
}

export default async function ArticuloDinamico({ params }: Props) {
  const { slug } = await params
  const a = await getArticulo(slug)
  if (!a) notFound()
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>
        <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>← Blog</a>
        <h1 style={{ fontSize: 36, margin: '24px 0 20px', lineHeight: 1.15 }}>{a.titulo}</h1>
        {a.bloques.map((b, i) => (
          <section key={i} style={{ marginBottom: 32 }}>
            {b.h2 ? <h2 style={{ fontSize: 24, margin: '0 0 12px' }}>{b.h2}</h2> : null}
            <div style={{ fontSize: 15, lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: b.html }} />
          </section>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/ia-rest && npm run build`
Expected: build OK; coexiste con carpetas estáticas de `/blog/*`.

- [ ] **Step 3: Commit**

```bash
git add "apps/ia-rest/src/app/blog/[slug]/page.tsx"
git commit -m "feat(seo): ruta dinámica /blog/[slug] para artículos del agente"
```

---

### Task 11: Endpoint del cron `seo-agent` (bucle agéntico + tools + seguridad)

**Files:**
- Create: `apps/ia-rest/src/app/api/cron/seo-agent/route.ts`

- [ ] **Step 1: Implementar el endpoint**

```typescript
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getGscData, getGa4Data, getOAuthToken } from '@/lib/seo/gsc-ga4'
import {
  upsertOverride, upsertBlock, insertArticulo, registrarCambio, cambiosRecientes, getOverride, getArticulo,
} from '@/lib/seo/store'
import { listarTargets, RUTAS_SEO_EDITABLES } from '@/lib/seo/targets'
import {
  agenteHabilitado, rutaEditable, dentroDeLimite, rutaEnCooldown, maxCambios, minImpresiones,
} from '@/lib/seo/guardrails'

const TG_BOT  = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || ''

async function telegram(msg: string) {
  if (!TG_BOT || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
  })
}

async function solicitarIndexacion(path: string) {
  try {
    const token = await getOAuthToken()
    await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.iarest.es${path}`, type: 'URL_UPDATED' }),
    })
  } catch { /* no crítico */ }
}

const SYSTEM = `Eres el Agente SEO AUTÓNOMO de ia.rest. Analizas datos reales de Google Search Console y GA4 y aplicas mejoras de SEO TÚ MISMO mediante las herramientas de escritura.

PRODUCTO: ia.rest, Voice POS hostelería española. www.iarest.es. 59€/mes, sin comisión. Competencia: SmartBar (99,99€), Agora, ICG.

METODOLOGÍA:
1. Pide get_gsc_data (queries y pages) y get_ga4_data (pages) antes de decidir.
2. Cruza señales: impresiones altas + CTR bajo → set_metadata; posición 5-20 → set_content_block; bounce alto → set_content_block; keyword sin cubrir → create_article.
3. Aplica SOLO cambios con datos que lo justifiquen. Llama list_seo_targets para ver qué rutas puedes tocar y su estado actual.
4. NO inventes cifras ni testimonios. Español. Prohibidas: innovador, revolucionario, disruptivo, potente.

Solo puedes editar las rutas que devuelve list_seo_targets. Tras terminar, deja de llamar herramientas.`

const TOOLS = [
  { type: 'web_search_20250305', name: 'web_search' },
  { name: 'get_gsc_data', description: 'Datos GSC reales (queries/pages/...)', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['queries','pages','countries','devices'] }, days: { type: 'number' }, rowLimit: { type: 'number' } }, required: ['type'] } },
  { name: 'get_ga4_data', description: 'Datos GA4 reales', input_schema: { type: 'object', properties: { report: { type: 'string', enum: ['overview','pages','sources','conversions','landing'] }, days: { type: 'number' } }, required: ['report'] } },
  { name: 'list_seo_targets', description: 'Rutas editables y su SEO actual + artículos existentes', input_schema: { type: 'object', properties: {} } },
  { name: 'set_metadata', description: 'Fija title/description/canonical/og de una ruta editable', input_schema: { type: 'object', properties: { ruta: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, canonical: { type: 'string' }, motivo: { type: 'string' } }, required: ['ruta','motivo'] } },
  { name: 'set_schema', description: 'Fija JSON-LD de una ruta editable', input_schema: { type: 'object', properties: { ruta: { type: 'string' }, jsonld: { type: 'object' }, motivo: { type: 'string' } }, required: ['ruta','jsonld','motivo'] } },
  { name: 'set_content_block', description: 'Inserta/actualiza un bloque de contenido en una ruta editable', input_schema: { type: 'object', properties: { ruta: { type: 'string' }, posicion: { type: 'number' }, titulo: { type: 'string' }, html: { type: 'string' }, motivo: { type: 'string' } }, required: ['ruta','posicion','html','motivo'] } },
  { name: 'create_article', description: 'Crea un artículo nuevo en /blog/{slug}', input_schema: { type: 'object', properties: { slug: { type: 'string' }, titulo: { type: 'string' }, meta_description: { type: 'string' }, keyword: { type: 'string' }, bloques: { type: 'array', items: { type: 'object', properties: { h2: { type: 'string' }, html: { type: 'string' } } } }, motivo: { type: 'string' } }, required: ['slug','titulo','bloques','motivo'] } },
]

export async function GET(req: NextRequest) {
  // Auth: cron de Vercel o super_admin
  const auth = req.headers.get('authorization')
  let isSuper = false
  const sh = req.headers.get('x-ia-session')
  if (sh) { try { isSuper = JSON.parse(sh)?.rol === 'super_admin' } catch {} }
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && !isSuper)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Kill switch
  if (!agenteHabilitado(process.env as any))
    return NextResponse.json({ ok: false, msg: 'SEO_AGENT_ENABLED != true' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })

  const runId = randomUUID()
  const max = maxCambios(process.env as any)
  const recientes = await cambiosRecientes(7)
  const ahora = new Date()
  let aplicados = 0
  const resumen: string[] = []

  // Aplica una mutación si pasa los guardarraíles. Devuelve true si aplicó.
  async function aplicar(ruta: string, tipo: string, antes: unknown, accion: () => Promise<void>, descripcion: string, motivo: string): Promise<string> {
    if (!rutaEditable(ruta, RUTAS_SEO_EDITABLES) && tipo !== 'articulo')
      return `RECHAZADO: ${ruta} no es editable`
    if (!dentroDeLimite(aplicados, max)) return `RECHAZADO: límite de ${max} cambios alcanzado`
    if (tipo !== 'articulo' && rutaEnCooldown(ruta, recientes, ahora, 7)) return `RECHAZADO: ${ruta} en cooldown (7d)`
    await accion()
    await registrarCambio({ run_id: runId, ruta, tipo: tipo as any, valor_antes: antes, valor_despues: descripcion, motivo })
    aplicados++
    resumen.push(`• [${tipo}] ${ruta}: ${motivo}`)
    await solicitarIndexacion(ruta)
    return `OK: aplicado a ${ruta}`
  }

  async function executeTool(name: string, input: any): Promise<string> {
    if (name === 'get_gsc_data') return getGscData(input)
    if (name === 'get_ga4_data') return getGa4Data(input)
    if (name === 'list_seo_targets') return JSON.stringify(await listarTargets())
    if (name === 'set_metadata') {
      const antes = await getOverride(input.ruta)
      return aplicar(input.ruta, 'metadata', antes, () => upsertOverride({ ruta: input.ruta, title: input.title, description: input.description, canonical: input.canonical }), 'metadata', input.motivo)
    }
    if (name === 'set_schema') {
      const antes = await getOverride(input.ruta)
      return aplicar(input.ruta, 'schema', antes?.jsonld ?? null, () => upsertOverride({ ruta: input.ruta, jsonld: input.jsonld }), 'schema', input.motivo)
    }
    if (name === 'set_content_block') {
      return aplicar(input.ruta, 'content_block', null, () => upsertBlock({ ruta: input.ruta, posicion: input.posicion, titulo: input.titulo, html: input.html }), 'content_block', input.motivo)
    }
    if (name === 'create_article') {
      const existe = await getArticulo(input.slug)
      if (existe) return `RECHAZADO: ya existe artículo ${input.slug}`
      return aplicar(`/blog/${input.slug}`, 'articulo', null, () => insertArticulo({ slug: input.slug, titulo: input.titulo, meta_description: input.meta_description, keyword: input.keyword, bloques: input.bloques }), 'articulo', input.motivo)
    }
    return `Herramienta desconocida: ${name}`
  }

  try {
    const system = `${SYSTEM}\n\nUMBRAL: solo actúa sobre queries con impresiones >= ${minImpresiones(process.env as any)} en GSC. No optimices ruido.`
    let messages: any[] = [{ role: 'user', content: 'Analiza el SEO de iarest.es de esta semana y aplica las mejoras justificadas por los datos.' }]
    for (let i = 0; i < 10; i++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, system, tools: TOOLS, messages }),
      })
      const data = await res.json()
      if (!data.content) break
      if (data.stop_reason === 'end_turn') break
      if (data.stop_reason === 'tool_use') {
        messages = [...messages, { role: 'assistant', content: data.content }]
        const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
        const results = await Promise.all(toolUses.map(async (tu: any) => {
          let result: string
          if (tu.name === 'web_search') {
            const ws = data.content.find((b: any) => b.type === 'tool_result' && b.tool_use_id === tu.id)
            result = ws?.content?.[0]?.text || 'Búsqueda procesada'
          } else { result = await executeTool(tu.name, tu.input) }
          return { type: 'tool_result', tool_use_id: tu.id, content: result }
        }))
        messages = [...messages, { role: 'user', content: results }]
        continue
      }
      break
    }

    await telegram(
      aplicados
        ? `🤖 <b>Agente SEO — ${aplicados} cambio(s)</b>\n\n${resumen.join('\n')}\n\nRevertir en /super → SEO`
        : `🤖 <b>Agente SEO</b>: sin cambios esta pasada (sin oportunidades con datos suficientes).`
    )
    return NextResponse.json({ ok: true, run_id: runId, aplicados, resumen })
  } catch (err: any) {
    await telegram(`❌ Agente SEO error: ${err.message}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/ia-rest && npm run build`
Expected: build OK; ruta `/api/cron/seo-agent` presente.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/cron/seo-agent/route.ts
git commit -m "feat(seo): cron seo-agent (bucle agéntico autónomo + tools + guardarraíles)"
```

---

### Task 12: Registrar los crons en `vercel.json`

**Files:**
- Modify: `apps/ia-rest/vercel.json`

- [ ] **Step 1: Añadir las dos entradas al array `crons`**

Insertar dentro de `"crons": [ ... ]` (junto a las demás):

```json
    {
      "path": "/api/cron/seo-agent",
      "schedule": "0 7 * * 2"
    },
    {
      "path": "/api/cron/seo-agent",
      "schedule": "0 7 * * 5"
    }
```

- [ ] **Step 2: Validar JSON**

Run: `cd apps/ia-rest && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/vercel.json
git commit -m "feat(seo): crons martes y viernes 07:00 UTC para el agente SEO"
```

---

### Task 13: Endpoint de reversión (`/api/super/seo-revert`)

**Files:**
- Create: `apps/ia-rest/src/app/api/super/seo-revert/route.ts`

- [ ] **Step 1: Implementar listar + revertir**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { listarCambios } from '@/lib/seo/store'

export async function GET(req: NextRequest) {
  const s = getSession(req)
  if (!s || s.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ cambios: await listarCambios(50) })
}

export async function POST(req: NextRequest) {
  const s = getSession(req)
  if (!s || s.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  const sb = createServerClient()
  const { data: cambio } = await sb.from('seo_cambios').select('*').eq('id', id).single()
  if (!cambio) return NextResponse.json({ error: 'Cambio no encontrado' }, { status: 404 })

  // Revertir: para metadata/schema restaurar valor_antes en seo_overrides (o desactivar si no había);
  // para content_block desactivar el bloque; para articulo desactivar el artículo.
  if (cambio.tipo === 'metadata' || cambio.tipo === 'schema') {
    if (cambio.valor_antes) {
      await sb.from('seo_overrides').upsert({ ...cambio.valor_antes, updated_at: new Date().toISOString() }, { onConflict: 'ruta' })
    } else {
      await sb.from('seo_overrides').update({ activo: false }).eq('ruta', cambio.ruta)
    }
  } else if (cambio.tipo === 'content_block') {
    await sb.from('seo_content_blocks').update({ activo: false }).eq('ruta', cambio.ruta)
  } else if (cambio.tipo === 'articulo') {
    const slug = cambio.ruta.replace('/blog/', '')
    await sb.from('seo_articulos').update({ activo: false }).eq('slug', slug)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/ia-rest && npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/super/seo-revert/route.ts
git commit -m "feat(seo): endpoint de reversión de cambios del agente"
```

---

### Task 14: Verificación final integral

- [ ] **Step 1: Lógica pura**

Run: `cd apps/ia-rest && npx tsx scripts/seo/test-guardrails.ts`
Expected: "Todos los checks de guardrails OK".

- [ ] **Step 2: Build real (reproduce Vercel)**

Run: `cd apps/ia-rest && npx pnpm@10.33.0 install --no-frozen-lockfile && npm run build`
Expected: build OK, sin errores de tipos ni de rutas.

- [ ] **Step 3: QA estático del proyecto**

Run: `cd apps/ia-rest && npm run qa`
Expected: sin violaciones nuevas (severidad error).

- [ ] **Step 4: Actualizar memoria de sesión**

Añadir entrada arriba en `docs/CONTEXTO-SESIONES.md` resumiendo: agente SEO autónomo Fase 1 (iarest), tablas nuevas, kill switch `SEO_AGENT_ENABLED`, pendiente Fase 0/2 ialimp (conectar GSC/GA4).

- [ ] **Step 5: Commit + push + PR draft**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs(seo): registrar sesión del agente SEO autónomo iarest"
git push -u origin claude/seo-agent-auto-activation-5ypj5x
```
Crear PR en draft contra la rama por defecto.

---

## Notas de despliegue (post-merge)

1. En Vercel (proyecto ia-rest), dejar `SEO_AGENT_ENABLED` **sin** poner o en `false` hasta querer activarlo. El cron correrá pero saldrá sin tocar nada (verificable por respuesta `msg`).
2. Para activar: `SEO_AGENT_ENABLED=true` (+ opcional `SEO_MAX_CAMBIOS`, `SEO_MIN_IMPR`).
3. Primera pasada: revisar el informe Telegram y los cambios en `/super → SEO` antes de confiar en la autonomía.
