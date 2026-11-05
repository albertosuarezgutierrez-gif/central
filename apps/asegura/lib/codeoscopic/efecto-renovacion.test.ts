// Regla de renovación (Alberto, 05/11/2026). Todas las fechas son RELATIVAS a un `hoy` inyectado.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluarEfectoRenovacion, corteDeVencimiento, fechaBaseRenovacion, sumarMeses } from './efecto-renovacion.ts'
import { sumarDias } from './fecha-efecto.ts'

const HOY = '2026-11-05'
const en = (n: number) => sumarDias(HOY, n)

test('vencimiento confirmado dentro de la ventana: efecto = vencimiento EXACTO, sin forzar', () => {
  for (const n of [0, 1, 45, 90]) {
    const r = evaluarEfectoRenovacion({ vencimiento: en(n), hoy: HOY })
    assert.deepEqual(r, { ok: true, fechaEfecto: en(n), forzada: false }, `a ${n} días`)
  }
})

test('anualidad nueva ya emitida (efecto_actual > hoy): el efecto es fecha_efecto_actual, no el vencimiento', () => {
  const efecto = en(35)
  const venc = sumarDias(efecto, 365) // como la póliza piloto: efecto 10/12 → vencimiento un año después
  const r = evaluarEfectoRenovacion({ vencimiento: venc, efectoActual: efecto, hoy: HOY })
  assert.deepEqual(r, { ok: true, fechaEfecto: efecto, forzada: false })
  assert.equal(fechaBaseRenovacion(venc, efecto, HOY), efecto)
})

test('efecto_actual pasado o hoy: manda el vencimiento', () => {
  assert.equal(fechaBaseRenovacion(en(30), en(-300), HOY), en(30))
  assert.equal(fechaBaseRenovacion(en(30), HOY, HOY), en(30))
  assert.equal(evaluarEfectoRenovacion({ vencimiento: en(30), efectoActual: en(-335), hoy: HOY }).ok, true)
})

test('la ventana de 90 días se mide sobre ESA fecha (la nueva anualidad, no el vencimiento lejano)', () => {
  const lejos = evaluarEfectoRenovacion({ vencimiento: en(500), efectoActual: en(120), hoy: HOY })
  assert.equal(lejos.ok, false)
  if (!lejos.ok) assert.equal(lejos.causa, 'fuera_de_ventana')
  const dentro = evaluarEfectoRenovacion({ vencimiento: sumarDias(en(60), 365), efectoActual: en(60), hoy: HOY })
  assert.equal(dentro.ok, true)
})

test('sin ninguna fecha: corte gratis', () => {
  for (const v of [null, undefined, '', 'no-es-fecha']) {
    const r = evaluarEfectoRenovacion({ vencimiento: v, hoy: HOY })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.causa, 'sin_vencimiento')
  }
})

test('vencimiento pasado: corte gratis', () => {
  const r = evaluarEfectoRenovacion({ vencimiento: en(-1), hoy: HOY })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.causa, 'vencimiento_pasado')
})

test('a más de 90 días: corte gratis; a 91 sí, a 90 no', () => {
  const r = evaluarEfectoRenovacion({ vencimiento: en(91), hoy: HOY })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.causa, 'fuera_de_ventana')
  assert.equal(evaluarEfectoRenovacion({ vencimiento: en(90), hoy: HOY }).ok, true)
})

test('sospechoso: efecto→vencimiento > 400 días, vencimiento no posterior al efecto, o vencimiento ausente con efecto futuro', () => {
  const efecto = en(30)
  const largo = evaluarEfectoRenovacion({ vencimiento: sumarDias(efecto, 401), efectoActual: efecto, hoy: HOY })
  assert.equal(largo.ok, false)
  if (!largo.ok) assert.equal(largo.causa, 'vencimiento_sospechoso')
  const alReves = evaluarEfectoRenovacion({ vencimiento: efecto, efectoActual: efecto, hoy: HOY })
  assert.equal(alReves.ok, false)
  const sinV = evaluarEfectoRenovacion({ vencimiento: null, efectoActual: efecto, hoy: HOY })
  assert.equal(sinV.ok, false)
  // 400 justos valen (anual + margen).
  assert.equal(evaluarEfectoRenovacion({ vencimiento: sumarDias(efecto, 400), efectoActual: efecto, hoy: HOY }).ok, true)
  // Efecto pasado con vencimiento a >400 días de él: sospechoso (aunque el vencimiento esté en ventana).
  const venc = en(20)
  const rancio = evaluarEfectoRenovacion({ vencimiento: venc, efectoActual: sumarDias(venc, -401), hoy: HOY })
  assert.equal(rancio.ok, false)
})

test('el año distinto NO es motivo de corte (solo cuentan ventana y duración)', () => {
  const hoy = '2026-12-20'
  const r = evaluarEfectoRenovacion({ vencimiento: '2027-02-10', hoy })
  assert.equal(r.ok, true)
})

test('sin efecto_actual conocido no se afirma nada sospechoso', () => {
  assert.equal(corteDeVencimiento(en(30), null, HOY), null)
})

test('fecha explícita del operador: se permite y queda marcada como forzada', () => {
  const otra = en(20)
  const r = evaluarEfectoRenovacion({ vencimiento: en(45), hoy: HOY, explicita: otra })
  assert.equal(r.ok, true)
  if (r.ok && r.forzada) {
    assert.equal(r.fechaEfecto, otra)
    assert.match(r.aviso, /forzada por el operador/)
    assert.equal(r.saltaCorte, null)
  } else assert.fail('debía ser forzada')
})

test('fecha explícita que salta un corte (sin fechas): permitida, registra qué corte salta', () => {
  const r = evaluarEfectoRenovacion({ vencimiento: null, hoy: HOY, explicita: en(10) })
  assert.equal(r.ok, true)
  if (r.ok && r.forzada) assert.equal(r.saltaCorte, 'sin_vencimiento')
  else assert.fail('debía ser forzada')
})

test('explícita igual a la fecha base y sin corte: no cuenta como forzada', () => {
  const r = evaluarEfectoRenovacion({ vencimiento: en(30), hoy: HOY, explicita: en(30) })
  assert.deepEqual(r, { ok: true, fechaEfecto: en(30), forzada: false })
})

test('sumarMeses no desborda el día', () => {
  assert.equal(sumarMeses('2027-01-31', 1), '2027-02-28')
  assert.equal(sumarMeses('2026-11-05', -13), '2025-10-05')
})
