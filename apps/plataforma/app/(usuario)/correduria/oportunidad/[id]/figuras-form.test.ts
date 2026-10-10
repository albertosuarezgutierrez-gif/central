// Las figuras de una variante en auto-nuevo y moto-nuevo (29/09/2026): qué bloquea el botón y qué
// viaja en `correcciones`. Compartido por las dos pantallas desde `figuras-form.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PERSONA_VACIA, correccionesDeFiguras, figuraCompleta, figuraParaPuerto, modoPapel } from './figuras-form.ts'
import { ROLES_EXTRA, type RolExtra } from './variante.ts'

const ROLES_MOTO: readonly RolExtra[] = ['propietario', 'conductor_habitual']

test('figuraCompleta: sin estado civil nunca; con él, lo que falte en la ficha tecleado', () => {
  assert.equal(figuraCompleta(PERSONA_VACIA, []), false)
  assert.equal(figuraCompleta({ ...PERSONA_VACIA, estadoCivil: 'S' }, []), true)
  // Ficha ilegible (null): solo exige el estado civil, el servidor corta antes de gastar.
  assert.equal(figuraCompleta({ ...PERSONA_VACIA, estadoCivil: 'S' }, null), true)
  // El carné de moto del conductor que falta en su ficha se teclea aquí.
  assert.equal(figuraCompleta({ ...PERSONA_VACIA, estadoCivil: 'S' }, ['fechaCarnet']), false)
  assert.equal(figuraCompleta({ ...PERSONA_VACIA, estadoCivil: 'S', fechaCarnet: '2010-05-01' }, ['fechaCarnet']), true)
  assert.equal(figuraCompleta({ ...PERSONA_VACIA, estadoCivil: 'S' }, ['sexo']), false)
  // Un hueco que aquí no se teclea (la ficha entera) bloquea.
  assert.equal(figuraCompleta({ ...PERSONA_VACIA, estadoCivil: 'S' }, ['ficha']), false)
})

test('figuraParaPuerto: solo lo tecleado + estado civil (el resto lo pone asegura desde la ficha)', () => {
  assert.deepEqual(figuraParaPuerto({ ...PERSONA_VACIA, estadoCivil: 'C', fechaCarnet: ' 2010-05-01 ' }), { estadoCivil: 'C', fechaCarnet: '2010-05-01' })
})

test('🪤 moto: `conductor` y `propietario` viajan; el ocasional NUNCA, aunque el riesgo lo traiga', () => {
  const figuras = { propietario: 'p-uuid', conductor_habitual: 'c-uuid', conductor_ocasional: 'o-uuid' }
  const personas = {
    propietario: { ...PERSONA_VACIA, estadoCivil: 'C' },
    conductor_habitual: { ...PERSONA_VACIA, estadoCivil: 'S', fechaCarnet: '2015-01-01' },
    conductor_ocasional: { ...PERSONA_VACIA, estadoCivil: 'S' },
  }
  const moto = correccionesDeFiguras(figuras, personas, ROLES_MOTO)
  assert.deepEqual(moto, {
    propietario: { estadoCivil: 'C' },
    conductor: { estadoCivil: 'S', fechaCarnet: '2015-01-01' },
  })
  // Auto sí lleva el ocasional (misma función, todos los papeles).
  assert.ok('conductorOcasional' in correccionesDeFiguras(figuras, personas, ROLES_EXTRA))
  // Un papel sin ficha no viaja: el servidor pone al tomador.
  assert.deepEqual(correccionesDeFiguras({ conductor_habitual: 'c-uuid' }, personas, ROLES_MOTO), {
    conductor: { estadoCivil: 'S', fechaCarnet: '2015-01-01' },
  })
})

test('modoPapel: con riesgo, un papel sin figura NO se teclea suelto (lo ocupa el tomador del riesgo)', () => {
  const figs = { conductor_habitual: 'c-hijo' }
  assert.equal(modoPapel('conductor_habitual', figs, true), 'ficha')
  assert.equal(modoPapel('propietario', figs, true), 'riesgo')
  assert.equal(modoPapel('conductor_ocasional', figs, true), 'riesgo')
  // Sin riesgo (tarificación suelta) todo sigue como hoy.
  assert.equal(modoPapel('propietario', {}, false), 'libre')
  assert.equal(modoPapel('conductor_ocasional', {}, false), 'libre')
})
