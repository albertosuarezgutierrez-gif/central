// Cepo de `lib/sugerencias.ts` (12/09/2026).
//
// ─── Qué protege ──────────────────────────────────────────────────────────
// `sugerenciasDeIdentidad()` alimenta `relacionesSugeribles()` (módulo puro)
// con un `puedeVerPolizas` que esta app NO puede leer de la BD: la columna
// `cliente_relaciones.puede_ver_polizas` se le revocó el `GRANT` el
// 03/09/2026 (ver `lib/autorizaciones.ts`) y ya no está en el modelo Prisma.
// Si alguien «arregla» esto añadiendo la columna de vuelta al `select`, la
// consulta ENTERA revienta en la BD con `permission denied for column`
// (regla del `CLAUDE.md` de la raíz de esta app) — y si en vez de eso alguien
// calcula mal el reemplazo, las sugerencias mienten sobre a quién ya se puede
// ver.
//
// Se lee la FUENTE, no se monta Prisma: el fichero abre `./db` y `./session`
// en el import.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(import.meta.dirname, '..')

function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const LIB = soloCodigo(readFileSync(join(APP, 'lib/sugerencias.ts'), 'utf8'))

test('no lee cliente_relaciones.puede_ver_polizas: la columna no tiene GRANT', () => {
  assert.ok(
    !/puedeVerPolizas:\s*true\b/.test(LIB) && !/select:\s*\{[^}]*puedeVerPolizas:\s*true/.test(LIB),
    '`puedeVerPolizas` de una fila leída de `clienteRelacion` no puede pedirse al `select`: la ' +
      'columna no tiene GRANT y la consulta entera revienta en la BD',
  )
  assert.match(
    LIB,
    /clienteRelacion\.findMany\(\{\s*where:[\s\S]{0,200}select:\s*\{\s*id:\s*true,\s*clienteAId:\s*true,\s*clienteBId:\s*true,\s*tipoRelacion:\s*true,?\s*\}/,
    'el `select` de `clienteRelacion` tiene que pedir solo columnas con GRANT (nunca `puedeVerPolizas`)',
  )
})

test('puedeVerPolizas se CALCULA contra portal_autorizacion vigente, no contra el CRM', () => {
  assert.match(
    LIB,
    /portalAutorizacion\.findMany/,
    'sin mirar `portal_autorizacion` no hay forma honesta de saber qué ya se puede ver',
  )
  assert.match(
    LIB,
    /estadoAutorizacion\(a,\s*hoy\)\s*===\s*'vigente'/,
    'una autorización pendiente, caducada o revocada no cuenta como «ya lo veo»',
  )
  assert.match(
    LIB,
    /puedeVerPolizas:\s*misIdsSet\.has\(r\.clienteBId\)/,
    'el booleano que se le pasa al módulo puro tiene que salir de `yaAutorizanA`, no de la fila cruda',
  )
})

test('cuando la mía es A (no B) no se inventa un puedeVerPolizas', () => {
  // `relacionesSugeribles()` solo lee `puedeVer` (las filas donde B es la
  // ficha consultada). Cuando la mía es A, esta función no tiene datos para
  // saber si A autoriza a B — y no puede tomar prestado `yaAutorizanA`
  // (que solo sabe quién me autoriza A MÍ) para rellenar ese hueco: sería
  // un valor con forma de dato sin relación con la fila.
  assert.match(
    LIB,
    /puedeVerPolizas:\s*misIdsSet\.has\(r\.clienteBId\)\s*\?\s*yaAutorizanA\.has\(r\.clienteAId\)\s*:\s*false/,
    'la rama donde la mía es A tiene que caer a `false`, no a un valor calculado con datos de la ' +
      'dirección contraria',
  )
})

test('nunca sugiere una ficha que ya es mía', () => {
  assert.match(
    LIB,
    /!misIdsSet\.has\(s\.relacionadoId\)/,
    'una relación entre dos fichas propias no es una sugerencia de a quién pedir',
  )
})

test('exporta el envoltorio de sesión, como el resto de lecturas del portal', () => {
  assert.match(LIB, /export async function sugerenciasDeSesion/, 'falta `sugerenciasDeSesion()`')
  assert.match(LIB, /getIdentidad\(\)/, 'el envoltorio tiene que resolver la sesión con la puerta única')
})
