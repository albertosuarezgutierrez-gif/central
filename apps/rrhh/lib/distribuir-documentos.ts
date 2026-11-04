// «Distribuir documentos desde PDF»: UN PDF con los documentos de varios empleados (contratos, EPIs,
// certificados…) → cada empleado recibe el suyo en su expediente. Reutiliza la tubería de nóminas
// (`distribuir-nominas`: texto por página, IA que identifica al empleado, recorte de páginas) y la
// inserción idempotente + avisos del envío asistido (`registrarCopia`, `envio-documentos`).
//
// Reglas de seguridad:
//  · candidatos SOLO de la empresa de la sesión (rrhh_app tiene BYPASSRLS: el WHERE es el aislamiento);
//  · a la IA solo se le dan nombre y DNI de esos empleados;
//  · lo que dice la IA se COMPRUEBA en código (el texto de la página debe contener el DNI o el nombre
//    completo); páginas sin identificar con seguridad → «no identificado», NO se asignan;
//  · páginas consecutivas del mismo empleado = un documento; las no identificadas nunca se funden;
//  · idempotente: `envio_id` determinista por (empresa, hash del PDF, carpeta, páginas, empleado).
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validarSubida, construirPathStorage } from '@central/module-documental'
import { CARPETAS_IDX, ACTOR_GESTOR } from '@/lib/carpetas'
import { subirObjeto } from '@/lib/storage'
import { extraerTextoPorPagina, identificarEmpleado, extraerPaginas } from '@/lib/distribuir-nominas'
import { registrarCopia, estadoFirmaDe } from '@/lib/envio-documentos'
import { carpetaAdmiteFirma } from '@/lib/envio-staging'
import type { ResultadoAviso } from '@/lib/avisos'
import { agruparPaginas, idEnvioDeterminista, nombresDocumentos, paginaMencionaEmpleado } from '@/lib/distribuir-documentos-reglas'

/** Mismo tope que la subida normal del expediente (20 MB); en la práctica manda el límite de cuerpo de Vercel (~4,5 MB). */
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PAGINAS = 300
const MIN_TEXTO_PAGINA = 20

export type EntradaDistribuir = {
  nombreOriginal: string
  carpeta: string
  titulo?: string | null
  /** Casilla «requiere firma» (default off) → flujo existente `solo_empleado`. */
  requiereFirma: boolean
  avisar: boolean
  origen?: string | null
}

export type ResultadoDocumento = {
  desde: number
  hasta: number
  estado: 'ok' | 'ya_enviado' | 'no_identificado' | 'error'
  empleado_id: string | null
  empleado_nombre: string | null
  doc_id?: string
  aviso?: ResultadoAviso | null
  error?: string
}

export type ResultadoDistribuirDocs = {
  paginas: number
  documentos: ResultadoDocumento[]
  ok: number
  ya_enviados: number
  no_identificados: number
  errores: number
}

type Candidato = { id: string; nombre: string; apellidos: string | null; dni: string | null }

/** Empleados activos de LA empresa de la sesión (única fuente de candidatos). */
export async function candidatosEmpresa(empresaId: string): Promise<Candidato[]> {
  return prisma.$queryRaw<Candidato[]>(Prisma.sql`
    SELECT id, nombre, apellidos, dni FROM rrhh.empleados
    WHERE empresa_id = ${empresaId}::uuid AND estado = 'activo'
    ORDER BY nombre, apellidos`)
}

const etiquetaIA = (e: Candidato) => `${[e.nombre, e.apellidos].filter(Boolean).join(' ')}${e.dni ? ` (DNI ${e.dni})` : ''}`
const nombreDe = (e: Candidato) => [e.nombre, e.apellidos].filter(Boolean).join(' ')

/** Identifica el empleado de cada página (null = no identificado con seguridad). */
export async function identificarPaginas(textos: string[], candidatos: Candidato[], documento: string): Promise<(Candidato | null)[]> {
  // Etiquetas repetidas (homónimos sin DNI) → ambiguas: no se pueden asignar.
  const porEtiqueta = new Map<string, Candidato | null>()
  for (const c of candidatos) {
    const k = etiquetaIA(c)
    porEtiqueta.set(k, porEtiqueta.has(k) ? null : c)
  }
  const etiquetas = candidatos.map(etiquetaIA)
  const out: (Candidato | null)[] = new Array(textos.length).fill(null)
  const cola = textos.map((_, i) => i)
  await Promise.all(Array.from({ length: Math.min(4, cola.length) }, async () => {
    for (let i = cola.shift(); i !== undefined; i = cola.shift()) {
      const texto = textos[i]
      if (texto.replace(/\s+/g, '').length < MIN_TEXTO_PAGINA) continue
      try {
        const et = await identificarEmpleado(texto, etiquetas, { documento, estricto: true })
        const c = et ? porEtiqueta.get(et) ?? null : null
        // Verificación en código: la IA no puede asignar a alguien que la página no menciona.
        out[i] = c && paginaMencionaEmpleado(texto, c) ? c : null
      } catch (e) {
        console.error('distribuir-documentos: IA página', i + 1, e instanceof Error ? e.message : e)
      }
    }
  }))
  return out
}

export async function distribuirDocumentosPdf(
  empresaId: string, usuarioId: string, bytes: ArrayBuffer, e: EntradaDistribuir,
): Promise<ResultadoDistribuirDocs> {
  if (bytes.byteLength === 0) throw new Error('El PDF está vacío')
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error(`El archivo supera el máximo de ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB`)
  const cfg = CARPETAS_IDX.get(e.carpeta)
  if (!cfg) throw new Error('Carpeta no válida')
  validarSubida(CARPETAS_IDX, ACTOR_GESTOR, { carpeta: e.carpeta, nombre: e.nombreOriginal || 'documentos.pdf', tipo: 'application/pdf', tamano: bytes.byteLength })
  if (e.requiereFirma && !carpetaAdmiteFirma(e.carpeta)) throw new Error('En esta carpeta no se pide firma: desmarca «Requiere firma» u otra carpeta')

  const pdfHash = createHash('sha256').update(new Uint8Array(bytes)).digest('hex') // antes de pdfjs (detacha copias)
  const titulo = (e.titulo ?? '').trim() || cfg.etiqueta || e.carpeta
  const candidatos = await candidatosEmpresa(empresaId)
  if (!candidatos.length) throw new Error('No hay empleados activos en la empresa')

  const textos = await extraerTextoPorPagina(bytes)
  if (textos.length > MAX_PAGINAS) throw new Error(`Máximo ${MAX_PAGINAS} páginas por PDF`)
  if (!textos.some(t => t.replace(/\s+/g, '').length >= MIN_TEXTO_PAGINA)) {
    throw new Error('No se pudo leer texto del PDF (¿escaneado?): no se puede identificar a los empleados')
  }

  const ident = await identificarPaginas(textos, candidatos, cfg.etiqueta || titulo)
  const grupos = agruparPaginas(ident.map(c => c?.id ?? null))
  const nombres = nombresDocumentos(titulo, grupos)
  const porId = new Map(candidatos.map(c => [c.id, c]))
  const { estado, requiereEmpresa } = estadoFirmaDe(e.requiereFirma ? 'solo_empleado' : 'none')

  const envioIds = grupos.map(g => g.empleado_id
    ? idEnvioDeterminista({ empresaId, pdfHash, carpeta: e.carpeta, desde: g.desde, hasta: g.hasta, empleadoId: g.empleado_id })
    : null)
  // Re-subida del mismo PDF: lo ya repartido no se vuelve a copiar.
  const pedidos = envioIds.filter((x): x is string => !!x)
  const previos = pedidos.length ? await prisma.$queryRaw<{ id: string; envio_id: string; empleado_id: string }[]>(Prisma.sql`
    SELECT id, envio_id, empleado_id FROM rrhh.documentos
    WHERE empresa_id = ${empresaId}::uuid AND envio_id = ANY(${pedidos}::uuid[])`) : []
  const yaHecho = new Map(previos.map(p => [`${p.envio_id}|${p.empleado_id}`, p.id]))

  const documentos: ResultadoDocumento[] = new Array(grupos.length)
  async function procesar(i: number) {
    const g = grupos[i]
    const emp = g.empleado_id ? porId.get(g.empleado_id) : null
    if (!emp || !g.empleado_id) {
      documentos[i] = { desde: g.desde, hasta: g.hasta, estado: 'no_identificado', empleado_id: null, empleado_nombre: null }
      return
    }
    const base = { desde: g.desde, hasta: g.hasta, empleado_id: emp.id, empleado_nombre: nombreDe(emp) }
    const envioId = envioIds[i]!
    const previo = yaHecho.get(`${envioId}|${emp.id}`)
    if (previo) { documentos[i] = { ...base, estado: 'ya_enviado', doc_id: previo }; return }
    try {
      const pdf = await extraerPaginas(bytes, g.desde, g.hasta)
      const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
      const v = validarSubida(CARPETAS_IDX, ACTOR_GESTOR, { carpeta: e.carpeta, nombre: nombres[i], tipo: 'application/pdf', tamano: pdf.length })
      const destino = construirPathStorage({ tipo: 'empleado', id: emp.id }, v.carpeta, v.nombre, crypto.randomUUID())
      await subirObjeto(destino, buf, 'application/pdf')
      const r = await registrarCopia({
        empresaId, empleadoId: emp.id, usuarioId, envioId, v, destino, estado, requiereEmpresa,
        categoria: null, resumen: null, avisar: e.avisar, origen: e.origen,
      })
      documentos[i] = { ...base, estado: r.ya_enviado ? 'ya_enviado' : 'ok', doc_id: r.doc_id, aviso: r.aviso }
    } catch (err) {
      documentos[i] = { ...base, estado: 'error', error: err instanceof Error ? err.message.slice(0, 200) : 'Error' }
    }
  }
  const cola = grupos.map((_, i) => i)
  await Promise.all(Array.from({ length: Math.min(4, cola.length) }, async () => {
    for (let i = cola.shift(); i !== undefined; i = cola.shift()) await procesar(i)
  }))

  const cuenta = (s: ResultadoDocumento['estado']) => documentos.filter(d => d.estado === s).length
  return {
    paginas: textos.length, documentos,
    ok: cuenta('ok'), ya_enviados: cuenta('ya_enviado'), no_identificados: cuenta('no_identificado'), errores: cuenta('error'),
  }
}
