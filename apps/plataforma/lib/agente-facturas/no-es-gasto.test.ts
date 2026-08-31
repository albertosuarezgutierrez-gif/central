import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

test('«comisión» a secas NO basta: la señal de liquidación es el vocabulario de mediación', () => {
  // ⚠️ Este test AFIRMABA lo contrario («la comisión de Booking SÍ es un gasto, no marcarla») y
  // era una suposición mía equivocada, corregida por Alberto: Booking cobra por DESCUENTO y el
  // ingreso que contamos ya es neto, así que tampoco se contabiliza. Se conserva lo único cierto
  // de aquel test —que la señal de LIQUIDACIÓN de mediador no puede ser la palabra «comisión»—
  // con un proveedor al que sí se le paga la suya.
  const asesor = pareceIngresoDeCorreduria({
    proveedor: 'Asecon',
    concepto: 'Comisión por tramitación de expediente',
  })
  assert.equal(asesor.esSospechoso, false)
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

test('🚨 la comisión de Booking YA está descontada del ingreso: no se contabiliza aparte', () => {
  // El caso real de Alberto (4 facturas, 1.371,94 €). `lib/financiero.ts` suma `SUM(amount)` de
  // `incomes`, que es el NETO: confirmarla como gasto restaría la comisión dos veces.
  const s = pareceIngresoDeCorreduria({
    proveedor: 'Booking.com B.V.',
    concepto: 'Cargo por servicio de los pagos y comisión por reservas',
  })
  assert.equal(s.esSospechoso, true)
  assert.equal(s.tipo, 'ya_descontado')
  assert.match(s.motivo ?? '', /NETO/)
})

test('los dos motivos NO se confunden: uno es un ingreso, el otro un gasto ya contado', () => {
  const allianz = pareceIngresoDeCorreduria({ proveedor: 'Allianz', concepto: 'Extracto de Cuenta Mediador' })
  const booking = pareceIngresoDeCorreduria({ proveedor: 'Booking.com', concepto: 'comisión por reservas' })
  assert.equal(allianz.tipo, 'ingreso_correduria')
  assert.equal(booking.tipo, 'ya_descontado')
})

test('el concepto NORMALIZADO de la ingesta de Booking también se reconoce', () => {
  // `parseBooking` reescribe el concepto a «Comisión Booking.com <periodo>» antes de imputar,
  // así que la señal tiene que casar con ESE texto, no solo con el título del PDF original.
  const s = pareceIngresoDeCorreduria({
    proveedor: 'Booking.com',
    concepto: 'Comisión Booking.com 01/06/2026 – 30/06/2026',
  })
  assert.equal(s.esSospechoso, true)
  assert.equal(s.tipo, 'ya_descontado')
})

test('🚨 guardián: la ingesta (`procesar.ts`) consulta la señal ANTES de dar de alta el gasto', () => {
  // Estas facturas llenaban la bandeja cada mes («veo que aún aparecen», Alberto 30/08/2026):
  // el aviso en pantalla existía pero la ingesta seguía dándolas de alta. Si alguien retira la
  // llamada, este test lo canta — tsc no lo haría (quitar código válido sigue compilando).
  const fuente = readFileSync(join(import.meta.dirname, 'procesar.ts'), 'utf8')
  const llamada = fuente.indexOf('pareceIngresoDeCorreduria(')
  const alta = fuente.indexOf('insertarGasto(datos')
  assert.ok(llamada > 0, 'procesar.ts ya no llama a pareceIngresoDeCorreduria')
  assert.ok(alta > 0, 'no se encuentra insertarGasto en procesar.ts (¿renombrado? actualiza el guardián)')
  assert.ok(llamada < alta, 'la señal debe evaluarse ANTES de insertar el gasto')
})

test('🚨 exige LAS DOS señales: otro servicio de la plataforma sí se paga aparte', () => {
  // Booking también factura cosas que no son la comisión; marcarlas todas sería el ruido que
  // hace que se deje de leer el aviso.
  assert.equal(pareceIngresoDeCorreduria({ proveedor: 'Booking.com B.V.', concepto: 'Campaña de visibilidad patrocinada' }).esSospechoso, false)
  assert.equal(pareceIngresoDeCorreduria({ proveedor: 'Asecon', concepto: 'comisión de estudio' }).esSospechoso, false)
})
