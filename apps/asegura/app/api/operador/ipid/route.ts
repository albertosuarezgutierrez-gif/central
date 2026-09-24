import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { listarIpid, retirarIpid, subirIpid } from '@/lib/ipid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Fichas IPID por compañía + producto.
 *
 *   GET    → { estado:'ok', ipid:[…] }
 *   POST   multipart { compania, producto, fichero, actor } → 201 { estado:'creado', id, sustituye } · 422 invalida
 *   DELETE ?id= → { estado:'hecho' } · 404 · 422
 */
async function correduria(): Promise<{ r: NextResponse } | { id: string }> {
  if (!aseguraConfigurada()) return { r: NextResponse.json({ estado: 'sin_configurar' }, { status: 503 }) }
  const c = await correduriaUnica()
  if (!c) return { r: NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 }) }
  return { id: c.id }
}

const texto = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '')

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    return NextResponse.json({ estado: 'ok', ipid: await listarIpid(c.id) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/ipid', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const form = await req.formData().catch(() => null)
    const fichero = form?.get('fichero')
    if (!form || !(fichero instanceof File)) return NextResponse.json({ estado: 'invalida', motivo: 'Falta el PDF.' }, { status: 422 })
    const actor = texto(form.get('actor')).trim() || 'corredor'
    const r = await subirIpid(c.id, {
      compania: texto(form.get('compania')), producto: texto(form.get('producto')),
      nombre: fichero.name, mime: fichero.type, contenido: Buffer.from(await fichero.arrayBuffer()),
    }, actor)
    return NextResponse.json(r, { status: r.estado === 'creado' ? 201 : 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/ipid', e) }, { status: 500 })
  }
})

export const DELETE = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const r = await retirarIpid(c.id, new URL(req.url).searchParams.get('id') ?? '')
    return NextResponse.json({ estado: r }, { status: r === 'hecho' ? 200 : r === 'no_encontrado' ? 404 : 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/ipid', e) }, { status: 500 })
  }
})
