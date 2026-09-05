import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { colaSupresiones, resolverSupresion } from '@/lib/supresiones'

export const dynamic = 'force-dynamic'

// GET  /api/operador/supresiones[?todas=1]
// POST /api/operador/supresiones   { id, estado, respuesta?, prorrogaMotivo?, actor }
//
// La cola de solicitudes del **derecho de supresión (art. 17 RGPD)** que llegan
// por el portal del cliente, y la forma de contestarlas.
//
// 🚨 Este puerto existe porque, sin él, la solicitud NO LA VE NADIE. Alberto
// trabaja la correduría desde `plataforma` → `/correduria`; una fila en la BD del
// portal sin pantalla que la enseñe es la regla de la casa incumplida en el sitio
// más caro: aquí lo que corre por debajo es un plazo legal de **un mes** (art.
// 12.3) que se pasa solo, en silencio, y sin que nada falle.
//
// 🕐 La cola viene ordenada por el RELOJ (vencido → urgente → en plazo), no por
// orden de llegada, y trae `resumen.vencidas` aparte: es el único número que
// autoriza a decir que hay un plazo incumplido.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const todas = new URL(req.url).searchParams.get('todas') === '1'
  try {
    return NextResponse.json(await colaSupresiones(todas))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/supresiones', e) })
  }
}

// 🚨 Contestar EXIGE texto (`sin_respuesta` → 422). El art. 12.4 obliga a motivar
// la negativa aunque sea parcial, y aquí la parcial es el caso normal: casi
// siempre habrá algo que la ley obliga a conservar. Marcarla resuelta sin decir
// qué se contestó apagaría el reloj sin acreditar nada — el incumplimiento se
// volvería invisible justo al producirse.
const ESTADOS = ['en_curso', 'resuelta_total', 'resuelta_parcial', 'denegada'] as const

export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  const estado = cuerpo?.estado
  const actor = typeof cuerpo?.actor === 'string' ? cuerpo.actor.trim() : ''
  if (id === '' || actor === '' || typeof estado !== 'string' || !ESTADOS.includes(estado as never)) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }

  try {
    const r = await resolverSupresion({
      id,
      estado: estado as (typeof ESTADOS)[number],
      respuesta: typeof cuerpo?.respuesta === 'string' ? cuerpo.respuesta : null,
      prorrogaMotivo: typeof cuerpo?.prorrogaMotivo === 'string' ? cuerpo.prorrogaMotivo : null,
      actor,
    })
    if (r.estado === 'error') {
      return NextResponse.json(r, { status: r.motivo === 'no_encontrada' ? 404 : 422 })
    }
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/supresiones', e) })
  }
}
