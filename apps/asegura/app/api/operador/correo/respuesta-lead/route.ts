import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { casarRespuestaLead, guardarRespuestaLead } from '@/lib/correo-respuesta-lead'
import { validarCasar, validarGuardar } from '@/lib/correo-respuesta-lead-puro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * `POST /api/operador/correo/respuesta-lead` (19/10/2026, F2) — la respuesta de un lead en su hilo. Lo llama el triaje de
 * plataforma. Ver `lib/correo-respuesta-lead.ts`.
 *   { accion:'casar', referencias[], from } → 200 { estado:'ok', hiloId, clienteId, pila, oportunidades[{id, ramo}] }
 *     | 200 { estado:'sin_hilo' | 'ambiguo' } | 503 { estado:'sin_tabla' }
 *   { accion:'guardar', hiloId, from, gmailMessageId, valores{clave: valor}, actor } → 200 { estado:'ok', oportunidades[
 *     {id, ramo, nuevos[], iguales[], discrepancias[], protegidos[], sinClave[], invalidos[], faltan[], guardado}],
 *     completo, estadoDatos, historial } — SOLO claves, nunca valores.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = await req.json().catch(() => null)
  const accion = (cuerpo as { accion?: unknown } | null)?.accion
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    if (accion === 'casar') {
      const v = validarCasar(cuerpo)
      if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
      const correduria = await correduriaUnica()
      if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
      const r = await casarRespuestaLead(correduria.id, v.valor)
      return NextResponse.json(r, { status: r.estado === 'sin_tabla' ? 503 : 200 })
    }
    if (accion === 'guardar') {
      const v = validarGuardar(cuerpo)
      if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
      const correduria = await correduriaUnica()
      if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
      const r = await guardarRespuestaLead(correduria.id, v.valor)
      return NextResponse.json(r, { status: r.estado === 'sin_tabla' ? 503 : r.estado === 'ok' ? 200 : 409 })
    }
    return NextResponse.json({ estado: 'invalido', motivo: 'accion desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/respuesta-lead', e) }, { status: 500 })
  }
})
