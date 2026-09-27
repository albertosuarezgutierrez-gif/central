import { NextResponse } from 'next/server'

import { tipoDocumento } from '@central/module-seguros'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { guardarDocumentoPropio } from '@/lib/documento-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/portal/documento — el CLIENTE sube un fichero (hoy, la póliza que
 * acaba de leer el portal) para que quede en SU ficha y Alberto lo vea y lo
 * verifique desde `plataforma` → Documentos. Multipart: `documento` (fichero),
 * `identidadId`, `tipo` (opcional; cualquier valor fuera del catálogo cae a
 * `otro`, nunca revienta).
 *
 * Mismo patrón que `/api/portal/contacto`: NO acepta `clienteId`, lo resuelve
 * asegura por `portal_vinculo`. Con el secreto de este puente filtrado, el
 * daño máximo es colgar un documento de la ficha vinculada a la identidad que
 * se dé — no elegir ficha libremente, que es lo que sí podría el secreto del
 * puerto de operador (por eso este endpoint no lo acepta ni lo menciona).
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })
    }
    const identidadId = String(form.get('identidadId') ?? '').trim()
    const fichero = form.get('documento')
    if (identidadId === '' || !(fichero instanceof File)) {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan identidadId o documento' }, { status: 422 })
    }
    const tipo = tipoDocumento(form.get('tipo'))
    const contenido = Buffer.from(await fichero.arrayBuffer())

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await guardarDocumentoPropio(correduria.id, identidadId, {
      tipo,
      nombre: fichero.name,
      mime: fichero.type,
      contenido,
    })
    const status =
      r.estado === 'ok' ? 200 : r.estado === 'invalido' ? 415 : r.estado === 'error' ? 503 : 409 // sin_ficha · varias_fichas
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/documento', e) },
      { status: 503 },
    )
  }
}
