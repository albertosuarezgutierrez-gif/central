import { test } from 'node:test'
import assert from 'node:assert'
// La parte PURA del minado (emparejar pregunta→respuesta) vive en `reglas.ts`, junto al resto de
// reglas sin dependencias: `historico.ts` habla con Smoobu, la IA y la BD, y no es cargable aquí.
import { paresPregRespuesta, esAutomatico, type MsgMin } from './reglas.ts'

const G = (text: string): MsgMin => ({ from: 'guest', text, automatico: false })
const H = (text: string, automatico = false): MsgMin => ({ from: 'host', text, automatico })

test('empareja la pregunta del huésped con la respuesta del anfitrión', () => {
  const r = paresPregRespuesta([
    G('¿Dónde dejo las llaves al salir?'),
    H('Puedes dejarlas en la mesa alta de la cocina, no hace falta nada más.'),
  ])
  assert.deepEqual(r, [{
    pregunta: '¿Dónde dejo las llaves al salir?',
    respuesta: 'Puedes dejarlas en la mesa alta de la cocina, no hace falta nada más.',
  }])
})

test('los automáticos de Smoobu no cuentan como respuesta ni rompen el par', () => {
  const r = paresPregRespuesta([
    G('¿Dónde tiro la basura?'),
    H('Hola, aquí tienes el enlace con toda la información de tu reserva.', true),
    H('Los contenedores están en la calle Martín Villa, a cincuenta metros del portal.'),
  ])
  assert.equal(r.length, 1)
  assert.match(r[0].respuesta, /Martín Villa/)
})

test('no aprende de las cortesías', () => {
  const r = paresPregRespuesta([
    G('¡Muchas gracias por todo, ha sido genial!'),
    H('Gracias a ti, ha sido un placer recibirte. ¡Vuelve cuando quieras por Sevilla!'),
  ])
  assert.deepEqual(r, [])
})

test('no aprende de un simple acuse de recibo', () => {
  const r = paresPregRespuesta([G('¿Se puede aparcar cerca?'), H('Ok')])
  assert.deepEqual(r, [])
})

test('una pregunta sin respuesta del anfitrión no genera par', () => {
  assert.deepEqual(paresPregRespuesta([G('¿Hay secador de pelo?')]), [])
})

test('detecta los mensajes automáticos por asunto o por texto', () => {
  assert.equal(esAutomatico('WHERE TO COLLECT THE KEYS?', 'texto'), true)
  assert.equal(esAutomatico('', 'Enregistrement en ligne disponible pour votre réservation'), true)
  assert.equal(esAutomatico('', 'Los contenedores están en Martín Villa'), false)
})
