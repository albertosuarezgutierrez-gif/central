import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { correosCompaniaAsegura } from '@/lib/seguimiento-asegura'
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
