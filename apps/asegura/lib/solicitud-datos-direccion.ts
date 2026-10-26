/**
 * Lo que el SERVIDOR comprueba de una dirección del enlace de datos (revisión del PR #5057, 26/10/2026):
 *   - `zonaCpServidor`: provincia(s) y municipios oficiales del CP (`@central/core-direccion`, la misma tabla que la
 *     ruta `/api/datos/codigo-postal` del portal). `validarRespuestas` rechaza una provincia o un municipio que no casen.
 *   - `viasValidadas`: la calle «oficial» que manda el navegador solo vale si el callejero del Catastro la tiene en ese
 *     municipio. Tope de tiempo corto (el portal espera 8 s al puente): sin respuesta, la calle queda «por validar».
 * Ni la dirección ni la calle van a ningún log.
 */
import { nombreCalleEscrito, terminoBusquedaVia } from '@central/core-catastro'
import { listarViasPorTermino } from '@central/core-catastro/http'
import { provinciaAlternativa, provinciaPorCp } from '@central/core-direccion'
import { municipiosPorCp } from '@central/core-direccion/servidor'
import { claveDireccion, type CampoSolicitud, type ViaValidada, type ZonaCp } from '@central/module-seguros'

const TOPE_VIAS_MS = 3_500

export function zonaCpServidor(cp: string): ZonaCp {
  const p = provinciaPorCp(cp)
  const alt = p ? provinciaAlternativa(p) : null
  return { provincias: p ? [p, ...(alt ? [alt] : [])] : null, municipios: municipiosPorCp(cp) }
}

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export type ListarVias = (provincia: string, municipio: string, termino: string) => Promise<Array<{ tipo: string; nombre: string }> | null>

/** ¿Está esa calle (tipo + nombre) en el callejero de ese municipio? `null` = no se sabe / no está. Nunca lanza. */
export async function viaEnCallejero(
  v: { provincia: string; municipio: string; tipo: string; nombre: string },
  listar: ListarVias = listarViasPorTermino,
): Promise<ViaValidada> {
  const termino = terminoBusquedaVia(nombreCalleEscrito(v.nombre))
  if (termino.replace(/[^A-ZÑ0-9]/gi, '').length < 2) return null
  for (const prov of [v.provincia, provinciaAlternativa(v.provincia)].filter((x): x is string => !!x)) {
    const vias = await listar(prov.toUpperCase(), v.municipio.toUpperCase(), termino).catch(() => null)
    const hit = vias?.find((x) => plano(x.tipo) === plano(v.tipo) && plano(x.nombre) === plano(v.nombre))
    if (hit) return { tipo: hit.tipo, nombre: hit.nombre }
    if (vias && vias.length > 0) return null
  }
  return null
}

/** Calles validadas por campo `direccion`. Con el tope agotado, las que falten quedan sin validar («por validar»). */
export async function viasValidadas(campos: readonly CampoSolicitud[], entrada: Record<string, unknown>, listar?: ListarVias, topeMs = TOPE_VIAS_MS): Promise<Map<string, ViaValidada>> {
  const out = new Map<string, ViaValidada>()
  const trabajos = campos.filter((c) => c.tipo === 'direccion').map(async (c) => {
    const k = (s: Parameters<typeof claveDireccion>[1]) => txt(entrada[claveDireccion(c.clave, s)])
    const [provincia, municipio, tipo, nombre] = [k('Provincia'), k('Municipio'), k('ViaTipo'), k('ViaNombre')]
    if (!provincia || !municipio || !tipo || !nombre) return
    out.set(c.clave, await viaEnCallejero({ provincia, municipio, tipo, nombre }, listar))
  })
  let reloj: ReturnType<typeof setTimeout> | undefined
  await Promise.race([Promise.all(trabajos), new Promise((r) => { reloj = setTimeout(r, topeMs) })])
  clearTimeout(reloj)
  return new Map(out)
}
