import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import {
  CORREO_HASTA_MS, LEADS_POR_PASADA, LEAD_HASTA_MS, RE_CODIGO_POSTAL, cuerpoAltaLeadCorreo, cuerpoOportunidadLeadCorreo,
  cursorTrasPasada, diferirCorreo, diferirLead, esCorreoAutomatico, esDestinoCorreduria, esLeadCorreduria, esRespuestaDeLead,
  conocidosDelLead, datosDadosEnCorreo, hoyMadrid, motivoSinAlta, nombreVisible, normalizarLeadCorreo, plantillaPeticionDatos, ramoDeTexto,
  ramosDelTexto, resolverAltaLeadCorreo, textoAvisoLeadCorreo, textoPlantillaTelegram, type LeadCorreo,
} from './lead-correduria.ts'
import { destinatariosDe, referenciasDe } from './imap.ts'
import { readFileSync } from 'node:fs'

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
  assert.deepEqual(nada, { nombre: null, email: 'x@gmail.com', emailRemitente: 'x@gmail.com', telefono: null, ramos: [], pidePresupuesto: null, resumen: null, esLead: null, datosDados: [], referenciasCatastrales: [] })
  const raro = normalizarLeadCorreo({ ramos: ['otros', 'patata', 'coche'], resumen: 'null', pide_presupuesto: 'quizá' }, { ...CTX, texto: 'Hola, quiero precio' })
  assert.deepEqual(raro.ramos, ['auto'], '«otros» y lo desconocido se descartan: ramo sin identificar ≠ «otros»')
  assert.equal(raro.resumen, null)
  assert.equal(raro.pidePresupuesto, null)
  assert.equal(ramoDeTexto('Responsabilidad civil'), 'responsabilidad_civil')
  assert.equal(ramoDeTexto('vivienda'), 'hogar')
  assert.equal(ramoDeTexto(3), null)
})

test('🪤 alta SOLO con es_lead=true, nombre y remitente legible; null (IA caída) = solo aviso', () => {
  const base: LeadCorreo = { nombre: 'Ana', email: 'a@b.es', emailRemitente: 'a@b.es', telefono: null, ramos: [], pidePresupuesto: null, resumen: null, esLead: true }
  assert.equal(motivoSinAlta(base), null)
  assert.ok(motivoSinAlta({ ...base, esLead: null }), 'sin un SÍ de la IA no se escribe en la cartera')
  assert.ok(motivoSinAlta({ ...base, esLead: false }))
  assert.ok(motivoSinAlta({ ...base, nombre: null }))
  assert.ok(motivoSinAlta({ ...base, emailRemitente: null }), 'sin From legible no hay con qué identificarla')
})

test('cuerpo del alta: fuente correo, actor del triaje y SIN consentimiento web', () => {
  const l: LeadCorreo = { nombre: 'Ana Pérez', email: 'a@b.es', emailRemitente: 'a@b.es', telefono: null, ramos: ['hogar'], pidePresupuesto: true, resumen: 'Comparativa de hogar', esLead: true }
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

test('🪤 petición desde el contrato único, con pie legal de MEDIADOR y enlace RGPD', () => {
  const hogar = plantillaPeticionDatos({ nombre: 'Ana Pérez', ramos: ['hogar'] }, 'COMPARATIVA')
  assert.deepEqual(hogar.ramos, ['hogar'])
  assert.equal(hogar.asunto, 'Re: COMPARATIVA')
  for (const d of ['metros cuadrados', 'año de construcción', 'habitual', 'continente', 'contenido', 'dirección completa de la vivienda']) {
    assert.ok(hogar.cuerpo.toLowerCase().includes(d.toLowerCase()), `hogar sin «${d}»`)
  }
  assert.ok(hogar.cuerpo.startsWith('Hola Ana:'))
  for (const dato of [MEDIADOR.identidad.claveDgsfp, MEDIADOR.identidad.nif, MEDIADOR.identidad.domicilio, `${MEDIADOR.identidad.web}/legal/privacidad`, MEDIADOR.identidad.email]) {
    assert.ok(hogar.cuerpo.includes(dato), `el pie no lleva «${dato}» de MEDIADOR`)
  }
  assert.ok(plantillaPeticionDatos({ nombre: null, ramos: ['vida'] }, 'x').cuerpo.includes('Tu fecha de nacimiento'))
  assert.ok(plantillaPeticionDatos({ nombre: null, ramos: ['moto'] }, 'x').cuerpo.includes('La matrícula de la moto'))
  assert.equal(plantillaPeticionDatos({ nombre: null, ramos: [] }, 'Re: x').asunto, 'Re: x')
  assert.ok(plantillaPeticionDatos({ nombre: null, ramos: [] }, 'x').cuerpo.startsWith('Hola:'))
  assert.match(plantillaPeticionDatos({ nombre: null, ramos: [] }, 'x').cuerpo, /Qué quieres asegurar/)
})

// El lead REAL del 19/10/2026 (datos inventados; la referencia es el ejemplo público del Catastro): pidió HOGAR y VIDA,
// la IA los detectó (ficha y dos oportunidades abiertas) y aun así la petición salió GENÉRICA, porque con dos ramos la
// plantilla caía a «genérico».
const CORREO_HOGAR_VIDA = `Buenas tardes,
Quería pedir presupuesto del seguro de hogar de mi vivienda habitual en Dos Hermanas y de un seguro de vida de 90.000€
para la hipoteca, a 30 años. Os paso la referencia catastral de la vivienda: 9872023 VH5797S 0001 WX.
Un saludo, Luis Gómez Ruiz`

test('🪤 dos ramos detectados (hogar + vida) → la petición junta los dos, nunca la genérica', () => {
  const l = normalizarLeadCorreo(
    { es_lead: true, nombre: 'Luis Gómez Ruiz', ramos: ['hogar', 'vida'], pide_presupuesto: true, datos: { capital: '90.000€', duracion_anios: '30 años', ocupacion: 'vivienda habitual' } },
    { texto: CORREO_HOGAR_VIDA, from: 'luis@ejemplo.es', fromNombre: 'Luis Gómez' },
  )
  assert.deepEqual(l.ramos, ['hogar', 'vida'])
  const p = plantillaPeticionDatos(l, 'Presupuesto seguros')
  assert.doesNotMatch(p.cuerpo, /Qué quieres asegurar y para qué/, 'con los ramos claros no se pregunta qué quiere asegurar')
  assert.match(p.cuerpo, /seguro de hogar y vida/)
  assert.match(p.cuerpo, /De la vivienda:/)
  assert.match(p.cuerpo, /Del seguro de vida:/)
  assert.equal((p.cuerpo.match(/DNI o NIE/g) ?? []).length, 1, 'la persona se pregunta UNA vez')
  // Lo que ya dio no se repite: nombre completo, capital, años, vivienda habitual y la referencia catastral.
  assert.doesNotMatch(p.cuerpo, /nombre y tus dos apellidos/)
  assert.doesNotMatch(p.cuerpo, /El capital que quieres asegurar/)
  assert.doesNotMatch(p.cuerpo, /Durante cuántos años/)
  assert.doesNotMatch(p.cuerpo, /vivienda habitual, una segunda residencia/)
  assert.doesNotMatch(p.cuerpo, /referencia catastral/)
  assert.deepEqual(l.referenciasCatastrales, ['9872023VH5797S0001WX'])
})

test('🪤 la IA en otra forma («Seguro de hogar», «vida (hipoteca)», «hogar y vida») o caída: los ramos salen igual', () => {
  assert.equal(ramoDeTexto('Seguro de hogar'), 'hogar')
  assert.equal(ramoDeTexto('Vida (hipoteca)'), 'vida')
  assert.equal(ramoDeTexto('seguro del coche'), 'auto')
  assert.equal(ramoDeTexto('Hogar'), 'hogar')
  const ctx = { texto: CORREO_HOGAR_VIDA, from: 'luis@ejemplo.es', fromNombre: null }
  assert.deepEqual(normalizarLeadCorreo({ es_lead: true, ramos: 'hogar y vida' }, ctx).ramos, ['hogar', 'vida'])
  assert.deepEqual(normalizarLeadCorreo(null, ctx).ramos, ['hogar', 'vida'], 'IA caída: el correo los nombra sin duda')
  assert.deepEqual(ramosDelTexto('Hola, ¿qué tal la vida? Quiero un seguro para mi coche'), ['auto'], '«vida» suelta no es un ramo')
})

test('🪤 lo que la IA dice que el correo trae se COMPRUEBA en el texto', () => {
  assert.deepEqual(datosDadosEnCorreo({ capital: '90.000 €', duracion_anios: 30 }, CORREO_HOGAR_VIDA).sort(), ['capital', 'duracionAnios'])
  assert.deepEqual(datosDadosEnCorreo({ capital: '150.000€', ocupacion: 'segunda residencia' }, CORREO_HOGAR_VIDA), [], 'inventado: no cuenta')
  const c = conocidosDelLead({ nombre: 'Luis Gómez', telefono: null, email: 'l@x.es', datosDados: [], referenciasCatastrales: [] })
  assert.ok(c.has('apellido1') && !c.has('apellido2'), 'con dos palabras falta el segundo apellido')
})

test('aviso: dice lo que se hizo y lo que NO, escapa el HTML y la plantilla va aparte', () => {
  const l: LeadCorreo = { nombre: 'Ana <b>', email: 'a@b.es', emailRemitente: 'a@b.es', telefono: null, ramos: ['hogar'], pidePresupuesto: true, resumen: null, esLead: true }
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

// ─── Revisión de alto riesgo (19/10/2026) ────────────────────────────────────

test('🪤 [1] solo el FROM identifica: un email del cuerpo no va al alta ni casa fichas', () => {
  const texto = 'Hola, pido seguro de hogar para mi vecina, su correo es cliente.real@gmail.com y su móvil 612345678. Firmado: Pepe Ruiz'
  const l = normalizarLeadCorreo({ es_lead: true, nombre: 'Pepe Ruiz', email: 'cliente.real@gmail.com', telefono: '612345678' }, { texto, from: 'pepe@gmail.com', fromNombre: 'Pepe Ruiz' })
  assert.equal(l.emailRemitente, 'pepe@gmail.com')
  const c = cuerpoAltaLeadCorreo(l, 'x')
  assert.equal(c.email, 'pepe@gmail.com', 'el email que identifica en el alta es el del remitente')
  assert.match(String(c.notas), /cliente\.real@gmail\.com/, 'el del cuerpo se conserva como dato, en notas')
})

test('🪤 [1] coincidencias: solo por el email del remitente = ficha existente; el teléfono en OTRA ficha = revisar', () => {
  const porEmail = { id: 'A', nombre: 'Pepe', por: 'email' as const, tipo: 'lead' }
  const porTel = { id: 'B', nombre: 'Cliente real', por: 'telefono' as const, tipo: 'cliente' }
  assert.deepEqual(resolverAltaLeadCorreo(409, {}, { estado: 'conflicto', coincidencias: [porEmail], forzable: true }), { estado: 'existente', id: 'A', nombre: 'Pepe' })
  assert.deepEqual(resolverAltaLeadCorreo(409, {}, { estado: 'conflicto', coincidencias: [porEmail, { ...porEmail, por: 'telefono' }], forzable: true }), { estado: 'existente', id: 'A', nombre: 'Pepe' })
  assert.equal(resolverAltaLeadCorreo(409, {}, { estado: 'conflicto', coincidencias: [porTel], forzable: true }).estado, 'revisar', 'solo casa el teléfono del cuerpo: otra persona')
  assert.equal(resolverAltaLeadCorreo(409, {}, { estado: 'conflicto', coincidencias: [porEmail, porTel], forzable: true }).estado, 'revisar')
  assert.equal(resolverAltaLeadCorreo(409, {}, { estado: 'conflicto', coincidencias: [porEmail, { ...porEmail, id: 'C' }], forzable: true }).estado, 'revisar', 'remitente en dos fichas')
  assert.deepEqual(resolverAltaLeadCorreo(201, {}, { estado: 'ok', id: 'N', contacto: null, contactos: null }), { estado: 'nueva', id: 'N' })
  const l: LeadCorreo = { nombre: 'Pepe', email: 'pepe@gmail.com', emailRemitente: 'pepe@gmail.com', telefono: null, ramos: ['hogar'], pidePresupuesto: true, resumen: null, esLead: true }
  const t = textoAvisoLeadCorreo({ remitente: 'Pepe', asunto: 'x', lead: l, ficha: { estado: 'revisar', motivo: 'm', fichas: [{ id: 'B', nombre: 'Cliente real', url: 'https://p/B' }] }, oportunidades: [], plantilla: null })
  assert.match(t, /Revisar a mano/)
})

test('🪤 [1] la respuesta de hilo busca la ficha por el FROM (lee el fuente)', () => {
  const src = readFileSync(new URL('./lead-correduria-proceso.ts', import.meta.url), 'utf8')
  assert.match(src, /fichaPorEmail\(lead\.emailRemitente\)/)
  assert.doesNotMatch(src, /fichaPorEmail\(lead\.email\)/)
  assert.match(src, /ficha\.estado === 'nueva' \|\| ficha\.estado === 'existente'/, 'oportunidades solo con ficha propia, nunca en «revisar»')
})

test('🪤 [2] buzones y correos automáticos a hola@ no son leads', () => {
  for (const from of ['sc-noreply@google.com', 'businessprofile-noreply@google.com', 'messages-noreply@linkedin.com', 'dmarcreport@microsoft.com', 'donotreply@registrador.es', 'newsletter@saas.io']) {
    assert.equal(esLeadCorreduria({ ...LEAD, from }), false, from)
  }
  assert.equal(esLeadCorreduria({ ...LEAD, automatico: true }), false)
  assert.equal(esCorreoAutomatico([{ key: 'list-unsubscribe', line: 'List-Unsubscribe: <mailto:u@x>' }]), true)
  assert.equal(esCorreoAutomatico([{ key: 'auto-submitted', line: 'Auto-Submitted: auto-replied' }]), true)
  assert.equal(esCorreoAutomatico([{ key: 'auto-submitted', line: 'Auto-Submitted: no' }]), false)
  assert.equal(esCorreoAutomatico([{ key: 'precedence', line: 'Precedence: bulk' }]), true)
  assert.equal(esCorreoAutomatico([{ key: 'subject', line: 'Subject: hola' }]), false)
  assert.equal(esCorreoAutomatico(undefined), false)
})

test('🪤 [2] el OTP va ANTES que el lead (salvo «código postal»), lee el fuente del clasificador', () => {
  const src = readFileSync(new URL('./clasificador.ts', import.meta.url), 'utf8')
  assert.ok(src.indexOf('(2) Código de verificación') < src.indexOf('(2.6) Lead de la CORREDURÍA'), 'el lead se mira antes que el OTP')
  assert.match(src, /automatico: correo\.automatico/)
  assert.equal(RE_CODIGO_POSTAL.test('Seguro hogar código postal 41010'), true)
  assert.equal(RE_CODIGO_POSTAL.test('Tu código de verificación es 123456'), false)
})

test('🪤 [3] presupuesto de tiempo: se difiere antes de pasarse, y el cursor no pasa del diferido', () => {
  assert.ok(LEAD_HASTA_MS + 140_000 < 300_000, 'un lead empezado al límite tiene que acabar antes de los 300 s')
  assert.equal(diferirLead(0, LEADS_POR_PASADA), true)
  assert.equal(diferirLead(LEAD_HASTA_MS + 1, 0), true)
  assert.equal(diferirLead(10_000, 0), false)
  assert.equal(diferirCorreo(CORREO_HASTA_MS + 1), true)
  assert.equal(diferirCorreo(1_000), false)
  assert.equal(cursorTrasPasada(120, null), 120)
  assert.equal(cursorTrasPasada(120, 118), 117)
  const src = readFileSync(new URL('./triaje.ts', import.meta.url), 'utf8')
  assert.match(src, /cursorTrasPasada\(maxUid, uidDiferido\)/, 'el cursor del finally no usa el helper')
  assert.match(src, /diferirLead\(/)
})

test('🪤 el ECO de nuestra respuesta (BCC a hola@) no es un lead ni su respuesta, y va ANTES (lee el fuente)', async () => {
  const { esEcoPropioCorreduria } = await import('./lead-correduria.ts')
  assert.equal(esEcoPropioCorreduria({ from: 'hola@grupoasegura.es', referencias: ['<lead@gmail.com>'] }), true)
  assert.equal(esEcoPropioCorreduria({ from: 'hola@envios.grupoasegura.es', referencias: ['<lead@gmail.com>'] }), true)
  assert.equal(esEcoPropioCorreduria({ from: 'ana@gmail.com', referencias: ['<lead@gmail.com>'] }), false, 'la respuesta del cliente sí se lee')
  assert.equal(esEcoPropioCorreduria({ from: 'hola@grupoasegura.es', referencias: [] }), false)
  const src = readFileSync(new URL('./clasificador.ts', import.meta.url), 'utf8')
  assert.ok(src.indexOf('esEcoPropioCorreduria({') < src.indexOf('esRespuestaDeLeadBD(correo.referencias)'), 'el eco casaría con el hilo del lead')
  const { rutaDe, CATEGORIAS_IA } = await import('./rutas.ts')
  assert.equal(rutaDe('correduria-eco').aviso, 'ninguno')
  assert.equal(CATEGORIAS_IA.includes('correduria-eco'), false, 'la IA no puede elegir el eco')
})
