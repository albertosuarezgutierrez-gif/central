import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guardián del filtro `activo` — que una ficha DESCARTADA lo esté de verdad.
 *
 * ─── Por qué existe ─────────────────────────────────────────────────────────
 * En `seguros.clientes` hay ~26.800 fichas con `activo = false`: leads del
 * volcado histórico (2013-2018) sin ningún dato de contacto. «Descartada»
 * significa que deja de salir en el buscador, las listas y los contadores —
 * la fila sigue ahí y su ficha se abre por su URL para poder restaurarla.
 *
 * El filtro se pierde con una facilidad incómoda, y no es hipotético: el propio
 * `clientes-sin-canal.ts` documenta que **ya se le cayó una vez** al reescribir
 * el fichero el 04/09/2026. Cuando se cae no falla nada — simplemente vuelven a
 * aparecer 26.800 fichas muertas, que es exactamente el «sigue habiendo
 * duplicidad» que reportó Alberto el 05/09/2026. Ni `tsc` ni `next build` miran
 * dentro de un `Prisma.sql`, así que esto lee el FUENTE.
 *
 * ─── Qué vigila y qué NO ────────────────────────────────────────────────────
 * Vigila PRESENCIA: que estos ficheros sigan mencionando el filtro. No puede
 * comprobar que TODAS las consultas de cada fichero lo lleven — para eso haría
 * falta un parser, y un test frágil que salta en falso se acaba borrando.
 *
 * 🚨 Y hay sitios que a propósito NO filtran, así que no se listan aquí:
 *   · `cartera-ficha.ts::fichaCliente` — la ficha se abre por su URL para poder
 *     restaurarla, y la pantalla pone el cartel de «descartada».
 *   · `cartera-edicion.ts::coincidencias` — el índice único por hash sigue vivo
 *     aunque la ficha no se pinte; filtrarlas diría «ese teléfono está libre» y
 *     el alta moriría en un P2002 sin explicación.
 *   · las hidrataciones por ids ya filtrados aguas arriba (`contactosDe`…):
 *     filtrar ahí solo crearía huecos silenciosos.
 */

const fuente = (f: string): string => readFileSync(join(import.meta.dirname, f), 'utf8')

/**
 * El filtro, en sus dos escrituras: `activo: true` (Prisma) y `c.activo` /
 * `cl.activo` (dentro de un `Prisma.sql`).
 *
 * 🚨 NO vale buscar `/activo/` a secas. La primera versión de este guardián lo
 * hacía y daba VERDE sobre `avisos-vencimiento.ts`, que menciona «activo»
 * hablando de *avisos activos* — nada que ver con la ficha del cliente. Un
 * guardián que pasa por una coincidencia de texto es peor que no tenerlo:
 * promete una vigilancia que no existe.
 */
const FILTRO = /activo:\s*true|\b[a-z]{1,3}\.activo\b/

/** Los caminos de LECTURA en masa: buscador, listas y contadores. */
const EN_MASA = [
  'cartera-filtro.ts',      // constructor único del WHERE de la lista + facetas
  'cartera-busqueda.ts',    // el buscador de TODO
  'cartera.ts',             // KPIs y vencimientos
  'clientes-sin-canal.ts',  // aquí ya se perdió una vez
  'cartera-impagados.ts',   // cola de retención
]

for (const f of EN_MASA) {
  test(`${f} filtra las fichas descartadas (activo)`, () => {
    assert.match(
      fuente(f),
      FILTRO,
      `${f} lee clientes en masa y no filtra por ficha activa: las ~26.800 descartadas volverían a salir`,
    )
  })
}

test('cartera-filtro: el WHERE único exige la ficha activa, no solo la no fusionada', () => {
  const src = fuente('cartera-filtro.ts')
  // Las dos condiciones viajan juntas: una lápida de fusión y una ficha
  // descartada son cosas distintas y las dos tienen que quedar fuera.
  assert.match(src, /c\.merged_into_cliente_id is null/)
  assert.match(src, /c\.activo/)
})

test('el aviso de vencimiento NO se le manda a una ficha descartada', () => {
  // Es el único camino con efecto EXTERNO: manda un correo. Que una ficha
  // descartada deje de salir en pantalla pero siga recibiendo correos es la
  // peor mitad de las dos — el usuario no lo ve venir y el destinatario sí.
  // Se exige el filtro SOBRE EL CLIENTE, no la palabra suelta: este fichero ya
  // habla de «avisos activos», que es otra cosa.
  assert.match(
    fuente('avisos-vencimiento.ts'),
    /cliente:\s*\{[^}]*activo:\s*true/s,
    'avisos-vencimiento.ts manda correos y su consulta no exige `cliente: { activo: true }`',
  )
})
