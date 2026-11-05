// Lo PURO de la solicitud de datos de la renovación en el portal (05/11/2026): traducir lo que devuelve el puente. Sin BD ni red.
import { ramoSolicitud, type CampoSolicitud, type RamoSolicitud } from '@central/module-seguros'

export type DatosRenovacionLeida =
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[]; papel: 'tomador' | 'autorizado' }
  | { estado: 'completada' | 'muerta' | 'no_encontrada' | 'sin_sesion' | 'error' }

/** Lo que devuelve el puente → la página. Una forma rara es `error` (no «no encontrada»: no se sabe). PURA. */
export function interpretarDatosRenovacion(status: number, json: unknown): DatosRenovacionLeida {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status === 404) return { estado: 'no_encontrada' }
  if (status !== 200 || !o) return { estado: 'error' }
  if (o.estado === 'completada' || o.estado === 'muerta') return { estado: o.estado }
  const ramo = ramoSolicitud(o.ramo)
  if (o.estado === 'ok' && ramo && Array.isArray(o.campos) && (o.papel === 'tomador' || o.papel === 'autorizado')) {
    const campos = o.campos.filter((c): c is CampoSolicitud => c !== null && typeof c === 'object' && typeof (c as CampoSolicitud).clave === 'string' && typeof (c as CampoSolicitud).etiqueta === 'string')
    if (campos.length > 0) return { estado: 'ok', ramo, campos, papel: o.papel }
  }
  return { estado: 'error' }
}

