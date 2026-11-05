// Excel (.xlsx) con SheetJS (`xlsx`, como rrhh/ialimp/plataforma). El módulo se INYECTA (la ruta hace `await import('xlsx')`): este
// fichero no importa nada pesado y se puede probar con un doble. Importes: céntimos → euros SOLO aquí, en la frontera de exportación.
import type { Tabla } from './generar.ts'

export interface ModuloXlsx {
  utils: {
    aoa_to_sheet(datos: unknown[][]): Record<string, unknown>
    book_new(): unknown
    book_append_sheet(libro: unknown, hoja: unknown, nombre: string): void
  }
  write(libro: unknown, opciones: { type: 'buffer'; bookType: 'xlsx' }): Uint8Array
}

const FORMATO_EUR = '#,##0.00 "€"'

export function aXlsx(t: Tabla, XLSX: ModuloXlsx): Uint8Array {
  const filas = [...t.filas, ...(t.totales ? [t.totales] : [])]
  const datos: unknown[][] = [
    [t.titulo], [t.subtitulo], [],
    t.columnas.map((c) => c.etiqueta),
    ...filas.map((f) => t.columnas.map((c) => {
      const v = f[c.clave] ?? null
      if (v === null) return null
      if (typeof v === 'number' && c.tipo === 'dinero') return { t: 'n', v: v / 100, z: FORMATO_EUR }
      if (typeof v === 'number') return { t: 'n', v }
      return { t: 's', v: c.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v }
    })),
    ...(t.avisos.length ? [[], ...t.avisos.map((a) => [a])] : []),
  ]
  const hoja = XLSX.utils.aoa_to_sheet(datos)
  hoja['!cols'] = t.columnas.map((c) => ({ wch: c.tipo === 'texto' ? 34 : 16 }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, t.titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
