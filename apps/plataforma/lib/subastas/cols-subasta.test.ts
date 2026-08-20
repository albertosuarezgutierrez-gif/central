// ────────────────────────────────────────────────────────────────────────────
// Guardián de `COLS_SUBASTA`: toda columna del corpus que lea el cron de cierre
// tiene que estar en la lista canónica.
//
// 🚨 Por qué existe (20/08/2026): `datosDe()` leía `pujas_estado`,
// `pujas_estado_at` y `puja_maxima_calc`, que NO estaban en `COLS_SUBASTA`. Las
// filas llegaban con `undefined` en los tres, así que el aviso decía «❔ Estado
// de pujas sin comprobar» y se callaba el techo de puja **con el dato guardado
// en la BD**. `tsc` no lo caza: las filas de `$queryRaw` son `any`, y un
// `f.columna_que_no_existe` es válido para TypeScript.
//
// Mismo patrón que el guardián de `latidos.test.ts`: se lee el FUENTE de la
// ruta, porque `Prisma.sql` no es importable desde `node --test`.
// ────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RUTA_CRON = new URL('../../app/api/cron/subastas-cierre/route.ts', import.meta.url)
const RUTA_COLS = new URL('../subastas-radar.ts', import.meta.url)

/** Columnas que NO vienen del corpus sino de la fila del radar/seguimiento. */
const DEL_RADAR = new Set(['cuenta_id', 'id', 'dedupe_key'])

function columnasDeclaradas(): Set<string> {
  const src = readFileSync(RUTA_COLS, 'utf8')
  const bloque = src.slice(src.indexOf('COLS_SUBASTA = Prisma.raw'))
  const lista = bloque.slice(0, bloque.indexOf('\n)'))
  return new Set(
    [...lista.matchAll(/'([^']+)'/g)]
      .flatMap((m) => m[1].split(','))
      .map((c) => c.trim())
      .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c)),
  )
}

test('el cron de cierre no lee ninguna columna que falte en COLS_SUBASTA', () => {
  const cron = readFileSync(RUTA_CRON, 'utf8')
  const leidas = new Set([...cron.matchAll(/\bf\.([a-z_][a-z0-9_]*)\b/g)].map((m) => m[1]))
  const declaradas = columnasDeclaradas()

  const faltan = [...leidas].filter((c) => !DEL_RADAR.has(c) && !declaradas.has(c))
  assert.deepEqual(faltan, [], `columnas leídas por el cron y ausentes de COLS_SUBASTA: ${faltan.join(', ')}`)
})

test('la lista canónica se lee de verdad (el guardián no aprueba por vacío)', () => {
  // Si el parseo fallara, `declaradas` saldría vacía y el test de arriba sería
  // un colador que da verde siempre — que es peor que no tenerlo.
  const declaradas = columnasDeclaradas()
  assert.ok(declaradas.size > 40, `solo se han leído ${declaradas.size} columnas de COLS_SUBASTA`)
  for (const imprescindible of ['dedupe_key', 'valor_subasta', 'documentos_muro', 'pujas_estado', 'puja_maxima_calc']) {
    assert.ok(declaradas.has(imprescindible), `falta ${imprescindible} en COLS_SUBASTA`)
  }
})
