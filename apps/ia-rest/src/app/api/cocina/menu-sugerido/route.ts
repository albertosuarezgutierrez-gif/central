export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 45

/**
 * POST /api/cocina/menu-sugerido — la IA propone un menú eligiendo del catálogo de recetas del local.
 * Las dietas son de COMENSALES PUNTUALES: el menú principal es para TODOS los PAX, y para cada
 * dieta declarada la IA propone qué recetas del catálogo son la versión adaptada (no cambia el menú).
 * Body: { descripcion, pax?, dietas?: [{ dieta, comensales }] }
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const descripcion = String(body.descripcion ?? '').trim()
  if (!descripcion) return NextResponse.json({ error: 'Describe el evento (ej: boda 150 pax)' }, { status: 400 })
  const pax = Number(body.pax) || null
  // Grupos de dieta de comensales puntuales (no filtran el menú principal).
  const dietas: Array<{ dieta: string; comensales: number }> = (Array.isArray(body.dietas) ? body.dietas : [])
    .map((d: { dieta?: string; comensales?: number | string }) => ({ dieta: String(d?.dieta ?? '').trim(), comensales: Number(d?.comensales) || 0 }))
    .filter((d: { dieta: string }) => d.dieta)

  const { data: recetas } = await supabase
    .from('cocina_recetas').select('id, nombre, partida').eq('local_id', rid).order('partida')
  const catalogo = (recetas ?? [])
  if (catalogo.length === 0) return NextResponse.json({ error: 'No hay recetas en el catálogo todavía' }, { status: 400 })

  const lista = catalogo.map(r => `- [${r.id}] ${r.nombre} (partida: ${r.partida ?? '—'})`).join('\n')
  const dietasTxt = dietas.length
    ? dietas.map(d => `- ${d.dieta}${d.comensales ? ` (${d.comensales} comensales)` : ''}`).join('\n')
    : '(ninguna)'

  const system = `Eres un chef de catering español experto en componer menús de evento.
Te doy el CATÁLOGO de elaboraciones disponibles del cliente (con su id). Propón un menú coherente
para el evento, eligiendo ÚNICAMENTE elaboraciones del catálogo (usa sus id exactos).
IMPORTANTE sobre las DIETAS: son de COMENSALES PUNTUALES (p. ej. 5 sin gluten). NO cambies el menú
principal por ellas. El "menu" es para TODOS los comensales. Para CADA dieta declarada, propón en
"alternativas" qué recetas del catálogo son la VERSIÓN ADAPTADA de los platos (entrante/principal/postre).
Si para una dieta NO hay una versión adecuada en el catálogo, NO la inventes: dilo en "notas"
(p. ej. "falta un postre sin gluten: dar de alta la receta").
Responde SOLO JSON válido, sin markdown:
{
  "menu": [ { "receta_id": "<id>", "nombre": "<nombre>", "momento": "entrante|principal|postre|aperitivo" } ],
  "alternativas": [ { "dieta": "<etiqueta>", "platos": [ { "receta_id": "<id>", "momento": "..." } ] } ],
  "notas": "1-2 frases (avisos si falta alguna versión adaptada)"
}
- No inventes elaboraciones fuera del catálogo. Equilibra entrantes/principales/postres en el menú principal.`

  const userMsg = `CATÁLOGO:\n${lista}\n\nEVENTO: ${descripcion}${pax ? ` · ${pax} pax` : ''}\nDIETAS (comensales puntuales):\n${dietasTxt}\n\nPropón el menú principal y, para cada dieta, sus platos adaptados del catálogo.`

  try {
    const raw = await callAI(system, userMsg, 1100, 30_000)
    const parsed = JSON.parse(cleanJSON(raw))
    const porId = new Map(catalogo.map(r => [r.id, r]))
    const menu = (Array.isArray(parsed.menu) ? parsed.menu : [])
      .filter((m: { receta_id?: string }) => m?.receta_id && porId.has(m.receta_id))
      .map((m: Record<string, unknown>) => {
        const r = porId.get(m.receta_id as string)!
        return { receta_id: m.receta_id, nombre: r.nombre, momento: String(m.momento ?? '') }
      })
    const dietaPorComensales = new Map(dietas.map(d => [d.dieta.toLowerCase(), d.comensales]))
    const alternativas = (Array.isArray(parsed.alternativas) ? parsed.alternativas : [])
      .map((alt: { dieta?: string; platos?: Array<{ receta_id?: string; momento?: string }> }) => {
        const dieta = String(alt?.dieta ?? '').trim()
        const platos = (Array.isArray(alt?.platos) ? alt.platos : [])
          .filter(p => p?.receta_id && porId.has(p.receta_id))
          .map(p => ({ receta_id: p.receta_id!, nombre: porId.get(p.receta_id!)!.nombre, momento: String(p.momento ?? '') }))
        return { dieta, comensales: dietaPorComensales.get(dieta.toLowerCase()) ?? 0, platos }
      })
      .filter((a: { dieta: string }) => a.dieta)
    return NextResponse.json({ ok: true, menu, alternativas, notas: parsed.notas ?? '' })
  } catch (e) {
    console.error('[cocina/menu-sugerido]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'No se pudo sugerir el menú. Inténtalo de nuevo.' }, { status: 500 })
  }
}
