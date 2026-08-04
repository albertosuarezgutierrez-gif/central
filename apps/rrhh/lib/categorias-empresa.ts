// Categorías de la documentación de EMPRESA (no del trabajador).
// Módulo puro (sin prisma ni storage) para poder importarlo también desde
// componentes 'use client' — antes cada pantalla tenía su propia copia de la
// lista y se desincronizaban (p. ej. 'contrato' existía en /admin/empresa
// pero no en /admin/cuenta, donde se pintaba el id crudo).

/** Periodicidad del documento: determina qué campos de fecha pide el formulario. */
export type Periodo = 'ninguno' | 'anual' | 'mensual'

export type CategoriaEmpresa = { id: string; label: string; periodo: Periodo }

export const CATEGORIAS: readonly CategoriaEmpresa[] = [
  { id: 'cif', label: 'CIF', periodo: 'ninguno' },
  { id: 'escritura', label: 'Escritura', periodo: 'ninguno' },
  { id: 'seguro_social', label: 'Seguro Social (TC2)', periodo: 'mensual' },
  { id: 'poliza', label: 'Póliza de seguro', periodo: 'anual' },
  { id: 'contrato', label: 'Contrato', periodo: 'ninguno' },
  { id: 'mensual', label: 'Documentación mensual', periodo: 'mensual' },
  { id: 'otro', label: 'Otro', periodo: 'ninguno' },
]

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function categoriaDe(id: string): CategoriaEmpresa | undefined {
  return CATEGORIAS.find(c => c.id === id)
}

/** Periodicidad de una categoría. Una categoría desconocida (documento antiguo
 *  de una categoría ya retirada) no pide fechas, pero tampoco se oculta. */
export function periodoDe(id: string): Periodo {
  return categoriaDe(id)?.periodo ?? 'ninguno'
}

export function pideAnio(id: string): boolean {
  return periodoDe(id) !== 'ninguno'
}

export function pideMes(id: string): boolean {
  return periodoDe(id) === 'mensual'
}

/** Etiqueta legible; si el id no está en la lista se devuelve tal cual
 *  (mejor un id crudo visible que ocultar un documento que sí existe). */
export function etiquetaCategoria(id: string): string {
  return categoriaDe(id)?.label ?? id
}

/** Sufijo de periodo para mostrar junto a la categoría: "2026/03", "2026" o ''. */
export function sufijoPeriodo(anio: number | null, mes: number | null): string {
  if (!anio) return ''
  return mes ? `${anio}/${String(mes).padStart(2, '0')}` : String(anio)
}
