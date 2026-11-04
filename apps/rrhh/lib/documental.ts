import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validarSubida, construirPathStorage, carpetasVisibles, type Actor } from '@central/module-documental'
import { CARPETAS, CARPETAS_IDX } from '@/lib/carpetas'
import { subirObjeto, borrarObjeto, urlFirmada, presignSubida } from '@/lib/storage'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { empleadoPuedeVerDocumento, validarVisibilidad } from '@/lib/visibilidad-documento'

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
  // Solo el GESTOR ve los documentos ocultos al empleado (`visible_empleado = false`, migración 0029). Cualquier otro
  // actor (el titular, y ante la duda) recibe solo lo visible — las nóminas, siempre — y NUNCA su URL firmada.
  const docs = actor === ACTOR_GESTOR
    ? await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, carpeta, nombre, tipo, tamano, storage_path, subido_por, caducidad,
           estado_firma, requiere_firma_empresa, firmado_empresa_at, firmado_empresa_nombre, creada_at,
           categoria_doc, resumen, firma_solicitada_at, visto_empleado_at, visible_empleado
    FROM rrhh.documentos
    WHERE empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid
    ORDER BY creada_at DESC`)
    : await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, carpeta, nombre, tipo, tamano, storage_path, subido_por, caducidad,
           estado_firma, requiere_firma_empresa, firmado_empresa_at, firmado_empresa_nombre, creada_at,
           categoria_doc, resumen, firma_solicitada_at, visto_empleado_at, visible_empleado
    FROM rrhh.documentos
    WHERE empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid
      AND (visible_empleado OR carpeta = 'nominas')
    ORDER BY creada_at DESC`)
  const conUrl = await Promise.all(
    docs.filter(d => visibles.has(d.carpeta) && (actor === ACTOR_GESTOR || empleadoPuedeVerDocumento(d))).map(async d => ({
      id: d.id, carpeta: d.carpeta, nombre: d.nombre, tipo: d.tipo,
      tamano: d.tamano != null ? Number(d.tamano) : null,
      subido_por: d.subido_por, caducidad: d.caducidad, estado_firma: d.estado_firma,
      requiere_firma_empresa: d.requiere_firma_empresa,
      firmado_empresa_at: d.firmado_empresa_at, firmado_empresa_nombre: d.firmado_empresa_nombre,
      creada_at: d.creada_at,
      categoria_doc: d.categoria_doc ?? null, resumen: d.resumen ?? null,
      firma_solicitada_at: d.firma_solicitada_at ?? null, visto_empleado_at: d.visto_empleado_at ?? null,
      visible_empleado: d.visible_empleado !== false,
      url: await urlFirmada(d.storage_path),
    }))
  )
  return conUrl
}

/** Sube un documento al expediente. `actor` decide permisos por carpeta (vía el módulo). */
export async function subirDocumento(
  empresaId: string, empleadoId: string, actor: Actor,
  entrada: { carpeta: string; nombre: string; tipo?: string | null; tamano?: number | null; bytes: ArrayBuffer; visible_empleado?: boolean }
) {
  await exigeEmpleado(empresaId, empleadoId)
  const v = validarSubida(CARPETAS_IDX, actor, entrada) // lanza si carpeta/permiso/nombre/tamaño no válidos
  const visible = entrada.visible_empleado !== false // por defecto visible; ocultar es cosa del gestor
  if (!visible && actor !== ACTOR_GESTOR) throw new Error('Sin permiso para ocultar documentos')
  const errVis = validarVisibilidad({ carpeta: v.carpeta, visible, firma: 'no_requiere' })
  if (errVis) throw new Error(errVis)
  const uuid = crypto.randomUUID()
  const path = construirPathStorage({ tipo: 'empleado', id: empleadoId }, v.carpeta, v.nombre, uuid)
  await subirObjeto(path, entrada.bytes, v.tipo ?? 'application/octet-stream')
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por, visible_empleado)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}::bigint, ${path}, ${actor}, ${visible})
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
  entrada: { path: string; carpeta: string; nombre: string; tipo?: string | null; tamano?: number | null; visible_empleado?: boolean }
) {
  await exigeEmpleado(empresaId, empleadoId)
  const v = validarSubida(CARPETAS_IDX, actor, { carpeta: entrada.carpeta, nombre: entrada.nombre, tipo: entrada.tipo, tamano: entrada.tamano })
  const visible = entrada.visible_empleado !== false
  if (!visible && actor !== ACTOR_GESTOR) throw new Error('Sin permiso para ocultar documentos')
  const errVis = validarVisibilidad({ carpeta: v.carpeta, visible, firma: 'no_requiere' })
  if (errVis) throw new Error(errVis)
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por, visible_empleado)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}::bigint, ${entrada.path}, ${actor}, ${visible})
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

/**
 * El gestor muestra/oculta un documento al empleado. Ocultar exige que NO tenga firma (pendiente o hecha) ni sea
 * una nómina; mostrarlo siempre se puede. Scope empresa + empleado; otro empleado/empresa = «no encontrado».
 */
export async function cambiarVisibilidadDocumento(empresaId: string, empleadoId: string, docId: string, visible: boolean) {
  await exigeEmpleado(empresaId, empleadoId)
  const rows = await prisma.$queryRaw<{ carpeta: string; estado_firma: string }[]>(Prisma.sql`
    SELECT carpeta, estado_firma FROM rrhh.documentos
    WHERE id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  const d = rows[0]
  if (!d) throw new Error('Documento no encontrado')
  const err = validarVisibilidad({ carpeta: d.carpeta, visible, firma: d.estado_firma })
  if (err) throw new Error(err)
  // Las reglas se repiten en el WHERE: si entre la lectura y la escritura se pidió firma, no se oculta (TOCTOU).
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.documentos SET visible_empleado = ${visible}
    WHERE id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid
      AND (${visible} OR (carpeta <> 'nominas' AND COALESCE(estado_firma, 'no_requiere') = 'no_requiere'))`)
  if (!n) throw new Error('Un documento con firma debe ser visible para el empleado (si no, no podría firmarlo)')
}
