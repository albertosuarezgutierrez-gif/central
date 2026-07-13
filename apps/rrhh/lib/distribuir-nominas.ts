/**
 * Distribución de nóminas desde PDF mensual.
 * Flujo: PDF → extracción texto por página (pdfjs-dist) → NIM identifica empleado →
 *        pdf-lib separa la página → sube a Storage → inserta en documentos.
 */
import { PDFDocument } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { subirObjeto } from '@/lib/storage'
import { iaChat } from '@/lib/ai'

export type ResultadoDistribucion = {
  pagina: number
  empleado_nombre: string | null
  empleado_id: string | null
  estado: 'ok' | 'no_encontrado' | 'error'
  doc_id?: string
  error?: string
}

/** Extrae el texto de cada página del PDF usando pdfjs-dist (build legacy, funciona en Node.js). */
async function extraerTextoPorPagina(bytes: ArrayBuffer): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Disable worker thread — not available in Node.js serverless environments
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true })
  const doc = await loadingTask.promise
  const paginas: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    paginas.push(content.items.map((it: any) => 'str' in it ? it.str : '').join(' '))
  }
  return paginas
}

/** Pregunta a NIM qué empleado aparece en el texto de la página. */
async function identificarEmpleado(textoPagina: string, nombresEmpleados: string[]): Promise<string | null> {
  if (!nombresEmpleados.length) return null
  const lista = nombresEmpleados.map((n, i) => `${i + 1}. ${n}`).join('\n')
  const res = await iaChat([
    {
      role: 'system',
      content: 'Eres un asistente que identifica a qué empleado pertenece una nómina. Responde ÚNICAMENTE con el nombre exacto del empleado de la lista, o la palabra NINGUNO si no encuentras coincidencia.',
    },
    {
      role: 'user',
      content: `Lista de empleados:\n${lista}\n\nTexto de la nómina:\n${textoPagina.slice(0, 2000)}\n\n¿A qué empleado pertenece esta nómina?`,
    },
  ])
  const resp = (res ?? '').trim()
  if (!resp || resp.toUpperCase() === 'NINGUNO') return null
  // Busca la coincidencia más cercana en la lista
  const exacto = nombresEmpleados.find(n => n.toLowerCase() === resp.toLowerCase())
  if (exacto) return exacto
  // Coincidencia parcial (el modelo puede devolver apellido primero, etc.)
  const parcial = nombresEmpleados.find(n =>
    n.toLowerCase().includes(resp.toLowerCase()) || resp.toLowerCase().includes(n.toLowerCase().split(' ')[0])
  )
  return parcial ?? null
}

/** Extrae una sola página del PDF original como PDF independiente. */
async function extraerPagina(bytesOriginal: ArrayBuffer, numeroPagina: number): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytesOriginal)
  const newDoc = await PDFDocument.create()
  const [page] = await newDoc.copyPages(srcDoc, [numeroPagina - 1])
  newDoc.addPage(page)
  return newDoc.save()
}

/** Punto de entrada: distribuye el PDF entre los empleados de la empresa. */
export async function distribuirNominasPdf(
  empresaId: string,
  bytes: ArrayBuffer,
  periodo: string,       // YYYY-MM
  subidoPor: string,
): Promise<ResultadoDistribucion[]> {
  // 1. Obtener empleados activos de la empresa
  const empleados = await prisma.$queryRaw<{ id: string; nombre: string }[]>(
    Prisma.sql`SELECT id, nombre FROM rrhh.empleados WHERE empresa_id = ${empresaId}::uuid AND estado = 'activo' ORDER BY nombre`
  )
  const nombres = empleados.map(e => e.nombre)

  // 2. Extraer texto por página
  const textosPorPagina = await extraerTextoPorPagina(bytes)

  const resultados: ResultadoDistribucion[] = []

  for (let i = 0; i < textosPorPagina.length; i++) {
    const numeroPagina = i + 1
    try {
      // 3. NIM identifica el empleado
      const nombreIdentificado = await identificarEmpleado(textosPorPagina[i], nombres)
      if (!nombreIdentificado) {
        resultados.push({ pagina: numeroPagina, empleado_nombre: null, empleado_id: null, estado: 'no_encontrado' })
        continue
      }

      const empleado = empleados.find(e => e.nombre === nombreIdentificado)!

      // 4. Extraer la página como PDF independiente
      const paginaPdf = await extraerPagina(bytes, numeroPagina)

      // 5. Subir a Storage
      const nombre = `nomina-${periodo}.pdf`
      const path = `empleado/${empleado.id}/nominas/${periodo}-${crypto.randomUUID()}.pdf`
      await subirObjeto(path, paginaPdf.buffer as ArrayBuffer, 'application/pdf')

      // 6. Insertar en documentos (borra la del mismo periodo si ya existe, para re-subidas)
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM rrhh.documentos
        WHERE empleado_id = ${empleado.id}::uuid
          AND empresa_id = ${empresaId}::uuid
          AND carpeta = 'nominas'
          AND nombre = ${nombre}`)

      const [doc] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por)
        VALUES (${empresaId}::uuid, ${empleado.id}::uuid, 'nominas', ${nombre}, 'application/pdf', ${paginaPdf.length}, ${path}, ${subidoPor})
        RETURNING id`)

      resultados.push({
        pagina: numeroPagina,
        empleado_nombre: nombreIdentificado,
        empleado_id: empleado.id,
        estado: 'ok',
        doc_id: doc.id,
      })
    } catch (err) {
      resultados.push({
        pagina: numeroPagina,
        empleado_nombre: null,
        empleado_id: null,
        estado: 'error',
        error: String(err),
      })
    }
  }

  return resultados
}
