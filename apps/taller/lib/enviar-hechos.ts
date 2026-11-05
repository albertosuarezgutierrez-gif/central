/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Envío del outbox a contabilidad (`POST {CONTABILIDAD_URL}/api/hechos`). Lo llama el cron; NUNCA se hace HTTP dentro de una transacción
// que escribe facturas: se LEE la cola en una transacción corta, se envía fuera, y cada resultado se anota en otra corta.
//
// Clasificación de la respuesta (contrato de apps/contabilidad/lib/puerto-hechos.ts):
//   2xx (201 asentado · 200 duplicado idempotente · 202 pendiente de regla)  → enviado
//   401/408/425/429, 5xx, 3xx, red/timeout                                     → error  (se reintenta con espera exponencial)
//   resto de 4xx (400 forma · 403 origen no autorizado · 409 conflicto · 422)  → rechazado (NO se reintenta; visible en el panel)
// Sin CONTABILIDAD_URL o sin secreto, o taller sin empresa vinculada: NO se envía y queda pendiente (no es un error).
import { requireSecret } from '@central/core-identity'

export const ENV_URL = 'CONTABILIDAD_URL'
export const ENV_SECRETO = 'CONTABILIDAD_HECHOS_SECRET_TALLER'
export const APP_ORIGEN = 'taller'

export type ConfigContabilidad = { url: string; secreto: string }

/** null = sin configurar (no envía). La URL debe ser https (o http en localhost): el Bearer no viaja en claro. */
export function leerConfigContabilidad(env: Record<string, string | undefined> = process.env, secretoDe: (n: string) => string = requireSecret): ConfigContabilidad | null {
  const crudo = (env[ENV_URL] ?? '').trim()
  if (!crudo) return null
  let u: URL
  try { u = new URL(crudo) } catch { return null }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  let secreto: string
  try { secreto = secretoDe(ENV_SECRETO) } catch { return null }
  if (!secreto) return null
  return { url: u.origin, secreto }
}

export type Veredicto = { estado: 'enviado' | 'rechazado' | 'error'; detalle: string | null }

/** `status` null = no hubo respuesta (red caída, timeout). */
export function clasificarRespuesta(status: number | null, cuerpo = ''): Veredicto {
  const detalle = (txt: string) => `${txt}${cuerpo ? `: ${cuerpo.slice(0, 300)}` : ''}`
  if (status === null) return { estado: 'error', detalle: detalle('sin respuesta de contabilidad') }
  if (status >= 200 && status < 300) return { estado: 'enviado', detalle: null }
  if (status === 401) return { estado: 'error', detalle: detalle('401: contabilidad no acepta el secreto del taller (revisar configuración)') }
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status < 200 || status >= 300 && status < 400) {
    return { estado: 'error', detalle: detalle(`HTTP ${status}`) }
  }
  const motivo = status === 409 ? '409: ya existe un hecho con esa referencia y contenido distinto' : status === 403 ? '403: el origen «taller» no está autorizado en esa empresa' : `HTTP ${status}`
  return { estado: 'rechazado', detalle: detalle(motivo) }
}

const BASE_MS = 5 * 60_000
const TOPE_MS = 12 * 60 * 60_000
/** Espera tras el intento n-ésimo (n ≥ 1): 5 min, 10, 20… con tope de 12 h. */
export const esperaTrasIntento = (n: number): number => Math.min(BASE_MS * 2 ** Math.max(0, n - 1), TOPE_MS)

export type ResumenEnvio = {
  configurado: boolean; talleres: number; sinEmpresa: number; enviados: number; rechazados: number; errores: number; talleresConError: number
}

export interface DepsEnvio {
  config: ConfigContabilidad | null
  talleres(): Promise<string[]>
  conTaller<R>(tallerId: string, fn: (tx: any) => Promise<R>): Promise<R>
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>
  ahora(): Date
  /** Máximo de hechos por taller y ejecución (defecto 50). */
  limite?: number
  timeoutMs?: number
}

async function enviarUno(d: DepsEnvio, config: ConfigContabilidad, empresaId: string, hecho: unknown): Promise<Veredicto> {
  try {
    const r = await d.fetch(`${config.url}/api/hechos`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(d.timeoutMs ?? 15_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.secreto}`, 'x-origen-app': APP_ORIGEN },
      body: JSON.stringify({ empresaId, hecho }),
    })
    return clasificarRespuesta(r.status, await r.text().catch(() => ''))
  } catch (e) {
    return clasificarRespuesta(null, e instanceof Error ? e.name : 'error')
  }
}

export async function enviarHechos(d: DepsEnvio): Promise<ResumenEnvio> {
  const r: ResumenEnvio = { configurado: d.config !== null, talleres: 0, sinEmpresa: 0, enviados: 0, rechazados: 0, errores: 0, talleresConError: 0 }
  // Sin configuración: ni se lista la cola. Todo queda pendiente tal cual.
  if (!d.config) return r
  const config = d.config
  const limite = d.limite ?? 50
  for (const tallerId of await d.talleres()) {
    r.talleres++
    try {
      const lectura = await d.conTaller(tallerId, async (tx) => {
        const t = await tx.taller.findFirst({ where: { id: tallerId } })
        const empresaId: string | null = t?.contabilidadEmpresaId ?? null
        if (!empresaId) return { empresaId, cola: [] as any[], ventasSinEnviar: new Set<string>() }
        const todas: any[] = await tx.hechoPendiente.findMany({ where: { tallerId, estado: { in: ['pendiente', 'error'] } }, orderBy: { creadoEn: 'asc' }, take: 500 })
        const ahora = d.ahora().getTime()
        return {
          empresaId,
          cola: todas.filter((h) => !h.proximoIntento || new Date(h.proximoIntento).getTime() <= ahora).slice(0, limite),
          // Un cobro no viaja antes que su venta: si la venta de esa factura sigue sin enviarse, el cobro espera.
          ventasSinEnviar: new Set<string>(todas.filter((h) => h.tipo === 'venta' && h.facturaId).map((h) => h.facturaId as string)),
        }
      })
      if (!lectura.empresaId) { r.sinEmpresa++; continue }
      const ventasSinEnviar = lectura.ventasSinEnviar
      for (const h of lectura.cola) {
        if (h.tipo === 'cobro' && h.facturaId && ventasSinEnviar.has(h.facturaId)) continue
        const v = await enviarUno(d, config, lectura.empresaId, h.hecho)
        const intentos = Number(h.intentos) + 1
        const ahora = d.ahora()
        await d.conTaller(tallerId, (tx) => tx.hechoPendiente.update({
          where: { id: h.id },
          data: {
            estado: v.estado, intentos, ultimoError: v.detalle, actualizadoEn: ahora,
            proximoIntento: v.estado === 'error' ? new Date(ahora.getTime() + esperaTrasIntento(intentos)) : null,
            enviadoEn: v.estado === 'enviado' ? ahora : null,
          },
        }))
        if (v.estado === 'enviado') { r.enviados++; if (h.tipo === 'venta' && h.facturaId) ventasSinEnviar.delete(h.facturaId) }
        else if (v.estado === 'rechazado') r.rechazados++
        else r.errores++
      }
    } catch (e) {
      r.talleresConError++
      console.error('[enviar-hechos] taller con error', tallerId, e instanceof Error ? e.name : e)
    }
  }
  return r
}
