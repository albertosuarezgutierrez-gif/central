import { NextResponse } from 'next/server'
import { parseFiltroActividad } from '@central/module-seguros'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { actividadCartera } from '@/lib/actividad-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * El MURO DE ACTIVIDAD de toda la cartera, por el puerto de operador
 * (plataforma → asegura). La pantalla es `plataforma` → `/correduria`; aquí solo
 * está el dato.
 *
 *   GET ?quien=todo|cliente&dias=1|7|30|90&pagina=1
 *     → { estado:'ok', eventos:[...], total, embudo, descartados }
 *
 * Tres cosas que se ven desde fuera y conviene no malinterpretar:
 *
 *   · `clienteId: null` = ese evento lo hizo alguien que NO está casado con
 *     ninguna ficha. Sale igual, sin rellenar con un «Cliente desconocido»:
 *     identificar a esa persona es trabajo, y esconderlo sería perderlo.
 *   · Cada campo del `embudo` es `number | null`, y `null` NO es 0: es «esa
 *     cuenta no se pudo hacer». Se arreglan en sitios distintos.
 *   · `descartados` lista los filtros que no se han entendido. Un `?dias=abc`
 *     ignorado en silencio convertiría «lo de hoy» en «lo del último mes» sin
 *     que nada lo dijera.
 *
 * 🚨 No devuelve ni un dato de contacto (ni correo, ni teléfono, ni dirección):
 * el muro dice qué pasó y de qué ficha, y el dato se mira en la ficha.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { filtro, descartados } = parseFiltroActividad(new URL(req.url).searchParams)
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    const r = await actividadCartera(correduria.id, filtro)
    return NextResponse.json(r.estado === 'ok' ? { ...r, descartados } : r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/actividad', e) })
  }
}
