import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { listarLeads } from '@/lib/leads-portal'
import { operadorAutorizado } from '@/lib/operador'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Las pólizas que los clientes han subido al portal, como OPORTUNIDADES
 * (plataforma → asegura, Bearer).
 *
 *   GET → { estado:'ok', leads, sinIdentificar }
 *
 * 🚨 Los tres estados de salida son distintos y NO se pueden confundir aguas
 * abajo, porque los tres pintan una pantalla vacía y solo uno autoriza a decir
 * que no hay nada que trabajar:
 *
 *   · `sin_configurar` → esta app no tiene BD de cartera configurada.
 *   · `error`          → no se ha podido leer. NUNCA una lista vacía.
 *   · `ok` + `leads: []` → se ha leído y no hay ninguno.
 *
 * Y `sinIdentificar` no es una curiosidad: cuenta las declaradas de gente que
 * NO está casada con ninguna ficha de la cartera. Son leads igual, pero antes
 * de llamar a nadie hay que saber quién es.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })

    const r = await listarLeads(correduria.id)
    if (!r.ok) return NextResponse.json({ estado: 'error', motivo: r.motivo })
    return NextResponse.json({ estado: 'ok', leads: r.leads, sinIdentificar: r.sinIdentificar })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/leads', e) })
  }
}
