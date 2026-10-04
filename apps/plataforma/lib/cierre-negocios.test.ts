import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveProveedor, claveMovimiento, ultimosMeses, detectarSuscripciones, agruparPorDestino,
  cargosSinFactura, formatearCierre, formatearSuscripciones, type CargoBanco, type ItemGasto,
} from './cierre-negocios.ts'

const MESES = ['2026-06', '2026-07', '2026-08', '2026-09']
const it = (clave: string, mes: string, importe: number, fuente: 'banco' | 'factura' = 'banco'): ItemGasto => ({ clave, nombre: clave.toUpperCase(), mes, importe, fuente })

test('claveProveedor: ignora ruido bancario y formas jurídicas', () => {
  assert.equal(claveProveedor('Anthropic Ireland, Limited'), 'anthropic')
  assert.equal(claveProveedor('ANTHROPIC* CLAUDE SUB'), 'anthropic')
  assert.equal(claveProveedor('RECIBO ENDESA ENERGIA'), 'endesa')
  assert.equal(claveProveedor(null), null)
  assert.equal(claveMovimiento(null, 'RECIBO EMASESA EMASEPE2601'), 'emasesa')
})

test('claveMovimiento: «COMPRA EN …» sin contraparte no es proveedor', () => {
  assert.equal(claveMovimiento(null, 'COMPRA EN MERCADONA C.C METROMAR'), null)
  assert.equal(claveMovimiento('MERCADONA SA', 'COMPRA EN MERCADONA'), 'mercadona')
})

test('suscripciones: Seguridad Social e hipoteca no se listan', () => {
  const ss = MESES.map(m => ({ ...it('impuesto', m, 300), nombre: 'ADEUDO DE CUOTA DE LA SEGURIDAD SOCIAL // PAGO DE IMPUESTO' }))
  const hip = MESES.map(m => ({ ...it('cuota', m, 700), nombre: 'CUOTA PTMO 856289293-5' }))
  assert.equal(detectarSuscripciones([...ss, ...hip], MESES).lista.length, 0)
})

test('ultimosMeses cruza año', () => {
  assert.deepEqual(ultimosMeses('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02'])
})

test('suscripciones: ≥3 de 4 meses entra, 2 de 4 no; ordenada por anual; total', () => {
  const items = [
    ...['2026-07', '2026-08', '2026-09'].map(m => it('vercel', m, 20)),
    ...MESES.map(m => it('anthropic', m, 170)),
    ...['2026-08', '2026-09'].map(m => it('puntual', m, 500)),
  ]
  const r = detectarSuscripciones(items, MESES)
  assert.deepEqual(r.lista.map(s => s.clave), ['anthropic', 'vercel'])
  assert.equal(r.lista[0].anual, 170 * 12)
  assert.equal(r.lista[1].meses, 3)
  assert.equal(r.totalAnual, 170 * 12 + 20 * 12)
})

test('suscripciones: banco y factura del mismo mes no se suman dos veces', () => {
  const items = [...MESES.map(m => it('ionos', m, 10)), ...MESES.map(m => it('ionos', m, 10, 'factura'))]
  assert.equal(detectarSuscripciones(items, MESES).lista[0].mensual, 10)
})

test('suscripciones: la factura cubre un mes sin cargo bancario; meses fuera de ventana no cuentan', () => {
  const items = [it('x', '2026-07', 10), it('x', '2026-08', 10), it('x', '2026-09', 10, 'factura'), it('x', '2026-01', 10), it('x', '2026-02', 10)]
  assert.equal(detectarSuscripciones(items, MESES).lista[0].meses, 3)
  assert.equal(detectarSuscripciones([it('y', '2026-01', 5), it('y', '2026-02', 5), it('y', '2026-03', 5)], MESES).lista.length, 0)
})

test('agruparPorDestino: excluye traspasos, personal sin pendiente afirmado (null), pendientes solo sin casar', () => {
  const f = agruparPorDestino([
    { importe: -100, destino: 'seguros', conciliado: false, facturaRef: null },
    { importe: -50, destino: 'seguros', conciliado: true, facturaRef: 'x' },
    { importe: 30, destino: 'seguros', conciliado: false, facturaRef: '' },
    { importe: -999, destino: 'traspaso_interno', conciliado: false, facturaRef: null },
    { importe: -10, destino: 'personal', conciliado: false, facturaRef: null },
    { importe: -5, destino: null, conciliado: false, facturaRef: null },
  ])
  assert.deepEqual(f.map(x => x.destino), ['seguros', 'personal'])
  assert.deepEqual(f[0], { destino: 'seguros', gastos: 150, ingresos: 30, pendientesN: 2, pendientesEur: 130 })
  assert.equal(f[1].pendientesEur, null)
})

const cargo = (o: Partial<CargoBanco>): CargoBanco => ({ id: 'a', fecha: '2026-09-10', importe: -100, destino: 'turistico_pisos', clave: 'endesa', nombre: 'ENDESA', conciliado: false, facturaRef: null, ...o })

test('cargosSinFactura: falta si no hay factura a ±10 días; cubre la factura cercana', () => {
  const facturas = [{ clave: 'endesa', fecha: '2025-12-01', importe: 90 }, { clave: 'endesa', fecha: '2026-09-15', importe: 100 }]
  assert.equal(cargosSinFactura([cargo({})], facturas).lista.length, 0)           // factura a 5 días
  const lejos = [{ clave: 'endesa', fecha: '2026-09-25', importe: 100 }, { clave: 'endesa', fecha: '2025-12-01', importe: 90 }]
  const r = cargosSinFactura([cargo({})], lejos)                                   // a 15 días
  assert.equal(r.lista.length, 1); assert.equal(r.total, 100)
})

test('cargosSinFactura: ≤20 €, personal, traspaso, sin factura_ref, proveedor que no factura y sin clave NO cuentan', () => {
  const facturas = [{ clave: 'endesa', fecha: '2025-01-01', importe: 1 }]
  assert.equal(cargosSinFactura([cargo({ importe: -20 })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ destino: 'personal' })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ destino: 'traspaso_interno' })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ facturaRef: 'drive:1' })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ conciliado: true })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ clave: 'otro' })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ clave: null })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({ destino: null })], facturas).lista.length, 0)
  assert.equal(cargosSinFactura([cargo({})], facturas).lista.length, 1)            // control: este sí
})

test('cargosSinFactura: una factura casa un solo cargo', () => {
  const facturas = [{ clave: 'endesa', fecha: '2026-09-10', importe: 100 }]
  const r = cargosSinFactura([cargo({ id: '1' }), cargo({ id: '2' })], facturas)
  assert.equal(r.lista.length, 1)
})

test('formato: escapeHtml, top 10 + «y N más», Punto y Coma aparte solo con movimientos', () => {
  const lista = Array.from({ length: 12 }, (_, i) => ({ id: String(i), fecha: '2026-09-10', importe: 100 + i, nombre: i === 0 ? 'A<b>&Co' : 'P' + i }))
  const base = { label: 'septiembre 2026', filas: [], ivaSoportado: 313.08, facturasSinIva: 0, sinFactura: { lista, total: 1266 }, puntoYComa: null }
  const t = formatearCierre(base)
  assert.match(t, /A&lt;b&gt;&amp;Co/)
  assert.match(t, /… y 2 más/)
  assert.match(t, /Te faltan <b>12<\/b> facturas por <b>1\.266,00€<\/b>/)
  assert.doesNotMatch(t, /Punto y Coma/)
  assert.ok(t.split('\n').length <= 25)
  assert.match(formatearCierre({ ...base, puntoYComa: { movimientos: 2, gastos: 10, ingresos: 0 } }), /Punto y Coma SL \(paralizada\)/)
})

test('formato: IVA null → «—», nunca 0,00€', () => {
  const t = formatearCierre({ label: 'x', filas: [], ivaSoportado: null, facturasSinIva: 0, sinFactura: { lista: [], total: 0 }, puntoYComa: null })
  assert.match(t, /IVA soportado: —/)
})

test('formato suscripciones: top 10, resto agregado, total anual; vacío → null', () => {
  const lista = Array.from({ length: 12 }, (_, i) => ({ clave: 'c' + i, nombre: 'N' + i, meses: 4, mensual: 10, anual: 120 }))
  const t = formatearSuscripciones({ lista, totalAnual: 1440 }, 4)!
  assert.match(t, /… y 2 más \(240€\/año\)/)
  assert.match(t, /Total anual estimado: <b>1\.440€<\/b>/)
  assert.equal(formatearSuscripciones({ lista: [], totalAnual: 0 }, 4), null)
})
