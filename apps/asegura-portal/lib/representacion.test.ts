// Cepo de la representación societaria (12/09/2026, decisión de Alberto:
// «Dueño y Administración, empieza a implementar»).
//
// ─── Qué protege ──────────────────────────────────────────────────────────
// `esRepresentanteDe()` decide QUIÉN puede invitar en nombre de una empresa.
// Dos cosas no se pueden romper sin que nada falle:
//   1. Que la lista de tipos sea EXACTAMENTE `Dueño`/`Administración` — un
//      tipo de más (`Empleado/a`, `Socio/a`) da esta capacidad a quien solo
//      gestiona el día a día o es dueño de participaciones, no de decidir a
//      quién se le enseña qué.
//   2. Que la identidad se vuelva a comprobar contra la SESIÓN, no se confíe
//      a ciegas en el parámetro que pasa el llamador.
//
// Se lee la FUENTE, no se monta Prisma: el fichero abre `./db` y `./session`
// en el import, y una tabla de tipos no necesita BD para comprobarse.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(import.meta.dirname, '..')

function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const LIB = soloCodigo(readFileSync(join(APP, 'lib/representacion.ts'), 'utf8'))

test('los tipos que representan a una empresa son EXACTAMENTE Dueño y Administración', () => {
  const m = LIB.match(/TIPOS_REPRESENTACION\s*=\s*\[([^\]]*)\]/)
  assert.ok(m, 'no se encuentra `TIPOS_REPRESENTACION`')
  const tipos = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  assert.deepEqual(
    tipos.sort(),
    ['Administración', 'Dueño'].sort(),
    'un tipo de más (Empleado/a, Socio/a, Accionista) daría capacidad de invitar a quien no decide por la empresa',
  )
})

test('no confía a ciegas en el identidadId del llamador: lo revalida contra la sesión', () => {
  assert.ok(
    /getIdentidad\(\)/.test(LIB),
    '`esRepresentanteDe` tiene que resolver la sesión, no solo recibir `identidadId` como dato',
  )
  assert.ok(
    /sesion\.id\s*!==\s*identidadId/.test(LIB) || /identidadId\s*!==\s*sesion\.id/.test(LIB),
    'tiene que comparar la sesión real contra el `identidadId` recibido antes de tocar la BD',
  )
})

test('mira las dos direcciones de la relación', () => {
  assert.ok(
    /clienteAId:\s*\{\s*in:\s*misFichas\s*\},\s*clienteBId:\s*empresaClienteId/.test(LIB) &&
      /clienteAId:\s*empresaClienteId,\s*clienteBId:\s*\{\s*in:\s*misFichas\s*\}/.test(LIB),
    'el volcado no siempre respeta "fila A→B = B es <tipo> de A": hay que mirar las dos direcciones',
  )
})
