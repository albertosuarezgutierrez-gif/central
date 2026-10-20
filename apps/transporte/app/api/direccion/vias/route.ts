import { NextRequest, NextResponse } from 'next/server'
import { nombreCalleEscrito, provinciaAlternativa, sugerirVias } from '@central/core-direccion'
import { terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// GET /api/direccion/vias?provincia=&municipio=&q= → { vias: [{tipo, nombre}] } (≤10) con el callejero REAL del Catastro.
// El navegador nunca llama al Catastro; caché acotada en memoria. Si el Catastro falla: 502 genérico y el campo sigue siendo de texto.
const TTL_MS = 6 * 3600_000
const TTL_VACIO_MS = 60_000 // un vacío no se cachea más de 60 s
const MAX_ENTRADAS = 400
const cache = new Map<string, { hasta: number; vias: Array<{ tipo: string; nombre: string }> }>()

export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
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
      if (vias === null) return NextResponse.json({ vias: [], error: 'catastro no disponible' }, { status: 502 })
      if (vias.length === 0) {
        // El nombre co-oficial moderno (Bizkaia…) a veces no lo conoce el callejero: se reintenta con el clásico.
        const alt = provinciaAlternativa(provincia)
        if (alt) vias = await listarViasPorTermino(alt.toUpperCase(), municipio, termino)
        if (vias === null) return NextResponse.json({ vias: [], error: 'catastro no disponible' }, { status: 502 })
      }
      hit = { hasta: Date.now() + (vias.length === 0 ? TTL_VACIO_MS : TTL_MS), vias }
      if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string)
      cache.set(clave, hit)
    } catch {
      return NextResponse.json({ vias: [], error: 'catastro no disponible' }, { status: 502 })
    }
  }
  return NextResponse.json({ vias: sugerirVias(hit.vias, q) })
}
