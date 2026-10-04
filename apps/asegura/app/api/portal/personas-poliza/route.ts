import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { personasPolizaPortal } from '@/lib/personas-portal'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/portal/personas-poliza?identidadId=&polizaId= — las personas de CIMA de UNA póliza
 * (sus propias figuras completas; de las demás, papel y nombre) y los terceros de sus siniestros
 * (solo papel, nombre, matrícula y compañía del contrario). Ver `lib/personas-portal.ts`.
 *
 * 🚨 No acepta `clienteId`: la póliza solo se lee si su tomador es una ficha vinculada a esa
 * identidad (`portal_vinculo`) o figura en ella. Si no, 404 `no_visible` — nunca 403.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = new URL(req.url)
  const identidadId = (url.searchParams.get('identidadId') ?? '').trim()
  const polizaId = (url.searchParams.get('polizaId') ?? '').trim()
  const uuid = /^[0-9a-f-]{36}$/i
  if (!uuid.test(identidadId) || !uuid.test(polizaId)) {
    return NextResponse.json({ estado: 'invalido', motivo: 'identidadId y polizaId (uuid)' }, { status: 422 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await personasPolizaPortal(correduria.id, identidadId, polizaId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'no_visible' ? 404 : 503
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/personas-poliza', e) }, { status: 503 })
  }
}
