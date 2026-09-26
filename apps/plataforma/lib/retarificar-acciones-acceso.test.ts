import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// El middleware solo exige sesión y el layout de `/correduria` no corre en una acción de
// servidor: las acciones que gastan, emiten o enlazan un proyecto tienen que mirar el acceso
// a la correduría ellas mismas. Se lee el FUENTE porque importar el fichero arrastra Prisma.
const fuente = readFileSync(
  join(import.meta.dirname, '../app/(usuario)/correduria/poliza/[id]/retarificar/acciones.ts'),
  'utf8',
)

for (const accion of ['pedirCotizacion', 'pedirOferta', 'pedirEmision', 'pedirVistaImportacion', 'pedirImportacion']) {
  test(`${accion} comprueba el acceso a la correduría antes de llamar al puerto`, () => {
    const inicio = fuente.indexOf(`export async function ${accion}(`)
    assert.ok(inicio >= 0, `no encuentro ${accion}`)
    const siguiente = fuente.indexOf('export async function', inicio + 10)
    const cuerpo = fuente.slice(inicio, siguiente === -1 ? undefined : siguiente)
    assert.match(cuerpo, /await sinAccesoCorreduria\(\)/)
  })
}
