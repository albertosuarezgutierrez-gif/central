import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarPlanBackfill } from './correduria-puerto.ts'

// El riesgo de esta pantalla es el de siempre en el repo: que un fallo se lea
// como «no hay nada que arreglar». Cero fichas por rellenar y cero porque no se
// ha podido preguntar tienen que salir DISTINTAS.

test('un plan bueno se lee entero', () => {
  const p = interpretarPlanBackfill(200, {
    estado: 'ok',
    resumen: { total: 32600, sinDni: 12906, yaTiene: 3896, ilegibles: 40, rellenables: 15000, enChoque: 758 },
    choques: [{ fichas: ['a', 'b'] }, { fichas: ['c', 'd'] }],
  })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.rellenables, 15000)
  assert.equal(p.enChoque, 758)
  assert.equal(p.grupos, 2)
  assert.equal(p.ilegibles, 40)
})

test('sin configurar NO es «no hay nada que rellenar»', () => {
  assert.deepEqual(interpretarPlanBackfill(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
})

test('un 401 dice que el secreto no cuadra, no «error» a secas', () => {
  const p = interpretarPlanBackfill(401, null)
  assert.equal(p.estado, 'error')
  if (p.estado !== 'error') return
  assert.match(p.motivo, /ASEGURA_OPERADOR_SECRET/)
})

test('un error del puerto conserva su causa (credenciales, permisos, esquema…)', () => {
  const p = interpretarPlanBackfill(500, { estado: 'error', causa: 'credenciales' })
  assert.equal(p.estado, 'error')
  if (p.estado !== 'error') return
  assert.equal(p.motivo, 'credenciales')
})

test('una respuesta que no se entiende es error, nunca un cero tranquilizador', () => {
  for (const json of [null, {}, { estado: 'vaya' }, 'texto']) {
    assert.equal(interpretarPlanBackfill(200, json).estado, 'error', `«${JSON.stringify(json)}» debería ser error`)
  }
})

test('un resumen con campos raros cuenta 0 en vez de reventar la pantalla', () => {
  // Una versión más vieja de asegura puede no mandar algún campo. Que falte una
  // cifra no puede tumbar la página entera: el resto sigue siendo cierto.
  const p = interpretarPlanBackfill(200, { estado: 'ok', resumen: { rellenables: 'muchas', enChoque: null } })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.rellenables, 0)
  assert.equal(p.enChoque, 0)
  assert.equal(p.grupos, 0)
})
