// Guardián: una FIGURA sin DNI de una póliza de motor (propietario, conductor) solo reutiliza un
// lead sin DNI que YA está relacionado con ESTE tomador (03/10/2026). `node --test`.
//
// Por qué: con solo el nombre, «Juan Pérez García» conductor de esta póliza y el «Juan Pérez
// García» lead de otra familia son dos personas. Reutilizar por nombre a secas colgaría el riesgo
// de un desconocido y le relacionaría con el tomador; fundir a dos personas no se deshace. La regla
// es pura (`leadSinDniReutilizable`) y la orquestación (`oportunidad-figuras.ts`) tiene que usarla
// con la relación medida contra el tomador, no contra cualquiera.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leadSinDniReutilizable, type CandidatoLeadSinDni } from '../packages/module-seguros/src/figuras-poliza.ts'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const ORQUESTA = 'apps/asegura/lib/oportunidad-figuras.ts'

const lead = (x: Partial<CandidatoLeadSinDni> = {}): CandidatoLeadSinDni => ({
  id: 'lead-1', nombre: 'Juan', apellidos: 'Pérez García', tipo: 'lead', tieneDni: false, relacionadoConTomador: true, ...x,
})

test('🪤 un lead sin DNI con el mismo nombre pero SIN relación con este tomador no se reutiliza', () => {
  assert.equal(leadSinDniReutilizable([lead({ relacionadoConTomador: false })], 'Juan Pérez García'), null)
  // El de otra familia va primero (más antiguo): se salta y se coge el que sí está relacionado.
  assert.equal(leadSinDniReutilizable([lead({ id: 'ajeno', relacionadoConTomador: false }), lead({ id: 'suyo' })], 'Juan Pérez García'), 'suyo')
  assert.equal(leadSinDniReutilizable([lead()], 'Juan Pérez García'), 'lead-1')
})

test('🪤 nunca una ficha de cliente ni una con DNI, aunque esté relacionada', () => {
  assert.equal(leadSinDniReutilizable([lead({ tipo: 'cliente' })], 'Juan Pérez García'), null)
  assert.equal(leadSinDniReutilizable([lead({ tieneDni: true })], 'Juan Pérez García'), null)
})

test('🪤 la orquestación usa la regla, y la relación se mide contra EL tomador de esta póliza', () => {
  const s = sinComentarios(ORQUESTA)
  assert.match(s, /leadSinDniReutilizable\(\s*await candidatosSinDni\(/, 'la figura sin DNI no pasa por leadSinDniReutilizable')
  assert.match(s, /cliente_a_id = \$\{tomadorId\}::uuid and r\.cliente_b_id = c\.id/, 'la relación del candidato no se mide contra el tomador')
  assert.match(s, /as "relacionadoConTomador"/)
  // El atajo del tomador (`leadMismoNombre`: cualquier lead con ese nombre) no vale para una figura.
  assert.doesNotMatch(s, /leadMismoNombre|fichasMismoNombre/)
})
