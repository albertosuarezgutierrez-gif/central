# Smoobu HMAC Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Smoobu API call that uses the legacy `Api-Key` header with HMAC-SHA256 authentication before September 25, 2026, when Smoobu stops accepting the old header.

**Architecture:** Add `getSmoobuSecret()` and `buildSmoobuHeaders()` to `apps/plataforma/lib/smoobu.ts` (the canonical source), mirror the same two functions in `apps/sivra/lib/smoobu.ts`, port two sivra-only endpoints to plataforma, then do a mechanical find-and-replace of every `{ 'Api-Key': key }` header object in all 23 plataforma files and all 14 sivra files with a call to `buildSmoobuHeaders()`. Finish by upgrading the incoming webhook to verify the HMAC Smoobu sends us.

**Tech Stack:** Next.js 15, TypeScript, Node.js built-in `crypto` module (`createHmac`), Prisma raw SQL, Supabase (shared BD `wswbehlcuxqxyinousql`).

---

## Reference: HMAC canonical string format

```
{METHOD}\n{path}\n{queryString}\n{timestamp}\n{nonce}\n{bodyHash}\n{apiKey}
```

- `METHOD`: uppercase HTTP verb, e.g. `GET`, `POST`
- `path`: URL path without host, e.g. `/api/reservations`
- `queryString`: raw query string without `?`, e.g. `pageSize=100&page=1`; empty string `""` if none
- `timestamp`: ISO 8601, e.g. `2026-06-23T14:00:00.000Z`
- `nonce`: UUID v4 (unique per request)
- `bodyHash`: SHA-256 of the raw request body as lowercase hex; SHA-256 of `""` for GET/no body = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `apiKey`: the `X-API-Key` value (same string as legacy `Api-Key`)

Signature: `HMAC-SHA256(canonicalString, secret)` → base64

---

## File Map

| File | Action | What changes |
|---|---|---|
| `apps/plataforma/lib/smoobu.ts` | Modify | Add `getSmoobuSecret()` + `buildSmoobuHeaders()` |
| `apps/sivra/lib/smoobu.ts` | Modify | Add `getSmoobuSecret()` + `buildSmoobuHeaders()` |
| `apps/plataforma/lib/sivra/agente-huesped/contexto.ts` | Modify | 3 `Api-Key` fetch calls → `buildSmoobuHeaders()` |
| `apps/plataforma/lib/sivra/agente-huesped/enviar.ts` | Modify | 1 `Api-Key` fetch call → `buildSmoobuHeaders()` |
| `apps/plataforma/lib/sivra/agente-huesped/guia.ts` | Modify | 1 `Api-Key` fetch call → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/updates/sync/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/rates/snapshot/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/pricing/restore/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/pricing/apply/route.ts` | Modify | 2 `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/[bookingId]/route.ts` | Modify | 2 `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/auto-reply/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/diagnostico-guia/route.ts` | Modify | 3 `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/reply/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/seed-aprendizaje/route.ts` | Modify | 2 `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/limpiadoras/alerta-ventana/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/limpiadoras/auto-sessions/route.ts` | Modify | 2 `Api-Key` → `buildSmoobuHeaders()` |
| `apps/plataforma/app/api/sivra/mensajes/webhook/route.ts` | Modify | Add incoming HMAC verification |
| `apps/plataforma/app/api/sivra/pricing/pisos-zona/route.ts` | **Create** | Port of sivra's `pricing/pisos-zona` |
| `apps/plataforma/app/api/sivra/pricing/aplicar-propuesta/route.ts` | **Create** | Port of sivra's `pricing/aplicar-propuesta` |
| `apps/sivra/lib/smoobu.ts` | Modify | Add `getSmoobuSecret()` + `buildSmoobuHeaders()` |
| `apps/sivra/app/api/pricing/pisos-zona/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` (until removed) |
| `apps/sivra/app/api/pricing/aplicar-propuesta/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` (until removed) |
| `apps/sivra/app/api/pricing/restore/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/rates/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/rates/snapshot/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/updates/sync/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/pricing/apply/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/limpiadoras/alerta-ventana/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/limpiadoras/auto-sessions/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/mensajes/[bookingId]/email/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/mensajes/[bookingId]/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/mensajes/auto-reply/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/mensajes/reply/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |
| `apps/sivra/app/api/mensajes/route.ts` | Modify | `Api-Key` → `buildSmoobuHeaders()` |

---

### Task 1: BD migration — store HMAC secret + add Vercel env

**✅ DONE** — `webhook_secret` updated in `pms_connections` (23/06/2026).

**Files:** No code files change in this task — pure database + environment config.

- [x] **Step 1.1: Update `webhook_secret` in the database** ✅ Done via Supabase MCP.

- [ ] **Step 1.2: Add `SMOOBU_HMAC_SECRET` to the Vercel project `plataforma`**

In the Vercel dashboard, add to the **plataforma** project:
```
SMOOBU_HMAC_SECRET=kW0iciZ0Gik6tsNpQS+RcQ0U/mtRzOswFM/Xwhl4FrE=
```
Environments: Production, Preview, Development.

- [ ] **Step 1.3: Add `SMOOBU_HMAC_SECRET` to the Vercel project `sivra`**

Same value, same environments, for the **sivra** project.

---

### Task 2: Core lib — `apps/plataforma/lib/smoobu.ts`

**Files:**
- Modify: `apps/plataforma/lib/smoobu.ts`

- [ ] **Step 2.1: Replace `apps/plataforma/lib/smoobu.ts` with the complete updated file**

```typescript
import { createHmac, createHash } from 'crypto'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'

// ─── Connection identity ────────────────────────────────────────────────────
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? 'c8c1fb07-8538-4656-8e09-9546e9014a25'

const TTL_MS = 5 * 60_000

// ─── Key cache ──────────────────────────────────────────────────────────────
let keyCache: { key: string; at: number } | null = null

export async function getSmoobuKey(): Promise<string> {
  if (keyCache && Date.now() - keyCache.at < TTL_MS) return keyCache.key
  let key = ''
  try {
    const rows = await prisma.$queryRaw<{ smoobu_api_key: string | null }[]>`
      SELECT smoobu_api_key
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    key = rows?.[0]?.smoobu_api_key?.trim() ?? ''
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!key) key = process.env.SMOOBU_API_KEY ?? ''
  keyCache = { key, at: Date.now() }
  return key
}

// ─── Secret cache ────────────────────────────────────────────────────────────
let secretCache: { secret: string; at: number } | null = null

export async function getSmoobuSecret(): Promise<string> {
  if (secretCache && Date.now() - secretCache.at < TTL_MS) return secretCache.secret
  let secret = ''
  try {
    const rows = await prisma.$queryRaw<{ webhook_secret: string | null }[]>`
      SELECT webhook_secret
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    secret = rows?.[0]?.webhook_secret?.trim() ?? ''
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!secret) secret = process.env.SMOOBU_HMAC_SECRET ?? ''
  secretCache = { secret, at: Date.now() }
  return secret
}

// ─── HMAC header builder ─────────────────────────────────────────────────────
//
// Call before EVERY Smoobu API fetch. Pass:
//   method  — uppercase HTTP verb: 'GET' | 'POST' | 'PUT' | 'DELETE'
//   path    — URL path without host, e.g. '/api/reservations'
//   query   — raw query string WITHOUT the '?', e.g. 'pageSize=100&page=1'
//             pass '' for requests with no query string
//   body    — raw JSON string you will pass as the request body
//             pass '' for GET requests / requests with no body
//
// Returns a Record<string,string> you can spread straight into fetch headers:
//   const hdrs = await buildSmoobuHeaders('GET', '/api/threads', 'pageSize=50', '')
//   fetch(url, { headers: { ...hdrs, 'Cache-Control': 'no-cache' } })
//
export async function buildSmoobuHeaders(
  method: string,
  path: string,
  query: string,
  body: string,
): Promise<Record<string, string>> {
  const [apiKey, secret] = await Promise.all([getSmoobuKey(), getSmoobuSecret()])
  const timestamp = new Date().toISOString()
  const nonce     = randomUUID()
  const bodyHash  = createHash('sha256').update(body).digest('hex')

  const canonical = [method.toUpperCase(), path, query, timestamp, nonce, bodyHash, apiKey].join('\n')
  const signature = createHmac('sha256', secret).update(canonical).digest('base64')

  return {
    'X-API-Key':   apiKey,
    'X-Timestamp': timestamp,
    'X-Nonce':     nonce,
    'X-Signature': signature,
  }
}
```

- [ ] **Step 2.2: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | head -40
```

Expected: no errors from `lib/smoobu.ts`.

- [ ] **Step 2.3: Commit**

```bash
git add apps/plataforma/lib/smoobu.ts
git commit -m "feat(sivra): add getSmoobuSecret + buildSmoobuHeaders to plataforma lib"
```

---

### Task 3: Core lib — `apps/sivra/lib/smoobu.ts`

**Files:**
- Modify: `apps/sivra/lib/smoobu.ts`

- [ ] **Step 3.1: Replace `apps/sivra/lib/smoobu.ts` with the complete updated file**

```typescript
import { createHmac, createHash } from 'crypto'
import { randomUUID } from 'crypto'
import { prisma } from "@/lib/prisma"

// ─── Connection identity ────────────────────────────────────────────────────
const CONNECTION_ID =
  process.env.SMOOBU_PMS_CONNECTION_ID ?? "c8c1fb07-8538-4656-8e09-9546e9014a25"

const TTL_MS = 5 * 60_000

// ─── Key cache ──────────────────────────────────────────────────────────────
let keyCache: { key: string; at: number } | null = null

export async function getSmoobuKey(): Promise<string> {
  if (keyCache && Date.now() - keyCache.at < TTL_MS) return keyCache.key
  let key = ""
  try {
    const rows = await prisma.$queryRaw<{ smoobu_api_key: string | null }[]>`
      SELECT smoobu_api_key
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    key = rows?.[0]?.smoobu_api_key?.trim() ?? ""
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!key) key = process.env.SMOOBU_API_KEY ?? ""
  keyCache = { key, at: Date.now() }
  return key
}

// ─── Secret cache ────────────────────────────────────────────────────────────
let secretCache: { secret: string; at: number } | null = null

export async function getSmoobuSecret(): Promise<string> {
  if (secretCache && Date.now() - secretCache.at < TTL_MS) return secretCache.secret
  let secret = ""
  try {
    const rows = await prisma.$queryRaw<{ webhook_secret: string | null }[]>`
      SELECT webhook_secret
      FROM pms_connections
      WHERE id = ${CONNECTION_ID}::uuid AND activa = true
      LIMIT 1
    `
    secret = rows?.[0]?.webhook_secret?.trim() ?? ""
  } catch {
    // BD no disponible → respaldo al env
  }
  if (!secret) secret = process.env.SMOOBU_HMAC_SECRET ?? ""
  secretCache = { secret, at: Date.now() }
  return secret
}

// ─── HMAC header builder ─────────────────────────────────────────────────────
//
// Call before EVERY Smoobu API fetch. Pass:
//   method  — uppercase HTTP verb: 'GET' | 'POST' | 'PUT' | 'DELETE'
//   path    — URL path without host, e.g. '/api/reservations'
//   query   — raw query string WITHOUT the '?', e.g. 'pageSize=100&page=1'
//             pass '' for requests with no query string
//   body    — raw JSON string you will pass as the request body
//             pass '' for GET requests / requests with no body
//
export async function buildSmoobuHeaders(
  method: string,
  path: string,
  query: string,
  body: string,
): Promise<Record<string, string>> {
  const [apiKey, secret] = await Promise.all([getSmoobuKey(), getSmoobuSecret()])
  const timestamp = new Date().toISOString()
  const nonce     = randomUUID()
  const bodyHash  = createHash("sha256").update(body).digest("hex")

  const canonical = [method.toUpperCase(), path, query, timestamp, nonce, bodyHash, apiKey].join("\n")
  const signature = createHmac("sha256", secret).update(canonical).digest("base64")

  return {
    "X-API-Key":   apiKey,
    "X-Timestamp": timestamp,
    "X-Nonce":     nonce,
    "X-Signature": signature,
  }
}
```

- [ ] **Step 3.2: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/sivra/tsconfig.json 2>&1 | head -40
```

- [ ] **Step 3.3: Commit**

```bash
git add apps/sivra/lib/smoobu.ts
git commit -m "feat(sivra): add getSmoobuSecret + buildSmoobuHeaders to sivra lib"
```

---

### Task 4: Port `pricing/pisos-zona` to plataforma

**Files:**
- Create: `apps/plataforma/app/api/sivra/pricing/pisos-zona/route.ts`

- [ ] **Step 4.1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { buildSmoobuHeaders } from "@/lib/smoobu"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BASE = "https://login.smoobu.com/api"
const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const results: any[] = []
  for (const [propId, smoobuId] of Object.entries(SMOOBU_ID)) {
    try {
      const path = `/api/apartments/${smoobuId}`
      const hdrs = await buildSmoobuHeaders("GET", path, "", "")
      const res = await fetch(`${BASE}/apartments/${smoobuId}`, {
        headers: { ...hdrs, "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) { results.push({ propId, error: `Smoobu ${res.status}` }); continue }
      const a = await res.json()
      const loc = a.location ?? {}
      const lat = loc.latitude ?? loc.lat ?? null
      const lon = loc.longitude ?? loc.lng ?? null
      const zip = loc.zip ?? loc.postalCode ?? loc.postal_code ?? null
      const maxGuests = a.maxOccupancy ?? a.max_occupancy ?? a.rooms?.maxOccupancy ?? null
      const tipo = a.type?.name ?? a.type ?? null
      const nombre = a.name ?? null

      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_piso_zona (property_id, smoobu_id, nombre, lat, lon, postal_code, max_guests, tipo, raw, updated_at)
        VALUES (${propId}, ${smoobuId}::int, ${nombre}, ${lat}::numeric, ${lon}::numeric,
                ${zip}, ${maxGuests}::int, ${tipo}, ${JSON.stringify(a)}::jsonb, now())
        ON CONFLICT (property_id) DO UPDATE SET
          smoobu_id=EXCLUDED.smoobu_id, nombre=EXCLUDED.nombre, lat=EXCLUDED.lat, lon=EXCLUDED.lon,
          postal_code=EXCLUDED.postal_code, max_guests=EXCLUDED.max_guests, tipo=EXCLUDED.tipo,
          raw=EXCLUDED.raw, updated_at=now()`)
      results.push({ propId, nombre, lat, lon, zip, maxGuests, tipo })
    } catch (e) {
      results.push({ propId, error: String(e).slice(0, 100) })
    }
  }

  return NextResponse.json({ ok: true, pisos: results })
}
```

- [ ] **Step 4.2: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "pisos-zona"
```

- [ ] **Step 4.3: Commit**

```bash
git add apps/plataforma/app/api/sivra/pricing/pisos-zona/route.ts
git commit -m "feat(sivra): port pricing/pisos-zona to plataforma with HMAC auth"
```

---

### Task 5: Port `pricing/aplicar-propuesta` to plataforma

**Files:**
- Create: `apps/plataforma/app/api/sivra/pricing/aplicar-propuesta/route.ts`

- [ ] **Step 5.1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { buildSmoobuHeaders } from "@/lib/smoobu"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const BASE = "https://login.smoobu.com/api"
const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const ISO = /^\d{4}-\d{2}-\d{2}$/

const CB_MAX_DATES = 800
const CB_MAX_AVG_ABS_PCT = 0.60

type Proposal = {
  property_id: string
  rate_date: string
  price: number
  min_stay?: number | null
  motivo?: string | null
  variables?: Record<string, unknown> | null
}

export async function POST(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* body vacío */ }
  const rawProposals: Proposal[] = Array.isArray(body?.proposals) ? body.proposals
    : Array.isArray(body) ? body : []

  const qDry = req.nextUrl.searchParams.get("dryRun")
  let dryRun = body?.dryRun === false || qDry === "false" ? false : true
  const fuente = String(body?.fuente ?? req.nextUrl.searchParams.get("fuente") ?? "agente").slice(0, 40)
  const cbMaxDates = Number(req.nextUrl.searchParams.get("cbMaxDates") ?? CB_MAX_DATES)
  const cbMaxAvgPct = Number(req.nextUrl.searchParams.get("cbMaxAvgPct") ?? CB_MAX_AVG_ABS_PCT)

  const proposals = rawProposals.filter(p =>
    p && typeof p.property_id === "string" && SMOOBU_ID[p.property_id] != null &&
    typeof p.rate_date === "string" && ISO.test(p.rate_date) &&
    Number.isFinite(Number(p.price)) && Number(p.price) > 0)
  if (proposals.length === 0) {
    return NextResponse.json({ error: "propuesta vacía o inválida", recibidas: rawProposals.length }, { status: 400 })
  }

  let paused = false
  try {
    const cfg = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
      SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`)
    paused = cfg[0]?.paused === true
  } catch { /* sin tabla: no pausado */ }
  if (paused) dryRun = true

  const settingsRows = await prisma.$queryRaw<{
    property_id: string; min_price: number | null; max_price: number | null
    max_change_pct: number; apply_enabled: boolean
  }[]>(Prisma.sql`
    SELECT property_id, min_price, max_price,
           COALESCE(max_change_pct, 0.20)::float8 AS max_change_pct,
           COALESCE(apply_enabled, false) AS apply_enabled
    FROM pricing_settings`)
  const settings = new Map(settingsRows.map(s => [s.property_id, s]))

  const byProp = new Map<string, Proposal[]>()
  for (const p of proposals) {
    const arr = byProp.get(p.property_id) ?? []
    arr.push(p); byProp.set(p.property_id, arr)
  }

  type Plan = {
    propId: string; smoobuId: number; apply_enabled: boolean
    ops: { dates: string[]; daily_price: number; min_length_of_stay?: number }[]
    audit: { rate_date: string; old: number | null; proposed: number; final: number; reason: string; min_stay: number | null; motivo: string; variables: any }[]
    errors: string[]
  }
  const plans: Plan[] = []
  let cbDates = 0, cbPctSum = 0, cbPctN = 0, cbMaxSeen = 0

  for (const [propId, props] of byProp) {
    const smoobuId = SMOOBU_ID[propId]
    const s = settings.get(propId)
    const plan: Plan = { propId, smoobuId, apply_enabled: s?.apply_enabled === true, ops: [], audit: [], errors: [] }

    const dates = props.map(p => p.rate_date).sort()
    const start = dates[0], end = dates[dates.length - 1]
    let cur: Record<string, { price: number | null; available: number }> = {}
    try {
      const ratesQuery = `apartments[]=${smoobuId}&start_date=${start}&end_date=${end}`
      const hdrs = await buildSmoobuHeaders("GET", "/api/rates", ratesQuery, "")
      const res = await fetch(`${BASE}/rates?${ratesQuery}`,
        { headers: { ...hdrs, "Cache-Control": "no-cache" }, next: { revalidate: 0 } })
      if (!res.ok) { plan.errors.push(`Smoobu GET ${res.status}`); plans.push(plan); continue }
      cur = (await res.json()).data?.[smoobuId] ?? {}
    } catch (e) {
      plan.errors.push(`Smoobu GET ${String(e).slice(0, 80)}`); plans.push(plan); continue
    }

    const maxChg = s ? Number(s.max_change_pct) : 0.20
    for (const p of props) {
      const info = cur[p.rate_date]
      if (!info || !info.available) {
        plan.audit.push({ rate_date: p.rate_date, old: info?.price ?? null, proposed: Math.round(Number(p.price)),
          final: info?.price != null ? Math.round(info.price) : 0, reason: "no_disponible",
          min_stay: p.min_stay ?? null, motivo: String(p.motivo ?? ""), variables: p.variables ?? null })
        continue
      }
      const old = info.price != null ? Math.round(info.price) : null
      const proposed = Math.round(Number(p.price))
      let target = proposed
      const reasons: string[] = []

      cbDates++
      if (old != null && old > 0) {
        const pct = Math.abs(proposed - old) / old
        cbPctSum += pct; cbPctN++; cbMaxSeen = Math.max(cbMaxSeen, pct)
      }

      if (s?.min_price != null && target < s.min_price) { target = s.min_price; reasons.push("suelo") }
      if (old != null) {
        const lo = Math.round(old * (1 - maxChg)), hi = Math.round(old * (1 + maxChg))
        const capped = clamp(target, lo, hi)
        if (capped !== target) { reasons.push(target > capped ? "tope_subida" : "tope_bajada"); target = capped }
      }
      if (s?.max_price != null && target > s.max_price) { target = s.max_price; reasons.push("techo") }
      if (s?.min_price != null && target < s.min_price) target = s.min_price

      if (old != null && target === old) {
        plan.audit.push({ rate_date: p.rate_date, old, proposed, final: target, reason: "sin_cambio",
          min_stay: p.min_stay ?? null, motivo: String(p.motivo ?? ""), variables: p.variables ?? null })
        continue
      }
      const ms = p.min_stay != null && Number.isFinite(Number(p.min_stay)) && Number(p.min_stay) > 0
        ? Math.round(Number(p.min_stay)) : undefined
      plan.ops.push({ dates: [p.rate_date], daily_price: target, ...(ms ? { min_length_of_stay: ms } : {}) })
      plan.audit.push({ rate_date: p.rate_date, old, proposed, final: target,
        reason: reasons.length ? reasons.join("+") : "ok", min_stay: ms ?? null,
        motivo: String(p.motivo ?? ""), variables: p.variables ?? null })
    }
    plans.push(plan)
  }

  const cbAvgPct = cbPctN > 0 ? cbPctSum / cbPctN : 0
  const cbTripped = cbDates > cbMaxDates || cbAvgPct > cbMaxAvgPct
  if (cbTripped) {
    await auditDecisiones(plans, true, `${fuente}:CB_ABORT`).catch(() => {})
    return NextResponse.json({
      ok: false, aborted: true, circuit_breaker: {
        dates: cbDates, max_dates: cbMaxDates, avg_abs_pct: Number(cbAvgPct.toFixed(3)),
        max_abs_pct: Number(cbMaxSeen.toFixed(3)), threshold_avg_pct: cbMaxAvgPct,
      },
      message: "Circuit-breaker: la propuesta mueve demasiado. No se ha escrito NADA. Revisión humana.",
    }, { status: 409 })
  }

  const results: any[] = []
  for (const plan of plans) {
    let written = false
    const canWrite = !dryRun && !paused && plan.apply_enabled && plan.ops.length > 0
    if (canWrite) {
      try {
        const postBody = JSON.stringify({ apartments: [plan.smoobuId], operations: plan.ops })
        const hdrs = await buildSmoobuHeaders("POST", "/api/rates", "", postBody)
        const res = await fetch(`${BASE}/rates`, {
          method: "POST",
          headers: { ...hdrs, "Content-Type": "application/json" },
          body: postBody,
        })
        written = res.ok
        if (!res.ok) plan.errors.push(`Smoobu POST ${res.status}`)
      } catch (e) {
        plan.errors.push(`Smoobu POST ${String(e).slice(0, 80)}`)
      }
    }
    results.push({
      property: plan.propId, apply_enabled: plan.apply_enabled,
      fechas_con_cambio: plan.ops.length, written,
      skipped: !plan.apply_enabled && !dryRun ? "apply_enabled=false" : undefined,
      muestra: plan.audit.filter(a => a.reason !== "sin_cambio").slice(0, 4),
      errors: plan.errors.length ? plan.errors : undefined,
    })
  }

  await auditApplied(plans, dryRun).catch(() => {})
  await auditDecisiones(plans, dryRun, fuente).catch(() => {})

  return NextResponse.json({
    ok: true, dryRun, paused,
    circuit_breaker: { dates: cbDates, avg_abs_pct: Number(cbAvgPct.toFixed(3)), tripped: false },
    pisos: results.length, results,
  })
}

async function auditApplied(
  plans: { propId: string; audit: { rate_date: string; old: number | null; final: number; reason: string }[] }[],
  dryRun: boolean,
) {
  for (const plan of plans) {
    const rows = plan.audit.filter(a => a.reason !== "sin_cambio" && a.reason !== "no_disponible")
    if (rows.length === 0) continue
    const values = rows.map(a =>
      Prisma.sql`(${plan.propId}, ${a.rate_date}::date, ${a.old}::int, ${a.final}::int, ${dryRun}, 'agente')`)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run, source)
      VALUES ${Prisma.join(values)}`)
  }
}

async function auditDecisiones(
  plans: { propId: string; audit: { rate_date: string; final: number; min_stay: number | null; motivo: string; variables: any }[] }[],
  dryRun: boolean,
  fuente: string,
) {
  const ciclo = new Date()
  for (const plan of plans) {
    const rows = plan.audit.filter(a => a.final > 0)
    if (rows.length === 0) continue
    const values = rows.map(a =>
      Prisma.sql`(${ciclo}, ${plan.propId}, ${a.rate_date}::date, ${a.final}::int, ${a.min_stay}::int,
        ${a.motivo}, ${JSON.stringify(a.variables ?? {})}::jsonb, ${dryRun}, ${fuente})`)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_decisiones (ciclo_at, property_id, rate_date, price, min_stay, motivo, variables, dry_run, fuente)
      VALUES ${Prisma.join(values)}`)
  }
}
```

- [ ] **Step 5.2: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "aplicar-propuesta"
```

- [ ] **Step 5.3: Commit**

```bash
git add apps/plataforma/app/api/sivra/pricing/aplicar-propuesta/route.ts
git commit -m "feat(sivra): port pricing/aplicar-propuesta to plataforma with HMAC auth"
```

---

### Task 6: Update plataforma agente-huesped libs

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/contexto.ts`
- Modify: `apps/plataforma/lib/sivra/agente-huesped/enviar.ts`
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guia.ts`

**Pattern GET:**
```typescript
// Before:
const res = await fetch(`https://login.smoobu.com/api/...`, {
  headers: { 'Api-Key': key }, cache: 'no-store',
})

// After:
const hdrs = await buildSmoobuHeaders('GET', '/api/...', 'queryString', '')
const res = await fetch(`https://login.smoobu.com/api/...`, {
  headers: { ...hdrs }, cache: 'no-store',
})
```

**Pattern POST:**
```typescript
// Before:
const r = await fetch(url, {
  method: 'POST',
  headers: { 'Api-Key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  body: JSON.stringify(payload),
})

// After:
const rawBody = JSON.stringify(payload)
const hdrs = await buildSmoobuHeaders('POST', '/api/path', '', rawBody)
const r = await fetch(url, {
  method: 'POST',
  headers: { ...hdrs, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  body: rawBody,
})
```

- [ ] **Step 6.1: Update `contexto.ts`** — change import to `buildSmoobuHeaders`, replace 3 fetch calls (each needs its own `buildSmoobuHeaders()` call with unique nonce).

- [ ] **Step 6.2: Update `enviar.ts`** — change import, replace the POST fetch in `enviarAlHuesped()`.

- [ ] **Step 6.3: Update `guia.ts`** — change import, replace the GET fetch in `getGuestUrl()`.

- [ ] **Step 6.4: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "agente-huesped"
```

- [ ] **Step 6.5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/contexto.ts \
        apps/plataforma/lib/sivra/agente-huesped/enviar.ts \
        apps/plataforma/lib/sivra/agente-huesped/guia.ts
git commit -m "feat(sivra): migrate agente-huesped libs to HMAC auth"
```

---

### Task 7: Update plataforma pricing routes

**Files:**
- Modify: `apps/plataforma/app/api/sivra/pricing/apply/route.ts`
- Modify: `apps/plataforma/app/api/sivra/pricing/restore/route.ts`

- [ ] **Step 7.1: `pricing/apply/route.ts`** — add `buildSmoobuHeaders` import, remove `getSmoobuKey`. Replace GET rates fetch and POST rates fetch following the patterns above.

- [ ] **Step 7.2: `pricing/restore/route.ts`** — add `buildSmoobuHeaders` import, remove `getSmoobuKey`. Replace POST fetch.

- [ ] **Step 7.3: TypeScript check + commit**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "sivra/pricing"
git add apps/plataforma/app/api/sivra/pricing/apply/route.ts \
        apps/plataforma/app/api/sivra/pricing/restore/route.ts
git commit -m "feat(sivra): migrate pricing routes to HMAC auth"
```

---

### Task 8: Update plataforma rates/snapshot

**Files:**
- Modify: `apps/plataforma/app/api/sivra/rates/snapshot/route.ts`

- [ ] **Step 8.1:** Add `buildSmoobuHeaders` import, remove `getSmoobuKey`. Inside the `for (const prop of PROPS)` loop replace the GET fetch.

- [ ] **Step 8.2: TypeScript check + commit**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "rates/snapshot"
git add apps/plataforma/app/api/sivra/rates/snapshot/route.ts
git commit -m "feat(sivra): migrate rates/snapshot to HMAC auth"
```

---

### Task 9: Update plataforma updates/sync

**Files:**
- Modify: `apps/plataforma/app/api/sivra/updates/sync/route.ts`

- [ ] **Step 9.1:** Add `buildSmoobuHeaders` import. Rewrite `fetchPage()` to derive headers internally (no `apiKey` argument). Remove `const API_KEY = await getSmoobuKey()` from `runSync()`.

The new `fetchPage` signature:
```typescript
async function fetchPage(p: number, from: string, arrFrom?: string, arrTo?: string) {
  const q = new URLSearchParams({ pageSize: '100', page: String(p), modifiedFrom: from })
  if (arrFrom) q.set('from', arrFrom)
  if (arrTo) q.set('to', arrTo)
  const query = q.toString()
  const hdrs = await buildSmoobuHeaders('GET', '/api/reservations', query, '')
  const res = await fetch(`https://login.smoobu.com/api/reservations?${query}`, {
    headers: { ...hdrs }, cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Smoobu ${res.status}`)
  const d = await res.json()
  return { bookings: d.bookings || [], pageCount: d.page_count || 1 }
}
```

- [ ] **Step 9.2: TypeScript check + commit**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "updates/sync"
git add apps/plataforma/app/api/sivra/updates/sync/route.ts
git commit -m "feat(sivra): migrate updates/sync to HMAC auth"
```

---

### Task 10: Update plataforma mensajes routes

**Files:**
- Modify: `apps/plataforma/app/api/sivra/mensajes/route.ts`
- Modify: `apps/plataforma/app/api/sivra/mensajes/[bookingId]/route.ts`
- Modify: `apps/plataforma/app/api/sivra/mensajes/auto-reply/route.ts`
- Modify: `apps/plataforma/app/api/sivra/mensajes/diagnostico-guia/route.ts`
- Modify: `apps/plataforma/app/api/sivra/mensajes/reply/route.ts`
- Modify: `apps/plataforma/app/api/sivra/mensajes/seed-aprendizaje/route.ts`

Apply the same mechanical pattern to each: add `buildSmoobuHeaders` to import, remove `getSmoobuKey`, replace every `headers: { 'Api-Key': KEY }` with `headers: { ...hdrs }` where `hdrs = await buildSmoobuHeaders(...)`.

- [ ] **Step 10.1:** Update `mensajes/route.ts` (1 fetch, threads list).
- [ ] **Step 10.2:** Update `mensajes/[bookingId]/route.ts` (2 fetches: messages + reservation).
- [ ] **Step 10.3:** Update `mensajes/auto-reply/route.ts` (1 fetch, threads).
- [ ] **Step 10.4:** Update `mensajes/diagnostico-guia/route.ts` (3 fetches: reservations list, single reservation, apartment).
- [ ] **Step 10.5:** Update `mensajes/reply/route.ts` (1 fetch in `getSmoobuGuestUrl()`).
- [ ] **Step 10.6:** Update `mensajes/seed-aprendizaje/route.ts` (2 fetches: reservations list, messages per booking).

- [ ] **Step 10.7: TypeScript check + commit**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "mensajes"
git add \
  apps/plataforma/app/api/sivra/mensajes/route.ts \
  "apps/plataforma/app/api/sivra/mensajes/[bookingId]/route.ts" \
  apps/plataforma/app/api/sivra/mensajes/auto-reply/route.ts \
  apps/plataforma/app/api/sivra/mensajes/diagnostico-guia/route.ts \
  apps/plataforma/app/api/sivra/mensajes/reply/route.ts \
  apps/plataforma/app/api/sivra/mensajes/seed-aprendizaje/route.ts
git commit -m "feat(sivra): migrate mensajes routes to HMAC auth"
```

---

### Task 11: Update plataforma limpiadoras routes

**Files:**
- Modify: `apps/plataforma/app/api/sivra/limpiadoras/alerta-ventana/route.ts`
- Modify: `apps/plataforma/app/api/sivra/limpiadoras/auto-sessions/route.ts`

- [ ] **Step 11.1:** `alerta-ventana/route.ts` — 1 GET fetch (reservations with arrival window).

- [ ] **Step 11.2:** `auto-sessions/route.ts` — 2 parallel GET fetches (departure + arrival). Use `Promise.all` to build both header sets simultaneously.

- [ ] **Step 11.3: TypeScript check + commit**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "limpiadoras"
git add apps/plataforma/app/api/sivra/limpiadoras/alerta-ventana/route.ts \
        apps/plataforma/app/api/sivra/limpiadoras/auto-sessions/route.ts
git commit -m "feat(sivra): migrate limpiadoras routes to HMAC auth"
```

---

### Task 12: Upgrade incoming webhook HMAC verification

**Files:**
- Modify: `apps/plataforma/app/api/sivra/mensajes/webhook/route.ts`

- [ ] **Step 12.1: Replace the file with the HMAC-verified version**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { getSmoobuSecret, getSmoobuKey } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_SKEW_MS = 5 * 60 * 1000

function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
  } catch { return false }
}

async function verifyHmac(req: NextRequest, rawBody: string): Promise<boolean> {
  const incomingKey = req.headers.get('X-API-Key') ?? req.headers.get('x-api-key')
  const timestamp   = req.headers.get('X-Timestamp') ?? req.headers.get('x-timestamp')
  const nonce       = req.headers.get('X-Nonce') ?? req.headers.get('x-nonce')
  const signature   = req.headers.get('X-Signature') ?? req.headers.get('x-signature')

  if (!incomingKey || !timestamp || !nonce || !signature) return false

  const ts = new Date(timestamp).getTime()
  if (isNaN(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false

  const [secret, ourKey] = await Promise.all([getSmoobuSecret(), getSmoobuKey()])
  if (!secret) return false

  const url      = new URL(req.url)
  const path     = url.pathname
  const query    = url.search.slice(1).replace(/&?k=[^&]*/g, '').replace(/^&/, '')
  const bodyHash = createHash('sha256').update(rawBody).digest('hex')
  const canonical = ['POST', path, query, timestamp, nonce, bodyHash, incomingKey].join('\n')
  const expected  = createHmac('sha256', secret).update(canonical).digest('base64')

  if (!safeEqual(incomingKey, ourKey)) return false
  return safeEqual(signature, expected)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const hasHmacHeaders = !!(req.headers.get('X-Signature') ?? req.headers.get('x-signature'))

  if (hasHmacHeaders) {
    const ok = await verifyHmac(req, rawBody)
    if (!ok) return NextResponse.json({ ok: false }, { status: 401 })
  } else {
    const secret = process.env.SMOOBU_WEBHOOK_SECRET
    if (secret && req.nextUrl.searchParams.get('k') !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  let body: any = {}
  try { body = JSON.parse(rawBody) } catch { body = {} }

  const action = body?.action || body?.event
  if (action !== 'newMessage') return NextResponse.json({ ok: true, skipped: 'action' })

  const data   = body?.data || body
  const sender = data?.sender || data?.message?.sender
  if (sender && sender !== 'guest') return NextResponse.json({ ok: true, skipped: 'sender' })

  const bookingId = String(
    data?.bookingId || data?.reservationId || data?.booking?.id || data?.id || ''
  )
  if (!bookingId) return NextResponse.json({ ok: false, error: 'sin bookingId' }, { status: 400 })

  try {
    const r = await procesarMensajeHuesped(bookingId)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
```

- [ ] **Step 12.2: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep "webhook"
```

- [ ] **Step 12.3: Commit**

```bash
git add apps/plataforma/app/api/sivra/mensajes/webhook/route.ts
git commit -m "feat(sivra): upgrade webhook to verify incoming HMAC signature"
```

---

### Task 13: Update all sivra legacy API routes

**Files:** 14 sivra route files (see File Map above).

Apply the identical pattern to each: add `buildSmoobuHeaders` import from `"@/lib/smoobu"`, remove `getSmoobuKey` import, remove `const KEY = await getSmoobuKey()` + its null check, replace each `headers: { "Api-Key": KEY }` with `headers: { ...hdrs }` where `hdrs = await buildSmoobuHeaders(method, path, query, body)`.

- [ ] **Step 13.1:** `apps/sivra/app/api/pricing/pisos-zona/route.ts` — 1 GET fetch per apartment.
- [ ] **Step 13.2:** `apps/sivra/app/api/pricing/aplicar-propuesta/route.ts` — 1 GET + 1 POST fetch.
- [ ] **Step 13.3:** `apps/sivra/app/api/pricing/restore/route.ts` — 1 POST fetch.
- [ ] **Step 13.4:** `apps/sivra/app/api/rates/route.ts` — 1 GET + 1 POST fetch.
- [ ] **Step 13.5:** `apps/sivra/app/api/rates/snapshot/route.ts` — 1 GET fetch per property.
- [ ] **Step 13.6:** `apps/sivra/app/api/updates/sync/route.ts` — rewrite `fetchPage()` to derive headers internally (same as Task 9).
- [ ] **Step 13.7:** `apps/sivra/app/api/pricing/apply/route.ts` — 1 GET + 1 POST fetch.
- [ ] **Step 13.8:** `apps/sivra/app/api/limpiadoras/alerta-ventana/route.ts` — 1 GET fetch.
- [ ] **Step 13.9:** `apps/sivra/app/api/limpiadoras/auto-sessions/route.ts` — 2 parallel GET fetches.
- [ ] **Step 13.10:** `apps/sivra/app/api/mensajes/[bookingId]/email/route.ts` — 1 GET fetch.
- [ ] **Step 13.11:** `apps/sivra/app/api/mensajes/[bookingId]/route.ts` — 2 GET fetches.
- [ ] **Step 13.12:** `apps/sivra/app/api/mensajes/auto-reply/route.ts` — 1 GET fetch (threads) + 1 GET per booking in loop.
- [ ] **Step 13.13:** `apps/sivra/app/api/mensajes/reply/route.ts` — 1 GET fetch in `getSmoobuGuestUrl()`.
- [ ] **Step 13.14:** `apps/sivra/app/api/mensajes/route.ts` — 1 GET fetch.

- [ ] **Step 13.15: TypeScript check**

```bash
cd /home/user/central && npx tsc --noEmit -p apps/sivra/tsconfig.json 2>&1 | head -40
```

- [ ] **Step 13.16: Commit all sivra changes**

```bash
git add \
  apps/sivra/app/api/pricing/pisos-zona/route.ts \
  apps/sivra/app/api/pricing/aplicar-propuesta/route.ts \
  apps/sivra/app/api/pricing/restore/route.ts \
  apps/sivra/app/api/rates/route.ts \
  apps/sivra/app/api/rates/snapshot/route.ts \
  apps/sivra/app/api/updates/sync/route.ts \
  apps/sivra/app/api/pricing/apply/route.ts \
  apps/sivra/app/api/limpiadoras/alerta-ventana/route.ts \
  apps/sivra/app/api/limpiadoras/auto-sessions/route.ts \
  "apps/sivra/app/api/mensajes/[bookingId]/email/route.ts" \
  "apps/sivra/app/api/mensajes/[bookingId]/route.ts" \
  apps/sivra/app/api/mensajes/auto-reply/route.ts \
  apps/sivra/app/api/mensajes/reply/route.ts \
  apps/sivra/app/api/mensajes/route.ts
git commit -m "feat(sivra): migrate all sivra legacy API routes to HMAC auth"
```

---

### Task 14: Final verification

- [ ] **Step 14.1: Full TypeScript check on both apps**

```bash
cd /home/user/central
npx tsc --noEmit -p apps/plataforma/tsconfig.json 2>&1 | grep -v "node_modules" | head -60
npx tsc --noEmit -p apps/sivra/tsconfig.json 2>&1 | grep -v "node_modules" | head -60
```

Expected: zero new errors.

- [ ] **Step 14.2: Confirm no `Api-Key` header remains**

```bash
grep -rn "'Api-Key'\|\"Api-Key\"" \
  apps/plataforma/lib/smoobu.ts \
  apps/plataforma/lib/sivra/agente-huesped/ \
  apps/plataforma/app/api/sivra/ \
  apps/sivra/lib/smoobu.ts \
  apps/sivra/app/api/ \
  2>/dev/null
```

Expected: **zero output**.

- [ ] **Step 14.3: Confirm `buildSmoobuHeaders` is used for all Smoobu calls**

```bash
grep -rn "login.smoobu.com" \
  apps/plataforma/lib/ \
  apps/plataforma/app/api/sivra/ \
  apps/sivra/lib/ \
  apps/sivra/app/api/ \
  2>/dev/null
```

Every match must have `...hdrs` in the nearby headers object.

- [ ] **Step 14.4: Fix and commit if any gaps found**

```bash
git add -p
git commit -m "fix(sivra): fix missed Api-Key headers in HMAC migration"
```
