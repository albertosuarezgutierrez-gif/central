import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contratoDatos, peticionDatos, sePideDeEntrada } from './contrato-datos.ts'

const RAMOS = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'comunidades', 'comercio', null] as const

test('🪤 todo obligatorio que da el cliente tiene pregunta (si no, nunca se le pediría)', () => {
  for (const r of RAMOS) {
    for (const f of contratoDatos(r).campos) {
      if ((f.origen === 'cliente' || f.origen === 'catalogo') && (f.obligatorio === 'siempre' || f.obligatorio === 'condicional')) {
        assert.ok(f.pregunta && f.pregunta.trim().length > 10, `${r ?? 'generico'}.${f.clave} es obligatorio y no tiene pregunta`)
      }
    }
  }
})

test('🪤 nada de salud por correo y ningún código de catálogo en las preguntas', () => {
  for (const r of RAMOS) {
    for (const f of contratoDatos(r).campos) {
      if (f.sensible === 'salud') assert.equal(sePideDeEntrada(f), false, `${f.clave} es dato de salud`)
      if (f.pregunta) assert.doesNotMatch(f.pregunta, /\b(id|Id|ID|CNO|Base7|catálogo)\b|[a-z][A-Z]/, `${f.clave}: «${f.pregunta}»`)
    }
  }
})

test('pide solo lo que falta: lo conocido no se repite', () => {
  const todo = peticionDatos(['auto']).flatMap((b) => b.preguntas)
  assert.ok(todo.some((p) => /matrícula/.test(p)))
  assert.ok(todo.some((p) => /nombre y tus dos apellidos/.test(p)))
  const sinNombre = peticionDatos(['auto'], new Set(['nombre', 'apellido1', 'apellido2', 'telefono', 'matricula'])).flatMap((b) => b.preguntas)
  assert.ok(!sinNombre.some((p) => /nombre y tus dos apellidos/.test(p)))
  assert.ok(!sinNombre.some((p) => /teléfono/.test(p)))
  assert.ok(!sinNombre.some((p) => /La matrícula/.test(p)))
  // Con solo nombre y primer apellido, la pregunta (compartida) sigue: falta el segundo.
  assert.ok(peticionDatos(['auto'], new Set(['nombre', 'apellido1'])).flatMap((b) => b.preguntas).some((p) => /dos apellidos/.test(p)))
})

test('dos ramos: la persona una vez y un bloque por ramo, nunca la genérica', () => {
  const b = peticionDatos(['hogar', 'vida'])
  assert.deepEqual(b.map((x) => x.titulo), ['Sobre ti', 'De la vivienda', 'Del seguro de vida'])
  const todas = b.flatMap((x) => x.preguntas)
  assert.equal(todas.filter((p) => /DNI o NIE/.test(p)).length, 1)
  assert.ok(!todas.some((p) => /Qué quieres asegurar y para qué/.test(p)), 'con ramo conocido no se pregunta qué quiere asegurar')
  assert.ok(b[1].preguntas.some((p) => /dirección completa de la vivienda/.test(p)), 'la dirección de la vivienda va en su bloque')
  // Lo que trajo el Catastro no se pregunta.
  const conCatastro = peticionDatos(['hogar', 'vida'], new Set(['cp', 'nombreVia', 'numeroVia', 'planta', 'tipoViaId', 'metrosCuadrados', 'anioConstruccion', 'referenciaCatastral'])).flatMap((x) => x.preguntas)
  assert.ok(!conCatastro.some((p) => /metros cuadrados|año de construcción|dirección completa de la vivienda|referencia catastral/.test(p)))
})

test('sin ramo, la genérica; ramo sin cotizador, la de «cuéntame más»', () => {
  assert.ok(peticionDatos([]).flatMap((b) => b.preguntas).some((p) => /Qué quieres asegurar/.test(p)))
  assert.ok(peticionDatos(['mascotas']).flatMap((b) => b.preguntas).some((p) => /Cuéntame/.test(p)))
})
