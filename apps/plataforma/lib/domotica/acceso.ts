// lib/domotica/acceso.ts — cliente de control de acceso (cerraduras/teclados NIVIAN) sobre la Tuya OpenAPI.
// Cada función va aislada con su try/catch: si el aparato no expone algo por cloud, devuelve
// { ok:false, error } en vez de romper. Los DP/endpoints exactos se descubren con la sonda (Fase 0).
import { randomInt } from 'crypto'
import { tuyaRequest, tuyaGetToken, tuyaGetSpec, tuyaGetStatus, tuyaSendCommands } from './tuya'
import { DP_ABRIR, elegirCodigoAbrir, normalizarAcceso, variantesAperturas, type BloqueSonda } from './acceso-puro'
import { descifrarTicketKey, cifrarPin } from './tuya-cifrado'

export { DP_ABRIR, DP_BATERIA, elegirCodigoAbrir, normalizarAcceso, type BloqueSonda } from './acceso-puro'

const CLIENT_SECRET = () => process.env.TUYA_CLIENT_SECRET || ''

// PIN aleatorio de N dígitos (crypto, no Math.random). Nunca empieza por 0 para no perder longitud.
export function generarPin(longitud: number): string {
  const n = Math.min(10, Math.max(4, Math.floor(longitud) || 6))
  let out = String(randomInt(1, 10))
  for (let i = 1; i < n; i++) out += String(randomInt(0, 10))
  return out
}

// Envuelve una llamada door-lock: devuelve {ok, result|msg} sin lanzar.
async function intentar(method: string, path: string): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
  try {
    const token = await tuyaGetToken()
    return { ok: true, result: await tuyaRequest(method, path, undefined, token) }
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
}

// Historial de aperturas de la cerradura: prueba las variantes documentadas (el endpoint/params de Tuya
// cambió entre versiones — el `open-logs` viejo daba 1100) y devuelve la PRIMERA que responde, anotando la
// `via` que funcionó. Si todas fallan, junta los errores por variante para diagnosticar en prod.
async function sondearAperturas(deviceId: string): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
  const errores: string[] = []
  for (const v of variantesAperturas(deviceId, Date.now())) {
    const r = await intentar(v.method, v.path)
    if (r.ok) return { ok: true, result: { via: v.via, historial: r.result } }
    errores.push(`${v.via}→${r.msg}`)
  }
  return { ok: false, msg: errores.join(' · ') }
}

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
  const accesos = normalizarAcceso('accesos', await sondearAperturas(deviceId))

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

// ── Gestión de PIN temporales (Fase 2) ──────────────────────────────────────────
// El aparato real (NIVIAN) puede exponer contraseña "online" (elegimos el PIN, requiere ticket+AES y la
// cerradura online) u "offline" (Tuya genera el código, no necesita conexión). Probamos primero online
// (mejor UX: PIN elegido y entregable por adelantado) y caemos a offline. Cada vía va con try/catch: si
// el NIVIAN no lo expone por cloud, devolvemos { ok:false, error } sin romper (la sonda lo diagnostica).

export type ResultadoPin = {
  ok: boolean
  pin?: string               // el código a entregar (elegido en online, devuelto por Tuya en offline)
  tuyaPasswordId?: string    // id del password en Tuya (para poder borrarlo)
  modo?: 'online' | 'offline'
  error?: string
}

// Contraseña ONLINE: ticket + AES. `effectiveEpoch`/`invalidEpoch` en segundos.
async function crearPinOnline(deviceId: string, pin: string, nombre: string, effectiveEpoch: number, invalidEpoch: number): Promise<ResultadoPin> {
  const token = await tuyaGetToken()
  const ticket = await tuyaRequest<{ ticket_id: string; ticket_key: string }>(
    'POST', `/v1.0/devices/${deviceId}/door-lock/password-ticket`, {}, token,
  )
  let cifrado: string
  try {
    const claveAes = descifrarTicketKey(ticket.ticket_key, CLIENT_SECRET())
    cifrado = cifrarPin(pin, claveAes)
  } catch (e) {
    // Enriquecemos con la longitud del ticket_key para diagnosticar en prod (dev no llega a Tuya).
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`cifrado del PIN falló (ticket_key=${(ticket.ticket_key || '').length} hex): ${msg}`)
  }
  const r = await tuyaRequest<{ id?: string } | boolean>(
    'POST', `/v1.0/devices/${deviceId}/door-lock/temp-password`,
    {
      password: cifrado, password_type: 'ticket', ticket_id: ticket.ticket_id,
      effective_time: effectiveEpoch, invalid_time: invalidEpoch, name: nombre.slice(0, 30), type: 0,
    }, token,
  )
  const id = typeof r === 'object' && r ? String((r as { id?: string }).id ?? '') : ''
  return { ok: true, pin, tuyaPasswordId: id || undefined, modo: 'online' }
}

// Contraseña OFFLINE: Tuya genera el código (no lo elegimos) y funciona sin conexión de la cerradura.
async function crearPinOffline(deviceId: string, nombre: string, effectiveEpoch: number, invalidEpoch: number): Promise<ResultadoPin> {
  const token = await tuyaGetToken()
  const r = await tuyaRequest<{ password?: string; pwd?: string; id?: string }>(
    'POST', `/v1.1/devices/${deviceId}/door-lock/offline-temp-password`,
    { name: nombre.slice(0, 30), effective_time: effectiveEpoch, invalid_time: invalidEpoch }, token,
  )
  const pin = String(r?.password ?? r?.pwd ?? '')
  if (!pin) return { ok: false, error: 'La cerradura no devolvió un código offline' }
  return { ok: true, pin, tuyaPasswordId: r?.id ? String(r.id) : undefined, modo: 'offline' }
}

// Crea un PIN temporal para la ventana dada. Devuelve el código a entregar o un error claro.
export async function crearPinTemporal(
  deviceId: string,
  opts: { nombre: string; desdeEpoch: number; hastaEpoch: number; pinPreferido?: string; longitud?: number },
): Promise<ResultadoPin> {
  const pin = opts.pinPreferido || generarPin(opts.longitud || 6)
  let errOnline = ''
  try {
    return await crearPinOnline(deviceId, pin, opts.nombre, opts.desdeEpoch, opts.hastaEpoch)
  } catch (e) { errOnline = e instanceof Error ? e.message : String(e) }
  try {
    return await crearPinOffline(deviceId, opts.nombre, opts.desdeEpoch, opts.hastaEpoch)
  } catch (e) {
    const errOffline = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `PIN no creado. online: ${errOnline} · offline: ${errOffline}` }
  }
}

// Borra un PIN temporal por su id de Tuya. Prueba online y offline. Idempotente-ish (si ya no existe, ok).
export async function borrarPin(deviceId: string, tuyaPasswordId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await tuyaGetToken()
  const rutas = [
    `/v1.0/devices/${deviceId}/door-lock/temp-passwords/${tuyaPasswordId}`,
    `/v1.1/devices/${deviceId}/door-lock/offline-temp-password/${tuyaPasswordId}`,
  ]
  let last = ''
  for (const path of rutas) {
    try { await tuyaRequest('DELETE', path, undefined, token); return { ok: true } }
    catch (e) { last = e instanceof Error ? e.message : String(e) }
  }
  return { ok: false, error: last || 'no se pudo borrar' }
}

// Lista los PIN temporales que la cerradura expone por cloud (para conciliar / diagnosticar).
export async function listarPins(deviceId: string): Promise<{ ok: boolean; datos: unknown; error?: string }> {
  try {
    const token = await tuyaGetToken()
    const datos = await tuyaRequest('GET', `/v1.0/devices/${deviceId}/door-lock/temp-passwords`, undefined, token)
    return { ok: true, datos }
  } catch (e) {
    return { ok: false, datos: null, error: e instanceof Error ? e.message : String(e) }
  }
}
