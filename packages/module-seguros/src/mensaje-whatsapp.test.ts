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

test('lleva la web pública, y sale de MEDIADOR (no escrita a mano)', () => {
  assert.match(M(), new RegExp(MEDIADOR.identidad.web.replace(/[.]/g, '\\.')))
})

test('🪤 el ÚNICO enlace del mensaje es la web: ni portal, ni CRM, ni el .com', () => {
  // El portal enseña SUS pólizas y un lead no tiene ninguna: mandarle ahí es
  // la bóveda vacía. `app.grupoasegura.com` es el CRM de Manuel y el apex
  // `.com` es un parking de IONOS — los tres mandan a la persona a un sitio
  // donde no hay nada suyo, y desde el mensaje se ven todos iguales.
  const urls = M().match(/https?:\/\/[^\s]+/g) ?? []
  assert.deepEqual(urls, [MEDIADOR.identidad.web], `enlaces del mensaje: ${urls.join(' · ')}`)
  assert.doesNotMatch(M(), /clientes\.|app\.grupoasegura|grupoasegura\.com/i)
})

test('🪤 no le nombra un correo «para acceder»', () => {
  // Sería la llave de una puerta que no lleva a ningún sitio.
  assert.doesNotMatch(M(), /para (entrar|acceder)|tu correo|con tu email/i)
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
