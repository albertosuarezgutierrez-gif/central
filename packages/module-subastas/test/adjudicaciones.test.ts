import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { calibracionAdjudicaciones } from '../src/adjudicaciones.ts'

const fila = (provincia: string, valor: number | null, importe: number | null, resultado: string | null) => ({
  provincia, valorSubasta: valor, importeAdjudicacion: importe, resultado,
})

test('sin resultados capturados no se publica nada', () => {
  assert.deepEqual(calibracionAdjudicaciones([]), [])
  assert.deepEqual(calibracionAdjudicaciones([fila('Sevilla', 100000, null, null)]), [])
})

test('mediana del ratio adjudicación/tipo por provincia + agregado', () => {
  const filas = [
    fila('Sevilla', 100000, 60000, 'adjudicada'),
    fila('Sevilla', 100000, 70000, 'adjudicada'),
    fila('Sevilla', 100000, 80000, 'adjudicada'),
    fila('Huelva', 50000, null, 'desierta'),
  ]
  const cal = calibracionAdjudicaciones(filas)
  const sevilla = cal.find((c) => c.provincia === 'Sevilla')!
  assert.equal(sevilla.muestra, 3)
  assert.equal(sevilla.adjudicadas, 3)
  assert.equal(sevilla.ratioMediano, 0.7)
  // Huelva no llega a la muestra mínima → solo sale en el agregado.
  assert.equal(cal.find((c) => c.provincia === 'Huelva'), undefined)
  const todas = cal.find((c) => c.provincia === '(todas)')!
  assert.equal(todas.muestra, 4)
  assert.equal(todas.desiertas, 1)
  assert.equal(todas.ratioMediano, 0.7)
})

test('una adjudicada sin importe cuenta en la muestra pero no en el ratio', () => {
  const cal = calibracionAdjudicaciones([
    fila('Cádiz', 100000, null, 'adjudicada'),
    fila('Cádiz', 100000, 50000, 'adjudicada'),
    fila('Cádiz', 0, 50000, 'adjudicada'),
  ])
  const cadiz = cal.find((c) => c.provincia === 'Cádiz')!
  assert.equal(cadiz.muestra, 3)
  assert.equal(cadiz.muestraRatio, 1)
  assert.equal(cadiz.ratioMediano, 0.5)
})

test('«con_pujas» (del certificado de cierre) calibra igual que «adjudicada»', () => {
  // El certificado real dice «concluyó con pujas (puja máxima X)» — para la
  // calibración ese remate ES la señal de mercado, igual que una adjudicada.
  const filas = [
    fila('Sevilla', 275206, 170627.72, 'con_pujas'),
    fila('Sevilla', 100000, 60000, 'con_pujas'),
    fila('Sevilla', 100000, 70000, 'adjudicada'),
  ]
  const sevilla = calibracionAdjudicaciones(filas).find((c) => c.provincia === 'Sevilla')!
  assert.equal(sevilla.adjudicadas, 3)
  assert.equal(sevilla.muestraRatio, 3)
})
