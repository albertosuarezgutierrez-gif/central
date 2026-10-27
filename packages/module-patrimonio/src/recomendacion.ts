// RECOMENDACIÓN ENTRE PROPIETARIOS (27/10/2026, punto 9 del estudio de mercado): «invita a otro propietario». PURO: sin BD, sin
// red, SIN RELOJ (`hoy` entra siempre como parámetro).
//
// Diseño (decisión de Alberto):
//  · La identidad del invitado es SIEMPRE el CORREO. En BD solo queda su HASH (nunca el correo en claro).
//  · El portal NO ENVÍA NADA a terceros: la pantalla genera un texto/enlace y lo comparte el propio cliente.
//  · Recompensa: cuando el invitado se da de alta (identidad NUEVA, posterior a la invitación) y activa patrimonio, los DOS
//    tienen el cupo de IA «amplio» durante `DIAS_RECOMPENSA_RECOMENDACION` días como mínimo (`recompensaVigente`, que
//    `cupoMensualIa` aplica sin rebajar jamás un tramo superior).
//  · Anti-abuso: el que recomienda no puede canjearse a sí mismo; quien YA tenía cuenta no da recompensa; cada invitado da una
//    sola recompensa.

/** Días de cupo «amplio» que gana cada parte desde que el invitado activa patrimonio. */
export const DIAS_RECOMPENSA_RECOMENDACION = 90
/** Días que una recomendación sigue esperando a que el invitado se dé de alta. */
export const DIAS_VALIDEZ_RECOMENDACION = 30
/** Tope de recomendaciones que una persona crea por día (freno de abuso, no cuota). */
export const MAX_RECOMENDACIONES_DIA = 10

const DIA_MS = 24 * 60 * 60 * 1000
const CORREO = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\.]{2,}$/u

/** Correo normalizado (trim + minúsculas) o `null` si no es un correo. La identidad es el correo: sin teléfono ni nombre. */
export function normalizarCorreoRecomendado(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (t.length < 6 || t.length > 254) return null
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(t)) return null
  return CORREO.test(t) ? t : null
}

export function caducidadRecomendacion(creadaEn: Date): Date {
  return new Date(creadaEn.getTime() + DIAS_VALIDEZ_RECOMENDACION * DIA_MS)
}

/** Cuándo acaba la recompensa nacida de un canje. */
export function finRecompensaRecomendacion(canjeadaEn: Date): Date {
  return new Date(canjeadaEn.getTime() + DIAS_RECOMPENSA_RECOMENDACION * DIA_MS)
}

export interface FilaRecomendacion {
  /** `null` = no anulada. Anular no borra. */
  anuladaEn: Date | null
  /** `null` = sin fecha: se trata como caducada (no se abre a ciegas). */
  caducaEn: Date | null
  /** `null` = el invitado todavía no se ha dado de alta con patrimonio. */
  canjeadaEn: Date | null
}

export type EstadoRecomendacion = 'pendiente' | 'conseguida' | 'caducada' | 'anulada'

/** Orden: anulada > conseguida (un canje hecho no se deshace) > caducada > pendiente. */
export function estadoRecomendacion(f: FilaRecomendacion, hoy: Date): EstadoRecomendacion {
  if (f.canjeadaEn !== null) return 'conseguida'
  if (f.anuladaEn !== null) return 'anulada'
  if (f.caducaEn === null || hoy.getTime() >= f.caducaEn.getTime()) return 'caducada'
  return 'pendiente'
}

export interface CandidataCanje extends FilaRecomendacion {
  recomendadorIdentidadId: string
  creadaEn: Date
}

/**
 * ¿Puede ESTA identidad canjear ESTA recomendación? Solo si la recomendación sigue `pendiente`, no es suya, y la identidad es
 * NUEVA (creada después de la recomendación: quien ya tenía cuenta no «se da de alta», y si no, recomendar a un conocido ya
 * registrado regalaría cupo). `creadaEn` desconocida (`null`) = no se sabe = no canjea.
 */
export function puedeCanjearRecomendacion(
  c: CandidataCanje,
  invitado: { identidadId: string; creadaEn: Date | null },
  hoy: Date,
): boolean {
  if (estadoRecomendacion(c, hoy) !== 'pendiente') return false
  if (c.recomendadorIdentidadId === invitado.identidadId) return false
  if (invitado.creadaEn === null) return false
  return invitado.creadaEn.getTime() >= c.creadaEn.getTime()
}

/**
 * ¿Tiene la persona una recompensa viva? `canjes` = fechas de canje de las recomendaciones en las que participa (como quien
 * recomendó o como invitado). `null`/vacío = ninguna. Vale la MÁS RECIENTE; nunca se acumulan.
 */
export function recompensaRecomendacionVigente(canjes: ReadonlyArray<Date | null>, hoy: Date): boolean {
  return canjes.some((c) => c !== null && hoy.getTime() < finRecompensaRecomendacion(c).getTime())
}

/** El texto que la persona copia o comparte: solo presenta el portal. Sin compañía, póliza, importe ni nombre de nadie. */
export function textoRecomendacion(enlace: string): string {
  return (
    'Te recomiendo el portal de Grupo ASegura para llevar el patrimonio de tus inmuebles (alquileres, gastos, seguros y vencimientos ' +
    'en un solo sitio). Entra con este mismo correo: ' +
    enlace +
    '\nSi te das de alta y activas “Mi patrimonio”, los dos tenemos más lecturas de facturas con IA durante ' +
    DIAS_RECOMPENSA_RECOMENDACION +
    ' días.'
  )
}

/** Campos que la API NUNCA devuelve de una recomendación: ni el hash del correo ni quién se la dio a quién. */
export const CAMPOS_PROHIBIDOS_EN_RECOMENDACION = ['correoHash', 'correo_hash', 'correo', 'canjeadaPorIdentidadId', 'recomendadorIdentidadId'] as const
