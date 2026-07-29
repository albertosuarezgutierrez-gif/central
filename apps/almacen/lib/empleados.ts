// Servicio de empleados (Fase 3). Solo la oficina crea/edita empleados.
import { prisma } from './db'
import { hashPassword } from './auth'

export async function crearEmpleado(
  cuentaId: string,
  input: { nombre: string; usuario: string; password: string; telefono?: string | null },
) {
  const nombre = input.nombre.trim()
  const usuario = input.usuario.trim().toLowerCase()
  if (!nombre) throw new Error('El nombre es obligatorio')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(usuario)) throw new Error('El usuario debe ser un email válido')
  if (input.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
  const dup = await prisma.almacenEmpleado.findFirst({ where: { cuentaId, usuario } })
  if (dup) throw new Error('Ya existe un empleado con ese usuario')
  const passwordHash = await hashPassword(input.password)
  return prisma.almacenEmpleado.create({
    data: { cuentaId, nombre, usuario, passwordHash, telefono: input.telefono?.trim() || null },
  })
}

export async function editarEmpleado(
  cuentaId: string,
  empleadoId: string,
  input: { nombre?: string; usuario?: string; telefono?: string | null },
) {
  const data: Record<string, unknown> = {}
  if (input.nombre !== undefined) {
    const nombre = input.nombre.trim()
    if (!nombre) throw new Error('El nombre es obligatorio')
    data.nombre = nombre
  }
  if (input.usuario !== undefined) {
    const usuario = input.usuario.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(usuario)) throw new Error('El usuario debe ser un email válido')
    const dup = await prisma.almacenEmpleado.findFirst({ where: { cuentaId, usuario, id: { not: empleadoId } } })
    if (dup) throw new Error('Ya existe un empleado con ese usuario')
    data.usuario = usuario
  }
  if (input.telefono !== undefined) data.telefono = input.telefono?.trim() || null
  if (Object.keys(data).length === 0) return
  const r = await prisma.almacenEmpleado.updateMany({ where: { id: empleadoId, cuentaId }, data })
  if (r.count === 0) throw new Error('Empleado no encontrado')
}

export async function resetPassword(cuentaId: string, empleadoId: string, password: string) {
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
  const passwordHash = await hashPassword(password)
  const r = await prisma.almacenEmpleado.updateMany({ where: { id: empleadoId, cuentaId }, data: { passwordHash } })
  if (r.count === 0) throw new Error('Empleado no encontrado')
}

export async function desactivarEmpleado(cuentaId: string, empleadoId: string) {
  await prisma.almacenEmpleado.updateMany({ where: { id: empleadoId, cuentaId }, data: { activo: false } })
}
