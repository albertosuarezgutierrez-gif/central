// Tests de la lógica PURA de duplicados. Runner: `node --test` (type-stripping). Sin BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarConfianza, superaUmbralBanner, esRecurrente, agruparDuplicados, codigosDocumento, codigosDocContradicen, type DupPar } from './duplicados.ts'

test('clasificarConfianza: recibo/transferencia mismo día = alta', () => {
  assert.equal(clasificarConfianza('RECIBO EXCMO AYUNTAMIENTO IBI', true), 'alta')
  assert.equal(clasificarConfianza('TRANSFERENCIA A PROVEEDOR', true), 'alta')
  assert.equal(clasificarConfianza('ADEUDO DOMICILIADO LUZ', true), 'alta')
})

test('clasificarConfianza: compra física o distinto día = baja', () => {
  assert.equal(clasificarConfianza('COMPRA EN HORNO NUEVA FLORIDA', true), 'baja')   // no es recibo
  assert.equal(clasificarConfianza('RECIBO IBI', false), 'baja')                     // recibo pero distinto día
})

test('superaUmbralBanner', () => {
  assert.equal(superaUmbralBanner(-3, 'baja', 5), false)    // micro-gasto de baja confianza
  assert.equal(superaUmbralBanner(-3, 'alta', 5), true)     // alta siempre supera
  assert.equal(superaUmbralBanner(-172, 'baja', 5), true)   // baja por encima del umbral
})

test('esRecurrente: ≥2 cargos/mes', () => {
  assert.equal(esRecurrente(12, 60), true)
  assert.equal(esRecurrente(2, 60), false)
})

const par = (o: Partial<DupPar>): DupPar => ({
  id: 'a', otroId: 'b', concepto: 'X', otroConcepto: 'X', importe: -10,
  fecha: '2026-06-10', otroFecha: '2026-06-11', conciliado: false, otroConciliado: false,
  contraparteKey: 'X', ...o,
})

test('agruparDuplicados: consolida un par en un grupo con ambos movimientos', () => {
  const grupos = agruparDuplicados([par({ id: 'a', otroId: 'b' })])
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].movimientos.length, 2)
})

test('agruparDuplicados: recibo IBI mismo día = alta y supera umbral', () => {
  const [g] = agruparDuplicados([par({
    concepto: 'RECIBO IBI', otroConcepto: 'RECIBO IBI', contraparteKey: 'AYUNTAMIENTO',
    importe: -172, fecha: '2026-06-10', otroFecha: '2026-06-10',
  })])
  assert.equal(g.confianza, 'alta')
  assert.equal(g.superaUmbral, true)
})

test('agruparDuplicados: pan de 3€ días distintos = baja y NO supera umbral', () => {
  const [g] = agruparDuplicados([par({
    concepto: 'COMPRA HORNO', otroConcepto: 'COMPRA HORNO', contraparteKey: 'HORNO',
    importe: -3, fecha: '2026-06-10', otroFecha: '2026-06-11',
  })])
  assert.equal(g.confianza, 'baja')
  assert.equal(g.superaUmbral, false)
})

test('agruparDuplicados: contraparte recurrente degrada a baja aunque sea recibo mismo día', () => {
  const [g] = agruparDuplicados([par({
    concepto: 'RECIBO PARKING', otroConcepto: 'RECIBO PARKING', contraparteKey: 'PARKING',
    importe: -50, fecha: '2026-06-10', otroFecha: '2026-06-10', ocurrenciasContraparte: 12,
  })])
  assert.equal(g.confianza, 'baja')
})

test('codigosDocumento: extrae nº de recibo / expediente / tiradas largas', () => {
  assert.deepEqual(codigosDocumento('RECIBO EXCMO. AYUNTAMIEN IBI EXPTE202200037442 RECIBO202601173193'),
    ['202200037442', '202601173193'])
  assert.deepEqual(codigosDocumento('COMPRA EN MERCADONA'), [])  // sin códigos
})

test('codigosDocContradicen: 2 recibos con nº distinto = documentos distintos', () => {
  assert.equal(codigosDocContradicen(
    'RECIBO AYUNTAMIEN IBI EXPTE202200037442 RECIBO202601173193',
    'RECIBO AYUNTAMIEN IBI EXPTE202200037441 RECIBO202601173194'), true)
  // Mismo recibo (mismo documento) → NO contradicen
  assert.equal(codigosDocContradicen('RECIBO 202601173193', 'RECIBO 202601173193'), false)
  // Uno sin código → no se puede afirmar
  assert.equal(codigosDocContradicen('RECIBO 202601173193', 'COMPRA EN BAR'), false)
})

test('agruparDuplicados: 2 IBI mismo importe/día pero RECIBO distinto NO es duplicado (no sale)', () => {
  const grupos = agruparDuplicados([par({
    concepto: 'RECIBO IBI', otroConcepto: 'RECIBO IBI', contraparteKey: 'AYUNTAMIENTO',
    importe: -171.55, fecha: '2026-06-02', otroFecha: '2026-06-02',
    conceptoRaw: 'RECIBO EXCMO. AYUNTAMIEN IBI EXPTE202200037442 RECIBO202601173193',
    otroConceptoRaw: 'RECIBO EXCMO. AYUNTAMIEN IBI EXPTE202200037441 RECIBO202601173194',
  })])
  assert.equal(grupos.length, 0)  // filtrado: son 2 recibos reales, no un cobro doble
})

test('agruparDuplicados: mismo RECIBO importado dos veces SÍ es duplicado (sale)', () => {
  const grupos = agruparDuplicados([par({
    concepto: 'RECIBO IBI', otroConcepto: 'RECIBO IBI', contraparteKey: 'AYUNTAMIENTO',
    importe: -171.55, fecha: '2026-06-02', otroFecha: '2026-06-02',
    conceptoRaw: 'RECIBO AYUNTAMIEN IBI RECIBO202601173193',
    otroConceptoRaw: 'RECIBO AYUNTAMIEN IBI RECIBO202601173193',
  })])
  assert.equal(grupos.length, 1)  // mismo documento → sigue siendo sospechoso
})
