// GET /api/e/certificado-retenciones?anio=AAAA → PDF del certificado de retenciones del EMPLEADO AUTENTICADO.
// Empleado y empresa salen SOLO de la sesión (`getSesionEmpleado`): la petición no puede nombrar a otro empleado (no se lee ningún id).
import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { leerDatosCertificado } from '@/lib/hechos-contabilidad'
import { anioPedido, certificadoDeNominas } from '@/lib/hechos-contabilidad-certificado'
import { generarCertificadoPdf } from './certificado-pdf'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { empleado_id, empresa_id } = await getSesionEmpleado()
    const anio = anioPedido(new URL(req.url).searchParams.get('anio'), new Date())
    if (anio === null) return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    const datos = await leerDatosCertificado(empresa_id, empleado_id, anio)
    if (!datos) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const r = certificadoDeNominas(datos, anio)
    if (!r.ok) {
      return r.motivo === 'sin_dni'
        ? NextResponse.json({ error: 'Falta tu DNI/NIE en la ficha: pídeselo a RR.HH. para poder emitir el certificado' }, { status: 409 })
        : NextResponse.json({ error: `No hay nóminas confirmadas de ${anio}` }, { status: 404 })
    }
    const pdf = await generarCertificadoPdf({
      certificado: r.certificado, empresa: r.empresa,
      fechaEmision: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }),
    })
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="certificado-retenciones-${anio}.pdf"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
