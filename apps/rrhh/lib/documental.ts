import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validarSubida, construirPathStorage, carpetasVisibles, type Actor } from '@central/module-documental'
import { CARPETAS, CARPETAS_IDX } from '@/lib/carpetas'
import { subirObjeto, borrarObjeto, urlFirmada, presignSubida } from '@/lib/storage'

/** Verifica que el empleado pertenece a la empresa (scope multi-tenant). Lanza si no. */
async function exigeEmpleado(empresaId: string, empleadoId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM rrhh.empleados WHERE id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Empleado no encontrado')
}

/** Lista el expediente de un empleado, agrupado por carpeta visible para `actor`, con URLs firmadas. */
export async function listarExpediente(empresaId: string, empleadoId: string, actor: Actor) {
  await exigeEmpleado(empresaId, empleadoId)
  const visibles = new Set(carpetasVisibles(CARPETAS, actor).map(c => c.id))
  const docs = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, carpeta, nombre, tipo, tamano, storage_path, subido_por, caducidad,
           estado_firma, requiere_firma_empresa, firmado_empresa_at, firmado_empresa_nombre, creada_at
    FROM rrhh.documentos
    WHERE empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid
    ORDER BY creada_at DESC`)
  const conUrl = await Promise.all(
    docs.filter(d => visibles.has(d.carpeta)).map(async d => ({
      id: d.id, carpeta: d.carpeta, nombre: d.nombre, tipo: d.tipo,
      tamano: d.tamano != null ? Number(d.tamano) : null,
      subido_por: d.subido_por, caducidad: d.caducidad, estado_firma: d.estado_firma,
      requiere_firma_empresa: d.requiere_firma_empresa,
      firmado_empresa_at: d.firmado_empresa_at, firmado_empresa_nombre: d.firmado_empresa_nombre,
      creada_at: d.creada_at,
      url: await urlFirmada(d.storage_path),
    }))
  )
  return conUrl
}

/** Sube un documento al expediente. `actor` decide permisos por carpeta (vía el módulo). */
export async function subirDocumento(
  empresaId: string, empleadoId: string, actor: Actor,
  entrada: { carpeta: string; nombre: string; tipo?: string | null; tamano?: number | null; bytes: ArrayBuffer }
) {
  await exigeEmpleado(empresaId, empleadoId)
  const v = validarSubida(CARPETAS_IDX, actor, entrada) // lanza si carpeta/permiso/nombre/tamaño no válidos
  const uuid = crypto.randomUUID()
  const path = construirPathStorage({ tipo: 'empleado', id: empleadoId }, v.carpeta, v.nombre, uuid)
  await subirObjeto(path, entrada.bytes, v.tipo ?? 'application/octet-stream')
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}::bigint, ${path}, ${actor})
    RETURNING id`)
  return { id: rows[0].id, carpeta: v.carpeta, nombre: v.nombre }
}

/**
 * Fase 1 del flujo de subida directa: valida permisos y devuelve una URL firmada
 * para que el cliente suba el archivo DIRECTAMENTE a Supabase Storage (sin pasar
 * por la función serverless). Devuelve también el `path` que se usará en la fase 2.
 */
export async function prepararSubidaDirecta(
  empresaId: string, empleadoId: string, actor: Actor,
  entrada: { carpeta: string; nombre: string; tipo?: string | null; tamano?: number | null }
) {
  await exigeEmpleado(empresaId, empleadoId)
  const v = validarSubida(CARPETAS_IDX, actor, entrada)
  const uuid = crypto.randomUUID()
  const path = construirPathStorage({ tipo: 'empleado', id: empleadoId }, v.carpeta, v.nombre, uuid)
  const signedUrl = await presignSubida(path)
  return { signedUrl, path, validado: v }
}

/**
 * Fase 2 del flujo de subida directa: el cliente ya subió el archivo a Storage;
 * aquí solo registramos la fila en BD.
 */
export async function confirmarSubidaDirecta(
  empresaId: string, empleadoId: string, actor: Actor,
  entrada: { path: string; carpeta: string; nombre: string; tipo?: string | null; tamano?: number | null }
) {
  await exigeEmpleado(empresaId, empleadoId)
  const v = validarSubida(CARPETAS_IDX, actor, { carpeta: entrada.carpeta, nombre: entrada.nombre, tipo: entrada.tipo, tamano: entrada.tamano })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}::bigint, ${entrada.path}, ${actor})
    RETURNING id`)
  return { id: rows[0].id, carpeta: v.carpeta, nombre: v.nombre }
}

/** Borra un documento (solo el gestor; scope por empresa). Quita el objeto del Storage. */
export async function borrarDocumento(empresaId: string, empleadoId: string, docId: string) {
  await exigeEmpleado(empresaId, empleadoId)
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT storage_path FROM rrhh.documentos
    WHERE id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Documento no encontrado')
  await borrarObjeto(rows[0].storage_path)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.documentos WHERE id = ${docId}::uuid AND empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid`)
}
