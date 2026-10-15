// Purga de la EVIDENCIA de fallo (capturas PNG y HTML) del tarificador RPA: contiene datos personales de clientes reales.
// Reglas PURAS (selección); la parte con BD vive en `purgarEvidenciaCaducada` de ./tarificador-purga.ts.
//   · Solo trabajos TERMINADOS (ok / cancelado / error_definitivo) con más de DIAS_RETENCION_EVIDENCIA días.
//   · `requiere_humano`, `atascado` y los abiertos conservan SIEMPRE su evidencia (una persona aún puede necesitarla).
//   · Solo se borran documentos de FALLO (`fallo-*.png|html`, subidos por el agente): `evidencia_documento_id` de un `ok`
//     es el PDF de la oferta y NO se toca nunca.

export const DIAS_RETENCION_EVIDENCIA = 15
export const ESTADOS_PURGA_EVIDENCIA = ['ok', 'cancelado', 'error_definitivo'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type TrabajoEvidencia = {
  estado: string
  terminadoAt: Date | string | null
  /** `evidencia_documento_id` y su nombre de fichero (null si no hay documento). */
  evidenciaId: string | null
  evidenciaNombre: string | null
  /** `error.html_documento_id`. */
  htmlId: string | null
  /** `captura_ref` de sus pasos (`documento:<uuid>`). */
  capturasRef: readonly (string | null)[]
}

/** Un fichero de fallo del tarificador (la captura o el HTML redactado), por el nombre con el que se guarda. */
export function esNombreEvidenciaFallo(nombre: string | null | undefined): boolean {
  return typeof nombre === 'string' && /^fallo-[0-9a-f]{8}\.(png|html)$/.test(nombre)
}

export function idDeCapturaRef(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string' || !ref.startsWith('documento:')) return null
  const id = ref.slice('documento:'.length)
  return UUID.test(id) ? id : null
}

/** ¿Ya toca purgar la evidencia de este trabajo? Estado terminado Y terminado hace más de `dias` días. */
export function evidenciaCaducada(t: Pick<TrabajoEvidencia, 'estado' | 'terminadoAt'>, ahora: Date, dias = DIAS_RETENCION_EVIDENCIA): boolean {
  if (!(ESTADOS_PURGA_EVIDENCIA as readonly string[]).includes(t.estado)) return false
  if (!t.terminadoAt) return false
  const fin = new Date(t.terminadoAt).getTime()
  if (!Number.isFinite(fin)) return false
  return fin < ahora.getTime() - dias * 86_400_000
}

/** Ids de documento a borrar de un trabajo ([] si no toca). Sin duplicados. */
export function idsEvidenciaAPurgar(t: TrabajoEvidencia, ahora: Date, dias = DIAS_RETENCION_EVIDENCIA): string[] {
  if (!evidenciaCaducada(t, ahora, dias)) return []
  const ids = new Set<string>()
  if (t.evidenciaId && UUID.test(t.evidenciaId) && esNombreEvidenciaFallo(t.evidenciaNombre)) ids.add(t.evidenciaId)
  if (t.htmlId && UUID.test(t.htmlId)) ids.add(t.htmlId)
  for (const r of t.capturasRef) { const id = idDeCapturaRef(r); if (id) ids.add(id) }
  return [...ids]
}
