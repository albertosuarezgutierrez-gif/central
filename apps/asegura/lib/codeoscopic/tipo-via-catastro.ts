// Cuando la calle de la ficha NO empieza por un tipo de vía reconocible
// («Severo Ochoa 12», sin «Calle»/«Avenida»…), `tipoViaDelTomador()` de
// `desde-cartera.ts` no preselecciona nada y la pantalla pide elegirlo a mano.
// Este módulo intenta un paso más ANTES de rendirse: preguntarle al callejero
// oficial del Catastro (gratis, mismo servicio libre que ya usa la
// precalificación de hogar) el tipo de vía real de esa calle en ese
// municipio. Best-effort — un fallo de red aquí nunca tumba la
// precalificación, solo deja el «elígelo a mano» que ya existía.
//
// 🚨 La dirección de la ficha se queda DENTRO de esta función, igual que en
// `tipoViaDelTomador()` de `desde-cartera.ts` (guardián
// `test/regression-retarificar-plataforma.test.ts`, que además prohíbe que la
// ruta del puerto nombre `direccion`/`codigoPostal` fuera de leer el CP): el
// caller pasa la FICHA entera y una provincia/municipio ya resueltos (ninguno
// de los dos es un dato del tomador — la provincia sale de `provinciaPorCp()`
// sobre el CP, el municipio del catálogo de Codeoscopic), nunca la calle suelta.
import { resolverTipoViaPorNombre } from '@central/core-catastro/http'
import { partirDireccion, siglaCanonica, emparejarNombreVia } from './direccion.ts'
import { provinciaAlternativa } from '../direccion/provincia.ts'
import type { Opcion } from './catalogos.ts'
import type { ClienteCartera } from './desde-cartera.ts'

export type TipoViaPorCatastro =
  | { estado: 'ok'; opcion: Opcion; nombreCatastro: string }
  /** No hay provincia o municipio resueltos: no se pregunta. */
  | { estado: 'sin_datos_para_preguntar' }
  /** La dirección no tiene calle que trocear (vacía, o solo el tipo de vía). */
  | { estado: 'sin_calle' }
  /** El callejero encontró varias calles con ese nombre y ninguna gana: no se adivina. */
  | { estado: 'ambigua' }
  /** El callejero no conoce esa calle en ese municipio. */
  | { estado: 'no_encontrada' }
  /** El callejero SÍ tiene un tipo, pero el catálogo de Codeoscopic no lo tiene con ese nombre. */
  | { estado: 'sin_match_catalogo'; nombreCatastro: string }
  /** Fallo de red o del servicio: no se sabe, no se afirma nada. */
  | { estado: 'error' }

export async function tipoViaDelTomadorPorCatastro(
  cliente: Pick<ClienteCartera, 'direccion'>,
  provincia: string | null,
  municipio: string | null,
  catalogo: ReadonlyArray<Opcion>,
): Promise<TipoViaPorCatastro> {
  if (provincia === null || municipio === null) return { estado: 'sin_datos_para_preguntar' }

  const { nombre: calle } = partirDireccion(cliente.direccion ?? null)
  if (calle === null) return { estado: 'sin_calle' }

  let r: { tipo: string | null; nombre: string | null; ambigua: boolean }
  try {
    r = await resolverTipoViaPorNombre(provincia, municipio, calle)
    // Nada con el nombre moderno: si tiene alias clásico, un segundo intento
    // ANTES de rendirse. `ambigua` no se reintenta: ya hubo respuesta, y
    // cambiar de provincia no resuelve una ambigüedad dentro de la misma.
    if (!r.ambigua && r.tipo === null) {
      const alt = provinciaAlternativa(provincia)
      if (alt !== null) r = await resolverTipoViaPorNombre(alt, municipio, calle)
    }
  } catch {
    return { estado: 'error' }
  }
  if (r.ambigua) return { estado: 'ambigua' }
  if (r.tipo === null) return { estado: 'no_encontrada' }

  const canonico = siglaCanonica(r.tipo)
  if (canonico === null) return { estado: 'sin_match_catalogo', nombreCatastro: r.tipo }

  const opcion = emparejarNombreVia(canonico, catalogo)
  if (opcion === null) return { estado: 'sin_match_catalogo', nombreCatastro: canonico }
  return { estado: 'ok', opcion, nombreCatastro: canonico }
}
