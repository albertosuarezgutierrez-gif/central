import { NextResponse } from 'next/server'
import { MAX_BYTES_PANTALLA, nombrePantallaValido } from '@central/module-tarificacion'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { subirPantalla } from '@/lib/tarificador-grabaciones'
import { SIN_CORREDURIA, UUID, errorGrabaciones } from '@/lib/tarificador-grabaciones-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * `POST /api/operador/tarificador/grabaciones/[id]/pantallas?nombre=pantalla-….html` — cuerpo = el HTML que
 * descargó el bookmarklet (`text/html`, ≤ 4 MB: el límite de cuerpo de Vercel es 4,5 MB). Se RE-REDACTA aquí
 * antes de guardarlo y se pone al FINAL de la grabación (la numeración la lleva el servidor). Máx. 40.
 * El cuerpo puede ser el fichero MULTIPANTALLA del modo automático (`grabacion-….html`): se separa en pantallas
 * ordenadas y cada una se re-redacta aparte (todo o nada). Tope de la PETICIÓN: 4 MB (Vercel); la UI trocea lo mayor.
 * No es JSON a propósito: `auditado()` no copia el cuerpo (solo registra la escritura).
 */
export const POST = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const nombre = (new URL(req.url).searchParams.get('nombre') ?? '').trim()
  if (!nombrePantallaValido(nombre)) return NextResponse.json({ estado: 'error', mensaje: 'nombre de fichero no válido (tiene que ser .html)' }, { status: 400 })
  const declarado = Number(req.headers.get('content-length') ?? 0)
  if (declarado > MAX_BYTES_PANTALLA) return NextResponse.json({ estado: 'error', mensaje: 'el fichero pasa de 4 MB' }, { status: 413 })
  const html = await req.text().catch(() => '')
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES_PANTALLA) return NextResponse.json({ estado: 'error', mensaje: 'el fichero pasa de 4 MB' }, { status: 413 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const r = await subirPantalla(correduria.id, id, nombre, html)
    if (r.estado === 'no_encontrada') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'rechazada') return NextResponse.json(r, { status: 400 })
    return NextResponse.json(r, { status: 201 })
  } catch (e) {
    return errorGrabaciones('operador/tarificador/grabaciones/[id]/pantallas', e)
  }
})
