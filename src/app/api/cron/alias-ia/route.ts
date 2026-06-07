export const dynamic = 'force-dynamic'

/**
 * /api/cron/alias-ia
 * Cron nocturno: detecta productos activos con alias_ia vacío y los genera con NIM.
 * Regla de negocio: NINGÚN producto activo puede tener alias_ia vacío.
 * Procesa máx 30 por ejecución (rate limit NIM). Se repite hasta completar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generarAliasFoneticos } from '@/lib/fuzzy-comanda'
import { invalidarCache } from '@/lib/brain-cache'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: productos, error } = await supabase
    .from('productos')
    .select('id, nombre, restaurante_id')
    .eq('activo', true)
    .or('alias_ia.is.null,alias_ia.eq.{}')
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!productos?.length) {
    return NextResponse.json({ ok: true, procesados: 0, mensaje: 'Todos los productos tienen alias_ia ✅' })
  }

  const restaurantesAfectados = new Set<string>()
  let generados = 0
  let fallidos = 0

  // Procesar en chunks de 5 para no saturar NIM
  for (let i = 0; i < productos.length; i += 5) {
    const chunk = productos.slice(i, i + 5)
    await Promise.allSettled(chunk.map(async (p) => {
      const alias = await generarAliasFoneticos(p.nombre)
      if (!alias.length) { fallidos++; return }
      const { error: upErr } = await supabase
        .from('productos')
        .update({ alias_ia: alias })
        .eq('id', p.id)
        .eq('local_id', p.restaurante_id)
      if (upErr) { fallidos++; return }
      restaurantesAfectados.add(p.restaurante_id)
      generados++
      console.log(`[ALIAS-IA] ${p.nombre}: [${alias.join(', ')}]`)
    }))
    if (i + 5 < productos.length) await new Promise(r => setTimeout(r, 1000))
  }

  for (const rid of restaurantesAfectados) invalidarCache(rid)

  const { count: pendientes } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)
    .or('alias_ia.is.null,alias_ia.eq.{}')

  return NextResponse.json({ ok: true, procesados: productos.length, generados, fallidos, pendientes_restantes: pendientes ?? 0 })
}
