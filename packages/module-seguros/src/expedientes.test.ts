import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_DIAS_POSPONER,
  claseOportunidad,
  esExpedienteDeTrabajo,
  esRenovacionAutomatica,
  esTrabajada,
  esRescateDeRecibo,
  estadoVisible,
  fechaPospuesta,
  importeReciboRescate,
  notasEditadas,
  textoRetomar,
  vueltaRescatePerdido,
} from './expedientes.ts'
import { validarEdicionOportunidad } from './oportunidad-seguimiento.ts'

const HOY = '2026-10-13'

// ── Clase ────────────────────────────────────────────────────────────────────

test('clase: un devuelto (automático o abierto a mano) y una retención de CIMA son RESCATE', () => {
  assert.equal(claseOportunidad({ fuente: 'renovacion', origen: 'recibo_devuelto', motivo: null }), 'rescate')
  assert.equal(claseOportunidad({ fuente: 'renovacion', origen: 'ficha:manual', motivo: 'recibo_devuelto' }), 'rescate')
  assert.equal(claseOportunidad({ fuente: 'renovacion', origen: 'retencion_cima', motivo: null }), 'rescate')
})

test('clase: renovación, año siguiente de una baja o de un rescate perdido, portal y aviso web son MEJORA', () => {
  assert.equal(claseOportunidad({ fuente: 'renovacion', origen: 'poliza:riesgo', motivo: null }), 'mejora_renovacion')
  assert.equal(claseOportunidad({ fuente: 'renovacion', origen: 'baja_verificada', motivo: null }), 'mejora_renovacion')
  assert.equal(claseOportunidad({ fuente: null, origen: 'rescate_perdido', motivo: null }), 'mejora_renovacion')
  assert.equal(claseOportunidad({ fuente: 'web', origen: 'web:aviso-vencimiento', motivo: null }), 'mejora_renovacion')
  assert.equal(claseOportunidad({ fuente: 'venta_directa', origen: 'portal:mejorar-precio', motivo: null }), 'mejora_renovacion')
})

test('clase: el resto (y el cajón «otros») es VENTA NUEVA, nunca «otro»', () => {
  assert.equal(claseOportunidad({ fuente: 'venta_directa', origen: 'documento:ficha', motivo: null }), 'venta_nueva')
  assert.equal(claseOportunidad({ fuente: 'otros', origen: null, motivo: null }), 'venta_nueva')
  assert.equal(claseOportunidad({ fuente: null, origen: null, motivo: null }), 'venta_nueva')
})

test('rescate de RECIBO: la retención por anulación de CIMA no lo es', () => {
  assert.equal(esRescateDeRecibo({ fuente: 'renovacion', origen: 'recibo_devuelto', motivo: null }), true)
  assert.equal(esRescateDeRecibo({ fuente: 'renovacion', origen: 'ficha:manual', motivo: 'recibo_devuelto' }), true)
  assert.equal(esRescateDeRecibo({ fuente: 'renovacion', origen: 'retencion_cima', motivo: null }), false)
})

// ── Estado visible ───────────────────────────────────────────────────────────

test('estado visible: por contactar y negociando son la MISMA «Abierta»', () => {
  assert.equal(estadoVisible({ estado: 'competencia', aparcadaHasta: null }, HOY), 'abierta')
  assert.equal(estadoVisible({ estado: 'en_negociacion', aparcadaHasta: null }, HOY), 'abierta')
  assert.equal(estadoVisible({ estado: 'pendiente_cliente', aparcadaHasta: null }, HOY), 'esperando_cliente')
})

test('estado visible: aparcada solo si la vuelta es FUTURA; el día de la vuelta ya es abierta', () => {
  assert.equal(estadoVisible({ estado: 'en_negociacion', aparcadaHasta: '2027-01-01' }, HOY), 'aparcada')
  assert.equal(estadoVisible({ estado: 'pendiente_cliente', aparcadaHasta: '2026-10-14' }, HOY), 'aparcada')
  assert.equal(estadoVisible({ estado: 'en_negociacion', aparcadaHasta: HOY }, HOY), 'abierta')
  assert.equal(estadoVisible({ estado: 'pendiente_cliente', aparcadaHasta: '2026-01-01' }, HOY), 'esperando_cliente')
})

test('estado visible: una cerrada nunca se pinta aparcada; un estado desconocido no se adivina', () => {
  assert.equal(estadoVisible({ estado: 'ganada', aparcadaHasta: '2027-01-01' }, HOY), 'ganada')
  assert.equal(estadoVisible({ estado: 'perdida', aparcadaHasta: null }, HOY), 'perdida')
  assert.equal(estadoVisible({ estado: 'otro', aparcadaHasta: null }, HOY), null)
})

// ── Qué entra en la lista ─────────────────────────────────────────────────────

test('lista: la bolsa del volcado sin tocar (competencia) NO entra; lo propio sí', () => {
  assert.equal(esExpedienteDeTrabajo({ estado: 'competencia', delVolcado: true }), false)
  assert.equal(esExpedienteDeTrabajo({ estado: 'competencia', delVolcado: false }), true)
})

test('lista: lo del volcado que ya se trabaja (negociación / esperando) entra', () => {
  assert.equal(esExpedienteDeTrabajo({ estado: 'en_negociacion', delVolcado: true }), true)
  assert.equal(esExpedienteDeTrabajo({ estado: 'pendiente_cliente', delVolcado: true }), true)
})

test('lista: ganadas y perdidas no son trabajo', () => {
  assert.equal(esExpedienteDeTrabajo({ estado: 'ganada', delVolcado: false }), false)
  assert.equal(esExpedienteDeTrabajo({ estado: 'perdida', delVolcado: false }), false)
})

// ── Rescate perdido → año siguiente ───────────────────────────────────────────

test('rescate perdido: vuelve 45 días antes del aniversario del efecto del recibo impagado', () => {
  const v = vueltaRescatePerdido({ vencimientoPoliza: '2026-03-01', efectoRecibo: '2026-09-01', hoy: HOY })
  assert.deepEqual(v, { vence: '2027-09-01', aparcadaHasta: '2027-07-18', estimada: false })
})

test('rescate perdido: sin efecto del recibo, el PRÓXIMO vencimiento de la póliza', () => {
  const v = vueltaRescatePerdido({ vencimientoPoliza: '2026-03-01', efectoRecibo: null, hoy: HOY })
  assert.deepEqual(v, { vence: '2027-03-01', aparcadaHasta: '2027-01-15', estimada: false })
})

test('rescate perdido: sin ninguna fecha, +12 meses y marcado estimado (el vencimiento no se inventa)', () => {
  const v = vueltaRescatePerdido({ vencimientoPoliza: null, efectoRecibo: 'basura', hoy: HOY })
  assert.equal(v.vence, null)
  assert.equal(v.estimada, true)
  assert.equal(v.aparcadaHasta, '2027-08-29') // 13/10/2027 − 45 días
})

test('rescate perdido: siempre futuro y dentro del tope de aparcar (400 días)', () => {
  const v = vueltaRescatePerdido({ vencimientoPoliza: '2026-10-20', efectoRecibo: null, hoy: HOY })
  assert.equal(v.vence, '2026-10-20')
  assert.equal(v.aparcadaHasta, '2026-10-14', 'nunca antes de mañana')
  const lejos = vueltaRescatePerdido({ vencimientoPoliza: '2024-10-12', efectoRecibo: null, hoy: HOY })
  assert.equal(lejos.vence, '2027-10-12')
  assert.ok(lejos.aparcadaHasta > HOY && lejos.aparcadaHasta <= '2027-11-17')
  // Un efecto de hace más de 3 años no se estira: pasa al vencimiento de la póliza (como la baja verificada).
  assert.equal(vueltaRescatePerdido({ vencimientoPoliza: '2027-01-15', efectoRecibo: '2019-05-10', hoy: HOY }).vence, '2027-01-15')
})

// ── Posponer ─────────────────────────────────────────────────────────────────

test('posponer: hoy + N días', () => {
  assert.deepEqual(fechaPospuesta(3, HOY), { ok: true, fecha: '2026-10-16', dias: 3 })
  assert.deepEqual(fechaPospuesta('7', HOY), { ok: true, fecha: '2026-10-20', dias: 7 })
})

test('posponer: 0, negativos, decimales o más de un año se rechazan (nunca se vuelven «hoy»)', () => {
  for (const malo of [0, -2, 1.5, 'tres', null, undefined, MAX_DIAS_POSPONER + 1]) {
    assert.equal(fechaPospuesta(malo, HOY).ok, false, String(malo))
  }
})

test('retomar: el texto lleva el motivo del aparcado', () => {
  assert.equal(textoRetomar('el cliente vuelve de viaje'), 'Retomar: el cliente vuelve de viaje')
  assert.equal(textoRetomar(null), 'Retomar: vuelve del aparcado')
})

// ── Notas ────────────────────────────────────────────────────────────────────

test('notas: texto se guarda, vacío las borra, otra cosa es inválida', () => {
  assert.equal(notasEditadas('  llamar en marzo  '), 'llamar en marzo')
  assert.equal(notasEditadas(''), null)
  assert.equal(notasEditadas(null), null)
  assert.equal(notasEditadas(42), 'invalido')
})

test('notas: la edición de la oportunidad las acepta solas', () => {
  assert.deepEqual(validarEdicionOportunidad({ notas: 'año que viene: pedir precio de hogar' }), { ok: true, cambios: { notas: 'año que viene: pedir precio de hogar' } })
  assert.deepEqual(validarEdicionOportunidad({ notas: '' }), { ok: true, cambios: { notas: null } })
  assert.equal(validarEdicionOportunidad({ notas: 3 }).ok, false)
})

test('importe del recibo de un rescate: 0, negativo o ilegible = «no se sabe» (null), nunca 0€', () => {
  assert.equal(importeReciboRescate('123.45'), 123.45)
  assert.equal(importeReciboRescate('0'), null)
  assert.equal(importeReciboRescate('0.00'), null)
  assert.equal(importeReciboRescate('-50.00'), null)
  assert.equal(importeReciboRescate('basura'), null)
  assert.equal(importeReciboRescate(null), null)
})

// ── «Trabajada» (Mi mesa, 20/10/2026) ────────────────────────────────────────

const ren = (o: Partial<Parameters<typeof esTrabajada>[0]> = {}) => ({ fuente: 'renovacion', origen: null, conImportRef: false, contactada: false, ...o })

test('trabajada: una renovación automática SIN contacto NO es trabajada', () => {
  assert.equal(esTrabajada(ren()), false)
})

test('trabajada: la misma renovación con contacto registrado SÍ', () => {
  assert.equal(esTrabajada(ren({ contactada: true })), true)
})

test('trabajada: lo que no es renovación automática siempre lo es, haya o no contacto', () => {
  assert.equal(esTrabajada({ fuente: 'venta_directa', origen: null, conImportRef: false, contactada: false }), true)
  assert.equal(esTrabajada({ fuente: null, origen: 'rescate_perdido', conImportRef: false, contactada: false }), true)
})

test('trabajada: cada señal de renovación automática la marca (fuente, import_ref, orígenes de aviso)', () => {
  const base = { fuente: 'otros', origen: null, conImportRef: false, contactada: false }
  assert.equal(esTrabajada({ ...base, fuente: 'renovacion' }), false)
  assert.equal(esTrabajada({ ...base, conImportRef: true }), false)
  for (const o of ['renovacion_cartera', 'web:aviso-vencimiento', 'portal:mejorar-precio']) {
    assert.equal(esTrabajada({ ...base, origen: o }), false, o)
  }
  assert.equal(esRenovacionAutomatica({ ...base, origen: 'otro_origen' }), false)
})

test('trabajada: contacto desconocido (null) no esconde la oportunidad', () => {
  assert.equal(esTrabajada(ren({ contactada: null })), true)
})
