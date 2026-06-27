import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { obtenerNomina } from '@/lib/nominas'
import { generarNominaPdf } from '@/lib/nomina-pdf'
import { subirObjeto } from '@/lib/storage'

export async function POST(_req: Request, { params }: { params: Promise<{ nominaId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { nominaId } = await params

    const nomina = await obtenerNomina(empresa_id, nominaId)
    if (!nomina) return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 })
    if (nomina.estado !== 'borrador') return NextResponse.json({ error: 'La nómina ya está confirmada' }, { status: 409 })

    const empRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM rrhh.empresas WHERE id = ${empresa_id}::uuid LIMIT 1`)
    const empresaNombre = empRows[0]?.nombre ?? ''

    const desglose = nomina.datos_calculo

    const pdfBuffer = await generarNominaPdf({
      empresa: { nombre: empresaNombre },
      empleado: { nombre: nomina.empleado_nombre, dni: nomina.empleado_dni, nss: nomina.empleado_nss },
      periodo: nomina.periodo,
      desglose,
    })

    const pdfPath = `nominas/${empresa_id}/${nomina.periodo}/${nominaId}.pdf`
    const pdfBytes = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer
    await subirObjeto(pdfPath, pdfBytes, 'application/pdf')

    // Create documentos row so the employee can see it in the portal
    const docNombre = `Nómina ${nomina.periodo}.pdf`
    const tamano = BigInt(pdfBuffer.byteLength)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.documentos (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por, estado_firma)
      VALUES (${empresa_id}::uuid, ${nomina.empleado_id}::uuid, 'nominas', ${docNombre}, 'application/pdf', ${tamano}, ${pdfPath}, 'sistema', 'no_requiere')`)

    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.nominas SET estado = 'confirmada', pdf_path = ${pdfPath}, confirmada_at = now()
      WHERE id = ${nominaId}::uuid AND empresa_id = ${empresa_id}::uuid`)

    return NextResponse.json({ ok: true, pdf_path: pdfPath })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
