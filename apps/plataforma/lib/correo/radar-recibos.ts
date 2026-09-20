// Radar de compañías sin canal digital de aviso de recibos (20/09/2026).
//
// El triaje distingue `correduria-recibo` (recibos devueltos, impagos,
// anulaciones) por dominio + asunto — pero solo lo VE si esa compañía manda
// ese aviso por correo. Medido a mano: Occident, Allianz y Reale sí lo hacen;
// Mapfre está en la lista de dominios reconocidos y NUNCA ha producido un
// `correduria-recibo` real (solo comunicados comerciales) — su recibo devuelto
// de 56 días (03/09/2026) no habría saltado tampoco por aquí.
//
// Este módulo responde, con datos reales de `correo_triaje` (no de memoria):
// de las compañías que el triaje SABE reconocer, ¿de cuáles ha visto alguna
// vez un aviso de recibo, y de cuáles nunca? Es la pregunta que decide dónde
// hace falta vigilancia manual (CIMA, o mirar el buzón a mano) porque el
// correo no va a avisar solo.
//
// 🚨 Varios dominios de `ASEGURADORAS` son la MISMA compañía (Occident manda
// desde cuatro dominios distintos según el tipo de comunicado; Generali desde
// dos). Contarlos como cuatro/dos «compañías» independientes haría que, en
// cuanto se viera un aviso por UNO de esos dominios, los otros tres siguieran
// saliendo para siempre como «nunca ha avisado» — de la MISMA compañía que sí
// avisa. Por eso se agrupa por marca antes de decidir `visto`: la pregunta es
// «¿ha avisado ESTA COMPAÑÍA alguna vez, por cualquiera de sus dominios?».
//
// Puro (esta comparación) + una consulta de solo lectura sobre `correo_triaje`
// (que vive en la BD de plataforma, no en la cartera de asegura).
import { ASEGURADORAS } from './keywords.ts'

export { ASEGURADORAS }

/** El dominio de una dirección de correo, o `''` si no tiene forma de tenerlo. */
export function dominioDe(from: string): string {
  const at = (from || '').toLowerCase().indexOf('@')
  return at >= 0 ? from.slice(at + 1).trim() : ''
}

function enDominio(dom: string, base: string): boolean {
  return dom === base || dom.endsWith('.' + base)
}

/**
 * Dominios de `ASEGURADORAS` que son la MISMA compañía bajo marcas o
 * remitentes distintos. Solo se agrupa lo que es inequívoco por el propio
 * nombre del dominio (todos dicen «occident»/«generali») — nunca una
 * suposición de negocio que no se pueda leer en la propia lista.
 */
const GRUPOS: { etiqueta: string; dominios: string[] }[] = [
  { etiqueta: 'Occident', dominios: ['occidentinforma.com', 'comunicacionesoccident.com', 'newsoccident.com', 'occident.com'] },
  { etiqueta: 'Generali', dominios: ['generali.com', 'tugenerali.es'] },
]

type GrupoResuelto = { etiqueta: string; dominios: readonly string[] }

/** Cada dominio de `ASEGURADORAS`, agrupado por compañía. Un dominio sin grupo es su propio grupo de uno. */
function gruposDeAseguradoras(): GrupoResuelto[] {
  const agrupados = new Set(GRUPOS.flatMap((g) => g.dominios))
  const sueltos = ASEGURADORAS.filter((d) => !agrupados.has(d)).map((d) => ({ etiqueta: d, dominios: [d] }))
  return [...GRUPOS, ...sueltos]
}

export type EstadoDominio = { etiqueta: string; dominios: readonly string[]; visto: boolean }

/**
 * Para cada COMPAÑÍA (grupo de uno o más dominios), si `remitentesVistos`
 * (los remitentes de correos YA clasificados `correduria-recibo`) trae alguno
 * de cualquiera de sus dominios. Puro: no hace la consulta, solo compara.
 */
export function radarRecibos(remitentesVistos: readonly string[]): EstadoDominio[] {
  const dominiosVistos = remitentesVistos.map(dominioDe).filter((d) => d !== '')
  return gruposDeAseguradoras().map((g) => ({
    etiqueta: g.etiqueta,
    dominios: g.dominios,
    visto: g.dominios.some((base) => dominiosVistos.some((d) => enDominio(d, base))),
  }))
}
