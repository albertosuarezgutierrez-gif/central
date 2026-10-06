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
 *  3. Puente caído (`null`) ≠ «sin bajas»: las obligaciones CON póliza (cualquier tipo) se RETIENEN (no push, no
 *     sello; se reintentan en la siguiente pasada: avisar «renueva» con la baja sin comprobar es decirle algo
 *     falso a alguien). Los recordatorios propios (`polizaId === null`: ITV, caldera…) no dependen del puente y
 *     se avisan igual: `retenidas` cuenta las que se quedaron esperando.
 */
import { polizasConBajaEnMarcha, type LecturaPendientes } from './anulacion-firma.ts'
import { sinObligacionesDePolizasConBaja } from './vencimientos.ts'

export type ObligacionAvisable = { tipo: string; polizaId: string | null }

/** `retenidas` > 0 = hubo obligaciones de póliza que no se pudieron comprobar (puente caído) y quedan para otra pasada. */
export type DebidasDeIdentidad<T> = { estado: 'ok'; debidas: T[]; retenidas: number }

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
  if (!delVinculo.some((o) => o.tipo === 'poliza' && o.polizaId !== null)) return { estado: 'ok', debidas: delVinculo, retenidas: 0 }

  const firmas = await p.leerFirmas()
  if (firmas === null) {
    const propias = delVinculo.filter((o) => o.polizaId === null)
    return { estado: 'ok', debidas: propias, retenidas: delVinculo.length - propias.length }
  }
  const conBaja = polizasConBajaEnMarcha(firmas, { conConfirmadas: true })
  return { estado: 'ok', debidas: sinObligacionesDePolizasConBaja(delVinculo, conBaja), retenidas: 0 }
}
