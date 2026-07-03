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
  const r = await request<{ list?: unknown[] } | unknown[]>(
    'GET', '/v2.0/cloud/thing/device?page_size=100', undefined, token,
  )
  const list = (Array.isArray(r) ? r : (r as { list?: unknown[] })?.list || []) as Array<Record<string, unknown>>
  return list.map(d => ({
    id: String(d.id ?? ''),
    name: String(d.customName || d.name || ''),
    online: Boolean(d.isOnline ?? d.is_online),
    category: String(d.category || ''),
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
