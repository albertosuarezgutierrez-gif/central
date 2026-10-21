import { NextRequest, NextResponse } from 'next/server'
import { nombreCalleEscrito, sugerirVias, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { provinciaAlternativa } from '@central/core-direccion'
import { exigirCorreduria } from '@/lib/correduria-acceso'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// GET /api/correduria/catastro/vias?provincia=&municipio=&q= → { vias: [{tipo, nombre}] } (≤10, ya filtradas y ordenadas).
// Autocompletado de calle con el callejero REAL del Catastro; el navegador nunca lo llama. Caché en memoria por
// provincia+municipio+palabra (el callejero casi no cambia): el Catastro corta si se le insiste, así que el tecleo no le llega.
// Si el Catastro falla: 502 `{ vias: [], error }` y el buscador sigue siendo de texto libre.
const TTL_MS = 6 * 3600_000
const MAX_ENTRADAS = 400
const TTL_FALLO_MS = 60_000
const cache = new Map<string, { hasta: number; vias: Array<{ tipo: string; nombre: string }> | null }>()

export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const p = req.nextUrl.searchParams
  const provincia = (p.get('provincia') ?? '').trim().toUpperCase()
  const municipio = (p.get('municipio') ?? '').trim().toUpperCase()
  const q = (p.get('q') ?? '').slice(0, 80)
  if (!provincia || !municipio) return NextResponse.json({ vias: [] })
  const nombre = nombreCalleEscrito(q)
  if (nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2) return NextResponse.json({ vias: [] })

  const termino = terminoBusquedaVia(nombre)
  const clave = `${provincia}|${municipio}|${termino}`
  let hit = cache.get(clave)
  if (!hit || hit.hasta < Date.now()) {
    try {
      let vias = await listarViasPorTermino(provincia, municipio, termino)
      // Saturado: no disponible ahora, y no se cachea (no es un fallo del Catastro).
      if (vias === null) return NextResponse.json({ vias: [], error: 'callejero no disponible' }, { status: 503 })
      // Vacío con el nombre co-oficial de la provincia («Illes Balears», «A Coruña»…): se reintenta con el que el Catastro usa.
      if (vias.length === 0) {
        const alt = provinciaAlternativa(p.get('provincia') ?? '')
        if (alt) vias = (await listarViasPorTermino(alt.trim().toUpperCase(), municipio, termino)) ?? vias
      }
      // Un vacío puede ser nombre de provincia que el Catastro no reconoce: no se recuerda más de 1 min.
      hit = { hasta: Date.now() + (vias.length ? TTL_MS : TTL_FALLO_MS), vias }
    } catch (e) {
      // Un fallo se recuerda 1 min: el tecleo no vuelve a llamar a un Catastro que acaba de cortar.
      console.error('[catastro/vias]', e instanceof Error ? e.message : 'fallo')
      hit = { hasta: Date.now() + TTL_FALLO_MS, vias: null }
    }
    if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string)
    cache.set(clave, hit)
  }
  if (hit.vias === null) return NextResponse.json({ vias: [], error: 'callejero no disponible' }, { status: 502 })
  return NextResponse.json({ vias: sugerirVias(hit.vias, q) })
}
