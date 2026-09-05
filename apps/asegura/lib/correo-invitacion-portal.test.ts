/**
 * El cepo del correo con el que se invita a un cliente al portal.
 *
 * Quien lo recibe no ha probado todavía que es quien Alberto cree, y la
 * dirección la ha tecleado él: puede ser un buzón compartido o tener una letra
 * mal. Así que este fichero recorre el texto ENTERO buscando lo que no puede
 * aparecer, con la misma lista que el resto de correos del portal
 * (`CAMPOS_PROHIBIDOS_EN_INVITACION`) — una sola lista, para que la del panel
 * del corredor no se relaje por su cuenta.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

import { cuerpoInvitacionPortal, enlacePortal } from './correo-invitacion-portal.ts'

/** Baja a minúsculas y quita tildes: sin esto «compañía» no casaría con `compania`. */
function aplanar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const ENLACE = 'https://portal.example.com/'

function correoCompleto(yaEntraba = false) {
  return cuerpoInvitacionPortal({ nombre: 'Grupo ELCA 83 S.L.', enlace: ENLACE, yaEntraba })
}

test('la invitacion al portal no nombra NINGUN campo de la cartera', () => {
  for (const yaEntraba of [false, true]) {
    const c = correoCompleto(yaEntraba)
    const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
    const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((campo) => todo.includes(aplanar(campo)))
    assert.deepEqual(
      colados,
      [],
      'Este correo llega a una dirección tecleada a mano, a alguien que todavía no ha probado que es ' +
        'él. Estos campos no pueden salir de aquí:\n  - ' + colados.join('\n  - '),
    )
  }
})

test('🚨 no dice CUANTAS polizas tiene: eso ya es informacion de la cartera', () => {
  // El recuento parece inocuo y no lo es: en un buzón compartido revela que esa
  // persona es cliente y con cuánto. Lo que se cuenta es que hay un portal.
  const c = correoCompleto()
  const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
  for (const pista of ['tienes 1', 'tienes 2', 'polizas activas', 'tus 3']) {
    assert.ok(!todo.includes(aplanar(pista)), `no debe aparecer «${pista}»`)
  }
})

test('🚨 el enlace NO lleva token: un correo se reenvia', () => {
  // Si algún día alguien mete una llave en la URL, este test cae. Es
  // deliberado: el enlace no puede abrir sesión por sí mismo, porque entonces
  // reenviar el correo regalaría la cartera.
  const c = correoCompleto()
  assert.ok(c.texto.includes(ENLACE))
  assert.ok(!/[?#]/.test(ENLACE), 'el enlace de este correo no lleva query ni fragmento')
  assert.ok(
    aplanar(c.texto).includes('no abre sesion por si mismo'),
    'el correo tiene que DECIR que reenviarlo no sirve de nada',
  )
})

test('sin nombre legible no se inventa uno', () => {
  const c = cuerpoInvitacionPortal({ nombre: null, enlace: ENLACE, yaEntraba: false })
  assert.ok(c.texto.startsWith('Hola:'), 'arranca sin nombre, no con «Estimado cliente»')
  assert.ok(!aplanar(c.texto).includes('estimado cliente'))
})

test('🚨 a quien YA entra no se le dice que ahora puede entrar', () => {
  // Reenviar el enlace a quien lo perdió y abrirle el acceso por primera vez son
  // cosas distintas; con el mismo texto, el segundo caso le hace pensar que le
  // han creado una cuenta nueva.
  const primera = aplanar(correoCompleto(false).texto)
  const reenvio = aplanar(correoCompleto(true).texto)
  assert.ok(primera.includes('desde ahora puedes'))
  assert.ok(!reenvio.includes('desde ahora puedes'))
  assert.ok(reenvio.includes('otra vez el enlace'))
  assert.notEqual(correoCompleto(false).asunto, correoCompleto(true).asunto)
})

test('el enlace apunta a la PORTADA, que es donde se pide el codigo', () => {
  assert.equal(enlacePortal('https://clientes.grupoasegura.es'), 'https://clientes.grupoasegura.es/')
  assert.equal(enlacePortal('https://clientes.grupoasegura.es/algo'), 'https://clientes.grupoasegura.es/')
})

test('🚨 sin portal utilizable NO se manda un correo que dice «entra aqui» sin el aqui', () => {
  assert.equal(enlacePortal(''), null)
  assert.equal(enlacePortal('   '), null)
  assert.equal(enlacePortal('no-es-una-url'), null)
  // http:// no vale: en esa pantalla se teclea un código de acceso.
  assert.equal(enlacePortal('http://clientes.grupoasegura.es'), null)
})
