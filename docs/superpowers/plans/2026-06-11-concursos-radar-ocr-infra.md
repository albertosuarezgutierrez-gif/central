# Concursos — Infra F7: Radar PLACSP en vivo + OCR de pliegos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ialimp avise de licitaciones de PLACSP que encajan con la empresa (radar por cron, aviso in-app) y que lea pliegos escaneados reutilizando la visión IA (`nimVision`).

**Architecture:** Parser ATOM puro y testeable en `apps/ialimp/lib/concursos-radar.ts`; el resto es app (BD, endpoints, cron, OCR, UI) apoyándose en el módulo puro `@iarest/module-concursos` (`filtrarRadar`, `necesitaOcr`) y en infra existente de ialimp (`nimVision`, crons multi-tenant, `requireEmpresaId`, Prisma `$queryRaw`). Aviso = matches no vistos en la UI (sin web-push: `push_subscriptions` es solo de limpiadoras).

**Tech Stack:** Next.js (App Router) + Prisma/Supabase; `fast-xml-parser` (parseo ATOM); `pdfjs-dist` legacy + `@napi-rs/canvas` (rasterizar PDF→PNG); `@iarest/core-ai` `nimVision`; tests `node --test` (type-stripping).

**Spec:** `docs/superpowers/specs/2026-06-11-concursos-radar-ocr-infra-design.md`

---

## File Structure

**Parser puro + tests:**
- Create: `apps/ialimp/lib/concursos-radar.ts` — `parsearAtomPlacsp`, `dedupeKey`, tipos `AnuncioPlacsp`.
- Create: `apps/ialimp/lib/concursos-radar.test.ts` — tests con fixture XML.
- Create: `apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml` — fixture ATOM recortado.

**OCR:**
- Create: `apps/ialimp/lib/concursos-ocr.ts` — `rasterizarPdf`, `ocrPaginasPliego`.
- Modify: `apps/ialimp/app/api/admin/concursos/analizar/route.ts` — usar OCR si `necesitaOcr`.

**Migraciones (las aplica Alberto):**
- Create: `apps/ialimp/prisma/migrations/add_concursos_radar_criterios.sql`
- Create: `apps/ialimp/prisma/migrations/add_concursos_radar_anuncios.sql`

**Endpoints radar:**
- Create: `apps/ialimp/app/api/admin/concursos/radar/criterios/route.ts` — GET/PUT criterios.
- Create: `apps/ialimp/app/api/admin/concursos/radar/route.ts` — GET lista matches.
- Create: `apps/ialimp/app/api/admin/concursos/radar/visto/route.ts` — POST marcar visto.
- Create: `apps/ialimp/app/api/admin/concursos/radar/importar/route.ts` — POST import manual ATOM.
- Create: `apps/ialimp/app/api/cron/concursos-radar/route.ts` — cron.
- Modify: `apps/ialimp/vercel.json` — añadir cron.

**UI:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx` — panel "Radar de oportunidades" + aviso OCR.

**Deps:**
- Modify: `apps/ialimp/package.json` — `fast-xml-parser`, `pdfjs-dist`, `@napi-rs/canvas`.

**Docs:**
- Modify: `docs/CONTEXTO-SESIONES.md`, `apps/ialimp/CLAUDE.md`.

---

## Task 1: Dependencias

**Files:**
- Modify: `apps/ialimp/package.json`

- [ ] **Step 1: Añadir dependencias**

Run desde `apps/ialimp`:
```bash
cd /home/user/central/apps/ialimp
npx --yes pnpm@10.33.0 add fast-xml-parser pdfjs-dist @napi-rs/canvas --no-frozen-lockfile
```
Expected: las 3 deps aparecen en `package.json` y se instalan en `node_modules`.

- [ ] **Step 2: Commit**

```bash
cd /home/user/central
git add apps/ialimp/package.json apps/ialimp/pnpm-lock.yaml
git commit -m "build(ialimp): deps para radar PLACSP y OCR (fast-xml-parser, pdfjs-dist, napi-canvas)"
```

---

## Task 2: Fixture ATOM de PLACSP

**Files:**
- Create: `apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml`

- [ ] **Step 1: Crear el fixture**

Crea `apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml` (ATOM CODICE recortado, 2 entradas: una de limpieza con CPV+presupuesto+órgano, otra de obra sin presupuesto):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:cbc="urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2"
      xmlns:cac="urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2"
      xmlns:cac-place-ext="urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2">
  <title>Licitaciones publicadas</title>
  <link rel="next" href="https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_page2.atom"/>
  <entry>
    <id>https://contrataciondelestado.es/sindicacion/licitacion/11111</id>
    <title>Id licitación: 11111/2026; Órgano: Ayuntamiento de Avilés; Importe: 120000.00 EUR</title>
    <updated>2026-06-10T09:00:00.000Z</updated>
    <link href="https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=AAA111"/>
    <cac-place-ext:ContractFolderStatus>
      <cbc:ContractFolderID>11111/2026</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:Party><cac:PartyName><cbc:Name>Ayuntamiento de Avilés</cbc:Name></cac:PartyName></cac:Party>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicio de limpieza de colegios públicos</cbc:Name>
        <cbc:TypeCode>2</cbc:TypeCode>
        <cac:BudgetAmount><cbc:TotalAmount currencyID="EUR">120000.00</cbc:TotalAmount></cac:BudgetAmount>
        <cac:RequiredCommodityClassification><cbc:ItemClassificationCode>90910000</cbc:ItemClassificationCode></cac:RequiredCommodityClassification>
      </cac:ProcurementProject>
    </cac-place-ext:ContractFolderStatus>
  </entry>
  <entry>
    <id>https://contrataciondelestado.es/sindicacion/licitacion/22222</id>
    <title>Id licitación: 22222/2026; Órgano: Diputación de X; Obra</title>
    <updated>2026-06-10T10:00:00.000Z</updated>
    <link href="https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=BBB222"/>
    <cac-place-ext:ContractFolderStatus>
      <cbc:ContractFolderID>22222/2026</cbc:ContractFolderID>
      <cac-place-ext:LocatedContractingParty>
        <cac:Party><cac:PartyName><cbc:Name>Diputación de X</cbc:Name></cac:PartyName></cac:Party>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Obra de reforma de carretera</cbc:Name>
        <cbc:TypeCode>3</cbc:TypeCode>
        <cac:RequiredCommodityClassification><cbc:ItemClassificationCode>45233140</cbc:ItemClassificationCode></cac:RequiredCommodityClassification>
      </cac:ProcurementProject>
    </cac-place-ext:ContractFolderStatus>
  </entry>
</feed>
```

- [ ] **Step 2: Commit**

```bash
cd /home/user/central
git add apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml
git commit -m "test(ialimp): fixture ATOM de PLACSP para el parser de radar"
```

---

## Task 3: Parser puro `parsearAtomPlacsp` + `dedupeKey` (TDD)

**Files:**
- Create: `apps/ialimp/lib/concursos-radar.ts`
- Test: `apps/ialimp/lib/concursos-radar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `apps/ialimp/lib/concursos-radar.test.ts`:

```ts
// Tests del parser PURO de ATOM PLACSP. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parsearAtomPlacsp, dedupeKey } from './concursos-radar.ts'

const here = dirname(fileURLToPath(import.meta.url))
const xml = readFileSync(join(here, '__fixtures__', 'placsp-sample.atom.xml'), 'utf8')

test('parsearAtomPlacsp: extrae los anuncios con sus campos', () => {
  const anuncios = parsearAtomPlacsp(xml)
  assert.equal(anuncios.length, 2)

  const limpieza = anuncios[0]
  assert.match(limpieza.titulo, /limpieza de colegios/i)
  assert.deepEqual(limpieza.cpv, ['90910000'])
  assert.equal(limpieza.presupuesto, 120000)
  assert.match(limpieza.organo ?? '', /Avilés/)
  assert.match(limpieza.url ?? '', /idEvl=AAA111/)
  assert.equal(limpieza.expediente, '11111/2026')

  const obra = anuncios[1]
  assert.equal(obra.presupuesto, undefined) // sin BudgetAmount
  assert.deepEqual(obra.cpv, ['45233140'])
})

test('dedupeKey: estable y determinista para el mismo anuncio', () => {
  const [a] = parsearAtomPlacsp(xml)
  const k1 = dedupeKey(a)
  const k2 = dedupeKey({ ...a })
  assert.equal(k1, k2)
  assert.ok(k1.length > 0)
})

test('parsearAtomPlacsp: XML vacío o sin entradas devuelve []', () => {
  assert.deepEqual(parsearAtomPlacsp('<feed></feed>'), [])
  assert.deepEqual(parsearAtomPlacsp(''), [])
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd /home/user/central/apps/ialimp && node --test lib/concursos-radar.test.ts`
Expected: FAIL — `Cannot find module './concursos-radar.ts'`.

- [ ] **Step 3: Implementar el parser**

Crea `apps/ialimp/lib/concursos-radar.ts`:

```ts
// Parser PURO de la sindicación ATOM de PLACSP (CODICE) → anuncios normalizados,
// y clave de deduplicación estable. Sin red ni BD: testeable con `node --test`.
import { XMLParser } from 'fast-xml-parser'
import type { AnuncioRadar } from '@iarest/module-concursos'

/** Anuncio captado del radar + identificador estable del expediente. */
export interface AnuncioPlacsp extends AnuncioRadar {
  expediente?: string   // ContractFolderID (id estable del expediente)
  atom_id?: string      // <id> del entry (fallback de dedupe)
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,   // 'cac:ProcurementProject' -> 'ProcurementProject'
  trimValues: true,
})

/** Normaliza un valor a array (fast-xml-parser colapsa nodos únicos). */
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/** Texto de un nodo que puede ser string o `{ '#text': ... }`. */
function texto(v: any): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'object') return v['#text'] !== undefined ? String(v['#text']) : undefined
  return String(v)
}

/** href del <link> (puede ser uno o varios; coge el primero con href). */
function hrefDe(link: any): string | undefined {
  for (const l of asArray(link)) {
    const h = l?.['@_href']
    if (h) return String(h)
  }
  return undefined
}

/** Parsea un ATOM de PLACSP a anuncios normalizados. Tolerante a campos ausentes. */
export function parsearAtomPlacsp(xml: string): AnuncioPlacsp[] {
  if (!xml || !xml.trim()) return []
  let doc: any
  try { doc = parser.parse(xml) } catch { return [] }
  const entries = asArray(doc?.feed?.entry)

  const out: AnuncioPlacsp[] = []
  for (const e of entries) {
    const cfs = e?.ContractFolderStatus
    const pp = cfs?.ProcurementProject

    const titulo = texto(pp?.Name) || texto(e?.title) || 'Licitación'
    const organo = texto(cfs?.LocatedContractingParty?.Party?.PartyName?.Name)

    const cpv: string[] = []
    for (const rcc of asArray(pp?.RequiredCommodityClassification)) {
      const code = texto(rcc?.ItemClassificationCode)
      if (code) cpv.push(code)
    }

    const presupRaw = texto(pp?.BudgetAmount?.TotalAmount)
    const presupuesto = presupRaw !== undefined && presupRaw !== '' && Number.isFinite(Number(presupRaw))
      ? Number(presupRaw)
      : undefined

    out.push({
      titulo,
      objeto: titulo,
      cpv: cpv.length ? cpv : undefined,
      presupuesto,
      organo,
      url: hrefDe(e?.link),
      expediente: texto(cfs?.ContractFolderID),
      atom_id: texto(e?.id),
    })
  }
  return out
}

/** Clave de dedupe estable: expediente > atom_id > url > título. */
export function dedupeKey(a: AnuncioPlacsp): string {
  return (a.expediente || a.atom_id || a.url || a.titulo || '').trim()
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/apps/ialimp && node --test lib/concursos-radar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/ialimp/lib/concursos-radar.ts apps/ialimp/lib/concursos-radar.test.ts
git commit -m "feat(ialimp): parser puro de ATOM PLACSP + dedupeKey (radar F7)"
```

---

## Task 4: Migraciones de BD

**Files:**
- Create: `apps/ialimp/prisma/migrations/add_concursos_radar_criterios.sql`
- Create: `apps/ialimp/prisma/migrations/add_concursos_radar_anuncios.sql`

- [ ] **Step 1: Criterios del radar (amplía el perfil)**

Crea `apps/ialimp/prisma/migrations/add_concursos_radar_criterios.sql`:

```sql
-- Radar PLACSP (F7): criterios de búsqueda por empresa, sobre el perfil existente.
alter table concursos_perfil_empresa
  add column if not exists radar_activo boolean not null default false,
  add column if not exists radar_cpv text[] not null default '{}',
  add column if not exists radar_palabras_clave text[] not null default '{}',
  add column if not exists radar_presupuesto_min numeric,
  add column if not exists radar_presupuesto_max numeric;
```

- [ ] **Step 2: Tabla de anuncios captados**

Crea `apps/ialimp/prisma/migrations/add_concursos_radar_anuncios.sql`:

```sql
-- Radar PLACSP (F7): matches captados por empresa, con dedupe e idempotencia.
create table if not exists concursos_radar_anuncios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  dedupe_key text not null,
  anuncio jsonb not null,
  puntuacion int not null default 0,
  motivos jsonb not null default '[]',
  visto boolean not null default false,
  created_at timestamptz not null default now(),
  unique (empresa_id, dedupe_key)
);
create index if not exists idx_radar_anuncios_empresa
  on concursos_radar_anuncios (empresa_id, created_at desc);
```

- [ ] **Step 3: Commit**

```bash
cd /home/user/central
git add apps/ialimp/prisma/migrations/add_concursos_radar_criterios.sql apps/ialimp/prisma/migrations/add_concursos_radar_anuncios.sql
git commit -m "feat(ialimp): migraciones del radar PLACSP (criterios + anuncios) (F7)"
```

---

## Task 5: Endpoint de criterios `GET/PUT /radar/criterios`

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/radar/criterios/route.ts`

- [ ] **Step 1: Implementar**

Crea `apps/ialimp/app/api/admin/concursos/radar/criterios/route.ts` (sigue el patrón de `concursos/perfil/route.ts`):

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Criterios del radar PLACSP por empresa (F7). Viven en concursos_perfil_empresa.

export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT radar_activo, radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  const r = rows[0]
  return NextResponse.json({
    criterios: {
      activo: r?.radar_activo ?? false,
      cpv: r?.radar_cpv ?? [],
      palabras_clave: r?.radar_palabras_clave ?? [],
      presupuesto_min: r?.radar_presupuesto_min ?? null,
      presupuesto_max: r?.radar_presupuesto_max ?? null,
    },
  })
}

export async function PUT(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const cpv: string[] = Array.isArray(b.cpv) ? b.cpv.map((x: any) => String(x).trim()).filter(Boolean) : []
  const kws: string[] = Array.isArray(b.palabras_clave) ? b.palabras_clave.map((x: any) => String(x).trim()).filter(Boolean) : []
  const min = b.presupuesto_min === '' || b.presupuesto_min == null ? null : Number(b.presupuesto_min)
  const max = b.presupuesto_max === '' || b.presupuesto_max == null ? null : Number(b.presupuesto_max)

  // El perfil puede no existir aún: upsert mínimo creando la fila si hace falta.
  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO concursos_perfil_empresa (empresa_id, razon_social, nif, radar_activo, radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max, actualizado_en)
    VALUES (${empresa_id}::uuid, '', '', ${b.activo === true}, ${cpv}::text[], ${kws}::text[], ${min}, ${max}, now())
    ON CONFLICT (empresa_id) DO UPDATE SET
      radar_activo = EXCLUDED.radar_activo,
      radar_cpv = EXCLUDED.radar_cpv,
      radar_palabras_clave = EXCLUDED.radar_palabras_clave,
      radar_presupuesto_min = EXCLUDED.radar_presupuesto_min,
      radar_presupuesto_max = EXCLUDED.radar_presupuesto_max,
      actualizado_en = now()
  `)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (puede abortar luego en "Collecting page data" por `JWT_SECRET` ausente — env, no código).

- [ ] **Step 3: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/api/admin/concursos/radar/criterios/route.ts
git commit -m "feat(ialimp): endpoint de criterios del radar (F7)"
```

---

## Task 6: Endpoints de lista y "visto"

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/radar/route.ts`
- Create: `apps/ialimp/app/api/admin/concursos/radar/visto/route.ts`

- [ ] **Step 1: Lista de matches**

Crea `apps/ialimp/app/api/admin/concursos/radar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Lista de anuncios captados por el radar para la empresa. ?no_vistos=1 para filtrar.

export async function GET(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const soloNoVistos = new URL(req.url).searchParams.get('no_vistos') === '1'
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, anuncio, puntuacion, motivos, visto, created_at
    FROM concursos_radar_anuncios
    WHERE empresa_id = ${empresa_id}::uuid
      ${soloNoVistos ? Prisma.sql`AND visto = false` : Prisma.empty}
    ORDER BY created_at DESC
    LIMIT 200
  `)
  const noVistos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int AS n FROM concursos_radar_anuncios
    WHERE empresa_id = ${empresa_id}::uuid AND visto = false
  `)
  return NextResponse.json({ anuncios: rows, no_vistos: noVistos[0]?.n ?? 0 })
}
```

- [ ] **Step 2: Marcar visto**

Crea `apps/ialimp/app/api/admin/concursos/radar/visto/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Marca un anuncio del radar como visto (scope empresa_id).

export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE concursos_radar_anuncios SET visto = true
    WHERE id = ${String(b.id)}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (puede abortar luego en "Collecting page data" por `JWT_SECRET` — env, no código).

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/api/admin/concursos/radar/route.ts apps/ialimp/app/api/admin/concursos/radar/visto/route.ts
git commit -m "feat(ialimp): endpoints de lista y visto del radar (F7)"
```

---

## Task 7: Lógica compartida de captación (helper) + endpoint de import manual

Para no duplicar entre el cron y el import manual, extrae un helper que, dado un XML y los criterios de una empresa, inserta los matches nuevos.

**Files:**
- Modify: `apps/ialimp/lib/concursos-radar.ts` (añade `capturarMatches`)
- Create: `apps/ialimp/app/api/admin/concursos/radar/importar/route.ts`

- [ ] **Step 1: Añadir el helper de captación (puro sobre datos, recibe el `insert`)**

Primero, en la zona de imports (ARRIBA) de `apps/ialimp/lib/concursos-radar.ts`, junto al `import type { AnuncioRadar }` ya existente, añade los imports de valor del módulo:

```ts
import { filtrarRadar, coincideRadar } from '@iarest/module-concursos'
import type { CriteriosRadar } from '@iarest/module-concursos'
```

Y al FINAL del fichero, añade el helper:

```ts
/** Un match listo para insertar (lo persiste el llamante con su Prisma). */
export interface MatchRadar {
  dedupe_key: string
  anuncio: AnuncioPlacsp
  puntuacion: number
  motivos: string[]
}

/**
 * Empareja los anuncios de un XML ATOM con los criterios de una empresa y
 * devuelve los matches (con puntuación y motivos) listos para insertar.
 * Puro: no toca BD ni red. La persistencia (dedupe) la hace el llamante.
 */
export function matchesDeAtom(xml: string, criterios: CriteriosRadar): MatchRadar[] {
  const anuncios = parsearAtomPlacsp(xml)
  const casan = filtrarRadar(anuncios, criterios) as AnuncioPlacsp[]
  return casan.map(a => {
    const r = coincideRadar(a, criterios)
    return { dedupe_key: dedupeKey(a), anuncio: a, puntuacion: r.puntuacion, motivos: r.motivos }
  })
}
```

- [ ] **Step 2: Endpoint de import manual**

Crea `apps/ialimp/app/api/admin/concursos/radar/importar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { matchesDeAtom } from '@/lib/concursos-radar'
import type { CriteriosRadar } from '@iarest/module-concursos'

export const maxDuration = 60

// Import manual: recibe un ATOM (campo `xml`), lo empareja con los criterios de
// la empresa y guarda los matches nuevos. Devuelve cuántos se añadieron.

export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const xml = String(b?.xml ?? '')
  if (!xml.trim()) return NextResponse.json({ error: 'Falta el ATOM (campo xml)' }, { status: 400 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  const r = rows[0] ?? {}
  const criterios: CriteriosRadar = {
    cpv: r.radar_cpv ?? [],
    palabras_clave: r.radar_palabras_clave ?? [],
    presupuesto_min: r.radar_presupuesto_min ?? undefined,
    presupuesto_max: r.radar_presupuesto_max ?? undefined,
  }

  const matches = matchesDeAtom(xml, criterios)
  let nuevos = 0
  for (const m of matches) {
    const res = await prisma.$executeRaw(Prisma.sql`
      INSERT INTO concursos_radar_anuncios (empresa_id, dedupe_key, anuncio, puntuacion, motivos)
      VALUES (${empresa_id}::uuid, ${m.dedupe_key}, ${JSON.stringify(m.anuncio)}::jsonb, ${m.puntuacion}, ${JSON.stringify(m.motivos)}::jsonb)
      ON CONFLICT (empresa_id, dedupe_key) DO NOTHING
    `)
    nuevos += Number(res) > 0 ? 1 : 0
  }
  return NextResponse.json({ ok: true, encontrados: matches.length, nuevos })
}
```

- [ ] **Step 3: Test del helper + build**

Añade a `apps/ialimp/lib/concursos-radar.test.ts`:

```ts
import { matchesDeAtom } from './concursos-radar.ts'

test('matchesDeAtom: filtra por criterios y trae puntuación + dedupe_key', () => {
  const m = matchesDeAtom(xml, { cpv: ['9091'], palabras_clave: ['limpieza'] })
  assert.equal(m.length, 1)                 // solo la de limpieza
  assert.equal(m[0].dedupe_key, '11111/2026')
  assert.ok(m[0].puntuacion > 0)
  assert.ok(m[0].motivos.length > 0)
})
```

Run: `cd /home/user/central/apps/ialimp && node --test lib/concursos-radar.test.ts && npm run build`
Expected: tests PASS (4); build `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/ialimp/lib/concursos-radar.ts apps/ialimp/lib/concursos-radar.test.ts apps/ialimp/app/api/admin/concursos/radar/importar/route.ts
git commit -m "feat(ialimp): captación de matches (helper puro) + import manual de ATOM (F7)"
```

---

## Task 8: Cron del radar + `vercel.json`

**Files:**
- Create: `apps/ialimp/app/api/cron/concursos-radar/route.ts`
- Modify: `apps/ialimp/vercel.json`

- [ ] **Step 1: Implementar el cron**

Crea `apps/ialimp/app/api/cron/concursos-radar/route.ts` (multi-tenant, patrón `informes/cron`; descarga el ATOM una vez y filtra por empresa):

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { matchesDeAtom } from '@/lib/concursos-radar'
import type { CriteriosRadar } from '@iarest/module-concursos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FEED_URL = process.env.PLACSP_FEED_URL
  || 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom'
const MAX_PAGINAS = 3

/** Descarga hasta MAX_PAGINAS del ATOM siguiendo <link rel="next">, concatenadas. */
async function descargarAtom(): Promise<string> {
  let url: string | null = FEED_URL
  const partes: string[] = []
  for (let i = 0; i < MAX_PAGINAS && url; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ialimp-radar/1.0' }, cache: 'no-store' })
    if (!res.ok) break
    const xml = await res.text()
    partes.push(xml)
    const m = xml.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    url = m ? m[1] : null
  }
  return partes.join('\n')
}

export async function GET() {
  let xml = ''
  try { xml = await descargarAtom() }
  catch (e: any) { return NextResponse.json({ ok: false, error: 'fetch ATOM: ' + (e?.message || e) }, { status: 200 }) }
  if (!xml.trim()) return NextResponse.json({ ok: true, empresas: 0, nuevos: 0, nota: 'feed vacío' })

  const empresas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT empresa_id, radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max
    FROM concursos_perfil_empresa WHERE radar_activo = true
  `)

  let totalNuevos = 0
  for (const e of empresas) {
    const criterios: CriteriosRadar = {
      cpv: e.radar_cpv ?? [],
      palabras_clave: e.radar_palabras_clave ?? [],
      presupuesto_min: e.radar_presupuesto_min ?? undefined,
      presupuesto_max: e.radar_presupuesto_max ?? undefined,
    }
    const matches = matchesDeAtom(xml, criterios)
    for (const m of matches) {
      const res = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO concursos_radar_anuncios (empresa_id, dedupe_key, anuncio, puntuacion, motivos)
        VALUES (${e.empresa_id}::uuid, ${m.dedupe_key}, ${JSON.stringify(m.anuncio)}::jsonb, ${m.puntuacion}, ${JSON.stringify(m.motivos)}::jsonb)
        ON CONFLICT (empresa_id, dedupe_key) DO NOTHING
      `)
      totalNuevos += Number(res) > 0 ? 1 : 0
    }
  }
  return NextResponse.json({ ok: true, empresas: empresas.length, nuevos: totalNuevos })
}
```

- [ ] **Step 2: Añadir el cron a `vercel.json`**

En `apps/ialimp/vercel.json`, dentro del array `"crons"`, añade una entrada más (cada 6 h):

```json
    {
      "path": "/api/cron/concursos-radar",
      "schedule": "0 */6 * * *"
    }
```

(Añádela como un objeto más del array `crons`, respetando las comas del JSON.)

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (puede abortar luego en "Collecting page data" por `JWT_SECRET` — env, no código). Verifica además que `vercel.json` sigue siendo JSON válido: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('json ok')"`.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/api/cron/concursos-radar/route.ts apps/ialimp/vercel.json
git commit -m "feat(ialimp): cron del radar PLACSP cada 6h (F7)"
```

---

## Task 9: OCR de pliegos escaneados (`nimVision`)

**Files:**
- Create: `apps/ialimp/lib/concursos-ocr.ts`
- Modify: `apps/ialimp/app/api/admin/concursos/analizar/route.ts`

- [ ] **Step 1: Implementar el rasterizador + OCR**

Crea `apps/ialimp/lib/concursos-ocr.ts`:

```ts
// OCR de pliegos escaneados: rasteriza el PDF a PNG por página y los transcribe
// con la visión IA de la casa (nimVision). Solo se usa cuando pdf-parse no saca
// texto (necesitaOcr). Vive en la app (red/binarios/secretos).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { nimVision } from '@iarest/core-ai'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || ''
const VISION_MODEL = 'meta/llama-3.2-90b-vision-instruct'

const TRANSCRIBE_SYS =
  'Eres un OCR experto en documentos administrativos españoles (pliegos de licitación).'
const TRANSCRIBE_USER =
  'Transcribe LITERALMENTE todo el texto de esta página, respetando saltos de línea y sin resumir, interpretar ni añadir nada.'

/** Rasteriza hasta `maxPaginas` páginas del PDF a PNG (base64). */
export async function rasterizarPdf(buffer: Buffer, maxPaginas = 12): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise
  const out: string[] = []
  const n = Math.min(doc.numPages, maxPaginas)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx as any, viewport }).promise
    out.push(canvas.toBuffer('image/png').toString('base64'))
  }
  return out
}

/** Extrae el texto de un PDF escaneado pasando cada página por nimVision. */
export async function ocrPaginasPliego(buffer: Buffer): Promise<string> {
  if (!NVIDIA_API_KEY) return ''
  const imagenes = await rasterizarPdf(buffer)
  const config = { apiKey: NVIDIA_API_KEY, visionModel: VISION_MODEL }
  const partes: string[] = []
  for (const data of imagenes) {
    try {
      const txt = await nimVision(config, TRANSCRIBE_SYS, [{ data, mediaType: 'image/png' }], TRANSCRIBE_USER)
      if (txt) partes.push(txt)
    } catch { /* una página fallida no tumba el resto */ }
  }
  return partes.join('\n\n').trim()
}
```

- [ ] **Step 2: Integrar en el análisis del pliego**

En `apps/ialimp/app/api/admin/concursos/analizar/route.ts`:

1. Añade los imports arriba (junto a los existentes):

```ts
import { necesitaOcr } from '@iarest/module-concursos'
import { ocrPaginasPliego } from '@/lib/concursos-ocr'
```

2. Localiza la línea donde se obtiene el texto del PDF (la llamada a `extraerTextoPdf(...)`, que asigna a una variable de texto — p.ej. `const texto = await extraerTextoPdf(buffer)`). Justo DESPUÉS de obtener ese texto y ANTES de llamar a `analizarPliego(...)`, inserta:

```ts
    let ocr_aplicado = false
    if (necesitaOcr(texto)) {
      const textoOcr = await ocrPaginasPliego(buffer)
      if (textoOcr) { texto = textoOcr; ocr_aplicado = true }
    }
```

   - Si `texto` está declarado con `const`, cámbialo a `let` para poder reasignarlo.
   - `buffer` es el `Buffer` del PDF que ya se usa en `extraerTextoPdf(buffer)`; reutiliza esa misma variable.

3. En el objeto JSON que devuelve la ruta tras analizar, añade el flag `ocr_aplicado` (junto a la ficha/checklist que ya devuelve), por ejemplo: `return NextResponse.json({ ...respuestaActual, ocr_aplicado })`. Respeta la forma exacta de la respuesta actual: añade solo la propiedad `ocr_aplicado` sin quitar nada.

- [ ] **Step 3: Build de ialimp**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully`. Si el build falla por `pdfjs-dist`/`@napi-rs/canvas` (resolución del módulo legacy o binario), revisa el import (`pdfjs-dist/legacy/build/pdf.mjs`); si persiste en el runtime de la preview, ver "fallback OCR" en el spec. Pega la línea de Compiled.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/ialimp/lib/concursos-ocr.ts apps/ialimp/app/api/admin/concursos/analizar/route.ts
git commit -m "feat(ialimp): OCR de pliegos escaneados con nimVision (F7)"
```

---

## Task 10: UI — panel "Radar de oportunidades" + aviso OCR

**Files:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`

- [ ] **Step 1: Releer la página para imitar patrones**

Run: `sed -n '1,60p' apps/ialimp/app/admin/concursos/page.tsx`
Fíjate en: la `const C` (paleta `var(--brand-*)`), `FONT`, cómo se hacen los `fetch` a `/api/admin/concursos/...`, y dónde montar una sección nueva (sobre el listado o como bloque propio).

- [ ] **Step 2: Añadir el componente del radar**

En `apps/ialimp/app/admin/concursos/page.tsx`, añade un componente `RadarPanel` y móntalo en la página (cerca de la cabecera de la pantalla de concursos). Usa la paleta `C` y `FONT` ya existentes en el fichero:

```tsx
function RadarPanel() {
  const [crit, setCrit] = useState<any>({ activo:false, cpv:[], palabras_clave:[], presupuesto_min:'', presupuesto_max:'' });
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [noVistos, setNoVistos] = useState(0);
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    const [c, a] = await Promise.all([
      fetch('/api/admin/concursos/radar/criterios').then(r=>r.json()).catch(()=>null),
      fetch('/api/admin/concursos/radar').then(r=>r.json()).catch(()=>null),
    ]);
    if (c?.criterios) setCrit({
      activo: c.criterios.activo,
      cpv: c.criterios.cpv ?? [],
      palabras_clave: c.criterios.palabras_clave ?? [],
      presupuesto_min: c.criterios.presupuesto_min ?? '',
      presupuesto_max: c.criterios.presupuesto_max ?? '',
    });
    if (a) { setAnuncios(a.anuncios ?? []); setNoVistos(a.no_vistos ?? 0); }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    setCargando(true);
    await fetch('/api/admin/concursos/radar/criterios', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        activo: crit.activo,
        cpv: typeof crit.cpv === 'string' ? crit.cpv.split(',').map((s:string)=>s.trim()).filter(Boolean) : crit.cpv,
        palabras_clave: typeof crit.palabras_clave === 'string' ? crit.palabras_clave.split(',').map((s:string)=>s.trim()).filter(Boolean) : crit.palabras_clave,
        presupuesto_min: crit.presupuesto_min, presupuesto_max: crit.presupuesto_max,
      }),
    });
    setCargando(false); cargar();
  };

  const marcarVisto = async (id:string) => {
    await fetch('/api/admin/concursos/radar/visto', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    cargar();
  };

  const cpvStr = Array.isArray(crit.cpv) ? crit.cpv.join(', ') : crit.cpv;
  const kwStr = Array.isArray(crit.palabras_clave) ? crit.palabras_clave.join(', ') : crit.palabras_clave;

  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14 }}>
      <strong style={{ fontSize:15 }}>📡 Radar de oportunidades{noVistos>0 && <span style={{ marginLeft:8, background:'#b91c1c', color:'#fff', borderRadius:999, padding:'1px 8px', fontSize:12 }}>{noVistos} nuevas</span>}</strong>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, margin:'10px 0' }}>
        <input placeholder="CPV de interés (coma)" value={cpvStr} onChange={e=>setCrit({...crit, cpv:e.target.value})} />
        <input placeholder="Palabras clave (coma)" value={kwStr} onChange={e=>setCrit({...crit, palabras_clave:e.target.value})} />
        <input placeholder="Presupuesto mín (€)" value={crit.presupuesto_min} onChange={e=>setCrit({...crit, presupuesto_min:e.target.value})} />
        <input placeholder="Presupuesto máx (€)" value={crit.presupuesto_max} onChange={e=>setCrit({...crit, presupuesto_max:e.target.value})} />
      </div>
      <label style={{ display:'flex', gap:6, alignItems:'center', fontSize:13 }}>
        <input type="checkbox" checked={!!crit.activo} onChange={e=>setCrit({...crit, activo:e.target.checked})} /> Radar activo (revisa PLACSP cada 6 h)
      </label>
      <button onClick={guardar} disabled={cargando} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer' }}>{cargando?'Guardando…':'Guardar criterios'}</button>

      <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
        {anuncios.length===0 && <span style={{ color:C.muted, fontSize:13 }}>Aún no hay licitaciones captadas.</span>}
        {anuncios.map(a => (
          <div key={a.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:10, opacity: a.visto?0.6:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <strong style={{ fontSize:14 }}>{a.anuncio?.titulo}</strong>
              <span style={{ fontSize:12, color:C.muted }}>{a.puntuacion} pts</span>
            </div>
            <div style={{ fontSize:12, color:C.muted }}>{a.anuncio?.organo}{a.anuncio?.presupuesto?` · ${Number(a.anuncio.presupuesto).toLocaleString('es-ES')} €`:''}</div>
            <div style={{ fontSize:12, marginTop:4 }}>{(a.motivos||[]).join(' · ')}</div>
            <div style={{ display:'flex', gap:10, marginTop:6 }}>
              {a.anuncio?.url && <a href={a.anuncio.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:C.indigo }}>Ver anuncio ↗</a>}
              {!a.visto && <button onClick={()=>marcarVisto(a.id)} style={{ fontSize:12, background:'transparent', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 8px', cursor:'pointer' }}>Marcar visto</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Móntalo en el render de la página de concursos (p.ej. justo antes del listado/cabecera existente): `<RadarPanel />`. Asegúrate de que `useState`/`useEffect` están importados (ya lo estarán si la página es cliente; si no, añade `import { useState, useEffect } from 'react'`).

- [ ] **Step 3: Aviso de OCR en el análisis**

En la misma página, donde se muestra el resultado de analizar un pliego (la `FichaView` o equivalente que recibe la respuesta de `/analizar`), añade, si la respuesta trae `ocr_aplicado === true`, un aviso:

```tsx
{ficha?.ocr_aplicado && (
  <div style={{ background:'#eff6ff', color:'#1e40af', borderRadius:8, padding:'6px 10px', fontSize:12, marginBottom:8 }}>
    📄 Documento escaneado — texto extraído con OCR (visión IA).
  </div>
)}
```

(Adapta `ficha?.ocr_aplicado` al nombre real de la variable que guarda la respuesta del análisis en esa página.)

- [ ] **Step 4: Build + tests del módulo (sanity)**

Run: `cd /home/user/central/apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully` (aborta luego por `JWT_SECRET` — env); módulo 79/79 verde (no se ha tocado).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/admin/concursos/page.tsx
git commit -m "feat(ialimp): panel de radar de oportunidades + aviso OCR en la ficha (F7)"
```

---

## Task 11: Memoria, docs y PR

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada: **Infra F7 — Radar PLACSP en vivo + OCR**. Resume: parser ATOM puro (`lib/concursos-radar.ts`, tests `node --test`), migraciones (`concursos_perfil_empresa` ampliada + `concursos_radar_anuncios`), endpoints (`radar/criterios`, `radar`, `radar/visto`, `radar/importar`), cron `/api/cron/concursos-radar` cada 6 h (`PLACSP_FEED_URL` configurable, default público), OCR con `nimVision` (`lib/concursos-ocr.ts`, rasteriza con pdfjs+napi-canvas) y panel "Radar de oportunidades" + aviso OCR. **Pendiente de Alberto:** aplicar las 2 migraciones; validar la rasterización OCR en la preview de Vercel; (opcional) ajustar `PLACSP_FEED_URL`.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de **Infra F7**: radar PLACSP por cron (sindicación ATOM paginada, `PLACSP_FEED_URL`) con aviso in-app de no vistos, + OCR de pliegos escaneados vía `nimVision`. Sin web-push (push es de limpiadoras). Migraciones nuevas: `add_concursos_radar_criterios.sql`, `add_concursos_radar_anuncios.sql`.

- [ ] **Step 3: Commit y push**

```bash
cd /home/user/central
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión infra F7 (radar PLACSP + OCR)"
git push -u origin claude/concursos-radar-ocr-infra
```

- [ ] **Step 4: Crear el PR (borrador)**

Crea un PR en draft de `claude/concursos-radar-ocr-infra` → `main` titulado "Infra F7: Radar PLACSP en vivo + OCR de pliegos (concursos)", con cuerpo resumiendo lo anterior y la lista de pendientes de Alberto (2 migraciones + validar OCR en preview). Usa la herramienta de GitHub MCP.

---

## Notas de cierre / verificación

- **Lo testeable con `node --test`:** parser ATOM (`parsearAtomPlacsp`), `dedupeKey`, `matchesDeAtom` (contra el fixture). El módulo `@iarest/module-concursos` sigue 79/79 y NO se toca.
- **Lo verificable solo en build/preview:** endpoints, cron, OCR/rasterización, UI. El build de ialimp debe dar `✓ Compiled successfully` en cada tarea que toca app.
- **Riesgo conocido (señalado):** la rasterización PDF→imagen (`pdfjs-dist` legacy + `@napi-rs/canvas`) en el runtime serverless de Vercel; validar en la preview. Fallback documentado en el spec (subir páginas como imágenes).
- **Pendiente de Alberto (ops):** aplicar `add_concursos_radar_criterios.sql` y `add_concursos_radar_anuncios.sql` en Supabase; (opcional) `PLACSP_FEED_URL`.
- **Aviso del radar:** in-app (contador de no vistos), no web-push (las suscripciones push de ialimp son de limpiadoras). Email al `empresas.email` queda como mejora futura.
