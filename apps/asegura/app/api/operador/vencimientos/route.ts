import { NextResponse } from 'next/server'
import { DIAS_HORIZONTE_RENOVACION } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica, vencimientosProximos } from '@/lib/cartera'

export const dynamic = 'force-dynamic'

// GET /api/operador/vencimientos?dias=90 — pólizas a renovar (read-only).
// Mismos TRES estados que el resumen: «sin conectar» no puede leerse como
// «no vence nada». Una lista vacía con estado 'ok' sí significa que no hay.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : DIAS_HORIZONTE_RENOVACION
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', dias, polizas: await vencimientosProximos(correduria.id, dias) })
  } catch {
    return NextResponse.json({ estado: 'error' })
  }
}
