import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajePresentacionWhatsapp } from './mensaje-whatsapp.ts'
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

test('saluda por el nombre de pila, y sin nombre cuando no lo hay', () => {
  // La regla es la MISMA que usa la bóveda del portal (`nombre-de-pila.ts`, con
  // sus propios tests): aquí solo se comprueba que este mensaje la respeta y no
  // trae una segunda copia que un día se separe.
  assert.match(mensajePresentacionWhatsapp('José Antonio Suárez'), /^Hola José, soy /)
  // Sociedad: no tiene nombre de pila, así que se saluda sin nombre en vez de
  // gritarle «Hola GLOBAL» a una empresa.
  assert.match(mensajePresentacionWhatsapp('GLOBAL 2 SL'), /^Hola, soy /)
  assert.match(mensajePresentacionWhatsapp('   '), /^Hola, soy /)
  // Lo que NUNCA puede salir es la plantilla a medio rellenar.
  for (const n of ['  ', 'GLOBAL 2 SL', 'José Antonio Suárez']) {
    assert.doesNotMatch(mensajePresentacionWhatsapp(n), /Hola\s+,|Hola\s*,\s*,/)
  }
})
