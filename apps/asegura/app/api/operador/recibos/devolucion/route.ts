import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { darDeBajaPorDevolucion, registrarDevoluciones, resolverDevolucion, validarDevoluciones } from '@/lib/devoluciones-recibo'
import { motivoBajaValido } from '@/lib/baja-devolucion-reglas'

export const dynamic = 'force-dynamic'

/**
 * Recibos devueltos que avisa la compañía por correo (CIMA solo los trae de Occident).
 *   POST  { devoluciones: DevolucionEntrada[], mensajeId? } → registra, marca el recibo y abre la llamada
 *   PATCH { reciboId, actor }                               → «cobrado de nuevo» a mano
 *   PATCH { reciboId, actor, accion:'baja', motivo, nota? } → «el cliente se va»: póliza anulada
 *         (baja verificada) + oportunidad de competencia para el aniversario
 * Lo llama plataforma: el triaje de correo (POST) y la ficha de la póliza (PATCH).
 */
export const POST = auditado(async (req: Request) => {
  return conCorreduria(req, async (correduriaId, b) => {
    const v = validarDevoluciones(b)
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const resultados = await registrarDevoluciones(correduriaId, v.devoluciones, v.mensajeId)
    return NextResponse.json({ estado: 'ok', resultados })
  })
})

export const PATCH = auditado(async (req: Request) => {
  return conCorreduria(req, async (correduriaId, b) => {
    if (typeof b.reciboId !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta reciboId' }, { status: 422 })
    const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    if (b.accion === 'baja') {
      const motivo = motivoBajaValido(b.motivo)
      if (!motivo) return NextResponse.json({ estado: 'invalido', motivo: 'motivo de baja no válido' }, { status: 422 })
      const nota = typeof b.nota === 'string' && b.nota.trim() !== '' ? b.nota.trim().slice(0, 500) : null
      const baja = await darDeBajaPorDevolucion(correduriaId, b.reciboId, motivo, nota, actor)
      if (!baja.ok) return NextResponse.json({ estado: baja.estado, motivo: baja.motivo }, { status: baja.status })
      return NextResponse.json({ estado: 'ok', oportunidadId: baja.oportunidadId, vence: baja.vence, llamada: baja.llamada, oportunidadExistente: baja.oportunidadExistente })
    }
    const r = await resolverDevolucion(correduriaId, b.reciboId, actor)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok' })
  })
})

async function conCorreduria(req: Request, accion: (correduriaId: string, b: Record<string, unknown>) => Promise<Response>): Promise<Response> {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON no válido' }, { status: 422 })
    return await accion(correduria.id, b)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/recibos/devolucion', e) }, { status: 500 })
  }
}
