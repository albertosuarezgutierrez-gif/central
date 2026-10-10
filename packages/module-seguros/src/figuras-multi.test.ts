import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INDICE_FIGURA_MULTI, INDICE_FIGURA_ROL_UNICO, INDICE_FIGURA_VIEJO, decidirFiguraMultiple, estadoFigurasMulti, revisarAseguradoLigero, rolNecesitaMigracion,
} from './figuras-multi.ts'
import {
  ROLES_FIGURA_UNICOS, cardinalidadesDelRamo, esRolMultiple, limpiarFiguras, maxDelRol, rolesDelRamo,
} from './variantes-riesgo.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

// ─── Roles únicos vs múltiples ──────────────────────────────────────────────

test('auto y moto: exactamente los papeles de siempre, todos de UNA persona y sin asegurado', () => {
  assert.deepEqual(rolesDelRamo('auto'), ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'])
  assert.deepEqual(rolesDelRamo('moto'), ['tomador', 'propietario', 'conductor_habitual'])
  for (const ramo of ['auto', 'moto']) {
    for (const c of cardinalidadesDelRamo(ramo)) {
      assert.equal(c.max, 1, `${ramo}/${c.rol}`)
      assert.equal(esRolMultiple(c.rol), false)
      assert.equal(rolNecesitaMigracion(c.rol), false, 'auto/moto no dependen de la migración')
    }
  }
})

test('salud y decesos: varios asegurados (hasta 10); hogar, vida y comercio: uno; el resto solo tomador', () => {
  assert.deepEqual(rolesDelRamo('salud'), ['tomador', 'asegurado'])
  assert.equal(maxDelRol('salud', 'asegurado'), 10)
  assert.equal(maxDelRol('decesos', 'asegurado'), 10)
  for (const r of ['hogar', 'vida', 'comercio']) assert.equal(maxDelRol(r, 'asegurado'), 1, r)
  assert.deepEqual(rolesDelRamo('rc'), ['tomador'])
  // Hogar (fase 3): propietario de la vivienda (una persona, sin migración) + asegurado.
  assert.deepEqual(rolesDelRamo('hogar'), ['tomador', 'propietario', 'asegurado'])
  assert.equal(maxDelRol('hogar', 'propietario'), 1)
  assert.deepEqual(rolesDelRamo('vida'), ['tomador', 'asegurado'])
  assert.equal(maxDelRol('auto', 'asegurado'), 0)
  assert.equal(maxDelRol('salud', 'propietario'), 0)
  assert.ok(esRolMultiple('asegurado'))
  assert.ok(!esRolMultiple('tomador'))
  assert.ok(!(ROLES_FIGURA_UNICOS as readonly string[]).includes('asegurado'))
})

test('la foto de una variante (rol → un cliente_id) no admite asegurados: no caben en esa forma', () => {
  assert.deepEqual(limpiarFiguras({ tomador: A, asegurado: B }), { tomador: A })
  assert.equal(limpiarFiguras({ asegurado: B }), null)
})

test('un papel múltiple: se añade hasta el tope del ramo; lleno → no', () => {
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'salud', rol: 'asegurado', actuales: [A], clienteId: B }), { ok: true, yaEstaba: false })
  const diez = Array.from({ length: 10 }, (_, i) => `id-${i}`)
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'salud', rol: 'asegurado', actuales: diez, clienteId: B }), { ok: false, motivo: 'lleno', max: 10 })
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'vida', rol: 'asegurado', actuales: [A], clienteId: B }), { ok: false, motivo: 'lleno', max: 1 })
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'auto', rol: 'asegurado', actuales: [], clienteId: B }), { ok: false, motivo: 'rol_no_del_ramo', max: 0 })
})

// ─── Identidad: nunca fusionar ──────────────────────────────────────────────

test('la MISMA ficha no entra dos veces (idempotente); dos fichas distintas son dos personas aunque se llamen igual', () => {
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'salud', rol: 'asegurado', actuales: [A], clienteId: A }), { ok: true, yaEstaba: true })
  // Ya lleno con A: volver a poner A no es «lleno», es «ya estaba».
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'vida', rol: 'asegurado', actuales: [A], clienteId: A }), { ok: true, yaEstaba: true })
  // B no se funde con A por nada que no sea su id (aquí no entra el nombre: la decisión es solo por ficha).
  assert.deepEqual(decidirFiguraMultiple({ ramo: 'decesos', rol: 'asegurado', actuales: [A], clienteId: B }), { ok: true, yaEstaba: false })
})

test('alta ligera: nombre, nacimiento y sexo; DNI opcional y, si viene, de persona y válido', () => {
  const hoy = new Date('2026-10-10T12:00:00Z')
  const ok = revisarAseguradoLigero({ nombre: '  Lucía ', apellidos: 'Pérez  Gil', fechaNacimiento: '03/02/2015', sexo: 'mujer' }, hoy)
  assert.deepEqual(ok, { ok: true, valor: { nombre: 'Lucía', apellidos: 'Pérez Gil', fechaNacimiento: '2015-02-03', sexo: 'mujer', dni: null } })
  assert.equal(revisarAseguradoLigero({ nombre: 'Lucía', fechaNacimiento: '2015-02-03' }, hoy).ok, false, 'sin sexo no')
  assert.equal(revisarAseguradoLigero({ nombre: 'Lucía', sexo: 'mujer' }, hoy).ok, false, 'sin nacimiento no')
  assert.equal(revisarAseguradoLigero({ fechaNacimiento: '2015-02-03', sexo: 'mujer' }, hoy).ok, false, 'sin nombre no')
  const conDni = revisarAseguradoLigero({ nombre: 'Lucía', fechaNacimiento: '2015-02-03', sexo: 'mujer', dni: '12345678-z' }, hoy)
  assert.ok(conDni.ok && conDni.valor.dni === '12345678Z')
  assert.equal(revisarAseguradoLigero({ nombre: 'L', fechaNacimiento: '2015-02-03', sexo: 'mujer', dni: '12345678A' }, hoy).ok, false, 'letra mala')
  assert.equal(revisarAseguradoLigero({ nombre: 'L', fechaNacimiento: '2015-02-03', sexo: 'mujer', dni: 'B12345678' }, hoy).ok, false, 'un CIF no es un asegurado')
})

// ─── Gate de migración ──────────────────────────────────────────────────────

const VIEJO_CHECK = "CHECK ((rol = ANY (ARRAY['tomador'::text, 'propietario'::text, 'conductor_habitual'::text, 'conductor_ocasional'::text])))"
const NUEVO_CHECK = "CHECK ((rol = ANY (ARRAY['tomador'::text, 'propietario'::text, 'conductor_habitual'::text, 'conductor_ocasional'::text, 'asegurado'::text])))"

test('gate: la tabla de hoy (check y único viejos) es «sin migración»', () => {
  assert.equal(estadoFigurasMulti({ checkRoles: VIEJO_CHECK, indices: ['oportunidad_figura_pkey', INDICE_FIGURA_VIEJO, 'oportunidad_figura_cliente_idx'] }), 'sin_migracion')
})

test('gate: aplicada = check con asegurado + los dos únicos nuevos + sin el viejo', () => {
  const nuevos = ['oportunidad_figura_pkey', INDICE_FIGURA_ROL_UNICO, INDICE_FIGURA_MULTI]
  assert.equal(estadoFigurasMulti({ checkRoles: NUEVO_CHECK, indices: nuevos }), 'disponible')
  // A medias (p. ej. el check sí, el índice viejo sigue): el segundo asegurado chocaría. No está disponible.
  assert.equal(estadoFigurasMulti({ checkRoles: NUEVO_CHECK, indices: [...nuevos, INDICE_FIGURA_VIEJO] }), 'sin_migracion')
  assert.equal(estadoFigurasMulti({ checkRoles: VIEJO_CHECK, indices: nuevos }), 'sin_migracion')
  assert.equal(estadoFigurasMulti({ checkRoles: NUEVO_CHECK, indices: [INDICE_FIGURA_ROL_UNICO] }), 'sin_migracion')
})

test('gate: no poder mirar el catálogo es «desconocido», nunca «sin migración» ni «disponible»', () => {
  assert.equal(estadoFigurasMulti(null), 'desconocido')
})
