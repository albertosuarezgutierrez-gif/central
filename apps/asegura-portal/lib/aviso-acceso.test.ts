import test from 'node:test'
import assert from 'node:assert/strict'

import { mensajePrimerAcceso } from './aviso-acceso.ts'

test('🚨 sin vínculo NO se dice el nombre', () => {
  // Lo único que hay es lo que esa persona ha tecleado. Escribirlo como si
  // fuera quien dice ser convierte un campo de texto libre en una afirmación
  // de identidad, y encima en el canal donde Alberto decide si se preocupa.
  const m = mensajePrimerAcceso({ identidadId: 'i1', nombre: 'María Ejemplo', vinculo: 'no' })
  assert.ok(!m.includes('María'), `el nombre no verificado se ha colado: ${m}`)
  assert.match(m, /NO se ha casado con ninguna ficha/)
})

test('con vínculo sí se dice, porque ahí sí consta quién es', () => {
  const m = mensajePrimerAcceso({ identidadId: 'i1', nombre: 'María Ejemplo', vinculo: 'si' })
  assert.match(m, /María Ejemplo/)
})

test('vinculada y sin nombre no inventa uno', () => {
  const m = mensajePrimerAcceso({ identidadId: 'i1', nombre: null, vinculo: 'si' })
  assert.ok(!m.includes('null') && !m.includes('undefined'), m)
})

test('🚨 el aviso nunca lleva el correo, porque el portal no lo tiene', () => {
  // Solo guarda su hash con pimienta. Si algún día alguien mete aquí un email,
  // será porque lo ha sacado de otra tabla — y este cepo obliga a explicarlo.
  const m = mensajePrimerAcceso({ identidadId: 'i1', nombre: 'María', vinculo: 'si' })
  assert.ok(!m.includes('@'), `no puede haber una dirección en el aviso: ${m}`)
})

test('🚨 «no se ha podido comprobar» no se dice como «no tiene ficha»', () => {
  // `vincularIdentidad` devuelve seis estados y tres de ellos (`ambiguo`,
  // `sin_clave`, `error`) son «no lo sé». Contarlos como «no se ha casado con
  // ninguna ficha» afirmaría algo que nadie ha mirado, justo en el mensaje con
  // el que Alberto decide si se preocupa — y encima al revés de lo prudente:
  // un `error` puede estar tapando que SÍ tiene ficha.
  const m = mensajePrimerAcceso({ identidadId: 'i1', nombre: 'María', vinculo: 'no_se_sabe' })
  assert.ok(!m.includes('NO se ha casado'), m)
  assert.match(m, /no se ha podido comprobar/i)
})
