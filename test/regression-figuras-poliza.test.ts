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
import { puedeAbrirFiguras } from '../apps/asegura/lib/oportunidad-documento-reglas.ts'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const ORQUESTA = 'apps/asegura/lib/oportunidad-figuras.ts'
const DOCUMENTO = 'apps/asegura/lib/oportunidad-documento.ts'

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
  assert.match(s, /const candidatos = await candidatosSinDni\(e\.correduriaId, e\.tomadorId\)/, 'los candidatos no salen de los vinculados a ESTE tomador')
  assert.match(s, /leadSinDniReutilizable\(candidatos, p\.nombre\)/, 'la figura sin DNI no pasa por leadSinDniReutilizable')
  // Un fallo de BD no es «no hay lead previo» (se abriría un duplicado): se para y se avisa.
  assert.match(s, /if \(candidatos === null\) return \{ aviso:/)
  assert.match(s, /cliente_a_id = \$\{tomadorId\}::uuid and r\.cliente_b_id = c\.id/, 'la relación del candidato no se mide contra el tomador')
  assert.match(s, /as "relacionadoConTomador"/)
  // El atajo del tomador (`leadMismoNombre`: cualquier lead con ese nombre) no vale para una figura.
  assert.doesNotMatch(s, /leadMismoNombre|fichasMismoNombre/)
})

// Desde el PORTAL (o el enlace de datos) sube el cliente: una relación «Otra» nueva le aparecería en
// sus sugerencias del portal (`apps/asegura-portal/lib/sugerencias.ts`) con el nombre de un tercero
// y la puerta para pedir acceso a sus pólizas. Las figuras solo se abren si sube el corredor.
test('🪤 portal y enlace de datos NUNCA abren fichas ni relaciones de figuras (ni en la ficha propia)', () => {
  const propia = { verificado: true, hayTomador: true, porqueFicha: 'dni_ficha', clienteId: 'c1', clienteSube: 'c1' }
  assert.equal(puedeAbrirFiguras({ ...propia, origen: 'portal' }), false)
  assert.equal(puedeAbrirFiguras({ ...propia, origen: 'solicitud' }), false)
  assert.equal(puedeAbrirFiguras({ ...propia, origen: 'subir-poliza' }), true)
  const s = sinComentarios(DOCUMENTO)
  assert.match(s, /if \(puedeAbrirFiguras\(quienSube\)\) \{\s*const f = await figurasDesdePoliza\(/, 'figurasDesdePoliza ya no va detrás de puedeAbrirFiguras')
  assert.equal(s.match(/figurasDesdePoliza\(/g)?.length, 1, 'hay otra llamada a figurasDesdePoliza sin la guarda')
})
