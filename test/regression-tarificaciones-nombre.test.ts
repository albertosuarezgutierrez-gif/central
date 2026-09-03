// Guardián del NOMBRE de las tablas de tarificaciones guardadas.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// El SQL de estas tablas se escribió llamándolas `seguros.cotizaciones`. Ese
// nombre YA ESTABA COGIDO: es la tabla del cotizador web (25 filas, viva, la
// lee `cartera-historial.ts` para el contador de presupuestos de la ficha).
//
// El modo de fallo es de los caros porque NO AVISA: `create table if not
// exists` sobre una tabla existente es un no-op silencioso —Postgres suelta un
// NOTICE y Supabase pinta «Success»—, así que se habría creado solo la tabla de
// precios colgada por FK de la tabla equivocada, y como `guardarSinTumbar` se
// traga el error a propósito, la pantalla habría dicho «no ha quedado copia»
// para siempre sin un solo error rojo. El daño se descubre en la renovación del
// año siguiente, cuando la tabla de comparación está vacía.
//
// Este cepo fija las dos mitades del arreglo: el SQL crea `tarificaciones` y el
// código escribe en `tarificaciones`. Si alguien vuelve al nombre viejo en
// cualquiera de las dos, esto se pone rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const SQL = join(raiz, 'apps/asegura/prisma/sql/2026-09-02_tarificaciones_guardadas.sql')
const CODIGO = [
  'apps/asegura/lib/codeoscopic/cotizaciones.ts',
  'apps/asegura/lib/codeoscopic/casos.ts',
].map((f) => join(raiz, f))

test('el SQL crea `tarificaciones`, no `cotizaciones`', () => {
  const sql = readFileSync(SQL, 'utf8')
  assert.match(sql, /create table if not exists seguros\.tarificaciones\b/)
  assert.match(sql, /create table if not exists seguros\.tarificacion_precios\b/)
})

test('🚨 el SQL NO crea nada llamado `seguros.cotizaciones*`: esa tabla es del cotizador web', () => {
  const sql = readFileSync(SQL, 'utf8')
  // Solo se mira el DDL: los comentarios SÍ nombran la tabla vieja, y deben.
  const ddl = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
  assert.ok(
    !/\bseguros\.cotizacion/i.test(ddl),
    'el DDL vuelve a nombrar seguros.cotizacion*: colisiona con la tabla del cotizador web',
  )
})

test('el código escribe y lee en `tarificaciones`', () => {
  for (const f of CODIGO) {
    const src = readFileSync(f, 'utf8')
    assert.ok(
      !/\bseguros\.cotizacion_precios\b/.test(src),
      `${f} apunta a seguros.cotizacion_precios, que no existe`,
    )
    // `seguros.cotizaciones` solo puede aparecer en comentarios (explicando la
    // colisión), nunca dentro de una consulta.
    const codigo = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    assert.ok(
      !/\bseguros\.cotizaciones\b/.test(codigo),
      `${f} consulta seguros.cotizaciones: esa es la tabla del cotizador web`,
    )
  }
})
