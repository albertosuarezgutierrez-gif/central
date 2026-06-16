import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { FirmaPropia, nombreCoincide, type ContextoFirma, type Firmante } from '@central/core-firma'
import { descargarObjeto } from '@/lib/storage'

const proveedor = new FirmaPropia()

/** El gestor solicita la firma de un documento (estado_firma → 'pendiente'). Scope por empresa. */
export async function solicitarFirma(empresaId: string, empleadoId: string, docId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT estado_firma FROM rrhh.documentos
    WHERE id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  const doc = rows[0]
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estado_firma === 'firmado') throw new Error('El documento ya está firmado')
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.documentos SET estado_firma = 'pendiente' WHERE id = ${docId}::uuid`)
}

/** El empleado firma el documento (firma avanzada propia, eIDAS art. 26). Devuelve la evidencia. */
export async function firmarDocumento(
  empresaId: string, empleadoId: string, docId: string,
  ctx: { ip?: string | null; user_agent?: string | null; nombre_confirmado: string }
) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT d.storage_path, d.estado_firma, e.nombre, e.email, e.dni
    FROM rrhh.documentos d JOIN rrhh.empleados e ON e.id = d.empleado_id
    WHERE d.id = ${docId}::uuid AND d.empleado_id = ${empleadoId}::uuid AND d.empresa_id = ${empresaId}::uuid LIMIT 1`)
  const doc = rows[0]
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estado_firma === 'firmado') throw new Error('El documento ya está firmado')
  if (doc.estado_firma !== 'pendiente') throw new Error('Este documento no requiere firma')
  if (!nombreCoincide(ctx.nombre_confirmado, doc.nombre)) throw new Error('El nombre no coincide con el del titular')

  const bytes = await descargarObjeto(doc.storage_path)
  const firmante: Firmante = { id: empleadoId, nombre: doc.nombre, email: doc.email, dni: doc.dni }
  const contexto: ContextoFirma = { fecha: new Date().toISOString(), ip: ctx.ip ?? null, user_agent: ctx.user_agent ?? null }
  const evidencia = await proveedor.firmar({
    firmante, documento_id: docId, bytes, contexto, metodo: 'sesion_token', nombre_confirmado: ctx.nombre_confirmado,
  })

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.firmas (empresa_id, empleado_id, documento_id, doc_hash, algoritmo, metodo,
        firmante_nombre, firmante_email, firmante_dni, ip, user_agent, sello_tiempo, evidencia)
      VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${docId}::uuid, ${evidencia.doc_hash}, ${evidencia.algoritmo}, ${evidencia.metodo},
        ${firmante.nombre}, ${firmante.email}, ${firmante.dni}, ${contexto.ip}, ${contexto.user_agent},
        ${contexto.fecha}::timestamptz, ${JSON.stringify(evidencia)}::jsonb)`),
    prisma.$executeRaw(Prisma.sql`UPDATE rrhh.documentos SET estado_firma = 'firmado' WHERE id = ${docId}::uuid`),
  ])
  return evidencia
}
