import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  caben, claveContratoDeBot, diaDeCompacto, diaMadrid, formularioBotDesdeLead, garajeDeTexto, historialDeTexto, ramoConBot, topeDiario,
  validarPeticionTarificarLead, valorarCompania,
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
  assert.equal(ramoConBot('hogar'), false)
  assert.equal(ramoConBot('vida'), false)
})

test('🪤 coche completo → Mapfre y Allianz listos; los supuestos (conductor = cliente, uso particular) se DICEN', () => {
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
  assert.deepEqual(valorarCompania('allianz', 'auto', f), { compania: 'allianz', estado: 'lista' })
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

test('🪤 lo que el cliente escribió pero no se traduce sin adivinar NO se repregunta ni se supone: «no leído»', () => {
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: { ...COMPLETO, aseguradoAntes: '10 años asegurado, 8 años sin partes' }, bloque: null, fichaNacimiento: null, hoy: HOY })
  assert.equal(f.riesgo.aniosAseguradoAnterior, undefined)
  assert.ok(f.noLeidos.includes('aseguradoAntes'))
  const v = valorarCompania('mapfre', 'auto', f)
  assert.equal(v.estado, 'faltan')
  if (v.estado === 'faltan') { assert.ok(v.noLeidas.includes('aseguradoAntes')); assert.ok(!v.preguntar.includes('aseguradoAntes')) }
  // Moto: «Honda PCX 125» no se parte en marca/modelo/cilindrada a ojo.
  const m = formularioBotDesdeLead({ ramo: 'moto', valores: { ...COMPLETO, codigoVehiculo: 'Honda PCX 125' }, bloque: null, fichaNacimiento: null, hoy: HOY })
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
  assert.ok(g.noLeidos.includes('garaje'))
  assert.equal(historialDeTexto('10 años asegurado en Reale, sin partes').aniosAsegurado, 10)
  assert.deepEqual(historialDeTexto('Allianz, 5 años con ellos, ningún parte'), { aniosAsegurado: 5, siniestros5: 0, compania: 'Allianz', sinSeguro: false })
  assert.equal(historialDeTexto('Mapfre o AXA, llevo 5 años').compania, null)
  assert.equal(historialDeTexto('llevo 5 años, he dado 2 partes').siniestros5, null)
  // El nacimiento de la FICHA completa el del conductor si el correo no lo trae.
  const { fechaNacimiento: _n, ...sinNac } = COMPLETO
  const f = formularioBotDesdeLead({ ramo: 'auto', valores: sinNac, bloque: null, fichaNacimiento: '1985-03-07', hoy: HOY })
  assert.equal((f.riesgo.conductor as Record<string, unknown>).fechaNacimiento, '1985-03-07')
})
