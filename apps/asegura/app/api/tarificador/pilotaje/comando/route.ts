import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayPilotaje } from '@/lib/esquema-bd'
import { exploradorActivo } from '@/lib/tarificador-explorador-reglas'
import { TOPES_PILOTAJE } from '@/lib/tarificador-pilotaje-reglas'
import { recogerComando, sesionViva } from '@/lib/tarificador-pilotaje'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/tarificador/pilotaje/comando` `{ trabajoId, n }` — el worker sondea (cada 2 s) si hay comando para la pantalla `n`.
 * 200 `{ comando: {...} | null, leaseHasta }`. Al servirlo, la fila pasa a `ejecutando` (el comando queda congelado). El comando
 * NO se valida aquí más que en forma de jsonb: el worker lo REVALIDA entero y lo ejecuta solo por la puerta del guard.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!exploradorActivo(process.env)) return NextResponse.json({ estado: 'apagado' }, { status: 503 })
  const b = (await req.json().catch(() => null)) as { trabajoId?: unknown; n?: unknown } | null
  const trabajoId = typeof b?.trabajoId === 'string' && RE_UUID.test(b.trabajoId) ? b.trabajoId : null
  const n = typeof b?.n === 'number' && Number.isInteger(b.n) && b.n >= 1 && b.n <= TOPES_PILOTAJE.maxPasos ? b.n : null
  if (!trabajoId || n === null) return NextResponse.json({ estado: 'error', errores: ['trabajoId uuid y n entero'] }, { status: 400 })
  try {
    if (!(await hayPilotaje())) return NextResponse.json({ estado: 'error', motivo: 'pilotaje_sin_esquema' }, { status: 503 })
    const s = await sesionViva(trabajoId)
    if (!s) return NextResponse.json({ estado: 'no_disponible', motivo: 'pilotaje_no_en_curso' }, { status: 404 })
    const r = await recogerComando(s, n)
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[tarificador/pilotaje] comando', trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
