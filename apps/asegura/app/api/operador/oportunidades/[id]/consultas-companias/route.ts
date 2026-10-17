import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerPanel } from '@/lib/consulta-compania-flujo'
import { puertosConsulta } from '@/lib/consulta-compania-bd'
import { actorDe, correduriaDeLaPeticion, respuesta } from '@/lib/consulta-compania-ruta'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * `GET /api/operador/oportunidades/[id]/consultas-companias?correduriaId=` (15/10/2026, fase 1) — el panel
 * «Consultar a compañías»: compañías con sus contactos (y `ramos`, `null` = sin clasificar; solo ORDENA, nunca
 * premarca), datos mínimos que faltan (aviso, no bloqueo), competencia, documentos adjuntables, tomador con el DNI
 * ENMASCARADO, la fecha límite propuesta (vencimiento − 15 días o `null`) y las consultas ya hechas.
 * `correduriaId` opcional: si viene y no casa, 403.
 */
export async function GET(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const c = await correduriaDeLaPeticion(new URL(req.url).searchParams.get('correduriaId'))
    if (!c.ok) return c.res
    return respuesta(await leerPanel(puertosConsulta(actorDe(req)), c.id, id), (v) => v)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/consultas-companias', e) }, { status: 500 })
  }
}
