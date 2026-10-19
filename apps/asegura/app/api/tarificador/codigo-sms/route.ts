import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { pedirCodigo } from '@/lib/tarificador-codigo-sms'
import { clasificarErrorBdCodigo, leerPeticion } from '@/lib/tarificador-codigo-sms-reglas'
import { codigoErrorParaLog } from '@/lib/tarificador-sesion-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/codigo-sms` `{ trabajoId, clavePublica }` — el worker (Bearer `TARIFICADOR_WORKER_SECRET`) está en la
 * pantalla del SMS de Okta de Generali y pide el código (services/tarificador-rpa/src/relevo-sms.ts). Abre la petición de SU
 * trabajo (`en_curso` con lease vivo; la correduría sale de la fila) y le alarga el lease para que quepa la espera. Plataforma
 * avisa por Telegram (cron cada minuto) y entrega la respuesta por el puerto de operador.
 *   200 `{ estado:'pedido', ref, caducaEn, leaseHasta }` · 400 forma · 404 `sin_trabajo` · 422 `compania_sin_relevo`
 *   · 503 `codigo_sms_sin_activar` (SQL sin aplicar) / `error`.
 * Sin `auditado()`: no es el puerto de operador (como /resultado y /sesion). La clave pública no es secreta; aun así no se loguea.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const p = leerPeticion(await req.json().catch(() => null))
  if (!p.ok) return NextResponse.json({ estado: 'error', motivo: p.motivo }, { status: p.status })
  try {
    const r = await pedirCodigo(p.valor.trabajoId, p.valor.clavePublica)
    if (r.estado === 'sin_trabajo') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'compania_sin_relevo') return NextResponse.json(r, { status: 422 })
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    const c = clasificarErrorBdCodigo(e)
    console.error('[tarificador] codigo-sms pedir', c.estado, codigoErrorParaLog(e))
    return NextResponse.json({ estado: c.estado, ...(c.mensaje ? { mensaje: c.mensaje } : {}) }, { status: c.status })
  }
}
