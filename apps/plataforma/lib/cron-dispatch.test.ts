import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CRON_JOBS, cronMatches, jobsDue, truncarAMinuto, ventanaMinutos } from './cron-dispatch.ts'

const utc = (iso: string) => new Date(iso)

test('todas las expresiones del manifiesto parsean y los paths son únicos', () => {
  const fecha = utc('2026-07-30T06:00:00Z')
  for (const j of CRON_JOBS) {
    assert.ok(j.path.startsWith('/api/'), `path raro: ${j.path}`)
    cronMatches(j.schedule, fecha) // no debe lanzar
  }
  const paths = CRON_JOBS.map(j => j.path)
  assert.equal(new Set(paths).size, paths.length, 'paths duplicados en el manifiesto')
  assert.ok(CRON_JOBS.length >= 60, 'el manifiesto perdió entradas respecto al vercel.json original')
})

test('minuto y hora exactos', () => {
  assert.ok(cronMatches('0 6 * * *', utc('2026-07-29T06:00:00Z')))
  assert.ok(!cronMatches('0 6 * * *', utc('2026-07-29T06:01:00Z')))
  assert.ok(!cronMatches('0 6 * * *', utc('2026-07-29T07:00:00Z')))
})

test('pasos: */3, */10 y */6 en hora', () => {
  assert.ok(cronMatches('*/3 * * * *', utc('2026-07-29T10:03:00Z')))
  assert.ok(cronMatches('*/3 * * * *', utc('2026-07-29T10:00:00Z')))
  assert.ok(!cronMatches('*/3 * * * *', utc('2026-07-29T10:04:00Z')))
  assert.ok(cronMatches('*/10 * * * *', utc('2026-07-29T10:50:00Z')))
  assert.ok(!cronMatches('*/10 * * * *', utc('2026-07-29T10:55:00Z')))
  assert.ok(cronMatches('20 */6 * * *', utc('2026-07-29T18:20:00Z')))
  assert.ok(!cronMatches('20 */6 * * *', utc('2026-07-29T19:20:00Z')))
})

test('listas y rangos: domótica 25,55 8-15 y apply-auto 30 8,14,20', () => {
  assert.ok(cronMatches('25,55 8-15 * * *', utc('2026-07-29T08:25:00Z')))
  assert.ok(cronMatches('25,55 8-15 * * *', utc('2026-07-29T15:55:00Z')))
  assert.ok(!cronMatches('25,55 8-15 * * *', utc('2026-07-29T16:25:00Z')))
  assert.ok(!cronMatches('25,55 8-15 * * *', utc('2026-07-29T08:30:00Z')))
  assert.ok(cronMatches('30 8,14,20 * * *', utc('2026-07-29T14:30:00Z')))
  assert.ok(!cronMatches('30 8,14,20 * * *', utc('2026-07-29T15:30:00Z')))
})

test('día de la semana: rangos laborables, domingo 0 y 7', () => {
  // 2026-07-29 es miércoles; 2026-07-26 domingo; 2026-07-27 lunes
  assert.ok(cronMatches('0 13 * * 1-5', utc('2026-07-29T13:00:00Z')))
  assert.ok(!cronMatches('0 13 * * 1-5', utc('2026-07-26T13:00:00Z')))
  assert.ok(cronMatches('0 3 * * 0', utc('2026-07-26T03:00:00Z')))
  assert.ok(cronMatches('0 3 * * 7', utc('2026-07-26T03:00:00Z')))
  assert.ok(cronMatches('0 9 * * 1', utc('2026-07-27T09:00:00Z')))
  assert.ok(!cronMatches('0 9 * * 1', utc('2026-07-29T09:00:00Z')))
  assert.ok(cronMatches('30 6 * * 2-6', utc('2026-07-29T06:30:00Z')))
  assert.ok(!cronMatches('30 6 * * 2-6', utc('2026-07-26T06:30:00Z')))
})

test('día del mes y mes: mensuales y pre-renta anual', () => {
  assert.ok(cronMatches('0 8 1 * *', utc('2026-08-01T08:00:00Z')))
  assert.ok(!cronMatches('0 8 1 * *', utc('2026-08-02T08:00:00Z')))
  assert.ok(cronMatches('0 9 1 3 *', utc('2026-03-01T09:00:00Z')))
  assert.ok(!cronMatches('0 9 1 3 *', utc('2026-04-01T09:00:00Z')))
})

test('expresiones inválidas lanzan', () => {
  assert.throws(() => cronMatches('0 6 * *', new Date()))
  assert.throws(() => cronMatches('61 * * * *', new Date()))
  assert.throws(() => cronMatches('* 25 * * *', new Date()))
  assert.throws(() => cronMatches('*/0 * * * *', new Date()))
})

test('ventanaMinutos: sin cursor → solo el minuto actual', () => {
  const v = ventanaMinutos(null, utc('2026-07-29T06:00:30Z'))
  assert.equal(v.length, 1)
  assert.equal(v[0].toISOString(), '2026-07-29T06:00:00.000Z')
})

test('ventanaMinutos: catch-up de un minuto omitido por el scheduler', () => {
  // El cursor quedó en 05:59 (última pasada) y la de 06:00 no se disparó: la de 06:01 cubre ambos.
  const v = ventanaMinutos(utc('2026-07-29T05:59:00Z'), utc('2026-07-29T06:01:10Z'))
  assert.deepEqual(v.map(d => d.toISOString()), ['2026-07-29T06:00:00.000Z', '2026-07-29T06:01:00.000Z'])
})

test('ventanaMinutos: tope de catch-up y cursor ya al día', () => {
  const larga = ventanaMinutos(utc('2026-07-29T03:00:00Z'), utc('2026-07-29T06:00:00Z'), 15)
  assert.equal(larga.length, 15)
  assert.equal(larga[0].toISOString(), '2026-07-29T05:46:00.000Z')
  assert.equal(larga[14].toISOString(), '2026-07-29T06:00:00.000Z')
  assert.deepEqual(ventanaMinutos(utc('2026-07-29T06:00:00Z'), utc('2026-07-29T06:00:40Z')), [])
})

test('jobsDue: el escenario real del incidente — 06:00 con catch-up', () => {
  const v = ventanaMinutos(utc('2026-07-29T05:59:00Z'), utc('2026-07-29T06:01:00Z'))
  const paths = jobsDue(v).map(j => j.path)
  assert.ok(paths.includes('/api/cron/psd2-sync'))
  assert.ok(paths.includes('/api/cron/borme-ingesta'))
  assert.ok(paths.includes('/api/cron/subastas-ingesta'))
  assert.ok(paths.includes('/api/sivra/expenses/agent/scan'))
  assert.ok(paths.includes('/api/sivra/mensajes/auto-reply')) // */3 casa 06:00
  assert.ok(!paths.includes('/api/cron/subastas-enriquecer')) // 06:15, fuera de ventana
})

test('jobsDue: cada job una sola vez aunque la ventana cubra varios disparos suyos', () => {
  const v = ventanaMinutos(utc('2026-07-29T09:59:00Z'), utc('2026-07-29T10:09:00Z'))
  const autoReply = jobsDue(v).filter(j => j.path === '/api/sivra/mensajes/auto-reply')
  assert.equal(autoReply.length, 1)
})

test('truncarAMinuto quita segundos y milisegundos', () => {
  assert.equal(truncarAMinuto(utc('2026-07-29T06:00:59.900Z')).toISOString(), '2026-07-29T06:00:00.000Z')
})
