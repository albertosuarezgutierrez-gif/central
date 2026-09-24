/**
 * Registro de **quejas y reclamaciones** del Servicio de Atención al Cliente (SAC) del mediador.
 *
 * El portal y la web publican que el SAC contesta «en un mes desde la presentación»
 * (`CANALES_RECLAMACION` de `mediador.ts`). Publicar un plazo sin llevar la cuenta de nadie es
 * prometer un reloj que no mira nadie: una queja que entra por correo y no se anota vence en
 * silencio, y pasado el plazo el cliente puede ir a la DGSFP con el incumplimiento debajo del brazo.
 *
 * Aquí vive la regla (pura): el plazo, sus estados y el informe anual que pide la norma del SAC.
 * PENDIENTE_REVISION_LEGAL: el plazo concreto (un mes) es el que ya se publica; si el asesor fija
 * otro, se cambia AQUÍ y el texto publicado lo sigue (hay un cepo que los ata).
 */

/** Meses para contestar desde la recepción. Es lo publicado en `CANALES_RECLAMACION`. */
export const PLAZO_SAC_MESES = 1

/** Con esta antelación (o menos) la queja abierta sale como urgente. */
export const DIAS_AVISO_QUEJA = 7

export const ESTADOS_QUEJA = [
  'recibida',
  'en_tramite',
  'resuelta_favorable',
  'resuelta_parcial',
  'resuelta_desfavorable',
  'desistida',
] as const
export type EstadoQueja = (typeof ESTADOS_QUEJA)[number]

export const ESTADOS_QUEJA_CERRADA: readonly EstadoQueja[] = [
  'resuelta_favorable',
  'resuelta_parcial',
  'resuelta_desfavorable',
  'desistida',
]
export const ESTADOS_QUEJA_RESUELTA: readonly EstadoQueja[] = [
  'resuelta_favorable',
  'resuelta_parcial',
  'resuelta_desfavorable',
]

export const CANALES_QUEJA = ['correo', 'telefono', 'presencial', 'carta', 'portal'] as const
export type CanalQueja = (typeof CANALES_QUEJA)[number]

export const MOTIVOS_QUEJA = [
  'siniestro',
  'cobro_recibo',
  'anulacion',
  'informacion',
  'atencion',
  'datos_personales',
  'otro',
] as const
export type MotivoQueja = (typeof MOTIVOS_QUEJA)[number]

export const ETIQUETA_ESTADO_QUEJA: Record<EstadoQueja, string> = {
  recibida: 'Recibida',
  en_tramite: 'En trámite',
  resuelta_favorable: 'Resuelta a favor del cliente',
  resuelta_parcial: 'Resuelta en parte',
  resuelta_desfavorable: 'Resuelta en contra',
  desistida: 'El cliente desiste',
}

export const ETIQUETA_MOTIVO_QUEJA: Record<MotivoQueja, string> = {
  siniestro: 'Siniestro',
  cobro_recibo: 'Cobro o recibo',
  anulacion: 'Anulación o baja',
  informacion: 'Información recibida',
  atencion: 'Atención del corredor',
  datos_personales: 'Datos personales',
  otro: 'Otro',
}

export const ETIQUETA_CANAL_QUEJA: Record<CanalQueja, string> = {
  correo: 'Correo electrónico',
  telefono: 'Teléfono',
  presencial: 'En persona',
  carta: 'Carta',
  portal: 'Portal del cliente',
}

/** `YYYY-MM-DD` válido (y que existe en el calendario). */
function fechaValida(f: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null
  const d = new Date(`${f}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f ? null : d
}

/**
 * Fecha límite para contestar: el mismo día del mes siguiente; si no existe (31/01 → febrero), el
 * último día de ese mes. Mes NATURAL, no 30 días: en un plazo legal contar de más es decir que se
 * está a tiempo cuando ya no.
 */
export function plazoQueja(recibidaEl: string): string | null {
  const d = fechaValida(recibidaEl)
  if (!d) return null
  const total = d.getUTCMonth() + PLAZO_SAC_MESES
  const año = d.getUTCFullYear() + Math.floor(total / 12)
  const mes = total % 12
  const ultimo = new Date(Date.UTC(año, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(año, mes, Math.min(d.getUTCDate(), ultimo))).toISOString().slice(0, 10)
}

export type PlazoQueja = 'cerrada' | 'en_plazo' | 'urgente' | 'vencida'

/** Días hasta el límite (negativo si ya pasó), contando por fecha de Madrid del día `hoy`. */
export function diasHastaPlazo(plazoEl: string, hoy: string): number | null {
  const p = fechaValida(plazoEl)
  const h = fechaValida(hoy)
  if (!p || !h) return null
  return Math.round((p.getTime() - h.getTime()) / 86_400_000)
}

/**
 * En qué punto del reloj está. Lo que ordena la cola es el plazo, no el orden de llegada.
 * El día del límite todavía se está a tiempo (vence al acabar ese día).
 */
export function estadoPlazoQueja(q: { estado: EstadoQueja; plazoEl: string }, hoy: string): PlazoQueja | null {
  if (ESTADOS_QUEJA_CERRADA.includes(q.estado)) return 'cerrada'
  const dias = diasHastaPlazo(q.plazoEl, hoy)
  if (dias === null) return null
  if (dias < 0) return 'vencida'
  return dias <= DIAS_AVISO_QUEJA ? 'urgente' : 'en_plazo'
}

/** Transiciones permitidas. Una cerrada no se reabre: si el cliente vuelve, es una queja nueva. */
export function transicionQuejaValida(de: EstadoQueja, a: EstadoQueja): boolean {
  if (de === a) return false
  if (ESTADOS_QUEJA_CERRADA.includes(de)) return false
  if (a === 'recibida') return false
  return true
}

export type AltaQueja = {
  reclamante: string
  canal: string
  motivo: string
  recibidaEl: string
  detalle: string
}

/** Errores de un alta, en castellano y para pintarlos tal cual. Vacío = válida. */
export function validarAltaQueja(a: AltaQueja, hoy: string): string[] {
  const e: string[] = []
  if (!a.reclamante?.trim()) e.push('Falta quién presenta la queja.')
  if (!CANALES_QUEJA.includes(a.canal as CanalQueja)) e.push('El canal no es válido.')
  if (!MOTIVOS_QUEJA.includes(a.motivo as MotivoQueja)) e.push('El motivo no es válido.')
  if (!a.detalle?.trim()) e.push('Falta qué reclama.')
  const r = fechaValida(a.recibidaEl)
  if (!r) e.push('La fecha de recepción no es válida.')
  else if (a.recibidaEl > hoy) e.push('La fecha de recepción no puede ser futura.')
  return e
}

/**
 * Para cerrarla como RESUELTA hace falta la respuesta que se dio: la norma pide una contestación
 * motivada, y sin texto no queda constancia de cuál fue.
 */
export function validarCierreQueja(a: EstadoQueja, respuesta: string | null | undefined): string | null {
  if (ESTADOS_QUEJA_RESUELTA.includes(a) && !respuesta?.trim()) {
    return 'Para darla por resuelta escribe la respuesta que se le dio al cliente.'
  }
  return null
}

export type QuejaInforme = {
  estado: EstadoQueja
  motivo: MotivoQueja
  recibidaEl: string
  plazoEl: string
  resueltaEl: string | null
}

export type InformeSac = {
  año: number
  total: number
  abiertas: number
  porEstado: Record<EstadoQueja, number>
  porMotivo: Record<MotivoQueja, number>
  /** Resueltas (o desistidas) dentro de plazo / fuera de plazo. */
  cerradasEnPlazo: number
  cerradasFueraDePlazo: number
}

/**
 * El resumen anual del SAC: cuántas, de qué, cómo acabaron y si se contestó a tiempo. Cuenta las
 * RECIBIDAS en el año (una queja de diciembre resuelta en enero es del año en que entró).
 */
export function informeSac(quejas: readonly QuejaInforme[], año: number): InformeSac {
  const delAño = quejas.filter((q) => q.recibidaEl.startsWith(`${año}-`))
  const porEstado = Object.fromEntries(ESTADOS_QUEJA.map((s) => [s, 0])) as Record<EstadoQueja, number>
  const porMotivo = Object.fromEntries(MOTIVOS_QUEJA.map((m) => [m, 0])) as Record<MotivoQueja, number>
  let abiertas = 0
  let enPlazo = 0
  let fuera = 0
  for (const q of delAño) {
    porEstado[q.estado]++
    porMotivo[q.motivo]++
    if (!ESTADOS_QUEJA_CERRADA.includes(q.estado)) abiertas++
    else if (q.resueltaEl) {
      if (q.resueltaEl <= q.plazoEl) enPlazo++
      else fuera++
    }
  }
  return { año, total: delAño.length, abiertas, porEstado, porMotivo, cerradasEnPlazo: enPlazo, cerradasFueraDePlazo: fuera }
}
