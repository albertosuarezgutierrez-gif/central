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
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secret}` },
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
