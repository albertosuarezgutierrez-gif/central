import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validarTexto, type ParteChat, type Mensaje } from '@central/module-chat'

async function exigeEmpleado(empresaId: string, empleadoId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM rrhh.empleados WHERE id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Empleado no encontrado')
}

/** Lista el hilo de un empleado y marca como leídos los mensajes de la contraparte para `lector`. */
export async function listarHilo(empresaId: string, empleadoId: string, lector: ParteChat): Promise<Mensaje[]> {
  await exigeEmpleado(empresaId, empleadoId)
  const campo = lector === 'gestor' ? Prisma.raw('leido_gestor') : Prisma.raw('leido_titular')
  const otra: ParteChat = lector === 'gestor' ? 'titular' : 'gestor'
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.mensajes SET ${campo} = true
    WHERE empleado_id = ${empleadoId}::uuid AND remitente = ${otra} AND ${campo} = false`)
  return prisma.$queryRaw<Mensaje[]>(Prisma.sql`
    SELECT id, remitente, texto, leido_gestor, leido_titular, creada_at
    FROM rrhh.mensajes WHERE empleado_id = ${empleadoId}::uuid ORDER BY creada_at ASC`)
}

/** Envía un mensaje de `remitente` en el hilo del empleado. */
export async function enviarMensaje(empresaId: string, empleadoId: string, remitente: ParteChat, texto: string) {
  await exigeEmpleado(empresaId, empleadoId)
  const t = validarTexto(texto)
  const leidoRemitente = remitente === 'gestor' ? Prisma.sql`true, false` : Prisma.sql`false, true`
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.mensajes (empresa_id, empleado_id, remitente, texto, leido_gestor, leido_titular)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${remitente}, ${t}, ${leidoRemitente})
    RETURNING id, remitente, texto, leido_gestor, leido_titular, creada_at`)
  return rows[0] as Mensaje
}
