// «Datos con los que hemos calculado tu precio» para un presupuesto de OFERTAS DEL BOT (18/10/2026, decisión de Alberto).
// PURO (sin BD): la lectura vive en `datos-usados-ofertas-bd.ts`. Test: `datos-usados-ofertas.test.ts`.
//
// 🚨 El código postal y la localidad son los que USÓ LA COMPAÑÍA (`oportunidad_oferta.datos_extra.datosUsados`, lo
//    guarda el bot), NUNCA los de la ficha: Allianz puede fijar otro y el precio sale con ése. `null` = el bot no lo
//    leyó → «la que indique la compañía al emitir». Si las compañías usaron valores distintos, se dice por compañía.
// 🚨 Vehículo: el que usó la compañía; si no consta, el de la oportunidad marcado «según tus datos».
// 🚨 Conductor: edad y antigüedad del carné en AÑOS, nunca fechas. Matrícula: solo las 3 últimas.
// 🚨 Lo que no consta no se pinta (no hay «—» ni «no» inventados), salvo CP/localidad, que se dice expresamente.

import type { GrupoDatos } from './datos-cotizados.ts'

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : null)

export type VehiculoUsado = { marca: string | null; modelo: string | null; version: string | null }
export type DatosUsados = { codigoPostal: string | null; localidad: string | null; vehiculo: VehiculoUsado | null }

/** `datos_extra.datosUsados` de una oferta, sin fiarse de su forma. `null` = la oferta no lo trae (bot anterior). */
export function leerDatosUsados(datosExtra: unknown): DatosUsados | null {
  const d = obj(obj(datosExtra)?.datosUsados)
  if (!d) return null
  const v = obj(d.vehiculo)
  const vehiculo = v ? { marca: txt(v.marca), modelo: txt(v.modelo), version: txt(v.version) } : null
  const cp = txt(d.codigoPostal)
  return {
    // Un CP que no son 5 dígitos no es un CP: no se pinta como si lo fuera.
    codigoPostal: cp && /^\d{5}$/.test(cp) ? cp : null,
    localidad: txt(d.localidad),
    vehiculo: vehiculo && (vehiculo.marca || vehiculo.modelo || vehiculo.version) ? vehiculo : null,
  }
}

/** Matrícula con solo las 3 últimas a la vista (`****BCD`). `null` = no consta. */
export function enmascararMatricula(m: unknown): string | null {
  const s = txt(m)?.replace(/[\s-]/g, '').toUpperCase()
  if (!s) return null
  return s.length <= 3 ? '***' : `${'*'.repeat(Math.min(4, s.length - 3))}${s.slice(-3)}`
}

/** Años cumplidos entre una fecha (aaaa-mm-dd o dd/mm/aaaa) y `hoy` (aaaa-mm-dd). `null` = fecha ilegible o futura. */
export function aniosCumplidos(fecha: unknown, hoy: string): number | null {
  const s = txt(fecha) ?? ''
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  const [a, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : es ? [+es[3], +es[2], +es[1]] : [NaN, NaN, NaN]
  const h = /^(\d{4})-(\d{2})-(\d{2})/.exec(hoy)
  if (!Number.isFinite(a) || !h || m < 1 || m > 12 || d < 1 || d > 31) return null
  let n = +h[1] - a
  if (+h[2] < m || (+h[2] === m && +h[3] < d)) n--
  return n >= 0 && n < 130 ? n : null
}

const DE_LA_COMPANIA = 'la que indique la compañía al emitir'
const nombreVehiculo = (v: VehiculoUsado): string => [v.marca, v.modelo, v.version].filter(Boolean).join(' ')

export type EntradaDatosUsados = {
  /** Las ofertas visibles del presupuesto (compañía + lo que el bot guardó que usó). */
  ofertas: { compania: string; datosUsados: DatosUsados | null }[]
  /** El vehículo de la oportunidad (lo que tenemos en tus datos). */
  vehiculoFicha: { marca: string | null; modelo: string | null; version?: string | null; matricula: string | null } | null
  /** Fechas del que CONDUCE (de su ficha). Solo salen como años. `null` = no aplica (persona jurídica): no se pinta.
   *  `'ilegible'` = la lectura de su ficha FALLÓ: se dice «no lo hemos podido leer», no se calla. */
  conductor: { fechaNacimiento: string | null; fechaCarnet: string | null } | 'ilegible' | null
  /** No hay conductor habitual en la oportunidad: el que conduce es el TOMADOR, y el rótulo lo dice. */
  conductorEsTomador?: boolean
  /** El presupuesto MEZCLA ofertas del bot con ofertas de PDF: una fila sin compañía diría que vale para todas. */
  mezclaConPdf?: boolean
  hoy: string
}

/** Valor por compañía; si todas coinciden, una sola fila sin compañía. Compañías en el orden de las ofertas.
 *  `nombrarSiempre` (presupuesto que mezcla bot y PDF): la fila única dice a qué compañía/s corresponde, porque las
 *  ofertas de PDF no usaron ese dato y una fila «sin compañía» diría que vale para todas. */
function porCompania(etiqueta: string, pares: { compania: string; valor: string }[], nombrarSiempre = false): { etiqueta: string; valor: string }[] {
  const unicos: { compania: string; valor: string }[] = []
  for (const p of pares) if (!unicos.some((u) => u.compania === p.compania && u.valor === p.valor)) unicos.push(p)
  if (new Set(unicos.map((u) => u.valor)).size <= 1) {
    if (!unicos.length) return []
    const companias = [...new Set(unicos.map((u) => u.compania))]
    return [{ etiqueta: nombrarSiempre ? `${etiqueta} (${companias.join(', ')})` : etiqueta, valor: unicos[0].valor }]
  }
  return unicos.map((u) => ({ etiqueta: `${etiqueta} (${u.compania})`, valor: u.valor }))
}

/** Los grupos «Dónde circula», «Vehículo» y «Conductor». PURA. */
export function gruposDatosUsadosOfertas(e: EntradaDatosUsados): GrupoDatos[] {
  const grupos: GrupoDatos[] = []
  const mezcla = e.mezclaConPdf === true
  if (e.ofertas.length > 0) {
    const filas = [
      ...porCompania('Código postal', e.ofertas.map((o) => ({ compania: o.compania, valor: o.datosUsados?.codigoPostal ?? DE_LA_COMPANIA })), mezcla),
      ...porCompania('Localidad', e.ofertas.map((o) => ({ compania: o.compania, valor: o.datosUsados?.localidad ?? DE_LA_COMPANIA })), mezcla),
    ]
    grupos.push({ titulo: 'Dónde circula el vehículo', filas })
  }

  const f = e.vehiculoFicha
  const deFicha = f ? nombreVehiculo({ marca: f.marca, modelo: f.modelo, version: f.version ?? null }) : ''
  const vehiculos = e.ofertas
    .map((o) => {
      const usado = o.datosUsados?.vehiculo ? nombreVehiculo(o.datosUsados.vehiculo) : ''
      const valor = usado || (deFicha ? `${deFicha} (según tus datos)` : '')
      return { compania: o.compania, valor }
    })
    .filter((x) => x.valor !== '')
  const filasVehiculo = [
    ...porCompania('Vehículo', vehiculos, mezcla),
    ...(enmascararMatricula(f?.matricula) ? [{ etiqueta: 'Matrícula', valor: enmascararMatricula(f?.matricula)! }] : []),
  ]
  if (filasVehiculo.length) grupos.push({ titulo: 'Vehículo', filas: filasVehiculo })

  const tituloConductor = e.conductorEsTomador ? 'Conductor (tomador)' : 'Conductor'
  if (e.conductor === 'ilegible') {
    // Un fallo de lectura NO es «no hay conductor»: se dice, no se omite el grupo.
    grupos.push({ titulo: tituloConductor, filas: [{ etiqueta: 'Edad y carné de conducir', valor: 'no lo hemos podido leer' }] })
    return grupos
  }
  const edad = aniosCumplidos(e.conductor?.fechaNacimiento, e.hoy)
  const carne = aniosCumplidos(e.conductor?.fechaCarnet, e.hoy)
  const filasConductor = [
    ...(edad !== null ? [{ etiqueta: 'Edad', valor: `${edad} años` }] : []),
    ...(carne !== null ? [{ etiqueta: 'Carné de conducir', valor: carne === 0 ? 'menos de 1 año' : `${carne} ${carne === 1 ? 'año' : 'años'}` }] : []),
  ]
  if (filasConductor.length) grupos.push({ titulo: tituloConductor, filas: filasConductor })
  return grupos
}
