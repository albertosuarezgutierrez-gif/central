import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  grupoNecesidades,
  preguntasNecesidades,
  textoNecesidades,
  validarRespuestasNecesidades,
} from './necesidades-idd.ts'
import { NECESIDADES_MAX, NECESIDADES_MIN, validarNecesidades } from './aceptacion-presupuesto.ts'

const AUTO_COMPLETO = {
  uso: 'particular', conductores: 'solo_tomador', modalidad: 'todo_riesgo_franquicia',
  lunas: 'si', asistencia: 'si', sustitucion: 'no', prioridad: 'equilibrio', franquicia: 'si',
}

test('cada ramo pregunta lo suyo y lo común; un ramo sin cuestionario solo lo común', () => {
  assert.equal(grupoNecesidades('auto'), 'motor')
  assert.equal(grupoNecesidades('moto'), 'motor')
  assert.equal(grupoNecesidades('hogar'), 'hogar')
  assert.equal(grupoNecesidades('responsabilidad_civil'), 'otro')
  assert.equal(grupoNecesidades(null), 'otro')
  const ids = (r: string) => preguntasNecesidades(r).map((p) => p.id)
  assert.ok(ids('auto').includes('conductores') && ids('auto').includes('prioridad'))
  assert.ok(ids('hogar').includes('regimen') && !ids('hogar').includes('lunas'))
  assert.deepEqual(ids('vida'), ['prioridad', 'franquicia'])
})

test('una pregunta sin responder no se da por respondida', () => {
  const sinLunas: Record<string, string> = { ...AUTO_COMPLETO }
  delete sinLunas.lunas
  const v = validarRespuestasNecesidades('auto', sinLunas)
  assert.equal(v.ok, false)
  assert.deepEqual(v.ok ? [] : v.faltan, ['lunas'])
})

test('un valor fuera de la lista es inválido y las claves de otro ramo se descartan', () => {
  const v = validarRespuestasNecesidades('auto', { ...AUTO_COMPLETO, modalidad: 'a_todo' })
  assert.equal(v.ok, false)
  assert.deepEqual(v.ok ? [] : v.invalidas, ['modalidad'])
  const ok = validarRespuestasNecesidades('auto', { ...AUTO_COMPLETO, regimen: 'propietario' })
  assert.ok(ok.ok)
  assert.equal(ok.ok && 'regimen' in ok.respuestas, false)
})

test('la declaración sale en orden, con cada respuesta y lo añadido a mano, y pasa la validación de siempre', () => {
  const t = textoNecesidades('auto', AUTO_COMPLETO, '  Quiere  taller concertado cerca de casa ')
  assert.ok(t.startsWith('Uso del vehículo: particular. Conductores: solo el tomador.'))
  assert.ok(t.includes('Modalidad: todo riesgo con franquicia.'))
  assert.ok(t.endsWith('Además: Quiere taller concertado cerca de casa'))
  assert.ok(t.length >= NECESIDADES_MIN && t.length <= NECESIDADES_MAX)
  assert.equal(validarNecesidades(t).ok, true)
})

test('una respuesta que no es de la lista no se escribe en la declaración', () => {
  const t = textoNecesidades('hogar', { regimen: 'okupa', vivienda: 'habitual' })
  assert.ok(!t.includes('Régimen'))
  assert.ok(t.includes('Vivienda: habitual.'))
})
