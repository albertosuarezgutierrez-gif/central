import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { datosVehiculoDeInfoRiesgo } from '@central/module-seguros'
import {
  botonesFalloBotLead, caben, carneDePersonaFicha, cilindradaEnTexto, clasificarFalloBot, claveContratoDeBot, diaDeCompacto, diaMadrid, esElPropioCliente, formularioBotDesdeLead,
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

// 💶 Opción B (19/10/2026): el aviso del fallo de un bot ofrece entregar el lead a Avant2 SOLO en coche/moto.
test('💶 aviso del fallo: coche lleva «Avant2 (0,50€)» con clp_cds:<p>:auto', () => {
  const b = botonesFalloBotLead({ ramo: 'auto', pendienteId: '7', clase: { tipo: 'otro' } })
  assert.deepEqual(b.flat().map((x) => x.callback), ['clp_cds:7:auto'])
})
test('💶 aviso del fallo: moto también', () => {
  assert.deepEqual(botonesFalloBotLead({ ramo: 'moto', pendienteId: '7', clase: { tipo: 'otro' } }).flat().map((x) => x.callback), ['clp_cds:7:moto'])
})
test('💶 aviso del fallo: hogar NO lleva botón de Avant2', () => {
  assert.equal(botonesFalloBotLead({ ramo: 'hogar', pendienteId: '7', clase: { tipo: 'otro' } }).flat().some((x) => x.callback.startsWith('clp_cds')), false)
})
test('💶 aviso del fallo: comunidades NO lleva botón de Avant2', () => {
  assert.equal(botonesFalloBotLead({ ramo: 'comunidades', pendienteId: '7', clase: { tipo: 'otro' } }).length, 0)
})
test('💶 aviso del fallo: dato del cliente en coche = 📝 repregunta Y 💶 Avant2', () => {
  assert.deepEqual(botonesFalloBotLead({ ramo: 'auto', pendienteId: '9', clase: { tipo: 'dato_cliente', claves: ['fechaCarnet'] } }).flat().map((x) => x.callback), ['clp_fal:9', 'clp_cds:9:auto'])
})
test('💶 aviso del fallo: sin pendiente no hay botones (nada a lo que atar la pulsación)', () => {
  assert.equal(botonesFalloBotLead({ ramo: 'auto', pendienteId: null, clase: { tipo: 'otro' } }).length, 0)
})
test('💶 aviso del fallo: callback_data ≤ 64 bytes', () => {
  for (const f of botonesFalloBotLead({ ramo: 'moto', pendienteId: '999999999999999', clase: { tipo: 'dato_cliente', claves: [] } }).flat()) assert.ok(Buffer.byteLength(f.callback) <= 64)
})
test('🪤 el aviso del fallo usa botonesFalloBotLead (lee el fuente)', () => {
  const src = readFileSync(new URL('./tarificacion-lead-fallo.ts', import.meta.url), 'utf8')
  assert.match(src, /const botones = botonesFalloBotLead\(\{ ramo: t\.ramo, pendienteId, clase \}\)/)
})

test('🪤 el carné de la FICHA completa el riesgo del lead (lo del correo manda; sin ninguno, no hay carné)', () => {
  const { fechaCarnet: _quitada, ...sinCarnet } = COMPLETO as Record<string, unknown>
  const base = { ramo: 'auto' as const, valores: sinCarnet, bloque: { matricula: '0000XXX' }, fichaNacimiento: null, hoy: HOY }
  const conductor = (f: ReturnType<typeof formularioBotDesdeLead>) => f.riesgo.conductor as Record<string, unknown>
  assert.equal(conductor(formularioBotDesdeLead({ ...base, fichaCarne: '2001-02-03' })).fechaCarne, '2001-02-03')
  assert.equal(conductor(formularioBotDesdeLead({ ...base, valores: { ...sinCarnet, fechaCarnet: '2002-03-04' }, fichaCarne: '2001-02-03' })).fechaCarne, '2002-03-04')
  assert.equal('fechaCarne' in conductor(formularioBotDesdeLead({ ...base, fichaCarne: null })), false, 'null = no se sabe: nada de relleno')
  assert.equal('fechaCarne' in conductor(formularioBotDesdeLead({ ...base, fichaCarne: 'no-es-fecha' })), false)
  assert.equal('fechaCarne' in conductor(formularioBotDesdeLead(base)), false)
  const f = formularioBotDesdeLead({ ...base, fichaCarne: '2001-02-03' })
  assert.ok(!JSON.stringify(valorarCompania('generali', 'auto', f)).includes('fechaCarne'))
})

test('🪤 la matrícula del lead sale del bloque de la oportunidad, también con las claves antiguas (datosVehiculoDeInfoRiesgo)', () => {
  const sinMat = { ...(COMPLETO as Record<string, unknown>), matricula: '' }
  const nuevo = datosVehiculoDeInfoRiesgo({ datosVehiculo: { matricula: '0000XXX' } })
  const viejo = datosVehiculoDeInfoRiesgo({ matricula: '0000xxx' })
  for (const b of [nuevo, viejo]) assert.equal(formularioBotDesdeLead({ ramo: 'auto', valores: sinMat, bloque: { ...b }, fichaNacimiento: null, hoy: HOY }).riesgo.matricula, '0000XXX')
  assert.equal('matricula' in formularioBotDesdeLead({ ramo: 'auto', valores: sinMat, bloque: { ...datosVehiculoDeInfoRiesgo({}) }, fichaNacimiento: null, hoy: HOY }).riesgo, false)
})

test('carné de la ficha: en moto solo vale A, A1 o A2; la fecha del B no se cuela', () => {
  const b = { fechaCarnet: '2004-06-01', tipoCarnet: 'B' }
  assert.equal(carneDePersonaFicha(b, 'moto'), null)
  assert.equal(carneDePersonaFicha({ fechaCarnet: '2004-06-01' }, 'moto'), null)
  assert.equal(carneDePersonaFicha({ fechaCarnet: '2004-06-01', tipoCarnet: 'AM' }, 'moto'), null)
  assert.equal(carneDePersonaFicha({ fechaCarnet: '2010-02-03', tipoCarnet: 'A2' }, 'moto'), '2010-02-03')
  assert.equal(carneDePersonaFicha({ fechaCarnet: '2010-02-03', tipoCarnet: 'a1' }, 'moto'), '2010-02-03')
  assert.equal(carneDePersonaFicha(b, 'auto'), '2004-06-01')
  assert.equal(carneDePersonaFicha(null, 'moto'), null)
})

// ── 30/10/2026: matriculación estimada por la matrícula (matrículas inventadas) ──
import { matriculacionParaRiesgo } from './tarificacion-lead-puro.ts'

test('🪤 matriculación: la real manda; sin real y estimable → estimada y marcada; no estimable → falta', () => {
  assert.deepEqual(matriculacionParaRiesgo('2019-03-05', '0000JGB', HOY), { fecha: '2019-03-05' })
  const est = matriculacionParaRiesgo('', '0000JGB', HOY)
  assert.equal(est.fecha, undefined)
  assert.equal(est.estimada, '2015-06-01')
  assert.match(est.supuesto!.texto, /estimada por la matrícula/)
  assert.deepEqual(matriculacionParaRiesgo('', '0000BBB', HOY).fecha, undefined)
  assert.deepEqual(matriculacionParaRiesgo('', 'C0000BBB', HOY), {})
  assert.deepEqual(matriculacionParaRiesgo('', '', HOY), {})
  // real futura = no es dato: cae a la estimación, nunca se acepta
  assert.equal(matriculacionParaRiesgo('2030-01-01', '0000JGB', HOY).fecha, undefined)
})

test('🪤 formulario: matrícula estimable sin fecha real → riesgo.fechaMatriculacionEstimada + supuesto; la real no se toca', () => {
  const base = { ramo: 'auto' as const, valores: { ...COMPLETO, matricula: '0000JGB' }, bloque: null, fichaNacimiento: null, hoy: HOY }
  const f = formularioBotDesdeLead(base)
  assert.equal(f.riesgo.fechaMatriculacion, undefined)
  assert.equal(f.riesgo.fechaMatriculacionEstimada, '2015-06-01')
  assert.ok(f.supuestos.some((s) => s.campo === 'fechaMatriculacion'))
  const r = formularioBotDesdeLead({ ...base, bloque: { fechaMatriculacion: '2016-02-02' } })
  assert.equal(r.riesgo.fechaMatriculacion, '2016-02-02')
  assert.equal(r.riesgo.fechaMatriculacionEstimada, undefined)
  const n = formularioBotDesdeLead({ ...base, valores: { ...COMPLETO, matricula: 'C0000BBB' } })
  assert.equal(n.riesgo.fechaMatriculacion, undefined)
  assert.equal(n.riesgo.fechaMatriculacionEstimada, undefined)
})

test('🪤 CP de circulación: sin él en el correo ni en el bloque, sale de la ficha del cliente (supuesto dicho); lo dicho manda', () => {
  const { cpCirculacion: _cp, ...sinCp } = COMPLETO
  const base = { ramo: 'auto' as const, valores: sinCp, bloque: null, fichaNacimiento: null, hoy: HOY }
  assert.equal('codigoPostal' in formularioBotDesdeLead(base).riesgo, false, 'sin CP en ninguna parte: no se inventa')
  assert.equal('codigoPostal' in formularioBotDesdeLead({ ...base, fichaCodigoPostal: null }).riesgo, false)
  assert.equal('codigoPostal' in formularioBotDesdeLead({ ...base, fichaCodigoPostal: '4100' }).riesgo, false, 'solo 5 dígitos')
  const f = formularioBotDesdeLead({ ...base, fichaCodigoPostal: ' 41001 ' })
  assert.equal(f.riesgo.codigoPostal, '41001')
  assert.ok(f.supuestos.some((s) => s.campo === 'cpCirculacion'))
  assert.equal(formularioBotDesdeLead({ ...base, bloque: { cpCirculacion: '41002' }, fichaCodigoPostal: '41001' }).riesgo.codigoPostal, '41002')
  assert.equal(formularioBotDesdeLead({ ...base, valores: COMPLETO, fichaCodigoPostal: '41001' }).riesgo.codigoPostal, '41003')
})

test('🪤 póliza viva vinculada: su compañía y antigüedad cubren «compañía anterior» y años (supuesto dicho); lo declarado manda; <1 año no prueba nada', () => {
  const { aseguradoAntes: _a, ...sinAntes } = COMPLETO as Record<string, unknown>
  const base = { ramo: 'auto' as const, valores: sinAntes, bloque: null, fichaNacimiento: null, hoy: '2026-10-30' }
  const sin = formularioBotDesdeLead(base).riesgo
  assert.equal('companiaAnterior' in sin, false, 'sin póliza vinculada: no se inventa')
  const f = formularioBotDesdeLead({ ...base, polizaActual: { aseguradora: ' mapfre seguros ', desde: '2021-10-31' } })
  assert.equal(f.riesgo.companiaAnterior, 'Mapfre')
  assert.equal(f.riesgo.aniosAseguradoAnterior, 4, 'años COMPLETOS')
  assert.ok(f.supuestos.some((s) => s.campo === 'aseguradoAntes'))
  assert.equal(formularioBotDesdeLead({ ...base, polizaActual: { aseguradora: 'Aseguradora Rara', desde: '2020-01-01' } }).riesgo.companiaAnterior, 'Aseguradora Rara')
  for (const pa of [{ aseguradora: 'Mapfre', desde: '2026-03-01' }, { aseguradora: '', desde: '2020-01-01' }, { aseguradora: 'Mapfre', desde: null }, { aseguradora: 'Mapfre', desde: '2030-01-01' }]) {
    assert.equal('companiaAnterior' in formularioBotDesdeLead({ ...base, polizaActual: pa }).riesgo, false)
  }
  const dicho = formularioBotDesdeLead({ ...base, valores: { ...sinAntes, aseguradoAntes: 'sin seguro anterior' }, polizaActual: { aseguradora: 'Mapfre', desde: '2020-01-01' } })
  assert.notEqual(dicho.riesgo.companiaAnterior, 'Mapfre', 'lo que dice el cliente manda')
})
