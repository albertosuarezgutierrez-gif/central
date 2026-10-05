import test from 'node:test'
import assert from 'node:assert/strict'

import { bancoDePeriodo, casarAbonos, codigoDeAbono, mesDelConcepto, rangoAbonos, type AbonoBanco, type PeriodoLiq } from './casar-banco.ts'

const SIN_REGLAS = new Map<string, string>()

function abono(p: Partial<AbonoBanco> & { id: string; fecha: string; importe: number }): AbonoBanco {
  return { concepto: null, conceptoNormalizado: null, contraparte: null, companiaSeguros: null, ...p }
}

function mes(codigo: string, m: string, remesa: number | null = null): PeriodoLiq {
  const [a, mm] = m.split('-').map(Number)
  return { codigo, inicio: `${m}-01`, fin: new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10), remesa }
}

test('mesDelConcepto: lee el mes que el concepto dice pagar, y no se lo inventa en números de remesa', () => {
  assert.equal(mesDelConcepto('Liq.comisiones 202512'), '2025-12')
  assert.equal(mesDelConcepto('Comisiones mayo       2026050'), '2026-05')
  assert.equal(mesDelConcepto('-fra-comis-20250531'), '2025-05')
  assert.equal(mesDelConcepto('2000071499 2remsaldo-27289 1.'), null)
  assert.equal(mesDelConcepto('G.65792 liq.00047 generali se'), null)
  assert.equal(mesDelConcepto(null), null)
})

test('codigoDeAbono: manual → regla aprendida → concepto; «Otras» no se atribuye', () => {
  assert.equal(codigoDeAbono(abono({ id: 'a', fecha: '2026-01-02', importe: 1, concepto: 'Liq.comisiones 202512' }), SIN_REGLAS), 'C0058')
  assert.equal(codigoDeAbono(abono({ id: 'a', fecha: '2026-01-02', importe: 1, concepto: 'G.65792 liq.00044 generali se' }), SIN_REGLAS), 'C0072')
  const reglas = new Map([['X9999', 'Occident']])
  assert.equal(codigoDeAbono(abono({ id: 'a', fecha: '2026-07-01', importe: 45.15, concepto: 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // X9999' }), reglas), 'C0468')
  assert.equal(codigoDeAbono(abono({ id: 'a', fecha: '2026-07-01', importe: 45.15, concepto: 'X9999', companiaSeguros: 'Allianz' }), reglas), 'C0109')
  // Un ingreso de nómina mal clasificado como «seguros» no es de ninguna compañía.
  assert.equal(codigoDeAbono(abono({ id: 'a', fecha: '2026-03-31', importe: 905.52, concepto: 'PENSION // INGRESO POR NÓMINA' }), SIN_REGLAS), null)
})

test('🚨 un abono entra en UN periodo aunque las ventanas de 45 días se pisen', () => {
  const periodos = [mes('C0468', '2026-01'), mes('C0468', '2026-02'), mes('C0468', '2026-03')]
  const abonos = [
    abono({ id: 'ene', fecha: '2026-02-03', importe: 100, companiaSeguros: 'Occident' }),
    abono({ id: 'feb', fecha: '2026-03-03', importe: 200, companiaSeguros: 'Occident' }),
  ]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  const todos = [...c.porPeriodo.values()].flat()
  assert.equal(todos.length, 2, 'cada abono una sola vez')
  assert.deepEqual(bancoDePeriodo(periodos[0], c, abonos), { total: 100, ids: ['ene'] })
  assert.deepEqual(bancoDePeriodo(periodos[1], c, abonos), { total: 200, ids: ['feb'] })
  assert.deepEqual(bancoDePeriodo(periodos[2], c, abonos), { total: null, ids: [] })
})

test('el mes del concepto manda; si ese periodo no está en el libro, el abono no se regala al siguiente', () => {
  const periodos = [mes('C0058', '2026-01'), mes('C0058', '2026-02')]
  const abonos = [
    abono({ id: 'dic', fecha: '2026-01-02', importe: 114.23, concepto: 'Liq.comisiones 202512' }),
    abono({ id: 'ene', fecha: '2026-02-02', importe: 154.17, concepto: 'Liq.comisiones 202601' }),
  ]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  assert.deepEqual(bancoDePeriodo(periodos[0], c, abonos).ids, ['ene'])
  assert.deepEqual(bancoDePeriodo(periodos[1], c, abonos).ids, [])
})

test('sin mes en el concepto, gana el periodo cuya remesa coincide (±1€)', () => {
  const periodos = [mes('C0109', '2026-05', 19.64), mes('C0109', '2026-06', 17.71)]
  const abonos = [abono({ id: 'x', fecha: '2026-07-02', importe: 19.6, companiaSeguros: 'Allianz' })]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  assert.deepEqual(bancoDePeriodo(periodos[0], c, abonos).ids, ['x'])
})

test('remesas parecidas: cada abono a la más cercana y cerrada, sin repetir periodo', () => {
  const periodos = [mes('C0109', '2026-05', 19.64), mes('C0109', '2026-06', 19.2)]
  const abonos = [
    abono({ id: 'may', fecha: '2026-06-02', importe: 19.64, companiaSeguros: 'Allianz' }),
    abono({ id: 'jun', fecha: '2026-07-02', importe: 19.2, companiaSeguros: 'Allianz' }),
  ]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  assert.deepEqual(bancoDePeriodo(periodos[0], c, abonos).ids, ['may'])
  assert.deepEqual(bancoDePeriodo(periodos[1], c, abonos).ids, ['jun'])
})

test('dos meses con la MISMA remesa: el segundo abono no se amontona en el primer periodo', () => {
  const periodos = [mes('C0109', '2026-05', 19.64), mes('C0109', '2026-06', 19.64)]
  const abonos = [
    abono({ id: 'jun', fecha: '2026-07-02', importe: 19.64, companiaSeguros: 'Allianz' }),
    abono({ id: 'may', fecha: '2026-06-02', importe: 19.64, companiaSeguros: 'Allianz' }),
  ]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  assert.deepEqual(bancoDePeriodo(periodos[0], c, abonos).ids, ['may'])
  assert.deepEqual(bancoDePeriodo(periodos[1], c, abonos).ids, ['jun'])
})

test('si falta el mes que se paga, el abono no cae en el periodo anterior y se cuenta', () => {
  const periodos = [{ codigo: 'C0109', inicio: '2026-02-01', fin: '2026-03-01', remesa: 80.77 }, mes('C0109', '2026-04')]
  const abonos = [abono({ id: 'mar', fecha: '2026-04-03', importe: 50, companiaSeguros: 'Allianz' })]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  assert.equal(bancoDePeriodo(periodos[0], c, abonos).total, null)
  assert.equal(c.sinPeriodo, 1)
})

test('una asignación manual con otro nombre de la compañía no se pierde', () => {
  assert.equal(codigoDeAbono(abono({ id: 'a', fecha: '2026-01-02', importe: 1, companiaSeguros: 'Catalana Occidente' }), SIN_REGLAS), 'C0468')
  assert.equal(mesDelConcepto('REF 20260312345'), null)
})

test('un abono de principios de mes sin periodo cerrado antes (el del mes anterior al libro) no se asigna', () => {
  const periodos = [mes('C0468', '2026-01'), mes('C0468', '2026-02')]
  const abonos = [
    abono({ id: 'dic', fecha: '2026-01-07', importe: 91.46, companiaSeguros: 'Occident' }),
    abono({ id: 'ene', fecha: '2026-02-04', importe: 279.76, companiaSeguros: 'Occident' }),
  ]
  const c = casarAbonos(periodos, abonos, SIN_REGLAS)
  assert.deepEqual(bancoDePeriodo(periodos[0], c, abonos), { total: 279.76, ids: ['ene'] })
})

test('rangoAbonos cubre la ventana de cobro del último periodo', () => {
  assert.deepEqual(rangoAbonos([mes('C0058', '2026-01'), mes('C0058', '2026-03')]), { desde: '2026-01-01', hasta: '2026-05-15' })
  assert.equal(rangoAbonos([]), null)
})

test('🚨 el cron del libro elige la cuenta por la lista de la correduría y casa con casarAbonos', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../app/api/cron/cima-liq/route.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(src, /FROM cuentas LIMIT 1/, 'una cuenta cualquiera escribe el libro en quien no toca')
  assert.match(src, /listaCorreduria\(\)/)
  assert.match(src, /casarAbonos\(/)
  assert.doesNotMatch(src, /mb\.compania_seguros = \$\{/, 'filtrar solo por la columna pierde los abonos que la matriz atribuye')
})

test('abono con compañía que liquida VARIAS remesas pendientes: banco_total = su remesa en cada periodo', () => {
  const periodos = [mes('C0109', '2026-06', 300.5), mes('C0109', '2026-07', 250.03), mes('C0109', '2026-08', 154)]
  const ab = [abono({ id: 'saldo', fecha: '2026-09-15', importe: 704.53, concepto: 'Transferencia saldo de la cuenta', companiaSeguros: 'Allianz' })]
  const c = casarAbonos(periodos, ab, SIN_REGLAS)
  const r = periodos.map((p) => bancoDePeriodo(p, c, ab))
  assert.deepEqual(r.map((x) => x.total), [300.5, 250.03, 154])
  assert.ok(r.every((x) => x.ids.length === 1 && x.ids[0] === 'saldo'))
  assert.equal(c.excedentes.length, 0)
})

test('multi-remesa: si el abono supera la suma, el excedente queda registrado y NO se reparte', () => {
  const periodos = [mes('C0109', '2026-06', 100), mes('C0109', '2026-07', 100)]
  const ab = [abono({ id: 's', fecha: '2026-09-15', importe: 250, companiaSeguros: 'Allianz' })]
  const c = casarAbonos(periodos, ab, SIN_REGLAS)
  assert.deepEqual(periodos.map((p) => bancoDePeriodo(p, c, ab).total), [100, 100])
  assert.deepEqual(c.excedentes, [{ abonoId: 's', codigo: 'C0109', importe: 250, sumaRemesas: 200, excedente: 50 }])
})

test('multi-remesa: no casa si el abono no cubre la suma, sin compañía asignada, o con remesas posteriores', () => {
  const periodos = [mes('C0109', '2026-06', 100), mes('C0109', '2026-07', 100)]
  const corto = [abono({ id: 'a', fecha: '2026-09-15', importe: 150, companiaSeguros: 'Allianz' })]
  assert.equal(bancoDePeriodo(periodos[0], casarAbonos(periodos, corto, SIN_REGLAS), corto).total, null)
  const sinCia = [abono({ id: 'b', fecha: '2026-09-15', importe: 200, concepto: 'saldo' })]
  assert.equal(bancoDePeriodo(periodos[1], casarAbonos(periodos, sinCia, SIN_REGLAS), sinCia).total, null)
  const antes = [abono({ id: 'c', fecha: '2026-06-20', importe: 200, companiaSeguros: 'Allianz' })]
  assert.equal(bancoDePeriodo(periodos[1], casarAbonos(periodos, antes, SIN_REGLAS), antes).total, null)
})
