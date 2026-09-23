// El buscador compacta el término («3H-G-410018502» → «3HG410018502»), así que
// la columna tiene que compararse compactada también. Con un `contains` directo,
// 793 pólizas con guiones o barras eran imposibles de encontrar por su número y
// la pantalla afirmaba «nadie coincide» (23/09/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('../apps/asegura/lib/cartera-busqueda.ts', import.meta.url), 'utf8')
const inicio = fuente.indexOf('async function porNumeroPoliza')
const fin = fuente.indexOf('\nasync function ', inicio + 1)
const cuerpo = fuente.slice(inicio, fin === -1 ? undefined : fin)

test('porNumeroPoliza compara el número de póliza COMPACTADO, no tal cual', () => {
  assert.ok(inicio >= 0, 'no se encuentra porNumeroPoliza')
  assert.match(cuerpo, /regexp_replace\(upper\(numero_poliza\), '\[\^A-Z0-9\]', '', 'g'\)/)
  assert.doesNotMatch(cuerpo, /numeroPoliza:\s*\{\s*contains/)
})
