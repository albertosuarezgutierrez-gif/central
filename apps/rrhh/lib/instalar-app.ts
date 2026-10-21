// Sugerencia de «instalar» el portal en la pantalla de inicio (rrhh tiene manifest + sw.js).
// Android: solo si el navegador lanzó `beforeinstallprompt` (botón «Instalar»).
// iOS: solo en Safari y fuera del modo standalone (no hay API: se explica «Compartir > Añadir…»).
import type { Plataforma } from './geolocalizacion-fichaje'

export const CLAVE_INSTALAR_DESCARTADO = 'rrhh_instalar_descartado'
export const TEXTO_INSTALAR_IOS = 'Para fichar más rápido, añade el portal a tu pantalla de inicio: Compartir > Añadir a pantalla de inicio.'
export const TEXTO_INSTALAR_ANDROID = 'Para fichar más rápido, instala el portal en tu pantalla de inicio.'

/** Safari de iOS de verdad: Chrome/Firefox/Edge en iOS no ofrecen «Añadir a pantalla de inicio» igual. */
export function esSafariIOS(userAgent: string): boolean {
  return /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(userAgent)
}

export function avisoInstalar(o: {
  plataforma: Plataforma; userAgent: string; standalone: boolean; hayPromptAndroid: boolean; descartado: boolean
}): 'android' | 'ios' | null {
  if (o.descartado || o.standalone) return null
  if (o.plataforma === 'android' && o.hayPromptAndroid) return 'android'
  if (o.plataforma === 'ios' && esSafariIOS(o.userAgent)) return 'ios'
  return null
}
