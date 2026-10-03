// Cepos de la cola de revisión de emisiones: paginación, firma de quien cierra e idempotencia.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LIMITE_MAX, LIMITE_POR_DEFECTO, NOTA_MAX, RESUELTA_POR_RESERVADO, decidirResolucion, leerPagina, limpiarNota, quienResuelve,
} from './emisiones-revision.ts'

const CUENTA = '123e4567-e89b-12d3-a456-426614174000'

test('página: valores raros caen al defecto y el tope se respeta', () => {
  assert.deepEqual(leerPagina(null, null), { limite: LIMITE_POR_DEFECTO, desde: 0 })
  assert.deepEqual(leerPagina('abc', '-3'), { limite: LIMITE_POR_DEFECTO, desde: 0 })
  assert.deepEqual(leerPagina('0', '1.5'), { limite: LIMITE_POR_DEFECTO, desde: 0 })
  assert.equal(leerPagina('100000', '10').limite, LIMITE_MAX)
  assert.deepEqual(leerPagina('20', '40'), { limite: 20, desde: 40 })
})

test('quién resuelve: humano o agente por x-actor; sin cabecera, manual; nunca «descubrimiento»', () => {
  assert.equal(quienResuelve(`humano:${CUENTA}`), `humano:${CUENTA}`)
  assert.equal(quienResuelve('sistema:plataforma'), 'sistema:plataforma')
  assert.equal(quienResuelve(null), 'manual')
  assert.equal(quienResuelve('humano:alberto@x.es'), 'manual') // un correo no entra en la tabla
  for (const c of [null, '', 'descubrimiento', 'agente:descubrimiento', `humano:${CUENTA}`]) {
    assert.notEqual(quienResuelve(c), RESUELTA_POR_RESERVADO)
  }
})

test('nota: se recorta, se aplana y vacía es sin nota', () => {
  assert.equal(limpiarNota(undefined), null)
  assert.equal(limpiarNota(42), null)
  assert.equal(limpiarNota('  \n '), null)
  assert.equal(limpiarNota('a\n\n  b'), 'a b')
  assert.equal(limpiarNota('x'.repeat(NOTA_MAX + 50))?.length, NOTA_MAX)
})

test('idempotencia: cerrar dos veces no es error ni pisa; inexistente es 404', () => {
  assert.deepEqual(decidirResolucion('i', 1, true), { status: 200, estado: 'resuelta', id: 'i' })
  assert.deepEqual(decidirResolucion('i', 0, true), { status: 200, estado: 'ya_resuelta', id: 'i' })
  assert.equal(decidirResolucion('i', 0, false).status, 404)
})

test('las rutas solo tocan filas ABIERTAS y la de resolver va auditada', () => {
  const resolver = readFileSync(new URL('../../app/api/operador/codeoscopic/emisiones-revision/[id]/resolver/route.ts', import.meta.url), 'utf8')
  assert.match(resolver, /and resuelta_at is null/)
  assert.match(resolver, /auditado\(/)
  const lista = readFileSync(new URL('../../app/api/operador/codeoscopic/emisiones-revision/route.ts', import.meta.url), 'utf8')
  assert.match(lista, /resuelta_at is null/)
})
