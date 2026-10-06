// Guardián del GRABADOR del tarificador RPA (07/10/2026). `node --test`, leyendo el FUENTE.
//
// Lo que tiene que seguir siendo verdad entre piezas que ningún tsc cruza:
//   · BLOQUEO_GRABADOR (packages/module-tarificacion/src/grabador.ts) contiene TODO BLOQUEO_FORMADOR del worker
//     (services/tarificador-rpa/src/formador.ts, fuera del workspace): si el worker bloquea una palabra, el
//     mapa del grabador no puede llamar «seguro» a un botón con ella;
//   · la marca de marcos del grabador es la MISMA que la de las evidencias del worker (evidencia.ts);
//   · el SQL es aditivo: no borra tablas ni columnas, no quita la cuelga de `portal_parte_id`, y revoca DELETE.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

function lista(src: string, nombre: string): string[] {
  const m = src.match(new RegExp(`export const ${nombre} = \\[([^\\]]*)\\] as const`))
  assert.ok(m, `no se encuentra ${nombre}`)
  return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('BLOQUEO_GRABADOR incluye todo BLOQUEO_FORMADOR del worker', () => {
  const formador = lista(leer('services/tarificador-rpa/src/formador.ts'), 'BLOQUEO_FORMADOR')
  const grabador = lista(leer('packages/module-tarificacion/src/grabador.ts'), 'BLOQUEO_GRABADOR')
  assert.ok(formador.length >= 10)
  const faltan = formador.filter((p) => !grabador.includes(p))
  assert.deepEqual(faltan, [], `BLOQUEO_GRABADOR no bloquea: ${faltan.join(', ')}`)
})

test('la marca de marcos del grabador es la de las evidencias del worker', () => {
  const ev = leer('services/tarificador-rpa/src/evidencia.ts')
  const gr = leer('packages/module-tarificacion/src/grabador.ts')
  const marca = (src: string, n: string) => src.match(new RegExp(`const ${n} = '([^']+)'`))?.[1]
  assert.equal(marca(gr, 'MARCA_MARCO'), marca(ev, 'MARCA'))
  assert.equal(marca(gr, 'FIN_MARCA_MARCO'), marca(ev, 'FIN_MARCA'))
})

test('el SQL de grabaciones es aditivo, idempotente y sin DELETE para la app', () => {
  const sql = leer('apps/asegura/prisma/sql/2026-10-07b_tarificador_grabaciones.sql')
  const codigo = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
  assert.ok(!/\bDROP\s+(TABLE|COLUMN|SCHEMA)\b/i.test(codigo), 'el SQL no puede borrar tablas ni columnas')
  assert.ok(!/\bDELETE\s+FROM\b|\bTRUNCATE\s+seguros/i.test(codigo), 'el SQL no borra datos')
  for (const m of codigo.matchAll(/CREATE (?:UNIQUE )?(TABLE|INDEX)\s+(\S+\s+\S+\s+\S+)/gi)) assert.match(m[2], /^IF NOT EXISTS/i, `${m[0]} sin IF NOT EXISTS`)
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS tarificador_grabacion_id/)
  const check = codigo.match(/ADD CONSTRAINT documentos_colgado_de_algo CHECK \(([\s\S]*?)\);/)
  assert.ok(check, 'falta el CHECK ampliado')
  for (const c of ['cliente_id', 'poliza_id', 'siniestro_id', 'portal_parte_id', 'tarificador_grabacion_id']) assert.match(check![1], new RegExp(`${c} IS NOT NULL`), `el CHECK pierde ${c}`)
  assert.match(codigo, /ENABLE ROW LEVEL SECURITY/)
  assert.match(codigo, /REVOKE DELETE, TRUNCATE ON seguros\.tarificador_grabaciones, seguros\.tarificador_grabacion_pantallas FROM prisma_seguros/)
  assert.match(sql, /NO APLICADA/)
})
