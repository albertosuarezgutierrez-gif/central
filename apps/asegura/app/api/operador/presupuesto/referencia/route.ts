import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { buscarPresupuestoPorReferencia } from '@/lib/presupuesto-referencia'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/presupuesto/referencia?q=AS-26-0042 — el presupuesto por su REFERENCIA propia
 * (solo lectura, gratis). Lo pide el buscador principal de `/correduria` cuando lo tecleado tiene
 * forma de referencia (tolerante a minúsculas, espacios y guiones).
 *
 *   { estado:'no_es_referencia' } · { estado:'no_encontrado', referencia } · { estado:'ok', presupuesto }
 *
 * 🚨 Un fallo de lectura es `{estado:'error', causa}`, NUNCA `no_encontrado`: «esa referencia no
 * existe» sobre algo que no se ha podido mirar manda al corredor a re-tarificar (0,50€) sin motivo.
 * Solo las opciones que van en el documento (`oculta_at IS NULL`); nunca el nº de proyecto de Avant2.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    return NextResponse.json(await buscarPresupuestoPorReferencia(correduria.id, q))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/referencia', e) })
  }
}
