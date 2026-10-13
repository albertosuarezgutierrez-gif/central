import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { barrerTarificadorRpa } from '@/lib/tarificador'
import { rpaActivo } from '@/lib/tarificador-reglas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/tarificador-cola — barrido de la cola del tarificador RPA cada 5 min (13/10/2026, defecto 2:
 * antes solo barría el cron de renovaciones, 3 veces al día en laborables).
 *
 * Hace lo de `barrerTarificadorRpa`: leases vencidos → fallo de infra (y destruye la máquina), `error_reintentable`
 * bajo el tope → `pendiente`, cancela lo de integraciones ya no autorizadas y lanza lo que quepa bajo
 * `max_concurrencia` (el cerrojo por compañía de `reclamarSiguiente` manda; este cron no lo salta).
 *
 * Cerrojos: `CRON_SECRET` por Bearer (`isCronAuthorized`, vía `requireSecret`) · `TARIFICADOR_RPA_ACTIVO=1` (si no,
 * `omitido: rpa_apagado` sin tocar nada) · la integración `rpa_autorizada` de cada compañía. TARIFICAR ≠ EMITIR:
 * no encola nada nuevo ni envía nada a nadie.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Apagado: ni toca la BD (corre 288 veces al día).
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'omitido', omitido: 'rpa_apagado' })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await barrerTarificadorRpa(correduria.id)
    return NextResponse.json({ estado: r.omitido ? 'omitido' : 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/tarificador-cola', e) }, { status: 503 })
  }
}
