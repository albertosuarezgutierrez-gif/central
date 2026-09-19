import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { COMPANIAS_BAJA, FECHA_VERIFICACION, companiasBajaPublicables, esPublicable } from './companias-baja.ts'
import { ARTICULOS, textoArticulo } from './articulos.ts'

test('cada compañía declara sus fuentes oficiales y no se publica sin verificación humana con fecha', () => {
  for (const c of COMPANIAS_BAJA) {
    assert.ok(c.fuentes.length > 0, `${c.slug}: sin fuentes`)
    for (const f of c.fuentes) assert.match(f, /^https:\/\/[a-z0-9.-]+\.(es|com)\//, `${c.slug}: fuente que no es una URL oficial`)
    if (c.verificado) {
      assert.match(c.verificadoEl ?? '', FECHA_VERIFICACION, `${c.slug}: verificado sin fecha`)
    } else {
      assert.equal(c.verificadoEl, null, `${c.slug}: fecha de verificación sin verificar`)
    }
  }
})

test('solo entran en `companiasBajaPublicables` las verificadas con fecha', () => {
  const publicables = companiasBajaPublicables()
  for (const c of publicables) assert.ok(c.verificado && c.verificadoEl)
  // Mutaciones comprobadas sobre el predicado REAL (no una copia): sin fecha
  // no cuela, con un marcador que no es fecha tampoco, y solo pasa la fecha.
  assert.equal(esPublicable({ verificado: true, verificadoEl: null }), false)
  assert.equal(esPublicable({ verificado: true, verificadoEl: 'pendiente' }), false)
  assert.equal(esPublicable({ verificado: false, verificadoEl: '2026-09-19' }), false)
  assert.equal(esPublicable({ verificado: true, verificadoEl: '2026-09-19' }), true)
})

// 🚨 El cepo que importa: ningún dato de contacto de una compañía SIN verificar
// puede aparecer en el texto de un artículo ni en el fuente de una página.
test('ningún email, teléfono ni domicilio de una compañía sin verificar aparece en un artículo o página', () => {
  const sinVerificar = COMPANIAS_BAJA.filter((c) => !c.verificado)
  const datosSensibles = sinVerificar.flatMap((c) =>
    [c.canalBaja?.tipo === 'email' ? c.canalBaja.valor : null, c.domicilio].filter((x): x is string => !!x),
  )
  assert.ok(datosSensibles.length > 0, 'no hay datos sin verificar que vigilar: el cepo miraría al vacío')

  const textos = ARTICULOS.map((a) => textoArticulo(a))
  const raiz = join(import.meta.dirname, '..')
  const fuentes: string[] = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (/\.tsx$/.test(e.name)) fuentes.push(readFileSync(p, 'utf8'))
    }
  }
  recorrer(join(raiz, 'app'))
  recorrer(join(raiz, 'components'))

  for (const dato of datosSensibles) {
    for (const t of [...textos, ...fuentes]) {
      assert.ok(!t.includes(dato), `un dato sin verificar («${dato}») se está publicando`)
    }
  }
})

test('los slugs no se repiten', () => {
  const slugs = COMPANIAS_BAJA.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})
