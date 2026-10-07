import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerPanelTarificador } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/panel — salud del bot de Allianz (éxito, tiempos, fallos, IA),
 * renovaciones de comunidades y alertas de cambio de tarifa, leídos del puerto de operador de asegura
 * (`/api/operador/tarificador/panel`). Solo lectura. Error de red → 502, falta de secreto → 503.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await leerPanelTarificador()
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
