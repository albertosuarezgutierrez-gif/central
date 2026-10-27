// PATRIMONIO (25/10/2026) — informe fiscal ANUAL del alquiler, por inmueble arrendado. PURO (sin prisma, sin sesión, sin reloj).
//
// No calcula nada que la rentabilidad no calcule: parte de `ResultadoRentabilidad` (`rentabilidadPorInmueble` de
// `@central/module-patrimonio`: renta devengada, gastos confirmados por categoría, seguros = primas prorrateadas + facturas
// de seguro) y solo lo RECLASIFICA con el criterio del rendimiento del capital inmobiliario del IRPF.
//
// 🚨 Tres estados, nunca 0 de relleno:
//  · amortización: `null` = sin dato (no guardamos el coste de adquisición ni el valor catastral de construcción). Con `null`
//    NO hay «rendimiento neto»: se da el rendimiento ANTES de amortización y se dice que falta.
//  · lo que no sabemos clasificar (financiación, «otro», sin categoría) NO se suma a lo deducible: va a «a revisar».
//  · avisos de la rentabilidad (seguros sin leer, prima sin dato, gasto sin importe, facturas sin confirmar…) viajan al
//    informe: un número incompleto no se presenta como completo.
// Es ORIENTATIVO: no sustituye a un asesor fiscal (`AVISO_ORIENTATIVO`).
import type { AvisoRentabilidad, RentabilidadInmueble, ResultadoRentabilidad } from '@central/module-patrimonio'

export const AVISO_ORIENTATIVO = 'Orientativo: es un cálculo con lo que has anotado y confirmado. Revísalo con tu asesor antes de presentar la declaración.'

export type Tratamiento = 'deducible' | 'a_revisar' | 'no_directo'

export type LineaFiscal = { clave: string; etiqueta: string; importeCent: number; tratamiento: Tratamiento; nota: string | null }

type Regla = { etiqueta: string; tratamiento: Tratamiento; nota: string | null }

const REGLAS: Record<string, Regla> = {
  COMUNIDAD: { etiqueta: 'Comunidad de propietarios', tratamiento: 'deducible', nota: null },
  IMPUESTOS: { etiqueta: 'Impuestos y tasas (IBI, basuras…)', tratamiento: 'deducible', nota: 'Tributos locales del inmueble; no el IRPF.' },
  SUMINISTROS: { etiqueta: 'Suministros', tratamiento: 'deducible', nota: 'Solo los que paga el propietario, no los del inquilino.' },
  MANTENIMIENTO: { etiqueta: 'Reparación y conservación', tratamiento: 'deducible', nota: 'Con intereses, el límite conjunto son los ingresos íntegros; el exceso se arrastra 4 años.' },
  GESTION: { etiqueta: 'Gestión, gestoría y administración', tratamiento: 'deducible', nota: null },
  SEGURO: { etiqueta: 'Seguros (hogar, impago…)', tratamiento: 'deducible', nota: null },
  FINANCIACION: { etiqueta: 'Financiación (intereses)', tratamiento: 'a_revisar', nota: 'Solo se deducen los intereses y gastos de formalización, no el capital devuelto. No sabemos qué parte es cada cosa.' },
  REFORMAS: { etiqueta: 'Reformas y mejoras', tratamiento: 'no_directo', nota: 'Una mejora no se deduce de golpe: se recupera por amortización.' },
  MOBILIARIO: { etiqueta: 'Mobiliario', tratamiento: 'no_directo', nota: 'Se recupera por amortización, no como gasto del año.' },
  OTRO: { etiqueta: 'Otros gastos', tratamiento: 'a_revisar', nota: 'Sin clasificar: tu asesor dirá si es deducible.' },
  SIN_CATEGORIA: { etiqueta: 'Gastos sin categoría', tratamiento: 'a_revisar', nota: 'Sin clasificar: tu asesor dirá si es deducible.' },
}
const ORDEN = ['COMUNIDAD', 'IMPUESTOS', 'SUMINISTROS', 'SEGURO', 'MANTENIMIENTO', 'GESTION', 'FINANCIACION', 'REFORMAS', 'MOBILIARIO', 'OTRO', 'SIN_CATEGORIA']

export type InformeInmueble = {
  inmuebleId: string
  alias: string
  titular: string
  ingresosCent: number
  lineas: LineaFiscal[]
  totalDeducibleCent: number
  aRevisarCent: number
  noDirectoCent: number
  /** `null` = sin dato (nunca 0). */
  amortizacionCent: number | null
  /** Ingresos − gastos deducibles. Sin amortizar: siempre existe. */
  rendimientoAntesAmortizacionCent: number
  /** `null` = no se puede calcular sin la amortización. */
  rendimientoNetoCent: number | null
  gastosSinConfirmar: number
  avisos: AvisoRentabilidad[]
}

/**
 * EDIFICIO sin división horizontal (27/10/2026): UNA referencia catastral, varias unidades arrendadas. Se declara agrupado
 * bajo el edificio; cada unidad lleva su parte de los gastos del edificio (reparto m²/% de `rentabilidadConEdificios`) y lo
 * que no se pudo repartir va en `comunes` (cuenta en el total del edificio, no en ningún piso).
 */
export type InformeEdificio = {
  edificioId: string
  alias: string
  titular: string
  /** La RC del edificio (la de todas sus unidades). `null` = no consta. */
  referenciaCatastral: string | null
  /** Unidades con renta devengada en el año. */
  unidades: InformeInmueble[]
  /** Alias de las unidades SIN ingresos en el año. */
  unidadesSinIngresos: string[]
  /** El propio edificio: sus contratos de edificio entero y los gastos que NO se han podido repartir. `null` = nada. */
  comunes: InformeInmueble | null
  ingresosCent: number
  totalDeducibleCent: number
  aRevisarCent: number
  noDirectoCent: number
  rendimientoAntesAmortizacionCent: number
  /** Del EDIFICIO (una sola RC). `null` = sin dato. */
  amortizacionCent: number | null
  rendimientoNetoCent: number | null
  gastosSinConfirmar: number
  avisos: AvisoRentabilidad[]
}

export type InformeFiscal = {
  anio: number
  enCurso: boolean
  desde: string
  hasta: string
  /** Inmuebles SUELTOS con renta devengada en el año (las unidades de un edificio van en `edificios`). */
  arrendados: InformeInmueble[]
  /** Edificios con alguna unidad (o el propio edificio) con renta en el año, con sus unidades agrupadas. */
  edificios: InformeEdificio[]
  /** Alias de los inmuebles SIN ingresos en el año: no entran, y se dice. */
  sinIngresos: string[]
  /** Gastos del titular sin inmueble: no se reparten solos. */
  sinImputarCent: number
}

export type MetaInmueble = { id: string; alias: string; titular: string; edificioId?: string | null; referenciaCatastral?: string | null }

const amortizacionDe = (amortizacion: ReadonlyMap<string, number | null>, id: string): number | null => {
  const a = amortizacion.get(id)
  return typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : null
}

function informeDe(i: RentabilidadInmueble, m: MetaInmueble, amortizacion: ReadonlyMap<string, number | null>): InformeInmueble {
  const porCat: Record<string, number> = { ...i.gastosPorCategoria }
  if (i.seguros > 0) porCat.SEGURO = (porCat.SEGURO ?? 0) + i.seguros
  const claves = [...new Set([...ORDEN, ...Object.keys(porCat)])].filter((k) => (porCat[k] ?? 0) > 0)
  const lineas = claves.map((k): LineaFiscal => {
    const regla = REGLAS[k] ?? { etiqueta: k, tratamiento: 'a_revisar' as const, nota: 'Categoría sin clasificar.' }
    return { clave: k, etiqueta: regla.etiqueta, importeCent: porCat[k], tratamiento: regla.tratamiento, nota: regla.nota }
  })
  const suma = (t: Tratamiento) => lineas.filter((l) => l.tratamiento === t).reduce((a, l) => a + l.importeCent, 0)
  const totalDeducibleCent = suma('deducible')
  const rendimientoAntesAmortizacionCent = i.ingresos - totalDeducibleCent
  const amortizacionCent = amortizacionDe(amortizacion, i.inmuebleId)
  return {
    inmuebleId: i.inmuebleId, alias: m.alias, titular: m.titular, ingresosCent: i.ingresos, lineas,
    totalDeducibleCent, aRevisarCent: suma('a_revisar'), noDirectoCent: suma('no_directo'),
    amortizacionCent,
    rendimientoAntesAmortizacionCent,
    rendimientoNetoCent: amortizacionCent === null ? null : rendimientoAntesAmortizacionCent - amortizacionCent,
    gastosSinConfirmar: i.gastosSinConfirmar,
    avisos: i.avisos,
  }
}

/**
 * `amortizacion`: por inmueble, céntimos ANUALES si hay dato; ausente o `null` = sin dato. Un número ≤ 0 tampoco es un dato.
 * Sin edificios con unidades en `meta`, el informe es el de siempre (`edificios: []`).
 */
export function informeFiscal(
  r: ResultadoRentabilidad,
  meta: readonly MetaInmueble[],
  periodo: { anio: number; enCurso: boolean },
  amortizacion: ReadonlyMap<string, number | null> = new Map(),
): InformeFiscal {
  const nombre = new Map(meta.map((m) => [m.id, m]))
  // Edificios con al menos una unidad en la lista (el edificio también tiene que estar: si no, la unidad va suelta).
  const unidadesDe = new Map<string, string[]>()
  for (const m of meta) {
    if (m.edificioId && nombre.has(m.edificioId) && m.edificioId !== m.id) unidadesDe.set(m.edificioId, [...(unidadesDe.get(m.edificioId) ?? []), m.id])
  }
  const agrupados = new Set([...unidadesDe.keys(), ...[...unidadesDe.values()].flat()])
  const porId = new Map(r.inmuebles.map((i) => [i.inmuebleId, i]))

  const arrendados: InformeInmueble[] = []
  const sinIngresos: string[] = []
  for (const i of r.inmuebles) {
    const m = nombre.get(i.inmuebleId)
    if (!m || agrupados.has(i.inmuebleId)) continue
    if (i.ingresos <= 0) {
      sinIngresos.push(m.alias)
      continue
    }
    arrendados.push(informeDe(i, m, amortizacion))
  }

  const edificios: InformeEdificio[] = []
  for (const [edId, ids] of unidadesDe) {
    const mEd = nombre.get(edId)!
    const unidades: InformeInmueble[] = []
    const unidadesSinIngresos: string[] = []
    for (const id of ids) {
      const i = porId.get(id)
      if (!i) continue
      if (i.ingresos <= 0) unidadesSinIngresos.push(nombre.get(id)!.alias)
      else unidades.push(informeDe(i, nombre.get(id)!, amortizacion))
    }
    const propio = porId.get(edId)
    const comunes = propio && (propio.ingresos > 0 || propio.gastos > 0 || propio.seguros > 0) ? informeDe(propio, mEd, new Map()) : null
    if (unidades.length === 0 && (comunes === null || comunes.ingresosCent <= 0)) {
      sinIngresos.push(mEd.alias)
      continue
    }
    const filas = comunes ? [...unidades, comunes] : unidades
    const suma = (k: 'ingresosCent' | 'totalDeducibleCent' | 'aRevisarCent' | 'noDirectoCent' | 'gastosSinConfirmar') => filas.reduce((a, f) => a + f[k], 0)
    const rendimientoAntesAmortizacionCent = suma('ingresosCent') - suma('totalDeducibleCent')
    const amortizacionCent = amortizacionDe(amortizacion, edId)
    edificios.push({
      edificioId: edId, alias: mEd.alias, titular: mEd.titular, referenciaCatastral: mEd.referenciaCatastral ?? null,
      unidades, unidadesSinIngresos, comunes,
      ingresosCent: suma('ingresosCent'), totalDeducibleCent: suma('totalDeducibleCent'), aRevisarCent: suma('aRevisarCent'), noDirectoCent: suma('noDirectoCent'),
      rendimientoAntesAmortizacionCent,
      amortizacionCent,
      rendimientoNetoCent: amortizacionCent === null ? null : rendimientoAntesAmortizacionCent - amortizacionCent,
      gastosSinConfirmar: suma('gastosSinConfirmar') + (comunes === null ? (propio?.gastosSinConfirmar ?? 0) : 0),
      avisos: [...new Set(filas.flatMap((f) => f.avisos))].sort(),
    })
  }
  return { anio: periodo.anio, enCurso: periodo.enCurso, desde: r.desde, hasta: r.hasta, arrendados, edificios, sinIngresos, sinImputarCent: r.sinImputar }
}

// ─── CSV ───────────────────────────────────────────────────────────────────────────────────────────────

/** Celda segura: comillas dobles escapadas y, si empieza por `= + - @` o control, se antepone `'` (inyección de fórmulas). */
export function celdaCsv(v: string): string {
  let t = v.replace(/[\r\n]+/g, ' ')
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** Céntimos → `1234,56` (coma decimal, sin separador de miles: Excel en español lo lee como número). `null` → vacío. */
export const importeCsv = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','))

const ETIQUETA_TRATAMIENTO: Record<Tratamiento, string> = { deducible: 'Deducible', a_revisar: 'A revisar con tu asesor', no_directo: 'No directo (se amortiza)' }

/** CSV con `;` y BOM (para Excel), una fila por concepto. Lo que no consta sale con «sin dato», jamás 0. */
export function csvFiscal(inf: InformeFiscal): string {
  const filas: string[][] = [['Año', 'Inmueble', 'Titular', 'Concepto', 'Tratamiento', 'Importe (EUR)', 'Nota']]
  const fila = (i: InformeInmueble, concepto: string, tratamiento: string, importe: string, nota = '') =>
    filas.push([String(inf.anio), i.alias, i.titular, concepto, tratamiento, importe, nota])
  const inmueble = (i: InformeInmueble) => {
    fila(i, 'Ingresos íntegros (renta devengada)', 'Ingreso', importeCsv(i.ingresosCent))
    for (const l of i.lineas) fila(i, l.etiqueta, ETIQUETA_TRATAMIENTO[l.tratamiento], importeCsv(l.importeCent), l.nota ?? '')
    fila(i, 'Total gastos deducibles', '', importeCsv(i.totalDeducibleCent))
    fila(i, 'Rendimiento antes de amortización', '', importeCsv(i.rendimientoAntesAmortizacionCent))
    fila(i, 'Amortización estimada', '', i.amortizacionCent === null ? 'sin dato' : importeCsv(i.amortizacionCent), i.amortizacionCent === null ? 'No guardamos el coste de adquisición ni el valor catastral' : '')
    fila(i, 'Rendimiento neto', '', i.rendimientoNetoCent === null ? 'sin dato' : importeCsv(i.rendimientoNetoCent), i.rendimientoNetoCent === null ? 'Falta la amortización' : '')
  }
  for (const i of inf.arrendados) inmueble(i)
  // Edificio: cada unidad como «Edificio · Unidad», lo no repartido como «Edificio · Gastos comunes» y el TOTAL de la RC.
  for (const e of inf.edificios) {
    const rc = e.referenciaCatastral ? `RC ${e.referenciaCatastral}` : 'Referencia catastral: sin dato'
    for (const u of e.unidades) inmueble({ ...u, alias: `${e.alias} · ${u.alias}` })
    if (e.comunes) inmueble({ ...e.comunes, alias: `${e.alias} · Gastos comunes sin repartir` })
    const tot = (concepto: string, importe: string, nota = '') => filas.push([String(inf.anio), e.alias, e.titular, concepto, 'Total del edificio', importe, nota])
    tot('Ingresos íntegros del edificio', importeCsv(e.ingresosCent), rc)
    tot('Total gastos deducibles del edificio', importeCsv(e.totalDeducibleCent), rc)
    tot('Rendimiento antes de amortización del edificio', importeCsv(e.rendimientoAntesAmortizacionCent), rc)
    tot('Rendimiento neto del edificio', e.rendimientoNetoCent === null ? 'sin dato' : importeCsv(e.rendimientoNetoCent), e.rendimientoNetoCent === null ? 'Falta la amortización' : rc)
  }
  filas.push([String(inf.anio), '', '', AVISO_ORIENTATIVO, '', '', inf.enCurso ? `Ejercicio en curso: datos hasta el ${inf.hasta.split('-').reverse().join('/')}` : ''])
  return '﻿' + filas.map((f) => f.map(celdaCsv).join(';')).join('\r\n') + '\r\n'
}
