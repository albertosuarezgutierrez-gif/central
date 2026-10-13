import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { planExpedientesAuto } from '@/lib/expedientes-auto'

export const dynamic = 'force-dynamic'

/**
 * GET — ENSAYO de los expedientes que se abren solos (13/10/2026): qué renovaciones de cartera propia y
 * qué pólizas declaradas del portal abriría HOY la pasada del detector (ventana 60-30 días), cuáles no y
 * por qué, y qué renovaciones abiertas solas cerraría. SOLO LECTURA: quien escribe es `detectarYGuardar`.
 *   { estado:'ok', hoy, aperturas:[{tipo,clienteId,origenId,ramo,vence,dias,fechaAccion,texto,…}],
 *     noAbiertas:{renovacion:{motivo:n},declarada:{motivo:n}}, cierres:[{id,motivo}] }
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const plan = await planExpedientesAuto(prismaAsegura(), correduria.id, hoy)
    return NextResponse.json({ estado: 'ok', ...plan })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/expedientes/auto', e) }, { status: 500 })
  }
}
