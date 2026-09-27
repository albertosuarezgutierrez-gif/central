// lib/sivra/catastro-pisos-logica.ts — qué se escribe en `properties.catastro_*` según lo que
// conteste el Catastro. PURO (solo tipos) → testeable con node --test.
//
// Regla del repo «dato que NO hay ≠ dato que NO se ha mirado»: los datos solo se escriben con
// `estado: 'ok'`. Cualquier otro desenlace deja m²/año/uso a NULL y dice POR QUÉ en `detalle`,
// y el job lo reintenta la semana siguiente.

import type { RespuestaHogar } from '../correduria-hogar.ts'

export type ConsultaPiso =
  | { por: 'referencia'; referencia: string }
  | { por: 'direccion'; direccion: string; municipio: string; provincia: string }

export type ResultadoPiso = {
  estado: 'ok' | 'elegir' | 'no_encontrado' | 'direccion_ilegible' | 'error'
  referencia: string | null
  m2: number | null
  anio: number | null
  uso: string | null
  direccion: string | null
  cp: string | null
  detalle: string | null
}

/** Con referencia manda la referencia; sin ella, la dirección «Calle X 24, 41003 Sevilla». */
export function consultaDePiso(p: { refCatastral: string | null; location: string | null }): ConsultaPiso | null {
  const ref = p.refCatastral?.replace(/\s+/g, '').toUpperCase()
  if (ref) return { por: 'referencia', referencia: ref }
  const loc = p.location?.trim()
  if (!loc) return null
  const [calle, resto] = loc.split(',').map(s => s.trim())
  const municipio = (resto ?? '').replace(/^\d{5}\s*/, '').trim()
  if (!calle || !municipio) return null
  // Los cuatro pisos están en Sevilla capital: municipio y provincia coinciden.
  return { por: 'direccion', direccion: calle, municipio, provincia: municipio }
}

const VACIO = { referencia: null, m2: null, anio: null, uso: null, direccion: null, cp: null }

export function resultadoDePiso(r: RespuestaHogar): ResultadoPiso {
  switch (r.estado) {
    case 'ok': {
      const d = r.precalificacion.datos
      return {
        estado: 'ok', referencia: r.referencia,
        m2: d.metrosCuadrados === null ? null : Math.round(d.metrosCuadrados),
        anio: d.anioConstruccion, uso: d.uso, direccion: d.direccion, cp: d.codigoPostal, detalle: null,
      }
    }
    case 'elegir':
      return { estado: 'elegir', ...VACIO, detalle: `${r.inmuebles.length} inmuebles en ${r.via}: falta la referencia catastral del piso` }
    case 'ambigua':
    case 'no_encontrado':
      return { estado: 'no_encontrado', ...VACIO, detalle: 'el Catastro no devolvió el inmueble (o rechazó la consulta)' }
    case 'direccion_ilegible':
      return { estado: 'direccion_ilegible', ...VACIO, detalle: 'no se ha podido leer calle y número de la dirección' }
    case 'error':
      return { estado: 'error', ...VACIO, detalle: r.motivo.slice(0, 300) }
  }
}
