// Red diaria de la correduría (12/10/2026): lo que se queda parado en silencio.
//
// La caducidad de `aprobacion` es perezosa (solo al abrir «Hoy») y una baja firmada que no sale (sin carta,
// propuesta rechazada, Allianz…) no avisaba a nadie. asegura sirve ya clasificado el cuadro
// (`/api/operador/red-diaria`, tras aplicar la caducidad); aquí: cliente del puerto, intérprete PURO de su
// respuesta y el texto del mensaje de Telegram. Un solo mensaje, y SOLO si hay algo.
//
// 🚨 Un fallo de lectura NUNCA es «nada que avisar»: `interpretarRedDiaria` distingue `ok` de `error`.

import { cabecerasPuerto } from '../puerto-actor.ts'
import { URL_PLATAFORMA_POR_DEFECTO } from '../correduria-emision-tg.ts'

export type CausaAnulacion =
  | 'allianz_pue' | 'sin_carta_firma' | 'espera_emision' | 'enviada_sin_marcar'
  | 'envio_incierto' | 'esperando_ok' | 'propuesta_rechazada' | 'sin_propuesta'

export type AprobacionRed = { id: string; tipo: 'cliente' | 'compania'; origen: string; clienteId: string; cliente: string | null; caduca: string; urgente: boolean }
export type AnulacionRed = { anulacionId: string; clienteId: string; cliente: string | null; compania: string | null; numeroPoliza: string | null; firmadaAt: string; horas: number; causa: CausaAnulacion }
export type ReciboRed = { aprobacionId: string; clienteId: string; cliente: string | null; caduca: string; vencimiento: string | null }

export type RedDiaria = {
  porCaducar: AprobacionRed[]
  caducadas: AprobacionRed[]
  anulaciones: AnulacionRed[]
  recibos: ReciboRed[]
}

export type LecturaRedDiaria =
  | { estado: 'ok'; red: RedDiaria }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const CAUSAS: ReadonlySet<string> = new Set<CausaAnulacion>([
  'allianz_pue', 'sin_carta_firma', 'espera_emision', 'enviada_sin_marcar', 'envio_incierto', 'esperando_ok', 'propuesta_rechazada', 'sin_propuesta',
])

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const rec = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)

function leerAprobacion(v: unknown): AprobacionRed | null {
  const o = rec(v)
  const id = txt(o?.id), clienteId = txt(o?.clienteId), caduca = txt(o?.caduca)
  if (!o || !id || !clienteId || !caduca || (o.tipo !== 'cliente' && o.tipo !== 'compania')) return null
  return { id, tipo: o.tipo, origen: txt(o.origen) ?? '', clienteId, cliente: txt(o.cliente), caduca, urgente: o.urgente === true }
}

function leerAnulacion(v: unknown): AnulacionRed | null {
  const o = rec(v)
  const anulacionId = txt(o?.anulacionId), clienteId = txt(o?.clienteId), firmadaAt = txt(o?.firmadaAt)
  if (!o || !anulacionId || !clienteId || !firmadaAt || typeof o.horas !== 'number' || typeof o.causa !== 'string' || !CAUSAS.has(o.causa)) return null
  return { anulacionId, clienteId, cliente: txt(o.cliente), compania: txt(o.compania), numeroPoliza: txt(o.numeroPoliza), firmadaAt, horas: o.horas, causa: o.causa as CausaAnulacion }
}

function leerRecibo(v: unknown): ReciboRed | null {
  const o = rec(v)
  const aprobacionId = txt(o?.aprobacionId), clienteId = txt(o?.clienteId), caduca = txt(o?.caduca)
  if (!o || !aprobacionId || !clienteId || !caduca) return null
  return { aprobacionId, clienteId, cliente: txt(o.cliente), caduca, vencimiento: txt(o.vencimiento) }
}

function lista<T>(v: unknown, leer: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null
  const r = v.map(leer)
  return r.some((x) => x === null) ? null : (r as T[])
}

/** Una fila ilegible no se esconde: si falta una, el cuadro no es el cuadro. */
export function interpretarRedDiaria(status: number, json: unknown): LecturaRedDiaria {
  const j = rec(json)
  if (status === 404) return { estado: 'error', motivo: 'asegura aún no tiene /api/operador/red-diaria desplegado' }
  if (status !== 200 || j?.estado !== 'ok') {
    const causa = typeof j?.causa === 'string' ? ` (${j.causa})` : ''
    return { estado: 'error', motivo: `HTTP ${status}${causa}` }
  }
  const ap = rec(j.aprobaciones)
  const porCaducar = lista(ap?.porCaducar, leerAprobacion), caducadas = lista(ap?.caducadas, leerAprobacion)
  const anulaciones = lista(j.anulaciones, leerAnulacion), recibos = lista(j.recibos, leerRecibo)
  if (!porCaducar || !caducadas || !anulaciones || !recibos) return { estado: 'error', motivo: 'asegura devolvió un cuadro incompleto' }
  return { estado: 'ok', red: { porCaducar, caducadas, anulaciones, recibos } }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function leerRedDiaria(): Promise<LecturaRedDiaria> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/red-diaria`, {
      headers: { ...(await cabecerasPuerto(secret)) }, cache: 'no-store', signal: AbortSignal.timeout(25_000),
    })
    return interpretarRedDiaria(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

// ── Mensaje de Telegram ─────────────────────────────────────────────────────

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MAX_POR_BLOQUE = 8
/** Telegram corta en 4096; se deja margen. */
export const MAX_CARACTERES = 3900
const MAX_NOMBRE = 60
const TZ = 'Europe/Madrid'

export const ETIQUETA_CAUSA: Record<CausaAnulacion, string> = {
  sin_carta_firma: 'sin carta/firma: no sale sola, la comunicas tú',
  propuesta_rechazada: 'propuesta rechazada: no se vuelve a proponer',
  esperando_ok: 'esperando tu OK',
  sin_propuesta: 'sin propuesta',
  allianz_pue: 'Allianz: tramitar en el PUE',
  espera_emision: 'espera a que conste emitida la póliza nueva',
  enviada_sin_marcar: 'correo enviado pero sin marcar como comunicada',
  envio_incierto: 'envío a medias: confirma si salió',
}

const enlace = (clienteId: string, nombre: string | null, base: string): string =>
  `<a href="${esc(`${base.replace(/\/$/, '')}/correduria/cliente/${encodeURIComponent(clienteId)}`)}">${esc((nombre ?? '(sin nombre)').slice(0, MAX_NOMBRE))}</a>`

function cuando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const que = (a: AprobacionRed): string =>
  a.origen === 'recibo_devuelto' ? 'recibo devuelto' : a.origen === 'anulacion' ? 'baja a la compañía' : a.tipo === 'compania' ? 'correo a la compañía' : 'correo al cliente'

function bloque(titulo: string, lineas: string[], max: number): string[] {
  if (lineas.length === 0) return []
  const mas = lineas.length > max ? [`… y ${lineas.length - max} más · míralo en /correduria`] : []
  return [`<b>${titulo} · ${lineas.length}</b>`, ...lineas.slice(0, max), ...mas, '']
}

/** `null` = nada que avisar: no se manda «todo en orden». */
export function mensajeRedDiaria(red: RedDiaria, base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO): string | null {
  const lineasAp = (xs: AprobacionRed[]) => xs.map((a) => `• ${enlace(a.clienteId, a.cliente, base)} — ${esc(que(a))} · caduca ${cuando(a.caduca)}`)
  const lineasCad = (xs: AprobacionRed[]) => xs.map((a) => `• ${enlace(a.clienteId, a.cliente, base)} — ${esc(que(a))} · caducó ${cuando(a.caduca)}`)
  const lineasAn = red.anulaciones.map((n) => {
    const poliza = [n.compania, n.numeroPoliza ? `nº ${n.numeroPoliza}` : null].filter(Boolean).join(' ')
    return `• ${enlace(n.clienteId, n.cliente, base)}${poliza ? ` (${esc(poliza)})` : ''} — firmada hace ${Math.floor(n.horas / 24)} d · ${esc(ETIQUETA_CAUSA[n.causa])}`
  })
  const lineasRec = red.recibos.map((r) => `• ${enlace(r.clienteId, r.cliente, base)} — recibo${r.vencimiento ? ` de ${esc(r.vencimiento)}` : ''} sigue devuelto y su aviso caducó ${cuando(r.caduca)}`)
  const bloques: [string, string[]][] = [
    ['⏳ Caducan en menos de 24 h', lineasAp(red.porCaducar)],
    ['⌛ Caducadas en las últimas 24 h', lineasCad(red.caducadas)],
    ['📝 Bajas firmadas que no salen (+48 h)', lineasAn],
    ['💶 Recibos devueltos sin aviso vivo', lineasRec],
  ]
  if (bloques.every(([, l]) => l.length === 0)) return null
  const montar = (max: number): string =>
    ['🛟 <b>Red diaria de la correduría</b>', '', ...bloques.flatMap(([t, l]) => bloque(t, l, max)), 'Se resuelve en /correduria → Hoy.'].join('\n')
  // Se recortan LÍNEAS enteras (nunca a mitad de etiqueta) hasta que cabe en Telegram.
  for (let max = MAX_POR_BLOQUE; max >= 1; max--) {
    const m = montar(max)
    if (m.length <= MAX_CARACTERES) return m
  }
  const resumen = bloques.filter(([, l]) => l.length > 0).map(([t, l]) => `${t} · ${l.length}`)
  return ['🛟 <b>Red diaria de la correduría</b>', '', ...resumen, '', 'Demasiado para un mensaje: míralo en /correduria → Hoy.'].join('\n')
}
