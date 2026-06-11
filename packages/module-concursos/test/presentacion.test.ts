// Tests de la lógica PURA de presentación + plazos (F6).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diasEntre, sumarDiasHabiles } from '../src/presentacion.ts'

test('diasEntre: diferencia en días naturales (hasta − desde)', () => {
  assert.equal(diasEntre('2026-06-11', '2026-06-20'), 9)
  assert.equal(diasEntre('2026-06-20', '2026-06-11'), -9)
  assert.equal(diasEntre('2026-06-11', '2026-06-11'), 0)
})

test('sumarDiasHabiles: salta sábados y domingos', () => {
  // jueves 2026-06-11 + 3 hábiles → vie 12, lun 15, mar 16
  assert.equal(sumarDiasHabiles('2026-06-11', 3), '2026-06-16')
  // viernes 2026-06-12 + 1 hábil → lunes 15
  assert.equal(sumarDiasHabiles('2026-06-12', 1), '2026-06-15')
})

test('sumarDiasHabiles: 0 días devuelve la misma fecha', () => {
  assert.equal(sumarDiasHabiles('2026-06-11', 0), '2026-06-11')
})

import { estadoPresentacion } from '../src/presentacion.ts'
import type { FichaConcurso, SobresListos } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'x', tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

const TODOS: SobresListos = { administrativo: true, tecnico: true, economico: true }

test('estadoPresentacion: listo cuando el plazo está abierto y los sobres requeridos están', () => {
  const ficha = fichaBase({
    plazos: { fin_presentacion: '2026-06-20' },
    criterios: [
      { nombre: 'Memoria', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' },
      { nombre: 'Precio', puntos: 60, tipo: 'automatico', sobre: 'economico' },
    ],
  })
  const e = estadoPresentacion(ficha, '2026-06-11', TODOS)
  assert.equal(e.dias_para_fin, 9)
  assert.equal(e.plazo_abierto, true)
  assert.equal(e.urgente, false)
  assert.equal(e.listo, true)
  assert.deepEqual(e.pendientes, [])
})

test('estadoPresentacion: marca pendientes los sobres requeridos que faltan', () => {
  const ficha = fichaBase({
    plazos: { fin_presentacion: '2026-06-20' },
    criterios: [{ nombre: 'Memoria', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' }],
  })
  const e = estadoPresentacion(ficha, '2026-06-11', { administrativo: true, tecnico: false, economico: false })
  assert.equal(e.listo, false)
  assert.ok(e.pendientes.some(p => /técnico/i.test(p)))
  // sin criterio económico, el sobre económico NO es requerido → no aparece
  assert.ok(!e.pendientes.some(p => /económic/i.test(p)))
})

test('estadoPresentacion: urgente cuando quedan <= 3 días', () => {
  const ficha = fichaBase({ plazos: { fin_presentacion: '2026-06-13' } })
  const e = estadoPresentacion(ficha, '2026-06-11', TODOS)
  assert.equal(e.dias_para_fin, 2)
  assert.equal(e.urgente, true)
})

test('estadoPresentacion: plazo cerrado si la fecha ya pasó', () => {
  const ficha = fichaBase({ plazos: { fin_presentacion: '2026-06-01' } })
  const e = estadoPresentacion(ficha, '2026-06-11', TODOS)
  assert.equal(e.plazo_abierto, false)
  assert.equal(e.listo, false)
  assert.ok(e.pendientes.some(p => /plazo/i.test(p)))
})

test('estadoPresentacion: sin fecha de fin, dias null y plazo abierto', () => {
  const e = estadoPresentacion(fichaBase(), '2026-06-11', TODOS)
  assert.equal(e.dias_para_fin, null)
  assert.equal(e.plazo_abierto, true)
})

import { plazoSubsanacion } from '../src/presentacion.ts'

test('plazoSubsanacion: 3 días hábiles por defecto (art. 141 LCSP)', () => {
  const p = plazoSubsanacion('2026-06-11') // jueves
  assert.equal(p.dias_habiles, 3)
  assert.equal(p.fecha_limite, '2026-06-16') // vie 12, lun 15, mar 16
})

test('plazoSubsanacion: admite otro número de días hábiles', () => {
  const p = plazoSubsanacion('2026-06-12', 1) // viernes + 1 hábil → lunes
  assert.equal(p.fecha_limite, '2026-06-15')
  assert.equal(p.dias_habiles, 1)
})
