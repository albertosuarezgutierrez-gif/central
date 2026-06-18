export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 45

/**
 * POST /api/cocina/menu-sugerido — la IA propone un menú eligiendo del catálogo de recetas del local.
 * Body: { descripcion, pax?, restricciones? }
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const descripcion = String(body.descripcion ?? '').trim()
  if (!descripcion) return NextResponse.json({ error: 'Describe el evento (ej: boda 150 pax sin gluten)' }, { status: 400 })
  const pax = Number(body.pax) || null
  const restricciones = String(body.restricciones ?? '').trim()

  const { data: recetas } = await supabase
    .from('cocina_recetas').select('id, nombre, partida').eq('local_id', rid).order('partida')
  const catalogo = (recetas ?? [])
  if (catalogo.length === 0) return NextResponse.json({ error: 'No hay recetas en el catálogo todavía' }, { status: 400 })

  const lista = catalogo.map(r => `- [${r.id}] ${r.nombre} (partida: ${r.partida ?? '—'})`).join('\n')
  const system = `Eres un chef de catering español experto en componer menús de evento.
Te doy el CATÁLOGO de elaboraciones disponibles del cliente (con su id). Debes proponer un menú coherente
para el evento descrito, eligiendo ÚNICAMENTE elaboraciones del catálogo (usa sus id exactos).
Equilibra entrantes/principales/postres y respeta restricciones dietéticas si las hay.
Responde SOLO JSON válido, sin markdown:
{
  "menu": [ { "receta_id": "<id del catálogo>", "nombre": "<nombre>", "momento": "entrante|principal|postre|aperitivo" } ],
  "notas": "1-2 frases con el criterio (o avisos si faltan platos para alguna restricción)"
}
- No inventes elaboraciones que no estén en el catálogo.
- Si una restricción no se puede cubrir con el catálogo, dilo en notas.`

  const userMsg = `CATÁLOGO:\n${lista}\n\nEVENTO: ${descripcion}${pax ? ` · ${pax} pax` : ''}${restricciones ? `\nRESTRICCIONES: ${restricciones}` : ''}\n\nPropón el menú.`

  try {
    const raw = await callAI(system, userMsg, 900, 30_000)
    const parsed = JSON.parse(cleanJSON(raw))
    const validIds = new Set(catalogo.map(r => r.id))
    const menu = (Array.isArray(parsed.menu) ? parsed.menu : [])
      .filter((m: { receta_id?: string }) => m?.receta_id && validIds.has(m.receta_id))
      .map((m: Record<string, unknown>) => {
        const r = catalogo.find(c => c.id === m.receta_id)!
        return { receta_id: m.receta_id, nombre: r.nombre, momento: String(m.momento ?? '') }
      })
    return NextResponse.json({ ok: true, menu, notas: parsed.notas ?? '' })
  } catch (e) {
    console.error('[cocina/menu-sugerido]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'No se pudo sugerir el menú. Inténtalo de nuevo.' }, { status: 500 })
  }
}
