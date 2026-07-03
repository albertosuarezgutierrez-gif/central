# Domótica Tuya — ventilador de Socorro: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plataforma controla el ventilador de techo CREATE (Tuya) de House Sevillana por la Tuya Cloud OpenAPI: control manual desde `/sivra/domotica` + automatización (encender solo el ventilador a las 15:00 del día de llegada si en Sevilla hace >30 °C; mandar apagar a las 11:30 del día de check-out).

**Architecture:** Lib pura `apps/plataforma/lib/domotica/` (cliente Tuya con firma HMAC v2, meteo Open-Meteo, lógica de ventanas pura y testeable) + 2 tablas SQL crudo (`domotica_dispositivos`, `domotica_log` con índice único de idempotencia) + rutas API bajo `/api/sivra/domotica/*` (sesión de usuario; el cron con `CRON_SECRET`) + página `/sivra/domotica` mobile-first + cron Vercel cada 30 min en franja.

**Tech Stack:** Next.js 15 (plataforma), `crypto` de Node (sin SDK npm), Prisma `$queryRaw` (SQL crudo, patrón sivra), `smoobuFetch`, `tgAlert`, tests `node:test` (Node 22 strip-types).

**Spec:** `docs/superpowers/specs/2026-07-03-domotica-tuya-ventilador-design.md`

## File Structure

- Create: `apps/plataforma/prisma/sql/2026-07-03_domotica.sql` — tablas + índices.
- Create: `apps/plataforma/lib/domotica/tuya.ts` — cliente OpenAPI Tuya (firma, token, devices, status, spec, commands, mapeo DP).
- Create: `apps/plataforma/lib/domotica/tuya.test.ts`
- Create: `apps/plataforma/lib/domotica/meteo.ts` — temperatura actual en Sevilla (Open-Meteo).
- Create: `apps/plataforma/lib/domotica/meteo.test.ts`
- Create: `apps/plataforma/lib/domotica/programador.ts` — lógica PURA de ventanas/decisión (sin IO).
- Create: `apps/plataforma/lib/domotica/programador.test.ts`
- Create: `apps/plataforma/app/api/sivra/domotica/dispositivos/route.ts` — GET lista+estado.
- Create: `apps/plataforma/app/api/sivra/domotica/dispositivos/[id]/route.ts` — PATCH config/activo.
- Create: `apps/plataforma/app/api/sivra/domotica/descubrir/route.ts` — POST alta desde Tuya + apartamentos Smoobu.
- Create: `apps/plataforma/app/api/sivra/domotica/comando/route.ts` — POST comando manual.
- Create: `apps/plataforma/app/api/sivra/domotica/programador/route.ts` — GET cron.
- Create: `apps/plataforma/app/(usuario)/sivra/domotica/page.tsx` — server page.
- Create: `apps/plataforma/app/(usuario)/sivra/domotica/DomoticaClient.tsx` — UI client.
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx` — entrada de menú.
- Modify: `apps/plataforma/vercel.json` — cron `25,55 8-15 * * *`.
- Create: `docs/DOMOTICA-TUYA.md` — guía de setup para Alberto.
- Modify: `docs/CONTEXTO-SESIONES.md` — memoria al cerrar.

**Envs nuevas (Vercel plataforma, las pone Alberto):** `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`, `TUYA_ENDPOINT` (opcional, default EU). API keys de servicio externo → pueden caer a `|| ''` (regla del guardián de secretos).

---

### Task 1: Migración SQL (tablas + idempotencia)

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-03_domotica.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 2026-07-03_domotica.sql — domótica Tuya (ventilador Socorro). Ver spec 2026-07-03.
-- BD COMPARTIDA multi-tenant: tablas nuevas, sin tocar RLS/grants existentes.
-- RLS habilitado sin policies = anon/authenticated NO leen; plataforma entra por
-- Prisma como owner (bypassa RLS), mismo patrón que el resto de tablas de sivra.

CREATE TABLE IF NOT EXISTS domotica_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tuya_device_id text NOT NULL UNIQUE,
  piso text,                         -- prop_* (alineado con horarios.ts/constantes.ts)
  smoobu_apartment_id integer,       -- id numérico del apartamento en Smoobu (para reservas)
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- ConfigAuto parcial (ver lib/domotica/programador.ts)
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE domotica_dispositivos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS domotica_log (
  id bigserial PRIMARY KEY,
  dispositivo_id uuid REFERENCES domotica_dispositivos(id) ON DELETE CASCADE,
  accion text NOT NULL,              -- on|off|skip_temp|skip_meteo_error|error|manual_on|manual_off|manual_velocidad|manual_luz
  reserva_ref text,                  -- id de reserva Smoobu (clave de idempotencia con accion)
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE domotica_log ENABLE ROW LEVEL SECURITY;

-- Idempotencia del programador: una acción automática por reserva y dispositivo.
CREATE UNIQUE INDEX IF NOT EXISTS domotica_log_idem
  ON domotica_log (dispositivo_id, accion, reserva_ref)
  WHERE reserva_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS domotica_log_disp_fecha
  ON domotica_log (dispositivo_id, created_at DESC);
```

- [ ] **Step 2: Comprobar el patrón RLS contra una migración previa**

Run: `grep -l "ENABLE ROW LEVEL SECURITY" apps/plataforma/prisma/sql/*.sql | head -3` y abre una (p.ej. `2026-06-22_agente_huespedes.sql`). Si las tablas previas de sivra NO habilitan RLS (dependen de grants), replica EXACTAMENTE lo que hagan ellas en vez de inventar: la frontera con ialimp manda.

- [ ] **Step 3: Aplicar en Supabase**

Aplica con el MCP de Supabase (`mcp__Supabase__apply_migration`, proyecto `wswbehlcuxqxyinousql`, nombre `domotica_tuya_ventilador`) con el SQL del Step 1 (ajustado si el Step 2 lo cambió). Verifica con `mcp__Supabase__list_tables` que existen `domotica_dispositivos` y `domotica_log`.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-03_domotica.sql
git commit -m "feat(plataforma): tablas domotica_dispositivos + domotica_log (idempotencia por reserva)"
```

---

### Task 2: Cliente Tuya (`lib/domotica/tuya.ts`)

**Files:**
- Create: `apps/plataforma/lib/domotica/tuya.ts`
- Test: `apps/plataforma/lib/domotica/tuya.test.ts`

- [ ] **Step 1: Escribir los tests (fallan: el módulo no existe)**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { firmaTuya, sha256Hex, elegirCodigo, DP_VENTILADOR, DP_VELOCIDAD, DP_LUZ } from './tuya.ts'

// Vector conocido: sha256('') es constante pública.
test('sha256Hex del cuerpo vacío', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('firmaTuya es determinista, hex mayúsculas, y cambia con el token', () => {
  const base = {
    clientId: 'cid123', secret: 'secreto', t: '1700000000000', nonce: 'n1',
    method: 'get', path: '/v1.0/token?grant_type=1',
  }
  const s1 = firmaTuya(base)
  const s2 = firmaTuya(base)
  assert.equal(s1, s2)
  assert.match(s1, /^[0-9A-F]{64}$/)
  const s3 = firmaTuya({ ...base, accessToken: 'tok' })
  assert.notEqual(s1, s3)
})

test('firmaTuya incluye el body en stringToSign', () => {
  const base = {
    clientId: 'cid', secret: 's', t: '1', nonce: 'n',
    method: 'POST', path: '/v1.0/devices/x/commands',
  }
  assert.notEqual(firmaTuya({ ...base, body: '{"a":1}' }), firmaTuya({ ...base, body: '{"a":2}' }))
})

test('elegirCodigo respeta el orden de candidatos y devuelve null si no hay', () => {
  assert.equal(elegirCodigo(['switch', 'fan_speed'], DP_VENTILADOR), 'switch')
  assert.equal(elegirCodigo(['switch_fan', 'switch'], DP_VENTILADOR), 'switch_fan')
  assert.equal(elegirCodigo(['fan_speed_percent'], DP_VELOCIDAD), 'fan_speed_percent')
  assert.equal(elegirCodigo(['switch_led'], DP_LUZ), 'switch_led')
  assert.equal(elegirCodigo(['bright_value'], DP_VENTILADOR), null)
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd apps/plataforma && node --test lib/domotica/tuya.test.ts`
Expected: FAIL (Cannot find module './tuya.ts').

- [ ] **Step 3: Implementar el cliente**

```ts
// lib/domotica/tuya.ts — cliente de la Tuya Cloud OpenAPI (firma HMAC v2, sin SDK npm).
//
// Envs: TUYA_CLIENT_ID / TUYA_CLIENT_SECRET (Access ID/Secret del Cloud Project de
// platform.tuya.com, data center Central Europe) y TUYA_ENDPOINT (default EU). Son API keys de
// servicio externo → fallback '' permitido (solo hace fallar la llamada saliente).
//
// Firma v2 (docs Tuya "Sign requests"): HMAC-SHA256 en hex MAYÚSCULAS de
//   client_id + [access_token] + t + nonce + stringToSign
// con stringToSign = METHOD \n sha256(body) \n headersFirmados('') \n pathConQuery.
import { createHash, createHmac, randomUUID } from 'crypto'

const ENDPOINT = () => (process.env.TUYA_ENDPOINT || 'https://openapi.tuyaeu.com').replace(/\/$/, '')
const CLIENT_ID = () => process.env.TUYA_CLIENT_ID || ''
const CLIENT_SECRET = () => process.env.TUYA_CLIENT_SECRET || ''

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

export function firmaTuya(opts: {
  clientId: string; secret: string; accessToken?: string; t: string; nonce: string;
  method: string; path: string; body?: string;
}): string {
  const stringToSign = [opts.method.toUpperCase(), sha256Hex(opts.body || ''), '', opts.path].join('\n')
  const str = opts.clientId + (opts.accessToken || '') + opts.t + opts.nonce + stringToSign
  return createHmac('sha256', opts.secret).update(str, 'utf8').digest('hex').toUpperCase()
}

// Códigos de error de suscripción/permiso del trial de IoT Core (observados en docs/foros).
export function esErrorSuscripcion(code?: number): boolean {
  return code === 28841002 || code === 28841101 || code === 28841105
}

type TuyaEnvelope<T> = { success?: boolean; result?: T; code?: number; msg?: string }

async function request<T>(method: string, path: string, body?: unknown, accessToken?: string): Promise<T> {
  if (!CLIENT_ID() || !CLIENT_SECRET()) throw new Error('TUYA_CLIENT_ID/TUYA_CLIENT_SECRET no configuradas')
  const t = String(Date.now())
  const nonce = randomUUID()
  const bodyStr = body === undefined ? '' : JSON.stringify(body)
  const sign = firmaTuya({
    clientId: CLIENT_ID(), secret: CLIENT_SECRET(), accessToken, t, nonce, method, path, body: bodyStr,
  })
  const headers: Record<string, string> = {
    client_id: CLIENT_ID(), sign, t, nonce, sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json',
  }
  if (accessToken) headers.access_token = accessToken
  const res = await fetch(ENDPOINT() + path, {
    method, headers, body: bodyStr || undefined, signal: AbortSignal.timeout(15_000), cache: 'no-store',
  })
  const data = (await res.json().catch(() => null)) as TuyaEnvelope<T> | null
  if (!data?.success) {
    const extra = esErrorSuscripcion(data?.code) ? ' — renueva el trial de IoT Core en platform.tuya.com' : ''
    throw new Error(`Tuya ${data?.code ?? `HTTP ${res.status}`}: ${data?.msg || 'sin detalle'}${extra}`)
  }
  return data.result as T
}

// Token de proyecto (dura ~2 h). Cache en memoria de módulo — en serverless vive lo que la lambda.
let tokenCache: { token: string; exp: number } | null = null
async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token
  const r = await request<{ access_token: string; expire_time: number }>('GET', '/v1.0/token?grant_type=1')
  tokenCache = { token: r.access_token, exp: Date.now() + r.expire_time * 1000 }
  return r.access_token
}

export type TuyaDP = { code: string; value: unknown }
export type TuyaDevice = { id: string; name: string; online: boolean; category: string }

// Dispositivos visibles para el proyecto (incluye los de la cuenta de app vinculada por QR).
export async function tuyaListDevices(): Promise<TuyaDevice[]> {
  const token = await getToken()
  const r = await request<{ list?: any[] } | any[]>('GET', '/v2.0/cloud/thing/device?page_size=100', undefined, token)
  const list: any[] = Array.isArray(r) ? r : (r as any)?.list || []
  return list.map(d => ({
    id: String(d.id), name: String(d.customName || d.name || ''),
    online: Boolean(d.isOnline ?? d.is_online), category: String(d.category || ''),
  }))
}

export async function tuyaGetStatus(deviceId: string): Promise<TuyaDP[]> {
  const token = await getToken()
  return request<TuyaDP[]>('GET', `/v1.0/devices/${deviceId}/status`, undefined, token)
}

export async function tuyaGetSpec(deviceId: string): Promise<{ functions: Array<{ code: string; type: string; values: string }> }> {
  const token = await getToken()
  return request('GET', `/v1.0/devices/${deviceId}/specifications`, undefined, token)
}

export async function tuyaSendCommands(deviceId: string, commands: TuyaDP[]): Promise<void> {
  const token = await getToken()
  await request('POST', `/v1.0/devices/${deviceId}/commands`, { commands }, token)
}

// ── Mapeo de DP sin hardcodear (los codes se leen del dispositivo real) ─────────
// Candidatos en orden de preferencia; sirven para cualquier cacharro Tuya futuro.
export const DP_VENTILADOR = ['switch_fan', 'fan_switch', 'switch'] as const
export const DP_VELOCIDAD = ['fan_speed', 'fan_speed_percent', 'fan_speed_enum'] as const
export const DP_LUZ = ['switch_led', 'switch_light', 'light'] as const

export function elegirCodigo(codes: string[], candidatos: readonly string[]): string | null {
  for (const c of candidatos) if (codes.includes(c)) return c
  return null
}

// Code del switch del ventilador según el estado actual del dispositivo.
export async function codigoVentilador(deviceId: string): Promise<{ code: string; status: TuyaDP[] } | null> {
  const status = await tuyaGetStatus(deviceId)
  const code = elegirCodigo(status.map(s => s.code), DP_VENTILADOR)
  return code ? { code, status } : null
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd apps/plataforma && node --test lib/domotica/tuya.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/domotica/tuya.ts apps/plataforma/lib/domotica/tuya.test.ts
git commit -m "feat(plataforma): cliente Tuya Cloud OpenAPI (firma HMAC v2, token cache, mapeo DP)"
```

---

### Task 3: Meteo (`lib/domotica/meteo.ts`)

**Files:**
- Create: `apps/plataforma/lib/domotica/meteo.ts`
- Test: `apps/plataforma/lib/domotica/meteo.test.ts`

- [ ] **Step 1: Test del parser puro (falla)**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { extraerTemperatura } from './meteo.ts'

test('extraerTemperatura lee current.temperature_2m', () => {
  assert.equal(extraerTemperatura({ current: { temperature_2m: 34.6 } }), 34.6)
  assert.equal(extraerTemperatura({ current: { temperature_2m: 0 } }), 0)
})

test('extraerTemperatura devuelve null con respuestas rotas', () => {
  assert.equal(extraerTemperatura(null), null)
  assert.equal(extraerTemperatura({}), null)
  assert.equal(extraerTemperatura({ current: { temperature_2m: 'NaN' } }), null)
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd apps/plataforma && node --test lib/domotica/meteo.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// lib/domotica/meteo.ts — temperatura ACTUAL en Sevilla vía Open-Meteo (gratis, sin API key).
// Fail-safe: si la meteo no responde, el programador NO enciende (null ≠ hace calor).
const URL_SEVILLA =
  'https://api.open-meteo.com/v1/forecast?latitude=37.39&longitude=-5.99&current=temperature_2m'

export function extraerTemperatura(json: unknown): number | null {
  const t = (json as { current?: { temperature_2m?: unknown } } | null)?.current?.temperature_2m
  return typeof t === 'number' && Number.isFinite(t) ? t : null
}

export async function temperaturaSevilla(): Promise<number | null> {
  try {
    const res = await fetch(URL_SEVILLA, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    return extraerTemperatura(await res.json())
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Verificar que pasa** — mismo comando, PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/domotica/meteo.ts apps/plataforma/lib/domotica/meteo.test.ts
git commit -m "feat(plataforma): temperatura actual de Sevilla vía Open-Meteo (fail-safe a null)"
```

---

### Task 4: Lógica pura del programador (`lib/domotica/programador.ts`)

**Files:**
- Create: `apps/plataforma/lib/domotica/programador.ts`
- Test: `apps/plataforma/lib/domotica/programador.test.ts`

- [ ] **Step 1: Tests (fallan)**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { enVentana, decidirAcciones, ahoraMadrid, CONFIG_DEFAULT } from './programador.ts'

test('enVentana: [inicio, inicio+min)', () => {
  assert.equal(enVentana('15:00', '15:00', 30), true)
  assert.equal(enVentana('15:29', '15:00', 30), true)
  assert.equal(enVentana('15:30', '15:00', 30), false)
  assert.equal(enVentana('14:59', '15:00', 30), false)
  assert.equal(enVentana('11:55', '11:30', 30), true)
})

test('ahoraMadrid devuelve fecha yyyy-mm-dd y hora HH:MM', () => {
  const { fecha, hora } = ahoraMadrid(new Date('2026-07-15T13:25:00Z')) // CEST = 15:25 Madrid
  assert.equal(fecha, '2026-07-15')
  assert.equal(hora, '15:25')
})

test('ahoraMadrid en invierno (CET, UTC+1)', () => {
  const { hora } = ahoraMadrid(new Date('2026-01-15T14:25:00Z'))
  assert.equal(hora, '15:25')
})

const R = (id: string, arrival: string, departure: string) => ({ id, arrival, departure })

test('llegada hoy en ventana de encendido → encender', () => {
  const out = decidirAcciones('2026-07-15', '15:25', [R('a', '2026-07-15', '2026-07-18')], CONFIG_DEFAULT, new Set())
  assert.deepEqual(out.encender.map(r => r.id), ['a'])
  assert.deepEqual(out.apagar, [])
})

test('fuera de ventana → nada', () => {
  const out = decidirAcciones('2026-07-15', '16:00', [R('a', '2026-07-15', '2026-07-18')], CONFIG_DEFAULT, new Set())
  assert.deepEqual(out.encender, [])
})

test('idempotencia: on ya hecho (o skip_temp) no se repite', () => {
  const rs = [R('a', '2026-07-15', '2026-07-18')]
  assert.deepEqual(decidirAcciones('2026-07-15', '15:25', rs, CONFIG_DEFAULT, new Set(['on:a'])).encender, [])
  assert.deepEqual(decidirAcciones('2026-07-15', '15:25', rs, CONFIG_DEFAULT, new Set(['skip_temp:a'])).encender, [])
})

test('checkout hoy en ventana de apagado → apagar (idempotente)', () => {
  const rs = [R('b', '2026-07-10', '2026-07-15')]
  assert.deepEqual(decidirAcciones('2026-07-15', '11:55', rs, CONFIG_DEFAULT, new Set()).apagar.map(r => r.id), ['b'])
  assert.deepEqual(decidirAcciones('2026-07-15', '11:55', rs, CONFIG_DEFAULT, new Set(['off:b'])).apagar, [])
})

test('caso borde: sale una reserva y entra otra el MISMO día → ambas acciones, claves distintas', () => {
  const rs = [R('sale', '2026-07-10', '2026-07-15'), R('entra', '2026-07-15', '2026-07-20')]
  const manana = decidirAcciones('2026-07-15', '11:45', rs, CONFIG_DEFAULT, new Set())
  assert.deepEqual(manana.apagar.map(r => r.id), ['sale'])
  assert.deepEqual(manana.encender, [])
  const tarde = decidirAcciones('2026-07-15', '15:10', rs, CONFIG_DEFAULT, new Set(['off:sale']))
  assert.deepEqual(tarde.encender.map(r => r.id), ['entra'])
  assert.deepEqual(tarde.apagar, [])
})

test('autoOn=false desactiva el encendido pero NO la verificación de apagado', () => {
  const cfg = { ...CONFIG_DEFAULT, autoOn: false }
  const rs = [R('a', '2026-07-15', '2026-07-15')]
  assert.deepEqual(decidirAcciones('2026-07-15', '15:10', rs, cfg, new Set()).encender, [])
  assert.deepEqual(decidirAcciones('2026-07-15', '11:45', rs, cfg, new Set()).apagar.map(r => r.id), ['a'])
})
```

- [ ] **Step 2: Verificar que fallan** — `cd apps/plataforma && node --test lib/domotica/programador.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// lib/domotica/programador.ts — decisión PURA de la automatización del ventilador (sin IO).
//
// Regla de Alberto (03/07/2026): día de llegada a las 15:00 Madrid, si en Sevilla hace >30 °C,
// encender SOLO el ventilador (la luz no se toca). Día de check-out a las 11:30, mandar apagar
// SIEMPRE (apagar algo apagado es inocuo y cubre el desfase de estado del mando RF).
// El cron corre cada 30 min en franja UTC; aquí se decide con hora Europe/Madrid (DST-safe).

export type ReservaVentana = { id: string; arrival: string; departure: string }

export type ConfigAuto = {
  autoOn: boolean       // encendido automático activo
  umbralC: number       // solo enciende si temperatura > umbral
  horaOn: string        // inicio ventana de encendido (día de llegada)
  horaOffCheck: string  // inicio ventana de verificación de apagado (día de salida)
  ventanaMin: number    // anchura de ambas ventanas (≥ intervalo del cron, 30 min)
}

export const CONFIG_DEFAULT: ConfigAuto = {
  autoOn: true, umbralC: 30, horaOn: '15:00', horaOffCheck: '11:30', ventanaMin: 30,
}

export function ahoraMadrid(d = new Date()): { fecha: string; hora: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value || ''
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` }
}

export function enVentana(hora: string, inicio: string, minutos: number): boolean {
  const [h, m] = hora.split(':').map(Number)
  const [hi, mi] = inicio.split(':').map(Number)
  const x = h * 60 + m
  const a = hi * 60 + mi
  return x >= a && x < a + minutos
}

// `hechas` = claves `${accion}:${reservaRef}` ya registradas en domotica_log.
export function decidirAcciones(
  fecha: string,
  hora: string,
  reservas: ReservaVentana[],
  cfg: ConfigAuto,
  hechas: Set<string>,
): { encender: ReservaVentana[]; apagar: ReservaVentana[] } {
  const encender = cfg.autoOn && enVentana(hora, cfg.horaOn, cfg.ventanaMin)
    ? reservas.filter(r => r.arrival === fecha && !hechas.has(`on:${r.id}`) && !hechas.has(`skip_temp:${r.id}`))
    : []
  const apagar = enVentana(hora, cfg.horaOffCheck, cfg.ventanaMin)
    ? reservas.filter(r => r.departure === fecha && !hechas.has(`off:${r.id}`))
    : []
  return { encender, apagar }
}
```

- [ ] **Step 4: Verificar que pasan** — mismo comando, PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/domotica/programador.ts apps/plataforma/lib/domotica/programador.test.ts
git commit -m "feat(plataforma): lógica pura del programador de domótica (ventanas Madrid + idempotencia)"
```

---

### Task 5: Rutas API de usuario

**Files:**
- Create: `apps/plataforma/app/api/sivra/domotica/dispositivos/route.ts`
- Create: `apps/plataforma/app/api/sivra/domotica/dispositivos/[id]/route.ts`
- Create: `apps/plataforma/app/api/sivra/domotica/descubrir/route.ts`
- Create: `apps/plataforma/app/api/sivra/domotica/comando/route.ts`

Patrón de auth: `getSession()` de `@/lib/session` → 401 si null (igual que `facturas-control/route.ts`).

- [ ] **Step 1: `dispositivos/route.ts` (GET lista BD + estado Tuya en vivo + log reciente)**

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { tuyaGetStatus } from '@/lib/domotica/tuya'

export const dynamic = 'force-dynamic'

export type DispositivoRow = {
  id: string; nombre: string; tuya_device_id: string; piso: string | null;
  smoobu_apartment_id: number | null; config: Record<string, unknown>; activo: boolean;
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const dispositivos = await prisma.$queryRaw<DispositivoRow[]>`
    SELECT id::text, nombre, tuya_device_id, piso, smoobu_apartment_id, config, activo
    FROM domotica_dispositivos ORDER BY created_at`

  const conEstado = await Promise.all(dispositivos.map(async d => {
    let estado: { code: string; value: unknown }[] | null = null
    let errorEstado: string | null = null
    try { estado = await tuyaGetStatus(d.tuya_device_id) } catch (e) { errorEstado = e instanceof Error ? e.message : String(e) }
    const log = await prisma.$queryRaw<{ accion: string; reserva_ref: string | null; detalle: unknown; created_at: Date }[]>`
      SELECT accion, reserva_ref, detalle, created_at FROM domotica_log
      WHERE dispositivo_id = ${d.id}::uuid ORDER BY created_at DESC LIMIT 20`
    return { ...d, estado, errorEstado, log }
  }))

  return NextResponse.json({ dispositivos: conEstado })
}
```

- [ ] **Step 2: `dispositivos/[id]/route.ts` (PATCH nombre/piso/apartamento/config/activo)**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  // Solo campos conocidos; config se fusiona sobre la existente (jsonb ||).
  const { nombre, piso, smoobuApartmentId, config, activo } = body as {
    nombre?: string; piso?: string; smoobuApartmentId?: number | null;
    config?: Record<string, unknown>; activo?: boolean;
  }
  await prisma.$executeRaw`
    UPDATE domotica_dispositivos SET
      nombre = COALESCE(${nombre ?? null}, nombre),
      piso = COALESCE(${piso ?? null}, piso),
      smoobu_apartment_id = COALESCE(${smoobuApartmentId ?? null}::integer, smoobu_apartment_id),
      config = CASE WHEN ${config ? JSON.stringify(config) : null}::jsonb IS NULL
                    THEN config ELSE config || ${config ? JSON.stringify(config) : null}::jsonb END,
      activo = COALESCE(${activo ?? null}::boolean, activo)
    WHERE id = ${id}::uuid`
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: `descubrir/route.ts` (POST: alta de dispositivos Tuya que falten + lista apartamentos Smoobu para el selector)**

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { tuyaListDevices } from '@/lib/domotica/tuya'
import { smoobuFetch } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const devices = await tuyaListDevices() // lanza si faltan envs o falla Tuya → 500 con mensaje
  for (const d of devices) {
    await prisma.$executeRaw`
      INSERT INTO domotica_dispositivos (nombre, tuya_device_id)
      VALUES (${d.name || d.id}, ${d.id})
      ON CONFLICT (tuya_device_id) DO NOTHING`
  }

  // Apartamentos de Smoobu para vincular piso → reservas (best effort).
  let apartamentos: { id: number; name: string }[] = []
  try {
    const r = await smoobuFetch('/api/apartments', { cache: 'no-store' }).then(x => x.json())
    apartamentos = (Array.isArray(r) ? r : r?.apartments || []).map((a: any) => ({ id: a.id, name: a.name }))
  } catch { /* el selector queda vacío; se puede reintentar */ }

  return NextResponse.json({ encontrados: devices, apartamentos })
}
```

Envuelve el cuerpo en `try/catch` y devuelve `NextResponse.json({ error: msg }, { status: 502 })` si Tuya falla, para que la UI muestre el mensaje (p.ej. "TUYA_CLIENT_ID no configurada").

- [ ] **Step 4: `comando/route.ts` (POST manual: on/off/velocidad/luz)**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import {
  tuyaGetStatus, tuyaSendCommands, elegirCodigo, DP_VENTILADOR, DP_VELOCIDAD, DP_LUZ,
} from '@/lib/domotica/tuya'

export const dynamic = 'force-dynamic'

const ACCIONES = ['on', 'off', 'velocidad', 'luz_on', 'luz_off'] as const
type Accion = (typeof ACCIONES)[number]

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { dispositivoId, accion, valor } = (await req.json().catch(() => ({}))) as {
    dispositivoId?: string; accion?: Accion; valor?: unknown;
  }
  if (!dispositivoId || !accion || !ACCIONES.includes(accion)) {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${dispositivoId}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  try {
    const status = await tuyaGetStatus(deviceId)
    const codes = status.map(s => s.code)
    let comando: { code: string; value: unknown } | null = null
    if (accion === 'on' || accion === 'off') {
      const code = elegirCodigo(codes, DP_VENTILADOR)
      comando = code ? { code, value: accion === 'on' } : null
    } else if (accion === 'velocidad') {
      const code = elegirCodigo(codes, DP_VELOCIDAD)
      // fan_speed suele ser enum de strings ('1'..'6'); fan_speed_percent numérico.
      comando = code ? { code, value: code === 'fan_speed_percent' ? Number(valor) : String(valor) } : null
    } else {
      const code = elegirCodigo(codes, DP_LUZ)
      comando = code ? { code, value: accion === 'luz_on' } : null
    }
    if (!comando) return NextResponse.json({ error: 'El dispositivo no expone esa función' }, { status: 422 })

    await tuyaSendCommands(deviceId, [comando])
    await prisma.$executeRaw`
      INSERT INTO domotica_log (dispositivo_id, accion, detalle)
      VALUES (${dispositivoId}::uuid, ${'manual_' + accion}, ${JSON.stringify({ comando })}::jsonb)`
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
```

- [ ] **Step 5: Typecheck y commit**

Run: `cd apps/plataforma && npx tsc --noEmit` → 0 errores (la app está a 0; no dejarla peor).

```bash
git add apps/plataforma/app/api/sivra/domotica
git commit -m "feat(plataforma): API domótica — dispositivos, descubrir, comando manual"
```

---

### Task 6: Cron programador + vercel.json

**Files:**
- Create: `apps/plataforma/app/api/sivra/domotica/programador/route.ts`
- Modify: `apps/plataforma/vercel.json` (array `crons`)

- [ ] **Step 1: Ruta del cron**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { smoobuFetch } from '@/lib/smoobu'
import { tuyaSendCommands, codigoVentilador } from '@/lib/domotica/tuya'
import { temperaturaSevilla } from '@/lib/domotica/meteo'
import {
  ahoraMadrid, decidirAcciones, CONFIG_DEFAULT, type ConfigAuto, type ReservaVentana,
} from '@/lib/domotica/programador'
import { tgAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Disp = {
  id: string; nombre: string; tuya_device_id: string;
  smoobu_apartment_id: number | null; config: Partial<ConfigAuto> | null;
}

async function log(dispId: string, accion: string, reservaRef: string | null, detalle: unknown) {
  // ON CONFLICT DO NOTHING = idempotencia real aunque dos pasadas coincidan.
  await prisma.$executeRaw`
    INSERT INTO domotica_log (dispositivo_id, accion, reserva_ref, detalle)
    VALUES (${dispId}::uuid, ${accion}, ${reservaRef}, ${JSON.stringify(detalle ?? {})}::jsonb)
    ON CONFLICT (dispositivo_id, accion, reserva_ref) WHERE reserva_ref IS NOT NULL DO NOTHING`
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { fecha, hora } = ahoraMadrid()
  const resultados: Record<string, unknown>[] = []

  const dispositivos = await prisma.$queryRaw<Disp[]>`
    SELECT id::text, nombre, tuya_device_id, smoobu_apartment_id, config
    FROM domotica_dispositivos WHERE activo = true AND smoobu_apartment_id IS NOT NULL`

  for (const d of dispositivos) {
    try {
      const cfg: ConfigAuto = { ...CONFIG_DEFAULT, ...(d.config || {}) }

      const data = await smoobuFetch(
        `/api/reservations?apartments[]=${d.smoobu_apartment_id}&from=${fecha}&to=${fecha}&showCancellation=false&pageSize=100`,
        { cache: 'no-store' },
      ).then(r => r.json())
      const reservas: ReservaVentana[] = (data?.bookings || []).map((b: any) => ({
        id: String(b.id), arrival: String(b.arrival), departure: String(b.departure),
      }))
      if (!reservas.length) { resultados.push({ d: d.nombre, nada: true }); continue }

      const hechas = new Set<string>(
        (await prisma.$queryRaw<{ k: string }[]>`
          SELECT accion || ':' || reserva_ref AS k FROM domotica_log
          WHERE dispositivo_id = ${d.id}::uuid AND reserva_ref IS NOT NULL
            AND created_at > now() - interval '7 days'`).map(r => r.k),
      )
      const { encender, apagar } = decidirAcciones(fecha, hora, reservas, cfg, hechas)

      // ── Apagado (día de salida): mandar off SIEMPRE; el estado previo solo se anota ──
      for (const r of apagar) {
        const v = await codigoVentilador(d.tuya_device_id)
        if (!v) { await log(d.id, 'error', r.id, { motivo: 'sin DP de ventilador' }); continue }
        await tuyaSendCommands(d.tuya_device_id, [{ code: v.code, value: false }])
        await log(d.id, 'off', r.id, { estadoPrevio: v.status, hora })
        resultados.push({ d: d.nombre, off: r.id })
      }

      // ── Encendido (día de llegada): solo si temperatura de Sevilla > umbral ──
      for (const r of encender) {
        const temp = await temperaturaSevilla()
        if (temp === null) {
          // reserva_ref null → NO idempotente: la siguiente pasada (aún en ventana) reintenta.
          await log(d.id, 'skip_meteo_error', null, { reserva: r.id, hora })
          await tgAlert(`Domótica ${d.nombre}: Open-Meteo no responde; no enciendo (reserva ${r.id})`, 'aviso')
          continue
        }
        if (temp <= cfg.umbralC) {
          await log(d.id, 'skip_temp', r.id, { temp, umbral: cfg.umbralC, hora })
          resultados.push({ d: d.nombre, skip_temp: r.id, temp })
          continue
        }
        const v = await codigoVentilador(d.tuya_device_id)
        if (!v) { await log(d.id, 'error', r.id, { motivo: 'sin DP de ventilador' }); continue }
        // SOLO el switch del ventilador — la luz no se toca (regla de Alberto).
        await tuyaSendCommands(d.tuya_device_id, [{ code: v.code, value: true }])
        await log(d.id, 'on', r.id, { temp, hora })
        resultados.push({ d: d.nombre, on: r.id, temp })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await log(d.id, 'error', null, { msg, hora }).catch(() => {})
      await tgAlert(`Domótica ${d.nombre}: fallo del programador — ${msg}`, 'critico').catch(() => {})
      resultados.push({ d: d.nombre, error: msg })
    }
  }

  return NextResponse.json({ ok: true, fecha, hora, resultados })
}
```

- [ ] **Step 2: Cron en `vercel.json`**

Añadir al array `crons` de `apps/plataforma/vercel.json` (franja UTC que cubre 11:30–12:00 y 15:00–15:30 Madrid en CET y CEST; correr de más es inocuo por idempotencia):

```json
{
  "path": "/api/sivra/domotica/programador",
  "schedule": "25,55 8-15 * * *"
}
```

- [ ] **Step 3: Typecheck + tests + commit**

Run: `cd apps/plataforma && npx tsc --noEmit && node --test lib/domotica/*.test.ts` → 0 errores, tests PASS.

```bash
git add apps/plataforma/app/api/sivra/domotica/programador/route.ts apps/plataforma/vercel.json
git commit -m "feat(plataforma): cron programador de domótica — on 15:00 si >30 °C, verificación off 11:30"
```

---

### Task 7: UI `/sivra/domotica`

**Files:**
- Create: `apps/plataforma/app/(usuario)/sivra/domotica/page.tsx`
- Create: `apps/plataforma/app/(usuario)/sivra/domotica/DomoticaClient.tsx`
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx`

- [ ] **Step 1: Mirar una página vecina para copiar el layout**

Run: `sed -n 1,40p "apps/plataforma/app/(usuario)/sivra/mercado/page.tsx"` y respeta su patrón (server page fina que delega en un client component; clases Tailwind de la app).

- [ ] **Step 2: `page.tsx`**

```tsx
import DomoticaClient from './DomoticaClient'

export const dynamic = 'force-dynamic'

export default function DomoticaPage() {
  return <DomoticaClient />
}
```

- [ ] **Step 3: `DomoticaClient.tsx`** — client component con este comportamiento (código completo; ajusta SOLO clases/estilo al de las páginas vecinas):

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'

type DP = { code: string; value: unknown }
type LogRow = { accion: string; reserva_ref: string | null; detalle: any; created_at: string }
type Disp = {
  id: string; nombre: string; tuya_device_id: string; piso: string | null;
  smoobu_apartment_id: number | null; config: Record<string, any>; activo: boolean;
  estado: DP[] | null; errorEstado: string | null; log: LogRow[];
}

const dp = (estado: DP[] | null, codes: string[]) =>
  estado?.find(s => codes.includes(s.code))?.value

export default function DomoticaClient() {
  const [dispositivos, setDispositivos] = useState<Disp[] | null>(null)
  const [apartamentos, setApartamentos] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const r = await fetch('/api/sivra/domotica/dispositivos').then(x => x.json()).catch(() => null)
    if (!r || r.error) { setError(r?.error || 'Error cargando dispositivos'); setDispositivos([]); return }
    setDispositivos(r.dispositivos)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function descubrir() {
    setOcupado(true); setError(null)
    const r = await fetch('/api/sivra/domotica/descubrir', { method: 'POST' }).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error buscando dispositivos')
    else setApartamentos(r.apartamentos || [])
    await cargar(); setOcupado(false)
  }

  async function comando(id: string, accion: string, valor?: unknown) {
    setOcupado(true); setError(null)
    const r = await fetch('/api/sivra/domotica/comando', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispositivoId: id, accion, valor }),
    }).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error enviando el comando')
    await cargar(); setOcupado(false)
  }

  async function guardarConfig(id: string, patch: Record<string, unknown>) {
    setOcupado(true)
    await fetch(`/api/sivra/domotica/dispositivos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).catch(() => null)
    await cargar(); setOcupado(false)
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Domótica</h1>
        <button onClick={descubrir} disabled={ocupado}
          className="min-h-[44px] px-4 rounded-lg border">🔍 Buscar dispositivos</button>
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 p-3 text-sm">{error}</div>}
      {dispositivos === null && <p className="text-sm opacity-70">Cargando…</p>}
      {dispositivos?.length === 0 && (
        <p className="text-sm opacity-70">
          Sin dispositivos. Configura <code>TUYA_CLIENT_ID/SECRET</code> en Vercel, vincula la cuenta de
          Smart Life en platform.tuya.com y pulsa «Buscar dispositivos». Guía: <code>docs/DOMOTICA-TUYA.md</code>.
        </p>
      )}

      {dispositivos?.map(d => {
        const on = dp(d.estado, ['switch_fan', 'fan_switch', 'switch']) === true
        const luz = dp(d.estado, ['switch_led', 'switch_light', 'light']) === true
        const cfg = { autoOn: true, umbralC: 30, ...d.config }
        return (
          <div key={d.id} className={`rounded-xl border p-4 space-y-3 ${ocupado ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="font-medium">{d.nombre}</h2>
                <p className="text-xs opacity-60">
                  {d.errorEstado ? `⚠️ ${d.errorEstado}` : d.estado ? (on ? '🟢 Encendido' : '⚪ Apagado') : 'Sin estado'}
                </p>
              </div>
              <button onClick={cargar} className="min-h-[44px] px-3 rounded-lg border" disabled={ocupado}>↻</button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => comando(d.id, on ? 'off' : 'on')} disabled={ocupado}
                className="min-h-[44px] px-4 rounded-lg border font-medium flex-1">
                {on ? 'Apagar' : 'Encender'}
              </button>
              <select aria-label="Velocidad" disabled={ocupado} defaultValue=""
                onChange={e => e.target.value && comando(d.id, 'velocidad', e.target.value)}
                className="min-h-[44px] px-2 rounded-lg border">
                <option value="" disabled>Velocidad</option>
                {['1', '2', '3', '4', '5', '6'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <button onClick={() => comando(d.id, luz ? 'luz_off' : 'luz_on')} disabled={ocupado}
                className="min-h-[44px] px-4 rounded-lg border">💡 {luz ? 'Apagar luz' : 'Luz'}</button>
            </div>

            <p className="text-xs opacity-60">
              ⚠️ Si alguien usa el mando físico, el estado mostrado puede quedar desactualizado
              (limitación del hardware; los comandos siguen funcionando).
            </p>

            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <label className="flex items-center justify-between gap-2 min-h-[44px]">
                <span>Auto: encender a las 15:00 del día de llegada si Sevilla &gt; {cfg.umbralC} °C</span>
                <input type="checkbox" checked={!!cfg.autoOn}
                  onChange={e => guardarConfig(d.id, { config: { autoOn: e.target.checked } })} />
              </label>
              <label className="flex items-center justify-between gap-2 min-h-[44px]">
                <span>Umbral (°C)</span>
                <input type="number" defaultValue={cfg.umbralC} min={20} max={45}
                  className="w-20 border rounded-lg px-2 py-1 text-right"
                  onBlur={e => guardarConfig(d.id, { config: { umbralC: Number(e.target.value) || 30 } })} />
              </label>
              <label className="flex items-center justify-between gap-2 min-h-[44px]">
                <span>Piso (reservas Smoobu)</span>
                <select value={d.smoobu_apartment_id ?? ''} className="border rounded-lg px-2 py-1 max-w-[55%]"
                  onChange={e => guardarConfig(d.id, { smoobuApartmentId: Number(e.target.value) || null })}>
                  <option value="">— sin vincular —</option>
                  {apartamentos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  {d.smoobu_apartment_id && !apartamentos.some(a => a.id === d.smoobu_apartment_id) && (
                    <option value={d.smoobu_apartment_id}>#{d.smoobu_apartment_id}</option>
                  )}
                </select>
              </label>
              <p className="text-xs opacity-60">
                A las 11:30 del día de check-out se manda apagar siempre (por si quedó encendido).
                {!d.smoobu_apartment_id && ' ⚠️ Sin piso vinculado la automatización NO corre — pulsa «Buscar dispositivos» y elige el apartamento.'}
              </p>
            </div>

            <details>
              <summary className="cursor-pointer text-sm min-h-[44px] flex items-center">Últimas acciones</summary>
              <ul className="text-xs space-y-1 mt-2">
                {d.log.length === 0 && <li className="opacity-60">Sin acciones todavía.</li>}
                {d.log.map((l, i) => (
                  <li key={i}>
                    {new Date(l.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} — {l.accion}
                    {l.reserva_ref ? ` (reserva ${l.reserva_ref})` : ''}
                    {l.detalle?.temp !== undefined ? ` · ${l.detalle.temp} °C` : ''}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )
      })}
    </div>
  )
}
```

Notas obligatorias: botones ≥44 px (`min-h-[44px]`), recargas manteniendo la lista visible (atenuada con `opacity-60`, sin loader a pantalla completa), log en `<details>` (20 filas — montaje trivial). El selector de apartamentos se rellena al pulsar «Buscar dispositivos» (evita llamar a Smoobu en cada carga).

- [ ] **Step 4: Entrada en el sidebar**

Run: `grep -n "sivra" "apps/plataforma/app/(usuario)/UserSidebar.tsx" | head -20` para localizar la lista de enlaces de la sección sivra, y añade una entrada `Domótica` → `/sivra/domotica` con la MISMA forma que las vecinas (icono/emoji si las demás lo llevan).

- [ ] **Step 5: Typecheck + revisión responsive**

Run: `cd apps/plataforma && npx tsc --noEmit` → 0 errores. Repasa mentalmente a 320 px: cards apiladas (`max-w-3xl` + flex-wrap), sin tablas anchas.

- [ ] **Step 6: Commit**

```bash
git add "apps/plataforma/app/(usuario)/sivra/domotica" "apps/plataforma/app/(usuario)/UserSidebar.tsx"
git commit -m "feat(plataforma): página /sivra/domotica — control del ventilador + config de automatización"
```

---

### Task 8: Guía de setup `docs/DOMOTICA-TUYA.md`

**Files:**
- Create: `docs/DOMOTICA-TUYA.md`

- [ ] **Step 1: Escribir la guía** (contenido completo):

```markdown
# Domótica Tuya — setup y operación

Ventilador CREATE (Tuya) de House Sevillana (C/ Socorro 24), controlado desde plataforma.
Spec: `docs/superpowers/specs/2026-07-03-domotica-tuya-ventilador-design.md`.

## Estado del emparejamiento
- 03/07/2026: el ventilador se re-emparejó de CREATE Home a **Smart Life** (cuenta de Alberto).
  Smart Life es la app que hay que usar para el QR de vinculación.

## Setup una vez (Alberto, ~10 min, desde ORDENADOR)
1. **platform.tuya.com** → Sign Up (email + código de verificación; NO usar login de Google).
2. Cloud → Development → **Create Cloud Project** → industria "Smart Home",
   **Data Center: Central Europe**. Acepta el trial de **IoT Core**.
3. Dentro del proyecto: **Devices → Link Tuya App Account → Add App Account** → sale un QR →
   en el móvil: Smart Life → «Yo» → icono escáner (arriba dcha.) → escanear.
   El ventilador aparece en la lista de dispositivos del proyecto.
4. Pestaña **Overview** → copia **Access ID** y **Access Secret** → Vercel → proyecto
   **plataforma** → Settings → Environment Variables (Production):
   - `TUYA_CLIENT_ID` = Access ID
   - `TUYA_CLIENT_SECRET` = Access Secret
   - (`TUYA_ENDPOINT` solo si el data center NO es Central Europe; default `https://openapi.tuyaeu.com`)
   Redeploy de plataforma para que las envs entren.
5. En plataforma → **/sivra/domotica** → «Buscar dispositivos» → aparece el ventilador →
   vincúlalo al apartamento de Smoobu (selector «Piso») para que corra la automatización.

## La automatización (regla acordada el 03/07/2026)
- **Día de llegada, 15:00 (Madrid):** si en Sevilla hace **>30 °C** (Open-Meteo, temperatura en el
  momento) → enciende **solo el ventilador** (la luz nunca se toca). Si no, lo anota y no hace nada.
- **Día de check-out, 11:30:** manda **apagar siempre** (apagar algo apagado es inocuo; cubre
  también el desfase de estado cuando el huésped usó el mando físico RF).
- Idempotente por reserva (`domotica_log`, índice único) — el cron corre cada 30 min en franja
  (`25,55 8-15 * * *` UTC) y decide con hora Europe/Madrid (DST-safe).
- Config editable en la UI: activar/desactivar auto, umbral °C, piso vinculado.

## Mantenimiento
- **El trial de IoT Core caduca cada ~6 meses.** Si la API empieza a fallar con error de
  suscripción, el mensaje (UI y Telegram) lo dice: renovar en platform.tuya.com → proyecto →
  Service API → IoT Core → Extend Trial. Es gratis.
- Errores del programador → alerta Telegram (patrón `tgAlert` crítico). Las acciones quedan en
  `domotica_log` (visible en la UI, «Últimas acciones»).
- Limitación conocida del hardware: el mando RF NO sincroniza estado con el cloud → el estado
  mostrado puede mentir; por eso el apagado de las 11:30 se manda sin mirar el estado.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DOMOTICA-TUYA.md
git commit -m "docs: guía de setup y operación de la domótica Tuya (ventilador Socorro)"
```

---

### Task 9: Verificación final, push, PR y memoria

- [ ] **Step 1: Suite completa local**

Run: `cd apps/plataforma && npx tsc --noEmit && node --test lib/domotica/*.test.ts`
Expected: 0 errores de tipos; todos los tests PASS.

Run (guardián de secretos, desde la raíz): `pnpm test:guardia` → verde (las envs Tuya usan `|| ''`, permitido para API keys externas).

- [ ] **Step 2: Actualizar memoria**

Añadir entrada nueva ARRIBA en `docs/CONTEXTO-SESIONES.md`: qué se construyó (lib domotica, tablas, rutas, UI, cron), la regla de la automatización, el estado (pendiente de envs `TUYA_CLIENT_ID/SECRET` de Alberto y prueba real), y que el ventilador quedó emparejado en **Smart Life** (ya no CREATE Home).

- [ ] **Step 3: Push y PR**

```bash
git push -u origin claude/wifi-ceiling-fan-connect-kkj4xe
```

Actualizar el cuerpo del PR #714 (checklist de estado) con `mcp__github__update_pull_request`.

- [ ] **Step 4: Prueba real (cuando Alberto ponga las envs)**

Desde `/sivra/domotica`: «Buscar dispositivos» → encender/apagar de verdad → vincular apartamento → verificar una pasada del cron con `GET /api/sivra/domotica/programador?secret=$CRON_SECRET` fuera de ventana (debe responder `ok:true` sin acciones). Anotar el resultado en la memoria.

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** credenciales/envs (T8+envs), lib cliente (T2), meteo (T3), BD (T1), rutas API (T5), UI mobile-first con gotcha RF (T7), cron+ventanas+idempotencia (T4+T6), errores→Telegram (T6), tests (T2-T4), guía (T8), fuera de alcance respetado (sin paquete compartido, luz solo manual).
- **Placeholders:** ninguno — todo el código está inline; los dos únicos pasos "mira el vecino" (RLS en T1.2, sidebar en T7.4) dependen de contenido real del repo y dan el comando exacto para resolverlos.
- **Consistencia de tipos:** `ConfigAuto`/`CONFIG_DEFAULT`/`decidirAcciones`/`ahoraMadrid` (T4) se importan igual en T6; `elegirCodigo`/`DP_*`/`codigoVentilador` (T2) igual en T5/T6; claves de idempotencia `on:`/`off:`/`skip_temp:` idénticas en T4 (lógica) y T6 (SQL `accion || ':' || reserva_ref`).
```
