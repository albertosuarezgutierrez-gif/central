import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decidirAviso, DIAS_URGENTE, type EntradaAviso } from '../src/aviso.ts'

/** Base: rentable, leída, limpia y con plazo de sobra. */
function base(extra: Partial<EntradaAviso> = {}): EntradaAviso {
  return {
    rentable: true,
    semaforo: 'verde',
    cargasSubsistentes: 0,
    cargasConocidas: true,
    documentosLeidos: true,
    diasParaCierre: 20,
    claves: [],
    ...extra,
  }
}

test('rentable, leída y limpia → avisa', () => {
  const r = decidirAviso(base())
  assert.equal(r.decision, 'avisar')
  assert.equal(r.sinVerificar, false)
})

test('no rentable → nunca avisa', () => {
  assert.equal(decidirAviso(base({ rentable: false })).decision, 'silenciar')
  // Ni siquiera si cierra mañana y está impecable.
  assert.equal(decidirAviso(base({ rentable: false, diasParaCierre: 1 })).decision, 'silenciar')
})

test('el caso de Belmonte: hereda cargas → se silencia', () => {
  const r = decidirAviso(base({ cargasSubsistentes: 48450, semaforo: 'rojo' }))
  assert.equal(r.decision, 'silenciar')
  assert.ok(r.motivo.includes('heredan cargas'))
})

test('proindiviso → se silencia aunque el semáforo no sea rojo', () => {
  const r = decidirAviso(base({ claves: ['proindiviso'], semaforo: 'ambar' }))
  assert.equal(r.decision, 'silenciar')
  assert.ok(r.motivo.includes('proindiviso'))
})

test('semáforo rojo (ocupada) → se silencia', () => {
  assert.equal(decidirAviso(base({ semaforo: 'rojo' })).decision, 'silenciar')
})

test('sin leer la documentación → ESPERA, no avisa a ciegas', () => {
  const r = decidirAviso(base({ documentosLeidos: false, cargasConocidas: false, semaforo: null, cargasSubsistentes: null }))
  assert.equal(r.decision, 'esperar')
})

test('sin leer pero a punto de cerrar → avisa marcado como sin verificar', () => {
  const r = decidirAviso(base({
    documentosLeidos: false,
    cargasConocidas: false,
    semaforo: null,
    cargasSubsistentes: null,
    diasParaCierre: DIAS_URGENTE,
  }))
  assert.equal(r.decision, 'avisar')
  assert.equal(r.sinVerificar, true)
})

test('leída pero sin poder cuantificar la carga: silencia con plazo, avisa si urge', () => {
  assert.equal(decidirAviso(base({ cargasSubsistentes: null })).decision, 'silenciar')
  const urgente = decidirAviso(base({ cargasSubsistentes: null, diasParaCierre: 2 }))
  assert.equal(urgente.decision, 'avisar')
  assert.equal(urgente.sinVerificar, true)
})

test('ámbar sin cargas subsistentes sí avisa (ámbar suele ser «posesión no consta»)', () => {
  const r = decidirAviso(base({ semaforo: 'ambar' }))
  assert.equal(r.decision, 'avisar')
  assert.equal(r.sinVerificar, false)
})

test('sin fecha de cierre no se considera urgente', () => {
  const r = decidirAviso(base({ documentosLeidos: false, cargasConocidas: false, diasParaCierre: null }))
  assert.equal(r.decision, 'esperar')
})
