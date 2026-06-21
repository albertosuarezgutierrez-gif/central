export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { listarCambios } from '@/lib/seo/store'

export async function GET(req: NextRequest) {
  const s = getSession(req)
  if (!s || s.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ cambios: await listarCambios(50) })
}

export async function POST(req: NextRequest) {
  const s = getSession(req)
  if (!s || s.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  const sb = createServerClient()
  const { data: cambio } = await sb.from('seo_cambios').select('*').eq('id', id).single()
  if (!cambio) return NextResponse.json({ error: 'Cambio no encontrado' }, { status: 404 })

  // Revertir: para metadata/schema restaurar valor_antes en seo_overrides (o desactivar si no había);
  // para content_block desactivar el bloque; para articulo desactivar el artículo.
  if (cambio.tipo === 'metadata' || cambio.tipo === 'schema') {
    if (cambio.valor_antes) {
      await sb.from('seo_overrides').upsert({ ...cambio.valor_antes, updated_at: new Date().toISOString() }, { onConflict: 'ruta' })
    } else {
      await sb.from('seo_overrides').update({ activo: false }).eq('ruta', cambio.ruta)
    }
  } else if (cambio.tipo === 'content_block') {
    await sb.from('seo_content_blocks').update({ activo: false }).eq('ruta', cambio.ruta)
  } else if (cambio.tipo === 'articulo') {
    const slug = cambio.ruta.replace('/blog/', '')
    await sb.from('seo_articulos').update({ activo: false }).eq('slug', slug)
  }
  return NextResponse.json({ ok: true })
}
