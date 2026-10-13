// «Invita a tu familia a Grupo ASegura» — las REGLAS puras (sin BD, sin red).
//
// Es una vía cómoda para la invitación «solo te presento» (alcance `ninguno`): un enlace personal que se
// comparte con el menú del móvil. NO abre sesión, NO abre seguros, NO lleva datos de pólizas, y el texto es
// neutro: sin argumento comercial, sin premios ni incentivos (art. 21 LSSI).
// 📌 PENDIENTE LEGAL: cualquier recompensa/incentivo por invitar (descuento, regalo, sorteo) NO está
// implementada a propósito; exige antes revisión legal (LSSI art. 21, RGPD y normativa de mediación).
import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

/** Enlaces nuevos por identidad y día (se cuenta en BD, ventana rodante de 24 h). */
export const MAX_ENLACES_DIA = 5
export const DIAS_VIGENCIA_ENLACE = 30
/** Cuántas identidades nuevas puede traer UN enlace. */
export const MAX_USOS_ENLACE = 10
export const VENTANA_CUPO_ENLACE_MS = 24 * 60 * 60 * 1000
/** Una identidad es «nueva» si se creó hace menos que esto: un cliente que ya existía no cuenta. */
export const VENTANA_IDENTIDAD_NUEVA_MS = 2 * 60 * 60 * 1000

export const RUTA_ENLACE_FAMILIA = '/invitacion/familia'

/** El enlace a compartir. `null` = sin `PORTAL_PUBLIC_URL` https: no se inventa un dominio. */
export function enlaceFamilia(token: string, base = process.env.PORTAL_PUBLIC_URL): string | null {
  const b = base?.trim().replace(/\/+$/, '')
  if (!b || !b.startsWith('https://')) return null
  return `${b}${RUTA_ENLACE_FAMILIA}/${encodeURIComponent(token)}`
}

/** Lo que recibe `navigator.share`. Neutro: ni precios, ni premios, ni datos de nadie. */
export function textoCompartirFamilia(): { title: string; text: string } {
  return {
    title: 'Grupo ASegura',
    text: 'Te presento el portal de Grupo ASegura, donde tengo mis seguros ordenados. Si quieres, échale un vistazo.',
  }
}

/**
 * Palabras que convertirían el texto en argumento comercial o incentivo. El test las exige ausentes del texto
 * que sale y de la página de aterrizaje.
 */
export const PALABRAS_COMERCIALES =
  /premio|descuento|gratis|gratuit|regalo|sorteo|oferta|promoci|ahorr|mejor precio|barat|comisi|bonific|€|euros?\b|\d\s?%/i

export function textoEsNeutro(t: string): boolean {
  return !PALABRAS_COMERCIALES.test(t)
}

/** Un texto que sale NO puede nombrar ningún campo prohibido en una invitación (compañía, matrícula, relación…). */
export function textoSinCamposProhibidos(t: string): boolean {
  const bajo = t.toLowerCase()
  return !CAMPOS_PROHIBIDOS_EN_INVITACION.some((c) => bajo.includes(c.toLowerCase()))
}

export type FilaEnlace = { caducaEn: Date; revocadaEn: Date | null; max: number; usos: number }
export type EstadoEnlace = 'viva' | 'caducada' | 'revocada' | 'agotada'

export function estadoEnlace(e: FilaEnlace, hoy: Date): EstadoEnlace {
  if (e.revocadaEn !== null) return 'revocada'
  if (e.caducaEn.getTime() <= hoy.getTime()) return 'caducada'
  if (e.usos >= e.max) return 'agotada'
  return 'viva'
}

export function caducidadEnlace(desde: Date): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA_ENLACE * 24 * 60 * 60 * 1000)
}

export function esIdentidadNueva(creadaEn: Date, ahora: Date): boolean {
  const dt = ahora.getTime() - creadaEn.getTime()
  return dt >= -60_000 && dt <= VENTANA_IDENTIDAD_NUEVA_MS
}

export type DecisionUso = 'registrar' | 'enlace_no_vale' | 'es_propio' | 'ya_existia'

/**
 * ¿Hay que anotar esta entrada y avisar al corredor? Solo si el enlace vive, quien entra no es quien lo creó
 * y la identidad es NUEVA. Un cliente que ya tenía cuenta no es un «nuevo usuario invitado».
 */
export function decidirUso(d: {
  estado: EstadoEnlace
  creadorId: string
  identidadId: string
  identidadCreadaEn: Date
  ahora: Date
}): DecisionUso {
  if (d.estado !== 'viva') return 'enlace_no_vale'
  if (d.creadorId === d.identidadId) return 'es_propio'
  if (!esIdentidadNueva(d.identidadCreadaEn, d.ahora)) return 'ya_existia'
  return 'registrar'
}

export type ResumenFamilia = { enviadas: number; aceptadas: number }

/**
 * Contador para «Invitar a tu familia». `enviadas` = enlaces compartidos + correos «solo te presento»;
 * `aceptadas` = identidades que entraron por un enlace + correos «solo te presento» aceptados.
 * Solo CIFRAS: nunca a quién (regla existente: un invitado que no aceptó no se revela). Nunca negativo.
 */
export function resumenFamilia(d: {
  enlaces: number
  usosEnlaces: number
  correosPresento: number
  correosPresentoAceptados: number
}): ResumenFamilia {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  const enviadas = n(d.enlaces) + n(d.correosPresento)
  // Sin tope por `enviadas`: un enlace puede traer a varias personas.
  const aceptadas = n(d.usosEnlaces) + n(d.correosPresentoAceptados)
  return { enviadas, aceptadas }
}

/** El aviso al corredor. Sin ningún dato personal del invitado: solo que ha entrado uno. */
export function mensajeAvisoFamilia(): string {
  return '👨‍👩‍👧 Nuevo usuario invitado por un cliente: ha entrado al portal por un enlace de «Invita a tu familia».'
}
