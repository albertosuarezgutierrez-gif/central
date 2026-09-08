import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { vistaCorredorAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'

/**
 * La «vista de corredor»: un enlace de un solo uso para abrir el portal como
 * lo ve este cliente. Solo sesión (es Alberto mirando su propia cartera con los
 * ojos del cliente); el puerto de asegura hace el resto.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  const r = await vistaCorredorAsegura({ clienteId: body.clienteId.trim(), actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
