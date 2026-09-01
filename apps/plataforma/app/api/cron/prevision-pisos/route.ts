import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { snapshotPrevision } from '@/lib/sivra/prevision-pisos'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { tgAvisoAlerta } from '@/lib/telegram'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// 🔮 Foto diaria de la previsión por piso (mes en curso + 2) → `pisos_previsiones`.
// Es el registro que permite juzgar después si las previsiones se cumplen (seguimiento en
// /sivra/resultado-pisos). Además decide el aviso «previsión floja» a ~30 días del mes
// (dedupe en BD: una vez por mes y piso). Job en lib/cron-dispatch.ts (05:50 UTC).
async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Latido de INTENTO al arrancar (lección facturas-scan 31/07): si la pasada muere a mitad,
  // que quede la marca de que se disparó — «no se dispara» y «no termina» son averías distintas.
  await registrarLatido('sivra_prevision', false, 'pasada en curso')
  try {
    const r = await snapshotPrevision()
    for (const aviso of r.avisos) {
      await tgAvisoAlerta('pisos.prevision', `🔮 Previsión floja — ${aviso}\nMira /sivra/resultado-pisos (sección Previsión).`, 'aviso')
    }
    await registrarLatido('sivra_prevision', true,
      `${r.snapshots} previsiones guardadas · ${r.avisos.length} aviso(s) de pace flojo`)
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await registrarLatido('sivra_prevision', false, `error: ${msg}`.slice(0, 500))
    console.error('[prevision-pisos]', err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export { handler as GET, handler as POST }
