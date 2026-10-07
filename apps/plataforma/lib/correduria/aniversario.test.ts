import test from 'node:test'
import assert from 'node:assert/strict'
import { proximoAniversario, diaYMesEs, textoVenceCadaAño, fechaDeDiaYMes } from './aniversario.ts'

test('da igual el año guardado: 2017, 2024 y 2027 avisan igual', () => {
  for (const f of ['2017-06-01', '2024-06-01', '2027-06-01']) assert.equal(proximoAniversario(f, '2026-10-06'), '2027-06-01')
  for (const f of ['2017-12-24', '2027-12-24']) assert.equal(proximoAniversario(f, '2026-10-06'), '2026-12-24')
})

test('hoy cuenta (vence hoy), ayer salta al año siguiente', () => {
  assert.equal(proximoAniversario('2020-10-06', '2026-10-06'), '2026-10-06')
  assert.equal(proximoAniversario('2020-10-05', '2026-10-06'), '2027-10-05')
})

test('29/02: 28/02 en año no bisiesto, 29/02 en bisiesto', () => {
  assert.equal(proximoAniversario('2024-02-29', '2026-10-06'), '2027-02-28')
  assert.equal(proximoAniversario('2024-02-29', '2027-10-06'), '2028-02-29')
  assert.equal(proximoAniversario('2024-02-29', '2026-01-10'), '2026-02-28')
})

test('Date de entrada: hoy de Madrid, no el día UTC', () => {
  assert.equal(proximoAniversario('2020-10-07', new Date('2026-10-06T22:30:00Z')), '2026-10-07')
  assert.equal(proximoAniversario('2020-10-07', new Date('2026-10-07T00:30:00Z')), '2026-10-07')
})

test('fecha ilegible o ausente: null, no se inventa un día', () => {
  for (const f of [null, undefined, '', 'mañana', '2026-02-30', '01/06/2027']) assert.equal(proximoAniversario(f, '2026-10-06'), null)
  assert.equal(proximoAniversario('2026-06-01', 'x'), null)
})

test('texto en español sin año', () => {
  assert.equal(diaYMesEs('2027-06-01'), '1 de junio')
  assert.equal(textoVenceCadaAño('2027-06-01'), 'Vence cada año el 1 de junio')
  assert.equal(textoVenceCadaAño('2017-12-31'), 'Vence cada año el 31 de diciembre')
  assert.equal(textoVenceCadaAño(null), null)
})

test('día y mes elegidos → próxima ocurrencia', () => {
  assert.equal(fechaDeDiaYMes(1, 6, '2026-10-06'), '2027-06-01')
  assert.equal(fechaDeDiaYMes(24, 12, '2026-10-06'), '2026-12-24')
  assert.equal(fechaDeDiaYMes(29, 2, '2026-10-06'), '2027-02-28')
  assert.equal(fechaDeDiaYMes(31, 4, '2026-10-06'), null)
  assert.equal(fechaDeDiaYMes(1, 13, '2026-10-06'), null)
})

test('ajustarDiaAlMes: el día inexistente pasa al último del mes nuevo', async () => {
  const { ajustarDiaAlMes } = await import('./aniversario.ts')
  assert.equal(ajustarDiaAlMes('31', '2'), '29')
  assert.equal(ajustarDiaAlMes('31', '4'), '30')
  assert.equal(ajustarDiaAlMes('15', '2'), '15')
  assert.equal(ajustarDiaAlMes('', '2'), '')
  assert.equal(ajustarDiaAlMes('31', ''), '31')
})
