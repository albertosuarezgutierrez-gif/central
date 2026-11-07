// Lectura XLSX de la importación de empleados (SheetJS, la librería que ya usa la app para los informes). SERVIDOR.
// SOLO lectura: la plantilla se descarga en CSV (`plantillaCsv`), para no ampliar el uso de una versión con CVE abierta.
// Las reglas viven en `importar-empleados.ts` (puro); aquí solo se abre el libro y se pasa a matriz de celdas.
//
// ⚠️ `xlsx@0.18.5` (npm) tiene avisos conocidos al LEER ficheros manipulados (CVE-2023-30533, contaminación de prototipo;
// corregido en 0.19.3, que solo se publica en cdn.sheetjs.com). Mitigaciones aquí: solo usuarios con sesión de responsable,
// tope de tamaño antes de abrir, firma ZIP comprobada, sin fórmulas/estilos/HTML, solo la 1.ª hoja. Pendiente: actualizar
// (no hay otra librería XLSX en el monorepo; ver apps/rrhh/CLAUDE.md).
import * as XLSX from 'xlsx'
import { LIMITE_FILAS, esZip } from './importar-empleados'

/** 1.ª hoja del libro → matriz de celdas crudas (las fechas llegan como serie numérica y se convierten en el módulo puro). */
export function leerXlsx(bytes: Uint8Array): unknown[][] {
  if (!esZip(bytes)) throw new Error('El fichero no es un Excel .xlsx válido')
  const wb = XLSX.read(bytes, {
    type: 'array', cellFormula: false, cellHTML: false, cellStyles: false, cellDates: false, cellNF: false, sheetRows: LIMITE_FILAS + 2,
  })
  const nombre = wb.SheetNames[0]
  const ws = nombre ? wb.Sheets[nombre] : undefined
  if (!ws) throw new Error('El Excel no tiene hojas')
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })
}
