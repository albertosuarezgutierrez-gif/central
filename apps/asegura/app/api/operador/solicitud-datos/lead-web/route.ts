import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { solicitudParaLeadWeb } from '@/lib/lead-web-solicitud'
import { ACTOR_ENLACE_WEB } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST { clienteId, ramo: <ramo de oportunidad>, existente?: boolean } — lead web recién dado de alta (o, con
 * `existente: true`, de una ficha que ya estaba: venta cruzada, enlace a CIEGAS): abre su oportunidad (tope diario
 * global) y crea el enlace de datos, todo en una llamada.
 *   201 { estado:'ok', oportunidadId, url }  · `url: null` = ya había una solicitud viva (su token no se da)
 *   409 `no_apta` (la ficha no es una recién creada por el formulario) · 429 `tope` · 422/404
 *   503 `sin_migracion` (falta el SQL del CHECK de ramo: solo auto/moto hasta aplicarlo)
 * Regla y porqué en `lib/lead-web-solicitud.ts`. NUNCA loguear la respuesta: lleva el token.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const r = await solicitudParaLeadWeb(correduria.id, b?.clienteId, b?.ramo, ACTOR_ENLACE_WEB, b?.existente === true)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json(
      { estado: 'ok', oportunidadId: r.oportunidadId, ramo: r.ramo, url: r.url },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/solicitud-datos/lead-web', e) }, { status: 503 })
  }
})
