// Los teléfonos de siniestros de las compañías tienen UNA fuente (23/09/2026):
// el catálogo verificado de `@central/module-seguros` (`telefonos-companias.ts`).
//
// Hasta ese día había dos copias escritas a mano —ese catálogo para la web y
// las columnas `telefono_*` de `seguros.companias_dgs` para el portal y el
// puerto de asegura— y se separaron sin que nada fallara: el portal enseñaba a
// los clientes de Mapfre su línea MÉDICA como el número para dar parte. Este
// cepo impide que alguien vuelva a leer la copia vieja de la BD.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const RAIZ = new URL('..', import.meta.url).pathname

function fuentes(dir: string): string[] {
  const salida: string[] = []
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'generated' || n.startsWith('.')) continue
    const ruta = join(dir, n)
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta))
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) salida.push(ruta)
  }
  return salida
}

/** Sin comentarios: los comentarios NOMBRAN las columnas para explicar por qué no se leen. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('ninguna app lee de la BD los teléfonos de las compañías', () => {
  // Una `select` de Prisma sobre `companiaDgs` con esas columnas es leer la
  // copia vieja. Se exige `companiaDgs` en el mismo fichero porque el mismo
  // nombre existe como bandera de visibilidad (`acceso.ts`), que no es la BD.
  const prohibido = /\b(telefonoSiniestros|telefonoAsistencia|whatsappSiniestros|whatsappSiniestrosRamos|horarioSiniestros)\s*:\s*true\b/
  const culpables = ['apps', 'packages']
    .flatMap((d) => fuentes(join(RAIZ, d)))
    .filter((f) => {
      const src = sinComentarios(readFileSync(f, 'utf8'))
      return /companiaDgs/.test(src) && prohibido.test(src)
    })
    .map((f) => f.slice(RAIZ.length))
  assert.deepEqual(culpables, [], 'Los teléfonos se leen del catálogo de @central/module-seguros, no de companias_dgs')
})

test('el portal y el puerto de asegura leen el catálogo verificado', () => {
  const portal = sinComentarios(readFileSync(join(RAIZ, 'apps/asegura-portal/lib/canales-compania.ts'), 'utf8'))
  assert.match(portal, /esTelefonoPublicable/, 'el portal tiene que filtrar por verificadas, como la web')
  assert.doesNotMatch(portal, /prisma/, 'el canal del portal no sale de la BD')

  const puerto = sinComentarios(readFileSync(join(RAIZ, 'apps/asegura/app/api/operador/companias/route.ts'), 'utf8'))
  assert.match(puerto, /telefonoVerificadoPorCodigo\(/, 'el puerto tiene que pisar los teléfonos con el catálogo')
})
