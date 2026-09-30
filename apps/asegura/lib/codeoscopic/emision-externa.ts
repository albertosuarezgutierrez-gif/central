// Una emisión hecha FUERA de la intranet —en la web de Avant2— leída de su proyecto (30/09/2026).
//
// Caso fundacional: la moto de Manuel Piña se emitió en la web de Avant2 (proyecto 40967960) y
// Allianz la dejó en «RIESGO CONDICIONADO» (la retuvo por la garantía de incendio-robo). La
// trastienda no se enteró: ni proyecto, ni póliza, ni aviso. Esto lee el `GET /insurances/{id}`
// (GRATIS) y dice en qué punto está la emisión, para registrarla y vigilarla sin mandar nada.
//
// Puro (sin BD ni red). La escritura vive en `lib/emision-externa.ts`.
//
// 🚨 Sin fixture real de un proyecto emitido: la forma de `policyApplications[]` es la que
// documenta el portal (`solicitudesEmision`). Lo que no se reconoce NO se colapsa a «emitida» ni a
// «rechazada»: queda `desconocido` y no mueve nada.

import { solicitudesEmision, solicitudViva, type SolicitudEmision, type VeredictoSolicitud } from './reintento-emision.ts'
import { ofertasDelProyecto, quoteCrudo } from './importar.ts'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export type EmisionExterna =
  | { estado: 'sin_solicitud' }
  | {
      estado: VeredictoSolicitud
      solicitud: SolicitudEmision
      /** Compañía del precio emitido. `null` = el proyecto no lo dice (no se adivina). */
      compania: string | null
      modalidad: string | null
      primaEur: number | null
      /** `quoteId` del precio emitido, si el proyecto lo enlaza. */
      quoteId: string | null
    }

/** La solicitud cruda (`policyApplications[i]`) que corresponde a una leída. */
function solicitudCruda(crudo: unknown, s: SolicitudEmision): Json | null {
  const lista = arr(obj(crudo).policyApplications).map(obj)
  return lista.find((a) => s.id !== null && str(a.id) === s.id) ?? (lista.length === 1 ? lista[0] : null)
}

/** El precio de la solicitud: su `quote` embebido o, si solo trae el id, el de `mainQuotes`. */
function precioDeSolicitud(crudo: unknown, cruda: Json | null) {
  const q = obj(cruda?.quote)
  const quoteId = str(q.id) ?? str(cruda?.quoteId)
  const base = obj(q.product).vendor ? q : quoteId ? quoteCrudo(crudo, quoteId) ?? {} : {}
  const producto = obj(obj(base).product)
  const compania = str(obj(producto.vendor).name)
  if (compania) {
    return { compania, modalidad: str(obj(producto.modality).name), primaEur: num(obj(base).premium), quoteId }
  }
  // Último recurso: el proyecto tiene UN solo precio confirmado. Con varios no se elige ninguno.
  const confirmadas = ofertasDelProyecto(crudo, '0000-00-00').filter((o) => !/sin confirmar/.test(o.motivo ?? ''))
  if (confirmadas.length === 1) {
    const o = confirmadas[0]
    return { compania: o.compania, modalidad: o.modalidad, primaEur: o.primaEur, quoteId: o.quoteId }
  }
  return { compania: null, modalidad: null, primaEur: null, quoteId }
}

/**
 * En qué punto está la emisión del proyecto. Manda la solicitud VIVA (aprobada o pendiente); sin
 * ninguna viva, la última que haya (rechazada o sin reconocer). `sin_solicitud` = el proyecto no
 * cuenta ninguna emisión, que NO es «no se emitió» si se hizo por otro proyecto.
 */
export function leerEmisionExterna(crudo: unknown): EmisionExterna {
  const solicitudes = solicitudesEmision(crudo)
  if (solicitudes.length === 0) return { estado: 'sin_solicitud' }
  const s = solicitudViva(solicitudes) ?? solicitudes[solicitudes.length - 1]
  return { estado: s.veredicto, solicitud: s, ...precioDeSolicitud(crudo, solicitudCruda(crudo, s)) }
}

/**
 * El estado de `codeoscopic_projects` que corresponde. `null` = no se toca: una aprobada lo pasa a
 * `emitida` el ACUÑADO (`registrarPolizaEmitida`), y una desconocida no mueve nada. Una aprobada
 * SIN número de póliza sigue retenida: sin número no hay póliza que registrar ni que CIMA case.
 */
export function estadoProyectoDe(e: EmisionExterna): 'riesgo_condicionado' | 'rechazada' | null {
  if (e.estado === 'pendiente') return 'riesgo_condicionado'
  if (e.estado === 'aprobada' && !e.solicitud.numeroPoliza) return 'riesgo_condicionado'
  if (e.estado === 'rechazada') return 'rechazada'
  return null
}

/** Una línea para el historial, la pantalla y Telegram. */
export function describirEmisionExterna(e: EmisionExterna): string {
  if (e.estado === 'sin_solicitud') return 'el proyecto no cuenta ninguna emisión'
  const de = e.compania ? ` en ${e.compania}` : ''
  const vendor = e.solicitud.estadoNombre ?? e.solicitud.estadoId
  const literal = vendor ? ` («${vendor}» en Avant2)` : ''
  if (e.estado === 'aprobada') {
    return e.solicitud.numeroPoliza
      ? `emitida${de}, póliza nº ${e.solicitud.numeroPoliza}${literal}`
      : `aprobada${de} pero aún sin nº de póliza${literal}: sigue retenida`
  }
  if (e.estado === 'pendiente') return `emitida${de} y RETENIDA por la compañía${literal}`
  if (e.estado === 'rechazada') return `RECHAZADA${de}${literal}`
  return `en un estado que no se reconoce${literal}: se mira en Avant2`
}

/** Lo que cruza el puerto hacia plataforma: la emisión, plana y sin el crudo del vendor. */
export type EmisionResumen = {
  estado: 'sin_solicitud' | VeredictoSolicitud
  compania: string | null
  modalidad: string | null
  primaEur: number | null
  numeroPoliza: string | null
  solicitudId: string | null
  /** El literal del vendor (`status.name` o, sin él, `status.id`), tal cual. */
  estadoVendor: string | null
  descripcion: string
}

export function resumenEmision(e: EmisionExterna): EmisionResumen {
  const descripcion = describirEmisionExterna(e)
  if (e.estado === 'sin_solicitud') {
    return { estado: 'sin_solicitud', compania: null, modalidad: null, primaEur: null, numeroPoliza: null, solicitudId: null, estadoVendor: null, descripcion }
  }
  return {
    estado: e.estado,
    compania: e.compania,
    modalidad: e.modalidad,
    primaEur: e.primaEur,
    numeroPoliza: e.solicitud.numeroPoliza,
    solicitudId: e.solicitud.id,
    estadoVendor: e.solicitud.estadoNombre ?? e.solicitud.estadoId,
    descripcion,
  }
}
