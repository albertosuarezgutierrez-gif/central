// Cepo de cableado de `escribirCarnetPortal` (`carnets-portal.ts`): en cambio/baja el dueño del carné se LEE
// de BD (`clienteCarnetConducir.findFirst({ id, correduriaId })`) y es lo que se pasa a `destinoCarnet`.
// Si alguien lo sustituye por `op.fichaId`, `destinoCarnet` compararía la ficha propuesta contra sí misma y
// cualquier carné ajeno pasaría. Cepo de fuente, como los de carnets-portal-reglas.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('./carnets-portal.ts', import.meta.url), 'utf8')
const cuerpo = fuente.slice(fuente.indexOf('export async function escribirCarnetPortal'))

test('el dueño del carné sale de la BD filtrando por id Y correduría, nunca de op.fichaId', () => {
  assert.match(
    cuerpo,
    /clienteCarnetConducir\.findFirst\(\s*\{\s*where:\s*\{\s*id:\s*op\.id,\s*correduriaId\s*\}/,
    'la lectura del carné debe filtrar por { id: op.id, correduriaId }',
  )
  assert.match(cuerpo, /duenoCarnet\s*=\s*k\?\.clienteId\s*\?\?\s*null/, 'duenoCarnet sale de k.clienteId')
  assert.doesNotMatch(cuerpo, /duenoCarnet\s*=\s*op\.fichaId/, 'duenoCarnet no puede ser la ficha propuesta')
})

test('destinoCarnet recibe ese duenoCarnet leído (no otro valor)', () => {
  assert.match(cuerpo, /destinoCarnet\(\{[^}]*\bfichaId:\s*op\.fichaId,\s*duenoCarnet,/)
})
