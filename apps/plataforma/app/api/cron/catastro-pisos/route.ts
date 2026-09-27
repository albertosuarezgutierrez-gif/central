import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { enriquecerCatastroPisos } from '@/lib/sivra/catastro-pisos'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 🏛️ m², año de construcción y uso de los pisos turísticos desde el Catastro → `properties.catastro_*`.
// Semanal (lib/cron-dispatch.ts). Solo consulta los pisos que no están en `ok`; el porqué de cada
// uno queda en `catastro_estado`/`catastro_detalle`, y el resultado de la pasada en la respuesta.
async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const pisos = await enriquecerCatastroPisos()
    return NextResponse.json({ ok: true, pisos })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[catastro-pisos]', err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export { handler as GET, handler as POST }
