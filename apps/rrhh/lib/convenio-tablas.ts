// Tablas salariales del convenio metidas A MANO (migración 0033, `rrhh.convenio_tablas_salariales`). Reglas PURAS:
// validar una fila y proponer el salario base de un contrato por su categoría. Importes en CÉNTIMOS enteros.
// Sin fila del año/categoría (o con varias que no se pueden desempatar) = «no se sabe»: no se propone nada,
// nunca la tabla de otro año ni la primera que salga.

export type PagasConvenio = 12 | 14 | 15 | 16

export interface FilaTablaConvenio {
  id?: string
  convenio: string
  anio: number
  categoria: string
  salarioBaseCent: number
  /** null = no se sabe (no 0). */
  plusConvenioCent: number | null
  /** null = no se sabe (no 12). */
  pagas: PagasConvenio | null
}

const PAGAS: PagasConvenio[] = [12, 14, 15, 16]

/** Categoría comparable: sin espacios sobrantes y sin distinguir mayúsculas (mismo criterio que el índice único de la BD). */
export function normalizarCategoria(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** «1.234,56» / «1234.56» / «1234,5» → céntimos enteros. Sin float: se parte por el separador decimal. */
export function eurosTextoACentimos(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    return Math.round(v * 100)
  }
  if (typeof v !== 'string') return null
  let t = v.trim().replace(/\s|€/g, '')
  if (!t) return null
  // Formato español con miles: 1.234,56 → 1234,56
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '')
  const m = t.match(/^(\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const cent = Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
  return Number.isSafeInteger(cent) ? cent : null
}

/** Valida y normaliza una fila que llega del formulario. Lanza con un mensaje legible. */
export function parsearFilaConvenio(b: Record<string, unknown>): FilaTablaConvenio {
  const convenio = typeof b.convenio === 'string' ? b.convenio.trim() : ''
  if (!convenio || convenio.length > 200) throw new Error('Indica el convenio')
  const anio = Number(b.anio)
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('Año inválido')
  const categoria = typeof b.categoria === 'string' ? b.categoria.trim().replace(/\s+/g, ' ') : ''
  if (!categoria || categoria.length > 200) throw new Error('Indica la categoría')
  const salarioBaseCent = eurosTextoACentimos(b.salarioBase)
  if (salarioBaseCent === null || salarioBaseCent <= 0) throw new Error('Salario base inválido')
  let plusConvenioCent: number | null = null
  if (b.plusConvenio != null && b.plusConvenio !== '') {
    plusConvenioCent = eurosTextoACentimos(b.plusConvenio)
    if (plusConvenioCent === null || plusConvenioCent < 0) throw new Error('Plus de convenio inválido')
  }
  let pagas: PagasConvenio | null = null
  if (b.pagas != null && b.pagas !== '') {
    const p = Number(b.pagas)
    if (!PAGAS.includes(p as PagasConvenio)) throw new Error('Pagas debe ser 12, 14, 15 o 16')
    pagas = p as PagasConvenio
  }
  return { convenio, anio, categoria, salarioBaseCent, plusConvenioCent, pagas }
}

export type Propuesta =
  | { ok: true; fila: FilaTablaConvenio }
  | { ok: false; motivo: 'sin_categoria' | 'sin_tabla' | 'ambigua' }

/**
 * Salario de la tabla para la categoría del contrato y el AÑO de su vigencia. Si se conoce el convenio de la empresa, solo
 * sus filas; si no, vale únicamente si hay UNA fila para esa categoría y año (varias convenios → «ambigua», no se elige).
 */
export function proponerSalario(
  filas: FilaTablaConvenio[],
  q: { anio: number; categoria: string | null | undefined; convenio?: string | null },
): Propuesta {
  if (!q.categoria || !q.categoria.trim()) return { ok: false, motivo: 'sin_categoria' }
  const cat = normalizarCategoria(q.categoria)
  let c = filas.filter(f => f.anio === q.anio && normalizarCategoria(f.categoria) === cat)
  const conv = q.convenio?.trim()
  if (conv) c = c.filter(f => f.convenio.trim().toLowerCase() === conv.toLowerCase())
  if (!c.length) return { ok: false, motivo: 'sin_tabla' }
  if (c.length > 1) return { ok: false, motivo: 'ambigua' }
  return { ok: true, fila: c[0] }
}

/** Categorías (sin repetir) del año, para el desplegable del contrato. */
export function categoriasDelAnio(filas: FilaTablaConvenio[], anio: number): string[] {
  const vistas = new Map<string, string>()
  for (const f of filas) if (f.anio === anio && !vistas.has(normalizarCategoria(f.categoria))) vistas.set(normalizarCategoria(f.categoria), f.categoria)
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'))
}
