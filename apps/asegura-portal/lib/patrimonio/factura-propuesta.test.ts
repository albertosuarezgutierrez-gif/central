import { test } from 'node:test'
import assert from 'node:assert/strict'

import { eurosLeidosACentimos, leerPropuestaGuardada, normalizarFacturaLeida, PROPUESTA_VACIA } from './factura-propuesta.ts'

test('una factura completa se normaliza a céntimos y sin motivos de lectura', () => {
  const { propuesta, motivos } = normalizarFacturaLeida({
    proveedor: ' Endesa  Energía ', nif_proveedor: 'A81948077', fecha: '2026-10-03', base_imponible: 100, iva: 21, total: 121, concepto: 'Luz septiembre', categoria: 'SUMINISTROS',
  })
  assert.deepEqual(propuesta, { proveedor: 'Endesa Energía', nifProveedor: 'A81948077', fecha: '2026-10-03', baseCent: 10000, ivaCent: 2100, retencionCent: null, totalCent: 12100, concepto: 'Luz septiembre', categoria: 'SUMINISTROS' })
  assert.deepEqual(motivos, [])
})

test('valores de cajón (OTRO, N/A, 0, vacío) se anulan a null: nunca un 0 inventado', () => {
  const { propuesta, motivos } = normalizarFacturaLeida({ proveedor: 'N/A', nif_proveedor: 'desconocido', fecha: 'sin datos', base_imponible: 0, iva: 0, total: 0, concepto: '', categoria: 'OTRO' })
  assert.deepEqual(propuesta, PROPUESTA_VACIA)
  assert.ok(motivos.some((m) => /categor/i.test(m)) && motivos.some((m) => /total/i.test(m)))
  assert.equal(normalizarFacturaLeida({ categoria: 'otro' }).propuesta.categoria, null)
})

test('JSON inservible (null, texto, array) devuelve todo a null y no lanza', () => {
  for (const x of [null, undefined, 'hola', 42, []]) assert.deepEqual(normalizarFacturaLeida(x).propuesta, PROPUESTA_VACIA)
})

test('importes: negativos, NaN y texto no son importe; «1.234,56» sí', () => {
  assert.equal(eurosLeidosACentimos(-5), null)
  assert.equal(eurosLeidosACentimos(Number.NaN), null)
  assert.equal(eurosLeidosACentimos('abc'), null)
  assert.equal(eurosLeidosACentimos('1.234,56'), 123456)
  assert.equal(eurosLeidosACentimos(0.1 + 0.2), 30)
})

test('fecha dd/mm/aaaa se convierte; una imposible o NIF malformado se descartan con motivo', () => {
  assert.equal(normalizarFacturaLeida({ fecha: '03/10/2026' }).propuesta.fecha, '2026-10-03')
  assert.equal(normalizarFacturaLeida({ fecha: '2026-02-31' }).propuesta.fecha, null)
  const r = normalizarFacturaLeida({ nif_proveedor: '1234' })
  assert.equal(r.propuesta.nifProveedor, null)
  assert.ok(r.motivos.some((m) => /NIF/.test(m)))
})

test('base + IVA que no suman el total se avisa sin corregir', () => {
  const { propuesta, motivos } = normalizarFacturaLeida({ base_imponible: 100, iva: 21, total: 150 })
  assert.equal(propuesta.totalCent, 15000)
  assert.ok(motivos.some((m) => /suman/.test(m)))
})

test('retención de IRPF: se lee y la factura con retención cuadra (sin aviso de importes)', () => {
  const { propuesta, motivos } = normalizarFacturaLeida({ base_imponible: 1000, iva: 210, retencion: 150, total: 1060 })
  assert.equal(propuesta.retencionCent, 15000)
  assert.ok(!motivos.some((m) => /suman/.test(m)))
  // La misma factura SIN retención leída sí avisa: 1000 + 210 ≠ 1060.
  assert.ok(normalizarFacturaLeida({ base_imponible: 1000, iva: 210, total: 1060 }).motivos.some((m) => /suman/.test(m)))
  assert.equal(normalizarFacturaLeida({ retencion: 0 }).propuesta.retencionCent, null)
  assert.ok(normalizarFacturaLeida({ base_imponible: 100, retencion: 150, total: 50 }).motivos.some((m) => /retención leída es mayor/.test(m)))
})

test('miles españoles sin coma: «1.234» son 1234 €, «12.50» son 12,50 €', () => {
  assert.equal(eurosLeidosACentimos('1.234'), 123400)
  assert.equal(eurosLeidosACentimos('1.234.567'), 123456700)
  assert.equal(eurosLeidosACentimos('12.50'), 1250)
  assert.equal(eurosLeidosACentimos('12.5'), 1250)
  assert.equal(eurosLeidosACentimos('1.234,56'), 123456)
  assert.equal(eurosLeidosACentimos(1.234), 123)
  assert.equal(eurosLeidosACentimos('1234.56'), 123456)
})

test('propuesta guardada: la fecha sin leer sigue siendo null; filas antiguas o corruptas no rompen ni inventan 0', () => {
  const g = leerPropuestaGuardada({ fuente: 'texto', motivos: ['x', 3], leido: { proveedor: 'Luz SA', fecha: null, baseCent: 10000, totalCent: 12100, categoria: 'OTRO' } })
  assert.equal(g.propuesta.fecha, null)
  assert.equal(g.propuesta.retencionCent, null)
  assert.equal(g.propuesta.categoria, null)
  assert.equal(g.propuesta.totalCent, 12100)
  assert.deepEqual(g.motivos, ['x'])
  for (const x of [null, 'texto', [], { leido: 7 }, { leido: { totalCent: 0, baseCent: -1, fecha: '2026-02-31' } }]) {
    const r = leerPropuestaGuardada(x)
    assert.equal(r.fuente, 'none')
    assert.deepEqual(r.propuesta, PROPUESTA_VACIA)
  }
})
