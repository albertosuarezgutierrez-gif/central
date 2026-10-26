import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { avisosMesa } from '@/lib/avisos-mesa'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET — banda de avisos de «Mi mesa» (13/10/2026): cada cola con plazo o urgente, reducida a
 * {n, plazo más cercano, urgentes}. SOLO LECTURA.
 *   { estado:'ok', hoy, colas: { partes|supresiones|quejas|cambios_cuenta|recibos_lcs|aprobaciones|bajas_pue|
 *     anulaciones|recibos_sin_confirmar|correos_compania_sin_resolver|proyectos_caducan: {estado:'ok', n, plazo, urgentes} | {estado:'error'} } }
 * Por cola: `ok` con n = 0 = comprobado y no hay; `error` = no se ha podido comprobar (nunca «0»).
 * La ingesta de CIMA no va aquí: la compone plataforma con su veredicto (`veredictoIngesta`).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', ...(await avisosMesa(correduria.id)) }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/avisos', e) }, { status: 500 })
  }
}
