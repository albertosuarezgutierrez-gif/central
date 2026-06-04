# Agente de venta catering + haciendas de eventos (Sevilla) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender el pipeline de captación de ia.rest para vender a empresas de catering y haciendas/espacios de eventos (Sevilla primero), haciendo cada etapa — sourcing, research, presentación, borradores, email frío — consciente del vertical, sin perder restaurantes.

**Architecture:** Se añade un motor de sourcing nuevo (Apify Google Places, asíncrono en dos fases con tabla de estado) y se hacen vertical-aware las rutas/crons existentes (`prospeccion-leads`, `lead-onboarding`, `crm-lead-hunter-sevilla`), la presentación personalizada (`src/app/p/[slug]/page.tsx`) y la RPC `search_leads_sevilla_nuevos`. Verticales: `catering` → landing `/catering`; `eventos` (haciendas/espacios) → `/espacios`; `restaurante`/`bar` → `/` (sin cambios).

**Tech Stack:** Next.js App Router (rutas server), Supabase (Postgres 17 + RPC plpgsql, tabla `leads`), crons de Vercel (GET protegido por `Bearer CRON_SECRET`), Apify REST API (`compass~crawler-google-places`), Resend (email), Telegram (`tgAlert`), NIM/Gemini vía `lib/ai-client.ts`.

**Verificación del proyecto (no hay jest/pytest):** cada tarea se valida con `npx tsc --noEmit` (0 errores) + `npm run lint` (0 errors; warnings legados OK) + `npm run build` cuando toca render, y una **prueba funcional** explícita (insertar lead de prueba, abrir página, disparar cron con el secreto). El spec de referencia: `docs/superpowers/specs/2026-06-04-agente-venta-catering-eventos-sevilla-design.md`.

**Reglas del repo que aplican (de AGENTS.md / maestro):**
- Archivos siempre completos; nombres de columna en español.
- API/cron: `createServerClient()` (service role). Crons: comprobar `authorization === Bearer ${CRON_SECRET}`.
- Migraciones: `IF NOT EXISTS`, RLS + policy `service_role_all`, índice por columna de filtrado.
- Telegram: `tgAlert(textoPlano, 'info'|'aviso'|'critico'|'resuelto')`.
- Pre-push: `tsc --noEmit` limpio. Verificar con `next build` (deps instaladas), no solo `tsc`.
- Operador → Telegram; usuarios finales → email. Nunca nombrar competidores en copy.

---

## Mapa de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/app/p/[slug]/page.tsx` | Presentación personalizada por lead | Modificar: bucket `eventos`, `getModulos`, subheadline por vertical |
| `src/lib/apify.ts` | Cliente Apify Google Places (start/results) | Crear |
| `supabase/migrations/20260604_prospeccion_apify_runs.sql` | Tabla de estado de runs Apify | Crear |
| `src/app/api/cron/prospeccion-apify/route.ts` | Cron sourcing Apify (2 fases) | Crear |
| `vercel.json` | Programar el cron Apify | Modificar |
| `.env.example` | Documentar `APIFY_TOKEN` | Modificar |
| `src/app/api/cron/prospeccion-leads/route.ts` | Sourcing web_search nacional | Modificar: taxonomía `eventos`, email/telefono, queries Sevilla |
| `src/app/api/cron/lead-onboarding/route.ts` | Research + propuesta + borradores | Modificar: prompt research y borradores por vertical |
| `supabase/migrations/20260604_search_leads_sevilla_v2.sql` | RPC selección leads emailables | Crear (reemplaza la función) |
| `src/app/api/cron/crm-lead-hunter-sevilla/route.ts` | Email frío | Modificar: 3 plantillas por vertical |
| `docs/CONTEXTO-SESIONES.md` | Memoria entre sesiones | Modificar al cierre |

**Orden de ejecución por hitos** (cada hito es software funcional y testeable por sí solo):
- **Hito A — Presentación** (Tarea 1). Lo más rápido de ver; sin dependencias externas.
- **Hito B — Sourcing Apify** (Tareas 2-5).
- **Hito C — Research + borradores + taxonomía sourcing** (Tareas 6-7).
- **Hito D — RPC v2 + email frío** (Tareas 8-9).
- **Cierre** (Tarea 10).

---

## Hito A — Presentación

### Tarea 1: Separar catering vs eventos en la presentación personalizada

**Files:**
- Modify: `src/app/p/[slug]/page.tsx` (bloque `MODULOS_TIPO` ~líneas 21-47, `getModulos` ~49-57, `subheadline` ~88)

Contexto: `MODULOS_TIPO` es un `Record` con buckets `sala`/`cocina`/`gestion`, cada uno `string[][]` de `[emoji, titulo, desc]`. La página renderiza tres columnas fijas "En sala / En cocina / En gestión" (líneas 135-138). `getModulos(tipo)` mapea `tipo_negocio` → bucket; hoy `cater|event|bod` caen todos en `catering`. Hay que separar `eventos` (haciendas/espacios) con tarjetas propias de gestión de espacios.

- [ ] **Step 1: Añadir el bucket `eventos` a `MODULOS_TIPO`**

En `src/app/p/[slug]/page.tsx`, dentro del objeto `MODULOS_TIPO`, justo después del bucket `catering: { ... },` (acaba en línea 36), añadir:

```typescript
  eventos: {
    sala: [['📲','App del evento','Cada invitado ve menú, horarios y ubicación desde su móvil.'],['✅','Check-in QR','Control de acceso y aforo el día del evento.'],['🍷','Barra por tiers','Barra libre y consumiciones controladas por evento.'],['📊','Rentabilidad','Coste real vs presupuesto del evento, en vivo.']],
    cocina: [['🎙','Voz en el servicio','Pases del banquete sin papel ni errores.'],['📋','Alérgenos','Declaración de alérgenos por menú de evento.'],['🏷','APPCC','Plato testigo y temperaturas registradas solas.'],['🤝','Catering externo','Coordinas proveedores de comida desde el sistema.']],
    gestion: [['📅','Espacios y calendario','Disponibilidad de cada finca o salón, sin dobles reservas.'],['📥','Solicitudes','Bodas.net, web y llamadas en un solo embudo.'],['🧮','Presupuestos','Calculas el presupuesto y ves el margen neto al instante.'],['✍️','Contratos','Envío, firma y seguimiento del contrato del evento.'],['💳','Cobros de grupo','Cada invitado paga su parte online; tú ves el total.'],['📈','Previsión','La IA anticipa la temporada y capta recomendaciones.']]
  },
```

- [ ] **Step 2: Actualizar `getModulos` para enrutar el vertical eventos**

Reemplazar la función `getModulos` completa (líneas 49-57) por:

```typescript
function getModulos(tipo: string) {
  if (!tipo) return MODULOS_TIPO.mediterraneo
  const t = tipo.toLowerCase()
  if (t.includes('indi') || t.includes('nepal') || t.includes('asian') || t.includes('chino') || t.includes('japon')) return MODULOS_TIPO.indio
  if (t.includes('cater')) return MODULOS_TIPO.catering
  if (t.includes('event') || t.includes('hacienda') || t.includes('finca') || t.includes('espacio') || t.includes('banquet') || t.includes('bod')) return MODULOS_TIPO.eventos
  if (t.includes('bar') || t.includes('tapa') || t.includes('tabern')) return MODULOS_TIPO.bar
  if (t.includes('multi') || t.includes('grupo') || t.includes('caden')) return MODULOS_TIPO.multilocal
  return MODULOS_TIPO.mediterraneo
}
```

Nota: `catering` se comprueba **antes** que `eventos`, así "catering bodas" → catering (no eventos).

- [ ] **Step 3: Subheadline por vertical**

Localizar la línea (≈88):

```typescript
  const subheadline = datosOp.subheadline || 'Sala, cocina, almacén, proveedores y eventos. Todo conectado y automatizado desde un solo sistema.'
```

Reemplazarla por:

```typescript
  const subheadlineDefault =
    modulos === MODULOS_TIPO.catering
      ? 'Presupuestos que cuadran, coste real por evento y menos horas de oficina. Todo conectado.'
      : modulos === MODULOS_TIPO.eventos
      ? 'Llena el calendario de tu finca y no se te escapa ninguna solicitud. Cada evento, cuadrado, desde un solo sistema.'
      : 'Sala, cocina, almacén, proveedores y eventos. Todo conectado y automatizado desde un solo sistema.'
  const subheadline = datosOp.subheadline || subheadlineDefault
```

(`modulos` se define en la línea ≈84 con `getModulos(lead.tipo_negocio || '')`, antes de esta línea. La comparación por identidad de objeto funciona porque `getModulos` devuelve la misma referencia de `MODULOS_TIPO`.)

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos (solo el preexistente de `@types/node` si aparece).

Run: `npm run lint`
Expected: 0 errors (warnings legados permitidos).

- [ ] **Step 5: Verificar build de la página**

Run: `npm run build`
Expected: build OK; la ruta `/p/[slug]` compila sin error.

- [ ] **Step 6: Prueba funcional (visual)**

Insertar dos leads de prueba en Supabase (vía MCP `execute_sql` o el SQL editor) y abrir su landing. Sustituir `<RID>` por un `restaurante_id` válido (o NULL si la columna lo permite en `leads`):

```sql
insert into leads (nombre, empresa, restaurante, ciudad, tipo_negocio, landing_slug, estado, estado_pipeline)
values
  ('TEST Catering Demo','TEST Catering Demo','TEST Catering Demo','Sevilla','catering','test-catering-demo','nuevo','prospecto_ia'),
  ('TEST Hacienda Demo','TEST Hacienda Demo','TEST Hacienda Demo','Sevilla','eventos','test-hacienda-demo','nuevo','prospecto_ia');
```

Abrir en el navegador (preview de Vercel o prod tras deploy):
- `…/p/test-catering-demo` → debe mostrar tarjetas de **catering** (rentabilidad por evento, portal cliente) y subheadline de presupuestos.
- `…/p/test-hacienda-demo` → debe mostrar tarjetas de **eventos** (espacios y calendario, solicitudes, contratos, cobros de grupo) y subheadline de "llena el calendario de tu finca".

Limpiar al terminar: `delete from leads where landing_slug in ('test-catering-demo','test-hacienda-demo');`

- [ ] **Step 7: Commit**

```bash
git add src/app/p/[slug]/page.tsx
git commit -m "feat(p): bucket de modulos propio para haciendas/eventos + subheadline por vertical"
```

---

## Hito B — Sourcing Apify

### Tarea 2: Migración — tabla de estado `prospeccion_apify_runs`

**Files:**
- Create: `supabase/migrations/20260604_prospeccion_apify_runs.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- Tabla de estado de runs de Apify Google Places (sourcing en 2 fases).
-- Tabla CRM global (sin restaurante_id) — solo la usa el cron con service role.
CREATE TABLE IF NOT EXISTS prospeccion_apify_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical         TEXT NOT NULL,                 -- 'catering' | 'eventos' | 'restaurante'
  query            TEXT NOT NULL,
  run_id           TEXT,
  dataset_id       TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ingested' | 'failed'
  items_total      INT DEFAULT 0,
  items_ingestados INT DEFAULT 0,
  started_at       TIMESTAMPTZ DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prospeccion_apify_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON prospeccion_apify_runs
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_apify_runs_status ON prospeccion_apify_runs(status);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar vía MCP Supabase (`apply_migration`, name `prospeccion_apify_runs`, project `efncqyvhniaxsirhdxaa`) o `supabase db push`.
Expected: tabla creada. Verificar: `select * from prospeccion_apify_runs limit 1;` → 0 filas, sin error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260604_prospeccion_apify_runs.sql
git commit -m "feat(db): tabla prospeccion_apify_runs (estado de runs Apify)"
```

### Tarea 3: Helper `lib/apify.ts`

**Files:**
- Create: `src/lib/apify.ts`

- [ ] **Step 1: Crear el helper**

```typescript
// Cliente mínimo de Apify Google Places (compass~crawler-google-places).
// Patrón en 2 fases: startPlacesRun() lanza el run; getRunResults() sondea y
// baja items cuando SUCCEEDED. Sin APIFY_TOKEN, startPlacesRun devuelve null.

const APIFY = 'https://api.apify.com/v2'
const ACTOR = 'compass~crawler-google-places'

export type ApifyVertical = 'catering' | 'eventos' | 'restaurante'

export interface ApifyPlace {
  title?: string
  city?: string
  address?: string
  phone?: string
  phoneUnformatted?: string
  website?: string
  emails?: string[]
  categoryName?: string
  totalScore?: number
}

export function apifyConfigurado(): boolean {
  return !!process.env.APIFY_TOKEN
}

// Lanza un run y devuelve su runId. null si no hay token o falla la llamada.
export async function startPlacesRun(query: string, max: number): Promise<string | null> {
  const token = process.env.APIFY_TOKEN
  if (!token) return null
  try {
    const r = await fetch(`${APIFY}/acts/${ACTOR}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: max,
        language: 'es',
        countryCode: 'es',
        scrapeContacts: true,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) return null
    const d = await r.json()
    return d?.data?.id || null
  } catch {
    return null
  }
}

// Sondea un run. Si SUCCEEDED, baja los items del dataset.
export async function getRunResults(
  runId: string
): Promise<{ status: string; datasetId?: string; items?: ApifyPlace[] }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { status: 'NO_TOKEN' }
  try {
    const r = await fetch(`${APIFY}/actor-runs/${runId}?token=${token}`, {
      signal: AbortSignal.timeout(20000),
    })
    const d = await r.json()
    const status = d?.data?.status as string
    if (status !== 'SUCCEEDED') return { status: status || 'UNKNOWN' }
    const datasetId = d?.data?.defaultDatasetId as string
    const items = (await fetch(
      `${APIFY}/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
      { signal: AbortSignal.timeout(30000) }
    ).then((x) => x.json())) as ApifyPlace[]
    return { status, datasetId, items: Array.isArray(items) ? items : [] }
  } catch {
    return { status: 'ERROR' }
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/apify.ts
git commit -m "feat(lib): cliente Apify Google Places (start/results, 2 fases)"
```

### Tarea 4: Cron `prospeccion-apify` (dos fases)

**Files:**
- Create: `src/app/api/cron/prospeccion-apify/route.ts`

Contexto: idempotente. Primero FASE B (recoge un run `pending` si lo hay); si no quedó nada pendiente, FASE A (lanza el siguiente). Dedup contra `leads` por web/nombre+ciudad, igual criterio que `prospeccion-leads`. tipo_negocio = vertical de la query.

- [ ] **Step 1: Crear la ruta**

```typescript
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { startPlacesRun, getRunResults, apifyConfigurado, type ApifyVertical, type ApifyPlace } from '@/lib/apify'

// Rotación de queries de Sevilla: recorre los 3 verticales.
const QUERIES: Array<{ vertical: ApifyVertical; query: string }> = [
  { vertical: 'catering', query: 'empresas de catering Sevilla' },
  { vertical: 'eventos', query: 'haciendas para bodas Sevilla' },
  { vertical: 'restaurante', query: 'restaurantes Sevilla centro' },
  { vertical: 'catering', query: 'catering bodas y eventos Sevilla' },
  { vertical: 'eventos', query: 'fincas para eventos Sevilla provincia' },
  { vertical: 'restaurante', query: 'bares y restaurantes Sevilla' },
]
const MAX_PLACES = 18

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!apifyConfigurado()) {
    return NextResponse.json({ ok: true, skipped: 'sin APIFY_TOKEN' })
  }

  const supabase = createServerClient()

  // ── FASE B: recoger un run pendiente ───────────────────────────────────────
  const { data: pendientes } = await supabase
    .from('prospeccion_apify_runs')
    .select('*')
    .eq('status', 'pending')
    .order('started_at', { ascending: true })
    .limit(1)

  const run = pendientes?.[0]
  if (run) {
    const res = await getRunResults(run.run_id)
    if (res.status !== 'SUCCEEDED') {
      // Sigue corriendo, o falló: marcar failed en estados terminales de error.
      if (['FAILED', 'ABORTED', 'TIMED-OUT', 'ERROR'].includes(res.status)) {
        await supabase.from('prospeccion_apify_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', run.id)
        return NextResponse.json({ ok: true, fase: 'B', run: run.id, status: res.status })
      }
      return NextResponse.json({ ok: true, fase: 'B', run: run.id, status: res.status, esperando: true })
    }

    const items = res.items || []
    const insertados = await ingestar(supabase, items, run.vertical as ApifyVertical)
    await supabase.from('prospeccion_apify_runs').update({
      status: 'ingested',
      dataset_id: res.datasetId || null,
      items_total: items.length,
      items_ingestados: insertados,
      finished_at: new Date().toISOString(),
    }).eq('id', run.id)

    if (insertados > 0) {
      await tgAlert(`📍 Apify (${run.vertical}) Sevilla: ${insertados} leads nuevos de ${items.length} sitios.`, 'info')
    }
    return NextResponse.json({ ok: true, fase: 'B', run: run.id, insertados, total: items.length })
  }

  // ── FASE A: lanzar el siguiente run ────────────────────────────────────────
  const { count } = await supabase
    .from('prospeccion_apify_runs')
    .select('id', { count: 'exact', head: true })
  const idx = (count || 0) % QUERIES.length
  const next = QUERIES[idx]

  const runId = await startPlacesRun(next.query, MAX_PLACES)
  if (!runId) {
    return NextResponse.json({ ok: false, fase: 'A', error: 'no se pudo lanzar el run' }, { status: 502 })
  }
  await supabase.from('prospeccion_apify_runs').insert({
    vertical: next.vertical,
    query: next.query,
    run_id: runId,
    status: 'pending',
  })
  return NextResponse.json({ ok: true, fase: 'A', lanzado: next.query, run: runId })
}

// Normaliza items de Apify → leads, con dedup contra leads existentes.
async function ingestar(
  supabase: ReturnType<typeof createServerClient>,
  items: ApifyPlace[],
  vertical: ApifyVertical
): Promise<number> {
  if (items.length === 0) return 0

  const { data: existentes } = await supabase.from('leads').select('empresa, restaurante, web, ciudad')
  const websSet = new Set((existentes || []).map((l) => norm(l.web)).filter(Boolean))
  const nombreCiudadSet = new Set(
    (existentes || []).flatMap((l) =>
      [l.empresa, l.restaurante].filter(Boolean).map((n: string) => `${n.toLowerCase()}|${norm(l.ciudad)}`)
    )
  )

  const nuevos = items
    .filter((it) => it.title && it.title.trim())
    .filter((it) => {
      const w = norm(it.website)
      const nc = `${it.title!.toLowerCase()}|${norm(it.city || 'sevilla')}`
      if (w && websSet.has(w)) return false
      if (nombreCiudadSet.has(nc)) return false
      // dedup intra-lote
      websSet.add(w); nombreCiudadSet.add(nc)
      return true
    })
    .map((it) => ({
      nombre: it.title!,
      empresa: it.title!,
      restaurante: it.title!,
      ciudad: it.city || 'Sevilla',
      web: it.website || null,
      telefono: it.phone || it.phoneUnformatted || null,
      email: it.emails?.[0] || null,
      tipo_negocio: vertical,
      tipo: 'prospecto',
      estado: 'nuevo',
      estado_pipeline: 'prospecto_ia',
      origen: 'apify_google_places',
      notas: [it.categoryName, it.totalScore ? `⭐${it.totalScore}` : null].filter(Boolean).join(' · '),
      eventos: [{
        tipo: '🤖',
        texto: `Encontrado por Apify Google Places (Sevilla, ${vertical})`,
        fecha: new Date().toISOString().split('T')[0],
      }],
    }))

  if (nuevos.length === 0) return 0
  const { error } = await supabase.from('leads').insert(nuevos)
  if (error) { console.error('[prospeccion-apify] insert leads:', error.message); return 0 }
  return nuevos.length
}
```

- [ ] **Step 2: Confirmar columnas de `leads`**

Antes de dar por buena la inserción, confirmar que `leads` tiene las columnas usadas (`tipo_negocio`, `tipo`, `web`, `telefono`, `email`, `origen`, `estado`, `estado_pipeline`, `notas`, `eventos`). Vía MCP Supabase:

Run (SQL): `select column_name from information_schema.columns where table_name='leads' order by 1;`
Expected: aparecen todas. **Si falta `origen`**, ajustar el insert para guardarlo en `estudio_completo` (`estudio_completo: { origen: 'apify_google_places' }`) y anotarlo para la Tarea 8 (la RPC filtrará por ese JSON en vez de por columna).

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit` → 0 errores nuevos.
Run: `npm run lint` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/prospeccion-apify/route.ts
git commit -m "feat(cron): prospeccion-apify (sourcing Google Places en 2 fases)"
```

### Tarea 5: Programar el cron y documentar el env

**Files:**
- Modify: `vercel.json` (bloque `crons`)
- Modify: `.env.example`

- [ ] **Step 1: Añadir el cron a `vercel.json`**

Dentro del array `crons`, añadir una entrada (junto a las existentes):

```json
    {
      "path": "/api/cron/prospeccion-apify",
      "schedule": "*/30 * * * *"
    }
```

- [ ] **Step 2: Documentar `APIFY_TOKEN` en `.env.example`**

Añadir bajo una sección apropiada (p.ej. tras Stripe):

```bash
# --- Apify (sourcing Google Places para prospeccion) ---
APIFY_TOKEN=
```

- [ ] **Step 3: Validar JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"`
Expected: `vercel.json OK`.

- [ ] **Step 4: Prueba funcional del cron (manual)**

Tras desplegar (o en local con `.env.local` que tenga `APIFY_TOKEN` y `CRON_SECRET`):

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" https://<preview-o-prod>/api/cron/prospeccion-apify
```
Expected primera llamada: `{"ok":true,"fase":"A","lanzado":"empresas de catering Sevilla","run":"…"}`.
Esperar ~2-4 min y volver a llamar: `fase":"B"` con `insertados` ≥ 0. Verificar en Supabase: filas nuevas en `prospeccion_apify_runs` (status `ingested`) y `leads` con `origen='apify_google_places'`, `tipo_negocio` correcto, `telefono`/`email` cuando existan.
Sin `APIFY_TOKEN`: la respuesta debe ser `{"ok":true,"skipped":"sin APIFY_TOKEN"}`.

- [ ] **Step 5: Commit**

```bash
git add vercel.json .env.example
git commit -m "chore(cron): programa prospeccion-apify */30 + documenta APIFY_TOKEN"
```

---

## Hito C — Research + borradores + taxonomía de sourcing

### Tarea 6: `prospeccion-leads` — taxonomía `eventos` + contacto + queries Sevilla

**Files:**
- Modify: `src/app/api/cron/prospeccion-leads/route.ts`

- [ ] **Step 1: Añadir queries de Sevilla a la rotación**

En el array `QUERIES_BUSQUEDA` (líneas 12-20), añadir al final:

```typescript
  'empresas de catering Sevilla y provincia bodas eventos',
  'haciendas fincas para bodas y eventos Sevilla',
```

- [ ] **Step 2: Ampliar la taxonomía y pedir contacto en el prompt de búsqueda**

En `buscarCandidatos`, dentro del `content` del mensaje, reemplazar la línea del formato JSON:

```typescript
          [{"nombre":"Nombre empresa","ciudad":"Ciudad","locales_estimados":3,"web":"url o null","descripcion":"1 frase","tipo":"restaurante|bar|catering|grupo"}]
```

por:

```typescript
          [{"nombre":"Nombre empresa","ciudad":"Ciudad","locales_estimados":3,"web":"url o null","email":"email publico o null","telefono":"telefono o null","descripcion":"1 frase","tipo":"restaurante|bar|catering|eventos|grupo"}]
```

Y añadir una frase al prompt (antes de "Máximo 3 candidatos"):

```typescript
          Si es una hacienda, finca o espacio para bodas/eventos usa tipo "eventos". Incluye email y telefono SOLO si aparecen en su web (no inventes).
```

- [ ] **Step 3: Tipar y propagar email/telefono**

En la interfaz del parámetro de `analizarCandidato` y en el tipo de `candidatosBrutos`, añadir `email?: string | null` y `telefono?: string | null`. Concretamente, en la declaración de `candidatosBrutos` (línea ≈119):

```typescript
  const candidatosBrutos: Array<{
    nombre: string; ciudad: string; locales_estimados: number
    web: string | null; email?: string | null; telefono?: string | null; descripcion: string; tipo: string
  }> = []
```

- [ ] **Step 4: Guardar email/telefono en el insert de leads**

En el `.insert(...)` de `validos.map(...)` (líneas 167-194), añadir dos campos al objeto:

```typescript
        email: c.email || null,
        telefono: c.telefono || null,
```

(El `tipo_negocio: c.tipo` ya existe en línea 184 — ahora podrá ser `'eventos'`.)

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc --noEmit` → 0 errores nuevos.
Run: `npm run lint` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/prospeccion-leads/route.ts
git commit -m "feat(cron): prospeccion-leads detecta vertical eventos + captura email/telefono + queries Sevilla"
```

### Tarea 7: `lead-onboarding` — research y borradores por vertical

**Files:**
- Modify: `src/app/api/cron/lead-onboarding/route.ts`

Contexto: `procesarLead` hace research con `callAISearch` (JSON `estudio`), genera slug, email y WhatsApp con `callAI`, y guarda. Hay que: (a) respetar/ampliar `tipo_negocio` con `eventos`; (b) pedir señales por vertical; (c) que los borradores enlacen a la landing correcta.

- [ ] **Step 1: Pasar el tipo_negocio conocido y ampliar taxonomía en el research**

En el `select` de leads (línea ≈21) añadir `tipo_negocio`:

```typescript
    .select('id, nombre, empresa, restaurante, web, email, notas, tpv, locales, ciudad, tipo_negocio, pain_points, datos_operativos')
```

En el prompt de `callAISearch` (el `user` content), reemplazar la línea:

```typescript
  "tipo_negocio": "restaurante|bar|catering|grupo|mixto",
```

por:

```typescript
  "tipo_negocio": "restaurante|bar|catering|eventos|grupo|mixto",
```

Y añadir, justo antes de la línea `Notas adicionales:` del prompt, una pista del tipo ya conocido y las señales por vertical:

```typescript
Tipo provisional (de sourcing, confírmalo o corrígelo, NO degrades una hacienda a restaurante): ${(lead.tipo_negocio as string) || 'desconocido'}
Si es catering: estima eventos/bodas al año, si hace bodas/empresa, aforo máximo, coste por comensal.
Si es hacienda/finca/espacio de eventos (tipo "eventos"): nº de espacios, aforo, si aparece en bodas.net/zankyou, si gestiona calendario online, si el catering es propio o externo.
```

- [ ] **Step 2: Helper de vertical + landing para los borradores**

En `procesarLead`, justo después de calcular `propuestaUrl` (línea ≈128), añadir:

```typescript
  const tipoNeg = ((estudio.tipo_negocio as string) || (lead.tipo_negocio as string) || '').toLowerCase()
  const esCatering = tipoNeg.includes('cater')
  const esEventos = !esCatering && (tipoNeg.includes('event') || tipoNeg.includes('hacienda') || tipoNeg.includes('finca') || tipoNeg.includes('espacio') || tipoNeg.includes('banquet') || tipoNeg.includes('bod'))
  const landingUrl = esCatering ? 'https://www.iarest.es/catering' : esEventos ? 'https://www.iarest.es/espacios' : 'https://www.iarest.es'
  const anguloVertical = esCatering
    ? 'Vertical CATERING: el dolor es cuadrar presupuestos y saber el coste/margen real por evento; menos horas de oficina.'
    : esEventos
    ? 'Vertical HACIENDA/ESPACIO DE EVENTOS: el dolor es llenar el calendario de la finca, no perder solicitudes (bodas.net) y cerrar contratos rápido.'
    : 'Vertical RESTAURANTE/BAR: comandas por voz y control de costes.'
```

- [ ] **Step 3: Inyectar el ángulo y la landing en los prompts de email y WhatsApp**

En la `callAI` del email (la primera del `Promise.allSettled`), añadir al `user` content, después de la línea `Pain point principal: ...`:

```typescript
${anguloVertical}
Landing del vertical (enlázala como recurso además de la propuesta): ${landingUrl}
```

En la `callAI` del WhatsApp (la segunda), añadir tras `Algo concreto: ...`:

```typescript
${anguloVertical}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit` → 0 errores nuevos.
Run: `npm run lint` → 0 errors.

- [ ] **Step 5: Prueba funcional**

Insertar un lead de prueba con tu email y `tipo_negocio='eventos'`, web real de una hacienda, y disparar:

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" https://<preview-o-prod>/api/cron/lead-onboarding
```
Expected: el lead pasa a `estado_pipeline='propuesta_lista'` con `estudio_completo.tipo_negocio` ≈ eventos, `propuesta_slug` puesto, y llega un mensaje a Telegram con "Ver propuesta". Abrir esa propuesta → presentación de **eventos** (Tarea 1). El `email_draft` debe mencionar/enlazar `/espacios`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/lead-onboarding/route.ts
git commit -m "feat(cron): lead-onboarding research y borradores conscientes del vertical (catering/eventos)"
```

---

## Hito D — RPC v2 + email frío

### Tarea 8: RPC `search_leads_sevilla_nuevos` v2

**Files:**
- Create: `supabase/migrations/20260604_search_leads_sevilla_v2.sql`

Contexto: la versión actual exige `≥2 locales` o `1 local con >60 mesas`, lo que excluye catering/haciendas de un solo sitio. Nueva regla: incluir si `≥2 locales` **o** `1 local + >60 mesas` **o** `tipo_negocio IN ('catering','eventos','banquete')` **o** `origen='apify_google_places'`; y exigir email. Si en la Tarea 4/Step 2 se vio que **no** existe la columna `origen`, sustituir `l.origen = 'apify_google_places'` por `(l.estudio_completo->>'origen') = 'apify_google_places'`.

- [ ] **Step 1: Crear la migración (reemplaza la función)**

```sql
CREATE OR REPLACE FUNCTION search_leads_sevilla_nuevos(limit_count INT DEFAULT 3)
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  email TEXT,
  ciudad TEXT,
  tipo_negocio TEXT,
  web TEXT,
  restaurante_id UUID,
  num_locales BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.nombre, l.email, l.ciudad, l.tipo_negocio, l.web, l.restaurante_id,
    COUNT(DISTINCT ll.id) AS num_locales
  FROM leads l
  LEFT JOIN leads_locales ll ON ll.empresa_id = l.id
  LEFT JOIN leads_contactos lc ON lc.lead_id = l.id
  LEFT JOIN leads_unsubscribes lu ON lu.lead_id = l.id
  LEFT JOIN leads_web_tracking lwt ON lwt.lead_id = l.id
  WHERE
    l.ciudad ILIKE '%Sevilla%'
    AND l.tipo_negocio IS DISTINCT FROM 'hotel'
    AND l.email IS NOT NULL AND l.email <> ''
    AND lc.lead_id IS NULL
    AND lu.lead_id IS NULL
    AND lwt.lead_id IS NULL
  GROUP BY l.id, l.nombre, l.email, l.ciudad, l.tipo_negocio, l.web, l.restaurante_id, l.origen
  HAVING
    COUNT(DISTINCT ll.id) >= 2
    OR (COUNT(DISTINCT ll.id) <= 1 AND COALESCE(MAX(ll.num_mesas), 0) > 60)
    OR l.tipo_negocio IN ('catering','eventos','banquete')
    OR l.origen = 'apify_google_places'
  ORDER BY
    CASE
      WHEN l.tipo_negocio = 'catering' AND COUNT(DISTINCT ll.id) >= 5 THEN 1
      WHEN l.tipo_negocio = 'catering' AND COUNT(DISTINCT ll.id) >= 2 THEN 2
      WHEN l.tipo_negocio IN ('eventos','banquete') THEN 3
      ELSE 4
    END,
    RANDOM()
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

Nota: `l.origen` aparece en `GROUP BY` y `HAVING`. Si `origen` no existe como columna, quitar `l.origen` del `GROUP BY` y sustituir el `HAVING` por `(l.estudio_completo->>'origen') = 'apify_google_places'` y añadir `l.estudio_completo` al `GROUP BY`.

- [ ] **Step 2: Aplicar y probar la RPC**

Aplicar vía MCP (`apply_migration`, name `search_leads_sevilla_v2`).
Run (SQL): `select * from search_leads_sevilla_nuevos(3);`
Expected: ejecuta sin error; devuelve 0+ filas, todas con `email` no nulo. (Con el lead de prueba de catering/eventos + email del Hito C, debería aparecer.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260604_search_leads_sevilla_v2.sql
git commit -m "feat(db): search_leads_sevilla_nuevos v2 (sitios unicos catering/eventos + email obligatorio)"
```

### Tarea 9: `crm-lead-hunter-sevilla` — 3 plantillas por vertical

**Files:**
- Modify: `src/app/api/cron/crm-lead-hunter-sevilla/route.ts`

Contexto: hoy hay un único email (voz). La RPC devuelve `tipo_negocio`; ramificar `subject`/`html`/landing/utm por vertical, conservando tracking y baja.

- [ ] **Step 1: Helper de plantilla por vertical**

Antes del `export async function GET`, añadir:

```typescript
function plantillaVenta(lead: { nombre: string; tipo_negocio?: string | null }, trackingUrl: string, unsubUrl: string) {
  const t = (lead.tipo_negocio || '').toLowerCase()
  const esCatering = t.includes('cater')
  const esEventos = !esCatering && (t.includes('event') || t.includes('hacienda') || t.includes('finca') || t.includes('espacio') || t.includes('banquet') || t.includes('bod'))
  const baja = `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/><p style="font-size:12px;color:#999;">Si prefieres no recibir más: <a href="${unsubUrl}" style="color:#999;">desuscribir</a></p>`
  const cta = (url: string, txt: string) => `<p><b>¿5 minutos para verlo?</b><br/><a href="${url}" style="color:#D9442B;font-weight:bold;">👉 ${txt}</a></p><p>Un saludo,<br/><b>Alberto</b><br/>ia.rest | +34 637 34 99 90</p>`

  if (esCatering) {
    return {
      utm: 'crm_catering',
      subject: `${lead.nombre}, ¿cuánto margen real te queda en cada evento? 🍽️`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
        <p>En catering lo difícil no es cocinar: es <b>cuadrar el presupuesto y saber el margen real</b> de cada evento antes de decir que sí.</p>
        <p>Nosotros lo automatizamos: escandallos, coste por comensal y presupuesto con margen al instante. Menos horas de oficina, más eventos rentables.</p>
        ${cta(`${trackingUrl}&v=catering`, 'iarest.es/catering')}${baja}</div>`,
    }
  }
  if (esEventos) {
    return {
      utm: 'crm_eventos',
      subject: `${lead.nombre}, ¿llenas el calendario o se te escapan bodas? 💍`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
        <p>Para una finca de eventos, cada solicitud de bodas.net que se enfría es dinero que se va. Y llevar calendario, presupuestos y contratos a mano cuesta horas.</p>
        <p>Lo juntamos todo: <b>disponibilidad de espacios, embudo de solicitudes, presupuestos con margen y contratos</b>. Una solicitud no se pierde.</p>
        ${cta(`${trackingUrl}&v=eventos`, 'iarest.es/espacios')}${baja}</div>`,
    }
  }
  return {
    utm: 'crm_lead',
    subject: `${lead.nombre}, ¿sabes cuánto ganas de verdad? 🤔`,
    html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
      <p>La mayoría factura mucho pero gana poco: caja manual, comandas a mano, papeleo. <b>Facturar más no es ganar más.</b></p>
      <p><b>🎤 Comandas por voz</b> → cocina al instante, sin errores. <b>🤖 IA en procesos</b> → recuperas el margen que se pierde.</p>
      ${cta(trackingUrl, 'www.iarest.es')}${baja}</div>`,
  }
}
```

- [ ] **Step 2: Usar la plantilla en el envío**

En el `for (const lead of leads)` (sustituyendo el bloque que arma `subject`/`html` dentro de `resend.emails.send`), construir la plantilla y usar su `utm` en el insert de tracking y sus `subject`/`html` en el envío. Reemplazar:

```typescript
        // INSERT tracking — sin restaurante_id (tabla CRM global)
        const { error: trackErr } = await supabase
          .from('leads_web_tracking')
          .insert({
            lead_id: lead.id,
            mensaje_dia1_at: new Date().toISOString(),
            estado: 'enviado_dia1',
            utm_source: 'crm_lead'
          })
```

por:

```typescript
        const tpl = plantillaVenta(lead, trackingUrl, unsubUrl)

        // INSERT tracking — sin restaurante_id (tabla CRM global)
        const { error: trackErr } = await supabase
          .from('leads_web_tracking')
          .insert({
            lead_id: lead.id,
            mensaje_dia1_at: new Date().toISOString(),
            estado: 'enviado_dia1',
            utm_source: tpl.utm
          })
```

Y en la llamada `resend.emails.send({ ... })`, reemplazar las propiedades `subject:` y `html:` (todo el bloque template literal actual) por:

```typescript
          subject: tpl.subject,
          html: tpl.html,
```

(`trackingUrl` y `unsubUrl` ya se calculan arriba en el loop, antes del insert de tracking.)

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit` → 0 errores nuevos.
Run: `npm run lint` → 0 errors.

- [ ] **Step 4: Prueba funcional (con tu email, sin spamear)**

Asegurar 2 leads de prueba en Sevilla con **tu email**, sin contacto/baja/tracking previos: uno `tipo_negocio='catering'`, otro `'eventos'`. Disparar:

```bash
curl -s -H "authorization: Bearer $CRON_SECRET" https://<preview-o-prod>/api/cron/crm-lead-hunter-sevilla
```
Expected: recibes 2 emails — el de catering enlaza `/catering` (utm `crm_catering`), el de eventos enlaza `/espacios` (utm `crm_eventos`). En Supabase, `leads_web_tracking` tiene una fila por lead con el `utm_source` correcto. Limpiar los leads de prueba al terminar.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/crm-lead-hunter-sevilla/route.ts
git commit -m "feat(cron): crm-lead-hunter-sevilla con 3 plantillas de venta por vertical"
```

---

## Cierre

### Tarea 10: Verificación global + memoria de sesión

- [ ] **Step 1: Verificación completa (build de Vercel real)**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npm run lint` → 0 errors.
Run: `npm run build` → build OK (reproduce el build de Vercel; no basta `tsc`).

- [ ] **Step 2: Actualizar la memoria de sesión**

En `docs/CONTEXTO-SESIONES.md`, añadir arriba en "Registro de sesiones" una entrada describiendo: el agente de venta catering/eventos (Sevilla), el motor Apify (2 fases + `prospeccion_apify_runs`), la presentación con bucket `eventos`, los borradores/email por vertical, la RPC v2; migraciones aplicadas; y el pendiente **`APIFY_TOKEN` en Vercel** (sin él, `prospeccion-apify` hace no-op). Refrescar "Estado actual" y "Pendientes".

- [ ] **Step 3: Commit**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs: registro de sesion del agente de venta catering/eventos (Sevilla)"
```

- [ ] **Step 4: Push**

```bash
git push origin claude/leais-sales-agent-catering-b5ikA
```

---

## Notas de cierre para quien implemente

- **`APIFY_TOKEN`** lo añade Alberto en Vercel env (encrypted, production+preview). Sin él, todo lo demás funciona; solo `prospeccion-apify` queda en no-op.
- **No spamear:** todas las pruebas de email con leads de prueba que lleven el email de Alberto, y borrarlos después.
- **Verificar build con deps** (`npm ci` + `npm run build`), no solo `tsc` — lección de la PR #17.
- **Migraciones** se aplican en Supabase (`efncqyvhniaxsirhdxaa`) vía MCP `apply_migration`. No borrar datos.
- Si en la Tarea 4 se confirma que `leads.origen` no existe, aplicar la variante `estudio_completo->>'origen'` en las Tareas 4 y 8 de forma consistente.
