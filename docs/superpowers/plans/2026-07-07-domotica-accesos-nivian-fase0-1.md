# Domótica accesos NIVIAN — Fase 0 + 1 (sonda + panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/sivra/domotica` trate las cerraduras NIVIAN como ciudadanos de primera: una **sonda read-only** que lista sus PIN/tarjetas/accesos + spec/DPs (responde a "¿ves mis PIN?" y confirma qué expone el aparato por cloud), y un **panel** con estado online + batería + botón «Abrir» momentáneo.

**Architecture:** Sobre la domótica Tuya ya existente (`lib/domotica/tuya.ts`, tablas `domotica_dispositivos`/`domotica_log`). Se añade columna `categoria`, un helper puro `tipoDispositivo`, un cliente `lib/domotica/acceso.ts` (funciones aisladas con `try/catch` propio, códigos DP candidato como el ventilador), dos rutas API con sesión, y ramas nuevas en la UII por tipo de aparato. El entorno de dev NO alcanza la Tuya API (red bloqueada) → lo puro se testea con `node --test`; lo demás se valida **desplegando** (patrón PR #780).

**Tech Stack:** Next.js 15 (plataforma), `crypto` de Node (firma HMAC v2 ya en `tuya.ts`), Prisma `$queryRaw` (SQL crudo), tests `node --test` (Node 22 strip-types).

**Spec:** `docs/superpowers/specs/2026-07-07-domotica-accesos-nivian-design.md`

## File Structure

- Create: `apps/plataforma/prisma/sql/2026-07-07_domotica_categoria.sql` — columna `categoria`.
- Create: `apps/plataforma/lib/domotica/tipo.ts` — `tipoDispositivo()` + `CONFIG_ACCESO_DEFAULT` (puro).
- Create: `apps/plataforma/lib/domotica/tipo.test.ts`
- Create: `apps/plataforma/lib/domotica/acceso.ts` — cliente access-control (sonda + abrir), códigos DP candidato.
- Create: `apps/plataforma/lib/domotica/acceso.test.ts` — parte pura (selección de DP, normalización).
- Modify: `apps/plataforma/app/api/sivra/domotica/descubrir/route.ts` — guardar `categoria` al alta/actualización.
- Modify: `apps/plataforma/app/api/sivra/domotica/dispositivos/route.ts` — devolver `categoria` + `tipo`.
- Create: `apps/plataforma/app/api/sivra/domotica/acceso/[id]/route.ts` — GET sonda.
- Create: `apps/plataforma/app/api/sivra/domotica/acceso/[id]/abrir/route.ts` — POST apertura momentánea.
- Modify: `apps/plataforma/app/(usuario)/sivra/domotica/DomoticaClient.tsx` — tarjeta por tipo (acceso vs ventilador).
- Modify: `docs/DOMOTICA-TUYA.md` — sección accesos.
- Modify: `docs/CONTEXTO-SESIONES.md` — memoria al cerrar.

**Riesgo conocido (lo resuelve la sonda):** los DP exactos del NIVIAN (código de apertura, de listar PIN, de accesos, de batería) no se conocen. El cliente usa **listas de candidatos** y `try/catch` por llamada; la sonda **reporta qué funcionó**. Si la apertura resulta requerir el flujo ticket+AES (no un DP simple), será un follow-up pequeño informado por la sonda.

---

### Task 1: Migración — columna `categoria`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-07_domotica_categoria.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 2026-07-07_domotica_categoria.sql — guardar la categoría Tuya del dispositivo
-- (la devuelve tuyaListDevices; hoy se descarta). Permite pintar la tarjeta correcta
-- (ventilador vs control de acceso) sin volver a llamar a Tuya.
ALTER TABLE domotica_dispositivos ADD COLUMN IF NOT EXISTS categoria text;
```

- [ ] **Step 2: Aplicar en Supabase**

Aplica con el MCP de Supabase (`mcp__Supabase__apply_migration`, proyecto `wswbehlcuxqxyinousql`, nombre `domotica_categoria`) con el SQL del Step 1. Verifica con `mcp__Supabase__execute_sql` que la columna existe:
`SELECT column_name FROM information_schema.columns WHERE table_name='domotica_dispositivos' AND column_name='categoria';` → 1 fila.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-07_domotica_categoria.sql
git commit -m "feat(plataforma): columna domotica_dispositivos.categoria"
```

---

### Task 2: Helper puro `tipo.ts`

**Files:**
- Create: `apps/plataforma/lib/domotica/tipo.ts`
- Test: `apps/plataforma/lib/domotica/tipo.test.ts`

- [ ] **Step 1: Escribir los tests (fallan: el módulo no existe)**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { tipoDispositivo, CONFIG_ACCESO_DEFAULT } from './tipo.ts'

test('tipoDispositivo: categorías de control de acceso → acceso', () => {
  assert.equal(tipoDispositivo('mk'), 'acceso')          // access control (門口機)
  assert.equal(tipoDispositivo('ms'), 'acceso')          // smart lock
  assert.equal(tipoDispositivo('jtmspro'), 'acceso')     // residential lock pro
})

test('tipoDispositivo: categorías de ventilador → ventilador', () => {
  assert.equal(tipoDispositivo('fs'), 'ventilador')      // fan
  assert.equal(tipoDispositivo('fsd'), 'ventilador')     // fan+light
  assert.equal(tipoDispositivo('fskg'), 'ventilador')    // fan wall switch
})

test('tipoDispositivo: desconocida/vacía → otro', () => {
  assert.equal(tipoDispositivo('xyz'), 'otro')
  assert.equal(tipoDispositivo(''), 'otro')
  assert.equal(tipoDispositivo(null), 'otro')
})

test('CONFIG_ACCESO_DEFAULT tiene los valores por defecto documentados', () => {
  assert.equal(CONFIG_ACCESO_DEFAULT.autoPin, true)
  assert.equal(CONFIG_ACCESO_DEFAULT.entrega, 'ambos')
  assert.equal(CONFIG_ACCESO_DEFAULT.pinLongitud, 6)
  assert.equal(CONFIG_ACCESO_DEFAULT.botonAbrir, true)
  assert.deepEqual(CONFIG_ACCESO_DEFAULT.smoobuApartmentIds, [])
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd apps/plataforma && node --test lib/domotica/tipo.test.ts`
Expected: FAIL (Cannot find module './tipo.ts').

- [ ] **Step 3: Implementar**

```ts
// lib/domotica/tipo.ts — clasificación pura del tipo de aparato Tuya y config de acceso por defecto.
export type TipoDispositivo = 'ventilador' | 'acceso' | 'otro'

// Categorías Tuya conocidas. Control de acceso / cerraduras vs ventiladores.
// (La sonda de Fase 0 confirma la categoría real del NIVIAN; si sale una nueva, se añade aquí.)
const CATS_ACCESO = new Set(['mk', 'ms', 'jtmspro', 'bxx', 'menfry', 'videolock', 'jtmsbh'])
const CATS_VENTILADOR = new Set(['fs', 'fsd', 'fskg', 'fskg'])

export function tipoDispositivo(categoria: string | null | undefined): TipoDispositivo {
  const c = (categoria || '').toLowerCase()
  if (CATS_ACCESO.has(c)) return 'acceso'
  if (CATS_VENTILADOR.has(c)) return 'ventilador'
  return 'otro'
}

export type ConfigAcceso = {
  smoobuApartmentIds: number[]
  autoPin: boolean
  entrega: 'huesped' | 'aviso' | 'ambos' | 'manual'
  pinLongitud: number
  usarHorarioPiso: boolean
  margenEntradaMin: number
  margenSalidaMin: number
  autoBorrarTrasCheckout: boolean
  botonAbrir: boolean
}

export const CONFIG_ACCESO_DEFAULT: ConfigAcceso = {
  smoobuApartmentIds: [],
  autoPin: true,
  entrega: 'ambos',
  pinLongitud: 6,
  usarHorarioPiso: true,
  margenEntradaMin: 0,
  margenSalidaMin: 0,
  autoBorrarTrasCheckout: true,
  botonAbrir: true,
}
```

- [ ] **Step 4: Verificar que pasan** — mismo comando, PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/domotica/tipo.ts apps/plataforma/lib/domotica/tipo.test.ts
git commit -m "feat(plataforma): tipoDispositivo() + CONFIG_ACCESO_DEFAULT (puro, testeado)"
```

---

### Task 3: Cliente `acceso.ts` (sonda + abrir)

**Files:**
- Create: `apps/plataforma/lib/domotica/acceso.ts`
- Test: `apps/plataforma/lib/domotica/acceso.test.ts`

Nota: `acceso.ts` reutiliza `tuyaGetSpec`, `tuyaGetStatus`, `tuyaSendCommands`, `elegirCodigo` de `./tuya.ts`. Se exporta un `tuyaRequest` genérico desde `tuya.ts` para las llamadas door-lock (ver Step 0).

- [ ] **Step 0: Exponer `tuyaRequest` en `tuya.ts`**

En `apps/plataforma/lib/domotica/tuya.ts`, la función interna `request` es privada. Renómbrala/expórtala como `tuyaRequest` (mismo cuerpo) y actualiza sus usos internos. Añade al final del archivo:

```ts
// Acceso genérico a la OpenAPI para módulos hermanos (p.ej. lib/domotica/acceso.ts).
export { tuyaRequest }
```

(Si `request` ya se llama en el archivo, sustituye esas llamadas por `tuyaRequest`. No cambia comportamiento.)

- [ ] **Step 1: Tests de la parte pura (fallan)**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { elegirCodigoAbrir, normalizarAcceso, DP_ABRIR } from './acceso.ts'

test('elegirCodigoAbrir prefiere el primer candidato presente', () => {
  assert.equal(elegirCodigoAbrir(['unlock_request', 'switch']), 'unlock_request')
  assert.equal(elegirCodigoAbrir(['open_door']), 'open_door')
  assert.equal(elegirCodigoAbrir(['switch_led']), null)
})

test('DP_ABRIR incluye los candidatos habituales de control de acceso', () => {
  for (const c of ['unlock_request', 'open_door', 'manual_lock', 'remote_no_dp_key']) {
    assert.ok(DP_ABRIR.includes(c), `${c} debería estar en DP_ABRIR`)
  }
})

test('normalizarAcceso resume un resultado ok y uno con error', () => {
  assert.deepEqual(normalizarAcceso('pins', { ok: true, result: [1, 2] }),
    { clave: 'pins', ok: true, datos: [1, 2], error: null })
  assert.deepEqual(normalizarAcceso('pins', { ok: false, msg: 'permission deny' }),
    { clave: 'pins', ok: false, datos: null, error: 'permission deny' })
})
```

- [ ] **Step 2: Verificar que fallan** — `cd apps/plataforma && node --test lib/domotica/acceso.test.ts` → FAIL.

- [ ] **Step 3: Implementar `acceso.ts`**

```ts
// lib/domotica/acceso.ts — cliente de control de acceso (cerraduras/teclados NIVIAN) sobre la Tuya OpenAPI.
// Cada función va aislada con su try/catch: si el aparato no expone algo por cloud, devuelve
// { ok:false, error } en vez de romper. Los DP exactos se descubren con la sonda (Fase 0).
import { tuyaRequest, tuyaGetSpec, tuyaGetStatus, tuyaSendCommands, elegirCodigo } from './tuya'

// Códigos DP candidato para "abrir" un control de acceso (orden de preferencia).
export const DP_ABRIR = ['unlock_request', 'open_door', 'manual_lock', 'remote_no_dp_key'] as const
// Códigos DP candidato para batería / nivel.
export const DP_BATERIA = ['residual_electricity', 'battery_percentage', 'battery_state', 'battery'] as const

export function elegirCodigoAbrir(codes: string[]): string | null {
  return elegirCodigo(codes, DP_ABRIR)
}

export type BloqueSonda = { clave: string; ok: boolean; datos: unknown; error: string | null }

export function normalizarAcceso(clave: string, r: { ok: boolean; result?: unknown; msg?: string }): BloqueSonda {
  return r.ok
    ? { clave, ok: true, datos: r.result ?? null, error: null }
    : { clave, ok: false, datos: null, error: r.msg || 'no soportado' }
}

// Envuelve una llamada door-lock: devuelve {ok, result|msg} sin lanzar.
async function intentar(method: string, path: string, token?: undefined): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
  try {
    const result = await tuyaRequest(method, path, undefined, await tokenActual())
    return { ok: true, result }
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
}

// token: reusa el flujo de tuya.ts a través de una llamada barata (getStatus) NO —
// en su lugar exportamos un helper de token desde tuya.ts. Ver Step 3b.
import { tuyaGetToken as tokenActual } from './tuya'

// Sonda read-only: reúne spec + status (garantizados) + intentos door-lock (best effort).
export async function sondearAcceso(deviceId: string): Promise<{
  spec: BloqueSonda; status: BloqueSonda; pins: BloqueSonda; tarjetas: BloqueSonda;
  accesos: BloqueSonda; codigoAbrir: string | null;
}> {
  let specR: BloqueSonda, statusR: BloqueSonda
  try { specR = normalizarAcceso('spec', { ok: true, result: await tuyaGetSpec(deviceId) }) }
  catch (e) { specR = normalizarAcceso('spec', { ok: false, msg: e instanceof Error ? e.message : String(e) }) }
  let codes: string[] = []
  try {
    const st = await tuyaGetStatus(deviceId)
    codes = st.map(s => s.code)
    statusR = normalizarAcceso('status', { ok: true, result: st })
  } catch (e) { statusR = normalizarAcceso('status', { ok: false, msg: e instanceof Error ? e.message : String(e) }) }

  // Endpoints door-lock candidatos (los documentados para smart lock / access control).
  const pins = normalizarAcceso('pins', await intentar('GET', `/v1.0/devices/${deviceId}/door-lock/temp-passwords`))
  const tarjetas = normalizarAcceso('tarjetas', await intentar('GET', `/v1.0/devices/${deviceId}/door-lock/cards`))
  const accesos = normalizarAcceso('accesos', await intentar('GET', `/v1.0/devices/${deviceId}/door-lock/open-logs?page_no=1&page_size=20`))

  return { spec: specR, status: statusR, pins, tarjetas, accesos, codigoAbrir: elegirCodigoAbrir(codes) }
}

// Apertura momentánea: manda el DP de abrir (pulso). El relé del NIVIAN cierra solo.
// Devuelve { ok } o { ok:false, error } — nunca deja "mantener abierta".
export async function abrirMomentaneo(deviceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const st = await tuyaGetStatus(deviceId)
    const code = elegirCodigoAbrir(st.map(s => s.code))
    if (!code) return { ok: false, error: 'El aparato no expone un DP de apertura (revisar la sonda)' }
    await tuyaSendCommands(deviceId, [{ code, value: true }])
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
```

- [ ] **Step 3b: Exponer `tuyaGetToken` en `tuya.ts`**

En `tuya.ts` la función `getToken()` es privada. Expórtala como `tuyaGetToken` (alias):

```ts
export { getToken as tuyaGetToken }
```

Ajusta `acceso.ts` para importar `tuyaGetToken` (ya referido como `tokenActual`). Simplifica `intentar` para tomar el token una vez:

```ts
async function intentar(method: string, path: string): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
  try {
    const token = await tuyaGetToken()
    return { ok: true, result: await tuyaRequest(method, path, undefined, token) }
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
}
```

(Elimina el import/uso previo de `tokenActual` dentro de `intentar`; deja un único import `tuyaGetToken`.)

- [ ] **Step 4: Verificar que pasan los tests puros** — `cd apps/plataforma && node --test lib/domotica/acceso.test.ts` → PASS (3 tests). (Las funciones que llaman a Tuya no se testean en local; red bloqueada.)

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/domotica/tuya.ts apps/plataforma/lib/domotica/acceso.ts apps/plataforma/lib/domotica/acceso.test.ts
git commit -m "feat(plataforma): cliente domotica/acceso — sonda read-only + abrir momentáneo (DP candidato)"
```

---

### Task 4: Guardar `categoria` al descubrir + devolverla

**Files:**
- Modify: `apps/plataforma/app/api/sivra/domotica/descubrir/route.ts`
- Modify: `apps/plataforma/app/api/sivra/domotica/dispositivos/route.ts`

- [ ] **Step 1: `descubrir` guarda la categoría**

En `descubrir/route.ts`, sustituye el `INSERT ... ON CONFLICT DO NOTHING` por uno que además fije `categoria` al alta y la **actualice** en los ya existentes (backfill de los 3 que ya hay):

```ts
    for (const d of devices) {
      await prisma.$executeRaw`
        INSERT INTO domotica_dispositivos (nombre, tuya_device_id, categoria)
        VALUES (${d.name || d.id}, ${d.id}, ${d.category || null})
        ON CONFLICT (tuya_device_id)
        DO UPDATE SET categoria = COALESCE(EXCLUDED.categoria, domotica_dispositivos.categoria)`
    }
```

(`d.category` ya lo devuelve `tuyaListDevices` — es el campo `category` de `TuyaDevice`.)

- [ ] **Step 2: `dispositivos` devuelve `categoria` + `tipo`**

En `dispositivos/route.ts`: añade `categoria` al SELECT y deriva `tipo` con `tipoDispositivo`. Import arriba:

```ts
import { tipoDispositivo } from '@/lib/domotica/tipo'
```

Cambia el SELECT para incluir `categoria`:

```ts
  const dispositivos = await prisma.$queryRaw<DispositivoRow[]>`
    SELECT id::text, nombre, tuya_device_id, piso, smoobu_apartment_id, config, activo, categoria
    FROM domotica_dispositivos ORDER BY created_at`
```

Añade `categoria: string | null` al tipo `DispositivoRow`. En el `map` que arma `conEstado`, añade `tipo: tipoDispositivo(d.categoria)` al objeto devuelto.

- [ ] **Step 3: Typecheck local (parcial) y commit**

Run: `cd apps/plataforma && node --test lib/domotica/*.test.ts` → siguen PASS (no rompe lo puro).
(El `tsc` completo no corre en local sin node_modules; se valida en el deploy — Task 7.)

```bash
git add apps/plataforma/app/api/sivra/domotica/descubrir/route.ts apps/plataforma/app/api/sivra/domotica/dispositivos/route.ts
git commit -m "feat(plataforma): domotica — guardar/derivar categoria y tipo de dispositivo"
```

---

### Task 5: Rutas API de acceso (sonda + abrir)

**Files:**
- Create: `apps/plataforma/app/api/sivra/domotica/acceso/[id]/route.ts`
- Create: `apps/plataforma/app/api/sivra/domotica/acceso/[id]/abrir/route.ts`

Patrón de auth: `getSession()` → 401 si null (igual que `dispositivos/route.ts`).

- [ ] **Step 1: `acceso/[id]/route.ts` (GET sonda)**

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { sondearAcceso } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${id}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  try {
    const sonda = await sondearAcceso(deviceId)
    return NextResponse.json({ sonda })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
```

- [ ] **Step 2: `acceso/[id]/abrir/route.ts` (POST apertura momentánea)**

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { abrirMomentaneo } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${id}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  const r = await abrirMomentaneo(deviceId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  await prisma.$executeRaw`
    INSERT INTO domotica_log (dispositivo_id, accion, detalle)
    VALUES (${id}::uuid, ${'abrir'}, ${JSON.stringify({ hora: new Date().toISOString() })}::jsonb)`
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/sivra/domotica/acceso
git commit -m "feat(plataforma): API domotica/acceso — sonda GET + abrir momentáneo POST"
```

---

### Task 6: UI — tarjeta por tipo (acceso vs ventilador)

**Files:**
- Modify: `apps/plataforma/app/(usuario)/sivra/domotica/DomoticaClient.tsx`

- [ ] **Step 1: Ampliar el tipo `Disp` y ramificar por `tipo`**

En `DomoticaClient.tsx`, añade `categoria: string | null` y `tipo: 'ventilador' | 'acceso' | 'otro'` al tipo `Disp`. En el `.map(d => …)`, antes del `return`, ramifica: si `d.tipo === 'acceso'`, renderiza `<TarjetaAcceso d={d} … />`; si no, la tarjeta de ventilador actual.

- [ ] **Step 2: Componente `TarjetaAcceso` (mismo archivo, debajo del export principal)**

```tsx
function TarjetaAcceso({ d, ocupado, setOcupado, setError, cargar }: {
  d: Disp; ocupado: boolean; setOcupado: (b: boolean) => void;
  setError: (s: string | null) => void; cargar: () => Promise<void>;
}) {
  const [sonda, setSonda] = useState<any>(null)
  const [cargandoSonda, setCargandoSonda] = useState(false)

  async function sondear() {
    setCargandoSonda(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}`).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error en la sonda')
    else setSonda(r.sonda)
    setCargandoSonda(false)
  }

  async function abrir() {
    if (!confirm('¿Abrir la puerta ahora? (pulso momentáneo, se cierra sola)')) return
    setOcupado(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}/abrir`, { method: 'POST' })
      .then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error al abrir')
    await cargar(); setOcupado(false)
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${ocupado ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-medium">🔐 {d.nombre}</h2>
          <p className="text-xs opacity-60">
            {d.errorEstado ? `⚠️ ${d.errorEstado}` : d.estado ? '🟢 Accesible' : '⚪ Sin estado (¿offline?)'}
            {d.categoria ? ` · ${d.categoria}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={sondear} disabled={cargandoSonda} className="min-h-[44px] px-3 rounded-lg border">
            {cargandoSonda ? '…' : '🔍 Sonda'}
          </button>
          <button onClick={abrir} disabled={ocupado} className="min-h-[44px] px-4 rounded-lg border font-medium">
            🚪 Abrir
          </button>
        </div>
      </div>

      <p className="text-xs opacity-60">
        «Abrir» da un pulso momentáneo (se cierra sola). «Sonda» es solo lectura: lista lo que el
        aparato expone (PIN, tarjetas, accesos) sin abrir nada.
      </p>

      {sonda && (
        <div className="rounded-lg border p-3 space-y-2 text-xs">
          <BloqueSonda titulo="🔑 PIN" b={sonda.pins} />
          <BloqueSonda titulo="🪪 Tarjetas" b={sonda.tarjetas} />
          <BloqueSonda titulo="📋 Accesos" b={sonda.accesos} />
          <BloqueSonda titulo="⚙️ Funciones (spec)" b={sonda.spec} />
          <BloqueSonda titulo="📟 Estado (DPs)" b={sonda.status} />
          <p className="opacity-60">DP de apertura detectado: <code>{sonda.codigoAbrir || '—'}</code></p>
        </div>
      )}
    </div>
  )
}

function BloqueSonda({ titulo, b }: { titulo: string; b: { ok: boolean; datos: unknown; error: string | null } }) {
  return (
    <details>
      <summary className="cursor-pointer min-h-[44px] flex items-center">
        {titulo} — {b.ok ? '✅' : `❌ ${b.error}`}
      </summary>
      {b.ok && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all opacity-80">
          {JSON.stringify(b.datos, null, 2)}
        </pre>
      )}
    </details>
  )
}
```

Notas obligatorias: botones ≥44 px (`min-h-[44px]`); `<pre>` con `overflow-x-auto` (no rompe el layout móvil); la sonda no se auto-lanza (solo al pulsar «Sonda», para no llamar a Tuya en cada carga); recargas manteniendo la lista atenuada (`opacity-60`).

- [ ] **Step 3: Pasar props desde el `.map`**

En el `map` principal, para `d.tipo === 'acceso'` renderiza:
`<TarjetaAcceso key={d.id} d={d} ocupado={ocupado} setOcupado={setOcupado} setError={setError} cargar={cargar} />`
(usa los `useState`/`cargar` ya existentes en el componente).

- [ ] **Step 4: Commit**

```bash
git add "apps/plataforma/app/(usuario)/sivra/domotica/DomoticaClient.tsx"
git commit -m "feat(plataforma): UI domotica — tarjeta de control de acceso (sonda + abrir)"
```

---

### Task 7: Verificación (deploy), docs, memoria, PR

- [ ] **Step 1: Suite pura local**

Run: `cd apps/plataforma && node --test lib/domotica/*.test.ts` → todos PASS.
Run (raíz): `pnpm test:guardia` → verde (sin secretos nuevos).

- [ ] **Step 2: Push y validar en Vercel (el `tsc`/build reales)**

```bash
git push -u origin claude/tuya-device-setup-1dpz09
```

Espera el check **«Typecheck · plataforma»** y el build de Vercel `plataforma` en verde (aquí se valida el TS, que en local no corre). Si algo falla, arréglalo y re-empuja.

- [ ] **Step 3: Prueba real (con la sesión de Alberto)**

En `/sivra/domotica`, sobre «Socorro» (online): pulsar «🔍 Sonda» → anotar qué bloques salen ✅ (PIN/tarjetas/accesos/spec/status) y el **DP de apertura detectado**. Esto es lo que confirma qué se puede en la Fase 2. NO pulsar «Abrir» salvo que Alberto quiera probarlo físicamente.

- [ ] **Step 4: Docs + memoria**

Actualiza `docs/DOMOTICA-TUYA.md` (sección «Control de accesos NIVIAN»: qué hace la sonda, el botón Abrir, y que la Fase 2 —PIN por reserva— depende de lo que la sonda revele). Añade entrada ARRIBA en `docs/CONTEXTO-SESIONES.md` (qué se construyó, el resultado de la sonda si ya se probó, y qué queda para Fase 2).

- [ ] **Step 5: Actualizar el PR #785**

Con `mcp__github__update_pull_request`, refresca el cuerpo del PR #785 (checklist: Fase 0+1 implementada; Fase 2 pendiente de la sonda).

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** columna `categoria` (T1), `tipoDispositivo`/`CONFIG_ACCESO_DEFAULT` (T2), cliente acceso sonda+abrir (T3), alta/derivación de tipo (T4), rutas sonda+abrir con sesión (T5), UI por tipo con sonda read-only y botón momentáneo (T6), verificación por deploy + docs + memoria (T7). La Fase 2 (PIN por reserva, alertas, códigos limpiadora, 1-cerradura↔N-pisos) queda **fuera** de este plan por diseño (gateada por la sonda) — coherente con el spec.
- **Placeholders:** ninguno; todo el código está inline. Los DP/endpoints door-lock son **candidatos declarados** con degradación segura, no huecos — la sonda reporta cuáles funcionan.
- **Consistencia de tipos:** `tipoDispositivo` (T2) se importa igual en T4 y se usa en la UI (T6); `sondearAcceso`/`abrirMomentaneo` (T3) se consumen en T5; `elegirCodigoAbrir`/`DP_ABRIR`/`normalizarAcceso` (T3) casan entre test e implementación; `tuyaRequest`/`tuyaGetToken` exportados en T3.0/T3b se usan en `acceso.ts`.
- **Riesgo explícito:** si «Socorro» solo abre por el flujo ticket+AES (no por DP simple), el botón «Abrir» dará el error claro «no expone un DP de apertura» y será un follow-up pequeño; la sonda lo habrá anticipado.
```
