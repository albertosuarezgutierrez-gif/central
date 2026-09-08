import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeWhatsapp, nombreDePila, type DestinatarioWhatsapp } from './mensaje-whatsapp.ts'
import { revisarCopy, explicarInfracciones } from './copy-regulado.ts'
import { MEDIADOR } from './mediador.ts'

const d = (p: Partial<DestinatarioWhatsapp> = {}): DestinatarioWhatsapp => ({
  esCliente: true,
  nombre: 'José Antonio Suárez Gutiérrez',
  email: 'jose@ejemplo.es',
  ...p,
})

/** Los tres mensajes que existen. Todo cepo de aquí abajo los barre a los tres. */
const TODOS = () => [
  mensajeWhatsapp(d()),
  mensajeWhatsapp(d({ email: null })),
  mensajeWhatsapp(d({ esCliente: false })),
]

test('cliente con correo: dice A QUÉ correo le llega, y en futuro', () => {
  const m = mensajeWhatsapp(d())
  assert.match(m, /jose@ejemplo\.es/)
  assert.match(m, /área de clientes/)
  assert.match(m, /spam/)
  // 🚨 «te he mandado» sería falso siempre que Alberto pulse este botón antes de
  // invitar — que es la mitad de las veces, porque son dos botones distintos.
  assert.doesNotMatch(m, /te he mandado|te acabo de mandar|ya te he/i)
})

test('cliente SIN correo: no promete un envío que no puede salir; lo pide', () => {
  const m = mensajeWhatsapp(d({ email: null }))
  assert.match(m, /¿Me pasas un correo/)
  assert.doesNotMatch(m, /te llega un correo/i)
  // Sin `email`, un fallo de interpolación dejaría un «a null» o un «a » suelto.
  assert.doesNotMatch(m, /null|undefined/)
})

test('lead: NO se le ofrece el portal — entraría a una bóveda vacía', () => {
  const m = mensajeWhatsapp(d({ esCliente: false }))
  assert.doesNotMatch(m, /área de clientes|portal|intranet|acceso/i)
  assert.match(m, /corredor de seguros/)
})

test('🪤 NINGÚN mensaje lleva un enlace: el token del portal viaja por correo', () => {
  // Si alguien mete aquí el enlace de la invitación, el chat reenviado abre los
  // seguros de un tercero. El cepo mira cualquier URL, no solo la del portal.
  for (const m of TODOS()) {
    assert.doesNotMatch(m, /https?:\/\/|www\.|\.es\/|\.com\//i, `lleva un enlace:\n${m}`)
  }
})

test('🪤 NINGÚN mensaje promete precio ni ahorro (RDL 3/2020)', () => {
  for (const m of TODOS()) {
    const infracciones = revisarCopy(m, { ambito: true })
    assert.deepEqual(infracciones, [], explicarInfracciones(infracciones) + `\n\nen:\n${m}`)
  }
})

test('🪤 la firma sale de MEDIADOR, no de un literal escrito a mano', () => {
  for (const m of TODOS()) assert.match(m, new RegExp(MEDIADOR.marca))
})

test('nombre de pila: recorta, pero no parte una razón social ni inventa saludo', () => {
  assert.equal(nombreDePila('José Antonio Suárez'), 'José')
  assert.equal(nombreDePila('  Ana   Ruiz  '), 'Ana')
  assert.equal(nombreDePila('Ana'), 'Ana')
  // «GLOBAL 2 SL» partido por el espacio saluda a «GLOBAL»; entera es peor pero
  // no es un error de lectura. Lo que NO puede pasar es «Hola ,».
  assert.equal(nombreDePila('SL 2 GLOBAL'), 'SL 2 GLOBAL')
  assert.equal(nombreDePila('   '), null)
  assert.doesNotMatch(mensajeWhatsapp(d({ nombre: '  ' })), /Hola\s+,/)
})
