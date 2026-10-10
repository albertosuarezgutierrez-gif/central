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
  /** `portal` = la pidió el cliente (retenida 48 h, hay que llamarle); `corredor` = como siempre. Ausente (asegura vieja) = corredor. */
  origen: 'corredor' | 'portal'
  /** Cuándo se liberó para firma. `null` = no liberada. */
  liberadaAt: string | null
  /** Solo si está RETENIDA: cuándo se libera sola (ISO). `null` = no retenida. */
  liberaSolaAt: string | null
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
  /** Firmada en el portal: hay justificante que mandar al cliente. Ausente (asegura vieja) = false. */
  firmaElectronica: boolean
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

/**
 * La cuenta atrás de una baja retenida: «se libera sola en 1 d 4 h» / «en 35 min» / «ya se puede firmar».
 * `null` si la fecha no se entiende (no se inventa un plazo).
 */
export function cuentaAtrasLiberacion(liberaSolaAt: string | null, ahora: Date): string | null {
  if (!liberaSolaAt) return null
  const t = Date.parse(liberaSolaAt)
  if (Number.isNaN(t)) return null
  const min = Math.ceil((t - ahora.getTime()) / 60_000)
  if (min <= 0) return 'ya se puede firmar'
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  if (d > 0) return `se libera sola en ${d} d${h ? ` ${h} h` : ''}`
  if (h > 0) return `se libera sola en ${h} h${m ? ` ${m} min` : ''}`
  return `se libera sola en ${m} min`
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
    origen: o.origen === 'portal' ? 'portal' : 'corredor',
    liberadaAt: texto(o.liberadaAt), liberaSolaAt: texto(o.liberaSolaAt),
    creada: texto(o.creada) ?? '', firmadaAt: texto(o.firmadaAt), firmaNota: texto(o.firmaNota),
    comunicadaAt: texto(o.comunicadaAt), confirmadaAt: texto(o.confirmadaAt),
    esperaEmision: o.esperaEmision === true,
    firmaElectronica: o.firmaElectronica === true,
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

export type ResultadoJustificante =
  | { ok: true; archivo: string; correo: string }
  | { ok: false; texto: string }

/** Una frase por desenlace del justificante. El correo que no salió NO se lee como «enviado». */
export function textoJustificante(archivo: string, correo: string): { ok: boolean; texto: string } {
  const doc = archivo === 'archivado' ? 'guardado en su área de clientes' : archivo === 'ya_estaba' ? 'ya estaba en su área de clientes' : 'NO se ha podido guardar en su área de clientes'
  const mail: Record<string, string> = {
    enviado: 'Justificante enviado al cliente por correo',
    sin_email: 'NO enviado: la ficha no tiene un correo utilizable',
    sin_portal: 'NO enviado: falta la dirección del portal (ASEGURA_PORTAL_URL)',
  }
  return { ok: correo === 'enviado' && archivo !== 'fallo', texto: `${mail[correo] ?? 'NO se sabe si el correo ha salido: mira la ficha antes de repetir'} · documento ${doc}.` }
}

export async function mandarJustificante(id: string, actor: string): Promise<ResultadoJustificante> {
  const b = base()
  if (!b) return { ok: false, texto: 'Puerto sin configurar (falta ASEGURA_OPERADOR_SECRET).' }
  try {
    const res = await fetch(`${b.url}/justificante`, {
      method: 'POST',
      headers: { ...(await cabecerasPuerto(b.secreto)), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, actor }),
      cache: 'no-store',
      // PDF + archivo + correo con los reintentos de Resend: con 30 s un envío lento que SÍ sale se leía como «no se sabe».
      signal: AbortSignal.timeout(90_000),
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 404 && j?.estado !== 'no_encontrada') return { ok: false, texto: 'asegura aún no tiene el justificante desplegado.' }
    if (j?.estado === 'no_encontrada') return { ok: false, texto: 'No existe ese expediente.' }
    if (j?.estado === 'sin_firma_electronica') return { ok: false, texto: 'No se firmó en el portal: no hay justificante electrónico que mandar.' }
    if (j?.estado !== 'hecho' || typeof j.archivo !== 'string' || typeof j.correo !== 'string') {
      return { ok: false, texto: 'NO se sabe si ha salido: no se ha podido hablar con asegura. Mira la ficha antes de repetir.' }
    }
    return { ok: true, archivo: j.archivo, correo: j.correo }
  } catch {
    return { ok: false, texto: 'NO se sabe si ha salido: no se ha podido hablar con asegura. Mira la ficha antes de repetir.' }
  }
}
