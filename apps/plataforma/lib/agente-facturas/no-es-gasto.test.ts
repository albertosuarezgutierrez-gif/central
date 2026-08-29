import test from 'node:test'
import assert from 'node:assert/strict'
import { pareceIngresoDeCorreduria } from './no-es-gasto.ts'

test('los dos documentos REALES de Allianz que aparecieron en la bandeja (29/08/2026)', () => {
  const extracto = pareceIngresoDeCorreduria({
    proveedor: 'Allianz Seguros',
    concepto: 'Extracto de Cuenta Mediador. Mes de Julio de 2026',
  })
  assert.equal(extracto.esSospechoso, true)
  assert.match(extracto.motivo ?? '', /mediador/i)

  const anulacion = pareceIngresoDeCorreduria({
    proveedor: 'Allianz',
    concepto: 'Anulación de pólizas por impago',
  })
  assert.equal(anulacion.esSospechoso, true)
  assert.match(anulacion.motivo ?? '', /anulaci/i)
})

test('🚨 «comisión» a secas NO basta: la que cobra Booking SÍ es un gasto', () => {
  // El caso real que convive con el anterior en la misma bandeja: 938,25 € de Booking.com por
  // «servicio de los pagos y comisión por reservas». Marcarlo entrenaría a ignorar el aviso.
  const booking = pareceIngresoDeCorreduria({
    proveedor: 'Booking.com B.V.',
    concepto: 'Cargo por servicio de los pagos y comisión por reservas',
  })
  assert.equal(booking.esSospechoso, false)
})

test('gastos normales de la bandeja no se marcan', () => {
  for (const f of [
    { proveedor: 'SI QUE BRILLA SL', concepto: 'Limpieza apartamentos JUNIO (todos los pisos)' },
    { proveedor: 'IONOS Cloud S.L.U.', concepto: 'Tu factura con fecha de 01/08/2026' },
    { proveedor: 'Vercel Inc.', concepto: 'Pro plan' },
    { proveedor: 'Asecon', concepto: 'Honorarios asesoría julio' },
    { proveedor: null, concepto: null },
  ]) {
    assert.equal(pareceIngresoDeCorreduria(f).esSospechoso, false, `no debería marcar: ${f.proveedor}`)
  }
})

test('reconoce el vocabulario de mediación aunque cambie la compañía o el mes', () => {
  for (const c of [
    'EXTRACTO DE CUENTA MEDIADOR - AGOSTO',
    'Liquidación de comisiones 202607',
    'Saldo agente PD005',
    'Recibo de comisiones del trimestre',
  ]) {
    assert.equal(pareceIngresoDeCorreduria({ proveedor: 'Generali', concepto: c }).esSospechoso, true, c)
  }
})

test('la señal también se busca en el nombre del proveedor', () => {
  // El extractor a veces mete el título del documento en el campo proveedor.
  const s = pareceIngresoDeCorreduria({ proveedor: 'Extracto de cuenta mediador Occident', concepto: null })
  assert.equal(s.esSospechoso, true)
})

test('el tercer documento de Allianz: «Cartera No Vida» tampoco es un gasto', () => {
  const s = pareceIngresoDeCorreduria({
    proveedor: 'Allianz, Compañía de Seguros y Reaseguros, S.A.',
    concepto: 'Cartera No Vida del mes de Noviembre de 2026',
  })
  assert.equal(s.esSospechoso, true)
  assert.match(s.motivo ?? '', /cartera/i)
})

test('🚨 pero el SEGURO de un piso sigue siendo un gasto', () => {
  // Simétrico del caso Booking: si «Allianz» bastara, se marcaría el recibo del seguro del piso,
  // que es gasto deducible y llega del mismo emisor.
  for (const c of ['Recibo seguro hogar Calle Socorro 24', 'Póliza multirriesgo Luxury Busto - anualidad']) {
    assert.equal(pareceIngresoDeCorreduria({ proveedor: 'Allianz', concepto: c }).esSospechoso, false, c)
  }
})
