// Regla PURA de «a quién toca reclamar hoy» la firma de un documento (cron diario
// `/api/cron/recordatorio-firmas`). Sin BD ni reloj: el llamante inyecta `hoy`.
//
// Calendario: a los 3 y a los 7 días de la solicitud, y después cada 7 días (14, 21, 28…).
// Si el cron no corrió el día del hito (caída, despliegue), se recupera al día siguiente: toca
// mientras no haya habido NINGÚN contacto (solicitud, recordatorio o reclamación manual) desde
// la fecha del último hito vencido. Nunca dos el mismo día (además, la BD lo impide con un índice
// único por documento y día — `avisos_recordatorio_dia_uq`).

const ZONA = 'Europe/Madrid'

/** Fecha de calendario (YYYY-MM-DD) en hora de Madrid. */
export function diaMadrid(d: Date): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function aUtc(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Días de calendario (hora de Madrid) entre dos instantes: `hasta - desde`. */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((aUtc(diaMadrid(hasta)) - aUtc(diaMadrid(desde))) / 86_400_000)
}

/** Último hito vencido (3, 7, 14, 21…) a `dias` de la solicitud, o null si aún no toca ninguno. */
export function hitoVencido(dias: number): number | null {
  if (!Number.isFinite(dias) || dias < 3) return null
  if (dias < 7) return 3
  return Math.floor(dias / 7) * 7
}

export type EntradaRecordatorio = {
  /** Desde cuándo se reclama la firma. null = no se sabe → NUNCA se reclama automáticamente. */
  solicitadaAt: Date | null
  /** Último contacto con el empleado por este documento (cualquier aviso), o null si ninguno. */
  ultimoContactoAt: Date | null
  hoy: Date
}

/** ¿Toca enviar hoy el recordatorio automático de este documento? */
export function tocaRecordatorioHoy({ solicitadaAt, ultimoContactoAt, hoy }: EntradaRecordatorio): boolean {
  if (!solicitadaAt) return false
  const dias = diasEntre(solicitadaAt, hoy)
  const hito = hitoVencido(dias)
  if (hito == null) return false
  if (!ultimoContactoAt) return true
  // Contacto el mismo día del hito o después → este hito ya está cubierto (incluye «hoy»).
  const diaHito = aUtc(diaMadrid(solicitadaAt)) + hito * 86_400_000
  return aUtc(diaMadrid(ultimoContactoAt)) < diaHito
}

/** Un aviso sin resultado de email (`email_estado` NULL) solo cuenta como contacto durante esta ventana. */
export const VENTANA_AVISO_EN_CURSO_MS = 3_600_000

/**
 * Último contacto que CUENTA para el calendario de recordatorios. Un aviso con `email_estado` NULL es
 * uno que se reservó y nunca terminó de enviarse (el proceso murió entre el INSERT y el UPDATE): si
 * tiene más de 1 h no consta que se contactara al empleado, así que no cubre el hito. Si es reciente,
 * puede estar enviándose ahora mismo: cuenta (para no mandar dos).
 */
export function ultimoContactoEfectivo(
  { ultimoConResultado, ultimoSinResultado, ahora }: { ultimoConResultado: Date | null; ultimoSinResultado: Date | null; ahora: Date },
): Date | null {
  const enCurso = ultimoSinResultado && ahora.getTime() - ultimoSinResultado.getTime() < VENTANA_AVISO_EN_CURSO_MS ? ultimoSinResultado : null
  if (!ultimoConResultado) return enCurso
  if (!enCurso) return ultimoConResultado
  return enCurso > ultimoConResultado ? enCurso : ultimoConResultado
}
