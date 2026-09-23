import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarAccion, validarTarea, type EstadoActual } from './oportunidad-seguimiento.ts'

const hoy = new Date(Date.UTC(2026, 8, 23))
const lead: EstadoActual = { estado: 'competencia', aparcadaHasta: null }

test('perder exige motivo, y cuál compañía si fue la competencia', () => {
  assert.equal(aplicarAccion(lead, { accion: 'perder' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'perder', motivo: 'inventado' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'perder', motivo: 'competidor' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'perder', motivo: 'otro' }, hoy).ok, false)
  const r = aplicarAccion(lead, { accion: 'perder', motivo: 'competidor', competidor: 'Mapfre', primaCompetidor: '310,50' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.cambios.estado, 'perdida')
  assert.equal(r.cambios.primaCompetidor, 310.5)
  assert.equal(r.cambios.cerrada, true)
})

test('una prima de 0 no es una prima', () => {
  assert.equal(aplicarAccion(lead, { accion: 'perder', motivo: 'precio', primaCompetidor: 0 }, hoy).ok, false)
})

test('lo cerrado no se pierde ni se aparca; ganar solo desde negociación', () => {
  const ganada: EstadoActual = { estado: 'ganada', aparcadaHasta: null }
  assert.equal(aplicarAccion(ganada, { accion: 'perder', motivo: 'precio' }, hoy).ok, false)
  assert.equal(aplicarAccion(ganada, { accion: 'aparcar', aparcadaHasta: '2027-01-01', detalle: 'x' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'ganar' }, hoy).ok, false)
  assert.ok(aplicarAccion({ estado: 'pendiente_cliente', aparcadaHasta: null }, { accion: 'ganar' }, hoy).ok)
  assert.equal(aplicarAccion({ estado: 'en_negociacion', aparcadaHasta: null }, { accion: 'ganar', polizaGanadaId: 'x' }, hoy).ok, false)
})

test('aparcar conserva el estado, exige fecha futura, tope y motivo', () => {
  assert.equal(aplicarAccion(lead, { accion: 'aparcar', aparcadaHasta: '2026-09-23', detalle: 'x' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'aparcar', aparcadaHasta: '2028-09-23', detalle: 'x' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'aparcar', aparcadaHasta: '2027-09-01' }, hoy).ok, false)
  assert.equal(aplicarAccion(lead, { accion: 'aparcar', aparcadaHasta: '2027-02-30', detalle: 'x' }, hoy).ok, false)
  const r = aplicarAccion(lead, { accion: 'aparcar', aparcadaHasta: '2027-09-01', detalle: '3 intentos sin respuesta' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.cambios.estado, 'competencia')
  assert.equal(r.cambios.aparcadaHasta, '2027-09-01')
  assert.equal(r.cambios.aparcadaMotivo, '3 intentos sin respuesta')
  assert.equal(r.cambios.motivoDetalle, undefined)
})

test('ganar sin póliza no borra la que hubiera; al desaparcar se borra su motivo', () => {
  const g = aplicarAccion({ estado: 'en_negociacion', aparcadaHasta: null }, { accion: 'ganar' }, hoy)
  assert.ok(g.ok)
  assert.equal(g.cambios.polizaGanadaId, undefined)
  const i = aplicarAccion({ estado: 'competencia', aparcadaHasta: '2027-01-01' }, { accion: 'interesado' }, hoy)
  assert.ok(i.ok)
  assert.equal(i.cambios.aparcadaMotivo, null)
})

test('reabrir: la perdida vuelve a negociación y borra el motivo; lo aparcado se desaparca', () => {
  const r = aplicarAccion({ estado: 'perdida', aparcadaHasta: null }, { accion: 'reabrir' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.cambios.estado, 'en_negociacion')
  assert.equal(r.cambios.motivoPerdida, null)
  const a = aplicarAccion({ estado: 'competencia', aparcadaHasta: '2027-01-01' }, { accion: 'reabrir' }, hoy)
  assert.ok(a.ok)
  assert.equal(a.cambios.aparcadaHasta, null)
  assert.equal(aplicarAccion(lead, { accion: 'reabrir' }, hoy).ok, false)
})

test('interesado y propuesta mueven el embudo y desaparcan', () => {
  const r = aplicarAccion({ estado: 'competencia', aparcadaHasta: '2027-01-01' }, { accion: 'interesado' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.cambios.estado, 'en_negociacion')
  assert.equal(r.cambios.aparcadaHasta, null)
  assert.equal(aplicarAccion({ estado: 'pendiente_cliente', aparcadaHasta: null }, { accion: 'interesado' }, hoy).ok, false)
})

test('una tarea sin fecha o en el pasado no es seguimiento', () => {
  assert.equal(validarTarea({ tipo: 'llamada', observaciones: 'llamar' }, hoy).ok, false)
  assert.equal(validarTarea({ tipo: 'llamada', observaciones: 'llamar', fechaLimite: '2026-09-22' }, hoy).ok, false)
  assert.equal(validarTarea({ tipo: 'fax', observaciones: 'x', fechaLimite: '2026-09-30' }, hoy).ok, false)
  assert.equal(validarTarea({ tipo: 'llamada', observaciones: '  ', fechaLimite: '2026-09-30' }, hoy).ok, false)
  const r = validarTarea({ tipo: 'llamada', observaciones: 'confirmar fecha', fechaLimite: '2026-09-23' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.tarea.prioridad, 'media')
})

test('la lista de motivos es la misma que la del CHECK de la BD', async () => {
  const { readFileSync } = await import('node:fs')
  const { MOTIVOS_PERDIDA } = await import('./oportunidad-seguimiento.ts')
  const sql = readFileSync(new URL('../../../apps/asegura/prisma/sql/2026-09-23_oportunidad_seguimiento.sql', import.meta.url), 'utf8')
  const lista = /motivo_perdida IN\s*\(([^)]*)\)/.exec(sql)?.[1] ?? ''
  const enSql = [...lista.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  assert.deepEqual(enSql, [...MOTIVOS_PERDIDA])
})
