// Presupuesto de HOGAR desde el Catastro: con la referencia catastral —o con
// la dirección— salen m², año de construcción y uso sin preguntarle nada al
// cliente. Es la fase 1 (presupuesto rápido) aplicada al ramo de hogar.
//
// Vive en plataforma y no en asegura porque NO es dato de la cartera: es un
// servicio público, gratis, y plataforma ya lo usaba para las subastas. El día
// que asegura cotice hogar en Codeoscopic usará el mismo `@central/core-catastro`.
//
// ─── Estados, y por qué son SEIS y no dos ───────────────────────────────────
//   ok            → referencia de 20 resuelta y datos del piso.
//   elegir        → la dirección da VARIOS pisos: elige una persona (nunca el
//                   código; misma regla que las versiones de vehículo).
//   ambigua       → el callejero devuelve varias vías y ninguna gana.
//   no_encontrado → el Catastro respondió y no hay nada con esos datos.
//   direccion_ilegible → no se pudo sacar sigla/calle/número del texto.
//   error         → el Catastro no respondió (red, corte). NO es «no existe».

import {
  paramsDnploc,
  precalificarHogar,
  type InmuebleCatastro,
  type PrecalificacionHogar,
} from '@central/core-catastro'
import { bajarCatastro, inmueblesPorDireccion } from '@central/core-catastro/http'

export type ConsultaHogar =
  | { por: 'referencia'; referencia: string }
  | { por: 'direccion'; direccion: string; municipio: string; provincia: string }

export type RespuestaHogar =
  | { estado: 'ok'; referencia: string; precalificacion: PrecalificacionHogar }
  | { estado: 'elegir'; via: string; inmuebles: InmuebleCatastro[] }
  | { estado: 'ambigua' }
  | { estado: 'no_encontrado' }
  | { estado: 'direccion_ilegible' }
  | { estado: 'error'; motivo: string }

const RE_REF20 = /^[0-9A-Z]{20}$/

export function normalizarReferencia(v: string): string {
  return v.replace(/[\s-]/g, '').toUpperCase()
}

export async function consultarHogar(c: ConsultaHogar): Promise<RespuestaHogar> {
  try {
    if (c.por === 'referencia') {
      const rc = normalizarReferencia(c.referencia)
      if (!RE_REF20.test(rc)) {
        // La de 14 devuelve el EDIFICIO, sin m² ni año: se pide la de 20.
        return { estado: 'error', motivo: 'La referencia catastral del piso tiene 20 caracteres (la de 14 es la del edificio).' }
      }
      const datos = await bajarCatastro(rc)
      if (datos === null) return { estado: 'no_encontrado' }
      return { estado: 'ok', referencia: rc, precalificacion: precalificarHogar(datos) }
    }

    const p = paramsDnploc(c.direccion)
    if (p === null) return { estado: 'direccion_ilegible' }
    const r = await inmueblesPorDireccion({
      ...p,
      provincia: c.provincia.trim().toUpperCase(),
      municipio: c.municipio.trim().toUpperCase(),
    })
    if (r === null) return { estado: 'ambigua' }
    if (r.inmuebles.length === 0) return { estado: 'no_encontrado' }
    if (r.inmuebles.length > 1) return { estado: 'elegir', via: r.via, inmuebles: r.inmuebles }
    const datos = await bajarCatastro(r.inmuebles[0].refCompleta)
    if (datos === null) return { estado: 'no_encontrado' }
    return { estado: 'ok', referencia: r.inmuebles[0].refCompleta, precalificacion: precalificarHogar(datos) }
  } catch (e) {
    return { estado: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }
}
