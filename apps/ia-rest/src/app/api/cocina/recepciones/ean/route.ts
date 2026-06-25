export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { nombrePorEan } from '@/lib/recepcion-ean'

/** GET /api/cocina/recepciones/ean?code=8480000180186 — resuelve un EAN a producto:
 *  1) catálogo propio (lo recibido antes en este local) → 2) Open Food Facts → 3) desconocido. */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const code = (req.nextUrl.searchParams.get('code') || '').replace(/\D/g, '')
  if (!/^\d{8,14}$/.test(code)) return NextResponse.json({ error: 'EAN inválido' }, { status: 400 })

  const supabase = createServerClient()

  // 1) Catálogo propio: ¿hemos recibido antes este EAN en este local?
  const { data: previo } = await supabase
    .from('cocina_recepciones')
    .select('producto, proveedor')
    .eq('local_id', rid).eq('codigo_barras', code)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (previo?.producto) {
    return NextResponse.json({ ok: true, codigo_barras: code, producto: previo.producto, proveedor: previo.proveedor ?? null, fuente: 'catalogo' })
  }

  // 2) Open Food Facts
  const nombre = await nombrePorEan(code)
  if (nombre) return NextResponse.json({ ok: true, codigo_barras: code, producto: nombre, proveedor: null, fuente: 'openfoodfacts' })

  // 3) Desconocido — el cliente rellenará el nombre y se recordará al registrar
  return NextResponse.json({ ok: true, codigo_barras: code, producto: '', proveedor: null, fuente: 'desconocido' })
}
