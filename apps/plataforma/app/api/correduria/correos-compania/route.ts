import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { correosCompaniaAsegura, marcarCorreoCompaniaAsegura } from '@/lib/seguimiento-asegura'
import { interpretarCorreosCompania } from '@/lib/correduria/correos-compania'

export const dynamic = 'force-dynamic'

/**
 * GET — bandeja «Correos de compañía» de Mi mesa (14/10/2026): avisos de compañías leídos del correo en los
 * últimos 30 días con su estado (aplicado · ya en CIMA · sin resolver · a medias), los sin resolver primero.
 * Contrato en `lib/correduria/correos-compania.ts`; un fallo de lectura es `error`, nunca lista vacía.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await correosCompaniaAsegura(30)
  return NextResponse.json(interpretarCorreosCompania(r.status, r.json), { headers: { 'cache-control': 'no-store' } })
}

/**
 * PATCH { id, revisado } — «Marcar como mirado» / «Deshacer» (14/10/2026). Mismo guarda que el GET; reenvía al
 * puerto de asegura (`PATCH /api/operador/correo/evento`) y devuelve su MISMO status y json.
 */
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.id !== 'string' || typeof b.revisado !== 'boolean') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id o si está mirado.' }, { status: 422 })
  }
  const r = await marcarCorreoCompaniaAsegura({ id: b.id, revisado: b.revisado })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
