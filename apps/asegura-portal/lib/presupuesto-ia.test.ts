import { test } from 'node:test'
import assert from 'node:assert/strict'

import { interpretarLlamada, interpretarRespuestaIA } from './presupuesto-ia.ts'
import { TEXTO_IA_NO_DISPONIBLE } from './presupuesto-ia-textos.ts'
import { coberturasDeJson } from './presupuesto-vista.ts'

test('un 401, un 5xx o una forma rara NO se pintan como resumen', () => {
  assert.deepEqual(interpretarRespuestaIA(401, { error: 'No autorizado' }, 'resumen'), { estado: 'error' })
  assert.deepEqual(interpretarRespuestaIA(503, { estado: 'error' }, 'resumen'), { estado: 'error' })
  assert.deepEqual(interpretarRespuestaIA(200, { estado: 'ok', texto: '' }, 'resumen'), { estado: 'error' })
})

test('no_disponible dice que el resumen no está y la tabla sigue', () => {
  const r = interpretarRespuestaIA(200, { estado: 'no_disponible' }, 'resumen')
  assert.equal(r.estado, 'no_disponible')
  assert.equal((r as { motivo: string }).motivo, TEXTO_IA_NO_DISPONIBLE)
})

test('el límite de preguntas se distingue de un fallo', () => {
  assert.equal(interpretarRespuestaIA(429, { estado: 'limite' }, 'pregunta').estado, 'limite')
  assert.deepEqual(interpretarRespuestaIA(200, { estado: 'ok', texto: 'Hola', restantes: 3 }, 'pregunta'), { estado: 'ok', texto: 'Hola', restantes: 3 })
  assert.deepEqual(interpretarLlamada(200, { estado: 'ok', aviso: 'x' }), { estado: 'ok', aviso: 'x' })
  assert.deepEqual(interpretarLlamada(502, null), { estado: 'error' })
})

test('coberturasDeJson con sobre de Codeoscopic: NO entra en la comparación con la póliza actual (vocabulario distinto; «ver texto» no es «no la tiene»)', () => {
  const sobre = { estado: 'leidas', lista: [
    { nombre: 'Lunas', incluida: true, texto: null },
    { nombre: 'Sustitución', incluida: false, texto: null },
    { nombre: 'Asistencia', incluida: null, texto: 'km 0' },
  ] }
  assert.deepEqual(coberturasDeJson(sobre), [])
  assert.deepEqual(coberturasDeJson({ estado: 'fallo', lista: null }), [])
})
