import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { validarExportacion } from '@/lib/informes/validador'
import { ejecutarInforme } from '@/lib/informes/ejecutar'
import { generarCsv, generarXlsx, nombreArchivo } from '@/lib/informes/exportar'
import { generarPdf } from '@/lib/informes/exportar-pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

const TIPOS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
} as const

// Descarga de un informe en Excel, PDF o CSV. Misma autorización y validación que la vista previa.
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => null)
    const v = validarExportacion(body)
    if (!v.ok) return NextResponse.json({ error: 'Petición de informe no válida', errores: v.errores }, { status: 400 })
    const { formato, ...peticion } = v.peticion
    const { resultado, cabecera } = await ejecutarInforme(empresa_id, peticion)
    const cuerpo: Buffer | string =
      formato === 'xlsx' ? generarXlsx(resultado, cabecera)
      : formato === 'pdf' ? await generarPdf(resultado, cabecera)
      : generarCsv(resultado)
    return new Response(typeof cuerpo === 'string' ? cuerpo : new Uint8Array(cuerpo), {
      headers: {
        'Content-Type': TIPOS[formato],
        'Content-Disposition': `attachment; filename="${nombreArchivo(peticion.entidad, formato)}"`,
        'Cache-Control': 'no-store',
        ...(resultado.truncado ? { 'X-Informe-Truncado': String(resultado.limite) } : {}),
      },
    })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
