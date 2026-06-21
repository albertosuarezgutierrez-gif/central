// Expediente documental de la limpiadora (espejo de apps/rrhh/lib/documental.ts).
// Usa el motor puro @central/module-documental (permisos por carpeta, paths) y persiste en
// `documentos_limpiadora`, scopeado por (empresa_id, limpiadora_id). OwnerRef = {tipo:'limpiadora', id}.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validarSubida, construirPathStorage, carpetasVisibles, type Actor } from '@central/module-documental'
import { CARPETAS, CARPETAS_IDX } from '@/lib/carpetas-limpiadora'
import { subirObjeto, borrarObjeto, urlFirmada } from '@/lib/storage-limpiadora'

/** Verifica que la limpiadora pertenece a la empresa (scope multi-tenant). Lanza si no. */
async function exigeLimpiadora(empresaId: string, limpiadoraId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM limpiadoras WHERE id = ${limpiadoraId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Limpiadora no encontrada')
}

/** Lista el expediente de una limpiadora, agrupado por carpeta visible para `actor`, con URLs firmadas. */
export async function listarExpediente(empresaId: string, limpiadoraId: string, actor: Actor) {
  await exigeLimpiadora(empresaId, limpiadoraId)
  const visibles = new Set(carpetasVisibles(CARPETAS, actor).map(c => c.id))
  const docs = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, carpeta, nombre, tipo, tamano, storage_path, subido_por, caducidad, estado_firma, creada_at
    FROM documentos_limpiadora WHERE limpiadora_id = ${limpiadoraId}::uuid AND empresa_id = ${empresaId}::uuid
    ORDER BY creada_at DESC`)
  return Promise.all(
    docs.filter(d => visibles.has(d.carpeta)).map(async d => ({
      id: d.id, carpeta: d.carpeta, nombre: d.nombre, tipo: d.tipo, tamano: d.tamano,
      subido_por: d.subido_por, caducidad: d.caducidad, estado_firma: d.estado_firma, creada_at: d.creada_at,
      url: await urlFirmada(d.storage_path),
    }))
  )
}

/** Sube un documento al expediente. `actor` decide permisos por carpeta (vía el módulo). Devuelve el id. */
export async function subirDocumento(
  empresaId: string, limpiadoraId: string, actor: Actor,
  entrada: { carpeta: string; nombre: string; tipo?: string | null; tamano?: number | null; bytes: ArrayBuffer }
) {
  await exigeLimpiadora(empresaId, limpiadoraId)
  const v = validarSubida(CARPETAS_IDX, actor, entrada) // lanza si carpeta/permiso/nombre/tamaño no válidos
  const uuid = crypto.randomUUID()
  const path = construirPathStorage({ tipo: 'limpiadora', id: limpiadoraId }, v.carpeta, v.nombre, uuid)
  await subirObjeto(path, entrada.bytes, v.tipo ?? 'application/octet-stream')
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO documentos_limpiadora (empresa_id, limpiadora_id, carpeta, nombre, tipo, tamano, storage_path, subido_por)
    VALUES (${empresaId}::uuid, ${limpiadoraId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}, ${path}, ${actor})
    RETURNING id::text`)
  return { id: rows[0].id, carpeta: v.carpeta, nombre: v.nombre }
}

/** Borra un documento (solo el gestor; scope por empresa). Quita el objeto del Storage. */
export async function borrarDocumento(empresaId: string, limpiadoraId: string, docId: string) {
  await exigeLimpiadora(empresaId, limpiadoraId)
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT storage_path FROM documentos_limpiadora
    WHERE id = ${docId}::uuid AND limpiadora_id = ${limpiadoraId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Documento no encontrado')
  await prisma.$executeRaw(Prisma.sql`DELETE FROM documentos_limpiadora WHERE id = ${docId}::uuid`)
  await borrarObjeto(rows[0].storage_path)
}
