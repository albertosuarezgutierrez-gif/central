// generarFechasRecurrente: el día 31 no desborda al mes siguiente ni arrastra el recorte, y no depende del huso.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { generarFechasRecurrente } from '../src/recurrentes.ts'

const plantilla = (inicio: string, periodicidad: 'mensual' | 'trimestral' | 'semestral' | 'anual') => ({
  tipo: 'gasto' as const,
  base_imponible: 0,
  porcentaje_iva: 0,
  periodicidad,
  fecha_inicio: new Date(`${inicio}T12:00:00Z`),
})
const dias = (f: Date[]) => f.map((d) => d.toISOString().slice(0, 10))

test('mensual desde el 31/01: recorta al último día del mes y vuelve al 31 (no 03/03, no 28/03)', () => {
  const r = generarFechasRecurrente(plantilla('2026-01-31', 'mensual'), new Date('2026-05-31T23:00:00Z'))
  assert.deepEqual(dias(r), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
})

test('trimestral y anual desde un día que no existe en el mes destino', () => {
  assert.deepEqual(dias(generarFechasRecurrente(plantilla('2026-11-30', 'trimestral'), new Date('2027-06-30T23:00:00Z'))), ['2026-11-30', '2027-02-28', '2027-05-30'])
  assert.deepEqual(dias(generarFechasRecurrente(plantilla('2024-02-29', 'anual'), new Date('2028-03-01T00:00:00Z'))), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
})

test('respeta fecha_fin y una fecha inválida no entra en bucle', () => {
  const p = { ...plantilla('2026-01-15', 'mensual'), fecha_fin: new Date('2026-03-01T00:00:00Z') }
  assert.deepEqual(dias(generarFechasRecurrente(p, new Date('2026-12-31T00:00:00Z'))), ['2026-01-15', '2026-02-15'])
  assert.deepEqual(generarFechasRecurrente(plantilla('2026-01-15', 'mensual'), new Date('nope')), [])
})
