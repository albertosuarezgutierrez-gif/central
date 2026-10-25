// Cola «Patrimonio» de /correduria → Gestión (P16, 26/10/2026): cliente del puerto de asegura + intérprete PURO.
// Spec: docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md §3.5.
//
// 🚨 Tres estados, nunca colapsados: `apagado` (el motor no corre: la pantalla lo DICE, no pinta «0 señales»), `ok` (lista,
// puede estar vacía de verdad) y `error` (no se pudo leer ≠ «no hay»). Esta cola no envía nada a nadie.
import { cabecerasPuerto } from '../puerto-actor.ts'

export type PermisoSenal = 'pedido' | 'consentido' | 'sin_permiso'

export type SenalPatrimonio = {
  id: string
  tipo: string
  rotulo: string
  ramo: string
  prioridad: 'alta' | 'media' | 'baja'
  clienteId: string
  cliente: string
  inmueble: string | null
  cifras: Record<string, string | number | boolean | null>
  permiso: PermisoSenal
  desde: string
}

export type LecturaOportunidadesPatrimonio =
  | { estado: 'ok'; senales: SenalPatrimonio[] }
  | { estado: 'apagado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

export function leerSenal(v: unknown): SenalPatrimonio | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id), tipo = cadena(o.tipo), rotulo = cadena(o.rotulo), ramo = cadena(o.ramo)
  const clienteId = cadena(o.clienteId), cliente = cadena(o.cliente), desde = cadena(o.desde)
  const prioridad = o.prioridad === 'alta' || o.prioridad === 'media' || o.prioridad === 'baja' ? o.prioridad : null
  // `opuesto` NO se pinta nunca (asegura ya no lo manda): si llegara, la fila se considera ilegible, no se enseña.
  const permiso = o.permiso === 'pedido' || o.permiso === 'consentido' || o.permiso === 'sin_permiso' ? o.permiso : null
  if (!id || !tipo || !rotulo || !ramo || !clienteId || !cliente || !desde || !prioridad || !permiso) return null
  const cifras: SenalPatrimonio['cifras'] = {}
  if (typeof o.cifras === 'object' && o.cifras !== null && !Array.isArray(o.cifras)) {
    for (const [k, x] of Object.entries(o.cifras as Record<string, unknown>)) {
      if (x === null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') cifras[k] = x
    }
  }
  return { id, tipo, rotulo, ramo, prioridad, clienteId, cliente, inmueble: cadena(o.inmueble), cifras, permiso, desde }
}

/** Una fila ilegible no se esconde: si falta una, la lista no es la lista. */
export function interpretarOportunidadesPatrimonio(status: number, json: unknown): LecturaOportunidadesPatrimonio {
  const j = (json ?? null) as Record<string, unknown> | null
  if (status === 404) return { estado: 'error', motivo: 'asegura aún no tiene /api/operador/oportunidades-patrimonio desplegado' }
  if (status === 200 && j?.estado === 'apagado') return { estado: 'apagado' }
  if (status === 200 && j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status !== 200 || j?.estado !== 'ok' || !Array.isArray(j.senales)) {
    const causa = typeof j?.causa === 'string' ? ` (${j.causa})` : ''
    return { estado: 'error', motivo: `HTTP ${status}${causa}` }
  }
  const senales = j.senales.map(leerSenal)
  if (senales.some((s) => s === null)) return { estado: 'error', motivo: 'asegura devolvió una señal incompleta' }
  return { estado: 'ok', senales: senales as SenalPatrimonio[] }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function senalesPatrimonio(): Promise<LecturaOportunidadesPatrimonio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/oportunidades-patrimonio`, {
      headers: { ...(await cabecerasPuerto(secret)) }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    })
    return interpretarOportunidadesPatrimonio(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

export type ResultadoDescartar = { status: number; json: unknown }

/** El actor lo pone la sesión (nunca el cuerpo del navegador). */
export async function descartarSenalPatrimonio(id: string, motivo: string, actor: string): Promise<ResultadoDescartar> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/oportunidades-patrimonio`, {
      method: 'POST',
      headers: { ...(await cabecerasPuerto(secret)), 'content-type': 'application/json' },
      body: JSON.stringify({ id, accion: 'descartar', motivo, actor }),
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 504, json: { estado: 'error', motivo: 'no se pudo llegar a asegura: no se sabe si quedó descartada' } }
  }
}

/** Texto llano de la cifra más útil de una señal (sin inventar: lo que falta, se calla). */
export function cifraLegible(s: Pick<SenalPatrimonio, 'tipo' | 'cifras'>): string | null {
  const c = s.cifras
  if (s.tipo === 'infraseguro' && typeof c.ratio === 'number') return `capital al ${Math.round(c.ratio * 100)} % del valor estimado`
  if (s.tipo === 'poliza_externa_por_vencer' && typeof c.dias === 'number') {
    return c.dias === 0 ? 'vence hoy' : c.dias === 1 ? 'vence mañana' : `vence en ${c.dias} días`
  }
  return null
}

export const ROTULO_PERMISO: Record<PermisoSenal, string> = {
  pedido: 'Lo ha pedido',
  consentido: 'Consiente',
  sin_permiso: 'Sin permiso: solo si te llama o en su renovación',
}
