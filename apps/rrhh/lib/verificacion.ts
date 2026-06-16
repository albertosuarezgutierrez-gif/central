import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { aFirmaPublica, type FirmaPublica } from '@/lib/firma-publica'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Verificación PÚBLICA (sin auth) de un documento por su `documento_id`. Devuelve la última firma
 * registrada en formato public-safe, o null si el id no es UUID / no hay firma. SELECT curado:
 * nunca trae ip/user_agent/email/dni/evidencia.
 */
export async function verificarDocumento(documentoId: string): Promise<FirmaPublica | null> {
  if (!UUID_RE.test(documentoId)) return null
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT f.firmante_nombre, f.sello_tiempo, f.doc_hash, f.algoritmo, f.metodo,
           d.nombre AS documento_nombre
    FROM rrhh.firmas f
    JOIN rrhh.documentos d ON d.id = f.documento_id
    WHERE f.documento_id = ${documentoId}::uuid
    ORDER BY f.creada_at DESC
    LIMIT 1`)
  const row = rows[0]
  if (!row) return null
  return aFirmaPublica(row as Parameters<typeof aFirmaPublica>[0])
}
