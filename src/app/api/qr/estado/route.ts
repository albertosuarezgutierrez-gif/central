// /api/qr/estado — Estado de las comandas de una sesión QR (para el aviso en página).
// Público: el cliente sondea este endpoint mientras espera en la pantalla "En cocina".
// Validado por la sesión QR; solo devuelve comandas de la misma mesa/restaurante.
//
// GET ?sesion_id=...&comandas=id1,id2

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Estados que cuentan como "el cliente ya puede recoger / servir".
const ESTADOS_LISTO = ['lista', 'entregada', 'cerrada']

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const sp = req.nextUrl.searchParams
    const sesionId = sp.get('sesion_id')
    const comandasCsv = sp.get('comandas') || ''

    if (!sesionId) {
      return NextResponse.json({ error: 'sesion_id requerido' }, { status: 400 })
    }

    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, mesa_id, restaurante_id')
      .eq('id', sesionId)
      .maybeSingle()
    if (!sesion) return NextResponse.json({ error: 'Sesión no válida' }, { status: 403 })

    const ids = comandasCsv.split(',').map(s => s.trim()).filter(Boolean)
    let pedidos: { comanda_id: string; estado: string; numero_ticket: number | null }[] = []

    if (ids.length) {
      const { data } = await supabase
        .from('comandas')
        .select('id, estado, numero_ticket, mesa_id, restaurante_id')
        .in('id', ids)
        .eq('mesa_id', sesion.mesa_id)
        .eq('local_id', sesion.restaurante_id)
      pedidos = (data || []).map(c => ({
        comanda_id: c.id,
        estado: c.estado,
        numero_ticket: c.numero_ticket,
      }))
    }

    const alguna_lista = pedidos.some(p => ESTADOS_LISTO.includes(p.estado))
    return NextResponse.json({ ok: true, pedidos, alguna_lista })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
