/**
 * Tablas salariales de convenio colectivo (forma de los datos + búsqueda). SIN datos dentro: cada convenio se carga desde
 * su publicación oficial (BOE/boletín autonómico) con su `fuente`. Importes en CÉNTIMOS.
 * Búsqueda fail-closed: convenio/año/categoría que no está → null («no se sabe»), nunca la del año anterior ni otra categoría.
 */
import { esCentimos, type Centimos } from './dinero'
import type { GrupoCotizacion } from './tipos'

export interface PlusConvenio {
  concepto: string
  importe: Centimos
  /** Periodicidad del importe. */
  periodicidad: 'mensual' | 'anual' | 'diaria' | 'hora'
}

export interface CategoriaConvenio {
  /** Código estable de la categoría o grupo profesional en el convenio (p. ej. «G2-N1»). */
  codigo: string
  nombre: string
  /** Grupo de cotización habitual de la categoría (orientativo: lo decide el contrato). null = no se sabe. */
  grupoCotizacion: GrupoCotizacion | null
  /** Salario base MENSUAL a jornada completa. */
  salarioBaseMensual: Centimos
  /** Número de pagas extraordinarias del convenio para la categoría (null = no se sabe). */
  pagasExtra: number | null
  /** Importe de cada paga extra (null = no se sabe; no se supone igual al salario base). */
  importePagaExtra: Centimos | null
  pluses: PlusConvenio[]
}

export interface TablaSalarial {
  /** Código de convenio (REGCON) o identificador interno estable. */
  convenio: string
  nombreConvenio: string
  /** Año de vigencia de la tabla. */
  año: number
  /** Ámbito: estatal, autonómico o provincial (texto libre del boletín). */
  ambito: string
  /** Publicación oficial (p. ej. «BOE-A-2026-xxxx, anexo II»). */
  fuente: string
  /** Vigencia (YYYY-MM-DD, inclusive). `vigenteHasta` null = hasta nueva tabla. */
  vigenteDesde: string
  vigenteHasta: string | null
  categorias: CategoriaConvenio[]
}

/** Errores de forma de una tabla (vacío = válida). */
export function validarTablaSalarial(t: TablaSalarial): string[] {
  const e: string[] = []
  if (!t.convenio.trim()) e.push('convenio vacío')
  if (!Number.isInteger(t.año)) e.push('año inválido')
  if (!t.fuente.trim()) e.push('sin fuente oficial')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.vigenteDesde)) e.push('vigenteDesde inválida')
  if (t.vigenteHasta !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(t.vigenteHasta) || t.vigenteHasta < t.vigenteDesde)) e.push('vigenteHasta inválida')
  const vistos = new Set<string>()
  for (const c of t.categorias) {
    if (vistos.has(c.codigo)) e.push(`categoría duplicada: ${c.codigo}`)
    vistos.add(c.codigo)
    if (!esCentimos(c.salarioBaseMensual) || c.salarioBaseMensual < 0) e.push(`${c.codigo}: salario base no es céntimos enteros ≥ 0`)
    if (c.importePagaExtra !== null && (!esCentimos(c.importePagaExtra) || c.importePagaExtra < 0)) e.push(`${c.codigo}: paga extra no es céntimos enteros ≥ 0`)
    for (const p of c.pluses) if (!esCentimos(p.importe) || p.importe < 0) e.push(`${c.codigo}: plus «${p.concepto}» no es céntimos enteros ≥ 0`)
  }
  return e
}

/**
 * Categoría de un convenio vigente en `fecha` (YYYY-MM-DD). Si varias tablas del mismo convenio cubren la fecha, gana la de
 * `vigenteDesde` más reciente. Sin coincidencia exacta de convenio + vigencia + código → null.
 */
export function buscarCategoria(
  tablas: TablaSalarial[],
  q: { convenio: string; fecha: string; codigoCategoria: string },
): { tabla: TablaSalarial; categoria: CategoriaConvenio } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.fecha)) throw new Error(`Fecha inválida: ${q.fecha}`)
  const vigentes = tablas
    .filter(t => t.convenio === q.convenio && t.vigenteDesde <= q.fecha && (t.vigenteHasta === null || q.fecha <= t.vigenteHasta))
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
  const tabla = vigentes[0]
  if (!tabla) return null
  const categoria = tabla.categorias.find(c => c.codigo === q.codigoCategoria)
  return categoria ? { tabla, categoria } : null
}

/** Categoría por convenio + AÑO exacto de la tabla. Ninguna → null; dos tablas del mismo año → error (dato ambiguo, usa la fecha). */
export function buscarCategoriaPorAño(
  tablas: TablaSalarial[],
  q: { convenio: string; año: number; codigoCategoria: string },
): { tabla: TablaSalarial; categoria: CategoriaConvenio } | null {
  const del = tablas.filter(t => t.convenio === q.convenio && t.año === q.año)
  if (del.length > 1) throw new Error(`Convenio ${q.convenio}: ${del.length} tablas para ${q.año}; busca por fecha`)
  const tabla = del[0]
  if (!tabla) return null
  const categoria = tabla.categorias.find(c => c.codigo === q.codigoCategoria)
  return categoria ? { tabla, categoria } : null
}
