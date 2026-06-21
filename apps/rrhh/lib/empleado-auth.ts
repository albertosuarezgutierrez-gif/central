import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET no configurado') })() : 'rrhh-dev-secret-change-in-prod')
)

export type SesionEmpleado = { empleado_id: string; empresa_id: string }

export async function firmarSesionEmpleado(s: SesionEmpleado): Promise<string> {
  return new SignJWT({ empresa_id: s.empresa_id })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(s.empleado_id).setExpirationTime('7d').sign(secret)
}

export async function verificarSesionEmpleado(token: string): Promise<SesionEmpleado> {
  const { payload } = await jwtVerify(token, secret)
  return { empleado_id: String(payload.sub), empresa_id: String(payload.empresa_id) }
}
