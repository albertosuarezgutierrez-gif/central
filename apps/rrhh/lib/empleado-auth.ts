import { SignJWT, jwtVerify } from 'jose'
import { requireSecret } from '@central/core-identity'

// Mismo secreto que el panel del responsable (`JWT_SECRET`), así que los tokens se SEPARAN por
// tipo: el del empleado lleva `typ: 'empleado'` y NO lleva `jti`; el del responsable lleva
// `typ: 'responsable'` + `jti` y `lib/auth.ts` rechaza cualquier otro. Sin esa separación, un
// empleado pegaba su cookie en `rrhh_session` y entraba al panel de su empresa (05/10/2026).
const clave = () => new TextEncoder().encode(requireSecret('JWT_SECRET', 'rrhh-dev-secret-change-in-prod'))

/** 90 días: un operario no puede pedir código cada mañana a las 7. Se revoca con `sesion_version`. */
export const SESION_EMPLEADO_DIAS = 90
export const COOKIE_EMPLEADO = 'rrhh_empleado'
export const COOKIE_OPTS_EMPLEADO = {
  httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * SESION_EMPLEADO_DIAS,
} as const

/** `v` = `rrhh.empleados.sesion_version` al firmar. Si el responsable «Cierra sesiones», deja de casar. */
export type SesionEmpleado = { empleado_id: string; empresa_id: string; v: number }

export async function firmarSesionEmpleado(s: SesionEmpleado): Promise<string> {
  return new SignJWT({ typ: 'empleado', empresa_id: s.empresa_id, v: s.v })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(s.empleado_id)
    .setIssuedAt().setExpirationTime(`${SESION_EMPLEADO_DIAS}d`).sign(clave())
}

/**
 * Solo FIRMA y forma; la vigencia (versión, empleado activo) la comprueba `getSesionEmpleado`
 * contra la BD. Un token sin `typ: 'empleado'` o sin `v` (los de 7 días anteriores al 05/10/2026)
 * no vale: esa gente vuelve a entrar una vez.
 */
export async function verificarSesionEmpleado(token: string): Promise<SesionEmpleado> {
  const { payload } = await jwtVerify(token, clave(), { algorithms: ['HS256'] })
  if (payload.typ !== 'empleado') throw new Error('No es una sesión de empleado')
  if (typeof payload.v !== 'number' || !Number.isInteger(payload.v)) throw new Error('Sesión sin versión')
  if (typeof payload.sub !== 'string' || typeof payload.empresa_id !== 'string') throw new Error('Sesión mal formada')
  return { empleado_id: payload.sub, empresa_id: payload.empresa_id, v: payload.v }
}

/**
 * ¿Sigue vigente esta sesión? Puro para testearlo: la fila es la del empleado (id + empresa del
 * token) o `null` si no existe en ESA empresa.
 */
export function sesionVigente(s: SesionEmpleado, fila: { sesion_version: number; estado: string } | null): boolean {
  return !!fila && fila.estado === 'activo' && fila.sesion_version === s.v
}

// ── Ticket del paso intermedio (código ya validado → elegir empresa y/o PIN) ─────────────────
// Va en cookie httpOnly de 10 min. Ata el paso siguiente a la fila de código ya gastada
// (`otp`, donde se cuentan los intentos de PIN) y a los empleados de ESE email: el cliente solo
// puede elegir entre ellos.
export const COOKIE_TICKET = 'rrhh_acceso_ticket'
export const COOKIE_OPTS_TICKET = { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/e/acceso', maxAge: 10 * 60 } as const

export type TicketAcceso = { otp_id: string; empleados: string[] }

export async function firmarTicketAcceso(t: TicketAcceso): Promise<string> {
  return new SignJWT({ typ: 'acceso_ticket', empleados: t.empleados })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(t.otp_id)
    .setIssuedAt().setExpirationTime('10m').sign(clave())
}

export async function verificarTicketAcceso(token: string): Promise<TicketAcceso> {
  const { payload } = await jwtVerify(token, clave(), { algorithms: ['HS256'] })
  if (payload.typ !== 'acceso_ticket' || typeof payload.sub !== 'string') throw new Error('Ticket no válido')
  const empleados = Array.isArray(payload.empleados) ? payload.empleados.filter((x): x is string => typeof x === 'string') : []
  return { otp_id: payload.sub, empleados }
}
