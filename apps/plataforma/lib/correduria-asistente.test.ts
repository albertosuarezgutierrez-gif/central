import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  costeConservador, rastroArgs, tienePrefijo, apagado, clasificarDestino, diasValidos, enmascarar, idValido, leerArgumentos, leerClasificacion,
  paraIA, reglaConDatoPersonal, sinPrefijo, systemAsistente, turnoDeNota, preguntaNota,
  altaParaIA, autonomoActivo, figuraParaIA, HERRAMIENTAS,
  herramientasPara, huellaEscritura, dejaHuella, dniEnmascarado, AUTONOMAS_CON_TEXTO_DE_BOTON, HERRAMIENTAS_ESCRITURA,
} from './correduria-asistente.ts'

test('reparto: el atajo y las palabras de la correduría van al asistente', () => {
  assert.equal(clasificarDestino('seguro: ¿qué tiene Pablo Guzmán?'), 'correduria')
  assert.equal(clasificarDestino('/seguros impagados'), 'correduria')
  assert.equal(clasificarDestino('¿cuándo vence la póliza de Moncosi?'), 'correduria')
  assert.equal(clasificarDestino('¿de quién es la 6666JJJ?'), 'correduria')
  assert.equal(clasificarDestino('renovaciones de esta semana'), 'correduria')
})

test('reparto: lo contable sigue siendo del contable', () => {
  assert.equal(clasificarDestino('¿cuánto llevo en luz este año?'), 'contable')
  assert.equal(clasificarDestino('clasifica el cargo de netflix'), 'contable')
  assert.equal(clasificarDestino('factura de Endesa'), 'contable')
  assert.equal(clasificarDestino(''), 'contable')
})

test('reparto: un nombre suelto es dudoso (lo decide la IA)', () => {
  assert.equal(clasificarDestino('¿qué tiene Pablo Guzmán?'), 'dudoso')
})

test('el atajo se quita de la pregunta', () => {
  assert.equal(sinPrefijo('seguro: impagados'), 'impagados')
  assert.equal(sinPrefijo('/seguros vencimientos'), 'vencimientos')
})

test('clasificador IA: cualquier cosa que no diga correduría cae al contable', () => {
  assert.equal(leerClasificacion('correduria'), 'correduria')
  assert.equal(leerClasificacion('Correduría.'), 'correduria')
  assert.equal(leerClasificacion('contable'), 'contable')
  assert.equal(leerClasificacion(null), 'contable')
  assert.equal(leerClasificacion('no sé'), 'contable')
})

test('🔒 enmascara DNI, NIE, IBAN y tarjeta', () => {
  assert.equal(enmascarar('DNI 28347769Q'), 'DNI …769Q')
  assert.equal(enmascarar('NIE X1234567L'), 'NIE …567L')
  assert.equal(enmascarar('cuenta ES91 2100 0418 4502 0005 1332'), 'cuenta ES…1332')
  assert.equal(enmascarar('ES9121000418450200051332'), 'ES…1332')
  assert.equal(enmascarar('tarjeta 4111 1111 1111 1111'), 'tarjeta …1111')
  // 16 cifras que no pasan el dígito de control: un nº de póliza, se queda entero.
  assert.equal(enmascarar('póliza 1234567812345678'), 'póliza 1234567812345678')
  // Lo que no es dato personal se queda: teléfono (hace falta para llamar), póliza, CIF.
  assert.equal(enmascarar('tel 634766644 póliza 0008400000008 CIF B12345678'), 'tel 634766644 póliza 0008400000008 CIF B12345678')
})

test('🔒 paraIA enmascara y avisa del recorte', () => {
  const s = paraIA({ dni: '28347769Q', nulo: null })
  assert.equal(s, '{"dni":"…769Q","nulo":null}')
  assert.match(paraIA({ x: 'a'.repeat(100) }, 20), /RECORTADO/)
})

test('argumentos e ids: nada de la IA llega crudo al puerto', () => {
  assert.deepEqual(leerArgumentos('{"q":"pablo"}'), { q: 'pablo' })
  assert.equal(leerArgumentos('no json'), null)
  assert.equal(leerArgumentos('[1]'), null)
  assert.equal(idValido('3f2b8c1e-1234-4abc-9def-0123456789ab'), '3f2b8c1e-1234-4abc-9def-0123456789ab')
  assert.equal(idValido('../cartera?x=1'), null)
  assert.equal(diasValidos(500), 120)
  assert.equal(diasValidos(0), 1)
  assert.equal(diasValidos('x'), 30)
})

test('🔒 una «regla» con datos de cliente no se guarda', () => {
  assert.equal(reglaConDatoPersonal('el teléfono de Pablo es 634766644'), true)
  assert.equal(reglaConDatoPersonal('su DNI es 28347769Q'), true)
  assert.equal(reglaConDatoPersonal('escríbele a pjgulo@gmail.com'), true)
  assert.equal(reglaConDatoPersonal('la 6666JJJ es de Pablo'), true)
  assert.equal(reglaConDatoPersonal('dame siempre el total anual primero'), false)
})

test('el prompt lleva las reglas aprendidas y la prohibición de inventar', () => {
  const s = systemAsistente(['dame el total anual primero'], '2026-09-26')
  assert.match(s, /1\. dame el total anual primero/)
  assert.match(s, /no consta/)
  assert.match(s, /solo puedes PREPARAR una emisión/)
  assert.match(s, /NUNCA digas que una póliza está emitida/)
})

test('precio de un lead sin ficha: lo dice en vez de gastar las vueltas en el catálogo (29/09/2026)', () => {
  const s = systemAsistente([], '2026-09-29')
  assert.match(s, /Si buscar no lo encuentra \(lead nuevo, sin ficha\), NO consultes el catálogo/)
  assert.match(s, /\/correduria\/cliente\/nuevo/)
  assert.match(s, /nunca repitas una consulta con los mismos datos/)
})

test('el bucle no repite una consulta idéntica y cierra con una respuesta, no con el «no he llegado» a secas', () => {
  const f = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(f, /yaConsultado\.get\(clave\)/)
  assert.match(f, /Se han acabado las consultas de esta pregunta/)
  assert.match(f, /if \(res\.ok \|\| HERRAMIENTAS_ESCRITURA\.has\(c\.function\?\.name \?\? .*\)\) yaConsultado\.set/)
  // El cierre va sin herramientas: con ellas volvía a pedir otra consulta y salía vacío.
  const cierre = f.slice(f.indexOf('const cierre'), f.indexOf('No he llegado a una respuesta'))
  assert.match(cierre, /openrouterChatEx\(/)
  assert.doesNotMatch(cierre, /HERRAMIENTAS/)
})

test('interruptor de apagado', () => {
  assert.equal(apagado('1'), true)
  assert.equal(apagado('sí'), true)
  assert.equal(apagado(undefined), false)
  assert.equal(apagado('0'), false)
})

test('la nota del 👎 se liga a su turno', () => {
  assert.equal(turnoDeNota(preguntaNota(42)), 42)
  assert.equal(turnoDeNota('otra cosa'), null)
})

test('reparto: unidades que parecen matrícula no roban preguntas al contable', () => {
  assert.equal(clasificarDestino('¿cuánto consumí de luz, 1500 kWh?'), 'contable')
  assert.equal(clasificarDestino('seguros de coche que pago'), 'dudoso')
  assert.equal(tienePrefijo('/seguros impagados'), true)
  assert.equal(tienePrefijo('¿qué tiene Pablo?'), false)
})

test('🔒 el rastro guarda ids, no el texto buscado', () => {
  assert.deepEqual(rastroArgs('buscar', { q: '634766644' }), { q: '[búsqueda]' })
  assert.deepEqual(rastroArgs('proponer_regla', { regla: 'x' }), { regla: '[texto]' })
  assert.deepEqual(rastroArgs('ficha_cliente', { clienteId: 'abc', basura: 'z' }), { clienteId: 'abc' })
  assert.deepEqual(rastroArgs('buscar', null), {})
})

test('el coste sin catálogo nunca es 0', () => {
  assert.ok(costeConservador(1000) > 0)
  assert.equal(costeConservador(-5), 0)
})

test('el id de póliza se normaliza a minúsculas (la huella del resumen se rehace con poliza_id::text)', () => {
  assert.equal(idValido('9588DAD8-893F-4C27-AF63-60A53B755D3B'), '9588dad8-893f-4c27-af63-60a53b755d3b')
})

test('clasificarDestino: pedir precio de moto/coche/seguro va a la correduría; el presupuesto de otra cosa, al contable', () => {
  for (const t of [
    'presupuesto de la moto de Pablo Guzmán',
    'pídeme precio del seguro de coche de Juan',
    'cotiza el coche de María',
    '¿me sacas precio para la moto de su hijo?',
  ]) assert.equal(clasificarDestino(t), 'correduria', t)
  for (const t of ['presupuesto de la reforma del piso', 'precio de la luz este mes', 'factura del seguro del coche, precio 320€']) assert.equal(clasificarDestino(t), 'contable', t)
})

test('enviar_presupuesto: si el cliente avisó de un dato mal, se vuelve a pedir precio, no se reenvía', () => {
  const src = readFileSync(new URL('./correduria-asistente.ts', import.meta.url), 'utf8')
  const linea = src.split('\n').find((l) => l.includes("fn('enviar_presupuesto'")) ?? ''
  assert.match(linea, /dato está mal[\s\S]*NO la uses para reenviar[\s\S]*proponer_tarificacion/)
})

test('autónomo por defecto; solo un «no» explícito lo devuelve al botón (29/09/2026)', () => {
  assert.equal(autonomoActivo(undefined), true)
  assert.equal(autonomoActivo(''), true)
  assert.equal(autonomoActivo('1'), true)
  assert.equal(autonomoActivo('0'), false)
  assert.equal(autonomoActivo('no'), false)
  assert.equal(autonomoActivo('off'), false)
})

test('prompt autónomo: hace sin botón, pero emitir y lo que sale a un tercero siguen con botón', () => {
  const a = systemAsistente([], '2026-09-29', true)
  assert.match(a, /HACES el trabajo administrativo/)
  assert.match(a, /enviar_presupuesto = correo al cliente, invitar_portal\) y emitir \(preparar_emision\) siguen con BOTÓN/)
  assert.match(a, /alta_cliente con lo dictado \(sin nombre no hay alta/)
  assert.doesNotMatch(a, /todas con botón que pulsa Alberto/)
  const b = systemAsistente([], '2026-09-29')
  assert.match(b, /todas con botón que pulsa Alberto/)
  assert.doesNotMatch(b, /HACES el trabajo administrativo/)
})

test('alta dictada: DNI repetido = esa ficha; teléfono repetido = preguntar; 5xx = no sé', () => {
  const ok = altaParaIA(201, { estado: 'ok', id: 'c1' })
  assert.equal(ok.clienteId, 'c1')
  assert.match(ok.texto, /^HECHO/)
  const dni = altaParaIA(409, { estado: 'conflicto', coincidencias: [{ id: 'c2', nombre: 'Ana', por: 'dni' }], forzable: false })
  assert.equal(dni.clienteId, 'c2')
  assert.match(dni.texto, /^YA EXISTE/)
  const tel = altaParaIA(409, { estado: 'conflicto', coincidencias: [{ id: 'c3', nombre: 'Luis', por: 'telefono' }], forzable: true })
  assert.equal(tel.clienteId, null)
  assert.match(tel.texto, /forzar=true/)
  const caido = altaParaIA(502, null)
  assert.equal(caido.ok, false)
  assert.match(caido.texto, /NO SÉ SI SE HA CREADO/)
  assert.match(altaParaIA(422, { estado: 'invalido', motivo: 'DNI no válido' }).texto, /DNI no válido/)
})

test('figura: hecho, fallo de red y rechazo se distinguen', () => {
  assert.match(figuraParaIA(200, { estado: 'ok', clienteId: 'c9', existente: false }, 'propietario', false).texto, /ficha nueva creada: clienteId=c9/)
  assert.match(figuraParaIA(200, { estado: 'ok' }, 'conductor_habitual', true).texto, /vuelve a ser el tomador/)
  assert.equal(figuraParaIA(0, null, 'propietario', false).ok, false)
  assert.match(figuraParaIA(409, { estado: 'error', motivo: 'ese DNI ya está en la ficha de X' }, 'propietario', false).texto, /ese DNI ya está/)
})

test('rastro: el alta y la figura no dejan datos personales, solo qué se dijo', () => {
  const a = rastroArgs('alta_cliente', { nombre: 'Manuel', dni: 'X1234567L', telefono: '600000000' })
  assert.deepEqual(a, { campos: ['nombre', 'dni', 'telefono'], forzar: false })
  const f = rastroArgs('figura_riesgo', { oportunidadId: 'o1', rol: 'propietario', persona: { nombre: 'Manuel', dni: 'X1234567L' } })
  assert.equal(JSON.stringify(f).includes('Manuel'), false)
  assert.equal(JSON.stringify(f).includes('X1234567L'), false)
})

test('herramientas nuevas declaradas y el tope de vueltas da para un lead de punta a punta', () => {
  const nombres = HERRAMIENTAS.map((h) => h.function.name)
  assert.ok(nombres.includes('alta_cliente'))
  assert.ok(nombres.includes('figura_riesgo'))
  const t = HERRAMIENTAS.find((h) => h.function.name === 'proponer_tarificacion')
  assert.ok(t && 'oportunidadId' in (t.function.parameters.properties as Record<string, unknown>))
})

test('autonomía en el código: el presupuesto y el portal NUNCA salen sin botón; emitir sigue con botón', () => {
  const f = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(f, /if \(autonomo && tipo !== 'portal' && tipo !== 'presupuesto'\)/)
  const emision = f.slice(f.indexOf('async function prepararEmision'), f.indexOf('async function cerrarEmision'))
  assert.doesNotMatch(emision, /autonomo/)
  assert.match(emision, /tgSendButtons/)
})

test('sin botón: el resumen deja de preguntar «¿lo hago?» y de pedir «revisa antes de pulsar»', async () => {
  const { textoSinBoton } = await import('./correduria-asistente.ts')
  assert.equal(textoSinBoton('🎯 ¿Abro esta oportunidad para <b>Ana</b>?\n• Ramo: auto'), '🎯 Abro esta oportunidad para <b>Ana</b>\n• Ramo: auto')
  assert.equal(textoSinBoton('🧾 ¿Lo hago? · Ana'), '🧾 Lo hago · Ana')
  assert.equal(textoSinBoton('Se escribe en la ficha y queda en su historial. Revisa cada letra antes de pulsar.'), 'Se escribe en la ficha y queda en su historial.')
})

test('revisión del modo autónomo: escrituras sin reintento, un precio por mensaje, riesgo del mismo ramo, ficha ilegible frena', async () => {
  const { HERRAMIENTAS_ESCRITURA } = await import('./correduria-asistente.ts')
  for (const n of ['alta_cliente', 'figura_riesgo', 'proponer_tarificacion', 'abrir_siniestro']) assert.ok(HERRAMIENTAS_ESCRITURA.has(n), n)
  assert.equal(HERRAMIENTAS_ESCRITURA.has('buscar'), false)
  const f = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(f, /if \(res\.ok \|\| HERRAMIENTAS_ESCRITURA\.has/)
  assert.match(f, /if \(ctx\.diferidas\.length > 0\)/)
  assert.match(f, /l\.riesgo\.oportunidad\.ramo !== ramo/)
  assert.match(f, /if \(falta === null \|\| falta === undefined\) huecosFig\.push/)
  assert.match(f, /SEGUNDOS_PRECIO > SEGUNDOS_WEBHOOK/)
  // Ni fuente ni parentesco se inventan.
  assert.doesNotMatch(f, /campo\('fuente', 30\) \?\?/)
  assert.doesNotMatch(f, /: 'Otra', persona/)
})

test('autónomo: las herramientas que HACEN no dicen «botón» ni «NO escribe» (la IA se fía de la descripción)', () => {
  const auto = herramientasPara(true)
  for (const n of AUTONOMAS_CON_TEXTO_DE_BOTON) {
    const d = auto.find((h) => h.function.name === n)?.function.description ?? ''
    assert.ok(d, `falta ${n}`)
    assert.doesNotMatch(d, /con (un|el) botón|NO escribe|NO pide|Propón/, `${n}: ${d.slice(0, 120)}`)
  }
  assert.match(auto.find((h) => h.function.name === 'proponer_tarificacion')!.function.description, /0,50€/)
  // Con botón, intactas.
  assert.equal(herramientasPara(false), HERRAMIENTAS)
  // Lo que sale a terceros sigue diciendo botón también en autónomo.
  assert.match(auto.find((h) => h.function.name === 'enviar_presupuesto')!.function.description, /botón/)
})

test('autónomo: repetir solo en las escrituras', () => {
  for (const h of herramientasPara(true)) {
    const tiene = 'repetir' in (h.function.parameters.properties as Record<string, unknown>)
    assert.equal(tiene, HERRAMIENTAS_ESCRITURA.has(h.function.name), h.function.name)
  }
  assert.ok(!HERRAMIENTAS.some((h) => 'repetir' in (h.function.parameters.properties as Record<string, unknown>)))
})

test('huella: misma escritura = misma huella aunque cambien mayúsculas, espacios, orden o repetir; otros datos = otra', () => {
  const a = huellaEscritura('anotar_nota', { clienteId: 'x', texto: 'Se casa en  junio' })
  assert.equal(a, huellaEscritura('anotar_nota', { texto: 'se casa en junio ', clienteId: 'x', repetir: true }))
  assert.notEqual(a, huellaEscritura('anotar_nota', { clienteId: 'x', texto: 'se casa en julio' }))
  assert.notEqual(a, huellaEscritura('proponer_tarea', { clienteId: 'x', texto: 'se casa en junio' }))
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('huella: solo la deja lo que se hizo o pudo hacerse', () => {
  for (const t of ['HECHO: nota anotada.', 'PEDIDO: el precio…', 'NO SÉ SI SE HA HECHO (x)']) assert.equal(dejaHuella(t), true, t)
  for (const t of ['FALTAN DATOS (no se ha propuesto nada, 0€)', 'UNO POR MENSAJE: …', 'TOPE: ya van 20', 'NO DISPONIBLE', 'ERROR: x', 'NO SE PUEDE: x', 'YA EXISTE: ese DNI…', 'NO CREADA: x'])
    assert.equal(dejaHuella(t), false, t)
})

test('DNI copiado del historial (tapado) no vale para escribir', () => {
  for (const d of ['…115R', '****115R', '...115R', '•••115R']) assert.equal(dniEnmascarado(d), true, d)
  for (const d of ['12345678Z', 'X1234567L', undefined, null]) assert.equal(dniEnmascarado(d), false, String(d))
})

test('rastro: un polizaId que no es uuid (nº de póliza de la compañía) no se guarda', () => {
  assert.deepEqual(rastroArgs('ficha_poliza', { polizaId: 'C0613-12345' }), { polizaId: '[no es id]' })
  const u = '3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b'
  assert.deepEqual(rastroArgs('ficha_poliza', { polizaId: u }), { polizaId: u })
  assert.equal(rastroArgs('abrir_siniestro', { polizaId: 'C0613-12345', tipo: 'x' }).polizaId, '[no es id]')
  assert.equal(rastroArgs('vehiculo_catalogo', { tipo: 'versiones', filtro: 'd2' }).filtro, 'd2')
})

test('prompt: forzar solo tras respuesta en otro mensaje, ids siempre uuid, DNI tapado se pide', () => {
  const auto = systemAsistente([], '2026-09-29', true)
  assert.match(auto, /forzar=true .*SOLO después de que Alberto te conteste, en otro mensaje/)
  assert.match(auto, /repetir=true SOLO si él pide/)
  assert.match(auto, /Nunca digas que un vehículo o una matrícula «no está en el catálogo»/)
  assert.match(auto, /usarDocumentos=true y NO le preguntes/)
  for (const m of [true, false]) {
    const p = systemAsistente([], '2026-09-29', m)
    assert.match(p, /polizaId sale de ficha_cliente/)
    assert.match(p, /pídeselo a Alberto entero/)
  }
})

test('bucle: forzar en el mismo turno se para, y las escrituras autónomas pasan por la huella', () => {
  const src = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(src, /args\?\.forzar === true && escritasEnTurno\.has\(nombreH\)/)
  assert.match(src, /escribe && autonomo && args\) \{\s*huella = huellaEscritura/)
  assert.match(src, /herramientasPara\(autonomo\)/)
  assert.match(src, /openrouterChatTools\(or, mensajes, herramientas as/)
})
