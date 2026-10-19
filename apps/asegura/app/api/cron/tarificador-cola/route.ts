import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { barrerTarificadorRpa } from '@/lib/tarificador'

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
 * Cerrojos: `CRON_SECRET` por Bearer (`isCronAuthorized`, vía `requireSecret`) · la LIMPIEZA corre siempre (19/10/2026: con el
 * RPA apagado los trabajos colgados no se limpiaban nunca); `TARIFICADOR_RPA_ACTIVO=1` solo gobierna el LANZAMIENTO de máquinas
 * (apagado: `omitido: rpa_apagado` en el resumen, estado `ok`) · la integración `rpa_autorizada` de cada compañía. TARIFICAR ≠ EMITIR:
 * no encola nada nuevo ni envía nada a nadie.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await barrerTarificadorRpa(correduria.id)
    // Pasos fallidos (`errores`) → 207-like: 500 si falló alguno para que el cron lo marque, sin ocultar el resumen.
    return NextResponse.json({ estado: r.errores ? 'parcial' : 'ok', ...r }, { status: r.errores ? 500 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/tarificador-cola', e) }, { status: 503 })
  }
}
