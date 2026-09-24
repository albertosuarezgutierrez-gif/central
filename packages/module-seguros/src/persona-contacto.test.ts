import test from 'node:test'
import assert from 'node:assert/strict'
import {
  combinarPersonaContacto,
  textoPersonaContacto,
  tiposContactoSugeridos,
} from './persona-contacto.ts'
import { TIPOS_RELACION } from './relaciones.ts'

test('una sociedad ofrece primero los vínculos de empresa, sin perder ninguno', () => {
  const t = tiposContactoSugeridos('juridica')
  assert.equal(t[0], 'Administración')
  assert.equal(t[1], 'Empleado/a')
  assert.equal(t.length, TIPOS_RELACION.length, 'no se pierde ni se duplica ningún tipo')
  assert.equal(new Set(t).size, t.length)
  for (const x of TIPOS_RELACION) assert.ok(t.includes(x))
})

test('una persona física (o no saber qué es) no reordena nada: adivinarlo es inventar', () => {
  assert.deepEqual(tiposContactoSugeridos('fisica'), TIPOS_RELACION)
  assert.deepEqual(tiposContactoSugeridos(null), TIPOS_RELACION)
  assert.deepEqual(tiposContactoSugeridos(undefined), TIPOS_RELACION)
})

test('las dos escrituras salen bien', () => {
  assert.deepEqual(combinarPersonaContacto({ ok: true, id: 'abc' }, { ok: true }), {
    estado: 'creada_y_vinculada',
    id: 'abc',
  })
})

test('🚨 ficha creada y vínculo fallido NO es «no se ha creado»: se conserva el id para reintentar solo el vínculo', () => {
  const r = combinarPersonaContacto({ ok: true, id: 'abc' }, { ok: false })
  assert.deepEqual(r, { estado: 'creada_sin_vinculo', id: 'abc' })
  const texto = textoPersonaContacto(r, 'Juan', 'Grupo ELCA 83')
  assert.match(texto, /SÍ se ha creado/)
  assert.match(texto, /No la vuelvas a dar de alta/, 'la frase es lo que evita el duplicado')
})

test('vínculo no intentado (null) se cuenta igual que fallido: la ficha existe y no está vinculada', () => {
  assert.deepEqual(combinarPersonaContacto({ ok: true, id: 'abc' }, null), { estado: 'creada_sin_vinculo', id: 'abc' })
})

test('alta ok sin id utilizable: no se vincula ni se promete que se hará', () => {
  for (const id of [null, undefined, '', '   ']) {
    assert.deepEqual(combinarPersonaContacto({ ok: true, id }, { ok: true }), { estado: 'creada_sin_id' })
  }
})

test('el alta falla: no se ha creado nada y el vínculo ni se cuenta', () => {
  assert.deepEqual(combinarPersonaContacto({ ok: false }, null), { estado: 'no_creada' })
  assert.deepEqual(combinarPersonaContacto({ ok: false }, { ok: true }), { estado: 'no_creada' })
})

test('el texto de éxito NO promete acceso: autorizar es otro acto', () => {
  const t = textoPersonaContacto({ estado: 'creada_y_vinculada', id: 'x' }, 'Juan', 'Grupo ELCA 83')
  assert.match(t, /NO ve nada/)
  assert.match(t, /Autorizar/)
})
