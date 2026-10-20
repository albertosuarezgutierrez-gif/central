import { NextRequest, NextResponse } from 'next/server'
import { provinciaAlternativa } from '@central/core-direccion'
import { nombreCalleEscrito, sugerirVias, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { getEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// GET /api/admin/direccion/vias?provincia=&municipio=&q= → { vias: [{tipo, nombre}] } (≤10). Callejero real del Catastro;
// el navegador nunca lo llama. Caché en memoria acotada por provincia+municipio+palabra. Si el Catastro falla: 502 genérico
// y el formulario sigue aceptando la calle a mano.
const TTL_MS = 6 * 3600_000
const TTL_VACIO_MS = 60_000 // un vacío puede ser nombre de provincia equivocado o fallo pasajero: no se recuerda mucho
const MAX_ENTRADAS = 400
const cache = new Map<string, { hasta: number; vias: Array<{ tipo: string; nombre: string }> }>()

export async function GET(req: NextRequest) {
  if (!(await getEmpresaId())) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const provincia = (p.get('provincia') ?? '').trim().toUpperCase().slice(0, 60)
  const municipio = (p.get('municipio') ?? '').trim().toUpperCase().slice(0, 80)
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
      if (vias === null) return NextResponse.json({ vias: [], error: 'catastro_no_disponible' }, { status: 502 })
      if (vias.length === 0) {
        const alt = provinciaAlternativa(provincia)
        if (alt) vias = await listarViasPorTermino(alt.toUpperCase(), municipio, termino)
        if (vias === null) return NextResponse.json({ vias: [], error: 'catastro_no_disponible' }, { status: 502 })
      }
      hit = { hasta: Date.now() + (vias.length ? TTL_MS : TTL_VACIO_MS), vias }
      if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string)
      cache.set(clave, hit)
    } catch {
      return NextResponse.json({ vias: [], error: 'catastro_no_disponible' }, { status: 502 })
    }
  }
  return NextResponse.json({ vias: sugerirVias(hit.vias, q) })
}
