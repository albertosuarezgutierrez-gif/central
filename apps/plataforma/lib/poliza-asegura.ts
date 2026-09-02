// La ficha de UNA póliza, leída por el puerto de central-asegura. Misma
// disciplina que `ficha-asegura.ts`: interpretación PURA, cuatro estados, y
// cada bloque con su propio «no se sabe».

import {
  leerIntervinientes, leerObjeto, leerPago, leerRecibos, leerRetarificacion,
  type IntervinienteFicha, type ObjetoFicha, type PagoFicha, type RecibosPoliza, type MotivoFicha,
} from './ficha-asegura.ts'
import { leerSiniestros, type SiniestroCartera } from './siniestros-asegura.ts'
import type { DocumentoResumen, Retarificabilidad } from '@central/module-seguros'
import { leerDocumentos } from './documentos-asegura.ts'
import type { DetalleCobertura } from '@central/module-seguros'

export type CoberturaFicha = {
  orden: number | null
  codigo: string | null
  descripcion: string | null
  capital: string | null
  descripcionCapital: string | null
  franquicia: string | null
  desde: string | null
  hasta: string | null
  /** Solo si el puerto los manda (asegura desplegado con esta versión): la UI los trata como opcionales. */
  modalidad?: string | null
  detalle?: DetalleCobertura | null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Copia defensiva del detalle que manda el puerto: cualquier forma rara degrada a null, nunca a un límite inventado. */
function leerDetalleCobertura(v: unknown): DetalleCobertura | null {
  if (typeof v !== 'object' || v === null) return null
  const d = v as Record<string, unknown>
  const limites = Array.isArray(d.limites)
    ? d.limites.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null).map((l) => ({
        clase: cadena(l.clase), descripcion: cadena(l.descripcion), minimo: num(l.minimo), maximo: num(l.maximo),
      }))
    : []
  const franquicias = Array.isArray(d.franquicias)
    ? d.franquicias.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null).map((f) => ({
        clase: cadena(f.clase), porcentaje: num(f.porcentaje), minimo: num(f.minimo), maximo: num(f.maximo),
      }))
    : []
  const p = typeof d.prima === 'object' && d.prima !== null ? (d.prima as Record<string, unknown>) : null
  const prima = p ? { neta: num(p.neta), total: num(p.total) } : null
  if (limites.length === 0 && franquicias.length === 0 && !prima) return null
  return { limites, franquicias, prima }
}

export type ReciboFicha = {
  id: string
  situacion: string
  importe: number | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  formaPago: string | null
}

export type Poliza = {
  id: string
  cliente: { id: string; nombre: string }
  tipo: string
  aseguradora: string
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  idPolizaEntidad: string | null
  ramoDgs: string | null
  estado: string
  situacion: string | null
  origen: string
  viva: boolean
  fechaEfectoInicial: string | null
  fechaInicio: string | null
  fechaVencimiento: string | null
  prima: number | null
  primaAnual: number | null
  primaBruta: number | null
  primaMensual: number | null
  objeto: ObjetoFicha | null
  /** `null` = no hay gemela O asegura no manda el campo: la UI no afirma que no exista. */
  gemela: { polizaId: string; clienteId: string; importRef: string; objeto: ObjetoFicha | null; fechaVencimiento: string | null } | null
  gemelaInformada: boolean
  coberturas: CoberturaFicha[]
  recibos: RecibosPoliza | null
  listaRecibos: ReciboFicha[]
  /** `null` = asegura no manda la lista (no es «sin siniestros», que es `[]`). */
  siniestros: SiniestroCartera[] | null
  intervinientes: IntervinienteFicha[] | null
  /** `null` = no se pudo contar. `0` = se contó y no hay. */
  documentos: number | null
  /** La lista con estados. `null` = asegura no la informa o no se pudo. */
  listaDocumentos: DocumentoResumen[] | null
  pago: PagoFicha | null
  retarificable: boolean
  /** Ramo/motivo/fuente del veredicto. `null` = asegura (versión vieja) no lo manda. */
  retarificacion: Retarificabilidad | null
}

export type RespuestaPoliza =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoFicha }
  | { estado: 'no_encontrado' }
  | { estado: 'ok'; poliza: Poliza }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

export function interpretarPoliza(status: number, json: unknown): RespuestaPoliza {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status === 404) return { estado: 'no_encontrado' }
  if (status !== 200 || typeof json !== 'object' || json === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || typeof r.poliza !== 'object' || r.poliza === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const p = r.poliza as Record<string, unknown>
  const c = (typeof p.cliente === 'object' && p.cliente !== null ? p.cliente : {}) as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.tipo !== 'string' || typeof p.aseguradora !== 'string' || typeof c.id !== 'string') {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  const coberturas: CoberturaFicha[] = []
  if (Array.isArray(p.coberturas)) {
    for (const fila of p.coberturas) {
      if (typeof fila !== 'object' || fila === null) continue
      const o = fila as Record<string, unknown>
      const cob: CoberturaFicha = {
        orden: entero(o.orden), codigo: cadena(o.codigo), descripcion: cadena(o.descripcion),
        capital: cadena(o.capital), descripcionCapital: cadena(o.descripcionCapital), franquicia: cadena(o.franquicia),
        desde: cadena(o.desde), hasta: cadena(o.hasta),
      }
      if ('modalidad' in o) cob.modalidad = cadena(o.modalidad)
      if ('detalle' in o) cob.detalle = leerDetalleCobertura(o.detalle)
      coberturas.push(cob)
    }
  }
  const listaRecibos: ReciboFicha[] = []
  if (Array.isArray(p.listaRecibos)) {
    for (const fila of p.listaRecibos) {
      if (typeof fila !== 'object' || fila === null) continue
      const o = fila as Record<string, unknown>
      if (typeof o.id !== 'string') continue
      listaRecibos.push({
        id: o.id, situacion: cadena(o.situacion) ?? 'sin_informar', importe: numero(o.importe),
        fechaEmision: cadena(o.fechaEmision), fechaVencimiento: cadena(o.fechaVencimiento), formaPago: cadena(o.formaPago),
      })
    }
  }
  const siniestros = leerSiniestros(p.siniestros)
  const g = p.gemela
  const gemela =
    typeof g === 'object' && g !== null && typeof (g as Record<string, unknown>).polizaId === 'string'
      ? {
          polizaId: (g as Record<string, unknown>).polizaId as string,
          clienteId: cadena((g as Record<string, unknown>).clienteId) ?? '',
          importRef: cadena((g as Record<string, unknown>).importRef) ?? '',
          objeto: leerObjeto((g as Record<string, unknown>).objeto),
          fechaVencimiento: cadena((g as Record<string, unknown>).fechaVencimiento),
        }
      : null

  return {
    estado: 'ok',
    poliza: {
      id: p.id,
      cliente: { id: c.id, nombre: cadena(c.nombre) ?? 'sin nombre' },
      tipo: p.tipo,
      aseguradora: p.aseguradora,
      codigoEntidadDgs: cadena(p.codigoEntidadDgs),
      numeroPoliza: cadena(p.numeroPoliza),
      idPolizaEntidad: cadena(p.idPolizaEntidad),
      ramoDgs: cadena(p.ramoDgs),
      estado: cadena(p.estado) ?? 'sin_informar',
      situacion: cadena(p.situacion),
      origen: cadena(p.origen) ?? 'sin_informar',
      viva: p.viva === true,
      fechaEfectoInicial: cadena(p.fechaEfectoInicial),
      fechaInicio: cadena(p.fechaInicio),
      fechaVencimiento: cadena(p.fechaVencimiento),
      prima: numero(p.prima),
      primaAnual: numero(p.primaAnual),
      primaBruta: numero(p.primaBruta),
      primaMensual: numero(p.primaMensual),
      objeto: leerObjeto(p.objeto),
      gemela,
      // La clave puede faltar (versión vieja de asegura): entonces «no hay
      // gemela» no se puede afirmar.
      gemelaInformada: 'gemela' in p,
      coberturas,
      recibos: leerRecibos(p.recibos),
      listaRecibos,
      siniestros,
      intervinientes: leerIntervinientes(p.intervinientes),
      documentos: 'documentos' in p ? entero(p.documentos) : null,
      listaDocumentos: leerDocumentos(p.listaDocumentos),
      pago: leerPago(p.pago),
      retarificable: p.retarificable === true,
      retarificacion: leerRetarificacion(p.retarificacion),
    },
  }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function polizaAsegura(id: string): Promise<RespuestaPoliza> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/poliza?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    return interpretarPoliza(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
