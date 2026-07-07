// lib/domotica/acceso.ts — cliente de control de acceso (cerraduras/teclados NIVIAN) sobre la Tuya OpenAPI.
// Cada función va aislada con su try/catch: si el aparato no expone algo por cloud, devuelve
// { ok:false, error } en vez de romper. Los DP/endpoints exactos se descubren con la sonda (Fase 0).
import { tuyaRequest, tuyaGetToken, tuyaGetSpec, tuyaGetStatus, tuyaSendCommands } from './tuya'
import { DP_ABRIR, elegirCodigoAbrir, normalizarAcceso, type BloqueSonda } from './acceso-puro'

export { DP_ABRIR, DP_BATERIA, elegirCodigoAbrir, normalizarAcceso, type BloqueSonda } from './acceso-puro'

// Envuelve una llamada door-lock: devuelve {ok, result|msg} sin lanzar.
async function intentar(method: string, path: string): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
  try {
    const token = await tuyaGetToken()
    return { ok: true, result: await tuyaRequest(method, path, undefined, token) }
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
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
