import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CATALOGO_MODULOS, tarjetasModulos } from '@central/module-seguros-portal'

import { MODULO_RRHH, URL_PORTAL_EMPLEADO, agruparHerramientas } from './herramientas.ts'

const ctx = (accesoFlota: boolean | null, accesoPatrimonio: boolean | null) => ({ accesoFlota, accesoPatrimonio, filas: [] })

test('herramientas: lo que se abre va arriba y lo que se pide abajo; RRHH se pinta aparte', () => {
  const g = agruparHerramientas(tarjetasModulos(ctx(true, false)))
  assert.deepEqual(g.propias.map((t) => t.id), ['flota'])
  assert.deepEqual(g.solicitables.map((t) => t.id), ['alquileres'])
  assert.equal(g.rrhh?.id, MODULO_RRHH)
})

test('herramientas: un módulo que no se ha podido comprobar NO se ofrece como propio (ni se esconde)', () => {
  const g = agruparHerramientas(tarjetasModulos(ctx(null, null)))
  assert.deepEqual(g.propias, [])
  assert.deepEqual(g.solicitables.map((t) => t.accion.tipo), ['sin_comprobar', 'sin_comprobar'])
})

test('herramientas: el Portal del Empleado es su propio dominio, en https, y no se abre dentro del portal', () => {
  assert.equal(URL_PORTAL_EMPLEADO, 'https://empleados.grupoasegura.es')
  assert.equal(CATALOGO_MODULOS[MODULO_RRHH].hrefPortal, null)
})
