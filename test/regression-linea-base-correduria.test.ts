// Cepos de la línea base semanal en plataforma: una fuente caída o ilegible no se pinta como «0».
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { interpretarCartera, montarTabla } from '../apps/plataforma/lib/linea-base-correduria.ts'

const ahora = new Date('2026-10-07T10:00:00Z') // semana del 05/10

test('lee la cartera y monta la tabla con las dos fuentes', () => {
  const c = interpretarCartera(200, { estado: 'ok', conteos: { a_mano: { '2026-09-28': 3 }, automaticas: { '2026-09-28': 9 } } })
  const t = montarTabla(c, { '2026-09-28': 12 }, ahora)
  assert.equal(t.semanas.at(-1), '2026-10-05')
  const i = t.semanas.indexOf('2026-09-28')
  assert.equal(t.filas.find((f) => f.id === 'correos')!.celdas[i].n, 12)
  assert.equal(t.automatica[i], 0.75)
  assert.deepEqual(t.avisos, [])
})

test('🪤 una serie ilegible tumba la lectura de la cartera', () => {
  const c = interpretarCartera(200, { estado: 'ok', conteos: { a_mano: { '2026-09-28': -1 } } })
  assert.deepEqual(c, { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🪤 cartera caída: sus filas a null con aviso; el correo se sigue viendo', () => {
  const t = montarTabla(interpretarCartera(500, { estado: 'error', causa: 'conexion' }), { '2026-09-28': 5 }, ahora)
  const i = t.semanas.indexOf('2026-09-28')
  assert.equal(t.filas.find((f) => f.id === 'a_mano')!.celdas[i].n, null)
  assert.equal(t.filas.find((f) => f.id === 'correos')!.celdas[i].n, 5)
  assert.equal(t.automatica[i], null)
  assert.equal(t.avisos.length, 1)
})

test('🪤 correo sin contar: su fila a null con aviso, no «0 correos»', () => {
  const t = montarTabla(interpretarCartera(200, { estado: 'ok', conteos: {} }), null, ahora)
  assert.ok(t.filas.find((f) => f.id === 'correos')!.celdas.every((c) => c.n === null))
  assert.match(t.avisos.join(' '), /correo/)
})
