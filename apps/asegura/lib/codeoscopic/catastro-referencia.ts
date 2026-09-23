// El riesgo de hogar desde la REFERENCIA CATASTRAL del piso, consultado en el
// servidor. Para las pólizas de hogar de la cartera que no traen m², año ni CP
// (medido 23/09/2026: 22 de las 28 vivas no canceladas): el corredor elige el
// piso en plataforma y aquí solo viaja la referencia — los números los pone el
// Catastro, no quien llama, porque con ellos se pide un precio que se cobra.

import { caracterizarVivienda, paramsDnploc } from '@central/core-catastro'
import { bajarCatastro } from '@central/core-catastro/http'
import { direccionDesdeCatastro, type CatastroHogar } from './desde-cartera-hogar.ts'

const RE_REF20 = /^[0-9A-Z]{20}$/

export type CatastroPorReferencia =
  | { estado: 'ok'; referencia: string; catastro: CatastroHogar }
  /** No es una referencia de 20 (la de 14 es la del edificio: sin m² ni año). */
  | { estado: 'invalida' }
  /** El Catastro respondió y no tiene nada con esa referencia. */
  | { estado: 'no_encontrado' }
  /** El Catastro no respondió. NO es «no existe». */
  | { estado: 'error'; motivo: string }

export async function catastroPorReferencia(valor: string): Promise<CatastroPorReferencia> {
  const referencia = valor.replace(/[\s-]/g, '').toUpperCase()
  if (!RE_REF20.test(referencia)) return { estado: 'invalida' }
  try {
    const datos = await bajarCatastro(referencia)
    if (datos === null) return { estado: 'no_encontrado' }
    return {
      estado: 'ok',
      referencia,
      catastro: {
        metrosCuadrados: datos.superficie,
        anioConstruccion: datos.anioConstruccion,
        codigoPostal: datos.codigoPostal,
        uso: datos.uso,
        direccion: direccionDesdeCatastro(paramsDnploc(datos.direccion)),
        vivienda: caracterizarVivienda(datos),
      },
    }
  } catch (e) {
    return { estado: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** La frase de cada fallo, igual en la ficha (gratis) y en el botón que paga. */
export function motivoCatastro(c: Exclude<CatastroPorReferencia, { estado: 'ok' }>): string {
  switch (c.estado) {
    case 'invalida':
      return 'La referencia catastral del piso tiene 20 caracteres (la de 14 es la del edificio y no trae m² ni año).'
    case 'no_encontrado':
      return 'El Catastro no tiene nada con esa referencia. No se cotiza sin saber el riesgo.'
    case 'error':
      return `No se ha podido consultar el Catastro (${c.motivo}). Esto NO significa que la vivienda no exista.`
  }
}
