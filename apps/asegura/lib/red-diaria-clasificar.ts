// Red diaria de la correduría (12/10/2026): lo que se queda parado EN SILENCIO en la cola de aprobaciones.
// PURO: sin BD ni red (la consulta vive en `red-diaria.ts`). Lo consume el cron `correduria-red-diaria`
// de plataforma por `/api/operador/red-diaria`.
//
// Por qué existe: la caducidad de `aprobacion` es perezosa (`retirarObsoletas`, solo al abrir «Hoy») y una
// baja firmada que no sale (sin carta, propuesta rechazada, Allianz…) no avisaba a nadie.

export const HORAS_ANULACION_PARADA = 48
export const HORAS_AVISO_CADUCIDAD = 24

const H = 3_600_000

// ── Aprobaciones que caducan / han caducado ──────────────────────────────────

export type FilaAprobacion = {
  id: string
  accion: string
  origen: string
  clienteId: string
  cliente: string | null
  estado: string
  caduca: Date
  /** Quién la cerró (`sistema:caducidad` = caducó por tiempo; otros `sistema:*` = obsoleta, no es noticia). */
  decididaPor: string | null
  urgente: boolean
}

export type ItemAprobacion = {
  id: string; tipo: 'cliente' | 'compania'; origen: string; clienteId: string; cliente: string | null; caduca: string; urgente: boolean
}

const item = (f: FilaAprobacion): ItemAprobacion => ({
  id: f.id, tipo: f.accion === 'enviar_correo_compania' ? 'compania' : 'cliente', origen: f.origen,
  clienteId: f.clienteId, cliente: f.cliente, caduca: f.caduca.toISOString(), urgente: f.urgente,
})

/** Pendientes que caducan en <24 h y caducadas POR TIEMPO en las últimas 24 h (la fecha manda, no cuándo se retiró). */
export function clasificarAprobaciones(filas: readonly FilaAprobacion[], ahora: Date): { porCaducar: ItemAprobacion[]; caducadas: ItemAprobacion[] } {
  const t = ahora.getTime()
  const porCaducar = filas
    .filter((f) => f.estado === 'pendiente' && f.caduca.getTime() > t && f.caduca.getTime() - t < HORAS_AVISO_CADUCIDAD * H)
    .sort((a, b) => a.caduca.getTime() - b.caduca.getTime())
  const caducadas = filas
    .filter((f) => f.estado === 'caducada' && f.decididaPor === 'sistema:caducidad'
      && f.caduca.getTime() <= t && t - f.caduca.getTime() <= HORAS_AVISO_CADUCIDAD * H)
    .sort((a, b) => a.caduca.getTime() - b.caduca.getTime())
  return { porCaducar: porCaducar.map(item), caducadas: caducadas.map(item) }
}

// ── Anulaciones firmadas que no salen ────────────────────────────────────────

export type CausaAnulacionParada =
  | 'allianz_pue' | 'sin_carta_firma' | 'espera_emision' | 'enviada_sin_marcar'
  | 'envio_incierto' | 'esperando_ok' | 'propuesta_rechazada' | 'sin_propuesta'

export type FilaAnulacion = {
  anulacionId: string
  clienteId: string
  cliente: string | null
  compania: string | null
  numeroPoliza: string | null
  firmadaAt: Date
  /** `carta_texto IS NOT NULL` / `firma_id IS NOT NULL`. */
  tieneCarta: boolean
  tieneFirma: boolean
  esAllianz: boolean
  /** Firmada junto a un presupuesto cuya póliza nueva aún no consta emitida. */
  esperaEmision: boolean
  /** Estados de TODAS sus aprobaciones (`pendiente`, `rechazada`…). */
  estadosAprobacion: readonly string[]
}

export type ItemAnulacion = {
  anulacionId: string; clienteId: string; cliente: string | null; compania: string | null; numeroPoliza: string | null
  firmadaAt: string; horas: number; causa: CausaAnulacionParada
}

/** Por qué NO ha salido. El orden importa: la causa más "de raíz" gana. */
export function causaAnulacionParada(f: FilaAnulacion): CausaAnulacionParada {
  if (f.esAllianz) return 'allianz_pue'
  if (!f.tieneCarta || !f.tieneFirma) return 'sin_carta_firma'
  if (f.esperaEmision) return 'espera_emision'
  const e = f.estadosAprobacion
  if (e.includes('ejecutada')) return 'enviada_sin_marcar'
  if (e.includes('enviando')) return 'envio_incierto'
  if (e.includes('pendiente')) return 'esperando_ok'
  if (e.includes('rechazada')) return 'propuesta_rechazada'
  return 'sin_propuesta'
}

/** Solo las firmadas hace MÁS de 48 h, de la más antigua a la más reciente. */
export function clasificarAnulaciones(filas: readonly FilaAnulacion[], ahora: Date, horasMin: number = HORAS_ANULACION_PARADA): ItemAnulacion[] {
  const t = ahora.getTime()
  return filas
    .filter((f) => t - f.firmadaAt.getTime() > horasMin * H)
    .sort((a, b) => a.firmadaAt.getTime() - b.firmadaAt.getTime())
    .map((f) => ({
      anulacionId: f.anulacionId, clienteId: f.clienteId, cliente: f.cliente, compania: f.compania, numeroPoliza: f.numeroPoliza,
      firmadaAt: f.firmadaAt.toISOString(), horas: Math.floor((t - f.firmadaAt.getTime()) / H), causa: causaAnulacionParada(f),
    }))
}
