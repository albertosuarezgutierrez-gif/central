// lib/sivra/facturas/vias-catastro.ts — autocompletado de calle con el callejero del Catastro para el formulario
// público de factura (SERVIDOR). Misma lógica que /api/correduria/catastro/vias (que se deja tal cual: no se toca la
// correduría en este cambio). Caché en memoria por provincia+municipio+término: el Catastro corta si se le insiste.
// Si el Catastro falla, `vias: []` con error y el formulario sigue siendo de texto libre.
import { nombreCalleEscrito, sugerirVias, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { provinciaAlternativa } from '@central/core-direccion'

type Via = { tipo: string; nombre: string }
const TTL_MS = 6 * 3600_000
const TTL_FALLO_MS = 60_000
const MAX_ENTRADAS = 400
const cache = new Map<string, { hasta: number; vias: Via[] | null }>()

export async function buscarViasCatastro(provinciaRaw: string, municipioRaw: string, qRaw: string): Promise<{ vias: Via[]; status: number; error?: string }> {
  const provincia = provinciaRaw.trim().toUpperCase().slice(0, 60)
  const municipio = municipioRaw.trim().toUpperCase().slice(0, 80)
  const q = qRaw.slice(0, 80)
  if (!provincia || !municipio) return { vias: [], status: 200 }
  const nombre = nombreCalleEscrito(q)
  if (nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2) return { vias: [], status: 200 }
  const termino = terminoBusquedaVia(nombre)
  const clave = `${provincia}|${municipio}|${termino}`
  let hit = cache.get(clave)
  if (!hit || hit.hasta < Date.now()) {
    try {
      let vias = await listarViasPorTermino(provincia, municipio, termino)
      if (vias === null) return { vias: [], status: 503, error: 'callejero no disponible' }
      if (vias.length === 0) {
        const alt = provinciaAlternativa(provinciaRaw)
        if (alt) vias = (await listarViasPorTermino(alt.trim().toUpperCase(), municipio, termino)) ?? vias
      }
      hit = { hasta: Date.now() + (vias.length ? TTL_MS : TTL_FALLO_MS), vias }
    } catch (e) {
      console.error('[factura/vias]', e instanceof Error ? e.message : 'fallo')
      hit = { hasta: Date.now() + TTL_FALLO_MS, vias: null }
    }
    if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string)
    cache.set(clave, hit)
  }
  if (hit.vias === null) return { vias: [], status: 502, error: 'callejero no disponible' }
  return { vias: sugerirVias(hit.vias, q), status: 200 }
}
