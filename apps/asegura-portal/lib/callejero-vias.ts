// Autocompletado de la CALLE con el callejero real del Catastro, compartido por `/api/patrimonio/vias` (con sesión) y
// `/api/datos/vias` (enlace de datos, por token). Cada ruta pone su propia guarda y su tope; aquí solo la consulta y
// la caché en memoria por provincia+municipio+palabra. Fallo → 502/503 con `vias: []`: NO es «no existe».
// Se loguea el motivo, nunca la dirección (dato personal).
import { nombreCalleEscrito, sugerirVias, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { provinciaAlternativa } from '@central/core-direccion'

const TTL_MS = 6 * 3600_000
const TTL_FALLO_MS = 60_000
const MAX_ENTRADAS = 400
const cache = new Map<string, { hasta: number; vias: Array<{ tipo: string; nombre: string }> | null }>()

export type RespuestaVias = { status: number; cuerpo: { vias: Array<{ tipo: string; nombre: string }>; error?: string } }

export async function buscarViasCallejero(provinciaEscrita: string, municipioEscrito: string, qEscrita: string, etiquetaLog: string): Promise<RespuestaVias> {
  const provincia = provinciaEscrita.trim().toUpperCase()
  const municipio = municipioEscrito.trim().toUpperCase()
  const q = qEscrita.slice(0, 80)
  // CP primero: sin provincia y municipio (que salen del CP) no hay callejero que consultar.
  if (!provincia || !municipio) return { status: 200, cuerpo: { vias: [] } }
  const nombre = nombreCalleEscrito(q)
  if (nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2) return { status: 200, cuerpo: { vias: [] } }

  const termino = terminoBusquedaVia(nombre)
  const clave = `${provincia}|${municipio}|${termino}`
  let hit = cache.get(clave)
  if (!hit || hit.hasta < Date.now()) {
    try {
      let vias = await listarViasPorTermino(provincia, municipio, termino)
      if (vias === null) return { status: 503, cuerpo: { vias: [], error: 'callejero_no_disponible' } }
      if (vias.length === 0) {
        const alt = provinciaAlternativa(provinciaEscrita)
        if (alt) vias = (await listarViasPorTermino(alt.trim().toUpperCase(), municipio, termino)) ?? vias
      }
      hit = { hasta: Date.now() + (vias.length ? TTL_MS : TTL_FALLO_MS), vias }
    } catch (e) {
      console.error(`[${etiquetaLog}]`, e instanceof Error ? e.name : 'fallo')
      hit = { hasta: Date.now() + TTL_FALLO_MS, vias: null }
    }
    if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string)
    cache.set(clave, hit)
  }
  if (hit.vias === null) return { status: 502, cuerpo: { vias: [], error: 'callejero_no_disponible' } }
  return { status: 200, cuerpo: { vias: sugerirVias(hit.vias, q) } }
}
