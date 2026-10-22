import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { altaInquilinoDesdePortal, piiInquilinoParaPortal } from '@/lib/patrimonio-inquilino-portal'
import { revisarAltaInquilino } from '@/lib/patrimonio-inquilino-reglas'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Puente del PATRIMONIO del portal (22/10/2026, paso 9): la PII del inquilino (NIF, correo, teléfono) se cifra AQUÍ,
 * que es donde está `PII_ENCRYPTION_KEY`; el portal no la tiene ni la guarda.
 *
 * POST `{ identidadId, contratoId, tipo, nombre, papel?, nif?, email?, telefono? }` — alta del inquilino en el contrato.
 * GET `?identidadId=&inquilinoId=` — la PII descifrada para el propietario (nivel Total).
 *
 * 🚨 Como el resto de `/api/portal/*`: NO acepta titular ni `clienteId`. El titular sale del contrato/inquilino y el
 * nivel de esa identidad se recalcula aquí (`lib/patrimonio-inquilino-portal.ts`). Sin nivel o ajeno = `no_encontrado`.
 * Sin clave de cifrado = `sin_clave` (503) y NO se escribe nada en claro. La respuesta del alta no lleva ningún dato.
 */
export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const r = revisarAltaInquilino(await req.json().catch(() => null))
    if (!r.ok) return NextResponse.json({ estado: 'invalido', campo: r.campo, motivo: r.motivo }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const alta = await altaInquilinoDesdePortal(correduria.id, r.datos)
    if (alta.estado === 'ok') return NextResponse.json({ estado: 'ok', id: alta.id }, { status: 201 })
    if (alta.estado === 'sin_clave') return NextResponse.json({ estado: 'sin_clave' }, { status: 503 })
    return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/patrimonio-inquilino', e) }, { status: 503 })
  }
})

export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const q = new URL(req.url).searchParams
    const identidadId = (q.get('identidadId') ?? '').trim()
    const inquilinoId = (q.get('inquilinoId') ?? '').trim()
    if (!UUID.test(identidadId) || !UUID.test(inquilinoId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await piiInquilinoParaPortal(correduria.id, identidadId, inquilinoId)
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 404, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/patrimonio-inquilino', e) }, { status: 503 })
  }
}
