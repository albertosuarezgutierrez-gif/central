// Cepo de «póliza → ficha vinculada» (`ficha-de-poliza.ts`): con varias fichas vinculadas la ficha la elige la
// póliza, nunca se acepta una de una ficha no vinculada y un vínculo de solo lectura no opera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fichaDeRecurso, fichasOperables, puedeOperar, type VinculoPortal } from './ficha-de-poliza.ts'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AJENA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const dos: VinculoPortal[] = [{ clienteId: A, nivel: 'gestionar' }, { clienteId: B, nivel: 'administrar' }]

test('póliza de la ficha A → opera sobre A', () => {
  assert.deepEqual(fichaDeRecurso(dos, A), { estado: 'ok', clienteId: A })
})

test('póliza de la ficha B → opera sobre B (ya no es varias_fichas)', () => {
  assert.deepEqual(fichaDeRecurso(dos, B), { estado: 'ok', clienteId: B })
})

test('🪤 póliza de una ficha NO vinculada → rechazo', () => {
  assert.deepEqual(fichaDeRecurso(dos, AJENA), { estado: 'ajena', motivo: 'no_vinculada' })
})

test('🪤 vínculo sin permiso de operar (tarjeta/completo) → rechazo aunque la póliza sea de esa ficha', () => {
  for (const nivel of ['tarjeta', 'completo', 'raro', '']) {
    const v: VinculoPortal[] = [{ clienteId: A, nivel: 'gestionar' }, { clienteId: B, nivel }]
    assert.deepEqual(fichaDeRecurso(v, B), { estado: 'ajena', motivo: 'sin_permiso' }, nivel)
  }
})

test('recurso inexistente → ajena (sin_dueno); sin vínculos → sin_ficha', () => {
  assert.deepEqual(fichaDeRecurso(dos, null), { estado: 'ajena', motivo: 'sin_dueno' })
  assert.deepEqual(fichaDeRecurso(dos, '  '), { estado: 'ajena', motivo: 'sin_dueno' })
  assert.deepEqual(fichaDeRecurso([], A), { estado: 'sin_ficha' })
})

test('fichasOperables: sin repetir, ordenadas, solo las que dejan operar', () => {
  assert.deepEqual(fichasOperables([...dos, { clienteId: A, nivel: 'gestionar' }, { clienteId: AJENA, nivel: 'tarjeta' }]), [A, B])
  assert.equal(puedeOperar('gestionar'), true)
  assert.equal(puedeOperar('completo'), false)
})

test('🪤 «mejorar precio»: ficha por la póliza, y suya-pero-no-en-vigor es no_en_vigor (no no_encontrada)', () => {
  const src = readFileSync(new URL('./mejorar-precio-portal.ts', import.meta.url), 'utf8')
  const f = src.slice(src.indexOf('export async function pedirMejorarPrecio'))
  assert.match(f, /fichaPropiaDeRecurso\(correduriaId, identidadId, 'poliza', polizaId\)/)
  assert.match(f, /p\.cliente_id = \$\{ficha\.clienteId\}::uuid/)
  assert.match(f, /sqlCarteraEnVigor\('p'\)/)
  const noEncontrada = f.indexOf("if (!p) return { estado: 'no_encontrada' }")
  const noEnVigor = f.indexOf("if (!p.enVigor) return { estado: 'no_en_vigor' }")
  assert.ok(noEncontrada > 0 && noEnVigor > noEncontrada, 'primero «no es tuya», después «no está en vigor»')
})
