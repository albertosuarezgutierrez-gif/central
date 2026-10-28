import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoCitasNoEncontradas, extraerCitas, verificarCitas } from './siniestro-citas.ts'

const POLIZA = `CONDICIONES GENERALES
Artículo 12. Exclusiones. Quedan excluidos los daños causados por el agua cuando
la tubería haya sido objeto de reparación pre-
via sin factura, así como los gastos de loca-
lización y reparación de la avería.
Artículo 13. El Asegurador abonará la INDEMNIZACIÓN en el plazo de cinco días.`

test('cita exacta: verificada', () => {
  const r = verificarCitas('Según «El Asegurador abonará la indemnización en el plazo de cinco días» procede.', POLIZA)
  assert.deepEqual(r.noEncontradas, [])
  assert.equal(r.verificadas.length, 1)
})

test('cita con saltos de línea, mayúsculas y guiones de corte distintos: verificada', () => {
  const r = verificarCitas('«daños causados por el agua cuando la tubería haya sido objeto de reparación previa sin factura» y «gastos de localización y reparación»', POLIZA)
  assert.deepEqual(r.noEncontradas, [])
  assert.equal(r.verificadas.length, 2)
})

test('cita inventada: no encontrada, y una palabra cambiada también', () => {
  const r = verificarCitas('«Se cubrirán todos los daños por agua sin excepción» y «abonará la indemnización en el plazo de tres días»', POLIZA)
  assert.equal(r.verificadas.length, 0)
  assert.equal(r.noEncontradas.length, 2)
})

test('sin texto de póliza nada se verifica; sin citas no hay nada que avisar', () => {
  assert.deepEqual(verificarCitas('«lo que sea»', '').noEncontradas, ['lo que sea'])
  assert.deepEqual(verificarCitas('sin citas', POLIZA), { verificadas: [], noEncontradas: [] })
  assert.equal(avisoCitasNoEncontradas([]), '')
})

test('puntos suspensivos: cada trozo tiene que existir; extraerCitas no repite', () => {
  assert.deepEqual(verificarCitas('«Quedan excluidos los daños … sin factura»', POLIZA).noEncontradas, [])
  assert.deepEqual(extraerCitas('«a» y «a» y «b»'), ['a', 'b'])
  assert.match(avisoCitasNoEncontradas(['x']), /⚠️ Estas citas NO aparecen en la póliza: «x»/)
})
