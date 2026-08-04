import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionToken, type TipoSesion } from './auth'
import { prisma } from './db'

export type Sesion = {
  id: string // SIEMPRE la cuenta (scope multi-tenant), tanto oficina como empleado
  nombre: string
  email: string
  tipo: TipoSesion
  empleadoId: string | null
}

// Verificación STATELESS (solo firma JWT + existencia), igual que transporte:
// no valida `session_jti` para no acoplarse a la sesión de plataforma (comparten `cuentas`).
export async function getSession(): Promise<Sesion | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifySessionToken(token)
  if (!payload) return null

  if (payload.tipo === 'empleado' && payload.empId) {
    const emp = await prisma.almacenEmpleado.findFirst({
      where: { id: payload.empId, cuentaId: payload.cuentaId, activo: true },
      select: { id: true, nombre: true, usuario: true },
    })
    if (!emp) return null
    return { id: payload.cuentaId, nombre: emp.nombre, email: emp.usuario, tipo: 'empleado', empleadoId: emp.id }
  }

  const cuenta = await prisma.cuenta.findFirst({
    where: { id: payload.cuentaId },
    select: { id: true, nombre: true, email: true },
  })
  if (!cuenta) return null
  return { id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, tipo: 'oficina', empleadoId: null }
}

export async function requireSession() {
  const s = await getSession()
  if (!s) throw new Error('Unauthenticated')
  return s
}
