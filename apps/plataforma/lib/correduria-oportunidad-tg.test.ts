import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { LecturaDocumentoOportunidad } from './seguimiento-asegura.ts'
import { clasificarDestino, HERRAMIENTAS, rastroArgs } from './correduria-asistente.ts'
import { cuerpoAlta, fechaPrimerPaso, prepararAlta, resultadoAlta, textoAlta } from './correduria-oportunidad-tg.ts'

// Caso fundacional (27/09/2026): la póliza de Línea Directa de un lead subida por Telegram acabó en el
// contable buscando un cargo de 691,24€, y el asistente dijo que no podía abrir oportunidades.

const HOY = '2026-09-27'
const leida = (o: Partial<Extract<LecturaDocumentoOportunidad, { estado: 'ok' }>> = {}): LecturaDocumentoOportunidad => ({
  estado: 'ok', ramo: 'auto', compania: 'Línea Directa', numeroPoliza: '05200000035-00', vence: '2027-02-03', prima: 691.24, ...o,
})

test('lo leído del documento rellena la oportunidad y el primer paso cae 60 días antes del vencimiento', () => {
  const r = prepararAlta({}, [leida()], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.ramo, 'auto')
  assert.equal(r.alta.aseguradora, 'Línea Directa')
  assert.equal(r.alta.prima, 691.24)
  assert.equal(r.alta.fechaFinVigencia, '2027-02-03')
  assert.equal(r.alta.fechaTarea, '2026-12-05')
  assert.deepEqual(r.alta.documentos, { leidos: 1, fallidos: [] })
})

test('lo que dicta Alberto manda sobre el papel', () => {
  const r = prepararAlta({ ramo: 'hogar', prima: '450,5', compania: 'Mapfre' }, [leida()], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.ramo, 'hogar')
  assert.equal(r.alta.prima, 450.5)
  assert.equal(r.alta.aseguradora, 'Mapfre')
  assert.equal(r.alta.fechaFinVigencia, '2027-02-03')
})

test('de varios documentos se toma el primer valor de cada campo (dos PDFs de la misma póliza)', () => {
  const r = prepararAlta({}, [leida({ prima: null, vence: null }), leida({ ramo: null, compania: null, prima: 700 })], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.prima, 700)
  assert.equal(r.alta.fechaFinVigencia, '2027-02-03')
  assert.equal(r.alta.aseguradora, 'Línea Directa')
})

test('un vencimiento que ya pasó se proyecta a la siguiente renovación anual y se dice', () => {
  // El recibo real de Línea Directa (2222CCC): «Vigencia 18/11/24 al 18/11/25», carta del 03/02/25.
  const r = prepararAlta({}, [leida({ vence: '2025-11-18' })], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.venceDescartado, '2025-11-18')
  assert.equal(r.alta.fechaFinVigencia, '2026-11-18')
  assert.equal(r.alta.fechaTarea, '2026-09-28', 'a menos de 60 días: la llamada es ya')
  assert.match(textoAlta('X', r.alta), /siguiente renovación, el 18\/11\/2026/)
})

test('siguienteRenovacion: aniversario siguiente, 29/02 cae en 28/02, y más de dos años sin papel no se adivina', async () => {
  const { siguienteRenovacion } = await import('./correduria-oportunidad-tg.ts')
  assert.equal(siguienteRenovacion('2026-02-03', HOY), '2027-02-03')
  assert.equal(siguienteRenovacion('2024-02-29', '2025-01-10'), '2025-02-28')
  assert.equal(siguienteRenovacion('2025-11-18', '2027-11-18'), '2027-11-18')
  assert.equal(siguienteRenovacion('2022-05-01', HOY), null)
  const r = prepararAlta({}, [leida({ vence: '2022-05-01' })], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.fechaFinVigencia, null)
  assert.match(textoAlta('X', r.alta), /más de dos renovaciones/)
})

test('sin ramo no se propone: ni se inventa ni se cae a «otros»', () => {
  const sinLeer = prepararAlta({}, [{ estado: 'error', motivo: 'ilegible' }], HOY)
  assert.equal(sinLeer.ok, false)
  assert.match((sinLeer as { motivo: string }).motivo, /ningún documento/)
  const aSecas = prepararAlta({}, null, HOY)
  assert.equal(aSecas.ok, false)
  assert.equal(prepararAlta({ ramo: 'barco' }, null, HOY).ok, false)
})

test('los documentos que no se pudieron leer se cuentan, no desaparecen', () => {
  const r = prepararAlta({}, [leida(), { estado: 'error', motivo: 'la lectura ha tardado demasiado' }], HOY)
  assert.ok(r.ok)
  assert.deepEqual(r.alta.documentos, { leidos: 1, fallidos: ['la lectura ha tardado demasiado'] })
  assert.match(textoAlta('X', r.alta), /no se ha podido leer: la lectura ha tardado demasiado/)
})

test('lo que no consta se dice «no consta», nunca 0,00€', () => {
  const r = prepararAlta({ ramo: 'vida' }, null, HOY)
  assert.ok(r.ok)
  const t = textoAlta('Ana <Pérez>', r.alta)
  assert.match(t, /Prima actual: no consta/)
  assert.match(t, /Ana &lt;Pérez&gt;/)
  assert.doesNotMatch(t, /0,00€/)
  assert.equal(r.alta.documentos, null)
})

test('fechas del primer paso: dictada, en el pasado o sin vencimiento', () => {
  assert.equal(fechaPrimerPaso(null, HOY), '2026-09-28')
  assert.equal(fechaPrimerPaso('2026-10-15', HOY), '2026-09-28')
  const dictada = prepararAlta({ ramo: 'auto', fechaPrimerPaso: '2026-10-01' }, null, HOY)
  assert.ok(dictada.ok && dictada.alta.fechaTarea === '2026-10-01')
  assert.equal(prepararAlta({ ramo: 'auto', fechaPrimerPaso: '2026-09-01' }, null, HOY).ok, false)
  assert.equal(prepararAlta({ ramo: 'auto', vence: '31/12/2026' }, null, HOY).ok, false)
})

test('el cuerpo es el del botón «Abrir» de la ficha: nace «por contactar» con su llamada', () => {
  const r = prepararAlta({}, [leida()], HOY)
  assert.ok(r.ok)
  const b = cuerpoAlta('c1', r.alta, 'agente:asistente-telegram')
  assert.equal(b.accion, 'crear')
  assert.equal(b.estado, 'competencia')
  assert.equal(b.tipoTarea, 'llamada')
  assert.equal(b.fechaTarea, '2026-12-05')
  assert.match(String(b.nota), /05200000035-00/)
  // El nº viaja aparte: es lo que distingue dos seguros del mismo ramo (dos coches).
  assert.equal(b.numeroPoliza, '05200000035-00')
  assert.equal(b.actor, 'agente:asistente-telegram')
})

test('el resultado distingue abierta, duplicada y rechazada', () => {
  assert.equal(resultadoAlta(201, { estado: 'ok', id: 'o1' }, 'u').estado, 'abierta')
  assert.equal(resultadoAlta(409, { estado: 'duplicada', motivo: 'Ya tiene una de auto.', id: 'o0' }, 'u').estado, 'duplicada')
  assert.equal(resultadoAlta(422, { motivo: 'Elige el ramo.' }, 'u').estado, 'rechazada')
})

test('el asistente tiene la herramienta y el reparto manda «oportunidades»/«lead» a la correduría', () => {
  assert.ok(HERRAMIENTAS.some((h) => h.function.name === 'proponer_oportunidad'))
  assert.equal(clasificarDestino('Seguro de un lead, añade en oportunidades'), 'correduria')
  assert.equal(clasificarDestino('añádelo a oportunidades'), 'correduria')
  // El rastro no guarda compañía, prima ni nº de póliza (contrato de un tercero).
  const r = rastroArgs('proponer_oportunidad', { clienteId: 'c', ramo: 'auto', prima: 691, numeroPoliza: 'X' })
  assert.equal(JSON.stringify(r).includes('691'), false)
  assert.equal(JSON.stringify(r).includes('"X"'), false)
})

test('el webhook desvía a la correduría el documento con pie de correduría y apunta todos (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  const i = src.indexOf('const adj = adjuntoDeMensaje(msg)')
  const bloque = src.slice(i, src.indexOf('manejarDocumentoTg(', i))
  assert.match(bloque, /registrarDocumentoTg\(/)
  assert.match(bloque, /pieDeCorreduria\(pie\)/)
  assert.match(bloque, /if \(aCorreduria\)[\s\S]*return NextResponse\.json/)
  // El botón «Abrir» escribe en la cartera: solo lo pulsa el titular.
  assert.match(src, /action === 'oport'[^)]*\) && String\(cb\.from/)
  assert.match(src, /action === 'acc'[^)]*\) && String\(cb\.from/)
})

// ── Auditoría del bot (27/09/2026): lo que hacía que el asistente perdiera o malinterpretara mensajes ──
import { conCita, esRespuestaACorreduria, hoyMadrid, memoriaIds, ERROR_NO_UUID } from './correduria-asistente.ts'

test('las frases típicas de la correduría ya no se van al contable', () => {
  for (const t of ['recibos devueltos de Pablo', 'lo de la Mapfre de Juan', 'impagados de este mes', 'vencimientos de octubre']) {
    assert.equal(clasificarDestino(t), 'correduria', t)
  }
  // «seguro» a secas (= «estoy seguro», o el seguro PROPIO) no basta: lo decide la IA o el contable
  assert.notEqual(clasificarDestino('seguro que es gasto de los pisos'), 'correduria')
  assert.equal(clasificarDestino('seguros de coche que pago'), 'dudoso')
})

test('un reply a un mensaje de la correduría vuelve al asistente, con la cita', () => {
  // Sin ninguna palabra de seguros: cuenta que lo dijo el asistente (🛡️/🎯).
  assert.equal(esRespuestaACorreduria('🛡️ Sí, tiene cónyuge: María Antonia.'), true)
  assert.equal(esRespuestaACorreduria('🎯 ¿Abro esto para Ana?'), true)
  assert.equal(esRespuestaACorreduria('📄 Leído: Mercadona · 12,40€'), false)
  assert.match(conCita('¿y su mujer?', '🛡️ Pablo…'), /Responde a este mensaje tuyo: «🛡️ Pablo…»/)
})

test('la memoria de ids trae los de consultas que salieron bien y nada inventado', () => {
  const c = '0af158d6-61fa-42a0-bd83-3cf6ec539529'
  const m = memoriaIds([
    [{ nombre: 'ficha_cliente', ok: true, args: { clienteId: c } }],
    [{ nombre: 'preparar_emision', ok: false, args: { polizaId: '11111111-2222-4333-8444-555555555555', projectId: '40842815' } },
     { nombre: 'preparar_emision', ok: true, args: { polizaId: '9588dad8-893f-4c27-af63-60a53b755d3b', projectId: '40842815', quoteId: 'Q2024306868' } }],
  ])
  assert.ok(m)
  assert.match(m!, new RegExp(c))
  assert.match(m!, /Q2024306868/)
  assert.doesNotMatch(m!, /11111111-2222/)
  assert.equal(memoriaIds([[{ ok: true, args: { clienteId: 'Pablo' } }], null]), null)
  assert.match(ERROR_NO_UUID, /número de póliza/)
})

test('«hoy» es el de Madrid, no el de UTC', () => {
  assert.equal(hoyMadrid(new Date('2026-09-26T23:30:00Z')), '2026-09-27')
})

test('un alta sin respuesta clara es «incierta», nunca «no se ha abierto»', () => {
  assert.equal(resultadoAlta(0, null, 'u').estado, 'incierta')
  assert.equal(resultadoAlta(502, { motivo: 'x' }, 'u').estado, 'incierta')
  assert.match(resultadoAlta(0, null, 'u').texto, /No sé si se ha abierto/)
})

test('el webhook manda los reply de la correduría al asistente ANTES del catch-all (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  const reply = src.indexOf('esRespuestaACorreduria(citado)')
  const catchAll = src.indexOf('// C) Catch-all del agente de CONTABILIDAD')
  assert.ok(reply > 0 && reply < catchAll)
  // Un documento se va directo a la correduría SOLO por lo que dice su pie, no por una marca de aseguradora
  assert.match(src, /const aCorreduria = pieDeCorreduria\(pie\) \|\| await albumDeCorreduria\(grupo\)/)
  assert.ok(src.indexOf('await registrarDocumentoTg(') > src.indexOf('const aCorreduria ='))
})

// ── Acciones del día a día (27/09/2026) ──
import { prepararAccion, resultadoAccion, textoAccion } from './correduria-acciones-tg.ts'
import { esAseguradora } from './correduria-asistente.ts'

test('tarea: exige fecha futura y qué hacer; el tipo desconocido cae a llamada', () => {
  assert.equal(prepararAccion('tarea', { oportunidadId: 'o', observaciones: 'x' }, HOY).ok, false)
  assert.equal(prepararAccion('tarea', { oportunidadId: 'o', fecha: '2026-09-01', observaciones: 'x' }, HOY).ok, false)
  const r = prepararAccion('tarea', { oportunidadId: 'o', fecha: '2026-10-01', observaciones: 'Llamar para hogar', tipo: 'fax' }, HOY)
  assert.ok(r.ok)
  assert.equal(r.accion.cuerpo.tipo, 'llamada')
  assert.equal(r.accion.cuerpo.fechaLimite, '2026-10-01')
  assert.equal('actor' in r.accion.cuerpo, false, 'el actor lo pone el servidor al pulsar')
})

test('llamada: otro_dia pide fecha futura; no_interesa pide motivo del módulo', () => {
  assert.equal(prepararAccion('llamada', { oportunidadId: 'o', resultado: 'otro_dia' }, HOY).ok, false)
  assert.ok(prepararAccion('llamada', { oportunidadId: 'o', resultado: 'otro_dia', volverEl: '2026-10-02' }, HOY).ok)
  assert.equal(prepararAccion('llamada', { oportunidadId: 'o', resultado: 'no_interesa', motivo: 'le da igual' }, HOY).ok, false)
  assert.ok(prepararAccion('llamada', { oportunidadId: 'o', resultado: 'no_interesa', motivo: 'precio' }, HOY).ok)
  assert.equal(prepararAccion('llamada', { oportunidadId: 'o', resultado: 'no_interesa', motivo: 'otro' }, HOY).ok, false)
})

test('siniestro: tipo del catálogo, fecha no futura y descripción; el portal avisa de que es un correo', () => {
  assert.equal(prepararAccion('siniestro', { polizaId: 'p', tipo: 'golpe', fechaHora: '2026-09-20', descripcion: 'Golpe en un aparcamiento' }, HOY).ok, false)
  assert.equal(prepararAccion('siniestro', { polizaId: 'p', tipo: 'colision', fechaHora: '2026-10-20', descripcion: 'Golpe en un aparcamiento' }, HOY).ok, false)
  const s = prepararAccion('siniestro', { polizaId: 'p', tipo: 'colision', fechaHora: '2026-09-20 18:30', descripcion: 'Golpe por detrás en un semáforo' }, HOY)
  assert.ok(s.ok)
  assert.equal(s.accion.cuerpo.fechaHora, '2026-09-20T18:30')
  const p = prepararAccion('portal', { clienteId: 'c' }, HOY)
  assert.ok(p.ok)
  assert.match(textoAccion('Ana', p.accion), /manda un correo al cliente/)
})

test('resultado de una acción: sin respuesta clara es «no sé si se ha hecho», y en el portal avisa del doble correo', () => {
  assert.equal(resultadoAccion('nota', 200, { estado: 'ok' }, 'u').estado, 'hecha')
  assert.equal(resultadoAccion('tarea', 422, { estado: 'invalido', motivo: 'La fecha límite no puede estar en el pasado.' }, 'u').estado, 'rechazada')
  const inc = resultadoAccion('portal', 0, null, 'u')
  assert.equal(inc.estado, 'incierta')
  assert.match(inc.texto, /dos correos/)
})

test('esAseguradora: el emisor decide si se pregunta «gasto o cliente»', () => {
  assert.equal(esAseguradora('Línea Directa Aseguradora S.A.'), true)
  assert.equal(esAseguradora('MAPFRE ESPAÑA'), true)
  assert.equal(esAseguradora('Mercadona S.A.'), false)
  assert.equal(esAseguradora(null), false)
})

test('webhook: documento de aseguradora pregunta ANTES de archivar, y el atajo de seguros no es un retoque (lee el FUENTE)', () => {
  const doc = readFileSync(fileURLToPath(new URL('./contable/documentos.ts', import.meta.url)), 'utf8')
  assert.ok(doc.indexOf("tipo: 'posible_seguro'") < doc.indexOf('archivarEImputar(cuentaId'), 'la pregunta va antes de archivar')
  const wh = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  assert.match(wh, /manejarDocumentoTg\(cuentaId, file\.buffer, file\.mimeType, file\.fileName, \{ docId \}\)/)
  const b = wh.slice(wh.indexOf('// B) Respuesta de texto'))
  const atajo = b.indexOf("if (tienePrefijo(msg.text || '')) {")
  assert.ok(atajo > 0 && atajo < b.indexOf('getPendiente(bookingId)'), 'el atajo se mira antes que el retoque')
  assert.match(wh, /prefix === 'cdoc'[\s\S]{0,200}cb\.from\?\.id/)
})

// ── Revisión 27/09/2026: un gasto propio con nombre de aseguradora NO se desvía a la correduría ──
import { pieDeCorreduria } from './correduria-asistente.ts'

test('pie de documento: solo lead/cliente/oportunidad (o prefijo) lo manda a la correduría', () => {
  for (const t of ['recibo Mapfre hogar', 'seguro del coche', 'factura Allianz', '']) assert.equal(pieDeCorreduria(t), false, t)
  for (const t of ['seguro de un lead', 'póliza de un cliente', 'añade en oportunidades', 'de un leds']) assert.equal(pieDeCorreduria(t), true, t)
  // el texto libre con una aseguradora y palabras de gasto se lo queda el contable
  assert.notEqual(clasificarDestino('recibo Mapfre hogar pagado con la tarjeta'), 'correduria')
})

test('el botón gasto/cliente es de un solo uso (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  assert.match(src, /SET decision = \$\{decision\}\s+WHERE id = \$\{id\} AND decision IS NULL RETURNING/)
})

// ── Segunda prueba real (27/09/2026): la póliza de MUSSAP de un lead. El bot preguntó «¿de qué lead se
// trata?» teniendo el documento delante. Ahora lee el tomador, lo busca por DNI y propone crear el lead. ──
import { explicarQuien, quienEsDelDocumento, resultadoAltaLead, textoAltaLead } from './correduria-oportunidad-tg.ts'
import { interpretarLecturaOportunidad, interpretarTomador } from './seguimiento-asegura.ts'

const conTomador = (t: Partial<NonNullable<Extract<LecturaDocumentoOportunidad, { estado: 'ok' }>['tomador']>>) =>
  leida({ tomador: { nombre: 'Pepe Ruiz Gil', conDni: true, coincidencias: [], posibles: [], sello: 'v1:SELLO', ...t } })

test('de quién es el documento: nuevo, existe, varios, sin DNI, sin poder mirar, sin tomador', () => {
  const f = (id: string, nombre: string, activo = true) => ({ id, nombre, tipo: 'lead', activo })
  assert.deepEqual(quienEsDelDocumento([conTomador({})]), { tipo: 'nuevo', nombre: 'Pepe Ruiz Gil', sello: 'v1:SELLO' })
  assert.deepEqual(quienEsDelDocumento([conTomador({ coincidencias: [f('u1', 'PEPE RUIZ')] })]), { tipo: 'existe', id: 'u1', nombre: 'PEPE RUIZ' })
  assert.equal(quienEsDelDocumento([conTomador({ coincidencias: [f('a', 'x'), f('b', 'y')] })]).tipo, 'varios')
  // una ficha DESCARTADA con ese DNI no recibe la oportunidad sin preguntar
  assert.equal(quienEsDelDocumento([conTomador({ coincidencias: [f('u1', 'PEPE', false)] })]).tipo, 'varios')
  // «no se pudo mirar» NO es «no está»: nunca se ofrece crear otra ficha
  assert.equal(quienEsDelDocumento([conTomador({ coincidencias: null })]).tipo, 'sin_comprobar')
  assert.equal(quienEsDelDocumento([conTomador({ sello: null })]).tipo, 'sin_comprobar')
  assert.equal(quienEsDelDocumento([conTomador({ nombre: null })]).tipo, 'sin_tomador')
  assert.equal(quienEsDelDocumento([leida()]).tipo, 'sin_leer')
  assert.equal(quienEsDelDocumento([{ estado: 'error', motivo: 'x' }]).tipo, 'sin_leer')
  assert.match(explicarQuien({ tipo: 'sin_comprobar', nombre: 'Pepe', conDni: true }) ?? '', /NO digas que no está/)
  assert.match(explicarQuien({ tipo: 'sin_comprobar', nombre: 'Pepe', conDni: false }) ?? '', /NO trae DNI/)
  assert.equal(explicarQuien({ tipo: 'nuevo', nombre: 'Pepe', sello: 's' }), null)
})

test('sin DNI en la cartera NO basta para crear: si hay fichas con ese nombre, decide Alberto', () => {
  // el volcado tiene fichas con DNI y sin índice ciego: «su DNI no aparece» no es «no está»
  const conPosible = conTomador({ posibles: [{ id: 'viejo', nombre: 'PEPE RUIZ GIL', tipo: 'lead', activo: true }] })
  const q = quienEsDelDocumento([conPosible])
  assert.ok(q.tipo === 'varios' && !q.porDni)
  assert.match(explicarQuien(q) ?? '', /leadNuevo=true/)
  // Alberto dice que no es ninguno → ahora sí se crea
  assert.equal(quienEsDelDocumento([conPosible], true).tipo, 'nuevo')
  // no se pudo buscar por nombre → no se afirma nada
  assert.equal(quienEsDelDocumento([conTomador({ posibles: null })]).tipo, 'sin_comprobar')
})

test('documentos de DOS personas en la misma hora: no se mezclan', () => {
  const q = quienEsDelDocumento([conTomador({}), conTomador({ nombre: 'Ana Sanz' })])
  assert.equal(q.tipo, 'varias_personas')
  // la misma persona escrita con otra grafía no cuenta como dos
  assert.equal(quienEsDelDocumento([conTomador({}), conTomador({ nombre: 'PEPE RUIZ GIL' })]).tipo, 'nuevo')
})

test('el tomador del puerto: el DNI nunca se lee aunque venga, y basura → sin coincidencias', () => {
  const t = interpretarTomador({ nombre: 'Pepe', conDni: true, dni: '12345678Z', coincidencias: [{ id: 'u', nombre: 'P', tipo: 'lead' }, 'x'], sello: 'v1:S' })
  assert.deepEqual(t, { nombre: 'Pepe', conDni: true, coincidencias: [{ id: 'u', nombre: 'P', tipo: 'lead', activo: true }], posibles: null, sello: 'v1:S' })
  // un sello en claro (sin cifrar) se descarta: no hay alta posible
  assert.equal(interpretarTomador({ nombre: 'Pepe', sello: '{"a":{"dni":"12345678Z"}}' })?.sello, null)
  assert.equal(interpretarTomador({ nombre: 'Pepe', coincidencias: 'nada' })?.coincidencias, null)
  const l = interpretarLecturaOportunidad(200, { leido: true, ramo: 'auto', compania: 'MUSSAP', tomador: { nombre: 'Pepe', conDni: false, coincidencias: null, sello: null } })
  assert.ok(l.estado === 'ok' && l.tomador?.nombre === 'Pepe')
  // sin pedirlo no aparece la clave (la lectura de la ficha sigue igual)
  assert.ok(!('tomador' in interpretarLecturaOportunidad(200, { leido: true, ramo: 'auto' })))
})

test('crear el lead: 201 → id; 409 → no duplica; sin respuesta → «no sé», nunca «no se ha creado»', () => {
  assert.deepEqual(resultadoAltaLead(201, { estado: 'ok', id: 'nuevo' }), { estado: 'creado', id: 'nuevo' })
  const d = resultadoAltaLead(409, { coincidencias: [{ nombre: 'Pepe Ruiz' }] })
  assert.ok(d.estado === 'duplicado' && d.texto.includes('Pepe Ruiz'))
  assert.equal(resultadoAltaLead(502, { motivo: 'red' }).estado, 'incierto')
  assert.equal(resultadoAltaLead(0, null).estado, 'incierto')
  assert.equal(resultadoAltaLead(503, { estado: 'sin_configurar' }).estado, 'rechazado')
  assert.equal(resultadoAltaLead(422, { motivo: 'sello caducado' }).estado, 'rechazado')
})

test('el mensaje del lead nuevo dice que no está y no enseña el DNI', () => {
  const r = prepararAlta({}, [leida()], HOY)
  assert.ok(r.ok)
  const t = textoAltaLead('Pepe <Ruiz>', r.alta)
  assert.match(t, /No encuentro a .* en la cartera \(ni por DNI ni por nombre\)/)
  assert.match(t, /Pepe &lt;Ruiz&gt;/)
  assert.match(t, /el DNI no se muestra/)
})

test('proponer_oportunidad ya no exige clienteId y el lead se crea con el sello (lee el FUENTE)', () => {
  const h = HERRAMIENTAS.find((x) => x.function.name === 'proponer_oportunidad')
  assert.deepEqual(h?.function.parameters.required, [])
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  assert.match(src, /altaClienteAsegura\(\{ sello: fila\.lead\.sello/)
  assert.match(src, /lecturasRecientes\(\{ tomador: !clienteId \}, documentos\)/)
  assert.match(src, /decision = COALESCE\(decision, 'cliente'\)/)
})

// ── «Añade todo» (27/09/2026): reintentos, respuesta rápida, voz de llamadas, guardar, mañana, tarificar ──
import { rutaTarificar } from './correduria-oportunidad-tg.ts'
import { bloqueLlamadasHoy } from './correduria/llamadas-hoy.ts'

test('las notas de voz de una llamada van a la correduría, no al contable', () => {
  for (const t of ['le he llamado y no le interesa', 'no contesta, vuelve a llamar el martes', 'Pepe quiere precio del coche']) {
    assert.equal(clasificarDestino(t), 'correduria', t)
  }
  // con una palabra contable manda el contable (un «he llamado al banco» no es de la correduría)
  assert.notEqual(clasificarDestino('he llamado al banco por el cargo'), 'correduria')
})

test('webhook: descarta reintentos de Telegram y contesta rápido a la correduría (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  const visto = src.indexOf('if (await updateYaVisto(body.update_id))')
  assert.ok(visto > 0 && visto < src.indexOf('const cbData'), 'la deduplicación va antes de enrutar nada')
  assert.match(src, /ON CONFLICT DO NOTHING RETURNING update_id/)
  // sin BD se procesa igual (perder un mensaje es peor que contestarlo dos veces)
  assert.match(src, /if \(filas === null\) return false/)
  // ningún manejarCorreduriaTg se espera dentro de la petición: el único await es el de correduriaSegura (en after)
  assert.equal(src.match(/await manejarCorreduriaTg\(/g)?.length, 1)
  assert.match(src, /async function correduriaSegura[^]*?await manejarCorreduriaTg\(texto\)\.catch/)
  assert.match(src, /action === 'guardar' \|\| action === 'actualizar'(?: \|\| action === '\w+')*\) && String\(cb\.from/)
})

test('tras abrir: guardar en la ficha es de un solo uso y tarificar es un ENLACE (no cotiza desde Telegram)', () => {
  assert.equal(rutaTarificar('auto'), 'auto-nuevo')
  assert.equal(rutaTarificar('hogar'), 'hogar-nuevo')
  assert.equal(rutaTarificar('responsabilidad_civil'), null)
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  assert.match(src, /WHERE id = \$\{oportId\} AND estado IN \('abierta', 'duplicada'\) AND documentos_guardados_at IS NULL/)
  assert.doesNotMatch(src.slice(src.indexOf('async function ofrecerSiguientes'), src.indexOf('async function guardarDocumentosEnFicha')), /cotizar|retarificar/i)
})

test('mañana: las tareas de hoy van dentro del aviso de renovaciones, y «no se pudo leer» se dice', () => {
  const t = (o: Partial<Parameters<typeof bloqueLlamadasHoy>[0] extends readonly (infer T)[] | null ? T : never>) => ({
    id: 'x', tipo: 'llamada', prioridad: 'media', observaciones: 'Llamar por su póliza', fechaLimite: '2026-09-27', oportunidadId: 'o', clienteId: 'c', cliente: 'Pepe *Ruiz*', ramo: 'auto', ...o,
  })
  assert.equal(bloqueLlamadasHoy([], '2026-09-27'), null)
  assert.match(bloqueLlamadasHoy(null, '2026-09-27') ?? '', /NO significa que no haya/)
  const b = bloqueLlamadasHoy([t({}), t({ fechaLimite: '2026-09-20', cliente: 'Ana' })], '2026-09-27') ?? ''
  assert.match(b, /Tareas de hoy \(2\)/)
  assert.match(b, /Ana.*atrasada/)
  assert.doesNotMatch(b, /\*Ruiz\*/) // un nombre con * no rompe el Markdown
  const cron = readFileSync(fileURLToPath(new URL('../app/api/cron/correduria-renovaciones/route.ts', import.meta.url)), 'utf8')
  assert.match(cron, /bloqueLlamadasHoy\(/)
  assert.match(cron, /\[renovaciones, llamadas\]\.filter\(Boolean\)/)
})

test('revisión: si el webhook revienta se desmarca el update, y el asistente en after avisa si falla (lee el FUENTE)', () => {
  const src = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  assert.match(src, /catch \(e\) \{\n\s+\/\/ Si revienta a mitad, se desmarca[^\n]*\n\s+await olvidarUpdate\(body\.update_id\)/)
  assert.doesNotMatch(src, /after\(\(\) => manejarCorreduriaTg/)
  assert.match(src, /if \(action === 'guardar'\) \{\n\s+await tgAnswerCallback/)
  const cron = readFileSync(fileURLToPath(new URL('../app/api/cron/correduria-renovaciones/route.ts', import.meta.url)), 'utf8')
  assert.match(cron, /Promise\.all\(\[\n\s+vencimientosAsegura/)
})

test('con una póliza de la correduría sin usar, el asistente sabe que está ahí y no pregunta «¿a quién?»', async () => {
  const { avisoDocumentosPendientes } = await import('./correduria-oportunidad-tg.ts')
  assert.equal(avisoDocumentosPendientes(null), null)
  assert.equal(avisoDocumentosPendientes(0), null)
  const t = avisoDocumentosPendientes(1) ?? ''
  assert.match(t, /SIN clienteId y con usarDocumentos=true/)
  assert.match(t, /NO le preguntes el nombre/)
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  assert.match(src, /historial\.memoria, avisoDocumentosPendientes\(pendientes\)\]/)
  assert.match(src, /destino = 'correduria' AND usado_at IS NULL/)
})

test('el enlace tras abrir (o si ya había una) lleva a la OPORTUNIDAD, no solo a la ficha', () => {
  assert.match(resultadoAlta(201, { estado: 'ok', id: 'o1' }, 'https://x/correduria/cliente/c1').texto, /cliente\/c1\?tab=oportunidades&op=o1/)
  assert.match(resultadoAlta(409, { estado: 'duplicada', motivo: 'Ya tiene una de auto.', id: 'o0' }, 'https://x/correduria/cliente/c1').texto, /\?tab=oportunidades&op=o0/)
  // sin id (fallo incierto) se queda en la ficha: no hay oportunidad a la que llevar
  assert.doesNotMatch(resultadoAlta(0, null, 'https://x/correduria/cliente/c1').texto, /op=/)
})

test('ya tenía una abierta: solo se cambia lo que el documento trae y difiere; un «no consta» no borra', async () => {
  const { cambiosSobreExistente, cuerpoEdicion, textoCambios } = await import('./correduria-oportunidad-tg.ts')
  const alta = { ramo: 'auto', aseguradora: 'MUSSAP', prima: 192.19, fechaFinVigencia: '2026-10-20', numeroPoliza: null, fechaTarea: '2026-09-28', venceDescartado: null, documentos: null } as const
  const c = cambiosSobreExistente(alta as never, { aseguradora: 'mussap', prima: 374.9, fechaFinVigencia: null })
  assert.deepEqual(c.map((x) => x.campo), ['prima', 'fechaFinVigencia'])
  assert.equal(cambiosSobreExistente({ ...alta, prima: null, aseguradora: null, fechaFinVigencia: null } as never, { aseguradora: 'X', prima: 1, fechaFinVigencia: '2026-01-01' }).length, 0)
  assert.deepEqual(cuerpoEdicion('o1', c, 'a'), { accion: 'editar', id: 'o1', actor: 'a', prima: 192.19, fechaFinVigencia: '2026-10-20' })
  assert.match(textoCambios(c), /374,90€ → <b>192,19€<\/b>/)
})

test('actualizar: resultado honesto y el flujo cableado (lee el FUENTE)', async () => {
  const { resultadoEdicion } = await import('./correduria-oportunidad-tg.ts')
  assert.equal(resultadoEdicion(200, { estado: 'ok' }, 'u').estado, 'hecha')
  assert.equal(resultadoEdicion(0, null, 'u').estado, 'incierta')
  assert.equal(resultadoEdicion(409, { motivo: 'Está ganada' }, 'u').estado, 'rechazada')
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  // solo el último documento (o su álbum), nunca todo lo de la hora
  assert.match(src, /ultimo AS \(SELECT id, media_group_id FROM cand ORDER BY id DESC LIMIT 1\)/)
  // un solo uso y con caducidad
  assert.match(src, /WHERE id = \$\{oportId\} AND estado = 'duplicada' AND actualizada_at IS NULL AND alta IS NOT NULL/)
  // sin leer la existente no se ofrece actualizar
  assert.match(src, /if \(!e\) lineas\.push\('No he podido leer la que ya tiene/)
  // guardar en ficha también cuando ya tenía una
  assert.match(src, /estado IN \('abierta', 'duplicada'\) AND documentos_guardados_at IS NULL/)
  const hook = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  assert.match(hook, /action === 'guardar' \|\| action === 'actualizar'(?: \|\| action === '\w+')*\) && String\(cb\.from/)
})

test('otro seguro del mismo ramo (otro coche) NO se ofrece como «actualizar la existente»', async () => {
  const { mismaPoliza } = await import('./correduria-oportunidad-tg.ts')
  const s = (aseguradora: string | null, numeroPoliza: string | null = null) => ({ aseguradora, numeroPoliza })
  assert.equal(mismaPoliza(s('Línea Directa Aseguradora S.A.'), s('MUSSAP')), 'otra')
  assert.equal(mismaPoliza(s('MUSSAP Mutua de Seguros y Reaseguros a P.F.'), s('Mussap')), 'misma')
  assert.equal(mismaPoliza(s('Línea Directa'), s('LINEA DIRECTA ASEGURADORA')), 'misma')
  assert.equal(mismaPoliza(s('Mapfre'), s(null)), 'no_se')
  assert.equal(mismaPoliza(s(null), s('Mapfre')), 'no_se')
  // Dos coches en la MISMA compañía: el nº de póliza los separa.
  assert.equal(mismaPoliza(s('MUSSAP', '111222'), s('MUSSAP', '333444')), 'otra')
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  // al ofrecer: con otra compañía no hay botón; y al pulsar se vuelve a comprobar
  assert.match(src, /else if \(misma === 'otra'\) \{/)
  assert.match(src, /if \(mismaPoliza\(fila\.alta, e\) === 'otra'\) \{/)
})

test('«ya es nuestra»: con la póliza en nuestra cartera en vigor no se propone abrir nada', async () => {
  const { polizaYaNuestra } = await import('./correduria-oportunidad-tg.ts')
  assert.equal(polizaYaNuestra([leida({ enCartera: [] })]), null)
  assert.equal(polizaYaNuestra([leida({ enCartera: null })]), null, 'no se ha podido mirar ≠ es nuestra')
  assert.deepEqual(polizaYaNuestra([leida({ enCartera: [{ polizaId: 'p1', clienteId: 'c1', aseguradora: 'Reale' }] })]),
    { numero: '05200000035-00', clienteId: 'c1', aseguradora: 'Reale' })
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  const proponer = src.slice(src.indexOf('async function proponerOportunidad'), src.indexOf('/** Botón «Abrir».'))
  // Se comprueba ANTES de preparar el alta y de mandar el botón.
  assert.ok(proponer.indexOf('polizaYaNuestra(lecturas)') > 0 && proponer.indexOf('polizaYaNuestra(lecturas)') < proponer.indexOf('prepararAlta('))
})

test('la lectura trae el coche y «en cartera»; la oportunidad lo lleva y lo enseña', async () => {
  const { interpretarLecturaOportunidad } = await import('./seguimiento-asegura.ts')
  const l = interpretarLecturaOportunidad(200, { leido: true, ramo: 'auto', compania: 'Línea Directa', matricula: '2222CCC', vehiculo: 'Chevrolet Aveo',
    enCartera: [{ polizaId: 'p', clienteId: 'c', aseguradora: 'X' }, { basura: 1 }] })
  assert.ok(l.estado === 'ok')
  assert.equal(l.matricula, '2222CCC')
  assert.equal(l.enCartera?.length, 1)
  assert.equal(interpretarLecturaOportunidad(200, { leido: true, ramo: 'auto' }).estado === 'ok' && (interpretarLecturaOportunidad(200, { leido: true, ramo: 'auto' }) as { enCartera?: unknown }).enCartera, null)
  const r = prepararAlta({}, [leida({ matricula: '2222CCC', vehiculo: 'Chevrolet Aveo' })], HOY)
  assert.ok(r.ok)
  assert.equal(cuerpoAlta('c1', r.alta, 'x').matricula, '2222CCC')
  assert.match(textoAlta('Rafael', r.alta), /Vehículo: Chevrolet Aveo · 2222CCC/)
})

test('tarificar auto lleva la matrícula leída; los demás ramos, el enlace de siempre', async () => {
  const { enlaceTarificar } = await import('./correduria-oportunidad-tg.ts')
  assert.equal(enlaceTarificar('https://x/c/1', { ramo: 'auto', matricula: '2222CCC' }), 'https://x/c/1/auto-nuevo?matricula=2222CCC')
  assert.equal(enlaceTarificar('https://x/c/1', { ramo: 'hogar', matricula: '2222CCC' }), 'https://x/c/1/hogar-nuevo')
  assert.equal(enlaceTarificar('https://x/c/1', { ramo: 'otros', matricula: null }), null)
})

test('documento marcado «de un cliente»: el asistente propone solo, sin preguntar «¿qué hago?»', () => {
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  const cli = src.slice(src.indexOf("if (accion === 'cli') {"), src.indexOf("if (accion === 'gasto') {"))
  assert.match(cli, /manejarCorreduriaTg\(ORDEN_DOCUMENTO_CLIENTE\)/)
  assert.doesNotMatch(cli, /Dime qué hago/)
})

test('presupuesto: «rescata el presupuesto … de la moto 2121NST» va a la correduría', () => {
  assert.equal(clasificarDestino('rescata el presupuesto de manuel piña franco de la moto 2121NST y mandasela a manuel para que elija'), 'correduria')
  assert.equal(clasificarDestino('presupuesto del seguro de hogar de Ana'), 'correduria')
  assert.equal(clasificarDestino('presupuesto de la reforma del baño'), 'contable')
  assert.ok(HERRAMIENTAS.some((h) => h.function.name === 'enviar_presupuesto'))
})

test('presupuesto: sin tarificación del servidor o sin necesidades no hay botón; con ellas, avisa del correo', () => {
  assert.equal(prepararAccion('presupuesto', { clienteId: 'c', necesidades: 'Quiere todo riesgo con franquicia baja' }, HOY).ok, false)
  assert.equal(prepararAccion('presupuesto', { clienteId: 'c', tarificacionId: 't', necesidades: 'barato' }, HOY).ok, false)
  const p = prepararAccion('presupuesto', { clienteId: 'c', tarificacionId: 't', resumen: '3 precios', necesidades: 'Quiere terceros ampliado, uso diario' }, HOY)
  assert.ok(p.ok)
  assert.deepEqual(p.accion.cuerpo, { tarificacionId: 't', necesidades: 'Quiere terceros ampliado, uso diario' })
  assert.match(textoAccion('Manuel', p.accion), /manda un correo al cliente/)
  assert.match(textoAccion('Manuel', p.accion), /3 precios/)
})
