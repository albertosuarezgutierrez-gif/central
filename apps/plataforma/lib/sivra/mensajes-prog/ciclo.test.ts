import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CICLO, PASOS_CON_CODIGOS } from './ciclo.ts'
import { TIPOS_MENSAJE } from './plantillas.ts'

test('el resumen del panel cubre EXACTAMENTE los hitos que el sistema manda', () => {
  const descritos = CICLO.map(p => p.tipo).sort()
  assert.deepEqual(descritos, [...TIPOS_MENSAJE].sort(),
    'un hito sin describir se omitiría del panel en silencio: Alberto creería que se manda menos de lo que se manda')
})

test('ningún hito duplicado', () => {
  assert.equal(new Set(CICLO.map(p => p.tipo)).size, CICLO.length)
})

test('todos los pasos dicen cuándo y qué llevan', () => {
  for (const p of CICLO) {
    assert.ok(p.titulo.length > 2, `${p.tipo} sin título`)
    assert.ok(p.cuando.length > 5, `${p.tipo} sin cuándo`)
    assert.ok(p.contenido.length > 20, `${p.tipo} sin contenido`)
  }
})

test('la víspera de llegada es el hito de los códigos', () => {
  assert.deepEqual(PASOS_CON_CODIGOS, ['vispera_llegada'],
    'si algún día otro hito entrega códigos, el panel debe decirlo: es lo que decide si un huésped entra')
})
