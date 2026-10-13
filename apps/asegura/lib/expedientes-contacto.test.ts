import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contactoDeFila } from './expedientes-contacto.ts'

const mapa = new Map([
  ['c1', { telefono: '600111222', email: 'ana@example.com' }],
  ['c2', { telefono: null, email: '  ' }],
])

test('contacto de fila: dato, no consta, y «no se pudo leer» son tres cosas distintas', () => {
  assert.deepEqual(contactoDeFila(mapa, 'c1'), { telefono: '600111222', email: 'ana@example.com' })
  assert.deepEqual(contactoDeFila(mapa, 'c2'), { telefono: null, email: null })
  // Se preguntó y no vino: no consta (no «no se pudo leer»).
  assert.deepEqual(contactoDeFila(mapa, 'c3'), { telefono: null, email: null })
  // La consulta entera falló: null, nunca un objeto vacío que diga «no tiene».
  assert.equal(contactoDeFila(null, 'c1'), null)
  // Tarea suelta sin ficha: no hay a quién.
  assert.equal(contactoDeFila(mapa, null), null)
})

// Cableado (lee el FUENTE): el contacto sale del lector único, para las tres partes de la mesa.
const src = readFileSync(new URL('./expedientes.ts', import.meta.url), 'utf8')

test('🪤 expedientes usa contactosDe (no una cripto propia) y lo pone en las tres partes', () => {
  assert.match(src, /import \{ contactosDe \} from '\.\/cartera-busqueda'/, 'el contacto no sale del lector único')
  assert.doesNotMatch(src, /decryptField|module-seguros-pii/, 'expedientes descifra por su cuenta')
  assert.match(src, /contactosDe\(correduriaId,/, 'contactosDe sin correduría: rompe el aislamiento')
  for (const parte of ['expedientes', 'tareasSueltas', 'perdidasPorRevisar']) {
    assert.match(src, new RegExp(`${parte}: [^\\n]*conContacto`), `${parte} sale sin contacto`)
  }
})

test('🪤 un fallo del contacto no tumba la lista', () => {
  assert.match(src, /await contactosDe\(correduriaId, ids\)\.catch\(\(\) => null\)/, 'un throw del contacto tumbaría Mi mesa')
})
