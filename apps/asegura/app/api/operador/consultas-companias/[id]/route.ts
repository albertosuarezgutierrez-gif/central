import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { editarBorrador, type EdicionBorrador } from '@/lib/consulta-compania-flujo'
import { puertosConsulta } from '@/lib/consulta-compania-bd'
import { actorDe, correduriaDeLaPeticion, respuesta } from '@/lib/consulta-compania-ruta'
import { leerResponderAntes } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/operador/consultas-companias/[id]` (15/10/2026, fase 1)
 *   { correduriaId?, asunto?, cuerpo?, adjuntos?: string[], responderAntes?: 'aaaa-mm-dd' | null }
 * Solo en `borrador` (si no, 409). El cuerpo vuelve de la pantalla con el DNI ENMASCARADO: aquí se convierte otra vez
 * en marcadores; un documento enmascarado suelto → 422 (nunca se enviaría a medias). → `{ estado: 'ok', consulta }`.
 */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON requerido' }, { status: 400 })
  const e: EdicionBorrador = {}
  if (b.asunto !== undefined) {
    if (typeof b.asunto !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'asunto tiene que ser texto' }, { status: 400 })
    e.asunto = b.asunto
  }
  if (b.cuerpo !== undefined) {
    if (typeof b.cuerpo !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo tiene que ser texto' }, { status: 400 })
    e.cuerpo = b.cuerpo
  }
  if (b.adjuntos !== undefined) {
    if (!Array.isArray(b.adjuntos) || !b.adjuntos.every((x) => typeof x === 'string')) {
      return NextResponse.json({ estado: 'invalido', motivo: 'adjuntos tiene que ser una lista de ids' }, { status: 400 })
    }
    e.adjuntos = b.adjuntos as string[]
  }
  if (b.responderAntes !== undefined) {
    const r = leerResponderAntes(b.responderAntes)
    if (r === undefined) return NextResponse.json({ estado: 'invalido', motivo: 'responderAntes tiene que ser aaaa-mm-dd o null' }, { status: 400 })
    e.responderAntes = r
  }
  try {
    const c = await correduriaDeLaPeticion(b.correduriaId)
    if (!c.ok) return c.res
    return respuesta(await editarBorrador(puertosConsulta(actorDe(req)), c.id, id, e), (consulta) => ({ consulta }))
  } catch (err) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/consultas-companias/editar', err) }, { status: 500 })
  }
})
