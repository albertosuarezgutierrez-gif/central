// Runner: `node --test lib/gastos-recurrentes-detectados.test.ts`. Puro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectarRecurrentes, detectarSubidas, normalizarProveedor, proveedorBanco, proyectarRecurrente, proyectarRecurrentes, type GastoHist,
} from './gastos-recurrentes-detectados.ts'

const g = (ambito: string, proveedor: string, fecha: string, importe: number): GastoHist => ({ ambito, proveedor, fecha, importe })
const serie = (ambito: string, prov: string, meses: string[], imp: number | number[], dia = '05') =>
  meses.map((m, i) => g(ambito, prov, `${m}-${dia}`, Array.isArray(imp) ? imp[i] : imp))
const M = (a: number, b: number, y = 2026) => Array.from({ length: b - a + 1 }, (_, i) => `${y}-${String(a + i).padStart(2, '0')}`)

test('normaliza proveedores: sufijos societarios, tildes y abreviaturas', () => {
  assert.equal(normalizarProveedor('Endesa Energía S.A.U.'), normalizarProveedor('Endesa Energia S.A.'))
  assert.equal(normalizarProveedor('DIGI Spain Telecom, S.A.U.'), normalizarProveedor('DIGI Spain Telecom S.A.U.'))
  assert.equal(normalizarProveedor('Ayto. de Sevilla'), normalizarProveedor('Ayuntamiento de Sevilla'))
  assert.notEqual(normalizarProveedor('Endesa'), normalizarProveedor('TotalEnergies'))
})

test('detecta periodicidad mensual, bimestral y semestral (también cruzando de año)', () => {
  const h = [
    ...serie('S', 'Occident GCO S.A.', M(1, 10), 49.45),
    ...serie('S', 'EMASESA', ['2026-01', '2026-03', '2026-05', '2026-07'], 100),
    g('S', 'Ayuntamiento IBI', '2025-06-20', 480), g('S', 'Ayuntamiento IBI', '2025-12-20', 480), g('S', 'Ayuntamiento IBI', '2026-06-20', 490),
  ]
  const r = detectarRecurrentes(h, '2026-10-31')
  const p = (n: string) => r.find(x => x.proveedor.startsWith(n))!
  assert.equal(p('Occident').periodicidad, 'mensual')
  assert.equal(p('EMASESA').periodicidad, 'bimestral')
  assert.equal(p('Ayuntamiento').periodicidad, 'semestral')
  assert.equal(p('Ayuntamiento').tipico, 480)
})

test('no inventa recurrencia: 2 cargos mensuales, huecos irregulares o importes ≤ 0', () => {
  assert.equal(detectarRecurrentes(serie('S', 'X', ['2026-01', '2026-02'], 10), '2026-10-31').length, 0)
  assert.equal(detectarRecurrentes(serie('S', 'Amazon', ['2026-03', '2026-04', '2026-06', '2026-11'], 7), '2026-12-31').length, 0)
  assert.equal(detectarRecurrentes(serie('S', 'Abono', M(1, 6), -5), '2026-10-31').length, 0)
})

test('mismo proveedor en pisos distintos = recurrentes distintos; mismo mes con 2 cargos se suma', () => {
  const h = [...serie('A', 'Digi', M(1, 5), 20), ...serie('B', 'Digi', M(1, 5), 30), g('A', 'Digi', '2026-05-20', 5)]
  const r = detectarRecurrentes(h, '2026-10-31')
  assert.equal(r.length, 2)
  assert.equal(r.find(x => x.ambito === 'A')!.meses.at(-1)!.importe, 25)
})

test('proyección: IBI semestral solo su cargo de diciembre; mensual, los meses que faltan; los pasados no se inventan', () => {
  const ibi = detectarRecurrentes([g('S', 'IBI', '2025-06-20', 480), g('S', 'IBI', '2025-12-20', 480), g('S', 'IBI', '2026-06-20', 480)], '2026-10-31')[0]
  const p = proyectarRecurrente(ibi, '2026-10-31', 2026)
  assert.deepEqual(p.cargos, [{ fecha: '2026-12-20', importe: 480 }])
  const luz = detectarRecurrentes(serie('S', 'Seguro', M(1, 10), 50, '01'), '2026-11-03')[0]
  const q = proyectarRecurrente(luz, '2026-11-03', 2026)
  assert.deepEqual(q.cargos.map(c => c.fecha), ['2026-12-01']) // el de 1/11 ya pasó y no consta: atrasado, no se proyecta
  assert.equal(q.atrasados, 1)
})

test('proyectarRecurrentes: suma por ámbito y respeta `excluir` (lo que ya cubren los fijos)', () => {
  const h = [...serie('S', 'Seguro', M(1, 10), 50, '25'), ...serie('S', 'Internet', M(1, 10), 20, '25'), ...serie('R', 'Seguro', M(1, 10), 30, '25')]
  const todo = proyectarRecurrentes(h, '2026-10-31', 2026)
  assert.deepEqual(todo.porAmbito, { S: 140, R: 60 }) // nov + dic
  const sinInternet = proyectarRecurrentes(h, '2026-10-31', 2026, r => r.clave === 'internet')
  assert.deepEqual(sinInternet.porAmbito, { S: 100, R: 60 })
  assert.deepEqual(proyectarRecurrentes([], '2026-10-31', 2026).porAmbito, {})
})

test('subidas: +30 % y +20 € sobre la media de 6 recibos; fronteras y mínimos', () => {
  const base = serie('S', 'Endesa', M(4, 9), 100) // 6 previos de 100
  const con = (imp: number) => detectarSubidas([...base, g('S', 'Endesa', '2026-10-05', imp)], '2026-10-31')
  assert.equal(con(130).length, 1)           // justo +30 % y +30 €
  assert.equal(con(129.9).length, 0)         // bajo el 30 %
  assert.equal(con(100).length, 0)
  const pequeño = serie('S', 'Digi', M(4, 9), 10)
  assert.equal(detectarSubidas([...pequeño, g('S', 'Digi', '2026-10-05', 15)], '2026-10-31').length, 0) // +50 % pero solo 5 €
  const s = con(160)[0]
  assert.equal(s.media, 100); assert.equal(s.porcentaje, 60); assert.equal(s.recibos, 6)
})

test('subidas: usa solo los 6 últimos; un cargo de otro mes no avisa; la estacionalidad (mismo mes del año anterior) no avisa', () => {
  const h = [...serie('S', 'Endesa', M(1, 3), 500), ...serie('S', 'Endesa', M(4, 9), 100), g('S', 'Endesa', '2026-10-05', 140)]
  assert.equal(detectarSubidas(h, '2026-10-31')[0].media, 100)
  assert.equal(detectarSubidas(h, '2026-11-15').length, 0) // el último cargo es de octubre
  const est = [g('S', 'Endesa', '2025-10-05', 150), ...serie('S', 'Endesa', M(4, 9), 100), g('S', 'Endesa', '2026-10-05', 150)]
  assert.equal(detectarSubidas(est, '2026-10-31').length, 0)
})

test('subidas: semestral compara con el cargo anterior del ciclo', () => {
  const ibi = [g('S', 'IBI', '2025-06-20', 400), g('S', 'IBI', '2025-12-20', 400), g('S', 'IBI', '2026-06-20', 560)]
  const s = detectarSubidas(ibi, '2026-06-30')
  assert.equal(s.length, 1); assert.equal(s[0].media, 400)
})

test('baja: tipo PriceLabs (cargos de enero a agosto y nada después) no se proyecta; un retraso corto no es baja', () => {
  const h = serie('PL', 'PriceLabs Inc.', M(1, 8), 56, '06')
  const r = detectarRecurrentes(h, '2026-11-03')
  assert.equal(r.length, 1)
  const p = proyectarRecurrente(r[0], '2026-11-03', 2026)
  assert.equal(p.baja, true); assert.deepEqual(p.cargos, [])
  assert.equal(proyectarRecurrentes(h, '2026-11-03', 2026).porAmbito.PL, undefined)
  assert.equal(proyectarRecurrentes(h, '2026-11-03', 2026).detalle[0].baja, true)
  // Mensual con el cargo del 1/11 aún sin apuntar a 3/11: retraso, no baja → se proyecta diciembre.
  const vivo = proyectarRecurrentes(serie('S', 'Seguro', M(1, 10), 50, '01'), '2026-11-03', 2026)
  assert.equal(vivo.porAmbito.S, 50); assert.equal(vivo.detalle[0].baja, false)
  // Pasada la cortesía sin cargo (20/11 y falta el del 1/11) = baja.
  assert.equal(proyectarRecurrentes(serie('S', 'Seguro', M(1, 10), 50, '01'), '2026-11-20', 2026).porAmbito.S, undefined)
})

test('proveedor desde el banco: ruido de «compra en», números de adeudo y sinónimos (TGSS, Claude)', () => {
  assert.equal(proveedorBanco('COMPRA EN PAYPAL *IONOS CLOUD', null), 'ionos')
  assert.equal(proveedorBanco('Vercel inc.', null), 'vercel')
  assert.equal(proveedorBanco('PAGO CON TARJETA DE SERVICIOS VARIOS // PAGO CON TARJETA // FLY.IO', null), 'fly')
  assert.equal(proveedorBanco('Anthropic* claude sub', null), proveedorBanco('ANTHROPIC IRELAND', null))
  assert.equal(proveedorBanco('N 2026028002541703 tgss. cotizacion 005 r.e.autonomos', null), proveedorBanco('Adeudo de cuota de la seguridad social', null))
  assert.equal(proveedorBanco('', 'ASISA ASISTENCIA SANITARIA'), 'asisa')
  assert.equal(proveedorBanco(null, null), null)
})
