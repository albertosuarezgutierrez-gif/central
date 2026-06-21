// ============================================================
// /api/cron/preavisos-auto — Disparo AUTOMÁTICO del preaviso de marcha (Fase 2)
//
// Cada pocos minutos: por cada restaurante con preaviso_activo=true y
// preaviso_auto_min>0, busca comandas que llevan en cocina más de ese umbral y
// que aún NO tienen preaviso, y dispara uno (emitido_por='auto'). El resto del
// flujo (Realtime a /edge + push + voz) es idéntico al disparo manual.
//
// Modelo v1: umbral de tiempo fijo por restaurante. Los preavisos manuales van
// registrando emitido_at vs comandas.created_at → base para aprender antelación
// por plato en una iteración futura.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { crearPreavisoParaComanda } from '@/lib/preaviso-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Estados de comanda que cuentan como "en cocina, aún sin servir".
const ESTADOS_EN_COCINA = ['nueva', 'en_cocina']

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerClient()
  const disparados: string[] = []

  try {
    // Restaurantes con el preaviso activo y un umbral automático configurado
    const { data: rests } = await supabase
      .from('restaurantes')
      .select('id, preaviso_auto_min')
      .eq('preaviso_activo', true)
      .gt('preaviso_auto_min', 0)

    for (const r of rests ?? []) {
      const umbralMin = Number(r.preaviso_auto_min)
      if (!umbralMin || umbralMin <= 0) continue
      const hace = new Date(Date.now() - umbralMin * 60_000).toISOString()

      // Comandas en cocina que superan el umbral
      const { data: comandas } = await supabase
        .from('comandas')
        .select('id')
        .eq('local_id', r.id)
        .eq('tipo', 'comanda')
        .in('estado', ESTADOS_EN_COCINA)
        .lte('created_at', hace)
        .limit(50)
      if (!comandas?.length) continue

      // Excluir las que ya tienen preaviso (cualquier estado): no re-disparar
      // ni pisar uno manual ya gestionado por el camarero.
      const ids = comandas.map(c => c.id)
      const { data: yaPreav } = await supabase
        .from('preavisos')
        .select('comanda_id')
        .eq('restaurante_id', r.id)
        .in('comanda_id', ids)
      const conPreaviso = new Set((yaPreav ?? []).map(p => p.comanda_id))

      for (const c of comandas) {
        if (conPreaviso.has(c.id)) continue
        const res = await crearPreavisoParaComanda({
          supabase,
          restauranteId: r.id,
          comandaId: c.id,
          emitidoPor: 'auto',
        })
        if (res.ok && !res.dedup) disparados.push(`${r.id}:${c.id}`)
      }
    }

    return NextResponse.json({ ok: true, disparados, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[CRON preavisos-auto] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
