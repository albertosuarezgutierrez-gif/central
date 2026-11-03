import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { leerBotonFex } from '@/lib/felicitaciones-exclientes-reglas'
import { decidirFelicitacionExcliente } from '@/lib/felicitaciones-exclientes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST { decision: 'ok'|'no', clienteId, anio } — el botón ✅ Enviar / ❌ Descartar de la felicitación a un
 * ex-cliente (prefijo `fex`, lo reenvía el webhook de Telegram de plataforma tras comprobar que pulsa Alberto).
 *   → 200 enviada · descartada · sin_cambios (ya decidida) · caducada · ya_no_aplica · sin_destino
 *     409 puerta_cerrada · 502 fallida · 503 sin_correo_configurado / sin_portal · 422 inválida
 */
const STATUS: Record<string, number> = { puerta_cerrada: 409, fallida: 502, sin_correo_configurado: 503, sin_portal: 503 }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const d = leerBotonFex(typeof c?.decision === 'string' ? c.decision : '', [String(c?.clienteId ?? ''), String(c?.anio ?? '')])
  if (!d) return NextResponse.json({ estado: 'invalida' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await decidirFelicitacionExcliente(correduria.id, d)
    return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/felicitaciones/exclientes', e) }, { status: 500 })
  }
})
