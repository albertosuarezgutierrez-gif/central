// Guardián: un documento REPETIDO subido a una ficha también abre (o completa) su oportunidad. `node --test`.
//
// 29/09/2026: la póliza del Terracan de Manuel Antonio Piña se subió dos veces ANTES de que la subida
// abriera oportunidades; al volver a subirla después, asegura la vio «repetida» (mismo sha256) y se
// saltó la lectura dando por hecho que la primera copia ya se había leído. Resultado: sin oportunidad
// y sin ningún aviso. La deduplicación la hace `crearOportunidad`, no el sha256 del fichero.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const RUTA = 'apps/asegura/app/api/operador/documentos/route.ts'

test('la subida a una ficha lee el documento aunque el fichero esté repetido', () => {
  const s = leer(RUTA)
  const m = s.match(/const oportunidad = ([\s\S]*?)\?\s*await oportunidadDesdeFichero/)
  assert.ok(m, 'no encuentro la condición que decide si se lee para oportunidad')
  assert.doesNotMatch(m[1], /repetido/, 'un fichero repetido no puede saltarse la lectura')
})
