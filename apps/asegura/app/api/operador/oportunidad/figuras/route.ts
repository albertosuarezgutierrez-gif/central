import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { asignarFigura, nuevaPersonaEnRiesgo, quitarFigura } from '@/lib/oportunidad-riesgo'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * Figuras del riesgo (29/09/2026).
 *   POST { accion:'asignar', oportunidadId, rol, clienteId, actor }   → pone a esa ficha en el rol
 *   POST { accion:'nueva', oportunidadId, rol, tipoRelacion, persona:{nombre,apellidos,dni,fechaNacimiento,telefono,email?,sexo?,estadoCivil?,fechaCarnet?,tipoCarnet?}, actor }
 *        → alta (lead) + vínculo con el cliente + asignada, sin salir de la oportunidad
 *   DELETE { oportunidadId, rol, actor } → el rol vuelve a ser el del tomador
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim() : 'plataforma'
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (b.accion === 'asignar') {
      const clienteId = typeof b.clienteId === 'string' ? b.clienteId.trim() : ''
      const r = await asignarFigura(correduria.id, { oportunidadId, rol: b.rol, clienteId, actor })
      return r.ok ? NextResponse.json({ estado: 'ok' }) : NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: r.status })
    }
    if (b.accion === 'nueva') {
      const persona = typeof b.persona === 'object' && b.persona !== null ? (b.persona as Record<string, unknown>) : {}
      const r = await nuevaPersonaEnRiesgo(correduria.id, { oportunidadId, rol: b.rol, tipoRelacion: b.tipoRelacion, persona, actor })
      return r.ok
        ? NextResponse.json({ estado: 'ok', clienteId: r.clienteId, existente: r.existente, carnet: r.carnet })
        : NextResponse.json({ estado: 'error', motivo: r.motivo, conflicto: r.conflicto ?? null }, { status: r.status })
    }
    return NextResponse.json({ estado: 'error', motivo: 'accion desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/figuras', e) }, { status: 500 })
  }
})

export const DELETE = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim() : 'plataforma'
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await quitarFigura(correduria.id, { oportunidadId, rol: b.rol, actor })
    return r.ok ? NextResponse.json({ estado: 'ok' }) : NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/figuras', e) }, { status: 500 })
  }
})
