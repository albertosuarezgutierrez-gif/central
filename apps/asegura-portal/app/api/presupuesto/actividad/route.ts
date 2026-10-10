import { NextResponse } from 'next/server'

import { registrarActividad } from '@/lib/presupuesto-ia'
import { leerActividad } from '@/lib/todas-las-opciones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/presupuesto/actividad — telemetría de «Todas las opciones».
 *   { presupuestoId, garantias: string[] (claves del catálogo), comparadas: string[] (ids de opción, ≤2) }
 *
 * Se reenvía al puente de asegura (`/api/portal/presupuesto`, acción `actividad`) con la identidad de
 * la SESIÓN —nunca una que venga en el cuerpo—, y asegura decide la ficha por `portal_vinculo`, igual
 * que el resto de acciones del presupuesto.
 *
 * Fire-and-forget: el navegador no espera nada útil. Por eso responde 202 aunque el puente falle —un
 * fallo de telemetría no es algo que el cliente pueda ni deba arreglar—; lo que sí se corta con su
 * código es lo que NO debe reenviarse: sin sesión (401), la vista de corredor (403: Alberto mirando no
 * es actividad del cliente) y un cuerpo con forma rara (422).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const a = leerActividad(await req.json().catch(() => null))
  if (a === null) return NextResponse.json({ estado: 'invalido' }, { status: 422 })

  await registrarActividad(identidad.id, a.presupuestoId, { garantias: a.garantias, comparadas: a.comparadas })
  return NextResponse.json({ estado: 'recibido' }, { status: 202 })
}
