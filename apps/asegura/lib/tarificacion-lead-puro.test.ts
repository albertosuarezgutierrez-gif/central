import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  caben, cilindradaEnTexto, clasificarFalloBot, claveContratoDeBot, diaDeCompacto, diaMadrid, esElPropioCliente, formularioBotDesdeLead,
  garajeDeTexto, historialDeTexto, lecturaMoto, opcionEnTexto, ramoConBot, textoFalloBotLead, topeDiario, validarPeticionTarificarLead,
  valorarCompania, viviendasYLocalesDeTexto,
} from './tarificacion-lead-puro.ts'

const HOY = '2026-10-19'
const C = '11111111-1111-4111-8111-111111111111'
const OP = '22222222-2222-4222-8222-222222222222'

/** Lo que un cliente de coche contesta completo (valores ya descifrados). */
const COMPLETO = {
  matricula: '1234BCD', cpCirculacion: '41003', fechaNacimiento: '1985-03-07', fechaCarnet: '2004-06-01', sexo: 'H',
  garaje: 'garaje comunitario', aseguradoAntes: 'Con Mapfre, llevo 8 años asegurado y sin partes', fechaEfecto: '2026-11-01',
}

test('🪤 tope diario: env inválido → 20, nunca más de 100; caben respeta tope + «10 más hoy» y el máximo duro', () => {
  assert.equal(topeDiario({}), 20)
  assert.equal(topeDiario({ ASEGURA_TARIF_AUTO_TOPE_DIARIO: 'veinte' }), 20)
  assert.equal(topeDiario({ ASEGURA_TARIF_AUTO_TOPE_DIARIO: '0' }), 20)
  assert.equal(topeDiario({ ASEGURA_TARIF_AUTO_TOPE_DIARIO: '30' }), 30)
  assert.equal(topeDiario({ ASEGURA_TARIF_AUTO_TOPE_DIARIO: '500' }), 100)
  assert.equal(caben(19, 20, 0, 1), true)
  assert.equal(caben(20, 20, 0, 1), false)
  assert.equal(caben(19, 20, 0, 2), false) // no se parte: o caben todos los de la pulsación o va a la cola
  assert.equal(caben(20, 20, 10, 3), true)
  assert.equal(caben(100, 20, 500, 1), false)
  assert.equal(caben(0, 20, 0, 0), false)
})

test('🪤 día de Madrid y botón «10 más hoy» solo para HOY', () => {
  assert.equal(diaMadrid(new Date('2026-10-19T22:30:00Z')), '2026-10-20') // ya es martes en Madrid
  assert.equal(diaDeCompacto('20261019'), '2026-10-19')
  assert.equal(diaDeCompacto('20260231'), null)
  assert.equal(validarPeticionTarificarLead({ accion: 'ampliar_tope', dia: '20261018', actor: 'agente:telegram-1' }, HOY).ok, false)
  assert.equal(validarPeticionTarificarLead({ accion: 'ampliar_tope', dia: '20261019', actor: 'agente:telegram-1' }, HOY).ok, true)
  assert.equal(validarPeticionTarificarLead({ accion: 'tarificar', clienteId: C, oportunidadIds: [OP], actor: 'agente:telegram-1' }, HOY).ok, true)
  assert.equal(validarPeticionTarificarLead({ accion: 'tarificar', clienteId: 'x', oportunidadIds: [OP], actor: 'agente:telegram-1' }, HOY).ok, false)
})

test('🪤 hay bot = lo que ya declara el código (RAMOS_TARIFICABLES_RPA), no una lista nueva', () => {
  assert.equal(ramoConBot('auto'), true)
  assert.equal(ramoConBot('moto'), true)
  assert.equal(ramoConBot('comunidades'), true)
  assert.equal(ramoConBot('hogar'), true, 'hogar tiene bot (Allianz) desde 19/10/2026: RAMOS_TARIFICABLES_RPA')
  assert.equal(ramoConBot('vida'), false)
})

test('🪤 coche completo → Mapfre lista; Allianz Turismos y Generali «en pruebas» (no llegan a precio); los supuestos se DICEN', () => {
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: COMPLETO, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.deepEqual(f.noLeidos, [])
  assert.deepEqual(f.bloqueos, [])
  assert.equal(f.riesgo.aniosAseguradoAnterior, 8)
  assert.equal(f.riesgo.siniestrosUltimos5Anios, 0)
  assert.equal(f.riesgo.companiaAnterior, 'Mapfre')
  assert.equal(f.riesgo.tipoGaraje, 'colectivo')
  assert.ok(f.supuestos.some((s) => s.campo === 'conductor'))
  assert.ok(f.supuestos.some((s) => s.campo === 'uso'))
  assert.deepEqual(valorarCompania('mapfre', 'auto', f), { compania: 'mapfre', estado: 'lista' })
  assert.deepEqual(valorarCompania('allianz', 'auto', f), { compania: 'allianz', estado: 'en_pruebas' })
  assert.deepEqual(valorarCompania('generali', 'auto', f), { compania: 'generali', estado: 'en_pruebas' })
  // Una compañía sin declaración NO es «no falta nada»: no se lanza.
  assert.equal(valorarCompania('occident', 'auto', f).estado, 'sin_declaracion')
})

test('🪤 lo que falta para el bot vuelve como clave del CONTRATO (repregunta F2), nunca se inventa', () => {
  const { fechaCarnet: _x, cpCirculacion: _y, ...sin } = COMPLETO
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: sin, bloque: null, fichaNacimiento: null, hoy: HOY })
  const v = valorarCompania('mapfre', 'auto', f)
  assert.equal(v.estado, 'faltan')
  if (v.estado === 'faltan') assert.deepEqual(v.preguntar.sort(), ['cpCirculacion', 'fechaCarnet'])
  assert.equal(claveContratoDeBot('auto', 'conductor.fechaCarne'), 'fechaCarnet')
  assert.equal(claveContratoDeBot('auto', 'codigoPostal'), 'cpCirculacion')
  assert.equal(claveContratoDeBot('auto', 'aniosAseguradoAnterior'), 'aseguradoAntes')
  // La FORMA también vuelve como dato a repreguntar (carné anterior al nacimiento).
  const raro = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, fechaCarnet: '1980-01-01' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  const r = valorarCompania('mapfre', 'auto', raro)
  assert.equal(r.estado, 'faltan')
  if (r.estado === 'faltan') assert.ok(r.preguntar.includes('fechaCarnet'))
})

test('🪤 lo que el cliente escribió y no se lee con certeza va a REPREGUNTA CONCRETA (no se supone ni se deja «no leído»)', () => {
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, aseguradoAntes: 'Mapfre o AXA, 10 años, he dado un parte' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.equal(f.riesgo.siniestrosUltimos5Anios, undefined)
  assert.ok(f.repreguntar.includes('aseguradoAntes'))
  assert.ok(f.concretas.includes('seguro_anterior_compania'))
  assert.ok(f.concretas.includes('seguro_anterior_siniestros'))
  const v = valorarCompania('mapfre', 'auto', f)
  assert.equal(v.estado, 'faltan')
  if (v.estado === 'faltan') assert.ok(v.preguntar.includes('aseguradoAntes'))
  // Moto con catálogo caído: fallo NUESTRO → «no leído» (no se le pregunta al cliente por él).
  const m = formularioBotDesdeLead({ ramo: 'moto', valores: { ...COMPLETO, codigoVehiculo: 'Honda PCX 125' }, bloque: null, fichaNacimiento: null, hoy: HOY, moto: { estado: 'no_mirado' } })
  const vm = valorarCompania('mapfre', 'moto', m)
  assert.equal(vm.estado, 'faltan')
  if (vm.estado === 'faltan') assert.ok(vm.noLeidas.includes('codigoVehiculo'))
})

test('🪤 conductor o titular que no es el cliente: el bot no se lanza (no se finge que conduce él)', () => {
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, conductor: 'mi hijo' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.equal(f.riesgo.tomadorEsConductor, undefined)
  assert.notEqual(valorarCompania('allianz', 'auto', f).estado, 'lista')
})

test('garaje y seguro anterior: solo lo inequívoco', () => {
  assert.deepEqual(garajeDeTexto('en la calle'), { garajeNoche: false, tipoGaraje: 'calle' })
  assert.deepEqual(garajeDeTexto('garaje individual'), { garajeNoche: true, tipoGaraje: 'individual' })
  assert.equal(garajeDeTexto('a veces en la calle y a veces en el garaje'), null)
  assert.equal(garajeDeTexto('donde puedo'), null)
  const g = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, garaje: 'donde puedo' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.equal(g.riesgo.garajeNoche, undefined)
  assert.ok(g.repreguntar.includes('garaje') && g.concretas.includes('garaje'))
  assert.equal(historialDeTexto('10 años asegurado en Reale, sin partes').aniosAsegurado, 10)
  assert.deepEqual(historialDeTexto('Allianz, 5 años con ellos, ningún parte'), { aniosAsegurado: 5, siniestros5: 0, compania: 'Allianz', sinSeguro: false, dudas: [] })
  assert.equal(historialDeTexto('Mapfre o AXA, llevo 5 años').compania, null)
  assert.equal(historialDeTexto('llevo 5 años, he dado 2 partes').siniestros5, null)
  // El nacimiento de la FICHA completa el del conductor si el correo no lo trae.
  const { fechaNacimiento: _n, ...sinNac } = COMPLETO
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: sinNac, bloque: null, fichaNacimiento: '1985-03-07', hoy: HOY })
  assert.equal((f.riesgo.conductor as Record<string, unknown>).fechaNacimiento, '1985-03-07')
})

test('🪤 F3b: «yo» / «el mismo» = el tomador; otra persona sin datos → se le piden (repregunta concreta)', () => {
  for (const t of ['yo', 'Yo mismo', 'el mismo', 'soy yo.', 'La misma']) assert.equal(esElPropioCliente(t), true, t)
  for (const t of ['mi hijo', 'mi mujer, Ana', 'yo y mi hijo']) assert.equal(esElPropioCliente(t), false, t)
  const yo = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, conductor: 'yo', propietario: 'el mismo' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.equal(yo.riesgo.tomadorEsConductor, true)
  assert.equal(yo.riesgo.tomadorEsPropietario, true)
  assert.deepEqual(yo.bloqueos, [])
  assert.equal(valorarCompania('mapfre', 'auto', yo).estado, 'lista')
  const hijo = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, conductor: 'mi hijo' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.ok(hijo.repreguntar.includes('conductor') && hijo.concretas.includes('conductor_datos'))
  const v = valorarCompania('mapfre', 'auto', hijo)
  assert.equal(v.estado, 'faltan')
  if (v.estado === 'faltan') assert.ok(v.preguntar.includes('conductor'))
  // Con sus datos ya dados no se le vuelven a pedir (pero el bot sigue sin tarificar a otro: bloqueo dicho).
  const conDatos = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, conductor: 'mi hijo Luis Pérez Gil, 12345678Z, nacido 01/02/2000, carné 03/04/2019' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.ok(!conDatos.repreguntar.includes('conductor'))
  assert.equal(conDatos.bloqueos.length, 1)
})

test('🪤 F3b: seguro anterior tolerante; ceros con «un parte» son CERO; la duda 0/≥1 va a repregunta, nunca a un número', () => {
  for (const t of ['no he dado ni un parte', 'llevo 6 años con Mapfre, ningún parte', 'sin un solo parte', 'nunca he dado un parte', 'no he dado ni un solo parte en 10 años', 'Mapfre, ni un parte', 'ni un solo siniestro']) {
    assert.equal(historialDeTexto(t, HOY).siniestros5, 0, t)
  }
  for (const t of ['he dado un parte', 'un parte hace 7 años', 'dos siniestros', 'he tenido algún parte']) {
    const h = historialDeTexto(t, HOY)
    assert.equal(h.siniestros5, null, t)
    assert.ok(h.dudas.includes('siniestros'), t)
  }
  assert.equal(historialDeTexto('he dado 1 parte en los últimos 5 años', HOY).siniestros5, 1)
  // Formas tolerantes de los años.
  assert.equal(historialDeTexto('llevo diez años asegurado con Reale', HOY).aniosAsegurado, 10)
  assert.equal(historialDeTexto('asegurado con Allianz desde 2016, sin partes', HOY).aniosAsegurado, 10)
  const h = historialDeTexto('10 años asegurado, 8 años sin partes', HOY)
  assert.equal(h.aniosAsegurado, 10)
  assert.equal(h.siniestros5, 0) // 8 años sin partes ⇒ 0 en los últimos 5
  assert.equal(historialDeTexto('3 años sin partes', HOY).siniestros5, null) // lo de antes no se sabe
  // Dos números de años: no se elige.
  assert.ok(historialDeTexto('llevo 10 años, antes 3 años con Mapfre', HOY).dudas.includes('anios'))
  // Sin seguro: 0 y 0, sin dudas.
  assert.deepEqual(historialDeTexto('no tengo seguro, es mi primer coche', HOY).dudas, [])
})

test('🪤 F3b: moto en texto libre → catálogo; si no casa con certeza, repregunta concreta', async () => {
  const marcas = [{ id: '1', nombre: 'HONDA' }, { id: '2', nombre: 'BMW' }, { id: '3', nombre: 'HONDA RACING' }]
  const modelos: Record<string, { id: string; nombre: string }[]> = {
    '1': [{ id: 'a', nombre: 'PCX' }, { id: 'b', nombre: 'PCX 125' }, { id: 'c', nombre: 'FORZA' }],
    '2': [{ id: 'd', nombre: 'F 800 GS' }],
  }
  const cargar = { marcas: async () => marcas, modelos: async (id: string) => modelos[id] ?? [] }
  assert.equal(opcionEnTexto('mi Honda PCX', modelos['1']).estado, 'uno')
  assert.deepEqual(await lecturaMoto('Honda PCX 125cc', cargar), { estado: 'ok', marca: 'HONDA', modelo: 'PCX 125', cilindradaCc: 125 })
  assert.deepEqual(await lecturaMoto('una honda forza de 300', cargar), { estado: 'ok', marca: 'HONDA', modelo: 'FORZA', cilindradaCc: 300 })
  assert.deepEqual(await lecturaMoto('BMW F 800 GS', cargar), { estado: 'duda', falta: ['cilindrada'] }) // el 800 del nombre no es la cilindrada
  assert.equal((await lecturaMoto('una moto roja', cargar)).estado, 'duda')
  assert.deepEqual(await lecturaMoto('Honda PCX', { marcas: async () => { throw new Error('caído') }, modelos: async () => [] }), { estado: 'no_mirado' })
  assert.equal(cilindradaEnTexto('125 o 150 cc', []), null)
  const f = formularioBotDesdeLead({ ramo: 'moto', valores: { ...COMPLETO, codigoVehiculo: 'BMW F 800 GS' }, bloque: null, fichaNacimiento: null, hoy: HOY, moto: { estado: 'duda', falta: ['cilindrada'] } })
  assert.ok(f.concretas.includes('moto_cilindrada'))
  const ok = formularioBotDesdeLead({ ramo: 'moto', valores: { ...COMPLETO, codigoVehiculo: 'Honda PCX 125' }, bloque: null, fichaNacimiento: null, hoy: HOY, moto: { estado: 'ok', marca: 'HONDA', modelo: 'PCX 125', cilindradaCc: 125 } })
  assert.deepEqual(ok.riesgo.seleccionVehiculo, { marca: 'HONDA', modelo: 'PCX 125', clase: 1, cilindradaCc: 125 })
  assert.deepEqual(ok.repreguntar, [])
})

/** Fechas relativas a HOY real (el validador de comunidades mira el reloj: nada de fechas fijas). */
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

test('🪤 F3b: comunidades desde el lead (y el Catastro), con los desplegables por defecto DICHOS', () => {
  const hoy = enDias(0)
  const valores = { 'direccion.codigoPostal': '41003', m2Construidos: 1500, plantas: 4, numEdificios: 1, numViviendasYLocales: '16 viviendas y 2 locales', capitalContinente: 900000, fechaEfecto: enDias(30) }
  const f = formularioBotDesdeLead({ ramo: 'comunidades', valores, bloque: null, fichaNacimiento: null, hoy, catastro: { anioConstruccion: 1975, codigoPostal: null } })
  assert.equal(f.riesgo.anioConstruccion, 1975)
  assert.equal(f.riesgo.numViviendasYLocales, 18)
  assert.ok(f.supuestos.some((s) => s.campo === 'anioConstruccion'))
  assert.ok(f.supuestos.some((s) => s.campo === 'desplegables'))
  assert.deepEqual(valorarCompania('allianz', 'comunidades', f), { compania: 'allianz', estado: 'lista' })
  // Sin año (ni Catastro) → falta como clave del contrato.
  const sin = formularioBotDesdeLead({ ramo: 'comunidades', valores, bloque: null, fichaNacimiento: null, hoy })
  const v = valorarCompania('allianz', 'comunidades', sin)
  assert.equal(v.estado, 'faltan')
  if (v.estado === 'faltan') assert.ok(v.preguntar.includes('anioConstruccion'))
  assert.equal(viviendasYLocalesDeTexto('20 viviendas'), null) // ¿y locales? se pregunta
  assert.equal(viviendasYLocalesDeTexto('20 pisos, sin locales'), 20)
  const duda = formularioBotDesdeLead({ ramo: 'comunidades', valores: { ...valores, numViviendasYLocales: 'unas cuantas' }, bloque: null, fichaNacimiento: null, hoy })
  assert.ok(duda.concretas.includes('comunidad_viviendas'))
})

test('🪤 F3b: fallo de un bot = dato del cliente solo si su mensaje nombra un obligatorio que se le pide al cliente', () => {
  assert.deepEqual(clasificarFalloBot('mapfre', 'auto', { tipo: 'datos', mensaje: 'Faltan: fecha del carné.' }), { tipo: 'dato_cliente', claves: ['fechaCarnet'] })
  assert.deepEqual(clasificarFalloBot('mapfre', 'auto', { tipo: 'portal', mensaje: 'Faltan: fecha del carné.' }), { tipo: 'otro' })
  assert.deepEqual(clasificarFalloBot('mapfre', 'auto', { tipo: 'datos', mensaje: 'sin adaptador en esta imagen' }), { tipo: 'otro' })
  // Lo de la ficha (NIF del tomador) no es repregunta al cliente.
  assert.deepEqual(clasificarFalloBot('mapfre', 'auto', { tipo: 'datos', mensaje: 'Falta: NIF/CIF del tomador.' }), { tipo: 'otro' })
  const t = textoFalloBotLead({ compania: 'mapfre', ramo: 'auto', pendienteId: '7', clase: { tipo: 'dato_cliente', claves: ['fechaCarnet'] }, tipoError: 'datos' })
  assert.match(t, /fecha del carné/)
  assert.match(t, /#clp7/)
})

test('🪤 F3b: peticiones elegir / fallos / tarificar con su hilo de Telegram', () => {
  assert.equal(validarPeticionTarificarLead({ accion: 'elegir', clienteId: C, oportunidadIds: [OP], clave: 'fechaNacimiento', eleccion: 'correo', actor: 'agente:telegram-1' }, HOY).ok, true)
  assert.equal(validarPeticionTarificarLead({ accion: 'elegir', clienteId: C, oportunidadIds: [OP], clave: 'fechaNacimiento', eleccion: 'las dos', actor: 'agente:telegram-1' }, HOY).ok, false)
  const t = validarPeticionTarificarLead({ accion: 'tarificar', clienteId: C, oportunidadIds: [OP], actor: 'agente:telegram-1', pendienteId: 12, tgMessageId: '999' }, HOY)
  assert.ok(t.ok && t.valor.accion === 'tarificar' && t.valor.pendienteId === '12' && t.valor.tgMessageId === '999')
  assert.equal(validarPeticionTarificarLead({ accion: 'fallos', clienteId: C, oportunidadIds: [OP], actor: 'agente:telegram-1' }, HOY).ok, true)
})

test('🪤 F3b (lee el fuente): solo duplicados no reservan cupo; el fallo de un bot del lead avisa tras el resultado', () => {
  const src = readFileSync(new URL('./tarificacion-lead.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  const pre = src.indexOf('encolarTrabajo(entrada(t, true))')
  const reserva = src.indexOf('correduria_tarif_auto_uso (correduria_id, dia) values')
  assert.ok(pre > 0 && reserva > pre, 'la comprobación de duplicados va ANTES de reservar el cupo')
  assert.match(src, /if \(!lanzar\.length && duplicados\.length\) \{.{0,200}return \{ estado: 'encolado', trabajos: duplicados/)
  const ruta = readFileSync(new URL('../app/api/tarificador/resultado/route.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  assert.match(ruta, /esFalloTerminal\(r\.estadoTrabajo\)[^]*after\(\(\) => avisarFalloBotLead\(trabajoId\)/)
})
