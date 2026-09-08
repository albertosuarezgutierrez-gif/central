import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajePresentacionWhatsapp, nombreDePila } from './mensaje-whatsapp.ts'
import { revisarCopy, explicarInfracciones } from './copy-regulado.ts'
import { MEDIADOR } from './mediador.ts'

const M = () => mensajePresentacionWhatsapp('Carmen Ruiz Ponce')

test('se presenta como corredor y deja el contacto abierto', () => {
  const m = M()
  assert.match(m, /^Hola Carmen, soy .+, corredor de seguros\./)
  assert.match(m, /me escribes/)
})

test('🪤 al lead NO se le ofrece el portal: entraría a una bóveda vacía', () => {
  // Ese canal es `lib/invitacion-whatsapp.ts` de plataforma y devuelve
  // `no_procede` para quien no es cliente. Prometerle aquí un área de clientes
  // sería mandarle a una pantalla sin nada suyo dentro.
  assert.doesNotMatch(M(), /área de clientes|portal|intranet|acceso|entrar/i)
})

test('🪤 no le habla como si ya fuera cliente', () => {
  // «tus pólizas» con la correduría: no tiene ninguna.
  assert.doesNotMatch(M(), /tus pólizas|tus recibos|tu seguro con nosotros/i)
})

test('🪤 no lleva ningún enlace', () => {
  // No hay a dónde mandarle todavía, y una URL suelta en un primer mensaje a
  // un desconocido es lo que hace que lo lea como spam.
  assert.doesNotMatch(M(), /https?:\/\/|www\.|\.es\/|\.com\//i)
})

test('🪤 no promete precio ni ahorro (RDL 3/2020)', () => {
  const infracciones = revisarCopy(M(), { ambito: true })
  assert.deepEqual(infracciones, [], explicarInfracciones(infracciones) + `\n\nen:\n${M()}`)
})

test('🪤 la firma sale de MEDIADOR, no de un literal escrito a mano', () => {
  assert.match(M(), new RegExp(MEDIADOR.marca))
})

test('nombre de pila: recorta, pero no parte una razón social ni inventa saludo', () => {
  assert.equal(nombreDePila('José Antonio Suárez'), 'José')
  assert.equal(nombreDePila('  Ana   Ruiz  '), 'Ana')
  assert.equal(nombreDePila('Ana'), 'Ana')
  assert.equal(nombreDePila('SL 2 GLOBAL'), 'SL 2 GLOBAL')
  assert.equal(nombreDePila('   '), null)
  assert.doesNotMatch(mensajePresentacionWhatsapp('  '), /Hola\s+,/)
})
