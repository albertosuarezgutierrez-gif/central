import test from 'node:test'
import assert from 'node:assert/strict'
import { hayMasDatos, cimaExtraTruncado, etiquetaCampo, valorCampo, vistaCimaExtra } from './cima-extra-vista.ts'

test('null ≠ []: ausente/no array → null; vacío → []', () => {
  assert.equal(vistaCimaExtra(undefined), null)
  assert.equal(vistaCimaExtra(null), null)
  assert.equal(vistaCimaExtra({}), null)
  assert.deepEqual(vistaCimaExtra([]), [])
})

test('agrupa por bloque padre quitando Poliza/DatosRiesgos/Riesgo', () => {
  const g = vistaCimaExtra([
    { ruta: 'Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Tara', valor: '1200' },
    { ruta: 'Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.AnioMatriculacion', valor: '2015' },
    { ruta: 'Poliza.Mediador.Codigo', valor: 'X1' },
    { ruta: 'Poliza.Suelto', valor: 'a' },
  ])
  assert.deepEqual(g, [
    { titulo: 'Vehiculo', filas: [{ etiqueta: 'Tara', valor: '1200' }, { etiqueta: 'Año matriculacion', valor: '2015' }] },
    { titulo: 'Mediador', filas: [{ etiqueta: 'Codigo', valor: 'X1' }] },
    { titulo: 'Datos generales', filas: [{ etiqueta: 'Suelto', valor: 'a' }] },
  ])
})

test('etiquetas: camelCase a palabras, Anio→Año, siglas intactas', () => {
  assert.equal(etiquetaCampo('FechaEfectoInicial'), 'Fecha efecto inicial')
  assert.equal(etiquetaCampo('Anio'), 'Año')
  assert.equal(etiquetaCampo('NumeroPlazasCV'), 'Numero plazas CV')
})

test('valores: fecha ISO a dd/mm/aaaa, centinelas fuera, resto tal cual', () => {
  assert.equal(valorCampo('2026-03-05'), '05/03/2026')
  assert.equal(valorCampo('2026-03-05T00:00:00Z'), '05/03/2026')
  assert.equal(valorCampo('1900-01-01'), null)
  assert.equal(valorCampo('9999-12-31'), null)
  assert.equal(valorCampo('1200'), '1200')
  assert.equal(valorCampo('1234.50'), '1234.50')
  assert.equal(valorCampo('  '), null)
})

test('un grupo cuyas filas son todas centinela desaparece; entradas basura se saltan', () => {
  const g = vistaCimaExtra([
    { ruta: 'Poliza.A.Fecha', valor: '9999-12-31' },
    { ruta: 5, valor: 'x' }, null, { ruta: 'Poliza.B.C', valor: {} },
    { ruta: 'Poliza.B.Fecha', valor: '2020-01-02' },
  ])
  assert.deepEqual(g, [{ titulo: 'B', filas: [{ etiqueta: 'Fecha', valor: '02/01/2020' }] }])
})

test('truncado solo si es literalmente true', () => {
  assert.equal(cimaExtraTruncado(true), true)
  assert.equal(cimaExtraTruncado('true'), false)
  assert.equal(cimaExtraTruncado(undefined), false)
})

test('hayMasDatos: null y [] no pintan fila; con datos sí', () => {
  assert.equal(hayMasDatos(null), false)
  assert.equal(hayMasDatos([]), false)
  assert.equal(hayMasDatos([{ titulo: 'x', filas: [] }]), false)
  assert.equal(hayMasDatos([{ titulo: 'x', filas: [{ etiqueta: 'a', valor: 'b' }] }]), true)
})
