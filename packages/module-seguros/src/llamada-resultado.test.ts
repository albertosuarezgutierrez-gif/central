import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFIJO_LLAMADA_CONTESTADA, PREFIJO_LLAMADA_SIN_RESPUESTA, PREFIJO_WHATSAPP_RESPONDIDO, planLlamada } from './llamada-resultado.ts'

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

test('respuesta por WhatsApp (30/09/2026): mismo plan, registro propio y sin canal sigue siendo llamada', () => {
  const wa = planLlamada({ resultado: 'quiere_precio', canal: 'whatsapp' }, 'competencia', hoy)
  assert.ok(wa.ok)
  assert.equal(wa.plan.canal, 'whatsapp')
  assert.ok(wa.plan.registro.startsWith(PREFIJO_WHATSAPP_RESPONDIDO))
  assert.match(wa.plan.siguiente?.observaciones ?? '', /por WhatsApp/)
  assert.deepEqual(wa.plan.accion, { accion: 'interesado' })
  const tel = planLlamada({ resultado: 'quiere_precio' }, 'competencia', hoy)
  assert.ok(tel.ok)
  assert.equal(tel.plan.canal, 'llamada')
  assert.ok(tel.plan.registro.startsWith(PREFIJO_LLAMADA_CONTESTADA))
  assert.equal(planLlamada({ resultado: 'quiere_precio', canal: 'paloma' }, 'competencia', hoy).ok, false)
})

test('número equivocado: se aparca y se dice que hay que corregir el teléfono; no es «respondió»', () => {
  const r = planLlamada({ resultado: 'numero_equivocado', canal: 'whatsapp' }, 'competencia', hoy)
  assert.ok(r.ok)
  assert.equal(r.plan.accion?.accion, 'aparcar')
  assert.match(r.plan.accion?.accion === 'aparcar' ? r.plan.accion.detalle ?? '' : '', /corrige el teléfono/)
  assert.equal(r.plan.optOut, false)
  assert.ok(!r.plan.registro.startsWith(PREFIJO_WHATSAPP_RESPONDIDO))
})

test('🪤 pidió la baja: marca la baja (optOut) y aparca; ningún otro resultado la marca', () => {
  const r = planLlamada({ resultado: 'baja', canal: 'whatsapp' }, 'competencia', hoy)
  assert.ok(r.ok)
  assert.equal(r.plan.optOut, true)
  assert.equal(r.plan.accion?.accion, 'aparcar')
  for (const resultado of ['quiere_precio', 'no_contesta', 'numero_equivocado'] as const) {
    const o = planLlamada({ resultado, canal: 'whatsapp' }, 'competencia', hoy)
    assert.ok(o.ok)
    assert.equal(o.plan.optOut, false, resultado)
  }
})
