import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverConfigEmision } from '@/lib/codeoscopic/emitir'
import { reenviarProductForm, type ProductFormRequest } from '@/lib/codeoscopic/product-form'
import { auditado } from '@/lib/auditoria'
import { validarProductForm } from './validar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/operador/codeoscopic/product-form` — el `dataCallback` de la
 * Product Form Library llega hasta aquí (plataforma → asegura) y esto hace la
 * llamada real a `POST /product-form-requests` con las credenciales de
 * servidor. Ver `lib/codeoscopic/product-form.ts` para el porqué.
 *
 * No está documentado como facturable, pero es un relé que pide el NAVEGADOR (02/11/2026):
 *  - solo GET/POST y rutas que no cotizan ni emiten (`validar.ts`, lista blanca + raíces prohibidas);
 *  - detrás del interruptor de EMISIÓN (`resolverConfigEmision`, `CODEOSCOPIC_EMISION_ACTIVA`), como
 *    `/oferta` y `/coberturas`: el widget solo se monta en el paso de emisión, así que con la emisión
 *    apagada no hay pantalla que lo necesite.
 *  🚧 No pasa por el libro de consumo: abrir una línea por cada sub-petición del widget agotaría el
 *  tope diario en una sola pantalla. Si Codeoscopic llegara a facturarlo, va a `conLibroDeEmision`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo) {
    return NextResponse.json({ estado: 'error', mensaje: 'falta `path` (string)' }, { status: 400 })
  }
  const v = validarProductForm({ method: cuerpo.method, path: cuerpo.path })
  if (!v.ok) {
    return NextResponse.json({ estado: 'error', mensaje: v.mensaje }, { status: 400 })
  }
  const { metodo, path } = v

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'sin_configurar', mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}` },
      { status: 503 },
    )
  }

  const solicitud: ProductFormRequest = {
    method: metodo,
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
})
