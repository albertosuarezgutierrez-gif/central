// Retención de fotos: qué fotos tocan borrar de Storage. Lógica PURA (el reloj entra por `hoy`).
//
// Regla (decisión de Alberto, 04/11/2026): SOLO las fotos de daños (recepción) y de trabajo (OT) de órdenes ENTREGADAS hace más
// días que el plazo de su taller. El plazo cuenta desde la entrega y nunca baja de `FOTOS_RETENCION_MIN_DIAS` (garantía legal de la
// reparación: 3 meses o 2.000 km). Firmas, resguardo, presupuestos y facturas NO son fotos purgables: no entran por construcción.
import { FOTOS_RETENCION_MIN_DIAS } from './config.ts'

/** Tipos de foto que se purgan. Todo lo que no esté aquí (firma, resguardo, presupuesto, factura) NUNCA se borra. */
export const TIPOS_FOTO_PURGABLE = ['dano', 'trabajo'] as const
export type TipoFotoPurgable = (typeof TIPOS_FOTO_PURGABLE)[number]

const DIA_MS = 86_400_000

export interface OrdenEntrega {
  id: string
  estado: string
  entregadoEn: Date | null
}

export interface FotoCandidata {
  id: string
  tipo: string
  /** OT a la que pertenece (la de la recepción, para las fotos de daños). */
  otId: string
  purgadaEn: Date | null
}

export function plazoRetencionValido(dias: unknown): dias is number {
  return typeof dias === 'number' && Number.isInteger(dias) && dias >= FOTOS_RETENCION_MIN_DIAS
}

/** Entregas anteriores o iguales a esta fecha ya cumplieron el plazo. */
export function fechaLimitePurga(hoy: Date, retencionDias: number): Date {
  return new Date(hoy.getTime() - retencionDias * DIA_MS)
}

/**
 * Ids de las fotos que tocan. Una foto toca si: es de un tipo purgable, no está ya purgada y su OT está `entregado` con
 * `entregadoEn` y el plazo cumplido. Plazo inválido (< mínimo) o fechas ilegibles ⇒ no toca nada (falla cerrado).
 */
export function fotosAPurgar(a: { fotos: FotoCandidata[]; ordenes: OrdenEntrega[]; retencionDias: number; hoy: Date }): string[] {
  if (!plazoRetencionValido(a.retencionDias) || Number.isNaN(a.hoy.getTime())) return []
  const limite = fechaLimitePurga(a.hoy, a.retencionDias).getTime()
  const entregadas = new Map<string, number>()
  for (const o of a.ordenes) {
    if (o.estado !== 'entregado' || !o.entregadoEn) continue
    const t = o.entregadoEn.getTime()
    if (!Number.isNaN(t) && t <= limite) entregadas.set(o.id, t)
  }
  return a.fotos
    .filter((f) => (TIPOS_FOTO_PURGABLE as readonly string[]).includes(f.tipo) && f.purgadaEn == null && entregadas.has(f.otId))
    .map((f) => f.id)
}

export function lotes<T>(xs: readonly T[], tamano: number): T[][] {
  if (!Number.isInteger(tamano) || tamano <= 0) throw new RangeError('tamaño de lote inválido')
  const r: T[][] = []
  for (let i = 0; i < xs.length; i += tamano) r.push(xs.slice(i, i + tamano))
  return r
}

/** «Foto eliminada el 04/11/2026 (plazo de conservación)». Fecha en hora de Madrid. */
export function textoFotoPurgada(purgadaEn: Date): string {
  const f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(purgadaEn)
  return `Foto eliminada el ${f} (plazo de conservación)`
}
