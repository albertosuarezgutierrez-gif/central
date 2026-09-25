import { NextResponse } from 'next/server'
import { esCampoCima } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { aplicarSincroCima, decidirDiferenciaCima, estadoSincroCima } from '@/lib/sincro-cima'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Ficha ↔ CIMA (ver `lib/sincro-cima.ts`).
 *
 *   GET  → { estado:'ok', fichas, sinDatosCima, discrepancias[], rellenos, ilegibles }
 *   POST { accion:'rellenar'|'volcar', actor }                       → { aplicados, fallidos[] }
 *   POST { accion:'usar_cima'|'mantener', clienteId, campo, valor, actor } → { estado:'ok' } · 404 · 409 (CIMA cambió) · 422
 */
async function correduria(): Promise<{ r: NextResponse } | { id: string }> {
  if (!aseguraConfigurada()) return { r: NextResponse.json({ estado: 'sin_configurar' }) }
  const c = await correduriaUnica()
  if (!c) return { r: NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 }) }
  return { id: c.id }
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    return NextResponse.json(await estadoSincroCima(c.id))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cima-sincro', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const actor = typeof b?.actor === 'string' && b.actor.trim() ? b.actor.trim().slice(0, 120) : 'corredor'
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const accion = b?.accion
    if (accion === 'rellenar' || accion === 'volcar') {
      return NextResponse.json(await aplicarSincroCima(c.id, accion, actor))
    }
    if (accion === 'usar_cima' || accion === 'mantener') {
      const clienteId = typeof b?.clienteId === 'string' ? b.clienteId : ''
      const valor = typeof b?.valor === 'string' ? b.valor : ''
      if (!/^[0-9a-f-]{36}$/i.test(clienteId) || !esCampoCima(b?.campo) || valor.trim() === '') {
        return NextResponse.json({ estado: 'invalida', motivo: 'Falta la ficha, el campo o el valor visto.' }, { status: 422 })
      }
      const r = await decidirDiferenciaCima(c.id, clienteId, b.campo, accion, actor, valor)
      const status = r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : r.estado === 'cambiado' ? 409 : 422
      return NextResponse.json(r, { status })
    }
    return NextResponse.json({ estado: 'invalida', motivo: 'Acción no válida.' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cima-sincro', e) }, { status: 500 })
  }
})
