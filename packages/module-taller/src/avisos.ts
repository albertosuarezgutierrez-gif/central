// Regla de avisos (spec §4.8). Servicio vs comercial:
//   - SERVICIO (no exigen consentimiento comercial): terminado, cita, presupuesto, itv, revision_fecha, revision_km.
//   - COMERCIAL: `seguro` (vencimiento del seguro: promociona Grupo ASegura → consentimiento `asegura`)
//     y `promocion` (campañas del taller → consentimiento `taller_comercial`).
// Fecha desconocida (null) = NO se avisa y el estado es «desconocido», nunca «vigente».
// Canal: push si tiene la app + SIEMPRE copia por correo; sin app, solo correo. Sin ninguno, no se envía.
// Intervalos de antelación: de `ConfigTaller.intervalosAvisos`, nunca literales aquí.

import type { IntervalosAvisos } from './config.ts'
import {
  consentimientoAseguraVigente,
  consentimientoTallerVigente,
  type Consentimiento,
  type MotivoSinConsentimiento,
} from './consentimiento.ts'

export const TIPOS_AVISO_SERVICIO = ['terminado', 'cita', 'presupuesto', 'itv', 'revision_fecha', 'revision_km'] as const
export const TIPOS_AVISO_COMERCIAL = ['seguro', 'promocion'] as const
export type TipoAviso = (typeof TIPOS_AVISO_SERVICIO)[number] | (typeof TIPOS_AVISO_COMERCIAL)[number]
export type CanalAviso = 'push' | 'correo'

export function esAvisoComercial(t: TipoAviso): boolean {
  return (TIPOS_AVISO_COMERCIAL as readonly string[]).includes(t)
}

const MS_DIA = 86_400_000

/** Días naturales de `desde` a `hasta` (fechas UTC, sin horas). Negativo si `hasta` ya pasó. */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate())
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate())
  return Math.round((b - a) / MS_DIA)
}

export type EstadoVencimiento = 'desconocido' | 'vigente' | 'proximo' | 'vencido'

/** Estado de un vencimiento. `null` → «desconocido» (nunca «vigente»). */
export function estadoVencimiento(fecha: Date | null, hoy: Date, antelacionDias: number): EstadoVencimiento {
  if (fecha === null) return 'desconocido'
  const dias = diasEntre(hoy, fecha)
  if (dias < 0) return 'vencido'
  if (dias <= antelacionDias) return 'proximo'
  return 'vigente'
}

export interface VehiculoAvisos {
  itvHasta: Date | null
  seguroHasta: Date | null
  proximaRevisionFecha: Date | null
  proximaRevisionKm: number | null
  /** Km estimados hoy (histórico de recepciones). null = no se sabe. */
  kmEstimados: number | null
}

export interface ClienteAvisos {
  appInstalada: boolean
  correo: string | null
}

export interface EntradaAviso {
  tipo: TipoAviso
  tallerId: string
  clienteId: string
  cliente: ClienteAvisos
  vehiculo: VehiculoAvisos
  consentimientos: readonly Consentimiento[]
  intervalos: IntervalosAvisos
  hoy: Date
}

export type MotivoNoAviso =
  | 'fecha_desconocida'
  | 'km_desconocidos'
  | 'aun_no_toca'
  | 'sin_canal'
  | MotivoSinConsentimiento

export type DecisionAviso =
  | { enviar: true; canales: CanalAviso[]; comercial: boolean; consentimientoId: string | null }
  | { enviar: false; motivo: MotivoNoAviso }

export function canalesAviso(c: ClienteAvisos): CanalAviso[] {
  const canales: CanalAviso[] = []
  if (c.appInstalada) canales.push('push')
  if (c.correo !== null && c.correo.trim() !== '') canales.push('correo')
  return canales
}

/** ¿Toca el aviso hoy según el dato? (sin mirar consentimiento ni canal). */
function tocaPorDato(e: EntradaAviso): { toca: true } | { toca: false; motivo: MotivoNoAviso } {
  const { vehiculo: v, intervalos: i, hoy } = e
  const porFecha = (f: Date | null, antelacion: number) => {
    const est = estadoVencimiento(f, hoy, antelacion)
    if (est === 'desconocido') return { toca: false as const, motivo: 'fecha_desconocida' as const }
    if (est === 'vigente') return { toca: false as const, motivo: 'aun_no_toca' as const }
    return { toca: true as const }
  }
  switch (e.tipo) {
    case 'terminado':
    case 'cita':
    case 'presupuesto':
    case 'promocion':
      return { toca: true }
    case 'itv':
      return porFecha(v.itvHasta, i.itvAntelacionDias)
    case 'revision_fecha':
      return porFecha(v.proximaRevisionFecha, i.revisionFechaAntelacionDias)
    case 'seguro':
      return porFecha(v.seguroHasta, i.seguroAntelacionDias)
    case 'revision_km':
      if (v.proximaRevisionKm === null || v.kmEstimados === null) return { toca: false, motivo: 'km_desconocidos' }
      return v.kmEstimados >= v.proximaRevisionKm - i.revisionKmAntelacion
        ? { toca: true }
        : { toca: false, motivo: 'aun_no_toca' }
  }
}

export function decidirAviso(e: EntradaAviso): DecisionAviso {
  const t = tocaPorDato(e)
  if (!t.toca) return { enviar: false, motivo: t.motivo }

  let consentimientoId: string | null = null
  const comercial = esAvisoComercial(e.tipo)
  if (comercial) {
    const d = e.tipo === 'seguro'
      ? consentimientoAseguraVigente(e.consentimientos, e.tallerId, e.clienteId, e.hoy)
      : consentimientoTallerVigente(e.consentimientos, e.tallerId, e.clienteId, e.hoy)
    if (!d.permitido) return { enviar: false, motivo: d.motivo }
    consentimientoId = d.consentimientoId
  }

  const canales = canalesAviso(e.cliente)
  if (canales.length === 0) return { enviar: false, motivo: 'sin_canal' }
  return { enviar: true, canales, comercial, consentimientoId }
}
