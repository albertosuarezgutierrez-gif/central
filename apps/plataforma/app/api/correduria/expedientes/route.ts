import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { expedientesAsegura } from '@/lib/seguimiento-asegura'
import { interpretarExpedientes } from '@/lib/correduria/expedientes'

export const dynamic = 'force-dynamic'

/**
 * GET — «Mis expedientes»: las oportunidades de trabajo de Alberto en todos los clientes (puerto de
 * asegura `/api/operador/expedientes`). Las acciones (aparcar, posponer, notas…) van por
 * `/api/correduria/oportunidad`, que ya reenvía el cuerpo con el `actor` de la sesión.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await expedientesAsegura()
  return NextResponse.json(interpretarExpedientes(r.status, r.json))
}
