// Reglas PURAS de la sesión del responsable (26/10/2026): duración con «Recordar este dispositivo», última empresa
// recordada (Pilar, varias empresas) y enmascarado de correos para los logs. Sin BD ni Next → testeable.

export const SESION_RESPONSABLE_DIAS = 30
/** Con la casilla «Recordar este dispositivo» marcada. Sin ella, se mantiene la duración de siempre. */
export const SESION_RECORDADA_DIAS = 90
export const COOKIE_SESION_RESPONSABLE = 'rrhh_session'
export const COOKIE_ULTIMA_EMPRESA = 'rrhh_ultima_empresa'
const DIA = 60 * 60 * 24

export function diasSesion(recordar: boolean | null | undefined): number {
  return recordar === true ? SESION_RECORDADA_DIAS : SESION_RESPONSABLE_DIAS
}

/** Opciones de la cookie de sesión: la caducidad de la cookie y la del JWT salen del MISMO valor. */
export function opcionesCookieSesion(recordar: boolean | null | undefined) {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DIA * diasSesion(recordar) } as const
}

/** Última empresa elegida: no es secreta (un uuid) y se REVALIDA contra las empresas autorizadas al usarla. */
export const OPCIONES_COOKIE_ULTIMA_EMPRESA = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DIA * 365 } as const

/** Lee una cookie de la cabecera `Cookie` (sin depender de `next/headers`, para poder usarla en rutas y tests). */
export function leerCookie(cabecera: string | null | undefined, nombre: string): string | null {
  if (!cabecera) return null
  for (const trozo of cabecera.split(';')) {
    const i = trozo.indexOf('=')
    if (i < 0) continue
    if (trozo.slice(0, i).trim() !== nombre) continue
    try { return decodeURIComponent(trozo.slice(i + 1).trim()) || null } catch { return null }
  }
  return null
}

/**
 * Empresa a la que entrar sin preguntar: la única que tiene, o la recordada SI sigue entre las autorizadas.
 * `null` = hay que elegir. Una cookie manipulada o de una empresa ya revocada no cuenta nunca.
 */
export function empresaDeEntrada(empresas: { id: string }[], recordada: string | null | undefined): string | null {
  if (empresas.length === 1) return empresas[0].id
  const r = (recordada ?? '').trim().toLowerCase()
  if (!r) return null
  return empresas.find(e => e.id.toLowerCase() === r)?.id ?? null
}

/** `pilar@ejemplo.es` → `p***@e***.es`. Para logs de diagnóstico: nunca el correo entero. */
export function enmascararEmail(email: unknown): string {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const at = e.lastIndexOf('@')
  if (at < 1 || at === e.length - 1) return '(correo no válido)'
  const dominio = e.slice(at + 1)
  const punto = dominio.indexOf('.')
  const cabeza = (s: string) => `${s[0]}***`
  const dom = punto > 0 ? `${cabeza(dominio)}${dominio.slice(punto)}` : cabeza(dominio)
  return `${cabeza(e.slice(0, at))}@${dom}`
}
