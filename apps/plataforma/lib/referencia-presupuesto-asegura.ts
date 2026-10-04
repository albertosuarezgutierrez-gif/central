// Buscar un presupuesto por su REFERENCIA propia (`AS-26-0042`) desde el buscador principal de
// `/correduria` (30/09/2026). Plataforma no toca la BD de la correduría: pregunta al puerto de
// asegura (`GET /api/operador/presupuesto/referencia`).
//
// Dos partes: lo PURO (`interpretarReferencia`, `enlaceEmision`, `lineaOpcion`), que importa el
// client component sin red ni envs, con su test; y la RED, solo desde la ruta API.

import {
  ROTULO_ESTADO_REFERENCIA,
  normalizarReferencia,
  type EstadoReferencia,
} from '@central/module-seguros/referencia-presupuesto'
import { cabecerasPuerto } from './puerto-actor.ts'

export type OpcionReferencia = {
  id: string
  compania: string
  producto: string
  modalidad: string | null
  categoria: string | null
  /** `null` = no se pudo leer: se pinta «—», nunca 0. */
  primaEur: number | null
  /** Fila de `tarificacion_precios` de la que sale: la IDENTIDAD del precio al emitir. `null` = no consta. */
  precioId: string | null
}

export type PresupuestoReferencia = {
  id: string
  referencia: string
  clienteId: string
  cliente: string
  ramo: string
  polizaId: string | null
  tarificacionId: string
  /** `null` = la tarificación no cuelga de ninguna oportunidad (regla 9: desde ahí no se emite). */
  oportunidadId: string | null
  estado: EstadoReferencia
  rotuloEstado: string
  emitible: boolean
  venceEl: string
  polizaEmitidaId: string | null
  /** SOLO las opciones que van en el documento enviado. */
  opciones: OpcionReferencia[]
}

/**
 * - `no_aplica`: lo tecleado no tiene forma de referencia (no se ha preguntado nada).
 * - `no_encontrado`: se ha mirado y esa referencia NO existe en la correduría.
 * - `error`: NO se ha podido mirar. Jamás se pinta como «no existe».
 */
export type BusquedaReferencia =
  | { estado: 'no_aplica' }
  | { estado: 'no_encontrado'; referencia: string }
  | { estado: 'error'; referencia: string; motivo: string }
  | { estado: 'ok'; presupuesto: PresupuestoReferencia }

const ESTADOS = Object.keys(ROTULO_ESTADO_REFERENCIA) as EstadoReferencia[]

function cad(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

function leerOpcion(v: unknown): OpcionReferencia | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cad(o.id), compania = cad(o.compania)
  if (!id || !compania) return null
  return { id, compania, producto: cad(o.producto) ?? '', modalidad: cad(o.modalidad), categoria: cad(o.categoria), primaEur: num(o.primaEur), precioId: cad(o.precioId) }
}

/** PURO. La respuesta del puerto → algo pintable. Lo que no se entiende es `error`, nunca «no existe». */
export function interpretarReferencia(q: string, status: number | null, json: unknown): BusquedaReferencia {
  const referencia = normalizarReferencia(q)
  if (referencia === null) return { estado: 'no_aplica' }
  const error = (motivo: string): BusquedaReferencia => ({ estado: 'error', referencia, motivo })
  if (status === null) return error('no se ha podido hablar con asegura')
  if (status === 401 || status === 403) return error('los dos ASEGURA_OPERADOR_SECRET no coinciden')
  if (typeof json !== 'object' || json === null) return error(`respuesta ilegible (HTTP ${status})`)
  const o = json as Record<string, unknown>
  if (o.estado === 'sin_configurar') return error('asegura no está configurada')
  if (o.estado === 'no_encontrado') return { estado: 'no_encontrado', referencia }
  if (o.estado !== 'ok' || typeof o.presupuesto !== 'object' || o.presupuesto === null) {
    return error(cad(o.causa) ?? cad(o.motivo) ?? `respuesta ilegible (HTTP ${status})`)
  }
  const p = o.presupuesto as Record<string, unknown>
  const id = cad(p.id), clienteId = cad(p.clienteId), tarificacionId = cad(p.tarificacionId), venceEl = cad(p.venceEl)
  const estado = cad(p.estado) as EstadoReferencia | null
  if (!id || !clienteId || !tarificacionId || !venceEl || !estado || !ESTADOS.includes(estado) || !Array.isArray(p.opciones)) {
    return error('respuesta ilegible')
  }
  const opciones = p.opciones.map(leerOpcion)
  // Una opción ilegible NO se descarta en silencio: el documento enviado dejaría de ser el que fue.
  if (opciones.some((x) => x === null)) return error('una opción del documento no se ha podido leer')
  return {
    estado: 'ok',
    presupuesto: {
      id,
      referencia: cad(p.referencia) ?? referencia,
      clienteId,
      cliente: cad(p.cliente) ?? 'Cliente sin nombre',
      ramo: cad(p.ramo) ?? '',
      polizaId: cad(p.polizaId),
      tarificacionId,
      oportunidadId: cad(p.oportunidadId),
      estado,
      rotuloEstado: ROTULO_ESTADO_REFERENCIA[estado],
      // Fallo seguro: solo se ofrece emitir si asegura lo dice Y el estado lo admite.
      emitible: p.emitible === true && estado !== 'caducado' && estado !== 'retirado' && estado !== 'emitido',
      venceEl,
      polizaEmitidaId: cad(p.polizaEmitidaId),
      opciones: opciones as OpcionReferencia[],
    },
  }
}

export type EnlaceEmision =
  /** La pantalla que recupera ESA cotización guardada (gratis) y emite con el panel de siempre. */
  | { tipo: 'emitir'; href: string; texto: string }
  /** La pantalla del riesgo: se emite desde su fila P1…Pn. */
  | { tipo: 'riesgo'; href: string; texto: string }
  /** Sin oportunidad enlazada no hay pantalla que la emita (regla 9): la ficha, y se dice. */
  | { tipo: 'ficha'; href: string; texto: string }

/**
 * PURO. A dónde se va a emitir desde la referencia. NO se reimplementa la emisión: se abre la
 * pantalla EXISTENTE que ya emite esa tarificación, con su coste y sus confirmaciones.
 *
 * - auto/moto con oportunidad → la pantalla de pedir precio como VARIANTE de ese riesgo con
 *   `?tarificacion=` (misma ruta que `rutaVariante` de la pantalla del riesgo): recupera la
 *   cotización guardada SIN volver a pagar 0,50€.
 * - otro ramo con oportunidad → la pantalla del riesgo.
 * - sin oportunidad → la ficha del cliente, diciendo por qué no se puede emitir desde aquí.
 */
export function enlaceEmision(p: Pick<PresupuestoReferencia, 'ramo' | 'clienteId' | 'oportunidadId' | 'tarificacionId'>): EnlaceEmision {
  if (p.oportunidadId && (p.ramo === 'auto' || p.ramo === 'moto')) {
    const q = new URLSearchParams({ oportunidad: p.oportunidadId, tarificacion: p.tarificacionId })
    return { tipo: 'emitir', href: `/correduria/cliente/${encodeURIComponent(p.clienteId)}/${p.ramo}-nuevo?${q.toString()}`, texto: 'Verificar datos y emitir' }
  }
  if (p.oportunidadId) {
    return { tipo: 'riesgo', href: `/correduria/oportunidad/${encodeURIComponent(p.oportunidadId)}`, texto: 'Ir al riesgo para emitir' }
  }
  return { tipo: 'ficha', href: `/correduria/cliente/${encodeURIComponent(p.clienteId)}`, texto: 'Abrir la ficha del cliente' }
}

/** PURO. «Reale · Reale Terceros Ampliado» (la modalidad es lo que identifica el precio que se emite). */
export function lineaOpcion(o: OpcionReferencia): string {
  const detalle = o.modalidad ?? o.categoria ?? o.producto
  return detalle && detalle !== o.compania ? `${o.compania} · ${detalle}` : o.compania
}

// ─── Red (solo desde la ruta API) ─────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

/** Solo pregunta si `q` tiene forma de referencia. Nunca lanza. */
export async function buscarReferenciaAsegura(q: string): Promise<BusquedaReferencia> {
  const referencia = normalizarReferencia(q)
  if (referencia === null) return { estado: 'no_aplica' }
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'error', referencia, motivo: 'falta ASEGURA_OPERADOR_SECRET' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/presupuesto/referencia?q=${encodeURIComponent(referencia)}`, {
      headers: await cabecerasPuerto(secret),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return interpretarReferencia(q, res.status, await res.json().catch(() => null))
  } catch {
    return interpretarReferencia(q, null, null)
  }
}
