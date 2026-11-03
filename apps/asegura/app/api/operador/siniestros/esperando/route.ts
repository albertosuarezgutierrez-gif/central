import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { siniestrosEsperandoCompania } from '@/lib/siniestro-hilo'
import { correduriaPedida, respuestaFallo } from '@/lib/siniestro-hilo-puerto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Siniestros esperando respuesta de la compañía (contador «Hoy»), por el puerto de operador.
 *
 *   GET ?correduriaId → 200 [{ siniestroId, clienteId, polizaNumero, dias }]
 *
 * «Esperando» = el último `enviado` del corredor en el hilo no tiene mensaje posterior de la compañía; fuera los
 * fusionados y los cerrados con resultado. Un error NO es `[]`: es 500/503 (la pantalla dice «no se sabe»).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduriaPedida(new URL(req.url).searchParams.get('correduriaId'))
    if (!c.ok) return c.res
    const r = await siniestrosEsperandoCompania(c.id)
    if (!r.ok) return respuestaFallo(r)
    // Contrato: el array tal cual en 200. Un fallo NUNCA es `[]`: va con su status (500/503) y `estado`.
    return NextResponse.json(r.lista)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestros/esperando', e) }, { status: 500 })
  }
}
