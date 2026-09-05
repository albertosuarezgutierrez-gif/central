/**
 * El cepo del correo de «tienes un acceso esperando».
 *
 * Quien lo recibe todavía NO ha confirmado nada y la dirección la ha tecleado
 * Alberto: puede ser un buzón compartido o tener una letra mal. Así que este
 * fichero recorre el texto ENTERO buscando lo que no puede aparecer, con la
 * misma lista que el correo de invitación del portal
 * (`CAMPOS_PROHIBIDOS_EN_INVITACION`) — una sola lista, para que la del panel
 * del corredor no se relaje por su cuenta.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

import { cuerpoAvisoAcceso, enlaceDeAutorizaciones } from './correo-aviso-acceso.ts'

/** Baja a minúsculas y quita tildes: sin esto «compañía» no casaría con `compania`. */
function aplanar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const CADUCA = new Date(Date.UTC(2027, 2, 14))

/** Un correo con todo lo que este correo puede llevar: nombre, enlace y fecha. */
function correoCompleto() {
  return cuerpoAvisoAcceso({
    otorgante: 'Grupo ELCA 83 S.L.',
    enlace: 'https://portal.example.com/autorizaciones',
    caducaEn: CADUCA,
  })
}

test('el aviso de acceso no nombra NINGUN campo de la poliza', () => {
  const c = correoCompleto()
  const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
  const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((campo) => todo.includes(aplanar(campo)))
  assert.deepEqual(
    colados,
    [],
    'Este correo lo recibe alguien que todavía no ha confirmado nada, en una dirección tecleada ' +
      'a mano. Estos campos son de un tercero que no ha consentido y no pueden salir de aquí:\n  - ' +
      colados.join('\n  - '),
  )
})

test('el cepo SI muerde: no esta mirando un texto vacio', () => {
  const c = correoCompleto()
  assert.ok(c.texto.length > 200 && c.html.length > 200, 'el cuerpo tiene que tener texto que recorrer')
  const envenenado = aplanar(c.texto + '\nSu compañía es X y la matrícula 1234ABC')
  const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((campo) => envenenado.includes(aplanar(campo)))
  assert.ok(colados.length > 0, 'con un campo prohibido dentro, el cepo de arriba tiene que fallar')
})

test('tampoco dice QUE alcance se ha concedido: eso ya es la cartera ajena', () => {
  const todo = aplanar([correoCompleto().asunto, correoCompleto().texto, correoCompleto().html].join('\n'))
  for (const alcance of ['ver_economico', 'partes', 'documentos', 'apoderad']) {
    assert.ok(!todo.includes(aplanar(alcance)), `el correo no puede decir «${alcance}»`)
  }
})

test('sin nombre legible dice lo que es, no inventa uno ni deja el hueco', () => {
  const c = cuerpoAvisoAcceso({ otorgante: null, enlace: 'https://p.example.com/autorizaciones', caducaEn: null })
  assert.ok(c.asunto.startsWith('Un cliente de Grupo ASegura'), c.asunto)
  assert.ok(!c.texto.includes('null') && !c.texto.includes('undefined'), c.texto)
  assert.ok(!c.html.includes('null') && !c.html.includes('undefined'), c.html)
})

test('sin fecha de caducidad NO se inventa un plazo', () => {
  const c = cuerpoAvisoAcceso({ otorgante: 'ELCA', enlace: 'https://p.example.com/autorizaciones', caducaEn: null })
  assert.ok(!c.texto.includes('se cierra solo'), c.texto)
  assert.ok(!c.html.includes('se cierra solo'), c.html)
  // Y con fecha, la dice en español (dd/mm/aaaa), no en ISO.
  const con = correoCompleto()
  assert.ok(con.texto.includes('14/03/2027'), con.texto)
  assert.ok(!con.texto.includes('2027-03-14'), con.texto)
})

test('el asunto no se puede partir con un salto de linea', () => {
  const c = cuerpoAvisoAcceso({
    otorgante: 'ELCA\r\nBcc: fuga@example.com',
    enlace: 'https://p.example.com/autorizaciones',
    caducaEn: null,
  })
  assert.ok(!/[\r\n]/.test(c.asunto), c.asunto)
})

test('el enlace lleva a /autorizaciones y solo por https', () => {
  assert.equal(enlaceDeAutorizaciones('https://clientes.example.com'), 'https://clientes.example.com/autorizaciones')
  // Un http mandaría a teclear un código de acceso por una red que lo lee.
  assert.equal(enlaceDeAutorizaciones('http://clientes.example.com'), null)
  assert.equal(enlaceDeAutorizaciones('no-es-una-url'), null)
  assert.equal(enlaceDeAutorizaciones(''), null)
})

test('sin ASEGURA_PORTAL_URL cae a donde el portal sirve HOY, no a un dominio adivinado', () => {
  // Documenta el defecto: el dominio bonito todavia no apunta a Vercel, asi que
  // el enlace tiene que ir a la URL que funciona.
  assert.equal(enlaceDeAutorizaciones(), 'https://asegura-portal.vercel.app/autorizaciones')
})

test('el enlace NO lleva token: se puede reenviar sin abrir nada', () => {
  const enlace = enlaceDeAutorizaciones('https://clientes.example.com')
  assert.ok(enlace !== null)
  assert.equal(new URL(enlace).search, '', 'un token en la URL sería una llave viajando por correo')
})
