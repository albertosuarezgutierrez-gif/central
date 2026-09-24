import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVO_DESCARTE, aplicarAccion, validarAltaOportunidad, validarEdicionOportunidad } from './oportunidad-seguimiento.ts'

const hoy = new Date(Date.UTC(2026, 8, 24))

test('alta a mano: nace con su primer paso o no nace', () => {
  assert.equal(validarAltaOportunidad({ ramo: 'hogar' }, hoy).ok, false, 'sin fecha del primer paso no se abre')
  assert.equal(validarAltaOportunidad({ ramo: 'hogar', fechaTarea: '2026-09-23' }, hoy).ok, false, 'primer paso en el pasado')
  assert.equal(validarAltaOportunidad({ fechaTarea: '2026-09-25' }, hoy).ok, false, 'sin ramo')
  assert.equal(validarAltaOportunidad({ ramo: 'hogar', estado: 'ganada', fechaTarea: '2026-09-25' }, hoy).ok, false, 'no nace ganada')
  const r = validarAltaOportunidad({ ramo: 'hogar', fechaTarea: '2026-09-25', aseguradora: ' Mapfre ', prima: '412,50', fechaFinVigencia: '' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.alta.estado, 'en_negociacion')
  assert.equal(r.alta.tarea.tipo, 'llamada')
  assert.equal(r.alta.tarea.fechaLimite, '2026-09-25')
  assert.equal(r.alta.aseguradora, 'Mapfre')
  assert.equal(r.alta.prima, 412.5)
  assert.equal(r.alta.fechaFinVigencia, null)
})

test('alta: una prima de 0 no es una prima (NULL ≠ 0)', () => {
  assert.equal(validarAltaOportunidad({ ramo: 'auto', fechaTarea: '2026-09-25', prima: 0 }, hoy).ok, false)
  const r = validarAltaOportunidad({ ramo: 'auto', fechaTarea: '2026-09-25', prima: '' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.alta.prima, null)
})

test('edición: undefined no toca, vacío borra, nada que cambiar es un error', () => {
  assert.equal(validarEdicionOportunidad({}).ok, false)
  assert.equal(validarEdicionOportunidad({ ramo: 'barco' }).ok, false)
  assert.equal(validarEdicionOportunidad({ fechaFinVigencia: '2026-02-30' }).ok, false)
  const r = validarEdicionOportunidad({ aseguradora: '', fechaFinVigencia: '2027-01-31' })
  assert.ok(r.ok)
  assert.deepEqual(r.cambios, { aseguradora: null, fechaFinVigencia: '2027-01-31' })
  assert.equal('ramo' in r.cambios, false)
  assert.equal('prima' in r.cambios, false)
})

test('descartar es perder con MOTIVO_DESCARTE, sin exigir detalle, y solo desde abierta', () => {
  const abierta = aplicarAccion({ estado: 'competencia', aparcadaHasta: null }, { accion: 'perder', motivo: MOTIVO_DESCARTE }, hoy)
  assert.ok(abierta.ok)
  assert.equal(abierta.cambios.motivoPerdida, 'error_alta')
  assert.equal(aplicarAccion({ estado: 'ganada', aparcadaHasta: null }, { accion: 'perder', motivo: MOTIVO_DESCARTE }, hoy).ok, false)
})

test('el motivo de descartar no vale para una venta perdida ni para «no le interesa»', async () => {
  const { MOTIVOS_PERDIDA_VENTA } = await import('./oportunidad-seguimiento.ts')
  const { planLlamada } = await import('./llamada-resultado.ts')
  assert.equal(MOTIVOS_PERDIDA_VENTA.includes(MOTIVO_DESCARTE), false)
  assert.equal(planLlamada({ resultado: 'no_interesa', motivo: MOTIVO_DESCARTE }, 'competencia', hoy).ok, false)
})
