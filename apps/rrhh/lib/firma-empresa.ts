import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashDocumento } from '@central/core-firma'
import { descargarObjeto } from '@/lib/storage'

/**
 * Firma un documento como empresa (primera fase del flujo de doble firma).
 * Calcula el hash del documento original, registra la evidencia en la fila del documento
 * y avanza el estado de `pendiente_empresa` → `pendiente` (el empleado puede firmar).
 */
export async function firmarComoEmpresa(
  empresaId: string,
  docId: string,
  firmante: { usuario_id: string; nombre: string },
): Promise<{ sello_tiempo: string; doc_hash: string }> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, storage_path, estado_firma, requiere_firma_empresa
    FROM rrhh.documentos
    WHERE id = ${docId}::uuid AND empresa_id = ${empresaId}::uuid
    LIMIT 1`)
  const doc = rows[0]
  if (!doc) throw new Error('Documento no encontrado')
  if (!doc.requiere_firma_empresa) throw new Error('Este documento no requiere firma de empresa')
  if (doc.estado_firma !== 'pendiente_empresa') throw new Error('El documento no está pendiente de firma de empresa')

  const bytes = await descargarObjeto(doc.storage_path)
  const doc_hash = await hashDocumento(new Uint8Array(bytes))
  const sello_tiempo = new Date()

  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.documentos
    SET estado_firma            = 'pendiente',
        firmado_empresa_at      = ${sello_tiempo}::timestamptz,
        firmado_empresa_nombre  = ${firmante.nombre},
        firmado_empresa_hash    = ${doc_hash}
    WHERE id = ${docId}::uuid`)

  return { sello_tiempo: sello_tiempo.toISOString(), doc_hash }
}
