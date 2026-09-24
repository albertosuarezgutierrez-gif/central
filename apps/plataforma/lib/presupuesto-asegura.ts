// El presupuesto al cliente, visto desde la pantalla de Alberto.
//
// Esta app NO toca la BD de la correduría: reenvía al puerto de asegura
// (`/api/operador/presupuesto`) con el secreto de operador. Mismo patrón que
// `duplicados-asegura.ts`.
//
// Dos partes:
//   1. Lo PURO (`interpretarPreparado`, `frasePresupuesto`), que importa el
//      client component sin arrastrar red ni envs. Con su test.
//   2. La RED, solo desde la ruta API.
//
// 🚨 Nada de esto manda un correo ni gasta un euro: prepara el presupuesto
// sobre una cotización YA PAGADA. El envío es el PR 3 del §6 de la spec.

import type { EstadoPresupuesto } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

export type OpcionPresupuesto = {
  orden: number
  compania: string
  producto: string
  primaEur: number
  /** `null` = el producto NO declara franquicia. Jamás «sin franquicia». */
  franquiciaEur: number | null
  firmeza: string
  papeles: string[]
  coberturaDistinta: boolean
}

export type PresupuestoPreparado = {
  id: string
  estado: EstadoPresupuesto
  venceEl: string
  /** 🚨 El precio no lo ha dado ninguna compañía: NO se puede enviar. */
  simulado: boolean
  /** `clasificada` · `sin_desglose` (la compañía no lo manda) · `sin_clasificar` (no sabemos leerlo). */
  lecturaActual: string
  motivoSinEquivalente: string | null
  avisoEscala: string | null
  opciones: OpcionPresupuesto[]
  preciosTotales: number
}

export type RespuestaPreparar =
  | { estado: 'ok'; presupuesto: PresupuestoPreparado; token: string }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string; detalle?: string }

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function leerOpcion(v: unknown): OpcionPresupuesto | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const orden = num(o.orden)
  const prima = num(o.primaEur)
  // Sin orden o sin prima no es una tarjeta: no se pinta un precio en blanco.
  if (orden === null || prima === null) return null
  return {
    orden,
    compania: cadena(o.compania) ?? 'Sin compañía',
    producto: cadena(o.producto) ?? 'Sin producto',
    primaEur: prima,
    // 🚨 `null` se conserva: la franquicia no declarada NO es 0.
    franquiciaEur: num(o.franquiciaEur),
    firmeza: cadena(o.firmeza) ?? 'estimado',
    papeles: Array.isArray(o.papeles) ? o.papeles.filter((p): p is string => typeof p === 'string') : [],
    coberturaDistinta: o.coberturaDistinta === true,
  }
}

/**
 * La respuesta del puerto → algo pintable, o un error CON motivo.
 *
 * Un cuerpo que no se entiende NO se convierte en «preparado sin opciones»:
 * eso enseñaría una pantalla vacía como si el presupuesto existiera.
 */
export function interpretarPreparado(status: number, json: unknown): RespuestaPreparar {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', detalle: 'Los dos ASEGURA_OPERADOR_SECRET no coinciden.' }
  }
  if (typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', detalle: `HTTP ${status}` }
  }
  const o = json as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado === 'error') {
    return {
      estado: 'error',
      motivo: cadena(o.motivo) ?? 'error',
      detalle: cadena(o.detalle) ?? cadena(o.causa) ?? undefined,
    }
  }
  if (o.estado !== 'ok') return { estado: 'error', motivo: 'respuesta_ilegible', detalle: `HTTP ${status}` }

  const p = o.presupuesto
  const token = cadena(o.token)
  if (typeof p !== 'object' || p === null || token === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', detalle: 'Falta el presupuesto o su enlace.' }
  }
  const q = p as Record<string, unknown>
  const id = cadena(q.id)
  const venceEl = cadena(q.venceEl)
  if (id === null || venceEl === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', detalle: 'El presupuesto llega sin id o sin caducidad.' }
  }
  const opciones = Array.isArray(q.opciones)
    ? q.opciones.map(leerOpcion).filter((x): x is OpcionPresupuesto => x !== null)
    : []
  if (opciones.length === 0) {
    return { estado: 'error', motivo: 'sin_opciones', detalle: 'No ha llegado ninguna opción con precio.' }
  }
  return {
    estado: 'ok',
    token,
    presupuesto: {
      id,
      estado: (cadena(q.estado) ?? 'borrador') as EstadoPresupuesto,
      venceEl,
      simulado: q.simulado === true,
      lecturaActual: cadena(q.lecturaActual) ?? 'sin_desglose',
      motivoSinEquivalente: cadena(q.motivoSinEquivalente),
      avisoEscala: cadena(q.avisoEscala),
      opciones,
      preciosTotales: num(q.preciosTotales) ?? opciones.length,
    },
  }
}

/**
 * Lo que la pantalla dice sobre el presupuesto recién preparado.
 *
 * 🚨 Tres avisos que NO se colapsan, porque se arreglan en sitios distintos:
 * un precio SIMULADO no se puede enviar nunca; «no puedo compararlo con lo que
 * tienes» es de la compañía (no manda el desglose) y es distinto de que no
 * sepamos leerlo; y `avisoEscala` dice que los niveles no son comparables entre
 * sí, que es justo lo que esta pantalla existe para no callar.
 */
export function frasePresupuesto(p: PresupuestoPreparado): string[] {
  const out: string[] = []
  if (p.simulado) {
    out.push(
      'Este precio es SIMULADO: no lo ha dado ninguna compañía. Sirve para ver la pantalla, ' +
        'pero no se puede enviar a nadie.',
    )
  }
  if (p.motivoSinEquivalente !== null) {
    out.push(
      p.lecturaActual === 'sin_desglose'
        ? 'No puedo compararlo con lo que tiene hoy: su póliza no trae el desglose de coberturas.'
        : p.lecturaActual === 'sin_clasificar'
          ? 'Su póliza sí trae coberturas, pero todavía no sé traducirlas a un nivel, así que no ' +
            'hay «la equivalente». No es que no haya nada parecido.'
          : 'Ninguna compañía ha dado un precio con su misma cobertura.',
    )
  }
  if (p.avisoEscala !== null) out.push(p.avisoEscala)
  if (p.opciones.some((o) => o.coberturaDistinta)) {
    out.push('La más barata NO tiene la misma cobertura que su póliza actual.')
  }
  if (p.opciones.every((o) => o.firmeza !== 'firme')) {
    out.push('Ningún precio está en firme: hay que confirmarlo con la compañía antes de contratar.')
  }
  return out
}

// ─── Red (solo desde la ruta API de plataforma) ──────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

async function puerto(init: RequestInit, query = ''): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/presupuesto${query}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function listarPresupuestosAsegura(q: { clienteId?: string; polizaId?: string }): Promise<Reenvio> {
  const p = new URLSearchParams()
  if (q.clienteId) p.set('clienteId', q.clienteId)
  if (q.polizaId) p.set('polizaId', q.polizaId)
  return puerto({ method: 'GET' }, `?${p.toString()}`)
}

/**
 * 🚨 El `actor` lo pone el SERVIDOR (el email de la sesión) y va el ÚLTIMO del
 * cuerpo: un cliente que mandara su propio `actor` no puede firmar el
 * presupuesto con otro nombre. Mismo patrón que `/api/correduria/partes`.
 */
export function prepararPresupuestoAsegura(cuerpo: Record<string, unknown>): Promise<Reenvio> {
  return puerto({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
}

export function retirarPresupuestoAsegura(cuerpo: Record<string, unknown>): Promise<Reenvio> {
  return puerto({
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
}

// ─── El aviso al cliente (PR 3) ──────────────────────────────────────────────

export type EstadoPresupuestoLista =
  | 'borrador' | 'enlazado' | 'enviado' | 'visto' | 'elegido' | 'aceptado' | 'emitido' | 'caducado' | 'retirado'

export type PresupuestoEnLista = {
  id: string
  estado: EstadoPresupuestoLista
  /** `null` si la versión de asegura desplegada no lo manda: entonces no se cruzan los datos para emitir. */
  clienteId: string | null
  creadoAt: string
  venceEl: string
  enviadoAt: string | null
  enlaceGeneradoAt: string | null
  vistoAt: string | null
  opciones: number
  desdeEur: number | null
  /** Exigencias y necesidades escritas. `null` = no constan (o asegura aún no las manda): no se puede avisar. */
  necesidades: string | null
}

/** Mientras no esté aceptado, retirado ni caducado, las necesidades se pueden escribir o corregir. */
export function necesidadesEditables(e: EstadoPresupuestoLista): boolean {
  return e === 'borrador' || e === 'enlazado' || e === 'enviado' || e === 'visto' || e === 'elegido'
}

const ESTADOS: readonly EstadoPresupuestoLista[] = ['borrador', 'enlazado', 'enviado', 'visto', 'elegido', 'aceptado', 'emitido', 'caducado', 'retirado']

/** Una fila ilegible NO se descarta: devuelve `null` y la lista entera se declara ilegible. */
export function leerPresupuestoEnLista(v: unknown): PresupuestoEnLista | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const s = (x: unknown) => (typeof x === 'string' && x !== '' ? x : null)
  const id = s(o.id), estado = s(o.estado), creadoAt = s(o.creadoAt), venceEl = s(o.venceEl)
  if (!id || !estado || !creadoAt || !venceEl || !ESTADOS.includes(estado as EstadoPresupuestoLista)) return null
  return {
    id, estado: estado as EstadoPresupuestoLista, clienteId: s(o.clienteId), creadoAt, venceEl,
    enviadoAt: s(o.enviadoAt), enlaceGeneradoAt: s(o.enlaceGeneradoAt), vistoAt: s(o.vistoAt),
    opciones: typeof o.opciones === 'number' ? o.opciones : 0,
    desdeEur: typeof o.desdeEur === 'number' ? o.desdeEur : null,
    necesidades: s(o.necesidades),
  }
}

/**
 * Qué se puede hacer con él. `enlazado` NO es `enviado`: se abrió WhatsApp y no consta que
 * saliera, así que se ofrece «Ya lo he mandado» y se deja volver a avisar.
 */
export function accionesPresupuesto(e: EstadoPresupuestoLista): { avisar: boolean; confirmarWhatsapp: boolean; retirar: boolean; reenvio: boolean; emitir: boolean } {
  const avisar = e === 'borrador' || e === 'enlazado' || e === 'enviado' || e === 'visto'
  return {
    avisar,
    reenvio: e === 'enviado' || e === 'visto',
    confirmarWhatsapp: e === 'enlazado',
    // Aceptado = firmado por el cliente: falta que la compañía emita. Marcarlo desbloquea la anulación.
    emitir: e === 'aceptado',
    retirar: e !== 'retirado' && e !== 'emitido',
  }
}

export const ROTULO_ESTADO_PRESUPUESTO: Record<EstadoPresupuestoLista, string> = {
  borrador: 'Preparado, sin enviar',
  enlazado: 'WhatsApp abierto · no consta que saliera',
  enviado: 'Enviado · no consta que lo haya abierto',
  visto: 'Lo ha abierto',
  elegido: 'Ha elegido una opción',
  aceptado: 'Aceptado y firmado · falta emitir (no hay cobertura aún)',
  emitido: 'Emitido',
  caducado: 'Caducado',
  retirado: 'Retirado',
}

/** La frase del desenlace de «Avisar». Ningún fallo se lee como «ha salido». */
export function textoAviso(status: number, j: unknown): { ok: boolean; texto: string; whatsapp?: string } {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (status === 200 && o.estado === 'enviado' && typeof o.email === 'string') return { ok: true, texto: `Enviado a ${o.email}.` }
  if (status === 200 && o.estado === 'enlace' && typeof o.whatsapp === 'string') {
    return { ok: true, texto: 'Se ha abierto WhatsApp con el mensaje: elige su chat y envíalo. Luego pulsa «Ya lo he mandado».', whatsapp: o.whatsapp }
  }
  if (status === 200 && o.estado === 'confirmado') return { ok: true, texto: 'Anotado como enviado por WhatsApp.' }
  if (status === 200 && o.estado === 'emitido') return { ok: true, texto: 'Anotado como emitido. Si firmó la anulación de su póliza anterior, ya te espera en «Hoy · Esperan tu OK».' }
  if (typeof o.detalle === 'string') return { ok: false, texto: `NO enviado: ${o.detalle}` }
  return { ok: false, texto: 'NO se sabe si ha salido: no se ha podido hablar con asegura. Recarga antes de repetir.' }
}

/**
 * La línea «datos para emitir» de un presupuesto (§4bis), a partir de lo que manda asegura para su
 * cliente. Tres salidas que no se colapsan: no se pudo mirar · completos · lo que falta y quién lo pone.
 * 🚨 Un cifrado que no abre NO es «falta»: se dice aparte, porque se arregla en Vercel, no llamando.
 */
const ESTADOS_DATO: readonly string[] = ['ok', 'falta', 'en_revision', 'no_legible']
const APORTA_DATO: readonly string[] = ['cliente_datos', 'cliente_dni', 'corredor']

export function fraseDatosEmision(v: unknown): { texto: string; alerta: boolean } {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  const datos = Array.isArray(o?.datos) ? (o!.datos as unknown[]) : null
  if (!datos) return { texto: 'Datos para emitir: no se han podido comprobar.', alerta: false }
  const filas = datos.flatMap((d) => {
    const x = typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : {}
    return typeof x.etiqueta === 'string' && ESTADOS_DATO.includes(x.estado as string) && APORTA_DATO.includes(x.aporta as string)
      ? [{ etiqueta: x.etiqueta.replace(/\s*\(.*\)$/, ''), estado: x.estado, aporta: x.aporta }] : []
  })
  // Una lista vacía o con un estado que no conocemos NO es «completos»: se dice que no se pudo comprobar.
  if (filas.length === 0 || filas.length !== datos.length) return { texto: 'Datos para emitir: no se han podido comprobar.', alerta: false }
  const de = (f: (x: (typeof filas)[number]) => boolean) => filas.filter(f).map((x) => x.etiqueta.toLowerCase())
  const cliente = de((x) => x.estado === 'falta' && x.aporta !== 'corredor')
  const corredor = de((x) => x.estado === 'falta' && x.aporta === 'corredor')
  const revision = de((x) => x.estado === 'en_revision')
  const ilegibles = filas.filter((x) => x.estado === 'no_legible').length
  const partes: string[] = []
  if (cliente.length) partes.push(`falta ${cliente.join(', ')} (se lo pide su portal)`)
  if (revision.length) partes.push(`${revision.join(' y ')}: ha subido su DNI, revísalo en Documentos`)
  if (corredor.length) partes.push(`${corredor.join(', ')}: la pones tú al emitir`)
  if (ilegibles) partes.push(`⚠ ${ilegibles} dato${ilegibles === 1 ? '' : 's'} no abre${ilegibles === 1 ? '' : 'n'}: revisa la clave PII de asegura`)
  if (!partes.length) return { texto: 'Datos para emitir: completos ✓', alerta: false }
  return { texto: `Datos para emitir: ${partes.join(' · ')}.`, alerta: ilegibles > 0 || cliente.length > 0 }
}
