import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mensajePresentacionWhatsapp } from './mensaje-whatsapp.ts'
import { revisarCopy, explicarInfracciones } from './copy-regulado.ts'
import { MEDIADOR } from './mediador.ts'

const M = () => mensajePresentacionWhatsapp('Carmen Ruiz Ponce')

test('se presenta como corredor y deja el contacto abierto', () => {
  const m = M()
  assert.match(m, /^Hola Carmen, soy .+, corredor de seguros\./)
  assert.match(m, /me escribes/)
})

test('🪤 SÍ le ofrece la intranet, que es lo que se le vende', () => {
  // Alberto, 08/09/2026: «hay q vender la intranet para que entre y meta sus
  // datos». Y se puede sin mentir: entrar no exige cartera y «Añade una
  // póliza» se pinta sin condición (medido en `apps/asegura-portal`). Si algún
  // día alguien vuelve a quitarlo «porque entraría a una bóveda vacía» —que es
  // lo que decía la primera versión de este módulo, y era falso— este cepo lo
  // para.
  assert.match(M(), new RegExp(MEDIADOR.identidad.portal.replace(/[.]/g, '\\.')))
  assert.match(M(), /intranet|todos tus seguros/i)
})

test('🪤 le dice que sube pólizas DE CUALQUIER compañía, que es la razón de entrar', () => {
  // Sin esto el mensaje ofrece «tus seguros en un sitio» a alguien que no tiene
  // ninguno con nosotros, y entonces la oferta no se entiende.
  assert.match(M(), /sean de la compañía que sean|de cualquier compañía/i)
})

test('🪤 NO promete que se las gestionamos ni que las contratamos', () => {
  // El portal declara lo contrario sobre una póliza declarada por el usuario:
  // «no la contratamos ni la gestionamos por ti». Es un cuaderno suyo con
  // avisos, no un encargo de mediación: prometerlo por WhatsApp asumiría un
  // deber que no existe, y encima sobre pólizas de otras compañías.
  assert.doesNotMatch(M(), /(gestionamos|llevamos|tramitamos|renovamos|contratamos)\s+(todos\s+)?tus\b/i)
  assert.doesNotMatch(M(), /nos\s+encargamos\s+de\s+tus/i)
  // Y lo dice en positivo: los apuntes son suyos.
  assert.match(M(), /tus apuntes|los guardas tú/i)
})

test('🪤 no le habla como si ya fuera cliente', () => {
  // «tus pólizas con nosotros»: no tiene ninguna. La herramienta vale
  // justamente para las que tiene con otros.
  assert.doesNotMatch(M(), /tus pólizas con nosotros|tu seguro con nosotros|tus recibos/i)
})

test('🪤 el ÚNICO enlace del mensaje es el portal: ni CRM, ni el .com, ni una segunda URL', () => {
  // Dos URLs en un mensaje corto compiten y la persona no sabe cuál abrir. Se
  // queda la que tiene algo que HACER al otro lado. Y las otras tres que desde
  // un WhatsApp se ven iguales no llevan a nada suyo: `app.grupoasegura.com` es
  // el CRM de Manuel y el apex `.com` es un parking de IONOS.
  const urls = M().match(/https?:\/\/[^\s]+/g) ?? []
  assert.deepEqual(urls, [MEDIADOR.identidad.portal], `enlaces del mensaje: ${urls.join(' · ')}`)
  assert.doesNotMatch(M(), /app\.grupoasegura|grupoasegura\.com/i)
})

test('🪤 no le nombra NINGÚN correo concreto con el que entrar', () => {
  // Quién recibe el código lo decide `portal.emailInvitacion` en asegura, y esa
  // regla ya la usa el canal del CLIENTE (`lib/invitacion-whatsapp.ts`, PR
  // #2604). Escribir aquí una dirección sería una segunda regla: el día que se
  // separen, teclearía la que le dijimos y no recibiría ningún código, sin un
  // solo error por ninguna parte. Se le dice «tu correo», que es cierto para
  // todo el mundo.
  assert.doesNotMatch(M(), /[\w.+-]+@[\w-]+\.[\w.]+/)
  assert.match(M(), /con tu correo/i)
})

test('🪤 el portal que se manda es el MISMO que sirve la web (no dos dominios)', () => {
  // `apps/asegura-web` enseña el botón «Área de clientes» con su propio
  // `PORTAL_URL`. Si los dos se separan, una persona acaba en un dominio y otra
  // en otro sin que falle nada. Se lee el FUENTE porque el de allí es un
  // `process.env || default` y este paquete no importa código de una app.
  const sitio = readFileSync(new URL('../../../apps/asegura-web/lib/sitio.ts', import.meta.url), 'utf8')
  const m = sitio.match(/PORTAL_URL\s*=\s*\(process\.env\.NEXT_PUBLIC_PORTAL_URL\s*\|\|\s*'([^']+)'/)
  assert.ok(m, 'no se encontró el default de PORTAL_URL en apps/asegura-web/lib/sitio.ts')
  assert.equal(m[1], MEDIADOR.identidad.portal)
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

// ─── WhatsApp de seguimiento a un lead de Vencimientos (23/09/2026) ─────────
import { mensajeRenovacionLeadWhatsapp } from './mensaje-whatsapp.ts'
import { puedeWhatsappLead, textoPasoLead } from './lead-competencia.ts'

test('seguimiento (texto de Alberto, 30/09/2026): «si no me equivoco», ramo coloquial y mes', () => {
  const m = mensajeRenovacionLeadWhatsapp({ nombre: 'Mari Angeles Pérez', ramo: 'auto', mesAniversario: 11 })
  assert.equal(m, 'Hola Mari, soy Alberto, de GrupoASegura.es. Si no me equivoco, tu seguro de coche vence en noviembre. ' +
    '¿Te preparo un estudio sin compromiso? Si no quieres que te escriba más, dímelo y no lo vuelvo a hacer. ¡Gracias!')
  assert.match(mensajeRenovacionLeadWhatsapp({ nombre: 'Ana', ramo: 'hogar', mesAniversario: 3 }), /tu seguro de casa vence en marzo/)
  // Lo que no se sabe no se inventa: sin nombre, sin ramo reconocible y sin mes.
  const sinDatos = mensajeRenovacionLeadWhatsapp({ nombre: null, ramo: 'otros', mesAniversario: null })
  assert.match(sinDatos, /^Hola, soy Alberto, de GrupoASegura\.es\. Si no me equivoco, tu seguro vence pronto\./)
  assert.doesNotMatch(sinDatos, /undefined|null|de otros/)
})

test('🪤 seguimiento: no promete precio ni ahorro, lleva la baja (LSSI art. 21) y no lleva la web entera', () => {
  const m = mensajeRenovacionLeadWhatsapp({ nombre: 'Ana', ramo: 'auto', mesAniversario: 3 })
  assert.deepEqual(revisarCopy(m), [], explicarInfracciones(revisarCopy(m)))
  assert.match(m, /Si no quieres que te escriba más, dímelo/)
  assert.doesNotMatch(m, /https?:\/\/|intranet/)
})

test('🪤 WhatsApp a un lead: a todos los que tengan teléfono (Alberto, 30/09/2026, asumiendo el riesgo LSSI)', () => {
  assert.equal(puedeWhatsappLead({ tieneTelefono: true }), true)
  assert.equal(puedeWhatsappLead({ tieneTelefono: false }), false)
})

test('con WhatsApp permitido el primer contacto y el recordatorio son por WhatsApp; la llamada sigue siendo llamada', () => {
  const p = (accion: 'primer_contacto' | 'recordatorio' | 'llamada') => ({ accion, dentroDeDias: 0 })
  assert.equal(textoPasoLead(p('primer_contacto'), 'telefono_y_correo', true), 'Primer WhatsApp')
  assert.equal(textoPasoLead(p('recordatorio'), 'solo_telefono', true), 'Recordatorio por WhatsApp')
  assert.equal(textoPasoLead(p('llamada'), 'telefono_y_correo', true), 'Llamar')
  assert.equal(textoPasoLead(p('primer_contacto'), 'telefono_y_correo'), 'Primer correo')
  // Sin teléfono no hay WhatsApp aunque se pida.
  assert.equal(textoPasoLead(p('primer_contacto'), 'solo_correo', true), 'Primer correo')
})
