import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { subirObjeto, borrarObjeto, urlFirmada } from '@/lib/storage'

export type DocEmpresa = {
  id: string; empresa_id: string; categoria: string; nombre: string
  storage_path: string; mime_type: string | null; anio: number | null; mes: number | null; subido_at: string
}

export const CATEGORIAS = [
  { id: 'cif', label: 'CIF' },
  { id: 'escritura', label: 'Escritura' },
  { id: 'seguro_social', label: 'Seguro Social (TC2)' },
  { id: 'poliza', label: 'Póliza de seguro' },
  { id: 'otro', label: 'Otro' },
] as const

export async function listarDocumentosEmpresa(empresaId: string): Promise<DocEmpresa[]> {
  const rows = await prisma.$queryRaw<DocEmpresa[]>(Prisma.sql`
    SELECT id, empresa_id, categoria, nombre, storage_path, mime_type, anio, mes, subido_at
    FROM rrhh.empresa_documentos WHERE empresa_id = ${empresaId}::uuid
    ORDER BY subido_at DESC`)
  return JSON.parse(JSON.stringify(rows))
}

export async function subirDocumentoEmpresa(
  empresaId: string, usuarioId: string,
  { categoria, nombre, anio, mes }: { categoria: string; nombre: string; anio?: number; mes?: number },
  file: { bytes: ArrayBuffer; contentType: string; ext: string }
): Promise<DocEmpresa> {
  const uid = crypto.randomUUID()
  const path = `empresa/${empresaId}/${categoria}/${uid}.${file.ext}`
  await subirObjeto(path, file.bytes, file.contentType)
  const rows = await prisma.$queryRaw<DocEmpresa[]>(Prisma.sql`
    INSERT INTO rrhh.empresa_documentos (empresa_id, categoria, nombre, storage_path, mime_type, anio, mes, subido_por)
    VALUES (${empresaId}::uuid, ${categoria}, ${nombre}, ${path}, ${file.contentType}, ${anio ?? null}::int, ${mes ?? null}::int, ${usuarioId}::uuid)
    RETURNING *`)
  return JSON.parse(JSON.stringify(rows[0]))
}

export async function borrarDocumentoEmpresa(empresaId: string, docId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ storage_path: string }[]>(Prisma.sql`
    DELETE FROM rrhh.empresa_documentos WHERE id = ${docId}::uuid AND empresa_id = ${empresaId}::uuid RETURNING storage_path`)
  if (rows[0]) await borrarObjeto(rows[0].storage_path)
}

export async function urlDocumentoEmpresa(path: string): Promise<string | null> {
  return urlFirmada(path)
}
