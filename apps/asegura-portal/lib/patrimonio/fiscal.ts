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
import type { AvisoRentabilidad, ResultadoRentabilidad } from '@central/module-patrimonio'

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

export type InformeFiscal = {
  anio: number
  enCurso: boolean
  desde: string
  hasta: string
  /** Inmuebles con renta devengada en el año. */
  arrendados: InformeInmueble[]
  /** Alias de los inmuebles SIN ingresos en el año: no entran, y se dice. */
  sinIngresos: string[]
  /** Gastos del titular sin inmueble: no se reparten solos. */
  sinImputarCent: number
}

export type MetaInmueble = { id: string; alias: string; titular: string }

/**
 * `amortizacion`: por inmueble, céntimos ANUALES si hay dato; ausente o `null` = sin dato. Un número ≤ 0 tampoco es un dato.
 */
export function informeFiscal(
  r: ResultadoRentabilidad,
  meta: readonly MetaInmueble[],
  periodo: { anio: number; enCurso: boolean },
  amortizacion: ReadonlyMap<string, number | null> = new Map(),
): InformeFiscal {
  const nombre = new Map(meta.map((m) => [m.id, m]))
  const arrendados: InformeInmueble[] = []
  const sinIngresos: string[] = []
  for (const i of r.inmuebles) {
    const m = nombre.get(i.inmuebleId)
    if (!m) continue
    if (i.ingresos <= 0) {
      sinIngresos.push(m.alias)
      continue
    }
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
    const a = amortizacion.get(i.inmuebleId)
    const amortizacionCent = typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : null
    arrendados.push({
      inmuebleId: i.inmuebleId, alias: m.alias, titular: m.titular, ingresosCent: i.ingresos, lineas,
      totalDeducibleCent, aRevisarCent: suma('a_revisar'), noDirectoCent: suma('no_directo'),
      amortizacionCent,
      rendimientoAntesAmortizacionCent,
      rendimientoNetoCent: amortizacionCent === null ? null : rendimientoAntesAmortizacionCent - amortizacionCent,
      gastosSinConfirmar: i.gastosSinConfirmar,
      avisos: i.avisos,
    })
  }
  return { anio: periodo.anio, enCurso: periodo.enCurso, desde: r.desde, hasta: r.hasta, arrendados, sinIngresos, sinImputarCent: r.sinImputar }
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
  for (const i of inf.arrendados) {
    fila(i, 'Ingresos íntegros (renta devengada)', 'Ingreso', importeCsv(i.ingresosCent))
    for (const l of i.lineas) fila(i, l.etiqueta, ETIQUETA_TRATAMIENTO[l.tratamiento], importeCsv(l.importeCent), l.nota ?? '')
    fila(i, 'Total gastos deducibles', '', importeCsv(i.totalDeducibleCent))
    fila(i, 'Rendimiento antes de amortización', '', importeCsv(i.rendimientoAntesAmortizacionCent))
    fila(i, 'Amortización estimada', '', i.amortizacionCent === null ? 'sin dato' : importeCsv(i.amortizacionCent), i.amortizacionCent === null ? 'No guardamos el coste de adquisición ni el valor catastral' : '')
    fila(i, 'Rendimiento neto', '', i.rendimientoNetoCent === null ? 'sin dato' : importeCsv(i.rendimientoNetoCent), i.rendimientoNetoCent === null ? 'Falta la amortización' : '')
  }
  filas.push([String(inf.anio), '', '', AVISO_ORIENTATIVO, '', '', inf.enCurso ? `Ejercicio en curso: datos hasta el ${inf.hasta.split('-').reverse().join('/')}` : ''])
  return '﻿' + filas.map((f) => f.map(celdaCsv).join(';')).join('\r\n') + '\r\n'
}
