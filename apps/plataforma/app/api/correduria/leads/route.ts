import { NextResponse } from 'next/server'

import { leadsAsegura } from '@/lib/leads-asegura'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/leads — las pólizas que los CLIENTES suben al portal
 * (`apps/asegura-portal`) y que la casa no lleva: las oportunidades de Alberto.
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/leads`) con el secreto de operador y devuelve el MISMO status
 * y json, para que la pantalla lea el contrato del puerto tal cual — quien lo
 * interpreta es `lib/leads-asegura.ts`, que es puro y está probado.
 *
 * Sesión de plataforma obligatoria: esto es la cartera de un tercero mirada
 * desde dentro, y cada fila lleva el número de póliza que ese cliente tiene con
 * otra compañía.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await leadsAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
