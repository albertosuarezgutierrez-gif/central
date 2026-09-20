import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import { reenviarProductForm, type ProductFormRequest } from '@/lib/codeoscopic/product-form'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METODOS_PERMITIDOS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * `POST /api/operador/codeoscopic/product-form` — el `dataCallback` de la
 * Product Form Library llega hasta aquí (plataforma → asegura) y esto hace la
 * llamada real a `POST /product-form-requests` con las credenciales de
 * servidor. Ver `lib/codeoscopic/product-form.ts` para el porqué.
 *
 * **No gasta ninguna cotización**: corre en la vía gratis, como `/lineas`.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const path = typeof cuerpo?.path === 'string' ? cuerpo.path.trim() : ''
  if (!cuerpo || path === '') {
    return NextResponse.json({ estado: 'error', mensaje: 'falta `path` (string)' }, { status: 400 })
  }
  const metodo = typeof cuerpo.method === 'string' ? cuerpo.method.toUpperCase() : 'GET'
  if (!METODOS_PERMITIDOS.has(metodo)) {
    return NextResponse.json({ estado: 'error', mensaje: `method «${cuerpo.method}» no reconocido` }, { status: 400 })
  }

  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json({ estado: 'sin_configurar', mensaje: explicarConfig(r) }, { status: 503 })
  }

  const solicitud: ProductFormRequest = {
    method: metodo as ProductFormRequest['method'],
    path,
    ...(Array.isArray(cuerpo.params) ? { params: cuerpo.params } : {}),
    ...(typeof cuerpo.body === 'object' && cuerpo.body !== null ? { body: cuerpo.body as Record<string, unknown> } : {}),
  }

  try {
    const respuesta = await reenviarProductForm(r.config, solicitud)
    return NextResponse.json({ estado: 'ok', respuesta })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
