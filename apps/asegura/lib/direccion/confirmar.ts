// Confirmador GENÉRICO de una dirección escrita a mano, para el alta y la
// edición de clientes en plataforma. NO es el de `codeoscopic/tipo-via-catastro.ts`
// (ese resuelve el `roadType` de una ficha YA guardada, para el vendor): este
// vive antes, en el propio formulario — el corredor teclea "c/ severo hocoa
// 12" y esto le devuelve lo que el callejero oficial del Catastro CONFIRMA,
// para que elija con un clic en vez de escribir a ciegas.
//
// Gratis (mismo servicio libre que ya usa el resto de la app) y CONSERVADOR:
// nunca se afirma una dirección que el Catastro no ha confirmado. Con
// provincia+municipio no se pregunta al callejero por texto libre sin acotar
// —«Sierpes» sin municipio devolvería sierpes de toda España—, así que sin
// los dos no hay confirmación por Catastro y se declara `sin_lugar`.
import { resolverNombreVia, resolverTipoViaPorNombre } from '@central/core-catastro/http'
import { provinciaAlternativa } from './provincia.ts'
import { partirDireccion, siglaCanonica, siglaDeTipoVia, emparejarNombreVia } from '../codeoscopic/direccion.ts'
import type { Opcion } from '../codeoscopic/catalogos.ts'

export type CandidatoDireccion = {
  /** El texto que se enseña y, si el corredor lo acepta, sustituye al tecleado. */
  texto: string
  /** El tipo de vía, ya emparejado contra el catálogo del vendor si se pasó uno. */
  tipoVia: Opcion | null
}

export type ResultadoConfirmacion =
  | { estado: 'candidato'; candidato: CandidatoDireccion }
  /** No hay provincia+municipio con los que acotar la pregunta al callejero. */
  | { estado: 'sin_lugar' }
  /** La dirección no tiene ni un nombre de calle que preguntar. */
  | { estado: 'sin_calle' }
  /** El callejero tiene varias calles con ese nombre y ninguna gana: no se adivina. */
  | { estado: 'ambigua' }
  /** El callejero no conoce esa calle en ese municipio. */
  | { estado: 'no_encontrada' }
  /** Fallo de red o del servicio: no se sabe, no se afirma nada. */
  | { estado: 'error' }

/**
 * @param direccion  Texto tal como lo ha tecleado el corredor (puede traer o
 *   no el tipo de vía delante: "Severo Ochoa 12" o "Calle Severo Ochoa 12").
 * @param provincia  Ya resuelta por el caller (p. ej. `provinciaPorCp()`), o
 *   `null` si no hay CP con el que derivarla.
 * @param municipio  Texto libre del formulario ("Sevilla"), o `null`.
 * @param catalogoTipoVia  El catálogo `/road-types` del vendor, si hace falta
 *   emparejar el tipo con un id de Codeoscopic; `null` si solo se quiere
 *   confirmar el NOMBRE de la calle (entonces `tipoVia` sale `null` siempre).
 */
export async function confirmarDireccion(
  direccion: string | null,
  provincia: string | null,
  municipio: string | null,
  catalogoTipoVia: ReadonlyArray<Opcion> | null = null,
): Promise<ResultadoConfirmacion> {
  if (provincia === null || municipio === null) return { estado: 'sin_lugar' }

  const partida = partirDireccion(direccion)
  if (partida.nombre === null) return { estado: 'sin_calle' }

  try {
    if (partida.tipoVia !== null) {
      // Ya trae tipo de vía: se confirma/corrige el NOMBRE contra el
      // callejero, conservando el tipo que escribió el corredor.
      const sigla = siglaDeTipoVia(partida.tipoVia)
      if (sigla === null) return { estado: 'no_encontrada' }
      let r = await resolverNombreVia(provincia, municipio, sigla, partida.nombre)
      if (!r.ambigua && r.nombre === null) {
        const alt = provinciaAlternativa(provincia)
        if (alt !== null) r = await resolverNombreVia(alt, municipio, sigla, partida.nombre)
      }
      if (r.ambigua) return { estado: 'ambigua' }
      if (r.nombre === null) return { estado: 'no_encontrada' }
      return {
        estado: 'candidato',
        candidato: {
          texto: formatearDireccion(partida.tipoVia, r.nombre, partida.numero, partida.planta, partida.puerta),
          tipoVia: catalogoTipoVia ? emparejarNombreVia(partida.tipoVia, catalogoTipoVia) : null,
        },
      }
    }

    // Sin tipo de vía: se le pregunta también al callejero.
    let r = await resolverTipoViaPorNombre(provincia, municipio, partida.nombre)
    if (!r.ambigua && r.tipo === null) {
      const alt = provinciaAlternativa(provincia)
      if (alt !== null) r = await resolverTipoViaPorNombre(alt, municipio, partida.nombre)
    }
    if (r.ambigua) return { estado: 'ambigua' }
    if (r.tipo === null || r.nombre === null) return { estado: 'no_encontrada' }
    const canonico = siglaCanonica(r.tipo)
    if (canonico === null) return { estado: 'no_encontrada' }
    return {
      estado: 'candidato',
      candidato: {
        texto: formatearDireccion(canonico, r.nombre, partida.numero, partida.planta, partida.puerta),
        tipoVia: catalogoTipoVia ? emparejarNombreVia(canonico, catalogoTipoVia) : null,
      },
    }
  } catch {
    return { estado: 'error' }
  }
}

function formatearDireccion(
  tipoVia: string,
  nombreCalle: string,
  numero: string | null,
  planta: string | null,
  puerta: string | null,
): string {
  const nombreLegible = nombreCalle
    .toLowerCase()
    .split(' ')
    .map((p) => (p.length > 2 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ')
  const partes = [`${tipoVia} ${nombreLegible}`]
  if (numero !== null) partes.push(numero)
  if (planta !== null) partes.push(`${planta}º${puerta !== null ? ` ${puerta}` : ''}`)
  return partes.join(', ')
}
