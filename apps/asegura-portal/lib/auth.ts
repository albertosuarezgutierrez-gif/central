import {
  createSessionToken as createToken,
  verifySessionToken as verifyToken,
  requireSecret,
} from '@central/core-identity'
import { createHash } from 'node:crypto'
import { IDENTIDAD_CORREDOR_ID, SESION_CORREDOR, SESION_CORREDOR_SEGUNDOS } from '@central/module-seguros-portal'

import { COOKIE_NAME } from './auth-cookie'
export { COOKIE_NAME }
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
} as const

// Secreto PROPIO del portal, distinto del panel del corredor: una sesión del
// portal no debe valer jamás en la app interna. `requireSecret` lanza en
// producción si falta y solo cae al literal en desarrollo — es lo que exige el
// guardián `test/regression-secrets.test.ts` (ver `packages/core-identity/src/secret.ts`).
const SECRET = () => requireSecret('ASEGURA_PORTAL_SESSION_SECRET', 'portal-dev-secret-change-in-prod')

/**
 * Hash del canal para poder buscarlo sin guardar el email o el móvil en claro.
 * Va con pimienta de entorno: sin ella, una tabla de hashes de emails es
 * trivial de revertir con un diccionario.
 *
 * Por eso la pimienta usa `requireSecret` y no `?? ''`. Con el fallback vacío la
 * app NO fallaba: seguía funcionando y guardaba SHA-256 pelados del email, que
 * es justo lo que este hash existe para evitar — la protección se apagaba sola y
 * nadie se enteraba (medido en producción el 03/09/2026: el envío del código
 * funcionaba con la env sin poner). El guardián `test/regression-secrets.test.ts`
 * no lo caza a propósito, porque su regla —«una cadena vacía no es una credencial
 * usable»— es cierta para un secreto que FIRMA y falsa para una pimienta.
 */
export function hashCanal(valor: string): string {
  return hashConPimienta(valor.trim().toLowerCase())
}

/**
 * La ÚNICA forma de hashear de esta app: SHA-256 sobre `<pimienta>:<valor>`.
 *
 * 🚨 No cambiar la forma de esta cadena ni la pimienta: `hashCanal` produce los
 * hashes que ya están escritos en `portal_canal`, y si dejan de casar cada
 * usuario crea una identidad nueva vacía (landmine del CLAUDE.md de la app).
 */
function hashConPimienta(valor: string): string {
  const pimienta = requireSecret('ASEGURA_PORTAL_CANAL_PEPPER', 'portal-dev-pepper-change-in-prod')
  return createHash('sha256').update(`${pimienta}:${valor}`).digest('hex')
}

/**
 * Hash del código de un solo uso, para que `portal_codigo` NO guarde los 6
 * dígitos en claro. Una lectura de la BD, un volcado o una copia de seguridad
 * expuesta dejaban entrar como cualquier cliente que acabara de pedir código.
 *
 * 🚨 La pimienta es la que hace que esto sirva de algo, y es la MISMA de
 * `hashCanal` a propósito (una segunda forma de hashear es una segunda cosa que
 * se puede desincronizar). Un SHA-256 pelado de 6 dígitos se revierte con un
 * bucle de 10^6 en un segundo: sin pimienta, el hash sería decorativo.
 *
 * El prefijo `codigo:` separa el dominio: el hash de un código nunca puede
 * coincidir con el de un canal, así que una fila de una tabla no vale en la otra.
 */
export function hashCodigo(codigo: string): string {
  return hashConPimienta(`codigo:${codigo}`)
}

export async function crearSesion(identidadId: string): Promise<string> {
  const { token } = await createToken({ claims: { identidadId }, secret: SECRET(), expiresIn: '30d' })
  return token
}

/**
 * La sesión del CORREDOR mirando el portal como lo ve un cliente (08/09/2026).
 * Es la identidad dedicada `IDENTIDAD_CORREDOR_ID` con el cliente que se mira
 * en el propio token: quien lea la cookie sabe que NO es el cliente, y la
 * banda de aviso y el veto a escrituras (`middleware.ts`) salen de aquí.
 * Dura 4 h, no 30 días: es una consulta, no una cuenta.
 */
export type SesionCorredor = { clienteId: string }

export type SesionPortal = { identidadId: string; corredor: SesionCorredor | null }

export async function crearSesionCorredor(clienteId: string): Promise<string> {
  const { token } = await createToken({
    claims: { identidadId: IDENTIDAD_CORREDOR_ID, corredor: { clienteId } },
    secret: SECRET(),
    expiresIn: SESION_CORREDOR,
  })
  return token
}

export const COOKIE_OPTS_CORREDOR = { ...COOKIE_OPTS, maxAge: SESION_CORREDOR_SEGUNDOS } as const

export function leerCorredor(payload: Record<string, unknown>): SesionCorredor | null {
  const c = payload.corredor
  if (typeof c !== 'object' || c === null) return null
  const clienteId = (c as Record<string, unknown>).clienteId
  return typeof clienteId === 'string' && clienteId !== '' ? { clienteId } : null
}

export async function verificarSesion(token: string): Promise<SesionPortal | null> {
  const payload = await verifyToken(token, SECRET())
  if (!payload) return null
  // Sin `identidadId` no es una sesión (p. ej. la cookie de acceso por WhatsApp, firmada con el
  // mismo secreto, puesta a mano en la cookie de sesión): nadie, nunca una identidad `undefined`.
  if (typeof payload.identidadId !== 'string' || payload.identidadId === '') return null
  return { identidadId: payload.identidadId, corredor: leerCorredor(payload) }
}

// ─── El acceso por el CÓDIGO DEL WHATSAPP (07/10/2026) ──────────────────────
//
// Quien abre `/presupuesto/<token>` con el código que Alberto le mandó por WhatsApp NO tiene
// identidad del portal (puede no tener ni correo). Lo que recibe es una cookie APARTE que vale
// para ESE presupuesto y nada más: ni bóveda, ni pólizas, ni otro presupuesto. Lleva el token del
// enlace porque el código va atado a él (`hashCodigoWhatsapp`) y porque cada lectura comprueba
// que ese token SIGUE siendo el del presupuesto: si Alberto regenera el enlace o lo avisa por
// correo, el token rota y esta cookie deja de abrir sola.
//
// 🚨 No es una sesión: no tiene `identidadId`, y `verificarSesion` la rechaza aunque alguien la
// copie en la cookie de sesión. Y la sesión no vale aquí: se exige el claim `accesoWhatsapp`.

export const COOKIE_ACCESO_WHATSAPP = 'asegura_portal_presupuesto'
/** Una visita para leer y firmar, no una cuenta: 4 h (como la vista de corredor). */
export const ACCESO_WHATSAPP_SEGUNDOS = 4 * 60 * 60
export const COOKIE_OPTS_ACCESO_WHATSAPP = { ...COOKIE_OPTS, maxAge: ACCESO_WHATSAPP_SEGUNDOS } as const

export type AccesoWhatsapp = { presupuestoId: string; token: string }

export async function crearAccesoWhatsapp(a: AccesoWhatsapp): Promise<string> {
  const { token } = await createToken({
    claims: { accesoWhatsapp: { presupuestoId: a.presupuestoId, token: a.token } },
    secret: SECRET(),
    expiresIn: `${ACCESO_WHATSAPP_SEGUNDOS}s`,
  })
  return token
}

export async function verificarAccesoWhatsapp(jwt: string): Promise<AccesoWhatsapp | null> {
  const payload = await verifyToken(jwt, SECRET())
  if (!payload || payload.identidadId !== undefined) return null
  const a = payload.accesoWhatsapp
  if (typeof a !== 'object' || a === null) return null
  const { presupuestoId, token } = a as Record<string, unknown>
  if (typeof presupuestoId !== 'string' || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null
  return { presupuestoId, token }
}
