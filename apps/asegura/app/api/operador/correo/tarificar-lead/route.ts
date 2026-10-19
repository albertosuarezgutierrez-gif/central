import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { ampliarTopeLead, revisarTarificacionLead, tarificarLead } from '@/lib/tarificacion-lead'
import { diaMadrid, validarPeticionTarificarLead } from '@/lib/tarificacion-lead-puro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * `POST /api/operador/correo/tarificar-lead` (19/10/2026, F3a) — tarificar con BOTS un lead «listo para tarificar». Lo llama
 * plataforma: `revisar` al montar el aviso de Telegram y `tarificar`/`ampliar_tope` SOLO tras el botón de Alberto
 * (`clp_tar` / `clp_top`). Ver `lib/tarificacion-lead.ts`. 🚨 TARIFICAR ≠ EMITIR; nada de Codeoscopic (0,50€) aquí.
 *   { accion:'revisar', clienteId, oportunidadIds[], actor } → 200 { estado:'ok', rpaActivo, oportunidades[], contador|null }
 *   { accion:'tarificar', … } → 200 encolado | 200 nada | 409 tope | 503 apagado | 503 sin_tabla | 503 sin_contador
 *   { accion:'ampliar_tope', dia:'aaaammdd', actor } → 200 ok | 503 sin_tabla
 * Respuestas con compañías, claves del contrato y conteos: ningún valor personal.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = await req.json().catch(() => null)
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const v = validarPeticionTarificarLead(cuerpo, diaMadrid(new Date()))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const p = v.valor
    if (p.accion === 'ampliar_tope') {
      const r = await ampliarTopeLead(correduria.id, p.dia)
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 503 })
    }
    if (p.accion === 'revisar') {
      return NextResponse.json(await revisarTarificacionLead(correduria.id, p), { status: 200 })
    }
    const r = await tarificarLead(correduria.id, p)
    const status = r.estado === 'encolado' || r.estado === 'nada' ? 200 : r.estado === 'tope' ? 409 : 503
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/tarificar-lead', e) }, { status: 500 })
  }
})
