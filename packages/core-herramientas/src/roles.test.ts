import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ROLES_APP, MAPEO_POR_DEFECTO, rolEnHerramienta, APP_DE_ROLES } from './roles.ts'
import { ROLES, puede } from './estados.ts'
import { IDS_HERRAMIENTA } from './catalogo.ts'

test('toda herramienta del catálogo tiene tabla de roles y fila de mapeo para TODOS los roles generales', () => {
  for (const h of IDS_HERRAMIENTA) {
    const app = APP_DE_ROLES[h]
    for (const r of ROLES) {
      const v = MAPEO_POR_DEFECTO[app][r]
      assert.ok(v === null || (ROLES_APP[app] as readonly string[]).includes(v), `${h}/${r} → ${v}`)
    }
  }
})

test('los roles del taller son los de module-taller (permisos.ts)', () => {
  const src = readFileSync(new URL('../../module-taller/src/permisos.ts', import.meta.url), 'utf8')
  const m = /export const ROLES_TALLER = \[([^\]]+)\]/.exec(src)
  assert.ok(m)
  assert.deepEqual(m![1].split(',').map((s) => s.trim().replace(/'/g, '')), [...ROLES_APP.taller])
})

test('mapeo por defecto: Pilar (admin) → gestor en contabilidad y responsable en rrhh; el socio (consulta) no entra por defecto', () => {
  assert.equal(rolEnHerramienta('contabilidad', 'admin'), 'gestor')
  assert.equal(rolEnHerramienta('rrhh', 'admin'), 'responsable')
  assert.equal(rolEnHerramienta('nominas', 'admin'), 'responsable')
  assert.equal(rolEnHerramienta('contabilidad', 'consulta'), null)
  assert.equal(rolEnHerramienta('taller', 'empleado'), 'mecanico')
})

test('rol específico: válido manda; inválido o «dueno» de un no-dueño se ignora', () => {
  assert.equal(rolEnHerramienta('taller', 'empleado', 'recepcion'), 'recepcion')
  assert.equal(rolEnHerramienta('taller', 'admin', 'jefe'), 'admin')
  assert.equal(rolEnHerramienta('contabilidad', 'admin', 'dueno'), 'gestor', 'nadie sube a dueño en la app sin serlo aquí')
  assert.equal(rolEnHerramienta('contabilidad', 'dueno', 'dueno'), 'dueno')
})

test('el empleado nunca salta con traspaso desde Mi empresa', () => {
  assert.equal(puede('empleado', 'abrir'), false)
  assert.equal(puede('empleado', 'firmar'), false)
})
