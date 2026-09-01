// Guardián del aislamiento por identidad en `apps/asegura-portal`. `node --test`
// (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// El portal guarda las pólizas que APORTA cada persona. Lo único que separa la
// bóveda de una de la de otra es que toda consulta se filtre por la identidad
// que sale de la COOKIE. No hay RLS que rescate un olvido: el rol del portal
// conecta como aplicación y una consulta sin `where` responde 200 con los datos
// de todo el mundo. El modo de fallo no es «no se ve nada» —eso se nota— sino
// «se ve TODO y nada falla».
//
// El cepo fija dos cosas sobre cada fichero que toque `prisma.portal*`:
//   1. Que importe la puerta única, `lib/session` — de ahí y solo de ahí sale
//      de quién es la sesión.
//   2. Que la consulta mencione `identidadId`. Importar la puerta y luego
//      consultar sin filtrar es exactamente el fallo que esto persigue.
//
// 📌 Desviación deliberada del spec: el spec nombra la puerta `lib/acceso.ts`,
// porque allí guarda además la lectura de la CARTERA (con sus niveles de acceso
// y la costura `origen: cartera | aportada`). En Fase 1 no se lee cartera: solo
// hay bóveda propia, y lo único que hay que resolver es de quién es la sesión.
// Cuando entre la Fase 4 (vinculación con CIMA), `lib/acceso.ts` nace encima y
// este guardián pasa a exigirlo a él: es un renombrado del cepo, no otro cepo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/**
 * Estos SÍ pueden tocar `prisma.portal*` sin sesión: son la puerta de entrada
 * (todavía no hay identidad que resolver) o la propia maquinaria de sesión.
 * Añadir algo aquí es una decisión, no un trámite.
 */
const EXENTOS = new Set([
  'apps/asegura-portal/lib/db.ts',
  'apps/asegura-portal/lib/session.ts',
  'apps/asegura-portal/lib/auth.ts',
  'apps/asegura-portal/app/api/acceso/solicitar/route.ts',
  'apps/asegura-portal/app/api/acceso/verificar/route.ts',
])

/** `prisma.portalPoliza…`, `prisma.portalBien…`, `prisma.portalIdentidad…` */
const USA_PRISMA_PORTAL = /prisma\s*\.\s*portal[A-Z]/
/** Importa la puerta única, con alias `@/` o por ruta relativa. */
const USA_SESION = /from\s+['"](@\/lib\/session|(?:\.\.?\/)+lib\/session)(?:\.ts)?['"]/
/** El filtro por identidad, escrito de verdad en la consulta. */
const FILTRA_POR_IDENTIDAD = /identidadId/

function ficherosDelPortal(): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/asegura-portal'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !EXENTOS.has(f))
}

test('ningun fichero del portal consulta datos de identidad sin pasar por lib/session', () => {
  const infractores: string[] = []

  for (const f of ficherosDelPortal()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!USA_PRISMA_PORTAL.test(src)) continue
    if (!USA_SESION.test(src)) infractores.push(f)
  }

  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros leen o escriben datos del portal sin resolver la identidad por ' +
      '`lib/session`. Sin esa puerta, la consulta responde 200 con la bóveda de ' +
      `cualquiera:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('toda consulta al portal filtra por identidadId: importar la puerta no basta', () => {
  const infractores: string[] = []

  for (const f of ficherosDelPortal()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!USA_PRISMA_PORTAL.test(src)) continue
    if (!FILTRA_POR_IDENTIDAD.test(src)) infractores.push(f)
  }

  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros consultan `prisma.portal*` sin nombrar `identidadId` en ninguna ' +
      `parte: una consulta sin filtro devuelve las pólizas de todo el mundo:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('lib/session no tiene una identidad por defecto', () => {
  const src = readFileSync(join(ROOT, 'apps/asegura-portal/lib/session.ts'), 'utf8')
  assert.ok(
    !/identidadId\s*(\?\?|\|\|)\s*['"][^'"]/.test(src),
    'lib/session.ts no debe tener un fallback literal para la identidad: ' +
      'un id inventado no da error, da la bóveda de otro.',
  )
  assert.ok(
    /return null/.test(src),
    'sin cookie válida, `getIdentidad` devuelve null (nadie), nunca una identidad de relleno.',
  )
})

test('la lista de exentos solo contiene ficheros que existen', () => {
  const seguidos = new Set(
    execFileSync('git', ['ls-files', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean),
  )
  // Un exento que ya no existe es una puerta abierta esperando a que alguien
  // vuelva a crear el fichero con ese nombre.
  const fantasmas = [...EXENTOS].filter((f) => !seguidos.has(f))
  assert.deepEqual(fantasmas, [], `Exentos que ya no existen:\n  - ${fantasmas.join('\n  - ')}`)
})
