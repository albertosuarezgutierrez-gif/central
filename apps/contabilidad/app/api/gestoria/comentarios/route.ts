import { NextResponse } from 'next/server'
import { validarComentario } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { conF6, ejecutarF6 } from '@/lib/f6-carga'
import { anotarComentario } from '@/lib/gestoria'
import { respuestaDeErrorBdFase } from '@/lib/errores-bd'

// GET  /api/gestoria/comentarios?asientoId=|facturaId=|documentoRef=  → hilo del objeto (solo de la empresa de la sesión)
// POST /api/gestoria/comentarios { asientoId | facturaId | documentoRef, texto }  → añade (el autor y su rol salen de la sesión, nunca del cuerpo)
// Esquema 0006 sin aplicar → 503. Los comentarios solo se añaden.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const q = Object.fromEntries(new URL(req.url).searchParams.entries())
  const v = validarComentario({ ...q, texto: 'x' })
  if (!v.ok) return NextResponse.json({ error: 'datos_no_validos', errores: v.errores.filter((e) => e !== 'el comentario está vacío') }, { status: 400 })
  try {
    const hilo = await conF6(c.empresaId, (_r, f6) => f6.comentarios(v.valor.objeto, 200))
    return NextResponse.json({ comentarios: hilo })
  } catch (e) {
    const { status, body } = respuestaDeErrorBdFase(e, '0006_gestoria.sql')
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  try {
    const r = await ejecutarF6(c.empresaId, (_repo, f6) => anotarComentario(f6, { usuarioId: c.usuarioId, rol: c.rol }, b))
    return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'comentario_no_valido', errores: r.errores }, { status: 422 })
  } catch (e) {
    const { status, body } = respuestaDeErrorBdFase(e, '0006_gestoria.sql')
    return NextResponse.json(body, { status })
  }
}
