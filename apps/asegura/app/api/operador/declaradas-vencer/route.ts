import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { DIAS_AVISO_DECLARADAS, declaradasPorVencer } from '@/lib/cartera-declaradas'

export const dynamic = 'force-dynamic'

// GET /api/operador/declaradas-vencer?dias=60 — pólizas DECLARADAS (de otra
// compañía) que vencen pronto, con la ficha vinculada para poder llamar.
// Read-only. Mismos tres estados que /vencimientos.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : DIAS_AVISO_DECLARADAS
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const { filas, sinVincular } = await declaradasPorVencer(correduria.id, dias)
    return NextResponse.json({ estado: 'ok', dias, declaradas: filas, sinVincular })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/declaradas-vencer', e) })
  }
}
