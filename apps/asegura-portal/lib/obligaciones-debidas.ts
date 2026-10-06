/**
 * Qué obligaciones son «debidas» (hay que avisarlas por push) para UNA identidad — la decisión PURA del cron
 * `/api/cron/avisos-push` (el route solo orquesta: lee BD, llama aquí y envía).
 *
 * 🚨 Tres reglas que no se negocian:
 *  1. Vínculo: una obligación con póliza solo cuenta si esa póliza está viva Y es de un cliente que ESTA
 *     identidad tiene vinculado (`portal_vinculo`). Un `polizaId` correcto de un cliente que ya no es suyo
 *     no se avisa. Sin póliza (recordatorio propio) pasa.
 *  2. Baja en marcha: una póliza con baja pedida/firmada/confirmada no «renueva» ni «vence»
 *     (`polizasConBajaEnMarcha(..., { conConfirmadas: true })`).
 *  3. Puente caído (`null`) ≠ «sin bajas»: se SALTA la identidad entera (no push, no sello) y se reintenta en la
 *     siguiente pasada. Avisar «renueva» con la baja sin comprobar es decirle algo falso a alguien.
 */
import { polizasConBajaEnMarcha, type LecturaPendientes } from './anulacion-firma.ts'
import { sinObligacionesDePolizasConBaja } from './vencimientos.ts'

export type ObligacionAvisable = { tipo: string; polizaId: string | null }

export type DebidasDeIdentidad<T> = { estado: 'ok'; debidas: T[] } | { estado: 'saltada'; motivo: 'puente_no_disponible' }

export async function obligacionesDebidasDeIdentidad<T extends ObligacionAvisable>(p: {
  /** Obligaciones YA en ventana de ESTA identidad. */
  obligaciones: readonly T[]
  /** Clientes (fichas) vinculados a ESTA identidad en `portal_vinculo`. */
  clientesVinculados: ReadonlySet<string>
  /** Póliza viva → su cliente (las no vivas no están en el mapa). */
  clientePorPoliza: ReadonlyMap<string, string>
  /** Lee las firmas del puente; `null` = no se pudo saber. Solo se llama si hay algo que comprobar. */
  leerFirmas: () => Promise<Pick<LecturaPendientes, 'anulaciones' | 'enRevision' | 'firmadas'> | null>
}): Promise<DebidasDeIdentidad<T>> {
  const delVinculo = p.obligaciones.filter((o) => {
    if (o.polizaId === null) return true
    const clienteId = p.clientePorPoliza.get(o.polizaId)
    if (!clienteId) return false
    return p.clientesVinculados.has(clienteId)
  })
  if (!delVinculo.some((o) => o.tipo === 'poliza' && o.polizaId !== null)) return { estado: 'ok', debidas: delVinculo }

  const firmas = await p.leerFirmas()
  if (firmas === null) return { estado: 'saltada', motivo: 'puente_no_disponible' }
  const conBaja = polizasConBajaEnMarcha(firmas, { conConfirmadas: true })
  return { estado: 'ok', debidas: sinObligacionesDePolizasConBaja(delVinculo, conBaja) }
}
