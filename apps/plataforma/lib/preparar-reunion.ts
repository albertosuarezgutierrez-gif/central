// «Preparar reunión» (07/11/2026): el resumen de UNA pantalla, en texto plano, que Alberto imprime o copia antes de
// reunirse con una compañía. PURO y determinista (sin IA, sin reloj, sin red): todo sale de las cifras del cuadro de
// mando y de la competitividad de precio. Test: `lib/preparar-reunion.test.ts`.
//
// 🚨 null ≠ 0: un dato sin cifra dice «no consta», nunca 0. Siniestralidad INFORMATIVA y con su cobertura («importes en
// X de Y»). Competitividad con su tamaño de muestra. Sin ningún dato de clientes: solo cifras agregadas por compañía.

import { etiquetaRamo, variacionPct, type CuadroCompaniaAnio } from '@central/module-seguros'
import { eurONada, enteroONada, pctONada, textoSiniestralidad, textoVariacion, type LibroCompania } from './cuadro-companias.ts'
import { textoCompetitividad, type RespuestaCompetitividad } from './competitividad-companias.ts'

export type EntradaReunion = {
  codigo: string
  nombre: string
  anio: number
  /** Cuadro del año. `undefined` = la compañía no tiene pólizas, siniestros ni recibos ese año. */
  actual: CuadroCompaniaAnio | undefined
  anterior: CuadroCompaniaAnio | undefined
  /** Libro de comisiones: `null` = no se pudo leer; `undefined` = sin periodos. */
  libro: LibroCompania | null | undefined
  /** `null` = aún no cargada. */
  competitividad: RespuestaCompetitividad | null
  /** Tope de siniestralidad del acuerdo (%), si lo hay. */
  topeSiniestralidad: number | null
}

const vs = (a: number | null | undefined, b: number | null | undefined, anio: number): string => {
  const t = textoVariacion(variacionPct(a, b))
  return t === null ? '' : ` (${t} vs ${anio - 1})`
}

const porRamo = (filas: { ramo: string; polizas: number; prima?: number | null }[], conPrima: boolean): string =>
  filas.length === 0 ? 'ninguna' : filas.map((f) => `${etiquetaRamo(f.ramo)} ${f.polizas}${conPrima && f.prima != null ? ` (${eurONada(f.prima)})` : ''}`).join(' · ')

/** El texto de la reunión. Líneas cortas (cabe en una página A4 y en un WhatsApp). */
export function textoReunion(e: EntradaReunion): string {
  const { actual: c, anterior: a, anio } = e
  const L: string[] = []
  L.push(`REUNIÓN CON ${e.nombre.toUpperCase()} — AÑO ${anio}`)
  L.push('Cifras de Grupo ASegura con esta compañía (año natural). «No consta» = sin dato, no cero.')
  L.push('')

  if (!c) {
    L.push(`Sin pólizas, siniestros ni recibos de esta compañía en ${anio}.${a ? ` En ${anio - 1} tenía ${a.cartera.polizas} pólizas.` : ''}`)
  } else {
    L.push('CARTERA')
    L.push(`- Pólizas en vigor: ${enteroONada(c.cartera.polizas)}${vs(c.cartera.polizas, a?.cartera.polizas, anio)}${c.cartera.reconstruida ? ' · reconstruida a 31/12' : ''}`)
    L.push(`- Prima: ${eurONada(c.cartera.prima)}${vs(c.cartera.prima, a?.cartera.prima, anio)}${c.cartera.sinPrima > 0 ? ` · ${c.cartera.sinPrima} pólizas sin prima (total incompleto)` : ''}`)
    L.push(`- Por ramo: ${porRamo(c.cartera.porRamo, true)}`)
    L.push('')
    L.push('PRODUCCIÓN')
    L.push(`- Nuevas: ${enteroONada(c.produccion.nuevas.polizas)}${vs(c.produccion.nuevas.polizas, a?.produccion.nuevas.polizas, anio)} · prima ${eurONada(c.produccion.nuevas.prima)}`)
    L.push(`- Bajas: ${enteroONada(c.produccion.bajas.polizas)}${vs(c.produccion.bajas.polizas, a?.produccion.bajas.polizas, anio)} (CIMA no manda el motivo)`)
    L.push(`- Retención: ${c.produccion.retencionPct === null ? 'no consta (sin pólizas a 1 de enero)' : `${pctONada(c.produccion.retencionPct)} (${c.produccion.bajasDeBase} bajas de ${c.produccion.baseInicio} pólizas de enero)`}`)
    L.push('')
    L.push('COMISIÓN')
    L.push(`- Devengada: ${eurONada(c.comision.devengada)}${vs(c.comision.devengada, a?.comision.devengada, anio)}${c.comision.recibos > 0 ? ` · ${c.comision.recibos} recibos` : ' · sin recibos cobrados'}`)
    L.push(`- % real sobre prima neta: ${c.comision.pctReal === null ? 'no consta' : pctONada(c.comision.pctReal, 2)}`)
    if (e.libro === null) L.push('- Liquidada y cobrada: no se ha podido leer el libro de comisiones')
    else if (e.libro === undefined) L.push('- Liquidada y cobrada: sin periodos en el libro')
    else L.push(`- Liquidada: ${eurONada(e.libro.liquidado)} · cobrada en banco: ${eurONada(e.libro.cobrado)}${e.libro.completo ? '' : ' (libro incompleto)'}`)
    L.push('')
    L.push('SINIESTRALIDAD (informativa: no resta a tu comisión)')
    const s = textoSiniestralidad(c.siniestros)
    L.push(`- Siniestros: ${enteroONada(c.siniestros.n)}${c.siniestros.asistencias > 0 ? ` (+${c.siniestros.asistencias} asistencias aparte)` : ''}${vs(c.siniestros.n, a?.siniestros.n, anio)}`)
    L.push(`- Incurrido: ${eurONada(c.siniestros.incurrido)}${s.cobertura ? ` · ${s.cobertura}` : ''}`)
    L.push(`- Sobre prima neta cobrada: ${s.titular}${e.topeSiniestralidad !== null ? ` · máximo del acuerdo ${pctONada(e.topeSiniestralidad, 0)}` : ''}`)
    if (s.aviso) L.push(`- Aviso: ${s.aviso}`)
  }

  L.push('')
  L.push('COMPETITIVIDAD DE PRECIO (tarificaciones de Avant2 y bots; mismo riesgo y mismo nivel de cobertura)')
  const comp = e.competitividad
  if (comp === null) L.push('- Aún no cargada.')
  else if (comp.estado === 'sin_configurar') L.push('- No disponible: falta el secreto del puerto de asegura.')
  else if (comp.estado === 'error') L.push(`- No se ha podido calcular (${comp.motivo}). No significa que no haya datos.`)
  else {
    const t = textoCompetitividad(comp.competitividad, e.codigo)
    if (t.tipo === 'sin_datos') L.push(`- ${t.texto}`)
    else {
      for (const f of t.frases) L.push(`- ${f}`)
      if (t.frases.length === 0) L.push('- Sin comparaciones de precio de esta compañía.')
      L.push('')
      L.push('SIN PRECIO / RECHAZOS DEL RIESGO (Avant2)')
      if (t.sinPrecio.length === 0) L.push('- Sin tarificaciones con detalle de fallos.')
      for (const f of t.sinPrecio) L.push(`- ${f}`)
    }
    if (comp.competitividad.truncado) L.push('- La lectura llegó a su techo: las cifras son un mínimo.')
  }
  return L.join('\n')
}
