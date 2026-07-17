# Empresas en dificultad — Fase 1 (plataforma) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a `apps/plataforma` una sección **Empresas** que ingiere eventos de dificultad de BORME (gratis), los puntúa, dibuja un radar de sectores y los lista filtrables por sector/provincia — con un modelo de **roles por sección** para poder dar a un usuario acceso SOLO a Empresas.

**Architecture:** Se replica el patrón consolidado de plataforma (server `page.tsx` con guarda de sesión → `Client` → `/api/*` → `lib/*`), Prisma sobre Postgres de Supabase (rol `prisma_plataforma`, BYPASSRLS), cron Vercel + `isCronAuthorized`, y pasarela IA `chatConDirector`. Se introduce un modelo de roles mínimo (columna `rol` en `cuentas`) para restringir el menú y las páginas.

**Tech Stack:** Next.js 15 (App Router), Prisma + Postgres (Supabase MCP para migraciones), TypeScript, Vitest (guardia de tests del repo), BORME datos-abiertos (`boe.es/datosabiertos/api/borme`).

**Fuera de esta fase (planes posteriores):** INE + Central de Balances (benchmarks reales del radar), enriquecimiento eInforma (balances + **filtro de facturación ≤2M**), agente conversacional NL→consulta, SABI. Fase 1 filtra por **sector (CNAE) y provincia**; la facturación llega con el enriquecimiento de pago.

---

## Estructura de archivos

**Crear:**
- `apps/plataforma/prisma/sql/2026-07-17_empresas.sql` — tablas `borme_eventos`, `sector_tendencias` + REVOKE.
- `apps/plataforma/prisma/sql/2026-07-17_cuentas_rol.sql` — columna `rol` en `cuentas`.
- `apps/plataforma/lib/borme.ts` — descarga + parseo BORME (puro, testeable).
- `apps/plataforma/lib/borme-ingesta.ts` — upsert de eventos en BD.
- `apps/plataforma/lib/empresas-scoring.ts` — score por empresa (puro).
- `apps/plataforma/lib/empresas-radar.ts` — agregación de radar por sector (puro sobre filas).
- `apps/plataforma/lib/empresas.ts` — queries de lectura para la UI.
- `apps/plataforma/app/api/cron/borme-ingesta/route.ts` — cron diario.
- `apps/plataforma/app/api/empresas/route.ts` — datos para la UI.
- `apps/plataforma/app/api/empresas/ingesta-manual/route.ts` — disparador manual (botón del panel).
- `apps/plataforma/app/(usuario)/empresas/page.tsx` — server page (guarda de sesión + rol).
- `apps/plataforma/app/(usuario)/empresas/EmpresasClient.tsx` — UI (radar + lista).
- `apps/plataforma/test/borme.test.ts`, `test/empresas-scoring.test.ts`, `test/empresas-radar.test.ts`.
- `apps/plataforma/test/fixtures/borme-sumario.json`, `test/fixtures/borme-anuncio.json`.

**Modificar:**
- `apps/plataforma/prisma/schema.prisma` — añadir `rol` a `Cuenta`.
- `apps/plataforma/lib/session.ts` — incluir `rol` en la sesión devuelta.
- `apps/plataforma/app/(usuario)/UserSidebar.tsx` — entrada "Empresas" + filtrado por rol.
- `apps/plataforma/vercel.json` — cron `borme-ingesta`.

---

## Task 1: Migración de BD — tablas de BORME/empresas

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-17_empresas.sql`

- [ ] **Step 1: Escribir la migración SQL**

```sql
-- 2026-07-17_empresas.sql
-- Fase 1 "Empresas en dificultad". Rol prisma_plataforma es BYPASSRLS → sin RLS.
-- NUNCA exponer por REST/anon (BD compartida con el cliente anon de ialimp).

CREATE TABLE IF NOT EXISTS public.borme_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key    text UNIQUE NOT NULL,        -- borme_id + acto, para idempotencia
  fecha         date NOT NULL,
  empresa       text NOT NULL,
  empresa_norm  text NOT NULL,               -- normalizada (mayúsculas, sin puntuación) para agrupar
  cif           text,                         -- casi nunca viene en BORME; puede ser null
  provincia     text,                         -- del registro mercantil que publica
  cnae          text,                         -- casi nunca en BORME; se rellena en enriquecimiento (Fase 2)
  tipo          text NOT NULL,                -- 'concurso' | 'disolucion' | 'ampliacion_capital' | 'cese' | 'otro'
  acto_raw      text,                         -- texto literal del acto
  borme_id      text NOT NULL,                -- id del anuncio BORME
  url           text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS borme_eventos_fecha_idx ON public.borme_eventos (fecha DESC);
CREATE INDEX IF NOT EXISTS borme_eventos_tipo_idx  ON public.borme_eventos (tipo);
CREATE INDEX IF NOT EXISTS borme_eventos_prov_idx  ON public.borme_eventos (provincia);
CREATE INDEX IF NOT EXISTS borme_eventos_emprnorm_idx ON public.borme_eventos (empresa_norm);

-- Tendencias por sector/periodo (Fase 1: derivadas de BORME por provincia; CNAE llega en Fase 2).
CREATE TABLE IF NOT EXISTS public.sector_tendencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo       text NOT NULL,               -- 'YYYY-MM'
  dimension     text NOT NULL,               -- 'provincia' (Fase 1) | 'cnae' (Fase 2)
  clave         text NOT NULL,               -- p.ej. 'Sevilla'
  constituciones int NOT NULL DEFAULT 0,
  concursos     int NOT NULL DEFAULT 0,
  disoluciones  int NOT NULL DEFAULT 0,
  calculado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo, dimension, clave)
);

REVOKE ALL ON public.borme_eventos    FROM anon, authenticated;
REVOKE ALL ON public.sector_tendencias FROM anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración por el MCP de Supabase**

Aplicar `2026-07-17_empresas.sql` con `mcp__Supabase__apply_migration` (name: `empresas_fase1`) sobre el proyecto de plataforma (`wswbehlcuxqxyinousql`), que corre como rol `postgres`.
Expected: sin error; `mcp__Supabase__list_tables` muestra `borme_eventos` y `sector_tendencias`.

- [ ] **Step 3: Verificar el REVOKE**

Run (vía `mcp__Supabase__execute_sql`): `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='borme_eventos' AND grantee IN ('anon','authenticated');`
Expected: 0 filas.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-17_empresas.sql
git commit -m "feat(empresas): migración tablas borme_eventos + sector_tendencias"
```

---

## Task 2: Modelo de roles — columna `rol` en `cuentas`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-17_cuentas_rol.sql`
- Modify: `apps/plataforma/prisma/schema.prisma` (modelo `Cuenta`)
- Modify: `apps/plataforma/lib/session.ts`

- [ ] **Step 1: Escribir la migración de la columna**

```sql
-- 2026-07-17_cuentas_rol.sql
-- rol NULL = cuenta completa (comportamiento actual). 'empresas' = solo la sección Empresas.
ALTER TABLE public.cuentas ADD COLUMN IF NOT EXISTS rol text;
```

- [ ] **Step 2: Aplicar por MCP Supabase** (`apply_migration`, name `cuentas_rol`). Expected: sin error.

- [ ] **Step 3: Reflejar en Prisma schema**

En `apps/plataforma/prisma/schema.prisma`, dentro de `model Cuenta`, añadir bajo los campos existentes:
```prisma
  rol          String?
```

- [ ] **Step 4: Regenerar cliente Prisma**

Run: `cd apps/plataforma && npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 5: Exponer `rol` en la sesión**

En `apps/plataforma/lib/session.ts`, en `getSession()`, ampliar el `select` de la cuenta para incluir `rol: true` y devolverlo en el objeto de sesión (añadir `rol: cuenta.rol ?? null` al retorno y `rol: string | null` a su tipo).

- [ ] **Step 6: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-17_cuentas_rol.sql apps/plataforma/prisma/schema.prisma apps/plataforma/lib/session.ts
git commit -m "feat(empresas): rol por seccion en cuentas + rol en la sesion"
```

---

## Task 3: Parser BORME (puro, con fixtures)

BORME datos-abiertos: sumario diario en `https://www.boe.es/datosabiertos/api/borme/sumario/{YYYYMMDD}` (JSON con `Accept: application/json`), que enlaza anuncios; cada anuncio tiene un texto con el "acto" (Constitución, Declaración de concurso, Disolución, Ampliación de capital, Ceses/Nombramientos…). El parser NO toca red (recibe el JSON ya descargado) para ser testeable.

**Files:**
- Create: `apps/plataforma/lib/borme.ts`
- Create: `apps/plataforma/test/borme.test.ts`
- Create: `apps/plataforma/test/fixtures/borme-anuncio.json`

- [ ] **Step 1: Capturar una fixture real (spike)**

Descargar un sumario real y un anuncio para fijar la forma exacta del JSON:
Run: `curl -sS -H 'Accept: application/json' 'https://www.boe.es/datosabiertos/api/borme/sumario/20260715' -o apps/plataforma/test/fixtures/borme-sumario.json`
Guardar además un anuncio de ejemplo en `borme-anuncio.json`. Inspeccionar los nombres de campo reales y ajustar el parser al shape observado. Expected: JSON válido descargado.

- [ ] **Step 2: Escribir el test del clasificador de actos (falla)**

```ts
// test/borme.test.ts
import { describe, it, expect } from 'vitest'
import { clasificarActo, normalizarEmpresa } from '../lib/borme'

describe('clasificarActo', () => {
  it('detecta concurso', () => {
    expect(clasificarActo('Declaración de concurso de acreedores')).toBe('concurso')
  })
  it('detecta disolución', () => {
    expect(clasificarActo('Disolución. Extinción')).toBe('disolucion')
  })
  it('detecta ampliación de capital', () => {
    expect(clasificarActo('Ampliación de capital. Suscripción')).toBe('ampliacion_capital')
  })
  it('lo demás es otro', () => {
    expect(clasificarActo('Nombramientos. Administrador único')).toBe('cese')
    expect(clasificarActo('Datos registrales')).toBe('otro')
  })
})

describe('normalizarEmpresa', () => {
  it('mayúsculas sin puntuación ni forma societaria', () => {
    expect(normalizarEmpresa('Talleres López, S.L.')).toBe('TALLERES LOPEZ')
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `cd apps/plataforma && npx vitest run test/borme.test.ts`
Expected: FAIL (módulo/funciones no existen).

- [ ] **Step 4: Implementar `lib/borme.ts`**

```ts
// lib/borme.ts
export type TipoEvento = 'concurso' | 'disolucion' | 'ampliacion_capital' | 'cese' | 'otro'

const REGLAS: Array<[RegExp, TipoEvento]> = [
  [/concurso/i, 'concurso'],
  [/disoluci[oó]n|extinci[oó]n|liquidaci[oó]n/i, 'disolucion'],
  [/ampliaci[oó]n de capital/i, 'ampliacion_capital'],
  [/cese|nombramiento|dimisi[oó]n/i, 'cese'],
]

export function clasificarActo(acto: string): TipoEvento {
  for (const [re, tipo] of REGLAS) if (re.test(acto)) return tipo
  return 'otro'
}

export function normalizarEmpresa(nombre: string): string {
  return nombre
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(S L U|S L|S A U|S A|SOCIEDAD LIMITADA|SOCIEDAD AN[OÓ]NIMA|SLU|SL|SAU|SA)\b/g, ' ')
    .replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Estructura del evento normalizado que consume la ingesta.
export interface EventoBorme {
  dedupeKey: string; fecha: string; empresa: string; empresaNorm: string
  provincia: string | null; tipo: TipoEvento; actoRaw: string; bormeId: string; url: string | null
}

// parseAnuncio recibe un anuncio ya descargado (shape confirmado en el spike) y devuelve sus eventos.
// Ajustar las rutas de campo (a.empresa, a.actos, a.id...) al JSON real de la fixture.
export function parseAnuncio(a: any, fecha: string): EventoBorme[] {
  const empresa: string = a.titulo ?? a.empresa ?? ''
  const provincia: string | null = a.provincia ?? null
  const bormeId: string = String(a.identificador ?? a.id ?? '')
  const url: string | null = a.url_xml ?? a.url ?? null
  const actos: string[] = Array.isArray(a.actos) ? a.actos : [String(a.acto ?? a.texto ?? '')]
  return actos.map((actoRaw) => {
    const tipo = clasificarActo(actoRaw)
    return {
      dedupeKey: `${bormeId}::${tipo}::${normalizarEmpresa(empresa)}`,
      fecha, empresa, empresaNorm: normalizarEmpresa(empresa),
      provincia, tipo, actoRaw, bormeId, url,
    }
  })
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `cd apps/plataforma && npx vitest run test/borme.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/plataforma/lib/borme.ts apps/plataforma/test/borme.test.ts apps/plataforma/test/fixtures/
git commit -m "feat(empresas): parser BORME puro (clasificar acto + normalizar) con fixtures"
```

---

## Task 4: Ingesta BORME (descarga + upsert)

**Files:**
- Create: `apps/plataforma/lib/borme-ingesta.ts`

- [ ] **Step 1: Implementar descarga + upsert**

```ts
// lib/borme-ingesta.ts
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { parseAnuncio, type EventoBorme } from '@/lib/borme'

const BASE = 'https://www.boe.es/datosabiertos/api/borme'

// Descarga el sumario de una fecha (YYYYMMDD) y devuelve los anuncios (shape confirmado en el spike).
export async function descargarSumario(fechaYYYYMMDD: string): Promise<any[]> {
  const r = await fetch(`${BASE}/sumario/${fechaYYYYMMDD}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`BORME sumario ${fechaYYYYMMDD}: HTTP ${r.status}`)
  const j = await r.json()
  // Ajustar la ruta al array de anuncios según la fixture del spike (Task 3, Step 1).
  return (j?.data?.sumario?.diario?.[0]?.seccion ?? []).flatMap((s: any) => s?.item ?? [])
}

export async function ingerirEventos(eventos: EventoBorme[]): Promise<number> {
  let n = 0
  for (const e of eventos) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO borme_eventos (dedupe_key, fecha, empresa, empresa_norm, provincia, tipo, acto_raw, borme_id, url)
      VALUES (${e.dedupeKey}, ${e.fecha}::date, ${e.empresa}, ${e.empresaNorm}, ${e.provincia}, ${e.tipo}, ${e.actoRaw}, ${e.bormeId}, ${e.url})
      ON CONFLICT (dedupe_key) DO UPDATE SET acto_raw = EXCLUDED.acto_raw, actualizado_en = now()`)
    n++
  }
  return n
}

// isoDate: 'YYYY-MM-DD' (para columna fecha). yyyymmdd: para la URL del sumario.
export async function ingestaDia(isoDate: string): Promise<{ eventos: number }> {
  const yyyymmdd = isoDate.replace(/-/g, '')
  const anuncios = await descargarSumario(yyyymmdd)
  const eventos = anuncios.flatMap((a) => parseAnuncio(a, isoDate))
    .filter((e) => e.tipo !== 'otro') // Fase 1: solo eventos relevantes
  const eventos2 = await ingerirEventos(eventos)
  return { eventos: eventos2 }
}
```

- [ ] **Step 2: Smoke test manual del parseo (sin red) contra la fixture**

Añadir a `test/borme.test.ts` un test que carga `fixtures/borme-sumario.json`, aplica el mismo `flatMap(parseAnuncio)` y comprueba que devuelve ≥1 evento con `tipo` válido y `dedupeKey` no vacío. Ajustar la ruta de extracción de anuncios hasta que pase.
Run: `cd apps/plataforma && npx vitest run test/borme.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/borme-ingesta.ts apps/plataforma/test/borme.test.ts
git commit -m "feat(empresas): ingesta BORME (descarga sumario + upsert idempotente)"
```

---

## Task 5: Scoring de empresa (puro)

Agrupa eventos por `empresa_norm` y calcula un score 0–100 con motivo legible.

**Files:**
- Create: `apps/plataforma/lib/empresas-scoring.ts`
- Create: `apps/plataforma/test/empresas-scoring.test.ts`

- [ ] **Step 1: Test (falla)**

```ts
// test/empresas-scoring.test.ts
import { describe, it, expect } from 'vitest'
import { puntuarEmpresa } from '../lib/empresas-scoring'

const base = { empresa: 'X SL', empresaNorm: 'X', provincia: 'Sevilla' }

describe('puntuarEmpresa', () => {
  it('concurso pesa mucho', () => {
    const r = puntuarEmpresa({ ...base, eventos: [{ tipo: 'concurso', fecha: '2026-07-01' }] })
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.motivo).toMatch(/concurso/i)
  })
  it('sin señales duras, score bajo', () => {
    const r = puntuarEmpresa({ ...base, eventos: [{ tipo: 'cese', fecha: '2026-07-01' }] })
    expect(r.score).toBeLessThan(40)
  })
  it('acumula señales', () => {
    const r = puntuarEmpresa({ ...base, eventos: [
      { tipo: 'concurso', fecha: '2026-07-01' }, { tipo: 'disolucion', fecha: '2026-07-02' }] })
    expect(r.score).toBeGreaterThan(
      puntuarEmpresa({ ...base, eventos: [{ tipo: 'concurso', fecha: '2026-07-01' }] }).score)
  })
})
```

- [ ] **Step 2: Verificar fallo** — Run: `npx vitest run test/empresas-scoring.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// lib/empresas-scoring.ts
import type { TipoEvento } from '@/lib/borme'

const PESOS: Record<TipoEvento, number> = {
  concurso: 70, disolucion: 45, ampliacion_capital: 20, cese: 10, otro: 0,
}
const ETIQUETA: Record<TipoEvento, string> = {
  concurso: 'concurso de acreedores', disolucion: 'disolución/extinción',
  ampliacion_capital: 'ampliación de capital (tocó financiación)', cese: 'cambios en administración', otro: '',
}

export interface EntradaScore {
  empresa: string; empresaNorm: string; provincia: string | null
  eventos: Array<{ tipo: TipoEvento; fecha: string }>
}
export interface ResultadoScore {
  empresa: string; empresaNorm: string; provincia: string | null
  score: number; motivo: string
}

export function puntuarEmpresa(e: EntradaScore): ResultadoScore {
  const tipos = new Set(e.eventos.map((x) => x.tipo))
  let score = 0
  for (const t of tipos) score += PESOS[t]
  score = Math.min(100, score)
  const motivo = [...tipos].filter((t) => t !== 'otro').map((t) => ETIQUETA[t]).join(' + ') || 'sin señales relevantes'
  return { empresa: e.empresa, empresaNorm: e.empresaNorm, provincia: e.provincia, score, motivo }
}
```

- [ ] **Step 4: Verificar** — Run: `npx vitest run test/empresas-scoring.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/empresas-scoring.ts apps/plataforma/test/empresas-scoring.test.ts
git commit -m "feat(empresas): motor de scoring de empresa (puro, TDD)"
```

---

## Task 6: Radar de sectores (agregación, puro)

Fase 1: agrega por **provincia** (dimensión disponible en BORME). Devuelve, por clave, el conteo de concursos/disoluciones/constituciones y una posición en el mapa de cuadrantes.

**Files:**
- Create: `apps/plataforma/lib/empresas-radar.ts`
- Create: `apps/plataforma/test/empresas-radar.test.ts`

- [ ] **Step 1: Test (falla)**

```ts
// test/empresas-radar.test.ts
import { describe, it, expect } from 'vitest'
import { agregarRadar } from '../lib/empresas-radar'

describe('agregarRadar', () => {
  it('cuenta por clave y clasifica cuadrante', () => {
    const filas = [
      { clave: 'Sevilla', tipo: 'concurso' }, { clave: 'Sevilla', tipo: 'concurso' },
      { clave: 'Sevilla', tipo: 'ampliacion_capital' }, { clave: 'Cádiz', tipo: 'cese' },
    ] as const
    const r = agregarRadar(filas as any)
    const sev = r.find((x) => x.clave === 'Sevilla')!
    expect(sev.concursos).toBe(2)
    expect(sev.dificultad).toBeGreaterThan(0)
    expect(['caza', 'declive', 'sano', 'ignorar']).toContain(sev.cuadrante)
  })
})
```

- [ ] **Step 2: Verificar fallo** — Run: `npx vitest run test/empresas-radar.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// lib/empresas-radar.ts
import type { TipoEvento } from '@/lib/borme'

export interface FilaRadar { clave: string; tipo: TipoEvento }
export interface PuntoRadar {
  clave: string; constituciones: number; concursos: number; disoluciones: number
  dificultad: number; crecimiento: number; cuadrante: 'caza' | 'declive' | 'sano' | 'ignorar'
}

// Fase 1 sin INE: 'crecimiento' se aproxima con constituciones netas (constituciones - bajas).
// En Fase 2 se sustituye por el índice real de INE/BdE.
export function agregarRadar(filas: FilaRadar[]): PuntoRadar[] {
  const m = new Map<string, { c: number; co: number; di: number }>()
  for (const f of filas) {
    const g = m.get(f.clave) ?? { c: 0, co: 0, di: 0 }
    if (f.tipo === 'concurso') g.co++
    else if (f.tipo === 'disolucion') g.di++
    else if (f.tipo === 'ampliacion_capital' || f.tipo === 'cese') { /* neutro Fase 1 */ }
    // 'constituciones' no viene como evento de dificultad; en Fase 1 se aproxima a 0 salvo que se ingiera el acto Constitución.
    m.set(f.clave, g)
  }
  return [...m.entries()].map(([clave, g]) => {
    const bajas = g.co + g.di
    const dificultad = bajas
    const crecimiento = g.c - bajas // aproximación Fase 1
    const cuadrante = crecimiento >= 0
      ? (dificultad > 0 ? 'caza' : 'sano')
      : (dificultad > 0 ? 'declive' : 'ignorar')
    return { clave, constituciones: g.c, concursos: g.co, disoluciones: g.di, dificultad, crecimiento, cuadrante }
  })
}
```

- [ ] **Step 4: Verificar** — Run: `npx vitest run test/empresas-radar.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/empresas-radar.ts apps/plataforma/test/empresas-radar.test.ts
git commit -m "feat(empresas): radar de sectores por provincia (agregacion pura, TDD)"
```

---

## Task 7: Cron + disparador manual de ingesta

**Files:**
- Create: `apps/plataforma/app/api/cron/borme-ingesta/route.ts`
- Create: `apps/plataforma/app/api/empresas/ingesta-manual/route.ts`
- Modify: `apps/plataforma/vercel.json`

- [ ] **Step 1: Endpoint cron** (copia la plantilla de `concursos-ingesta`)

```ts
// app/api/cron/borme-ingesta/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { ingestaDia } from '@/lib/borme-ingesta'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const hoy = new Date().toISOString().slice(0, 10)
  const r = await ingestaDia(hoy)
  return NextResponse.json({ ok: true, fecha: hoy, ...r })
}
```

- [ ] **Step 2: Disparador manual** (reautentica con sesión + rol)

```ts
// app/api/empresas/ingesta-manual/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ingestaDia } from '@/lib/borme-ingesta'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { fecha } = await req.json().catch(() => ({}))
  const iso = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10)
  const r = await ingestaDia(iso)
  return NextResponse.json({ ok: true, fecha: iso, ...r })
}
```

- [ ] **Step 3: Registrar el cron en `vercel.json`**

Añadir al array `crons` de `apps/plataforma/vercel.json`:
```json
{ "path": "/api/cron/borme-ingesta", "schedule": "0 6 * * *" }
```

- [ ] **Step 4: Verificar build de tipos**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/app/api/cron/borme-ingesta/route.ts apps/plataforma/app/api/empresas/ingesta-manual/route.ts apps/plataforma/vercel.json
git commit -m "feat(empresas): cron diario BORME + disparador manual"
```

---

## Task 8: Lib de lectura para la UI

**Files:**
- Create: `apps/plataforma/lib/empresas.ts`

- [ ] **Step 1: Implementar queries de lectura**

```ts
// lib/empresas.ts
import { prisma } from '@/lib/db'
import { puntuarEmpresa } from '@/lib/empresas-scoring'
import { agregarRadar, type FilaRadar } from '@/lib/empresas-radar'
import type { TipoEvento } from '@/lib/borme'

export interface FiltroEmpresas { provincia?: string; tipos?: TipoEvento[]; desde?: string }

interface FilaEvento { empresa: string; empresa_norm: string; provincia: string | null; tipo: TipoEvento; fecha: string }

export async function getEmpresasYRadar(f: FiltroEmpresas = {}) {
  const desde = f.desde ?? new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const filas = await prisma.$queryRaw<FilaEvento[]>`
    SELECT empresa, empresa_norm, provincia, tipo, to_char(fecha,'YYYY-MM-DD') AS fecha
    FROM borme_eventos
    WHERE fecha >= ${desde}::date
      AND (${f.provincia ?? null}::text IS NULL OR provincia = ${f.provincia ?? null})
    ORDER BY fecha DESC
    LIMIT 5000`

  // Agrupar por empresa_norm → score
  const porEmpresa = new Map<string, FilaEvento[]>()
  for (const fila of filas) {
    const arr = porEmpresa.get(fila.empresa_norm) ?? []
    arr.push(fila); porEmpresa.set(fila.empresa_norm, arr)
  }
  let empresas = [...porEmpresa.values()].map((evs) => puntuarEmpresa({
    empresa: evs[0].empresa, empresaNorm: evs[0].empresa_norm, provincia: evs[0].provincia,
    eventos: evs.map((e) => ({ tipo: e.tipo, fecha: e.fecha })),
  })).sort((a, b) => b.score - a.score)
  if (f.tipos?.length) {
    const set = new Set(f.tipos)
    const permitidas = new Set(filas.filter((x) => set.has(x.tipo)).map((x) => x.empresa_norm))
    empresas = empresas.filter((e) => permitidas.has(e.empresaNorm))
  }

  const radar = agregarRadar(filas.filter((x) => x.provincia).map((x): FilaRadar => ({ clave: x.provincia!, tipo: x.tipo })))
    .sort((a, b) => b.dificultad - a.dificultad)

  return { empresas, radar, total: empresas.length }
}

export async function getProvincias(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ provincia: string }[]>`
    SELECT DISTINCT provincia FROM borme_eventos WHERE provincia IS NOT NULL ORDER BY provincia`
  return rows.map((r) => r.provincia)
}
```

- [ ] **Step 2: Verificar tipos** — Run: `cd apps/plataforma && npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/empresas.ts
git commit -m "feat(empresas): lib de lectura (empresas rankeadas + radar + provincias)"
```

---

## Task 9: API de la sección

**Files:**
- Create: `apps/plataforma/app/api/empresas/route.ts`

- [ ] **Step 1: Implementar** (reautentica con sesión)

```ts
// app/api/empresas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getEmpresasYRadar, getProvincias, type FiltroEmpresas } from '@/lib/empresas'
import type { TipoEvento } from '@/lib/borme'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const filtro: FiltroEmpresas = {
    provincia: sp.get('provincia') || undefined,
    tipos: (sp.get('tipos')?.split(',').filter(Boolean) as TipoEvento[]) || undefined,
    desde: sp.get('desde') || undefined,
  }
  const [datos, provincias] = await Promise.all([getEmpresasYRadar(filtro), getProvincias()])
  return NextResponse.json({ ...datos, provincias })
}
```

- [ ] **Step 2: Verificar tipos** — `npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/empresas/route.ts
git commit -m "feat(empresas): endpoint /api/empresas (datos + radar + provincias)"
```

---

## Task 10: Página y UI (server page + client)

**Files:**
- Create: `apps/plataforma/app/(usuario)/empresas/page.tsx`
- Create: `apps/plataforma/app/(usuario)/empresas/EmpresasClient.tsx`

- [ ] **Step 1: Server page con guarda de sesión** (patrón `finanzas/page.tsx`)

```tsx
// app/(usuario)/empresas/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getEmpresasYRadar, getProvincias } from '@/lib/empresas'
import EmpresasClient from './EmpresasClient'
export const dynamic = 'force-dynamic'
export default async function EmpresasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  let inicial = null
  try {
    const [datos, provincias] = await Promise.all([getEmpresasYRadar({}), getProvincias()])
    inicial = { ...datos, provincias }
  } catch (e) { console.error('empresas inicial', e) }
  return <EmpresasClient inicial={inicial} />
}
```

- [ ] **Step 2: Client (radar + lista con montaje perezoso, responsive, sin importes €)**

```tsx
// app/(usuario)/empresas/EmpresasClient.tsx
'use client'
import { useEffect, useState } from 'react'

const PAGE = 50
const CUADRANTE_LABEL: Record<string, string> = { caza: '🎯 Zona caza', declive: '⚠️ Declive', sano: '😴 Sano', ignorar: '🚫 Ignorar' }

export default function EmpresasClient({ inicial }: { inicial: any }) {
  const [data, setData] = useState(inicial)
  const [prov, setProv] = useState('')
  const [visibles, setVisibles] = useState(PAGE)
  const [cargando, setCargando] = useState(false)
  const [ingiriendo, setIngiriendo] = useState(false)

  function recargar(p = prov) {
    setCargando(true)
    const qs = new URLSearchParams(); if (p) qs.set('provincia', p)
    fetch(`/api/empresas?${qs}`).then((r) => r.json()).then((d) => { setData(d); setVisibles(PAGE) }).finally(() => setCargando(false))
  }
  useEffect(() => { if (!inicial) recargar() }, []) // eslint-disable-line

  async function ingestaManual() {
    setIngiriendo(true)
    await fetch('/api/empresas/ingesta-manual', { method: 'POST' }).catch(() => {})
    setIngiriendo(false); recargar()
  }

  const empresas: any[] = data?.empresas ?? []
  const radar: any[] = data?.radar ?? []
  const provincias: string[] = data?.provincias ?? []

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto', color: 'var(--text)' }}>
      <h1 style={{ fontSize: 22 }}>Empresas en dificultad</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>Feed de eventos de dificultad (BORME) por sector y provincia. Fase 1 (gratis).</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <select value={prov} onChange={(e) => { setProv(e.target.value); recargar(e.target.value) }}
          style={{ minHeight: 44, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="">Todas las provincias</option>
          {provincias.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={ingestaManual} disabled={ingiriendo}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--primary)', color: '#fff' }}>
          {ingiriendo ? 'Actualizando…' : 'Actualizar BORME (hoy)'}
        </button>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 16 }}>Radar por provincia</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
            <th style={{ padding: 8 }}>Provincia</th><th>Concursos</th><th>Disoluciones</th><th>Dificultad</th><th>Cuadrante</th></tr></thead>
          <tbody>{radar.map((r) => (
            <tr key={r.clave} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 8 }}>{r.clave}</td><td>{r.concursos}</td><td>{r.disoluciones}</td>
              <td>{r.dificultad}</td><td>{CUADRANTE_LABEL[r.cuadrante] ?? r.cuadrante}</td></tr>))}</tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>Empresas ({empresas.length}){cargando ? ' · cargando…' : ''}</h2>
      <div style={{ opacity: cargando ? 0.5 : 1, display: 'grid', gap: 8 }}>
        {empresas.slice(0, visibles).map((e) => (
          <div key={e.empresaNorm} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{e.empresa}</strong>
              <span style={{ fontWeight: 700, color: e.score >= 70 ? 'var(--primary)' : 'var(--muted)' }}>{e.score}/100</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{e.provincia ?? '—'} · {e.motivo}</div>
          </div>
        ))}
      </div>
      {empresas.length > visibles && (
        <button onClick={() => setVisibles((v) => v + 100)} style={{ marginTop: 12, minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          Ver más ({empresas.length - visibles} restantes)
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar build** — Run: `cd apps/plataforma && npx tsc --noEmit && npx next build` → sin errores (o al menos `tsc` limpio si `next build` requiere env).

- [ ] **Step 4: Commit**

```bash
git add "apps/plataforma/app/(usuario)/empresas/"
git commit -m "feat(empresas): pagina + UI (radar + lista perezosa, responsive)"
```

---

## Task 11: Control de acceso por sección (rol) + menú

**Files:**
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx`
- Modify: `apps/plataforma/app/(usuario)/empresas/page.tsx` (ya creada)
- Modify: las `page.tsx` de las demás secciones NO se tocan una a una; en su lugar se filtra el nav y se añade una guarda central.

- [ ] **Step 1: Pasar `rol` al sidebar y filtrar**

En `app/(usuario)/UserSidebar.tsx`, recibir el `rol` de la sesión (vía prop desde el layout que ya llama a `getSession()`), y si `rol === 'empresas'` mostrar SOLO la entrada Empresas:
```tsx
const soloEmpresas = rol === 'empresas'
const navNegocio = soloEmpresas ? [{ href: '/empresas', icon: '🏢', label: 'Empresas' }] : NAV_NEGOCIO
```
Y añadir `{ href: '/empresas', icon: '🏢', label: 'Empresas' }` a `NAV_NEGOCIO` para las cuentas completas.

- [ ] **Step 2: Guarda de sección para cuentas `empresas`**

En `app/(usuario)/layout.tsx` (server, ya tiene la sesión), tras obtener la sesión: si `session.rol === 'empresas'` y la ruta pedida no empieza por `/empresas`, `redirect('/empresas')`. Obtener la ruta con `headers()`/`next/headers` o pasar el pathname; si el layout no ve el pathname, aplicar la guarda inversa en cada `page.tsx` sensible NO es DRY — preferible un pequeño `requireSeccion(session, 'empresas')` en `lib/session.ts` invocado desde el layout usando el `x-invoke-path`/`referer`. Implementar `requireSeccion` y usarlo.

```ts
// lib/session.ts (añadir)
export function puedeVer(session: { rol: string | null }, seccion: string): boolean {
  if (!session.rol) return true          // cuenta completa
  return session.rol === seccion         // cuenta acotada
}
```
En `empresas/page.tsx` no hace falta guarda extra (todas las cuentas pueden ver Empresas). En las secciones existentes que un usuario `empresas` NO debe ver, el filtrado del nav + el `redirect` del layout bastan; como defensa en profundidad, añadir al inicio de sus `page.tsx` más sensibles (p. ej. `finanzas`, `banca`) `if (!puedeVer(session, 'finanzas')) redirect('/empresas')`.

- [ ] **Step 3: Verificar tipos** — `npx tsc --noEmit` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/app/\(usuario\)/UserSidebar.tsx apps/plataforma/lib/session.ts apps/plataforma/app/\(usuario\)/layout.tsx
git commit -m "feat(empresas): acceso por seccion (rol) — nav filtrado + guarda"
```

---

## Task 12: Verificación end-to-end + guardia de tests

- [ ] **Step 1: Correr toda la guía de tests**

Run: `cd apps/plataforma && npx vitest run test/borme.test.ts test/empresas-scoring.test.ts test/empresas-radar.test.ts`
Expected: PASS.

- [ ] **Step 2: Guardia de secretos del repo**

Run (raíz): `pnpm test:guardia` (o el gate equivalente). Expected: PASS (no hay secretos hardcodeados; el cron usa `CRON_SECRET`).

- [ ] **Step 3: Ingesta real de un día y comprobación en BD**

Con la app desplegada (o local con `.env`), invocar el disparador manual (o `execute_sql` de Supabase): `SELECT tipo, count(*) FROM borme_eventos GROUP BY tipo;`
Expected: filas con `concurso`/`disolucion`/`ampliacion_capital` para la fecha ingerida.

- [ ] **Step 4: Crear un usuario de rol `empresas` para el colega (cuando Alberto lo pida)**

Vía `execute_sql`: `UPDATE cuentas SET rol='empresas' WHERE email = lower('<correo-del-colega>');` (tras darle de alta con `register`). Verificar que al loguearse solo ve la sección Empresas.

- [ ] **Step 5: Commit final / merge**

Abrir PR draft de la rama de la Fase 1 y, tras revisión de Alberto, fusionar.

---

## Notas de alcance / límites conocidos

- **Sin facturación en Fase 1:** BORME no trae balances; el filtro "≤2 M€" y "fondos propios negativos" llegan con el **enriquecimiento eInforma (Fase 2)**. Fase 1 filtra por **provincia y tipo de evento**.
- **CNAE:** BORME rara vez trae el CNAE; el radar Fase 1 es por **provincia**. El radar por sector real (INE + Central de Balances) es Fase 2.
- **Deduplicación de empresas:** por `empresa_norm` (nombre normalizado). Puede juntar homónimas o separar variantes; se afinará con el CIF real del enriquecimiento.
- **Coste:** 0€ (solo BORME + cómputo).
