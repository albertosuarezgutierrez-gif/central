import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPOS_ASEGURADO_ADICIONAL,
  PATH_ROLES,
  TABLA_CAMPOS_VENDOR,
  faltantesPorRoles,
  leerRolesPersonas,
} from './roles-persona.ts'

// Respuesta de roles con la forma que documenta hogar/auto (id, path, min, max, fields[]). Inventada, sin datos reales.
const campo = (id: string, required = true, extra: Record<string, unknown> = {}) => ({ id, required, modifiable: true, ...extra })
const ROLES = [
  { id: 'holder', path: 'holder', min: 1, max: 1, fields: [campo('identification'), campo('name'), campo('birthDate'), campo('phone'), campo('email', false)] },
  { id: 'insured', path: 'risk.insured', min: 1, max: 1, fields: [campo('identification'), campo('birthDate'), campo('gender'), campo('smoker'), campo('economicOccupation'), campo('weight'), campo('height', false, { requiredForRatingProducts: ['P1'] })] },
]

test('las rutas de person-roles de cada ramo son las de la referencia', () => {
  assert.deepEqual(PATH_ROLES, { vida: '/term-life/person-roles', salud: '/health/person-roles', decesos: '/burial/person-roles' })
})

test('lee los ids obligatorios del asegurado y del tomador; solo `required: true` cuenta', () => {
  const r = leerRolesPersonas(ROLES)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.roles.asegurado, ['identification', 'birthDate', 'gender', 'smoker', 'economicOccupation', 'weight'])
  assert.deepEqual(r.roles.tomador, ['identification', 'name', 'birthDate', 'phone'])
  assert.equal(r.roles.maxAsegurados, 1)
})

test('tolera el envoltorio {items|roles|data} y un rol salud con path risk.insureds', () => {
  const salud = [{ id: 'insureds', path: 'risk.insureds', max: 6, fields: [campo('identification')] }]
  for (const k of ['items', 'roles', 'data']) {
    const r = leerRolesPersonas({ [k]: salud })
    assert.ok(r.ok, k)
    if (r.ok) assert.equal(r.roles.maxAsegurados, 6)
  }
})

test('🔒 FAIL-CLOSED: lo que no se puede leer NO es «no hace falta nada»', () => {
  for (const crudo of [null, undefined, 'x', 42, {}, [], { items: 'no' }, [{ id: 'holder', fields: [] }], [{ id: 'insured' }]]) {
    const r = leerRolesPersonas(crudo)
    assert.equal(r.ok, false, JSON.stringify(crudo))
  }
  // el rol del tomador con fields ilegibles también corta
  assert.equal(leerRolesPersonas([{ id: 'holder' }, { id: 'insured', fields: [] }]).ok, false)
})

test('un asegurado que no exige nada es una lectura válida (≠ ilegible)', () => {
  const r = leerRolesPersonas([{ id: 'insured', path: 'risk.insured', fields: [] }])
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.roles.asegurado, [])
})

const COMPLETOS = { dni: '00000000T', nombre: 'N', apellido1: 'A', fechaNacimiento: '1985-01-01', sexo: 'hombre', estadoCivil: 'Single', telefono: '600000000' }

test('un id mapeado y presente no falta; ausente sale con NUESTRO nombre de campo', () => {
  assert.deepEqual(faltantesPorRoles(['identification', 'birthDate'], COMPLETOS, 'vida'), [])
  const f = faltantesPorRoles(['identification', 'email'], COMPLETOS, 'vida')
  assert.deepEqual(f.map((x) => x.campo), ['email'])
  assert.match(f[0].motivo, /person-roles: «email»/)
})

test('🎯 un id que el vendor pide y NO sabemos mapear sale como «dato que falta: <id>», nunca se ignora', () => {
  const f = faltantesPorRoles(['weight', 'campoQueNoExiste', 'birthCountry'], COMPLETOS, 'vida')
  assert.deepEqual(f.map((x) => x.campo), ['weight', 'campoQueNoExiste', 'birthCountry'])
  for (const x of f) assert.match(x.motivo, new RegExp(`^dato que falta: ${x.campo} `))
})

test('el id con nombre de propiedad de Object.prototype no se cuela como mapeado', () => {
  const f = faltantesPorRoles(['constructor', 'toString', '__proto__'], COMPLETOS, 'vida')
  assert.deepEqual(f.map((x) => x.campo), ['constructor', 'toString', '__proto__'])
})

test('smoker y economicOccupation: en VIDA se piden como fumador/profesion; en salud y decesos no se mandan → dato que falta', () => {
  const vida = faltantesPorRoles(['smoker', 'economicOccupation'], COMPLETOS, 'vida')
  assert.deepEqual(vida.map((x) => x.campo), ['fumador', 'profesion'])
  for (const ramo of ['salud', 'decesos'] as const) {
    const f = faltantesPorRoles(['smoker', 'economicOccupation'], COMPLETOS, ramo)
    assert.deepEqual(f.map((x) => x.campo), ['smoker', 'economicOccupation'], ramo)
  }
})

test('fumador = false es una respuesta (no falta); null/undefined sí faltan', () => {
  assert.deepEqual(faltantesPorRoles(['smoker'], { fumador: false }, 'vida'), [])
  assert.equal(faltantesPorRoles(['smoker'], { fumador: null }, 'vida').length, 1)
  assert.equal(faltantesPorRoles(['smoker'], {}, 'vida').length, 1)
})

test('un asegurado adicional no tiene teléfono ni estado civil: si el rol los exige, es dato que falta con el id del vendor', () => {
  const adicional = { dni: '', nombre: 'N', apellido1: 'A', fechaNacimiento: '2010-01-01', sexo: 'mujer' }
  const f = faltantesPorRoles(['name', 'birthDate', 'gender', 'phone', 'identification'], adicional, 'salud', CAMPOS_ASEGURADO_ADICIONAL)
  assert.deepEqual(f.map((x) => x.campo), ['phone', 'dni'], 'phone no es mapeable para un adicional; dni sí lo es y está vacío')
  assert.match(f[0].motivo, /^dato que falta: phone/)
})

test('cada id mapeado apunta a campos que existen en DatosPersona/DatosVida (la tabla no inventa nombres)', () => {
  const nuestros = new Set([
    'dni', 'nombre', 'apellido1', 'apellido2', 'fechaNacimiento', 'sexo', 'estadoCivil', 'telefono', 'email',
    'municipioResidenciaId', 'cpResidencia', 'tipoVia', 'nombreVia', 'numeroVia', 'profesion', 'fumador',
  ])
  for (const [id, cs] of Object.entries(TABLA_CAMPOS_VENDOR)) {
    for (const c of cs ?? []) assert.ok(nuestros.has(c), `${id} → ${c}`)
  }
})
