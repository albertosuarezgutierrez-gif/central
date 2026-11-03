// Importes SINTÉTICOS: ni nombres ni NIF de clientes.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claseAllianzPorNombre, leerLiquidacion, esLiquidacionInequivoca, importe, driveFileId, fusionarExtractosPdf,
  type FilaLibro, type DocGuardado,
} from './liquidacion-doc.ts'

test('regla Allianz por prefijo: ADYP extracto, ADXP aviso, AMYA cartera prevista', () => {
  assert.equal(claseAllianzPorNombre('ADYP_261031_A0000000_1.pdf'), 'extracto')
  assert.equal(claseAllianzPorNombre('ADXP_261015_A0000000_9.pdf'), 'aviso_recibo')
  assert.equal(claseAllianzPorNombre('AMYA_261101_A0000000.pdf'), 'cartera_prevista')
  assert.equal(claseAllianzPorNombre('liquidacion-octubre.pdf'), null)
})

test('AMYA no se guarda (cartera prevista, no cobrada)', () => {
  assert.equal(leerLiquidacion({ liquidacion: { bruto: 100, retencion: 15, neto: 85 } }, 'AMYA_261101_A0000000.pdf'), null)
})

test('ADYP: Allianz C0109, nº documento = nombre del fichero, aritmética comprobada', () => {
  const l = leerLiquidacion({
    proveedor: 'Allianz Seguros',
    liquidacion: { periodo_inicio: '2026-10-01', periodo_fin: '2026-10-31', bruto: 200, retencion: 30, otros_descuentos: 0, neto: 170, saldo_anterior: 12.5 },
  }, 'ADYP_261031_A0000000_1.pdf')
  assert.ok(l)
  assert.equal(l.clase, 'extracto')
  assert.equal(l.companiaCodigo, 'C0109')
  assert.equal(l.companiaClave, 'C0109')
  assert.equal(l.numeroDocumento, 'ADYP_261031_A0000000_1')
  assert.deepEqual([l.bruto, l.retencion, l.otrosDescuentos, l.neto, l.saldoAnterior], [200, 30, 0, 170, 12.5])
  assert.equal(l.aritmeticaOk, true)
})

test('campos ausentes son null, nunca 0; sin importes la aritmética es «no se sabe»', () => {
  const l = leerLiquidacion({ proveedor: 'Mapfre España', liquidacion: { bruto: 50 } }, 'liq.pdf')
  assert.ok(l)
  assert.equal(l.retencion, null)
  assert.equal(l.neto, null)
  assert.equal(l.otrosDescuentos, null)
  assert.equal(l.aritmeticaOk, null)
  assert.equal(l.companiaCodigo, 'C0058')
})

test('compañía sin código DGS: se guarda por nombre (clave en minúsculas), sin código', () => {
  const l = leerLiquidacion({ proveedor: 'Caser Seguros', numero_factura: 'L-77', liquidacion: { bruto: 10, retencion: 1.5, neto: 8.5 } })
  assert.ok(l)
  assert.equal(l.compania, 'Caser')
  assert.equal(l.companiaCodigo, null)
  assert.equal(l.companiaClave, 'caser')
  assert.equal(l.numeroDocumento, 'L-77')
})

test('aritmética que no cuadra se marca false (no se corrige)', () => {
  const l = leerLiquidacion({ proveedor: 'Generali', liquidacion: { bruto: 100, retencion: 15, neto: 80 } })
  assert.equal(l?.aritmeticaOk, false)
})

test('respaldo base/irpf/total solo si cuadran al céntimo', () => {
  const ok = leerLiquidacion({ proveedor: 'Reale', base_imponible: 40, irpf: 6, total: 34 })
  assert.deepEqual([ok?.bruto, ok?.retencion, ok?.neto], [40, 6, 34])
  const no = leerLiquidacion({ proveedor: 'Reale', base_imponible: 40, irpf: 0, total: 34 })
  assert.deepEqual([no?.bruto, no?.retencion, no?.neto], [null, null, null])
})

test('el periodo no se inventa: inválido o ausente = null', () => {
  const l = leerLiquidacion({ proveedor: 'Allianz', fecha: '2026-10-31', liquidacion: { periodo_inicio: '2026-10-31', periodo_fin: '2026-10-01' } }, 'ADYP_x.pdf')
  assert.equal(l?.periodoInicio, null)
  assert.equal(l?.periodoFin, null)
  const es = leerLiquidacion({ proveedor: 'Allianz', liquidacion: { periodo_inicio: '01/09/2026', periodo_fin: '30/09/2026' } }, 'ADYP_y.pdf')
  assert.equal(es?.periodoInicio, '2026-09-01')
})

test('inequívoca solo con retención > 0 y aritmética que cuadra', () => {
  assert.equal(esLiquidacionInequivoca(leerLiquidacion({ proveedor: 'Asisa', liquidacion: { bruto: 20, retencion: 3, neto: 17 } })), true)
  assert.equal(esLiquidacionInequivoca(leerLiquidacion({ proveedor: 'Asisa', liquidacion: { bruto: 20, retencion: 0, neto: 20 } })), false)
  assert.equal(esLiquidacionInequivoca(leerLiquidacion({ proveedor: 'Asisa', liquidacion: { bruto: 20, retencion: 3, neto: 15 } })), false)
  assert.equal(esLiquidacionInequivoca(null), false)
})

test('importe: español, número y basura', () => {
  assert.equal(importe('1.234,56'), 1234.56)
  assert.equal(importe('-12,30 €'), -12.3)
  assert.equal(importe(0), 0)
  assert.equal(importe(''), null)
  assert.equal(importe('n/d'), null)
  assert.equal(importe(null), null)
})

test('driveFileId', () => {
  assert.equal(driveFileId('https://drive.google.com/file/d/AbC_12-x/view'), 'AbC_12-x')
  assert.equal(driveFileId(null), null)
})

// ── Fusión con el libro ─────────────────────────────────────────────────────

const cima = (codigo: string, inicio: string, fin: string, bruto: number | null): FilaLibro =>
  ({ codigo, inicio, fin, bruto, ret: bruto == null ? null : 1, remesa: bruto == null ? null : bruto - 1, hash: 'x', origen: 'cima' })
const doc = (p: Partial<DocGuardado>): DocGuardado => ({
  companiaCodigo: 'C0058', clase: 'extracto', numeroDocumento: 'D1', periodoInicio: '2026-09-01', periodoFin: '2026-09-30',
  fechaDocumento: '2026-10-05', bruto: 100, retencion: 15, neto: 85, aritmeticaOk: true, ...p,
})

test('un extracto PDF rellena un periodo que CIMA no cubre (origen pdf, remesa = neto)', () => {
  const r = fusionarExtractosPdf([], [doc({})])
  assert.equal(r.filas.length, 1)
  assert.deepEqual(r.filas[0], { codigo: 'C0058', inicio: '2026-09-01', fin: '2026-09-30', bruto: 100, ret: 15, remesa: 85, hash: 'pdf:D1', origen: 'pdf' })
  assert.deepEqual(r.usados, ['D1'])
})

test('CIMA manda: un PDF nunca pisa ni duplica un periodo con liquidación de CIMA', () => {
  const r = fusionarExtractosPdf([cima('C0109', '2026-09-01', '2026-10-01', 94)], [doc({ companiaCodigo: 'C0109', numeroDocumento: 'ADYP_1' })])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].origen, 'cima')
  assert.deepEqual(r.noUsados, [{ numeroDocumento: 'ADYP_1', motivo: 'cima-manda' }])
})

test('lo confirmado a mano tampoco lo pisa un PDF', () => {
  const r = fusionarExtractosPdf([], [doc({})], [{ codigo: 'C0058', inicio: '2026-09-01', fin: '2026-09-30' }])
  assert.equal(r.filas.length, 0)
  assert.deepEqual(r.noUsados, [{ numeroDocumento: 'D1', motivo: 'manual-manda' }])
})

test('rellena la fila exacta de CIMA que vino sin importe', () => {
  const r = fusionarExtractosPdf([cima('C0058', '2026-09-01', '2026-09-30', null)], [doc({})])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].bruto, 100)
  assert.equal(r.filas[0].origen, 'pdf')
})

test('dos PDF del mismo periodo: solo cuenta el más reciente', () => {
  const r = fusionarExtractosPdf([], [doc({ numeroDocumento: 'VIEJO', fechaDocumento: '2026-10-01' }), doc({ numeroDocumento: 'NUEVO', fechaDocumento: '2026-10-09', bruto: 110, neto: 93.5 })])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].bruto, 110)
  assert.deepEqual(r.noUsados, [{ numeroDocumento: 'VIEJO', motivo: 'solapa-otro-pdf' }])
})

test('lecturas dudosas no entran al libro: sin código, sin periodo, sin importes, aritmética', () => {
  const r = fusionarExtractosPdf([], [
    doc({ numeroDocumento: 'A', companiaCodigo: null }),
    doc({ numeroDocumento: 'B', periodoInicio: null }),
    doc({ numeroDocumento: 'C', neto: null }),
    doc({ numeroDocumento: 'E', aritmeticaOk: false }),
  ])
  assert.equal(r.filas.length, 0)
  assert.deepEqual(r.noUsados.map(n => n.motivo).sort(), ['aritmetica', 'sin-codigo', 'sin-importes', 'sin-periodo'])
})

test('ADXP nunca suma al libro; con extracto del mes ni siquiera es informativo', () => {
  const adxp = (n: string, bruto: number | null) => doc({ companiaCodigo: 'C0109', clase: 'aviso_recibo', numeroDocumento: n, periodoInicio: null, fechaDocumento: '2026-10-15', bruto })
  const conExtracto = fusionarExtractosPdf([cima('C0109', '2026-10-01', '2026-10-31', 50)], [adxp('X1', 10), adxp('X2', 5)])
  assert.equal(conExtracto.filas.length, 1)
  assert.equal(conExtracto.filas[0].bruto, 50)
  assert.deepEqual(conExtracto.informativos, [])

  const sinExtracto = fusionarExtractosPdf([], [adxp('X1', 10), adxp('X2', 5)])
  assert.equal(sinExtracto.filas.length, 0)
  assert.deepEqual(sinExtracto.informativos, [{ codigo: 'C0109', mes: '2026-10', bruto: 15, avisos: 2 }])

  const sinImporte = fusionarExtractosPdf([], [adxp('X1', 10), adxp('X2', null)])
  assert.equal(sinImporte.informativos[0].bruto, null)
})
