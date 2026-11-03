// Importes SINTÉTICOS.
import test from 'node:test'
import assert from 'node:assert/strict'
import { alertasCuadreComisiones, type PeriodoAviso } from './cuadre-avisos.ts'

const HOY = '2026-11-03'
const p = (x: Partial<PeriodoAviso>): PeriodoAviso => ({
  codigo: 'C0058', compania: 'Mapfre', inicio: '2026-08-01', fin: '2026-08-31', leidoOk: true,
  esperadoBruto: null, liqBruto: null, liqRetencion: null, liqRemesa: null, bancoTotal: null, liqOrigen: null, ...x,
})

test('(a) devengado sin abono: avisa pasados 60 días del cierre, no antes', () => {
  const viejo = alertasCuadreComisiones([p({ esperadoBruto: 100 })], HOY) // fin 31/08 → 64 días
  assert.equal(viejo.length, 1)
  assert.equal(viejo[0].clave, 'comisiones-sin-abono-C0058')
  assert.equal(viejo[0].suave, false)
  assert.match(viejo[0].texto, /100,00€/)
  const reciente = alertasCuadreComisiones([p({ inicio: '2026-09-01', fin: '2026-09-30', esperadoBruto: 100 })], HOY) // 34 días
  assert.deepEqual(reciente, [])
})

test('(a) devengo 0 o nulo no es «algo que cobrar»', () => {
  assert.deepEqual(alertasCuadreComisiones([p({ esperadoBruto: 0 }), p({ inicio: '2026-07-01', fin: '2026-07-31' })], HOY), [])
})

test('(b) neto vs banco: >5 € avisa, ≤5 € no', () => {
  const fuera = alertasCuadreComisiones([p({ liqBruto: 100, liqRetencion: 15, liqRemesa: 85, bancoTotal: 79, liqOrigen: 'pdf' })], HOY)
  assert.equal(fuera.length, 1)
  assert.equal(fuera[0].clave, 'comisiones-descuadre-C0058')
  assert.match(fuera[0].texto, /\(PDF\)/)
  assert.deepEqual(alertasCuadreComisiones([p({ liqBruto: 100, liqRetencion: 15, liqRemesa: 85, bancoTotal: 81 })], HOY), [])
})

test('(b) convención de Occident (bruto negativo, remesa 0) se casa por la remesa inferida', () => {
  const ok = alertasCuadreComisiones([p({ codigo: 'C0468', compania: 'Occident', liqBruto: -200, liqRetencion: 30, liqRemesa: 0, bancoTotal: 170 })], HOY)
  assert.deepEqual(ok, [])
})

test('(c) abono sin liquidación es aviso suave', () => {
  const a = alertasCuadreComisiones([p({ bancoTotal: 50, esperadoBruto: 60 })], HOY)
  assert.equal(a.length, 1)
  assert.equal(a[0].clave, 'comisiones-abono-sin-liq-C0058')
  assert.equal(a[0].suave, true)
})

test('lectura fallida (leidoOk=false) no avisa de nada', () => {
  assert.deepEqual(alertasCuadreComisiones([p({ leidoOk: false, esperadoBruto: 100, bancoTotal: 5 })], HOY), [])
})

test('una alerta por compañía y tipo, con clave estable', () => {
  const a = alertasCuadreComisiones([
    p({ esperadoBruto: 10 }), p({ inicio: '2026-07-01', fin: '2026-07-31', esperadoBruto: 20 }),
    p({ codigo: 'C0072', compania: 'Generali', esperadoBruto: 30 }),
  ], HOY)
  assert.deepEqual(a.map(x => x.clave), ['comisiones-sin-abono-C0058', 'comisiones-sin-abono-C0072'])
  assert.ok(a[0].texto.indexOf('01/07/2026') < a[0].texto.indexOf('01/08/2026'))
})
