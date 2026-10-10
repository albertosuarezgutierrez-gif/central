// Resumen del cron de la sincro ficha ↔ CIMA (03/10/2026). PURO: sin red ni BD.
//
// Sirve a dos cosas: (1) el evento `cima_sincro_resumen` de asegura, para diagnosticar un aviso sin descifrar
// datos (solo póliza, campo y motivo/tipo, NUNCA un valor ni un nombre), y (2) las líneas del Telegram.
import { CAMPOS_CIMA, ROTULO_CAMPO_CIMA, type CampoCima } from '@central/module-seguros'
import type { LecturaSincroCima } from '../cima-sincro-asegura.ts'

export const TOPE_LINEAS_CONFLICTOS = 10

export type CopiadoResumen = { poliza: string | null; campo: CampoCima; motivo: 'hueco' | 'nuevo' | 'mas_completo' | 'formato' | 'errata' }
export type ConflictoResumen = { poliza: string | null; campo: CampoCima; tipo: 'distinto' | 'aviso' }

const MOTIVOS = ['hueco', 'nuevo', 'mas_completo', 'formato', 'errata']

/** `null` = la respuesta del puerto no se entiende (no es «no se copió nada»). */
export function copiadosDeRespuesta(json: unknown): CopiadoResumen[] | null {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  if (!o || !Array.isArray(o.copiados)) return null
  const out: CopiadoResumen[] = []
  for (const f of o.copiados) {
    const x = typeof f === 'object' && f !== null ? (f as Record<string, unknown>) : null
    if (!x || !(typeof x.poliza === 'string' || x.poliza === null) || !(CAMPOS_CIMA as readonly unknown[]).includes(x.campo) || !MOTIVOS.includes(String(x.motivo))) return null
    out.push({ poliza: x.poliza as string | null, campo: x.campo as CampoCima, motivo: x.motivo as CopiadoResumen['motivo'] })
  }
  return out
}

/** Una lectura que no es `ok` da lista vacía: el aviso de «no se pudo comparar» ya sale aparte. */
export function conflictosDeLectura(l: LecturaSincroCima): ConflictoResumen[] {
  if (l.estado !== 'ok') return []
  return l.discrepancias.flatMap((f) => f.diferencias.map((d) => ({ poliza: f.poliza, campo: d.campo, tipo: d.aviso ? ('aviso' as const) : ('distinto' as const) })))
}

/** «campo · nº póliza» por conflicto, con tope; el resto, contado. Sin nombres ni valores. */
export function lineasConflictos(conflictos: readonly ConflictoResumen[], tope = TOPE_LINEAS_CONFLICTOS): string[] {
  const lineas = conflictos.slice(0, tope).map((c) => `• ${ROTULO_CAMPO_CIMA[c.campo]} · ${c.poliza ?? 'sin nº de póliza'}`)
  if (conflictos.length > tope) lineas.push(`… y ${conflictos.length - tope} más.`)
  return lineas
}
