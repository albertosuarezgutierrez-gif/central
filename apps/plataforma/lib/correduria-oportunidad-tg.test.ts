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
  estado: 'ok', ramo: 'auto', compania: 'Línea Directa', numeroPoliza: '05209179001-00', vence: '2027-02-03', prima: 691.24, ...o,
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

test('un vencimiento que ya pasó NO se usa (se habrá renovado) y se dice', () => {
  const r = prepararAlta({}, [leida({ vence: '2026-02-03' })], HOY)
  assert.ok(r.ok)
  assert.equal(r.alta.fechaFinVigencia, null)
  assert.equal(r.alta.venceDescartado, '2026-02-03')
  assert.equal(r.alta.fechaTarea, '2026-09-28')
  assert.match(textoAlta('X', r.alta), /ya pasó/)
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
  assert.match(String(b.nota), /05209179001-00/)
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
  leida({ tomador: { nombre: 'Pepe Ruiz Gil', conDni: true, coincidencias: [], sello: 'SELLO', ...t } })

test('de quién es el documento: nuevo, existe, varios, sin DNI, sin poder mirar, sin tomador', () => {
  assert.deepEqual(quienEsDelDocumento([conTomador({})]), { tipo: 'nuevo', nombre: 'Pepe Ruiz Gil', sello: 'SELLO' })
  assert.deepEqual(quienEsDelDocumento([conTomador({ coincidencias: [{ id: 'u1', nombre: 'PEPE RUIZ', tipo: 'lead' }] })]), { tipo: 'existe', id: 'u1', nombre: 'PEPE RUIZ' })
  assert.equal(quienEsDelDocumento([conTomador({ coincidencias: [{ id: 'a', nombre: 'x', tipo: '' }, { id: 'b', nombre: 'y', tipo: '' }] })]).tipo, 'varios')
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

test('el tomador del puerto: el DNI nunca se lee aunque venga, y basura → sin coincidencias', () => {
  const t = interpretarTomador({ nombre: 'Pepe', conDni: true, dni: '12345678Z', coincidencias: [{ id: 'u', nombre: 'P', tipo: 'lead' }, 'x'], sello: 'S' })
  assert.deepEqual(t, { nombre: 'Pepe', conDni: true, coincidencias: [{ id: 'u', nombre: 'P', tipo: 'lead' }], sello: 'S' })
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
  assert.match(t, /no está en la cartera/)
  assert.match(t, /Pepe &lt;Ruiz&gt;/)
  assert.match(t, /el DNI no se muestra/)
})

test('proponer_oportunidad ya no exige clienteId y el lead se crea con el sello (lee el FUENTE)', () => {
  const h = HERRAMIENTAS.find((x) => x.function.name === 'proponer_oportunidad')
  assert.deepEqual(h?.function.parameters.required, [])
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  assert.match(src, /altaClienteAsegura\(\{ sello: fila\.lead\.sello/)
  assert.match(src, /lecturasRecientes\(\{ tomador: !clienteId \}\)/)
  assert.match(src, /decision = COALESCE\(decision, 'cliente'\)/)
})
