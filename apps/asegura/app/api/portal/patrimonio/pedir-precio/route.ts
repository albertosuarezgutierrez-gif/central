import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { pedirPrecioPatrimonio } from '@/lib/patrimonio-pedir-precio-portal'
import { validarPedirPrecio } from '@/lib/patrimonio-pedir-precio-reglas'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Puente «Pedir precio» del PATRIMONIO del portal (24/10/2026, P14).
 *
 * POST `{ identidadId, inmuebleId, tipo: 'inmueble_sin_seguro' | 'seguro_no_vigente' }` — crea (o devuelve la ya abierta)
 * la oportunidad `fuente='portal'`, `info_riesgo.origen='portal:patrimonio'`, con su tarea de hoy. NO es `lead-declarada`.
 *
 * 🚨 Como el resto de `/api/portal/*`: NO acepta titular ni `clienteId`. La ficha sale del INMUEBLE y el nivel (`total`)
 * de esa identidad se recalcula aquí (`lib/patrimonio-pedir-precio-portal.ts`). Ajeno o sin nivel = `no_encontrado` (404,
 * nunca 403). `no_aplica` (409): el inmueble tiene un seguro en vigor o no se puede saber. Esta ruta no envía nada al cliente.
 */
export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const v = validarPedirPrecio(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', campo: v.campo }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await pedirPrecioPatrimonio(correduria.id, v.datos)
    const status = r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : 409
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/patrimonio-pedir-precio', e) }, { status: 503 })
  }
})
