import { NextResponse } from 'next/server'
import { DIAS_ANUALIDAD, DIAS_HORIZONTE_RENOVACION } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica, vencidasFueraDeVentana, vencimientosProximos } from '@/lib/cartera'

export const dynamic = 'force-dynamic'

// GET /api/operador/vencimientos?dias=90 — pólizas a renovar (read-only).
// Mismos TRES estados que el resumen: «sin conectar» no puede leerse como
// «no vence nada». Una lista vacía con estado 'ok' sí significa que no hay.
//
// 🚨 `dias` es el horizonte HACIA DELANTE. La ventana también mira HACIA ATRÁS
// una anualidad (`diasAtras`), y eso no es un extra: sin ello una póliza que
// venció ayer sin gestionar desaparecía de la pantalla, del cron y del contador
// (arreglado 20/09/2026; ver `lib/cartera.ts`). `diasAtras` viaja en la
// respuesta para que quien la pinta pueda DECIR qué ventana está mirando en vez
// de suponer que empieza hoy.
//
// `vencidasAntiguas` cuenta lo que queda fuera por el otro lado —vigentes con
// vencimiento de hace más de una anualidad, dato a depurar— y es `number` o
// `null` («no se ha podido contar»), jamás 0 por omisión.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : DIAS_HORIZONTE_RENOVACION
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const [polizas, vencidasAntiguas] = await Promise.all([
      vencimientosProximos(correduria.id, dias),
      vencidasFueraDeVentana(correduria.id),
    ])
    return NextResponse.json({
      estado: 'ok', dias, diasAtras: DIAS_ANUALIDAD, polizas, vencidasAntiguas,
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/vencimientos', e) })
  }
}
