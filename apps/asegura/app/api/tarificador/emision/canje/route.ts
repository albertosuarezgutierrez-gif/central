import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { canjearEmision } from '@/lib/tarificador-emision'
import { leerCanje } from '@/lib/tarificador-emision-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/emision/canje` `{ trabajoId, token, primaCents }` — el worker, en la pantalla previa y JUSTO
 * antes de pulsar, canjea el token de un solo uso con la prima que acaba de leer. Bearer `TARIFICADOR_WORKER_SECRET`.
 * 200 `{ ok: true, hashDatos, boton }` = puede pulsar ESE botón UNA vez. Cualquier otra cosa = no pulsa (y el token
 * queda consumido). 🚨 El token NUNCA va a un log: ni el cuerpo ni el error se imprimen.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const l = leerCanje(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ ok: false, motivo: l.error }, { status: 400 })
  try {
    const r = await canjearEmision({ trabajoId: l.trabajoId, token: l.token, primaCents: l.primaCents })
    if (!r.ok) return NextResponse.json({ ok: false, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ ok: true, hashDatos: r.hashDatos, boton: r.boton }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[tarificador] canje de emisión', l.trabajoId, e instanceof Error ? e.name : typeof e)
    return NextResponse.json({ ok: false, motivo: 'error' }, { status: 503 })
  }
}
