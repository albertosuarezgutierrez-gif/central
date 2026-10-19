import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import {
  cuerpoAltaLeadCorreo, cuerpoOportunidadLeadCorreo, esDestinoCorreduria, esLeadCorreduria, esRespuestaDeLead,
  hoyMadrid, motivoSinAlta, nombreVisible, normalizarLeadCorreo, plantillaPeticionDatos, ramoDeTexto,
  ramoPlantilla, textoAvisoLeadCorreo, textoPlantillaTelegram, type LeadCorreo,
} from './lead-correduria.ts'
import { destinatariosDe, referenciasDe } from './imap.ts'

// El correo real del 19/10/2026 (datos inventados): a hola@, desde un gmail, abriendo hilo.
const LEAD = { from: 'ana.perez@gmail.com', destinatarios: ['hola@grupoasegura.es', 'alberto.suarez@gmail.com'], referencias: [] as string[], buzonPropio: 'alberto.suarez@gmail.com' }

test('🪤 regla determinista: a hola@ desde fuera y abriendo hilo = lead de la correduría', () => {
  assert.equal(esLeadCorreduria(LEAD), true)
  // Cada brazo, por separado:
  assert.equal(esLeadCorreduria({ ...LEAD, destinatarios: ['alberto.suarez@gmail.com'] }), false, 'no iba a la correduría')
  assert.equal(esLeadCorreduria({ ...LEAD, referencias: ['<x@mail.gmail.com>'] }), false, 'una respuesta a algo que escribió Alberto no es un lead')
  assert.equal(esLeadCorreduria({ ...LEAD, from: 'hola@grupoasegura.es' }), false, 'lo que sale de la propia correduría no es un lead')
  assert.equal(esLeadCorreduria({ ...LEAD, from: 'alberto.suarez@gmail.com' }), false, 'el propio buzón de Alberto no es un lead')
  assert.equal(esLeadCorreduria({ ...LEAD, from: 'mediadores@allianz.es' }), false, 'una aseguradora no es un lead')
  assert.equal(esLeadCorreduria({ ...LEAD, from: 'no-reply@algo.com' }), false, 'un buzón automático no es un lead')
  assert.equal(esLeadCorreduria({ ...LEAD, from: 'MAILER-DAEMON@googlemail.com' }), false)
  assert.equal(esLeadCorreduria({ ...LEAD, destinatarios: undefined }), false, 'sin destinatarios leídos no se afirma nada')
})

test('el destino sale de MEDIADOR (hola@) y cubre el gemelo .com', () => {
  assert.equal(esDestinoCorreduria([MEDIADOR.identidad.email.toUpperCase()]), true)
  assert.equal(esDestinoCorreduria(['dpo@grupoasegura.com']), true)
  assert.equal(esDestinoCorreduria(['hola@grupoaseguras.es']), false)
  assert.equal(esDestinoCorreduria([]), false)
})

test('cabeceras: To/Cc/Delivered-To/X-Forwarded-To se leen; From y Reply-To no', () => {
  const lineas = [
    { key: 'from', line: 'From: Ana <ana@gmail.com>' },
    { key: 'reply-to', line: 'Reply-To: otra@gmail.com' },
    { key: 'to', line: 'To: "Grupo ASegura" <Hola@GrupoASegura.es>, x@y.es' },
    { key: 'delivered-to', line: 'Delivered-To: alberto@gmail.com' },
    { key: 'x-forwarded-to', line: 'X-Forwarded-To: alberto@gmail.com' },
  ]
  assert.deepEqual(destinatariosDe(lineas), ['hola@grupoasegura.es', 'x@y.es', 'alberto@gmail.com'])
  assert.deepEqual(destinatariosDe(undefined), [])
  assert.deepEqual(referenciasDe('<a@b>', ['<c@d>', '<a@b>']), ['<a@b>', '<c@d>'])
  assert.deepEqual(referenciasDe(undefined, '<c@d> <e@f>'), ['<c@d>', '<e@f>'])
  assert.deepEqual(referenciasDe(undefined, undefined), [])
})

test('un hilo = un lead: la respuesta casa por sus referencias', () => {
  const ids = new Set(['<lead1@mail.gmail.com>'])
  assert.equal(esRespuestaDeLead(['<otro@x>', '<lead1@mail.gmail.com>'], ids), true)
  assert.equal(esRespuestaDeLead(['<otro@x>'], ids), false)
  assert.equal(esRespuestaDeLead(undefined, ids), false)
})

const TEXTO = 'COMPARATIVA PRESUPUESTOS PARA SEGURO\nHola, quiero comparar precios del seguro de mi casa en Sevilla. Mi móvil es 612 34 56 78.\nUn saludo, Ana Pérez Gómez'
const CTX = { texto: TEXTO, from: 'Ana.Perez@gmail.com', fromNombre: 'Ana Pérez Gómez' }

test('🪤 lo que dice la IA se COMPRUEBA contra el correo: nada inventado entra en la cartera', () => {
  const ok = normalizarLeadCorreo({ es_lead: true, nombre: 'Ana Pérez Gómez', email: 'ana.perez@gmail.com', telefono: '612345678', ramos: ['hogar'], pide_presupuesto: true, resumen: 'Comparativa de hogar' }, CTX)
  assert.equal(ok.nombre, 'Ana Pérez Gómez')
  assert.equal(ok.email, 'ana.perez@gmail.com')
  assert.equal(ok.telefono !== null, true)
  assert.deepEqual(ok.ramos, ['hogar'])
  assert.equal(ok.pidePresupuesto, true)
  assert.equal(ok.esLead, true)

  // Teléfono que NO está en el correo → null (nunca se inventa).
  assert.equal(normalizarLeadCorreo({ telefono: '699000111' }, CTX).telefono, null)
  // Email que no está en el correo → el del REMITENTE (eso sí es un hecho).
  assert.equal(normalizarLeadCorreo({ email: 'inventado@x.es' }, CTX).email, 'ana.perez@gmail.com')
  // Nombre que no figura → el visible del remitente.
  assert.equal(normalizarLeadCorreo({ nombre: 'Lucía Martín' }, CTX).nombre, 'Ana Pérez Gómez')
  // El teléfono de la propia correduría (firma citada) no es del lead.
  const conNuestro = { ...CTX, texto: `${TEXTO}\n> ${MEDIADOR.identidad.telefono}` }
  assert.equal(normalizarLeadCorreo({ telefono: MEDIADOR.identidad.telefono }, conNuestro).telefono, null)
})

test('IA caída o basura: tres estados, nunca un valor de cajón', () => {
  const nada = normalizarLeadCorreo(null, { texto: 'hola', from: 'x@gmail.com', fromNombre: null })
  assert.deepEqual(nada, { nombre: null, email: 'x@gmail.com', telefono: null, ramos: [], pidePresupuesto: null, resumen: null, esLead: null })
  const raro = normalizarLeadCorreo({ ramos: ['otros', 'patata', 'coche'], resumen: 'null', pide_presupuesto: 'quizá' }, CTX)
  assert.deepEqual(raro.ramos, ['auto'], '«otros» y lo desconocido se descartan: ramo sin identificar ≠ «otros»')
  assert.equal(raro.resumen, null)
  assert.equal(raro.pidePresupuesto, null)
  assert.equal(ramoDeTexto('Responsabilidad civil'), 'responsabilidad_civil')
  assert.equal(ramoDeTexto('vivienda'), 'hogar')
  assert.equal(ramoDeTexto(3), null)
})

test('alta: sin nombre o sin contacto no se da de alta; la publicidad tampoco', () => {
  const base: LeadCorreo = { nombre: 'Ana', email: 'a@b.es', telefono: null, ramos: [], pidePresupuesto: null, resumen: null, esLead: null }
  assert.equal(motivoSinAlta(base), null)
  assert.ok(motivoSinAlta({ ...base, nombre: null }))
  assert.ok(motivoSinAlta({ ...base, email: null }))
  assert.ok(motivoSinAlta({ ...base, esLead: false }))
})

test('cuerpo del alta: fuente correo, actor del triaje y SIN consentimiento web', () => {
  const l: LeadCorreo = { nombre: 'Ana Pérez', email: 'a@b.es', telefono: null, ramos: ['hogar'], pidePresupuesto: true, resumen: 'Comparativa de hogar', esLead: true }
  const c = cuerpoAltaLeadCorreo(l, 'COMPARATIVA')
  assert.equal(c.fuente, 'correo')
  assert.equal(c.actor, 'agente:triaje-correo')
  assert.equal('consentimiento' in c, false, 'no hubo formulario: no se fabrica una prueba de consentimiento')
  assert.match(String(c.notas), /Quiere: hogar/)
  const o = cuerpoOportunidadLeadCorreo('11111111-1111-1111-1111-111111111111', 'hogar', l, new Date('2026-10-19T22:30:00Z'))
  assert.equal(o.fuente, 'correo')
  assert.equal(o.fechaTarea, '2026-10-20', 'el día es el de Madrid, no el UTC')
  assert.equal(Object.keys(o).at(-1), 'actor', 'el actor va el ÚLTIMO del cuerpo')
  assert.equal(hoyMadrid(new Date('2026-10-19T10:00:00Z')), '2026-10-19')
})

test('🪤 plantilla FIJA por ramo, con pie legal de MEDIADOR y enlace RGPD', () => {
  const hogar = plantillaPeticionDatos({ nombre: 'Ana Pérez', ramos: ['hogar'] }, 'COMPARATIVA')
  assert.equal(hogar.ramo, 'hogar')
  assert.equal(hogar.asunto, 'Re: COMPARATIVA')
  for (const d of ['metros cuadrados', 'Año de construcción', 'habitual', 'continente', 'contenido', 'hipoteca']) {
    assert.ok(hogar.cuerpo.toLowerCase().includes(d.toLowerCase()), `hogar sin «${d}»`)
  }
  assert.ok(hogar.cuerpo.startsWith('Hola Ana:'))
  for (const dato of [MEDIADOR.identidad.claveDgsfp, MEDIADOR.identidad.nif, MEDIADOR.identidad.domicilio, `${MEDIADOR.identidad.web}/legal/privacidad`, MEDIADOR.identidad.email]) {
    assert.ok(hogar.cuerpo.includes(dato), `el pie no lleva «${dato}» de MEDIADOR`)
  }
  assert.ok(plantillaPeticionDatos({ nombre: null, ramos: ['vida'] }, 'x').cuerpo.includes('Fecha de nacimiento'))
  assert.ok(plantillaPeticionDatos({ nombre: null, ramos: ['moto'] }, 'x').cuerpo.includes('Matrícula'))
  assert.equal(plantillaPeticionDatos({ nombre: null, ramos: [] }, 'Re: x').asunto, 'Re: x')
  assert.equal(ramoPlantilla(['hogar', 'auto']), 'generico', 'dos ramos: genérica, no se elige uno a ciegas')
  assert.ok(plantillaPeticionDatos({ nombre: null, ramos: [] }, 'x').cuerpo.startsWith('Hola:'))
})

test('aviso: dice lo que se hizo y lo que NO, escapa el HTML y la plantilla va aparte', () => {
  const l: LeadCorreo = { nombre: 'Ana <b>', email: 'a@b.es', telefono: null, ramos: ['hogar'], pidePresupuesto: true, resumen: null, esLead: true }
  const p = plantillaPeticionDatos(l, 'x')
  const t = textoAvisoLeadCorreo({ remitente: 'Ana', asunto: 'x', lead: l, ficha: { estado: 'no_registrado', motivo: 'puerto caído' }, oportunidades: [], plantilla: p })
  assert.match(t, /NO se ha registrado/)
  assert.match(t, /NO se ha enviado nada/)
  assert.ok(!t.includes('<b>Ana <b>'), 'el nombre del correo no se cuela como HTML')
  assert.ok(!t.includes('legal/privacidad'), 'la plantilla va en otro mensaje: si fallara, el aviso ya salió')
  const n = textoAvisoLeadCorreo({ remitente: 'Ana', asunto: 'x', lead: l, ficha: { estado: 'nueva', id: 'id1', url: 'https://p/c/id1' }, oportunidades: [{ ramo: 'hogar', estado: 'tope' }], plantilla: p })
  assert.match(n, /Ficha nueva/)
  assert.match(n, /Tope diario/)
  const tp = textoPlantillaTelegram(p)
  assert.ok(tp.length < 4096)
  assert.match(tp, /<blockquote expandable>/)
  assert.equal(nombreVisible('"Ana Pérez" <ana@gmail.com>'), 'Ana Pérez')
  assert.equal(nombreVisible('ana@gmail.com'), null)
})
