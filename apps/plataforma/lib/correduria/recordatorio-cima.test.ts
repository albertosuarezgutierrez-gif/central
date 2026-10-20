import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeRecordatorioCima, ordenarCompanias, lineaCompania } from './recordatorio-cima.ts'
import { CRON_JOBS, cronMatches } from '../cron-dispatch.ts'

test('lleva siempre la instrucción del export «Ficheros recibidos»', () => {
  for (const s of [null, [], [{ entidad: 'C1', diasSinFichero: 2 }]]) {
    assert.match(mensajeRecordatorioCima(s), /export «Ficheros recibidos» del último mes/)
  }
})

test('silencio null = no se pudo leer; NUNCA se pinta como al día', () => {
  const m = mensajeRecordatorioCima(null)
  assert.match(m, /No he podido leer/)
  assert.doesNotMatch(m, /días sin mandar|fichero hoy/)
})

test('por compañía: más días primero, nunca-mandó el primero, 0 es «hoy»', () => {
  const m = mensajeRecordatorioCima([
    { entidad: 'C1', nombre: 'Allianz', diasSinFichero: 0 },
    { entidad: 'C2', nombre: 'Mapfre', diasSinFichero: 9 },
    { entidad: 'C3', diasSinFichero: null },
  ])
  const l = m.split('\n').filter((x) => x.startsWith('•'))
  assert.match(l[0], /C3: nunca ha mandado/)
  assert.match(l[1], /Mapfre \(C2\): 9 días sin mandar/)
  assert.match(l[2], /Allianz \(C1\): fichero hoy/)
})

test('escapa HTML y recorta a 25 filas', () => {
  assert.match(lineaCompania({ entidad: 'X', nombre: 'A<b>&Co', diasSinFichero: 1 }), /A&lt;b&gt;&amp;Co \(X\): 1 día sin mandar/)
  const muchas = Array.from({ length: 30 }, (_, i) => ({ entidad: `C${i}`, diasSinFichero: i }))
  const m = mensajeRecordatorioCima(muchas)
  assert.equal(m.split('\n').filter((x) => x.startsWith('•')).length, 25)
  assert.match(m, /y 5 compañía\(s\) más/)
  assert.equal(ordenarCompanias(muchas)[0].diasSinFichero, 29)
})

test('cron: día 2 de cada mes a las 08:43 UTC, minuto no redondo', () => {
  const j = CRON_JOBS.find((x) => x.path === '/api/cron/correduria-recordatorio-cima')
  assert.ok(j, 'falta en CRON_JOBS')
  assert.ok(cronMatches(j.schedule, new Date('2026-11-02T08:43:00Z')))
  assert.ok(!cronMatches(j.schedule, new Date('2026-11-03T08:43:00Z')))
  assert.ok(!cronMatches(j.schedule, new Date('2026-11-02T08:00:00Z')))
})
