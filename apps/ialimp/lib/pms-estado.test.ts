import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoSync, esSyncSano, antiguedadTexto, HORAS_SYNC_FRESCO } from './pms-estado.ts'

const AHORA = new Date('2026-07-30T20:00:00Z')
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3_600_000)

test('sin haber sincronizado NUNCA no puede salir «activo»', () => {
  // Es el caso que motivó todo: `activa=true` + `sync_error=null` pintaba verde
  // aunque el proceso no hubiera corrido jamás.
  const r = estadoSync({ activa: true, lastSyncAt: null, syncError: null }, AHORA)
  assert.equal(r.estado, 'nunca')
  assert.equal(esSyncSano(r), false)
})

test('un cron muerto se ve, aunque no haya error registrado', () => {
  const r = estadoSync({ activa: true, lastSyncAt: haceHoras(72), syncError: null }, AHORA)
  assert.equal(r.estado, 'desactualizado')
  assert.equal(esSyncSano(r), false)
  assert.match(r.etiqueta, /3 días/)
})

test('el cron muerto manda sobre un error viejo', () => {
  // Con días sin ejecutarse, el último `sync_error` es historia: lo urgente es
  // que no corre.
  const r = estadoSync({ activa: true, lastSyncAt: haceHoras(50), syncError: 'Smoobu 401' }, AHORA)
  assert.equal(r.estado, 'desactualizado')
})

test('sincronización reciente CON error no es sana', () => {
  const r = estadoSync({ activa: true, lastSyncAt: haceHoras(0.2), syncError: 'Smoobu 500' }, AHORA)
  assert.equal(r.estado, 'error')
  assert.equal(esSyncSano(r), false)
  assert.match(r.detalle, /Smoobu 500/)
})

test('solo hay verde con dato fresco y sin errores', () => {
  const r = estadoSync({ activa: true, lastSyncAt: haceHoras(0.1), syncError: null }, AHORA)
  assert.equal(r.estado, 'ok')
  assert.equal(esSyncSano(r), true)
  assert.match(r.etiqueta, /● Activo/)
})

test('una conexión desactivada a mano no es una avería', () => {
  const r = estadoSync({ activa: false, lastSyncAt: null, syncError: null }, AHORA)
  assert.equal(r.estado, 'inactiva')
})

test('el umbral es generoso frente a la cadencia de 10 min del cron', () => {
  assert.ok(HORAS_SYNC_FRESCO >= 1)
  const justoDentro = estadoSync({ activa: true, lastSyncAt: haceHoras(HORAS_SYNC_FRESCO - 0.1), syncError: null }, AHORA)
  assert.equal(justoDentro.estado, 'ok')
})

test('antiguedadTexto en minutos, horas y días', () => {
  assert.equal(antiguedadTexto(0.5), 'hace 30 min')
  assert.equal(antiguedadTexto(5), 'hace 5 h')
  assert.equal(antiguedadTexto(72), 'hace 3 días')
})
