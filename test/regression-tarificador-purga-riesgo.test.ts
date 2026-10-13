// Guardián de la PURGA del riesgo del tarificador (13/10/2026). `node --test`.
//   · La lista BLANCA vive dos veces: TS (`packages/module-tarificacion/src/purga-riesgo.ts`, purga al cerrar) y SQL
//     (`apps/asegura/prisma/sql/2026-10-13_tarificador_purga_riesgo.sql`, limpieza de lo ya cerrado). Tienen que ser IGUALES:
//     si alguien añade una clave a una y no a la otra, la limpieza borraría lo que el código conserva (o al revés).
//   · Encolar desde plataforma: sin riesgo → 400 «falta el riesgo», y el estado de asegura (400 con «qué falta») se
//     reenvía tal cual; nunca se encola un riesgo vacío.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAVES_RIESGO_COMUNIDAD,
  CLAVES_RIESGO_OTRO,
  CLAVES_RIESGO_VEHICULO,
  DIAS_ORIGEN_EMISION,
  ESTADOS_PURGA_RIESGO,
  SUBCLAVES_RIESGO,
  clavesEmision,
} from '../packages/module-tarificacion/src/index.ts'

const RAIZ = join(import.meta.dirname, '..')
const SQL = readFileSync(join(RAIZ, 'apps/asegura/prisma/sql/2026-10-13_tarificador_purga_riesgo.sql'), 'utf8')

/** Todas las listas `/*lista:<nombre>*\/ array[...]` del SQL (las comentadas del recuento incluidas). */
function listasSql(nombre: string): string[][] {
  const re = new RegExp(`/\\*lista:${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*/\\s*array\\[([^\\]]*)\\]`, 'g')
  return [...SQL.matchAll(re)].map((m) => m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')))
}

const PARES: [string, readonly string[], number][] = [
  ['comunidades', CLAVES_RIESGO_COMUNIDAD, 1],
  ['vehiculo', CLAVES_RIESGO_VEHICULO, 1],
  ['otro', CLAVES_RIESGO_OTRO, 1],
  ['sub:direccion', SUBCLAVES_RIESGO.direccion, 1],
  ['sub:seleccionVehiculo', SUBCLAVES_RIESGO.seleccionVehiculo, 1],
  ['sub:eleccionVersion', SUBCLAVES_RIESGO.eleccionVersion, 1],
  ['sub:eleccionVersionIa', SUBCLAVES_RIESGO.eleccionVersionIa, 1],
  ['estados', ESTADOS_PURGA_RIESGO, 2],
  ['emision', clavesEmision(), 1],
]

for (const [nombre, ts, veces] of PARES) {
  test(`purga · la lista «${nombre}» del SQL es la misma que la de TS`, () => {
    const enSql = listasSql(nombre)
    assert.equal(enSql.length, veces, `«${nombre}» tiene que aparecer ${veces} vez/veces en el SQL`)
    for (const l of enSql) assert.deepEqual([...l].sort(), [...ts].sort())
  })
}

test('purga · el SQL solo toca estados cerrados, retiene el origen de emisión no liberado y es idempotente', () => {
  assert.match(SQL, /WHERE t\.estado = ANY \(\/\*lista:estados\*\/ array/)
  assert.match(SQL, /AND NOT pg_temp\.origen_emision_retenido\(t\)/)
  assert.match(SQL, /AND t\.riesgo IS DISTINCT FROM pg_temp\.riesgo_sin_datos_personales\(t\.riesgo, t\.ramo\);/)
  assert.doesNotMatch(SQL, /requiere_humano'|error_reintentable'/, 'nunca en la lista de estados a purgar')
  const dias = [...SQL.matchAll(/\/\*dias_origen_emision\*\/ (\d+)/g)].map((m) => Number(m[1]))
  assert.deepEqual(dias, [DIAS_ORIGEN_EMISION])
})

test('purga · el SQL recorta tarificaciones.peticion SOLO del canal rpa, con la misma función', () => {
  assert.match(SQL, /UPDATE seguros\.tarificaciones x\s+SET peticion = pg_temp\.riesgo_sin_datos_personales\(x\.peticion, x\.ramo::text\)\s+WHERE coalesce\(to_jsonb\(x\)->>'canal', 'codeoscopic'\) = 'rpa'/)
  assert.match(SQL, /AND x\.peticion IS DISTINCT FROM pg_temp\.riesgo_sin_datos_personales/)
})

test('encolar (plataforma) · sin riesgo → 400 «falta el riesgo»; el 4xx de asegura se reenvía tal cual', () => {
  const r = readFileSync(join(RAIZ, 'apps/plataforma/app/api/correduria/tarificador/encolar/route.ts'), 'utf8')
  assert.match(r, /if \(!b\.riesgo \|\| typeof b\.riesgo !== 'object' \|\| Array\.isArray\(b\.riesgo\)\) \{\s*return NextResponse\.json\(\{ estado: 'error', mensaje: 'falta el riesgo' \}, \{ status: 400 \}\)/)
  assert.match(r, /return NextResponse\.json\(r\.json \?\? \{ estado: 'error' \}, \{ status: r\.status \}\)/)
})
