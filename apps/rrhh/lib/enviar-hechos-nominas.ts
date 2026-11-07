// Envío del outbox de nóminas a contabilidad (`POST {CONTABILIDAD_URL}/api/hechos`), mismo patrón que apps/taller/lib/enviar-hechos.ts.
// El cron LEE la cola, envía FUERA de cualquier transacción y anota cada resultado. Sin CONTABILIDAD_URL/secreto: no se envía y queda pendiente.
//   2xx (201 asentado · 200 duplicado idempotente · 202 pendiente de regla) → enviado
//   401/408/425/429, 5xx, 3xx, red/timeout → error (reintento con espera exponencial)
//   resto de 4xx (400 forma · 403 origen no autorizado · 409 conflicto · 422) → rechazado (NO se reintenta; visible)
// Un `pago` no viaja antes que su `nomina`: si la nómina de esa cola no salió, el pago espera.
import { requireSecret } from '@central/core-identity'

export const ENV_URL = 'CONTABILIDAD_URL'
export const ENV_SECRETO = 'CONTABILIDAD_HECHOS_SECRET_RRHH'
export const APP_ORIGEN = 'rrhh'

export type ConfigContabilidad = { url: string; secreto: string }

export function leerConfigContabilidad(env: Record<string, string | undefined> = process.env, secretoDe: (n: string) => string = requireSecret): ConfigContabilidad | null {
  const crudo = (env[ENV_URL] ?? '').trim()
  if (!crudo) return null
  let u: URL
  try { u = new URL(crudo) } catch { return null }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  let secreto: string
  try { secreto = secretoDe(ENV_SECRETO) } catch { return null }
  return secreto ? { url: u.origin, secreto } : null
}

export type Veredicto = { estado: 'enviado' | 'rechazado' | 'error'; detalle: string | null }

export function clasificarRespuesta(status: number | null, cuerpo = ''): Veredicto {
  const detalle = (txt: string) => `${txt}${cuerpo ? `: ${cuerpo.slice(0, 300)}` : ''}`
  if (status === null) return { estado: 'error', detalle: detalle('sin respuesta de contabilidad') }
  if (status >= 200 && status < 300) return { estado: 'enviado', detalle: null }
  if (status === 401) return { estado: 'error', detalle: detalle('401: contabilidad no acepta el secreto de rrhh (revisar configuración)') }
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status < 200 || (status >= 300 && status < 400)) return { estado: 'error', detalle: detalle(`HTTP ${status}`) }
  const motivo = status === 409 ? '409: ya existe un hecho con esa referencia y contenido distinto' : status === 403 ? '403: el origen «rrhh» no está autorizado en esa empresa' : `HTTP ${status}`
  return { estado: 'rechazado', detalle: detalle(motivo) }
}

const BASE_MS = 5 * 60_000
const TOPE_MS = 12 * 60 * 60_000
export const esperaTrasIntento = (n: number): number => Math.min(BASE_MS * 2 ** Math.max(0, n - 1), TOPE_MS)

export type Fila = { id: string; empresa_id: string; nomina_id: string; tipo: string; hecho: unknown; intentos: number; contabilidad_empresa_id: string }
export type ResumenEnvio = { configurado: boolean; enviados: number; rechazados: number; errores: number; aplazados: number }

export interface DepsEnvio {
  config: ConfigContabilidad | null
  leerCola(ahora: Date, limite: number): Promise<Fila[]>
  marcar(id: string, empresaId: string, v: { estado: Veredicto['estado']; detalle: string | null; intentos: number; proximoIntento: Date | null; ahora: Date }): Promise<void>
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>
  ahora(): Date
  limite?: number
  timeoutMs?: number
}

export async function enviarHechosNominas(d: DepsEnvio): Promise<ResumenEnvio> {
  const r: ResumenEnvio = { configurado: d.config !== null, enviados: 0, rechazados: 0, errores: 0, aplazados: 0 }
  if (!d.config) return r
  const sinSalir = new Set<string>() // nóminas cuyo hecho 'nomina' no se envió en esta pasada
  for (const h of await d.leerCola(d.ahora(), d.limite ?? 50)) {
    if (h.tipo === 'pago' && sinSalir.has(h.nomina_id)) { r.aplazados++; continue }
    let v: Veredicto
    try {
      const res = await d.fetch(`${d.config.url}/api/hechos`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(d.timeoutMs ?? 15_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${d.config.secreto}`, 'x-origen-app': APP_ORIGEN },
        body: JSON.stringify({ empresaId: h.contabilidad_empresa_id, hecho: h.hecho }),
      })
      v = clasificarRespuesta(res.status, await res.text().catch(() => ''))
    } catch (e) {
      v = clasificarRespuesta(null, e instanceof Error ? e.name : 'error')
    }
    const intentos = Number(h.intentos) + 1
    const ahora = d.ahora()
    await d.marcar(h.id, h.empresa_id, {
      estado: v.estado, detalle: v.detalle, intentos, ahora,
      proximoIntento: v.estado === 'error' ? new Date(ahora.getTime() + esperaTrasIntento(intentos)) : null,
    })
    if (v.estado === 'enviado') r.enviados++
    else { sinSalir.add(h.nomina_id); if (v.estado === 'rechazado') r.rechazados++; else r.errores++ }
  }
  return r
}
