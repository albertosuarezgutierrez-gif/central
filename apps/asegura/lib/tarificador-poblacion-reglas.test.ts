// Población de un CP con varias localidades (13/10/2026): la elige una PERSONA en la bandeja; la IA no. `node --test`.
// Fixtures INVENTADAS (CP y nombres sintéticos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerResultadoWorker } from './tarificador-reglas.ts'
import { eleccionPoblacionContraLista, leerEleccionPoblacionBandeja, opcionesPoblacionDelError, proyectarItemBandeja } from './tarificador-bandeja-reglas.ts'
import { planEleccionVersion, type FilaEleccion } from './tarificador-eleccion-reglas.ts'

const JOB = '33333333-3333-4333-8333-333333333333'
const OPCIONES = [
  { codigo: '00001- VILLA ÁLAMO', etiqueta: 'VILLA ÁLAMO' },
  { codigo: '00001- PUEBLO NUEVO', etiqueta: 'PUEBLO NUEVO' },
]
const ERROR = { tipo: 'captcha', mensaje: 'requiere_eleccion_poblacion: el código postal tiene 2 poblaciones', url: null, opcionesPoblacion: OPCIONES, en: '2026-10-13T10:00:00.000Z' }

test('cable: el resultado de error conserva la lista de poblaciones; inválida o no-captcha → se descarta sin rechazar', () => {
  const base = { trabajoId: JOB, resultado: 'error', error: { tipo: 'captcha', mensaje: ERROR.mensaje, url: null, opcionesPoblacion: OPCIONES } }
  const l = leerResultadoWorker(base)
  assert.ok(l.ok && l.r.tipo === 'error')
  assert.deepEqual(l.ok && l.r.tipo === 'error' ? l.r.error.opcionesPoblacion : null, OPCIONES)
  const mala = leerResultadoWorker({ ...base, error: { ...base.error, opcionesPoblacion: [{ codigo: 'x' }] } })
  assert.ok(mala.ok && mala.r.tipo === 'error' && mala.r.error.opcionesPoblacion === undefined)
  const portal = leerResultadoWorker({ ...base, error: { ...base.error, tipo: 'portal' } })
  assert.ok(portal.ok && portal.r.tipo === 'error' && portal.r.error.opcionesPoblacion === undefined)
})

test('bandeja: eleccionPoblacion tiene que ser una opción EXACTA de la lista guardada', () => {
  assert.deepEqual(eleccionPoblacionContraLista('00001- PUEBLO NUEVO', ERROR), { ok: true, eleccion: '00001- PUEBLO NUEVO' })
  assert.equal(eleccionPoblacionContraLista('00001- OTRA', ERROR).ok, false)
  assert.equal(eleccionPoblacionContraLista('PUEBLO NUEVO', ERROR).ok, false, 'la etiqueta sola no vale: es el texto de la celda')
  assert.equal(eleccionPoblacionContraLista('00001- PUEBLO NUEVO', { tipo: 'captcha', mensaje: 'x' }).ok, false, 'sin lista guardada')
  const dup = { ...ERROR, opcionesPoblacion: [OPCIONES[0], OPCIONES[0]] }
  assert.equal(eleccionPoblacionContraLista(OPCIONES[0].codigo, dup).ok, false, 'repetida')
})

test('bandeja: una opción con caracteres que validarFormularioAuto rechaza se descarta de la lista', () => {
  const mala = { codigo: '00001- <B>', etiqueta: '<B>' }
  assert.deepEqual(opcionesPoblacionDelError({ ...ERROR, opcionesPoblacion: [...OPCIONES, mala] }), OPCIONES)
  assert.equal(opcionesPoblacionDelError({ ...ERROR, opcionesPoblacion: [mala] }), null)
})

test('bandeja: forma de eleccionPoblacion en el cuerpo', () => {
  assert.deepEqual(leerEleccionPoblacionBandeja(undefined), { ok: true, eleccion: null })
  assert.deepEqual(leerEleccionPoblacionBandeja(' 00001-  PUEBLO NUEVO '), { ok: true, eleccion: '00001- PUEBLO NUEVO' })
  for (const malo of [7, '', '   ', 'x'.repeat(121), { codigo: 'x' }, []]) assert.equal(leerEleccionPoblacionBandeja(malo).ok, false)
})

test('bandeja: el item expone la lista de poblaciones y null si no la hay', () => {
  const base = { id: JOB, compania: 'allianz', ramo: 'moto', estado: 'requiere_humano', intentos: 1, oportunidad_id: null, bot_version: null, fecha: new Date('2026-10-13T10:00:00Z') }
  const i = proyectarItemBandeja({ ...base, error: ERROR })
  assert.deepEqual(i.opcionesPoblacion, OPCIONES)
  assert.equal(i.opcionesVersion, null)
  assert.match(i.motivo, /^Hay que elegir la población del código postal/)
  assert.equal(proyectarItemBandeja({ ...base, error: { tipo: 'portal', mensaje: 'x' } }).opcionesPoblacion, null)
  assert.equal(opcionesPoblacionDelError(null), null)
})

test('la IA NO elige poblaciones: un fallo de población no entra en la elección automática', () => {
  const f: FilaEleccion = {
    id: JOB, correduria_id: 'c0000000-0000-4000-8000-000000000000', compania: 'allianz', ramo: 'moto', estado: 'requiere_humano', modo: null,
    riesgo: { ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } },
    error: ERROR,
  }
  assert.equal(planEleccionVersion(f).intentar, false)
})
