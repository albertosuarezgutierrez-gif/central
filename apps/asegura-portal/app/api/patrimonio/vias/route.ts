import { NextResponse } from 'next/server'

import { nombreCalleEscrito, sugerirVias, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { provinciaAlternativa } from '@central/core-direccion'

import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * `GET /api/patrimonio/vias?provincia=&municipio=&q=` → `{ vias: [{ tipo, nombre }] }` (≤10). Autocompletado de la
 * calle con el callejero REAL del Catastro; es una ayuda, nunca bloquea escribir. Porta
 * `apps/plataforma/app/api/correduria/catastro/vias`. Exige sesión y tope por identidad (el Catastro corta si se le
 * insiste); caché en memoria por provincia+municipio+palabra. Fallo → 502/503 con `vias: []`: NO es «no existe».
 */
const TTL_MS = 6 * 3600_000
const TTL_FALLO_MS = 60_000
const MAX_ENTRADAS = 400
const cache = new Map<string, { hasta: number; vias: Array<{ tipo: string; nombre: string }> | null }>()

export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ vias: [], error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-vias:${identidad.id}`, 120, 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ vias: [], error: 'demasiadas_peticiones' }, { status: 429 })

  const p = new URL(req.url).searchParams
  const provincia = (p.get('provincia') ?? '').trim().toUpperCase()
  const municipio = (p.get('municipio') ?? '').trim().toUpperCase()
  const q = (p.get('q') ?? '').slice(0, 80)
  // CP primero: sin provincia y municipio (que salen del CP) no hay callejero que consultar.
  if (!provincia || !municipio) return NextResponse.json({ vias: [] })
  const nombre = nombreCalleEscrito(q)
  if (nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2) return NextResponse.json({ vias: [] })

  const termino = terminoBusquedaVia(nombre)
  const clave = `${provincia}|${municipio}|${termino}`
  let hit = cache.get(clave)
  if (!hit || hit.hasta < Date.now()) {
    try {
      let vias = await listarViasPorTermino(provincia, municipio, termino)
      if (vias === null) return NextResponse.json({ vias: [], error: 'callejero_no_disponible' }, { status: 503 })
      if (vias.length === 0) {
        const alt = provinciaAlternativa(p.get('provincia') ?? '')
        if (alt) vias = (await listarViasPorTermino(alt.trim().toUpperCase(), municipio, termino)) ?? vias
      }
      hit = { hasta: Date.now() + (vias.length ? TTL_MS : TTL_FALLO_MS), vias }
    } catch (e) {
      // Se loguea el motivo, nunca la dirección (dato personal).
      console.error('[patrimonio/vias]', e instanceof Error ? e.name : 'fallo')
      hit = { hasta: Date.now() + TTL_FALLO_MS, vias: null }
    }
    if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string)
    cache.set(clave, hit)
  }
  if (hit.vias === null) return NextResponse.json({ vias: [], error: 'callejero_no_disponible' }, { status: 502 })
  return NextResponse.json({ vias: sugerirVias(hit.vias, q) })
}
