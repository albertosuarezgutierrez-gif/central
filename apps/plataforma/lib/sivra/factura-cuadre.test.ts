import test from 'node:test'
import assert from 'node:assert/strict'
import {
  comprobarAritmetica, cuadrarFactura, esCorreoFacturaSique, esGuardable, limitesDelPeriodo,
  mensajeCuadre, parsearFacturaSique, periodoFacturado, type Salida,
} from './factura-cuadre.ts'
import { TEXTO_FACTURA_SEPTIEMBRE } from './factura-cuadre.fixture.ts'

const d = (propertyId: string, fecha: string): Salida => ({ propertyId, fecha })
const SEPT: Salida[] = [
  ...['03', '10', '17', '24'].map((x) => d('prop_luxury_busto', `2026-09-${x}`)),
  ...['02', '09', '16', '23', '30'].map((x) => d('prop_duplex_center', `2026-09-${x}`)),
  ...['01', '05', '12', '19', '22', '29'].map((x) => d('prop_house_sevillana', `2026-09-${x}`)),
  ...['04', '11', '25'].map((x) => d('prop_busto_reform', `2026-09-${x}`)),
]

test('parsea la factura real: nº, fecha, líneas, base, IVA y total', () => {
  const f = parsearFacturaSique(TEXTO_FACTURA_SEPTIEMBRE)!
  assert.equal(f.numero, '2025/421')
  assert.equal(f.fecha, '2026-10-03')
  assert.deepEqual([f.base, f.iva, f.total], [932.63, 195.85, 1128.48])
  assert.equal(f.lineas.length, 5)
  assert.deepEqual(f.lineas.map((l) => [l.propertyId, l.unidades, l.precio]).slice(0, 4), [
    ['prop_luxury_busto', 4, 28], ['prop_duplex_center', 5, 25], ['prop_house_sevillana', 6, 90], ['prop_busto_reform', 3, 20],
  ])
  assert.equal(f.lineas[4].tipo, 'lavanderia')
  assert.equal(f.lineas[4].total, 95.63)
  assert.deepEqual(comprobarAritmetica(f), [])
})

test('cuadra: 18 cambios = 18 salidas', () => {
  const r = cuadrarFactura(parsearFacturaSique(TEXTO_FACTURA_SEPTIEMBRE), '2026-09', SEPT)
  assert.equal(r.cuadra, true)
  assert.equal(esGuardable(r), true)
  assert.equal(mensajeCuadre(r), '✅ Factura Sique Brilla Septiembre 2026 cuadra: 18 cambios = 18 salidas, total 1.128,48€ (nº 2025/421)')
})

test('discrepancia por piso: detalle facturado vs salidas con fechas', () => {
  const sal = SEPT.filter((s) => !(s.propertyId === 'prop_house_sevillana' && s.fecha === '2026-09-29'))
  const r = cuadrarFactura(parsearFacturaSique(TEXTO_FACTURA_SEPTIEMBRE), '2026-09', sal)
  assert.equal(r.cuadra, false)
  assert.equal(esGuardable(r), true) // lo facturado es lo facturado
  const m = mensajeCuadre(r)
  assert.match(m, /⚠️ <b>Discrepancia<\/b>/)
  assert.match(m, /✖ House Sevillana: facturado 6 vs 5 salidas \(01\/09, 05\/09, 12\/09, 19\/09, 22\/09\)/)
  assert.match(m, /✔ Luxury Busto: facturado 4 vs 4 salidas/)
  assert.match(m, /18 cambios facturados vs 17 salidas/)
})

test('salida de un piso sin línea facturada es discrepancia', () => {
  const t = TEXTO_FACTURA_SEPTIEMBRE.replace(/14\tBUSTOS REFORMA\t3\t20,00 €\t0,00%\t21,00%\t60,00 € \n/, '')
    .replace('932,63', '872,63').replace('195,85', '183,25').replace('1.128,48', '1.055,88')
  const r = cuadrarFactura(parsearFacturaSique(t), '2026-09', SEPT)
  assert.equal(r.cuadra, false)
  assert.match(mensajeCuadre(r), /✖ Busto Reform: facturado 0 vs 3 salidas \(04\/09, 11\/09, 25\/09\)/)
})

test('línea desconocida: discrepancia, nunca se ignora, y no se guarda', () => {
  const t = TEXTO_FACTURA_SEPTIEMBRE.replace('SERVICIO DE LAVANDERIA 56.25KG X 1.70\t1\t95,63 €\t0,00%\t21,00%\t95,63 € \n',
    'SERVICIO DE LAVANDERIA 56.25KG X 1.70\t1\t95,63 €\t0,00%\t21,00%\t95,63 € \n17\tPISO NUEVO FANTASMA\t2\t30,00 €\t0,00%\t21,00%\t60,00 € \n')
  const r = cuadrarFactura(parsearFacturaSique(t), '2026-09', SEPT)
  assert.deepEqual(r.desconocidas, ['PISO NUEVO FANTASMA'])
  assert.equal(r.cuadra, false)
  assert.equal(esGuardable(r), false)
  assert.match(mensajeCuadre(r), /❓ Línea desconocida: «PISO NUEVO FANTASMA»/)
})

test('aritmética mal: unidades×precio, base, IVA y total', () => {
  const t = TEXTO_FACTURA_SEPTIEMBRE
    .replace('4\t28,00 €\t0,00%\t21,00%\t112,00 €', '4\t28,00 €\t0,00%\t21,00%\t110,00 €')
    .replace('IVA:\t195,85', 'IVA:\t190,00')
    .replace('Total:\t1.128,48', 'Total:\t1.130,00')
  const r = cuadrarFactura(parsearFacturaSique(t), '2026-09', SEPT)
  assert.equal(r.cuadra, false)
  assert.equal(esGuardable(r), false)
  const m = mensajeCuadre(r)
  assert.match(m, /LUXURY: 4 × 28,00€ = 112,00€, la factura pone 110,00€/)
  assert.match(m, /Base: las líneas suman 930,63€, la factura pone 932,63€/)
  assert.match(m, /IVA: el 21% de 932,63€ es 195,85€, la factura pone 190,00€/)
  assert.match(m, /Total: 932,63€ \+ 190,00€ = 1.122,63€, la factura pone 1.130,00€/)
})

test('PDF ilegible: «no he podido leer», jamás «cuadra»', () => {
  for (const t of [null, '', 'basura sin factura', TEXTO_FACTURA_SEPTIEMBRE.replace(/Nº factura:\s*\S+/, '')]) {
    const leida = parsearFacturaSique(t)
    assert.equal(leida, null)
    const r = cuadrarFactura(leida, '2026-09', SEPT)
    assert.equal(r.cuadra, false)
    assert.equal(esGuardable(r), false)
    const m = mensajeCuadre(r)
    assert.match(m, /No he podido leer la factura/)
    assert.doesNotMatch(m, /cuadra:/)
  }
})

test('periodo facturado: mes del asunto con el año de emisión; sin mes, el anterior', () => {
  assert.equal(periodoFacturado('FACTURA LIMPIEZAS SEPTIEMBRE', '2026-10-03'), '2026-09')
  assert.equal(periodoFacturado('Fwd: FACTURA LIMPIEZAS DICIEMBRE', '2027-01-02'), '2026-12')
  assert.equal(periodoFacturado('factura limpiezas', '2026-10-03'), '2026-09')
  assert.equal(periodoFacturado('factura', '2027-01-03'), '2026-12')
  assert.deepEqual(limitesDelPeriodo('2026-12'), { desde: '2026-12-01', hasta: '2027-01-01' })
})

test('remitente: solo la dirección exacta y con asunto de factura', () => {
  assert.equal(esCorreoFacturaSique('limpiezascruzz@gmail.com', 'FACTURA LIMPIEZAS SEPTIEMBRE'), true)
  assert.equal(esCorreoFacturaSique('otro@gmail.com', 'FACTURA LIMPIEZAS SEPTIEMBRE'), false)
  assert.equal(esCorreoFacturaSique('limpiezascruzz@gmail.com', 'hola'), false)
})

test('reservas sin fecha de salida: nunca ✅ limpio, aviso por piso', () => {
  const f = parsearFacturaSique(TEXTO_FACTURA_SEPTIEMBRE)
  const r = cuadrarFactura(f, '2026-09', SEPT, [{ propertyId: 'prop_duplex_center' }, { propertyId: 'prop_duplex_center' }])
  assert.equal(r.cuadra, false)
  assert.equal(esGuardable(r), true)
  const m = mensajeCuadre(r)
  assert.doesNotMatch(m, /cuadra:/)
  assert.match(m, /Cuadre no verificable/)
  assert.match(m, /⚠️ 2 reservas sin fecha de salida en Duplex Center, no verificables/)
  const uno = mensajeCuadre(cuadrarFactura(f, '2026-09', SEPT, [{ propertyId: 'prop_luxury_busto' }]))
  assert.match(uno, /1 reserva sin fecha de salida en Luxury Busto, no verificables/)
  // con discrepancia real, el titular sigue siendo Discrepancia
  const sal = SEPT.slice(1)
  assert.match(mensajeCuadre(cuadrarFactura(f, '2026-09', sal, [{ propertyId: 'prop_luxury_busto' }])), /<b>Discrepancia<\/b>/)
})
