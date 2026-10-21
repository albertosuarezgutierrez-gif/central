import { NextRequest, NextResponse } from 'next/server'
import { nombreCalleEscrito, sugerirVias, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { provinciaAlternativa } from '@central/core-direccion'
import { crearCacheAcotada, dejaPasar, ipDe, provinciasParaCatastro } from '@/lib/direccion-cp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

// GET /api/direccion/vias?provincia=&municipio=&q= → { vias: [{tipo, nombre}] } (≤10). Autocompletado de calle con el callejero
// del Catastro. SIN login (tienda pública, pedido rápido): límite por IP + caché acotada por provincia|municipio|palabra
// (el Catastro corta si se le insiste). Si el Catastro falla se responde 200 `{ vias: [], disponible: false }` SIN detalle del
// error: el campo sigue siendo de texto libre y un pedido nunca se bloquea.
const LIMITE = new Map<string, { n: number; hasta: number }>()
const CACHE = crearCacheAcotada<Array<{ tipo: string; nombre: string }>>(400, 6 * 3600_000)
const CACHE_VACIO = crearCacheAcotada<Array<{ tipo: string; nombre: string }>>(400, 60_000) // un vacío puede ser pasajero: ≤60 s

export async function GET(req: NextRequest) {
  if (!dejaPasar(LIMITE, ipDe(req.headers.get('x-forwarded-for')), Date.now(), 40, 60_000)) {
    return NextResponse.json({ vias: [], disponible: false }, { status: 429 })
  }
  const p = req.nextUrl.searchParams
  const provincia = (p.get('provincia') ?? '').trim().toUpperCase().slice(0, 40)
  const municipio = (p.get('municipio') ?? '').trim().toUpperCase().slice(0, 80)
  const q = (p.get('q') ?? '').slice(0, 80)
  if (!provincia || !municipio) return NextResponse.json({ vias: [] })
  const nombre = nombreCalleEscrito(q)
  if (nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2) return NextResponse.json({ vias: [] })

  const termino = terminoBusquedaVia(nombre)
  const clave = `${provincia}|${municipio}|${termino}`
  let vias = CACHE.get(clave) ?? CACHE_VACIO.get(clave)
  if (!vias) {
    try {
      let res: Array<{ tipo: string; nombre: string }> = []
      // Con el nombre co-oficial (Bizkaia…) el callejero puede no hallar nada: se reintenta con el clásico (Vizcaya…).
      for (const prov of provinciasParaCatastro(provincia, provinciaAlternativa)) {
        const r = await listarViasPorTermino(prov, municipio, termino)
        if (r === null) return NextResponse.json({ vias: [], disponible: false }) // cola de sugerencias llena: no se cachea
        res = r
        if (res.length > 0) break
      }
      vias = res
      ;(vias.length > 0 ? CACHE : CACHE_VACIO).set(clave, vias)
    } catch {
      return NextResponse.json({ vias: [], disponible: false })
    }
  }
  return NextResponse.json({ vias: sugerirVias(vias, q), disponible: true })
}
