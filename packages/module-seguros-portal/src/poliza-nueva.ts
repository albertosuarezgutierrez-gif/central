/**
 * «Tienes una póliza nueva» (26/09/2026). Alberto: «lo ideal sería mandar mail y
 * notificación app de la emisión; si es cambio de compañía, decírselo».
 *
 * PURO: recibe las pólizas en vigor del tomador (ya filtradas por
 * `esCarteraEnVigor` en quien lee) y decide cuáles son nuevas y cómo se llaman.
 * Lo usan la campana del portal y el correo de la intranet, así que las dos
 * superficies dicen lo mismo.
 *
 * 🚨 Tres cepos, cada uno contra un fallo concreto:
 *  1. `CORTE`: sin él, el día que se activa se avisaría de golpe de todo lo
 *     creado en los últimos 30 días — un correo a clientes que ya lo sabían.
 *  2. La clave es COMPAÑÍA + NÚMERO, nunca el id de la fila. Una póliza emitida
 *     por la intranet nace con su fila y, cuando CIMA la trae, la conciliación
 *     puede dejar otra fila viva con otro id: con el id se avisaría dos veces.
 *  3. Sin número no se avisa (aún): sería una clave inestable que cambiaría el
 *     día que llegue el número, y volvería a avisar.
 */
import { etiquetaRamo } from './poliza-leida.ts'

/** No se avisa de lo creado antes de este día (activación del aviso). */
export const CORTE_AVISO_POLIZA_NUEVA = '2026-09-26'
/** Pasado esto ya no es «nueva». */
export const DIAS_AVISO_POLIZA_NUEVA = 30

export type FilaPolizaNueva = {
  numeroPoliza: string | null
  codigoEntidadDgs: string | null
  /** Nombre legible de la compañía (nombre común o el texto de CIMA). */
  compania: string | null
  /** `polizas.tipo` tal cual (auto, hogar…). */
  tipo: string | null
  /** `YYYY-MM-DD` o `null`. */
  fechaEfecto: string | null
  creadaEn: Date
  /** Sustituye a otra póliza (`poliza_origen_id` puesto). */
  sustituye: boolean
  /** Compañía de la póliza sustituida, si se sabe. */
  sustituyeA: string | null
}

export type PolizaNuevaParaAviso = {
  /** Clave estable: `${codigoDgs|compañía}:${número normalizado}`. */
  id: string
  compania: string | null
  ramo: string | null
  fechaEfecto: string | null
  /** `null` = no sustituye a nada. `''` = sustituye a una de compañía desconocida. */
  sustituyeA: string | null
}

const MS_DIA = 86_400_000

function claveNumero(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function polizasNuevasParaAviso(filas: readonly FilaPolizaNueva[], hoy: Date): PolizaNuevaParaAviso[] {
  const corte = Date.parse(`${CORTE_AVISO_POLIZA_NUEVA}T00:00:00Z`)
  const desde = Math.max(corte, hoy.getTime() - DIAS_AVISO_POLIZA_NUEVA * MS_DIA)
  const out = new Map<string, PolizaNuevaParaAviso>()
  for (const f of filas) {
    const creada = f.creadaEn.getTime()
    if (!Number.isFinite(creada) || creada < desde) continue
    const numero = f.numeroPoliza ? claveNumero(f.numeroPoliza) : ''
    if (!numero) continue
    const cia = (f.codigoEntidadDgs ?? f.compania ?? '').trim().toUpperCase() || '-'
    const id = `${cia}:${numero}`
    if (out.has(id)) continue
    out.set(id, {
      id,
      compania: f.compania?.trim() || null,
      ramo: etiquetaRamo(f.tipo),
      fechaEfecto: f.fechaEfecto && /^\d{4}-\d{2}-\d{2}/.test(f.fechaEfecto) ? f.fechaEfecto.slice(0, 10) : null,
      sustituyeA: f.sustituye ? (f.sustituyeA?.trim() ?? '') : null,
    })
  }
  return [...out.values()]
}
