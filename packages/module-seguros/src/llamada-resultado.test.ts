import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFIJO_LLAMADA_CONTESTADA, PREFIJO_LLAMADA_SIN_RESPUESTA, planLlamada } from './llamada-resultado.ts'

const hoy = new Date('2026-09-23T10:00:00Z')

test('una oportunidad cerrada no admite llamadas', () => {
  assert.equal(planLlamada({ resultado: 'no_contesta' }, 'ganada', hoy).ok, false)
  assert.equal(planLlamada({ resultado: 'no_contesta' }, 'perdida', hoy).ok, false)
  assert.equal(planLlamada({ resultado: 'inventado' }, 'competencia', hoy).ok, false)
})

test('quiere precio: pasa a interesado y deja la comparativa con fecha', () => {
  const r = planLlamada({ resultado: 'quiere_precio', nota: 'tiene dos coches' }, 'competencia', hoy)
  assert.ok(r.ok)
  assert.deepEqual(r.plan.accion, { accion: 'interesado' })
  assert.equal(r.plan.siguiente?.fechaLimite, '2026-09-25')
  assert.equal(r.plan.siguiente?.prioridad, 'alta')
  assert.ok(r.plan.registro.startsWith(PREFIJO_LLAMADA_CONTESTADA))
  assert.ok(r.plan.registro.endsWith('tiene dos coches'))
  // Con propuesta ya enviada no se retrocede a «interesado».
  const p = planLlamada({ resultado: 'quiere_precio' }, 'pendiente_cliente', hoy)
  assert.ok(p.ok)
  assert.equal(p.plan.accion, null)
})

test('otro día: exige una fecha futura y cercana, y deja la rellamada', () => {
  assert.equal(planLlamada({ resultado: 'otro_dia' }, 'competencia', hoy).ok, false)
  assert.equal(planLlamada({ resultado: 'otro_dia', volverEl: '2026-09-23' }, 'competencia', hoy).ok, false)
  assert.equal(planLlamada({ resultado: 'otro_dia', volverEl: '2026-12-31' }, 'competencia', hoy).ok, false)
  assert.equal(planLlamada({ resultado: 'otro_dia', volverEl: '2026-02-30' }, 'competencia', hoy).ok, false)
  const r = planLlamada({ resultado: 'otro_dia', volverEl: '2026-09-26' }, 'competencia', hoy)
  assert.ok(r.ok)
  assert.equal(r.plan.siguiente?.tipo, 'llamada')
  assert.equal(r.plan.siguiente?.fechaLimite, '2026-09-26')
  assert.ok(r.plan.registro.startsWith(PREFIJO_LLAMADA_CONTESTADA))
})

test('no contesta: solo se registra; el siguiente paso lo pone la secuencia', () => {
  const r = planLlamada({ resultado: 'no_contesta' }, 'competencia', hoy)
  assert.ok(r.ok)
  assert.equal(r.plan.accion, null)
  assert.equal(r.plan.siguiente, null)
  // No cuenta como que respondió.
  assert.ok(!r.plan.registro.startsWith(PREFIJO_LLAMADA_CONTESTADA))
  assert.ok(r.plan.registro.startsWith(PREFIJO_LLAMADA_SIN_RESPUESTA))
})

test('no le interesa: pide motivo y aparca hasta el año que viene', () => {
  assert.equal(planLlamada({ resultado: 'no_interesa' }, 'competencia', hoy).ok, false)
  assert.equal(planLlamada({ resultado: 'no_interesa', motivo: 'otro' }, 'competencia', hoy).ok, false)
  const r = planLlamada({ resultado: 'no_interesa', motivo: 'precio' }, 'en_negociacion', hoy)
  assert.ok(r.ok)
  assert.equal(r.plan.accion?.accion, 'aparcar')
  assert.equal(r.plan.accion?.aparcadaHasta, '2027-09-23')
  assert.match(String(r.plan.accion?.detalle), /precio/)
})
