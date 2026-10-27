// PATRIMONIO (27/10/2026, hoja de ruta P7) — INFORME ANUAL PARA EL GESTOR. PURO (sin prisma, sin sesión, sin reloj).
//
// No calcula nada nuevo: agrupa por TITULAR el `InformeFiscal` que ya sale de la rentabilidad (`informeFiscal`, `fiscal.ts`) y
// lo aplana en filas para el gestor (inmueble suelto, o edificio con sus unidades). Las sumas por titular son sumas de campos
// ya calculados, no una segunda lógica fiscal. Exporta datos; NO asesora (`TEXTO_LEGAL_GESTOR`).
//
// 🚨 Tres estados, nunca 0 de relleno: la amortización sin dato es `null` y arrastra al neto del titular (basta una sin dato
// para que el neto del titular sea `null`). Un inmueble cuyo titular no consta NO se funde con otro: va a un grupo propio.
import { celdaCsv, importeCsv, type InformeEdificio, type InformeFiscal, type InformeInmueble, type Tratamiento } from './fiscal.ts'

export const TEXTO_LEGAL_GESTOR = 'Exportación de tus datos para tu gestor; no es asesoramiento fiscal'

/** Clave de grupo del inmueble sin titular conocido: nunca se mezcla con un titular real. */
export const TITULAR_SIN_IDENTIFICAR = 'sin-identificar'

export type TitularDeInmueble = { id: string; nombre: string }

export type TotalesGestor = {
  ingresosCent: number
  totalDeducibleCent: number
  aRevisarCent: number
  noDirectoCent: number
  rendimientoAntesAmortizacionCent: number
  /** `null` = alguna amortización sin dato: no hay neto del titular. */
  rendimientoNetoCent: number | null
}

export type InmuebleGestor = { tipo: 'inmueble'; inmueble: InformeInmueble }
export type EdificioGestor = { tipo: 'edificio'; edificio: InformeEdificio }

export type TitularGestor = {
  titularId: string
  nombre: string
  elementos: (InmuebleGestor | EdificioGestor)[]
  totales: TotalesGestor
}

export type InformeGestor = {
  anio: number
  enCurso: boolean
  desde: string
  hasta: string
  titulares: TitularGestor[]
  /** Inmuebles sin renta en el año (no entran), tal cual los da el informe fiscal. */
  sinIngresos: string[]
  /** Gastos sin inmueble: no se reparten solos, y se dice. */
  sinImputarCent: number
  textoLegal: string
}

const totalesDe = (filas: readonly { ingresosCent: number; totalDeducibleCent: number; aRevisarCent: number; noDirectoCent: number; rendimientoAntesAmortizacionCent: number; rendimientoNetoCent: number | null }[]): TotalesGestor => {
  const s = (k: 'ingresosCent' | 'totalDeducibleCent' | 'aRevisarCent' | 'noDirectoCent' | 'rendimientoAntesAmortizacionCent') => filas.reduce((a, f) => a + f[k], 0)
  return {
    ingresosCent: s('ingresosCent'),
    totalDeducibleCent: s('totalDeducibleCent'),
    aRevisarCent: s('aRevisarCent'),
    noDirectoCent: s('noDirectoCent'),
    rendimientoAntesAmortizacionCent: s('rendimientoAntesAmortizacionCent'),
    rendimientoNetoCent: filas.length > 0 && filas.every((f) => f.rendimientoNetoCent !== null) ? filas.reduce((a, f) => a + (f.rendimientoNetoCent as number), 0) : null,
  }
}

/**
 * `titularDe`: titular (id estable + nombre) por id de inmueble. Agrupa por IDENTIDAD (id), no por nombre: dos titulares con el
 * mismo nombre no se funden. `soloTitular`: deja únicamente ese titular (id); el que no esté simplemente no sale.
 */
export function informeGestor(inf: InformeFiscal, titularDe: ReadonlyMap<string, TitularDeInmueble>, soloTitular?: string): InformeGestor {
  const grupos = new Map<string, { nombre: string; elementos: (InmuebleGestor | EdificioGestor)[] }>()
  const meter = (inmuebleId: string, nombreFallback: string, el: InmuebleGestor | EdificioGestor) => {
    const t = titularDe.get(inmuebleId)
    const id = t?.id ?? TITULAR_SIN_IDENTIFICAR
    const g = grupos.get(id) ?? { nombre: t?.nombre || nombreFallback || 'Titular sin identificar', elementos: [] }
    g.elementos.push(el)
    grupos.set(id, g)
  }
  for (const i of inf.arrendados) meter(i.inmuebleId, i.titular, { tipo: 'inmueble', inmueble: i })
  for (const e of inf.edificios) meter(e.edificioId, e.titular, { tipo: 'edificio', edificio: e })
  const titulares = [...grupos.entries()]
    .filter(([id]) => soloTitular === undefined || id === soloTitular)
    .map(([titularId, g]): TitularGestor => ({
      titularId,
      nombre: g.nombre,
      elementos: g.elementos,
      totales: totalesDe(g.elementos.map((el) => (el.tipo === 'inmueble' ? el.inmueble : el.edificio))),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return {
    anio: inf.anio, enCurso: inf.enCurso, desde: inf.desde, hasta: inf.hasta, titulares,
    sinIngresos: inf.sinIngresos, sinImputarCent: inf.sinImputarCent, textoLegal: TEXTO_LEGAL_GESTOR,
  }
}

// ─── CSV ───────────────────────────────────────────────────────────────────────────────────────────────

const CLASE: Record<Tratamiento, string> = { deducible: 'Gasto deducible', a_revisar: 'Gasto a revisar', no_directo: 'Gasto no directo (se amortiza)' }
const SIN_DATO = 'sin dato'

/**
 * CSV con `;` y BOM, una fila por concepto: Año; Titular; Inmueble; Unidad; Concepto; Clase; Importe (EUR); Nota. Coma decimal.
 * El edificio sale por unidad (columna «Unidad») y con sus filas «Total del edificio». Sin dato = «sin dato», jamás 0.
 */
export function csvGestor(inf: InformeGestor): string {
  const filas: string[][] = [['Año', 'Titular', 'Inmueble', 'Unidad', 'Concepto', 'Clase', 'Importe (EUR)', 'Nota']]
  const anio = String(inf.anio)
  const bloque = (titular: string, inmueble: string, unidad: string, i: InformeInmueble) => {
    const f = (concepto: string, clase: string, importe: string, nota = '') => filas.push([anio, titular, inmueble, unidad, concepto, clase, importe, nota])
    f('Ingresos íntegros (renta devengada)', 'Ingreso', importeCsv(i.ingresosCent))
    for (const l of i.lineas) f(l.etiqueta, CLASE[l.tratamiento], importeCsv(l.importeCent), l.nota ?? '')
    f('Total gastos deducibles', 'Total', importeCsv(i.totalDeducibleCent))
    f('Rendimiento antes de amortización', 'Resultado', importeCsv(i.rendimientoAntesAmortizacionCent))
    f('Amortización estimada', 'Resultado', i.amortizacionCent === null ? SIN_DATO : importeCsv(i.amortizacionCent), i.amortizacionCent === null ? 'No guardamos el coste de adquisición ni el valor catastral' : '')
    f('Rendimiento neto', 'Resultado', i.rendimientoNetoCent === null ? SIN_DATO : importeCsv(i.rendimientoNetoCent), i.rendimientoNetoCent === null ? 'Falta la amortización' : '')
  }
  for (const t of inf.titulares) {
    for (const el of t.elementos) {
      if (el.tipo === 'inmueble') {
        bloque(t.nombre, el.inmueble.alias, '', el.inmueble)
        continue
      }
      const e = el.edificio
      const rc = e.referenciaCatastral ? `RC ${e.referenciaCatastral}` : 'Referencia catastral: sin dato'
      for (const u of e.unidades) bloque(t.nombre, e.alias, u.alias, u)
      if (e.comunes) bloque(t.nombre, e.alias, 'Gastos comunes sin repartir', e.comunes)
      const tot = (concepto: string, importe: string, nota: string) => filas.push([anio, t.nombre, e.alias, '', concepto, 'Total del edificio', importe, nota])
      tot('Ingresos íntegros del edificio', importeCsv(e.ingresosCent), rc)
      tot('Total gastos deducibles del edificio', importeCsv(e.totalDeducibleCent), rc)
      tot('Rendimiento antes de amortización del edificio', importeCsv(e.rendimientoAntesAmortizacionCent), rc)
      tot('Rendimiento neto del edificio', e.rendimientoNetoCent === null ? SIN_DATO : importeCsv(e.rendimientoNetoCent), e.rendimientoNetoCent === null ? 'Falta la amortización' : rc)
    }
    const x = t.totales
    const tt = (concepto: string, importe: string, nota = '') => filas.push([anio, t.nombre, '', '', concepto, 'Total del titular', importe, nota])
    tt('Ingresos íntegros del titular', importeCsv(x.ingresosCent))
    tt('Total gastos deducibles del titular', importeCsv(x.totalDeducibleCent))
    tt('Rendimiento antes de amortización del titular', importeCsv(x.rendimientoAntesAmortizacionCent))
    tt('Rendimiento neto del titular', x.rendimientoNetoCent === null ? SIN_DATO : importeCsv(x.rendimientoNetoCent), x.rendimientoNetoCent === null ? 'Falta la amortización de algún inmueble' : '')
  }
  if (inf.sinImputarCent > 0) filas.push([anio, '', '', '', 'Gastos sin inmueble asignado (no repartidos)', 'Aparte', importeCsv(inf.sinImputarCent), 'No incluidos en ningún inmueble'])
  filas.push([anio, '', '', '', inf.textoLegal, '', '', inf.enCurso ? `Ejercicio en curso: datos hasta el ${inf.hasta.split('-').reverse().join('/')}` : ''])
  return '﻿' + filas.map((f) => f.map(celdaCsv).join(';')).join('\r\n') + '\r\n'
}
