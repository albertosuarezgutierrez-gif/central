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
import { descargarObjeto, copiarObjeto, borrarObjeto } from '@/lib/storage'
import { extraerTextoPorPagina } from '@/lib/distribuir-nominas'
import { iaChat, iaDisponible } from '@/lib/ai'
import {
  promptAnalisis, parsearRespuestaIA, emparejarDestinatarios, carpetaSugerida, esCategoria,
  PROPUESTA_VACIA, type PropuestaIA, type ResultadoEmparejo, type CategoriaDoc,
} from '@/lib/asistente-subida'
import { esPathStagingDe, nombreConExtension } from '@/lib/envio-staging'
import { avisarDocumento, avisarSolicitudFirma, type ResultadoAviso } from '@/lib/avisos'

export type MotivoAnalisis = 'ok' | 'sin_texto' | 'no_pdf' | 'ia_no_configurada' | 'ia_error'

export type Analisis = {
  motivo: MotivoAnalisis
  propuesta: Omit<PropuestaIA, 'personas'> & { carpeta: string | null }
  destinatarios: (ResultadoEmparejo['destinatarios'][number] & { nombre: string })[]
  sin_emparejar: ResultadoEmparejo['sin_emparejar']
}

function vacio(motivo: MotivoAnalisis): Analisis {
  const { personas: _p, ...resto } = PROPUESTA_VACIA
  return { motivo, propuesta: { ...resto, carpeta: null }, destinatarios: [], sin_emparejar: [] }
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
  const porId = new Map(empleados.map(e => [e.id, e]))
  const { personas: _p, ...resto } = propuesta
  return {
    motivo,
    propuesta: { ...resto, carpeta: carpetaSugerida(propuesta.categoria) },
    destinatarios: em.destinatarios.map(d => {
      const e = porId.get(d.empleado_id)!
      return { ...d, nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') }
    }),
    sin_emparejar: em.sin_emparejar,
  }
}

export type ModoFirma = 'none' | 'solo_empleado' | 'empresa_y_empleado'

export type EntradaAsignar = {
  path: string
  nombre_original: string
  titulo: string
  tipo: string | null
  tamano: number | null
  carpeta: string
  categoria: string | null
  resumen: string | null
  empleado_ids: string[] | 'toda_plantilla'
  firma: ModoFirma
  avisar: boolean
}

export type ResultadoAsignar = {
  envio_id: string
  total: number
  ok: number
  resultados: { empleado_id: string; doc_id?: string; error?: string; aviso?: ResultadoAviso | null }[]
}

export const MAX_DESTINATARIOS = 500

/** Envío confirmado: una copia por empleado (mismo contenido, firma y evidencia independientes). */
export async function asignarStaging(empresaId: string, usuarioId: string, e: EntradaAsignar, origen?: string | null): Promise<ResultadoAsignar> {
  if (!esPathStagingDe(empresaId, e.path)) throw new Error('Ruta de subida no válida')
  if (!['none', 'solo_empleado', 'empresa_y_empleado'].includes(e.firma)) throw new Error('Modo de firma desconocido')
  const nombre = nombreConExtension(e.titulo || e.nombre_original, e.nombre_original)
  // Mismas reglas que la subida normal del gestor (carpeta válida, permiso, nombre, tamaño).
  const v = validarSubida(CARPETAS_IDX, ACTOR_GESTOR, { carpeta: e.carpeta, nombre, tipo: e.tipo, tamano: e.tamano })
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

  const envioId = crypto.randomUUID()
  const estado = e.firma === 'empresa_y_empleado' ? 'pendiente_empresa' : e.firma === 'solo_empleado' ? 'pendiente' : 'no_requiere'
  const requiereEmpresa = e.firma === 'empresa_y_empleado'
  const resultados: ResultadoAsignar['resultados'] = []

  async function uno(empleadoId: string) {
    try {
      const destino = construirPathStorage({ tipo: 'empleado', id: empleadoId }, v.carpeta, v.nombre, crypto.randomUUID())
      await copiarObjeto(e.path, destino)
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por,
                                     estado_firma, requiere_firma_empresa, categoria_doc, resumen, envio_id)
        VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${v.carpeta}, ${v.nombre}, ${v.tipo}, ${v.tamano}::bigint, ${destino}, ${ACTOR_GESTOR},
                ${estado}, ${requiereEmpresa}, ${categoria}, ${resumen}, ${envioId}::uuid)
        RETURNING id`)
      const docId = rows[0].id
      let aviso: ResultadoAviso | null = null
      if (e.avisar && estado === 'pendiente') aviso = await avisarSolicitudFirma(empresaId, empleadoId, docId, usuarioId, origen)
      else if (e.avisar && estado === 'no_requiere') {
        aviso = await avisarDocumento({ empresaId, empleadoId, documentoId: docId, tipo: 'documento_nuevo', creadoPor: usuarioId, origen })
          .catch(err => { console.error('asignarStaging: aviso', err?.message); return null })
      }
      // pendiente_empresa: el aviso sale cuando la empresa firma (ruta firmar-empresa).
      resultados.push({ empleado_id: empleadoId, doc_id: docId, aviso })
    } catch (err) {
      resultados.push({ empleado_id: empleadoId, error: err instanceof Error ? err.message.slice(0, 200) : 'Error' })
    }
  }

  // Concurrencia limitada: copias + correo, sin saturar Storage ni el SMTP.
  const cola = [...ids]
  await Promise.all(Array.from({ length: Math.min(4, cola.length) }, async () => {
    for (let id = cola.shift(); id; id = cola.shift()) await uno(id)
  }))

  const ok = resultados.filter(r => r.doc_id).length
  if (ok === ids.length) await borrarObjeto(e.path) // si algo falló, el staging se queda para reintentar
  return { envio_id: envioId, total: ids.length, ok, resultados }
}
