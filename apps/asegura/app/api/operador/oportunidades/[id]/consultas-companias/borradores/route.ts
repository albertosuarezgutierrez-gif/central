import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { crearBorradores } from '@/lib/consulta-compania-flujo'
import { puertosConsulta } from '@/lib/consulta-compania-bd'
import { actorDe, correduriaDeLaPeticion, respuesta } from '@/lib/consulta-compania-ruta'
import { leerResponderAntes } from '@central/module-seguros'

export const dynamic = 'force-dynamic'
// La IA redacta (una llamada por compañía, en paralelo, tope 45 s cada una): margen bajo los 95 s de plataforma.
export const maxDuration = 90

type Ctx = { params: Promise<{ id: string }> }

const esListaTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/**
 * `POST /api/operador/oportunidades/[id]/consultas-companias/borradores` (15/10/2026, fase 1)
 *   { correduriaId?, destinatarios: string[], incluirIdentidad: boolean, incluirCompetencia: boolean,
 *     adjuntos: string[], responderAntes: 'aaaa-mm-dd' | null }
 * Crea UNA consulta `borrador` por compañía (las personas de una compañía van juntas en Para). La IA (`iaTexto`)
 * redacta SOLO con la lista blanca de riesgo + marcadores de identidad; si no responde, plantilla fija. Nada se envía.
 * → `{ estado: 'ok', consultas: ConsultaDTO[], redaccion: [{ id, por: 'ia' | 'plantilla' }] }` (cuerpo con el DNI enmascarado).
 */
export const POST = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON requerido' }, { status: 400 })
  if (!esListaTexto(b.destinatarios)) return NextResponse.json({ estado: 'invalido', motivo: 'destinatarios tiene que ser una lista de ids' }, { status: 400 })
  if (typeof b.incluirIdentidad !== 'boolean' || typeof b.incluirCompetencia !== 'boolean') {
    return NextResponse.json({ estado: 'invalido', motivo: 'incluirIdentidad e incluirCompetencia tienen que ser true o false' }, { status: 400 })
  }
  const adjuntos = b.adjuntos === undefined ? [] : b.adjuntos
  if (!esListaTexto(adjuntos)) return NextResponse.json({ estado: 'invalido', motivo: 'adjuntos tiene que ser una lista de ids' }, { status: 400 })
  const responderAntes = b.responderAntes === undefined ? null : leerResponderAntes(b.responderAntes)
  if (responderAntes === undefined) return NextResponse.json({ estado: 'invalido', motivo: 'responderAntes tiene que ser aaaa-mm-dd o null' }, { status: 400 })
  try {
    const c = await correduriaDeLaPeticion(b.correduriaId)
    if (!c.ok) return c.res
    const actor = actorDe(req)
    const r = await crearBorradores(puertosConsulta(actor), c.id, id, {
      destinatarios: b.destinatarios, incluirIdentidad: b.incluirIdentidad, incluirCompetencia: b.incluirCompetencia,
      adjuntos, responderAntes, actor,
    })
    return respuesta(r, (v) => v)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/consultas-companias/borradores', e) }, { status: 500 })
  }
})
