import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverConfigEmision } from '@/lib/codeoscopic/emitir'
import { peticion } from '@/lib/codeoscopic/cliente'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /insurances/{id}` en CRUDO, sin pasar por `leerCotizacion` (que solo
 * extrae precios). **Gratis: es una lectura.**
 *
 * Diagnóstico puntual (12/09/2026) para el caso en que `emitir-envio.ts`
 * murió a mitad del Submit —el candado `submit_in_flight_at` quedó puesto y
 * `cerrarEnvio` nunca corrió—, así que no hay confirmación de si Codeoscopic
 * llegó a procesar el `POST .../policy-applications`. La respuesta cruda es
 * la única forma de comprobarlo sin arriesgar un segundo Submit.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const projectId = new URL(req.url).searchParams.get('projectId')?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'falta projectId' }, { status: 400 })
  }

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { error: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}` },
      { status: 503 },
    )
  }

  try {
    const crudo = await peticion(r.config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}`,
      timeoutMs: r.config.timeoutGenericoMs,
    })
    return NextResponse.json({ estado: 'ok', crudo })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
