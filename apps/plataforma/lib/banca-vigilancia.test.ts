// node --test --experimental-strip-types lib/banca-vigilancia.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frescuraCuentas, picosGasto, fusionarPicos, etiquetaCuenta, textoFrescura, textoPicos, claveProveedor } from './banca-vigilancia.ts'

const HOY = '2026-10-04'
const cta = (o: object) => ({ banco: 'BBVA', alias: null, iban: 'ES001175', oculta: false, ultimoMovimiento: '2026-10-03', ...o })

test('frescura: >3 días avisa; exactamente 3 no; sin movimientos no afirma nada', () => {
  const r = frescuraCuentas([
    cta({ ultimoMovimiento: '2026-09-10' }), cta({ banco: 'K', ultimoMovimiento: '2026-10-01' }),
    cta({ banco: 'X', ultimoMovimiento: null }), cta({ banco: 'Y', ultimoMovimiento: '2026-01-01' }),
  ], HOY)
  assert.deepEqual(r.obsoletas.map(o => [o.etiqueta, o.dias]), [['BBVA ·1175', 24]])
})

test('frescura: ocultas van aparte y no entran en obsoletas', () => {
  const r = frescuraCuentas([cta({ oculta: true, ultimoMovimiento: '2026-07-31' })], HOY)
  assert.equal(r.obsoletas.length, 0)
  assert.equal(r.ocultas.length, 1)
  assert.match(textoFrescura(r, s => s)!, /1 cuentas ocultas/)
})

test('etiqueta: usa alias y solo dígitos finales (máscara «IDAD» no se enseña)', () => {
  assert.equal(etiquetaCuenta({ banco: 'K', alias: 'Pilar', iban: 'ES12 0855' }), 'Pilar ·0855')
  assert.equal(etiquetaCuenta({ banco: 'K', alias: null, iban: 'IDAD' }), 'K')
})

const dia = (n: number) => { const d = new Date(Date.UTC(2026, 9, 4) - n * 86_400_000); return d.toISOString().slice(0, 10) }

test('picos: caso Anthropic (7 cargos en 3 semanas vs mensualidad) salta y agrupa rótulos', () => {
  const cargos = [
    ...[150, 120, 90, 60].map(n => ({ fecha: dia(n), proveedor: 'ANTHROPIC* CLAUDE SUB', importe: 170 })),
    ...[1, 5, 9, 14, 18, 21, 25].map((n, i) => ({ fecha: dia(n), proveedor: i % 2 ? 'ANTHROPIC IRELAND' : 'CLAUDE.AI SUBSCRIPTION', importe: 170 })),
  ]
  const p = picosGasto(cargos, HOY)
  assert.equal(p.length, 1)
  assert.equal(p[0].proveedor, 'ANTHROPIC')
  assert.equal(p[0].cargos, 11)
  assert.equal(Math.round(p[0].gastado30), 1190)
  assert.equal(Math.round(p[0].mediaMensual), 136)
})

test('picos: gasto estable, <3 cargos, proveedor nuevo o céntimos NO saltan', () => {
  const estable = [150, 120, 90, 60, 30, 5].map(n => ({ fecha: dia(n), proveedor: 'NETFLIX', importe: 20 }))
  assert.equal(picosGasto(estable, HOY).length, 0)
  const dos = [{ fecha: dia(100), proveedor: 'A', importe: 100 }, { fecha: dia(3), proveedor: 'A', importe: 900 }]
  assert.equal(picosGasto(dos, HOY).length, 0)
  const nuevo = [3, 2, 1].map(n => ({ fecha: dia(n), proveedor: 'B', importe: 100 }))
  assert.equal(picosGasto(nuevo, HOY).length, 0)
  const cent = [100, 60, 3, 2].map(n => ({ fecha: dia(n), proveedor: 'C', importe: n < 10 ? 10 : 1 }))
  assert.equal(picosGasto(cent, HOY).length, 0)
})

test('picos: exactamente 2× no salta; ingresos (importe<0) se ignoran', () => {
  // previo 150 € en 150 d → media 30; 30 d: 60 = 2× justo
  const base = [{ fecha: dia(100), proveedor: 'D', importe: 75 }, { fecha: dia(60), proveedor: 'D', importe: 75 }, { fecha: dia(2), proveedor: 'D', importe: 60 }]
  assert.equal(picosGasto(base, HOY, { minGasto30: 0 }).length, 0)
  assert.equal(picosGasto([...base, { fecha: dia(1), proveedor: 'D', importe: 1 }], HOY, { minGasto30: 0 }).length, 1)
  // un abono (importe<0) no cuenta como cargo: con él habría 3 cargos y saltaría
  const conAbono = [{ fecha: dia(100), proveedor: 'E', importe: 75 }, { fecha: dia(50), proveedor: 'E', importe: -1 }, { fecha: dia(3), proveedor: 'E', importe: 900 }]
  assert.equal(picosGasto(conAbono, HOY).length, 0)
})

test('fusionar no suma fuentes; textos escapan y formatean dinero', () => {
  const a = { proveedor: 'X', gastado30: 100, mediaMensual: 10, cargos: 5, ratio: 10 }
  assert.equal(fusionarPicos([a], [{ ...a, cargos: 3, gastado30: 999 }])[0].gastado30, 100)
  const t = textoPicos([{ ...a, proveedor: 'A<B', gastado30: 2162.49 }], s => s.replace('<', '&lt;'))!
  assert.match(t, /A&lt;B/)
  assert.match(t, /2\.162,49€/)
  assert.equal(claveProveedor('Claude.ai Subscription'), 'ANTHROPIC')
})
