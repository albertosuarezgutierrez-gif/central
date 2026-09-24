// Expedientes de anulación (Fase 2 de ASegura OS, pieza 2-d): cliente del puerto de asegura
// (`/api/operador/anulaciones`) + lectura defensiva y la frase de cada desenlace (puras, con test).
//
// Las reglas (plazo del art. 22 LCS, sin firma no se comunica) viven en `@central/module-seguros`
// y las aplica asegura; aquí solo se pinta lo que contesta.

import type { EstadoAnulacion, MotivoAnulacion, TipoAnulacion } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

export type Anulacion = {
  id: string
  polizaId: string
  clienteId: string
  cliente: string | null
  numeroPoliza: string | null
  compania: string | null
  tipo: TipoAnulacion
  solicitadaPor: string
  motivo: MotivoAnulacion
  motivoTexto: string | null
  fechaEfecto: string
  estado: EstadoAnulacion
  creada: string
  firmadaAt: string | null
  firmaNota: string | null
  comunicadaAt: string | null
  confirmadaAt: string | null
  /** Firmada con un presupuesto cuya póliza nueva aún no consta emitida. Ausente (asegura vieja) = false. */
  esperaEmision: boolean
  siguiente: { texto: string; alerta: boolean } | null
}

export type LecturaAnulaciones = { estado: 'ok'; anulaciones: Anulacion[] } | { estado: 'sin_datos'; causa: string }

export type DesenlaceAnulacion = 'creada' | 'hecho' | 'no_encontrada' | 'ya_abierta' | 'no_permitida' | 'invalida' | 'error'

/** Una frase por desenlace. Ningún fallo puede leerse como «hecho». */
export function textoDesenlaceAnulacion(d: DesenlaceAnulacion, motivo?: string | null): string {
  switch (d) {
    case 'creada': return 'Expediente de anulación abierto.'
    case 'hecho': return 'Anotado.'
    case 'no_encontrada': return 'NO anotado: no existe esa póliza o ese expediente.'
    case 'ya_abierta': return 'NO anotado: esta póliza ya tiene un expediente de anulación abierto.'
    case 'no_permitida': return `NO anotado: ${motivo ?? 'desde el estado actual no se puede'}.`
    case 'invalida': return `NO anotado: ${motivo ?? 'faltan datos'}`
    default: return 'NO se sabe si se ha anotado: no se ha podido hablar con asegura. Recarga antes de repetir.'
  }
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

const ESTADOS: readonly string[] = ['solicitada', 'firmada', 'comunicada', 'confirmada', 'desistida']

export function leerAnulacion(v: unknown): Anulacion | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = texto(o.id), polizaId = texto(o.polizaId), clienteId = texto(o.clienteId), fechaEfecto = texto(o.fechaEfecto)
  const estado = texto(o.estado), tipo = texto(o.tipo), motivo = texto(o.motivo)
  if (!id || !polizaId || !clienteId || !fechaEfecto || !estado || !ESTADOS.includes(estado) || !tipo || !motivo) return null
  const s = o.siguiente as Record<string, unknown> | null | undefined
  return {
    id, polizaId, clienteId, fechaEfecto,
    estado: estado as EstadoAnulacion, tipo: tipo as TipoAnulacion, motivo: motivo as MotivoAnulacion,
    cliente: texto(o.cliente), numeroPoliza: texto(o.numeroPoliza), compania: texto(o.compania),
    solicitadaPor: texto(o.solicitadaPor) ?? 'desconocido', motivoTexto: texto(o.motivoTexto),
    creada: texto(o.creada) ?? '', firmadaAt: texto(o.firmadaAt), firmaNota: texto(o.firmaNota),
    comunicadaAt: texto(o.comunicadaAt), confirmadaAt: texto(o.confirmadaAt),
    esperaEmision: o.esperaEmision === true,
    siguiente: s && typeof s.texto === 'string' ? { texto: s.texto, alerta: s.alerta === true } : null,
  }
}

function base(): { url: string; secreto: string } | null {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return null
  return { url: `${(process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')}/api/operador/anulaciones`, secreto }
}

/** Con `polizaId`, los de esa póliza; sin él, los abiertos de la correduría. */
export async function leerAnulaciones(polizaId?: string): Promise<LecturaAnulaciones> {
  const b = base()
  if (!b) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  try {
    const url = polizaId ? `${b.url}?polizaId=${encodeURIComponent(polizaId)}` : b.url
    const res = await fetch(url, { headers: await cabecerasPuerto(b.secreto), cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/anulaciones desplegado' }
    if (!res.ok || j?.estado !== 'ok' || !Array.isArray(j.anulaciones)) return { estado: 'sin_datos', causa: `HTTP ${res.status}` }
    const lista = j.anulaciones.map(leerAnulacion)
    // Una fila ilegible no se esconde: si falta una, la lista no es la lista.
    if (lista.some(x => x === null)) return { estado: 'sin_datos', causa: 'asegura devolvió un expediente incompleto' }
    return { estado: 'ok', anulaciones: lista as Anulacion[] }
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura' }
  }
}

export async function escribirAnulacion(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>, actor: string): Promise<{ status: number; desenlace: DesenlaceAnulacion; motivo: string | null; advertencia: string | null }> {
  const b = base()
  if (!b) return { status: 503, desenlace: 'error', motivo: null, advertencia: null }
  try {
    const res = await fetch(b.url, {
      method: metodo,
      headers: { ...(await cabecerasPuerto(b.secreto)), 'Content-Type': 'application/json' },
      // El actor, el ÚLTIMO: lo pone la sesión y no se puede pisar desde el cuerpo.
      body: JSON.stringify({ ...cuerpo, actor }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : 'error'
    const conocidos: DesenlaceAnulacion[] = ['creada', 'hecho', 'no_encontrada', 'ya_abierta', 'no_permitida', 'invalida']
    return {
      status: res.status,
      desenlace: (conocidos as string[]).includes(estado) ? (estado as DesenlaceAnulacion) : 'error',
      motivo: texto(j?.motivo),
      advertencia: texto(j?.advertencia),
    }
  } catch {
    return { status: 504, desenlace: 'error', motivo: null, advertencia: null }
  }
}
