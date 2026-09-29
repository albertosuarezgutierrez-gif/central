// El seguro que el cliente tiene HOY, para precargar la tarificación (29/09/2026).
//
// Alberto sube la póliza del cliente, la IA la lee y la oportunidad guarda compañía, nº y el
// bonus (años sin siniestros, siniestros en 5 años). Al tarificar ese riesgo no se vuelve a
// teclear: sale de aquí. Puro y sin E/S: lo que decide qué oportunidad manda está testeado.
import { HISTORIAL_MAXIMO, type SeguroAnterior } from '@central/module-seguros'
import type { OportunidadDeCliente } from './seguimiento-asegura.ts'

export type AnteriorParaTarificar = {
  oportunidadId: string
  /** «1234ABC · Yamaha MT-07», para decir DE DÓNDE sale lo precargado. */
  etiqueta: string | null
  aseguradora: string | null
  numeroPoliza: string | null
  seguroAnterior: SeguroAnterior | null
}

const CERRADAS = new Set(['ganada', 'perdida'])

function util(o: OportunidadDeCliente): boolean {
  return o.aseguradora !== null || o.numeroPoliza !== null || o.seguroAnterior !== null
}

function aAnterior(o: OportunidadDeCliente): AnteriorParaTarificar {
  return {
    oportunidadId: o.id,
    etiqueta: [o.matricula, o.vehiculo].filter(Boolean).join(' · ') || null,
    aseguradora: o.aseguradora,
    numeroPoliza: o.numeroPoliza,
    seguroAnterior: o.seguroAnterior,
  }
}

/**
 * De qué oportunidad sale el seguro anterior:
 * - con `oportunidadId` (se tarifica ESE riesgo), de esa y de ninguna otra;
 * - sin él, de la única ABIERTA de ese ramo que traiga algo. Con dos (dos motos), `ambiguo`:
 *   precargar la de la otra moto sería un bonus plausible y falso, peor que teclearlo.
 */
export function anteriorParaTarificar(
  ops: OportunidadDeCliente[],
  q: { ramo: string; oportunidadId: string | null },
): { estado: 'ok'; anterior: AnteriorParaTarificar } | { estado: 'ninguno' } | { estado: 'ambiguo'; n: number } {
  if (q.oportunidadId) {
    const o = ops.find(x => x.id === q.oportunidadId)
    return o && util(o) ? { estado: 'ok', anterior: aAnterior(o) } : { estado: 'ninguno' }
  }
  const abiertas = ops.filter(o => o.ramo === q.ramo && !CERRADAS.has(o.estado) && util(o))
  if (abiertas.length === 0) return { estado: 'ninguno' }
  if (abiertas.length > 1) return { estado: 'ambiguo', n: abiertas.length }
  return { estado: 'ok', anterior: aAnterior(abiertas[0]) }
}

function normal(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * El código DGS del desplegable de compañías para lo leído: por código si el documento lo traía,
 * si no por nombre (común o de CIMA, en cualquiera de los dos sentidos: «MAPFRE ESPAÑA» ↔ «Mapfre»).
 * Con varias que encajan por nombre, ninguna: elegir una a ojo es inventar la compañía.
 */
export function codigoCompania(
  companias: { codigoDgs: string; nombreComun: string; nombreCima?: string | null }[],
  leido: { codigoDgs: string | null; nombre: string | null },
): string | null {
  if (leido.codigoDgs) {
    const c = companias.find(x => x.codigoDgs.toUpperCase() === leido.codigoDgs!.toUpperCase())
    if (c) return c.codigoDgs
  }
  if (!leido.nombre) return null
  const n = normal(leido.nombre)
  if (n === '') return null
  const nombres = (c: (typeof companias)[number]) => [c.nombreComun, c.nombreCima].flatMap(x => (x ? [normal(x)] : [])).filter(m => m !== '')
  const exacta = new Set(companias.filter(c => nombres(c).includes(n)).map(c => c.codigoDgs))
  if (exacta.size === 1) return [...exacta][0]
  const encajan = [...new Set(companias
    .filter(c => nombres(c).some(m => ` ${n} `.includes(` ${m} `) || ` ${m} `.includes(` ${n} `)))
    .map(c => c.codigoDgs))]
  return encajan.length === 1 ? encajan[0] : null
}

export { HISTORIAL_MAXIMO }

/**
 * El historial que se DECLARA al tarificar cuando no se sabe (29/09/2026, dictado de Alberto): el
 * máximo. La compañía lo contrasta con SINCO por el nº de póliza y aplica el bonus real; teclear
 * años a mano no justifica nada y solo mete errores. Lo que SÍ se ha leído de su póliza manda
 * sobre el máximo: declarar 10 años limpios cuando el papel dice 3 sería mentir sabiéndolo.
 */

export type HistorialDeclarado = {
  aniosAsegurado: number
  aniosEnCompania: number
  aniosSinSiniestros: number
  /** `null` = hay que preguntarlo: menos de 5 años limpios leídos y el papel no dice cuántos siniestros. */
  siniestrosUltimos5: number | null
}

export function historialDeclarado(sa: SeguroAnterior | null): HistorialDeclarado {
  const limpios = sa?.aniosSinSiniestros ?? HISTORIAL_MAXIMO.aniosSinSiniestros
  const siniestros = sa?.siniestrosUltimos5 ?? (limpios >= 5 ? HISTORIAL_MAXIMO.siniestrosUltimos5 : null)
  return {
    aniosAsegurado: Math.max(HISTORIAL_MAXIMO.aniosAsegurado, limpios),
    aniosEnCompania: HISTORIAL_MAXIMO.aniosEnCompania,
    aniosSinSiniestros: limpios,
    siniestrosUltimos5: siniestros,
  }
}
