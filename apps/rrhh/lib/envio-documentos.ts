// Subida ASISTIDA por IA y envío MASIVO de documentos (admin RR.HH.).
//
// 1) `analizarStaging`: lee el PDF del staging, extrae el texto y pide a la IA una PROPUESTA
//    (tipo, carpeta, título, firma, resumen, destinatarios). No escribe nada: solo propone.
// 2) `asignarStaging`: con lo que el responsable CONFIRMA, crea UNA copia (objeto + fila en
//    rrhh.documentos) por empleado — cada una con su propia firma y evidencia — y avisa si se pide.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validarSubida, construirPathStorage } from '@central/module-documental'
import { CARPETAS_IDX, ACTOR_GESTOR } from '@/lib/carpetas'
import { descargarObjeto, copiarObjeto, borrarObjeto, infoObjeto, listarObjetos, borrarObjetos } from '@/lib/storage'
import { extraerTextoPorPagina } from '@/lib/distribuir-nominas'
import { iaChat, iaDisponible } from '@/lib/ai'
import {
  promptAnalisis, parsearRespuestaIA, emparejarDestinatarios, clasificarDestinatarios, carpetaSugerida, esCategoria,
  PROPUESTA_VACIA, type PropuestaIA, type ResultadoEmparejo, type CategoriaDoc,
} from '@/lib/asistente-subida'
import { esPathStagingDe, nombreConExtension, carpetaAdmiteFirma, stagingCaducados } from '@/lib/envio-staging'
import { avisarDocumento, avisarSolicitudFirma, type ResultadoAviso } from '@/lib/avisos'

export type MotivoAnalisis = 'ok' | 'sin_texto' | 'no_pdf' | 'ia_no_configurada' | 'ia_error'

export type Analisis = {
  motivo: MotivoAnalisis
  propuesta: Omit<PropuestaIA, 'personas'> & { carpeta: string | null }
  /** Preseleccionados: la IA los identifica como trabajador destinatario. */
  destinatarios: (ResultadoEmparejo['destinatarios'][number] & { nombre: string })[]
  /** Aparecen en el texto pero la IA no los marca como trabajador (p. ej. el representante): sin marcar. */
  a_revisar: (ResultadoEmparejo['destinatarios'][number] & { nombre: string })[]
  sin_emparejar: ResultadoEmparejo['sin_emparejar']
}

function vacio(motivo: MotivoAnalisis): Analisis {
  const { personas: _p, ...resto } = PROPUESTA_VACIA
  return { motivo, propuesta: { ...resto, carpeta: null }, destinatarios: [], a_revisar: [], sin_emparejar: [] }
}

/** Analiza un documento del staging de la empresa. Nunca lanza por la IA: degrada a campos null. */
export async function analizarStaging(empresaId: string, path: string, nombre: string): Promise<Analisis> {
  if (!esPathStagingDe(empresaId, path)) throw new Error('Ruta de subida no válida')
  if (!/\.pdf$/i.test(path) && !/\.pdf$/i.test(nombre)) return vacio('no_pdf')

  let texto = ''
  try {
    const paginas = await extraerTextoPorPagina(await descargarObjeto(path))
    texto = paginas.join('\n').replace(/[ \t]+/g, ' ').trim()
  } catch (e) {
    console.error('analizarStaging: extracción', e instanceof Error ? e.message : e)
  }
  if (texto.length < 30) return vacio('sin_texto') // escaneado sin capa de texto: Pilar rellena a mano

  let propuesta: PropuestaIA = { ...PROPUESTA_VACIA }
  let motivo: MotivoAnalisis = 'ok'
  if (!iaDisponible()) motivo = 'ia_no_configurada'
  else {
    try {
      const { system, user } = promptAnalisis(texto)
      propuesta = parsearRespuestaIA(await iaChat([{ role: 'user', content: user }], { system, maxTokens: 700, timeoutMs: 45_000 }))
      if (!propuesta.ia_ok) motivo = 'ia_error'
    } catch (e) {
      console.error('analizarStaging: IA', e instanceof Error ? e.message : e)
      motivo = 'ia_error'
    }
  }

  // El emparejamiento es determinista y no depende de la IA (NIF del texto sí o sí).
  const empleados = await prisma.$queryRaw<{ id: string; nombre: string; apellidos: string | null; dni: string | null }[]>(Prisma.sql`
    SELECT id, nombre, apellidos, dni FROM rrhh.empleados
    WHERE empresa_id = ${empresaId}::uuid AND estado = 'activo'`)
  const em = emparejarDestinatarios(texto, propuesta.personas, empleados)
  const cl = clasificarDestinatarios(em.destinatarios, propuesta.personas, propuesta.ia_ok, empleados)
  const porId = new Map(empleados.map(e => [e.id, e]))
  const conNombre = (d: ResultadoEmparejo['destinatarios'][number]) => {
    const e = porId.get(d.empleado_id)!
    return { ...d, nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') }
  }
  const { personas: _p, ...resto } = propuesta
  return {
    motivo,
    propuesta: { ...resto, carpeta: carpetaSugerida(propuesta.categoria) },
    destinatarios: cl.preseleccionados.map(conNombre),
    a_revisar: cl.a_revisar.map(conNombre),
    sin_emparejar: em.sin_emparejar,
  }
}

export type ModoFirma = 'none' | 'solo_empleado' | 'empresa_y_empleado'

export type EntradaAsignar = {
  path: string
  nombre_original: string
  titulo: string
  carpeta: string
  categoria: string | null
  resumen: string | null
  empleado_ids: string[] | 'toda_plantilla'
  firma: ModoFirma
  avisar: boolean
  /** uuid que genera el CLIENTE por documento: reintentar con el mismo no duplica copias. */
  envio_id?: string | null
}

export type ResultadoAsignar = {
  envio_id: string
  total: number
  ok: number
  resultados: { empleado_id: string; doc_id?: string; error?: string; aviso?: ResultadoAviso | null; ya_enviado?: boolean }[]
}

export const MAX_DESTINATARIOS = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Envío confirmado: una copia por empleado (mismo contenido, firma y evidencia independientes).
 * IDEMPOTENTE por `envio_id` (uuid del cliente por documento) + empleado (índice único parcial
 * `documentos_envio_empleado_uq`): un reintento tras timeout, un doble clic o el «Enviar todo» sobre
 * un documento ya enviado a medias no crea segundas copias; las que ya existían vuelven como `ya_enviado`.
 */
export async function asignarStaging(empresaId: string, usuarioId: string, e: EntradaAsignar, origen?: string | null): Promise<ResultadoAsignar> {
  if (!esPathStagingDe(empresaId, e.path)) throw new Error('Ruta de subida no válida')
  if (!['none', 'solo_empleado', 'empresa_y_empleado'].includes(e.firma)) throw new Error('Modo de firma desconocido')
  // Misma regla que el expediente: en estas carpetas no se pide firma.
  if (e.firma !== 'none' && !carpetaAdmiteFirma(e.carpeta)) throw new Error('En esta carpeta no se pide firma: elige «Sin firma» u otra carpeta')
  if (e.envio_id != null && !UUID_RE.test(e.envio_id)) throw new Error('Identificador de envío no válido')
  const envioId = e.envio_id ?? crypto.randomUUID()
  const nombre = nombreConExtension(e.titulo || e.nombre_original, e.nombre_original)
  const categoria: CategoriaDoc | null = esCategoria(e.categoria) ? e.categoria : null
  const resumen = e.resumen?.trim() ? e.resumen.trim().slice(0, 600) : null

  // Destinatarios SIEMPRE de la empresa de la sesión.
  let ids: string[]
  if (e.empleado_ids === 'toda_plantilla') {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM rrhh.empleados WHERE empresa_id = ${empresaId}::uuid AND estado = 'activo'`)
    ids = rows.map(r => r.id)
  } else {
    const pedidos = [...new Set(e.empleado_ids.filter(x => typeof x === 'string'))]
    if (!pedidos.length) throw new Error('Elige al menos un empleado')
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM rrhh.empleados
      WHERE empresa_id = ${empresaId}::uuid AND id = ANY(${pedidos}::uuid[])`)
    if (rows.length !== pedidos.length) throw new Error('Algún empleado no encontrado en esta empresa')
    ids = rows.map(r => r.id)
  }
  if (!ids.length) throw new Error('No hay empleados activos a los que enviarlo')
  if (ids.length > MAX_DESTINATARIOS) throw new Error(`Máximo ${MAX_DESTINATARIOS} empleados por envío`)

  // Copias que ya existen de ESTE envío (reintento): no se repiten.
  const previas = await prisma.$queryRaw<{ id: string; empleado_id: string }[]>(Prisma.sql`
    SELECT id, empleado_id FROM rrhh.documentos
    WHERE empresa_id = ${empresaId}::uuid AND envio_id = ${envioId}::uuid AND empleado_id = ANY(${ids}::uuid[])`)
  const yaHecho = new Map(previas.map(p => [p.empleado_id, p.id]))
  const resultados: ResultadoAsignar['resultados'] = []
  for (const id of ids) {
    const docId = yaHecho.get(id)
    if (docId) resultados.push({ empleado_id: id, doc_id: docId, ya_enviado: true })
  }
  const pendientes = ids.filter(id => !yaHecho.has(id))
  if (!pendientes.length) {
    await borrarObjeto(e.path) // todo estaba ya enviado: el staging sobra (best-effort, puede no existir)
    return { envio_id: envioId, total: ids.length, ok: resultados.length, resultados }
  }

  // Tamaño y tipo del objeto REAL del staging, no lo que diga el cliente.
  const info = await infoObjeto(e.path)
  if (!info) throw new Error('Archivo subido no encontrado: vuelve a subirlo')
  // Mismas reglas que la subida normal del gestor (carpeta válida, permiso, nombre, tamaño).
  const v = validarSubida(CARPETAS_IDX, ACTOR_GESTOR, { carpeta: e.carpeta, nombre, tipo: info.tipo, tamano: info.tamano })

  const estado = e.firma === 'empresa_y_empleado' ? 'pendiente_empresa' : e.firma === 'solo_empleado' ? 'pendiente' : 'no_requiere'
  const requiereEmpresa = e.firma === 'empresa_y_empleado'

  async function uno(empleadoId: string) {
    try {
      const destino = construirPathStorage({ tipo: 'empleado', id: empleadoId }, v.carpeta, v.nombre, crypto.randomUUID())
      await copiarObjeto(e.path, destino)
      // ON CONFLICT: dos peticiones simultáneas del mismo envío → solo una fila por empleado.
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por,
                                     estado_firma, requiere_firma_empresa, categoria_doc, resumen, envio_id, avisar)
        VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}::bigint, ${destino}, ${ACTOR_GESTOR},
                ${estado}, ${requiereEmpresa}, ${categoria}, ${resumen}, ${envioId}::uuid, ${e.avisar})
        ON CONFLICT (envio_id, empleado_id) WHERE envio_id IS NOT NULL DO NOTHING
        RETURNING id`)
      if (!rows[0]) {
        await borrarObjeto(destino) // la otra petición ganó: esta copia sobra
        const ex = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM rrhh.documentos
          WHERE empresa_id = ${empresaId}::uuid AND envio_id = ${envioId}::uuid AND empleado_id = ${empleadoId}::uuid LIMIT 1`)
        if (!ex[0]) throw new Error('Conflicto de envío')
        resultados.push({ empleado_id: empleadoId, doc_id: ex[0].id, ya_enviado: true })
        return
      }
      const docId = rows[0].id
      let aviso: ResultadoAviso | null = null
      if (e.avisar && estado === 'pendiente') aviso = await avisarSolicitudFirma(empresaId, empleadoId, docId, usuarioId, origen)
      else if (e.avisar && estado === 'no_requiere') {
        aviso = await avisarDocumento({ empresaId, empleadoId, documentoId: docId, tipo: 'documento_nuevo', creadoPor: usuarioId, origen })
          .catch(err => { console.error('asignarStaging: aviso', err?.message); return null })
      }
      // pendiente_empresa: el aviso sale cuando la empresa firma (ruta firmar-empresa), si `avisar`.
      resultados.push({ empleado_id: empleadoId, doc_id: docId, aviso })
    } catch (err) {
      resultados.push({ empleado_id: empleadoId, error: err instanceof Error ? err.message.slice(0, 200) : 'Error' })
    }
  }

  // Concurrencia limitada: copias + correo, sin saturar Storage ni el SMTP.
  const cola = [...pendientes]
  await Promise.all(Array.from({ length: Math.min(4, cola.length) }, async () => {
    for (let id = cola.shift(); id; id = cola.shift()) await uno(id)
  }))

  const ok = resultados.filter(r => r.doc_id).length
  if (ok === ids.length) await borrarObjeto(e.path) // si algo falló, el staging se queda para reintentar
  return { envio_id: envioId, total: ids.length, ok, resultados }
}

/**
 * Cron: borra las subidas al staging abandonadas (> 48 h sin confirmar). Empresa a empresa y SOLO
 * bajo `staging/<empresa_id>/` (cada ruta pasa por `esPathStagingDe`). Un fallo en una empresa no
 * para las demás.
 */
export async function limpiarStagingCaducado(ahora = new Date()): Promise<{ empresas: number; borrados: number; errores: number }> {
  const empresas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM rrhh.empresas`)
  let borrados = 0, errores = 0
  for (const { id } of empresas) {
    try {
      const objetos = await listarObjetos(`staging/${id}/`)
      const caducados = stagingCaducados(id, objetos, ahora)
      for (let i = 0; i < caducados.length; i += 100) {
        const lote = caducados.slice(i, i + 100)
        await borrarObjetos(lote)
        borrados += lote.length
      }
    } catch (e) {
      errores++
      console.error('limpiarStagingCaducado', id, e instanceof Error ? e.message : e)
    }
  }
  return { empresas: empresas.length, borrados, errores }
}
