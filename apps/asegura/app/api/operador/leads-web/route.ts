import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { conversionLeadsWeb } from '@/lib/leads-web-conversion'

export const dynamic = 'force-dynamic'

// GET /api/operador/leads-web — cuántos leads captados por apps/asegura-web
// (`clientes.fuente='web'`) son hoy cartera viva, y quién queda por trabajar.
// Read-only. `estado:'ok'` con `total:0` es un estado legítimo (la web lleva
// poco viva): no se colapsa con `sin_configurar`/`error`.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const r = await conversionLeadsWeb(correduria.id)
    if (!r) return NextResponse.json({ estado: 'sin_configurar' })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/leads-web', e) })
  }
}
