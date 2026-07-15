import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { descargarObjeto } from '@/lib/storage'
import { renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { CertificadoFirmaPdf } from '@/lib/certificado-firma'
import { createElement } from 'react'

export const maxDuration = 60

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  let empresa_id: string
  try {
    const s = await getSesion()
    empresa_id = s.empresa_id
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    throw e
  }

  const { id: empleado_id, docId } = await params

  const [doc] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT d.id, d.nombre, d.storage_path, d.estado_firma,
           d.firmado_empresa_at, d.firmado_empresa_nombre, d.firmado_empresa_hash,
           emp.nombre AS emp_nombre, emp.apellidos AS emp_apellidos, emp.dni AS emp_dni,
           emp2.nombre AS empresa_nombre
    FROM rrhh.documentos d
    JOIN rrhh.empleados emp ON emp.id = d.empleado_id
    JOIN rrhh.empresas emp2 ON emp2.id = d.empresa_id
    WHERE d.id = ${docId}::uuid
      AND d.empleado_id = ${empleado_id}::uuid
      AND d.empresa_id = ${empresa_id}::uuid
    LIMIT 1`)

  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (doc.estado_firma !== 'firmado') {
    return NextResponse.json({ error: 'El documento aún no está firmado por ambas partes' }, { status: 422 })
  }

  const [firma] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT doc_hash, metodo, sello_tiempo, firmante_nombre, firmante_dni
    FROM rrhh.firmas
    WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleado_id}::uuid AND empresa_id = ${empresa_id}::uuid
    ORDER BY sello_tiempo DESC LIMIT 1`)

  if (!firma) return NextResponse.json({ error: 'Evidencia de firma no encontrada' }, { status: 404 })

  // Descargar PDF original
  const originalBytes = await descargarObjeto(doc.storage_path)

  // Generar PDF del certificado
  const certBuffer = await renderToBuffer(createElement(CertificadoFirmaPdf, {
    datos: {
      documento_nombre: doc.nombre,
      empresa_nombre: doc.empresa_nombre,
      firmante_empresa_nombre: doc.firmado_empresa_nombre ?? 'Empresa',
      firma_empresa_fecha: doc.firmado_empresa_at,
      firma_empresa_hash: doc.firmado_empresa_hash ?? '',
      firmante_empleado_nombre: firma.firmante_nombre ?? [doc.emp_nombre, doc.emp_apellidos].filter(Boolean).join(' '),
      firmante_empleado_dni: firma.firmante_dni ?? doc.emp_dni ?? null,
      firma_empleado_fecha: firma.sello_tiempo,
      firma_empleado_metodo: firma.metodo,
      firma_empleado_hash: firma.doc_hash,
    },
  }) as any)

  // Fusionar: documento original + página de certificado
  const merged = await PDFDocument.create()

  const originalPdf = await PDFDocument.load(originalBytes)
  const certPdf = await PDFDocument.load(certBuffer)

  const originalPages = await merged.copyPages(originalPdf, originalPdf.getPageIndices())
  originalPages.forEach(p => merged.addPage(p))

  const certPages = await merged.copyPages(certPdf, certPdf.getPageIndices())
  certPages.forEach(p => merged.addPage(p))

  const finalBytes = await merged.save()
  const finalBuffer = Buffer.from(finalBytes)

  const nombreBase = doc.nombre.replace(/\.pdf$/i, '')
  const filename = `${nombreBase}-firmado.pdf`

  return new Response(finalBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(finalBuffer.length),
    },
  })
}
