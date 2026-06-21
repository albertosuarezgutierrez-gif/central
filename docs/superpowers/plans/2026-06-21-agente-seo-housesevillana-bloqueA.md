# Agente SEO housesevillana — Bloque A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir el agente SEO de housesevillana.es (sivra) al nivel de seguridad de ia-rest: kill switch, snapshot+revert y JSON-LD conservador, sin depender de Google.

**Architecture:** Se extraen los helpers de lectura/escritura de la landing a `lib/seo-landing.ts` (DRY) para compartirlos entre `seo-refresh` y el nuevo `seo-revert`. El kill switch (`SEO_AGENT_ENABLED`) solo gatea el cron automático. El revert re-commitea el title/desc/OG anteriores (guardados en `seo_proposals`). El JSON-LD solo se reemplaza si ya existe en la landing.

**Tech Stack:** Next.js (App Router) en `apps/sivra`, Prisma + Supabase (`wswbehlcuxqxyinousql`), GitHub Contents API, `aiSearch` (pasarela central). Verificación: `npx --yes tsx` (lógica pura) + `prisma generate && next build`.

---

## File Structure

| Archivo | Responsabilidad | Crear/Modificar |
|---|---|---|
| `apps/sivra/lib/seo-landing.ts` | Helpers landing: token, fetch, push, extract, escJs, applyReplacements (con schema opcional) | Crear (extraído de seo-refresh) |
| `apps/sivra/app/api/seo-refresh/route.ts` | Usa lib + kill switch + persiste OG + schema en análisis | Modificar |
| `apps/sivra/app/api/seo-revert/route.ts` | Revierte una propuesta (re-commit del "antes") | Crear |
| `apps/sivra/prisma/schema.prisma` | `currentOgDescription String?` + enum `REVERTED` | Modificar |
| `apps/sivra/app/(dashboard)/seo/page.tsx` | Botón "Revertir" + estado REVERTED | Modificar |
| `apps/sivra/scripts/seo/test-landing.ts` | Verificación pura de `applySeoReplacements` | Crear |

Migración aditiva en `seo_proposals` se aplica vía Supabase MCP.

---

### Task 1: Extraer helpers de la landing a `lib/seo-landing.ts`

**Files:**
- Create: `apps/sivra/lib/seo-landing.ts`
- Modify: `apps/sivra/app/api/seo-refresh/route.ts`

- [ ] **Step 1: Crear `lib/seo-landing.ts`**

```typescript
// apps/sivra/lib/seo-landing.ts
// Lectura/escritura de la landing estática housesevillana (repo house-sevillana-landing,
// fichero app/route.ts) vía GitHub Contents API. Compartido por seo-refresh y seo-revert.

const LANDING_API = 'https://api.github.com/repos/albertosuarezgutierrez-gif/house-sevillana-landing/contents/app/route.ts'

export function githubToken(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) throw new Error('Falta GITHUB_TOKEN en el entorno de sivra (necesario para leer y commitear la landing de housesevillana).')
  return t
}

export async function fetchLanding(): Promise<{ content: string; sha: string }> {
  const res = await fetch(LANDING_API, {
    headers: { Authorization: `token ${githubToken()}`, 'User-Agent': 'roi-intranet-seo', Accept: 'application/vnd.github+json' },
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || typeof d?.content !== 'string') {
    const detalle = typeof d?.message === 'string' ? d.message : `HTTP ${res.status}`
    throw new Error(`No se pudo leer la landing desde GitHub (${res.status}): ${detalle}. Revisa GITHUB_TOKEN y su acceso al repo house-sevillana-landing.`)
  }
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha as string }
}

export async function pushToGitHub(content: string, sha: string, message: string): Promise<void> {
  const res = await fetch(LANDING_API, {
    method: 'PUT',
    headers: { Authorization: `token ${githubToken()}`, 'Content-Type': 'application/json', 'User-Agent': 'roi-intranet-seo' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  })
  if (!res.ok) throw new Error(`GitHub push failed (${res.status}): ${await res.text()}`)
}

export function extractSeoParams(raw: string) {
  return {
    title:         raw.match(/<title>([^<]+)<\/title>/)?.[1]                                    ?? '',
    description:   raw.match(/<meta name=\\"description\\" content=\\"([^\\"]+)\\"/)?.[1]       ?? '',
    ogDescription: raw.match(/<meta property=\\"og:description\\" content=\\"([^\\"]+)\\"/)?.[1] ?? '',
  }
}

export function escJs(s: string): string { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }

/**
 * Reescribe title/description/og en la landing. Si se pasa `schemaJson` Y la landing ya
 * contiene un bloque ld+json, lo reemplaza; si no existe el bloque, NO inserta nada
 * (la landing es un string con comillas escapadas en un repo externo no inspeccionable).
 */
export function applySeoReplacements(
  raw: string, title: string, description: string, ogDescription: string, schemaJson?: string,
): string {
  let out = raw
    .replace(/<title>[^<]*<\/title>/, `<title>${title}<\/title>`)
    .replace(/<meta name=\\"description\\" content=\\"[^\\"]*\\"/, `<meta name=\\"description\\" content=\\"${escJs(description)}\\"`)
    .replace(/<meta property=\\"og:title\\" content=\\"[^\\"]*\\"/, `<meta property=\\"og:title\\" content=\\"${escJs(title)}\\"`)
    .replace(/<meta property=\\"og:description\\" content=\\"[^\\"]*\\"/, `<meta property=\\"og:description\\" content=\\"${escJs(ogDescription)}\\"`)
  if (schemaJson) {
    const ldRe = /<script type=\\"application\/ld\+json\\">[\s\S]*?<\/script>/
    if (ldRe.test(out)) {
      out = out.replace(ldRe, `<script type=\\"application\/ld+json\\">${escJs(schemaJson)}<\/script>`)
    }
  }
  return out
}
```

- [ ] **Step 2: Reapuntar `seo-refresh/route.ts` a la lib**

Borra de `seo-refresh/route.ts` las definiciones locales de `LANDING_API`, `githubToken`, `fetchLanding`, `pushToGitHub`, `extractSeoParams`, `escJs`, `applySeoReplacements`. Añade el import al principio (junto a los otros):

```typescript
import { fetchLanding, pushToGitHub, extractSeoParams, applySeoReplacements } from '@/lib/seo-landing'
```

Y como `pushToGitHub` ahora exige `message`, actualiza su única llamada en el `GET` para pasar el mensaje:

```typescript
    await pushToGitHub(updated, sha, `chore(seo): actualización automática [${new Date().toISOString().split('T')[0]}]`)
```

- [ ] **Step 3: Verificar build**

Run: `cd apps/sivra && npx prisma generate >/dev/null && npm run build 2>&1 | tail -4`
Expected: build OK (sin errores nuevos en seo-refresh ni seo-landing).

- [ ] **Step 4: Commit**

```bash
git add apps/sivra/lib/seo-landing.ts apps/sivra/app/api/seo-refresh/route.ts
git commit -m "refactor(sivra/seo): extraer helpers de la landing a lib/seo-landing"
```

---

### Task 2: Verificación pura de `applySeoReplacements`

**Files:**
- Create: `apps/sivra/scripts/seo/test-landing.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// apps/sivra/scripts/seo/test-landing.ts
// Verificación pura (sin red): se corre con `npx --yes tsx`.
import { applySeoReplacements } from '../../lib/seo-landing'

let fallos = 0
const check = (n: string, c: boolean) => { if (!c) { console.error(`✗ ${n}`); fallos++ } else console.log(`✓ ${n}`) }

// Landing como string con comillas escapadas (igual que el app/route.ts real).
const SAMPLE = `<title>Viejo</title><meta name=\\"description\\" content=\\"old desc\\"><meta property=\\"og:title\\" content=\\"old ogt\\"><meta property=\\"og:description\\" content=\\"old ogd\\">`

const out = applySeoReplacements(SAMPLE, 'Nuevo', 'new desc', 'new ogd')
check('reemplaza title', out.includes('<title>Nuevo</title>'))
check('reemplaza description', out.includes('content=\\"new desc\\"'))
check('reemplaza og:title (usa title)', out.includes('content=\\"Nuevo\\"'))
check('reemplaza og:description', out.includes('content=\\"new ogd\\"'))

// Schema: si NO existe bloque ld+json, no se inserta nada.
const sinLd = applySeoReplacements(SAMPLE, 'T', 'D', 'O', '{"@type":"VacationRental"}')
check('schema NO se inserta si no existe bloque', !sinLd.includes('ld+json'))

// Schema: si SÍ existe bloque, se reemplaza su contenido.
const conBloque = SAMPLE + `<script type=\\"application/ld+json\\">{\\"old\\":1}<\/script>`
const conLd = applySeoReplacements(conBloque, 'T', 'D', 'O', '{"@type":"VacationRental"}')
check('schema se reemplaza si existe bloque', conLd.includes('VacationRental'))
check('schema viejo desaparece', !conLd.includes('\\"old\\":1'))

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1) }
console.log('\nseo-landing OK')
```

- [ ] **Step 2: Correr el test (debe pasar; la lib ya existe de la Task 1)**

Run: `cd apps/sivra && npx --yes tsx scripts/seo/test-landing.ts`
Expected: `seo-landing OK`, exit 0. (Si algún check de schema falla por el formato de comillas, ajustar el regex `ldRe` en `lib/seo-landing.ts` hasta que pase, manteniendo la semántica "solo reemplaza si existe".)

- [ ] **Step 3: Commit**

```bash
git add apps/sivra/scripts/seo/test-landing.ts
git commit -m "test(sivra/seo): verificación pura de applySeoReplacements"
```

---

### Task 3: Prisma — `currentOgDescription` + enum `REVERTED` + migración

**Files:**
- Modify: `apps/sivra/prisma/schema.prisma`

- [ ] **Step 1: Editar el modelo y el enum**

En `model SeoProposal`, añadir tras `currentDescription String`:

```prisma
  currentOgDescription String?
```

En `enum SeoStatus`, añadir el valor:

```prisma
enum SeoStatus {
  PENDING
  APPLIED
  REJECTED
  REVERTED
}
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Aplicar vía MCP `mcp__Supabase__apply_migration` (project `wswbehlcuxqxyinousql`, name `seo_proposals_revert`):

```sql
alter table public.seo_proposals add column if not exists "currentOgDescription" text;
alter type "SeoStatus" add value if not exists 'REVERTED';
```

- [ ] **Step 3: Regenerar el cliente Prisma y typecheck**

Run: `cd apps/sivra && npx prisma generate >/dev/null && npx tsc --noEmit 2>&1 | grep -i "seoProposal\|currentOg\|REVERTED" || echo "sin errores nuevos de tipos del modelo"`
Expected: `sin errores nuevos de tipos del modelo`.

- [ ] **Step 4: Commit**

```bash
git add apps/sivra/prisma/schema.prisma
git commit -m "feat(sivra/seo): snapshot OG anterior + estado REVERTED en SeoProposal"
```

---

### Task 4: `seo-refresh` — kill switch + persistir OG + schema en análisis

**Files:**
- Modify: `apps/sivra/app/api/seo-refresh/route.ts`

- [ ] **Step 1: Kill switch en el path del cron**

En `GET`, justo después de calcular `cronOk`, añade el gate (solo afecta a la llamada automática; el botón manual con sesión sigue):

```typescript
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (cronOk && process.env.SEO_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ ok: false, msg: 'SEO_AGENT_ENABLED != true (agente automático deshabilitado)' })
  }
  if (!cronOk) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
```

- [ ] **Step 2: Pedir `schema` en el análisis**

Sustituye la última línea del JSON del `SEO_SYSTEM` para incluir `schema`. El bloque del system prompt queda:

```typescript
Responde SOLO con JSON valido sin markdown:
{"title":"(max 60 chars)","description":"(max 155 chars)","og_description":"(max 100 chars)","analysis":"150-200 palabras","top_competitors":[{"title":"","why_ranking":""}],"schema":{"@context":"https://schema.org","@type":"VacationRental","name":"House Sevillana","description":"(1-2 frases)"}}`
```

(El resto de `SEO_SYSTEM` y `runSeoAnalysis` no cambian: `runSeoAnalysis` ya hace `JSON.parse` y devuelve el objeto completo, ahora con `schema`.)

- [ ] **Step 3: Aplicar schema (condicional) y persistir OG anterior**

En el `try` del `GET`, sustituye el bloque desde `const updated = ...` hasta el `prisma.seoProposal.create({...})` por:

```typescript
    const schemaJson = proposal.schema ? JSON.stringify(proposal.schema) : undefined
    const updated = applySeoReplacements(content,
      String(proposal.title ?? ''),
      String(proposal.description ?? ''),
      String(proposal.og_description ?? ''),
      schemaJson,
    )
    await pushToGitHub(updated, sha, `chore(seo): actualización automática [${new Date().toISOString().split('T')[0]}]`)
    await prisma.seoProposal.create({
      data: {
        title: String(proposal.title ?? ''),
        description: String(proposal.description ?? ''),
        ogDescription: String(proposal.og_description ?? ''),
        schemaDescription: schemaJson ?? null,
        topCompetitors: proposal.top_competitors ?? null,
        analysis: String(proposal.analysis ?? ''),
        currentTitle: current.title,
        currentDescription: current.description,
        currentOgDescription: current.ogDescription,
        token: crypto.randomUUID(),
        status: 'APPLIED',
        appliedAt: new Date(),
      },
    })
```

- [ ] **Step 4: Verificar build**

Run: `cd apps/sivra && npm run build 2>&1 | tail -4`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/sivra/app/api/seo-refresh/route.ts
git commit -m "feat(sivra/seo): kill switch del cron + snapshot OG + JSON-LD conservador"
```

---

### Task 5: Endpoint `/api/seo-revert`

**Files:**
- Create: `apps/sivra/app/api/seo-revert/route.ts`

- [ ] **Step 1: Implementar el endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { fetchLanding, pushToGitHub, applySeoReplacements } from '@/lib/seo-landing'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const prop = await prisma.seoProposal.findUnique({ where: { id } })
  if (!prop) return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  if (prop.currentTitle == null || prop.currentDescription == null) {
    return NextResponse.json({ error: 'Esa propuesta no tiene snapshot del estado anterior; no se puede revertir.' }, { status: 422 })
  }

  try {
    const { content, sha } = await fetchLanding()
    const restored = applySeoReplacements(
      content,
      prop.currentTitle,
      prop.currentDescription,
      prop.currentOgDescription ?? '',
    )
    await pushToGitHub(restored, sha, `chore(seo): revertir a estado anterior [${new Date().toISOString().split('T')[0]}]`)
    await prisma.seoProposal.update({ where: { id }, data: { status: 'REVERTED' } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[seo-revert]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/sivra && npm run build 2>&1 | tail -4`
Expected: build OK; ruta `/api/seo-revert` presente.

- [ ] **Step 3: Commit**

```bash
git add apps/sivra/app/api/seo-revert/route.ts
git commit -m "feat(sivra/seo): endpoint de reversión de housesevillana"
```

---

### Task 6: UI — botón "Revertir" en `/seo`

**Files:**
- Modify: `apps/sivra/app/(dashboard)/seo/page.tsx`

- [ ] **Step 1: Ampliar el tipo `SeoProposal` del cliente**

En la definición `type SeoProposal = {...}` añade el estado y la fecha (ya viene del API):

```typescript
  status?: string
```

- [ ] **Step 2: Añadir la función de revertir**

Dentro del componente `SeoPage`, junto a `runSeo`, añade:

```typescript
  const [reverting, setReverting] = useState<string | null>(null)
  async function revertir(id: string) {
    if (!confirm('¿Revertir housesevillana.es al estado anterior a esta actualización?')) return
    setReverting(id)
    try {
      const res  = await fetch('/api/seo-revert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const data = await res.json()
      if (!data.ok) alert(data.error ?? 'Error al revertir')
      await fetchHistory()
    } finally {
      setReverting(null)
    }
  }
```

- [ ] **Step 3: Mostrar el botón en cada entrada `APPLIED`**

Dentro del `map` del historial, en el cuerpo expandido (`{isOpen && (...)}`), tras el bloque "Cambios aplicados" añade:

```tsx
                    {p.status === 'APPLIED' && (
                      <button
                        onClick={() => revertir(p.id)}
                        disabled={reverting === p.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-[4px] border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        {reverting === p.id ? 'Revirtiendo…' : '↩ Revertir esta actualización'}
                      </button>
                    )}
                    {p.status === 'REVERTED' && (
                      <div className="text-xs text-[#9898A8] italic">Revertida</div>
                    )}
```

- [ ] **Step 4: Verificar build**

Run: `cd apps/sivra && npm run build 2>&1 | tail -4`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add "apps/sivra/app/(dashboard)/seo/page.tsx"
git commit -m "feat(sivra/seo): botón Revertir + estado REVERTED en /seo"
```

---

### Task 7: Verificación final + memoria + PR

- [ ] **Step 1: Lógica pura**

Run: `cd apps/sivra && npx --yes tsx scripts/seo/test-landing.ts`
Expected: `seo-landing OK`.

- [ ] **Step 2: Build real**

Run: `cd apps/sivra && npm run build 2>&1 | tail -6`
Expected: build OK.

- [ ] **Step 3: Memoria de sesión**

Añadir entrada arriba en `docs/CONTEXTO-SESIONES.md`: Bloque A del agente SEO de housesevillana (kill switch `SEO_AGENT_ENABLED`, snapshot+revert, JSON-LD conservador); migración aditiva en `seo_proposals`; pendiente `GITHUB_TOKEN` en Vercel sivra y Bloque B (GSC+GA4).

- [ ] **Step 4: Push + PR draft**

```bash
git add docs/CONTEXTO-SESIONES.md && git commit -m "docs(seo): registrar Bloque A housesevillana"
git push -u origin claude/seo-agent-auto-activation-5ypj5x
```
Crear PR draft contra `main`.

---

## Notas de despliegue (post-merge)

1. `GITHUB_TOKEN` en el Vercel de sivra (acceso a `house-sevillana-landing`) — imprescindible para refresh y revert.
2. `SEO_AGENT_ENABLED=true` para que el cron semanal actúe; sin ella el cron sale sin tocar nada (el botón manual funciona igual).
3. Bloque B (GSC+GA4, datos reales) — fase aparte con OAuth.
