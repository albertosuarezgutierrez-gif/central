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

// ─── Deducir de lo presupuestado (29/09/2026) ────────────────────────────────
import { deducirNecesidades } from './necesidades-idd.ts'

const HOY = new Date('2026-09-29T00:00:00Z')
const persona = (id: string, nacimiento = '1980-01-01', carne = '2000-01-01', tipo = 'Dni') => ({
  identificationDocument: { type: { id: tipo }, id },
  birthDate: nacimiento,
  drivingLicenses: [{ date: carne }],
})

test('deducir moto: completo y válido para el ramo, y dice que es deducido', () => {
  const tom = persona('00000000T')
  const d = deducirNecesidades('moto', { holder: tom, risk: { primaryDriver: tom, owner: tom } }, { categoria: 'Terceros ampliado', franquiciaEur: null }, HOY)
  assert.deepEqual(validarRespuestasNecesidades('moto', d.respuestas), { ok: true, respuestas: d.respuestas })
  assert.equal(d.respuestas.uso, 'particular')
  assert.equal(d.respuestas.conductores, 'solo_tomador')
  assert.equal(d.respuestas.modalidad, 'terceros_ampliado')
  assert.match(d.otras, /Deducido/)
})

test('deducir: tomador empresa → uso profesional; conductor distinto → no «solo el tomador»', () => {
  const emp = { identificationDocument: { type: { id: 'Cif' }, id: 'B12345674' }, name: 'X SL' }
  const d = deducirNecesidades('auto', { holder: emp, risk: { primaryDriver: persona('00000001R'), owner: emp } }, { categoria: 'Todo riesgo con franquicia', franquiciaEur: 300 }, HOY)
  assert.equal(d.respuestas.uso, 'profesional')
  assert.notEqual(d.respuestas.conductores, 'solo_tomador')
  assert.equal(d.respuestas.modalidad, 'todo_riesgo_franquicia')
  assert.equal(d.respuestas.franquicia, 'si')
})

test('deducir: conductor joven o con carné reciente → «jovenes»', () => {
  const joven = persona('00000000T', '2005-01-01', '2025-01-01')
  const d = deducirNecesidades('moto', { holder: joven, risk: { primaryDriver: joven } }, null, HOY)
  assert.equal(d.respuestas.conductores, 'jovenes')
})

test('deducir hogar y otros ramos: completos y válidos aunque no haya petición legible', () => {
  for (const ramo of ['hogar', 'vida', 'decesos']) {
    const d = deducirNecesidades(ramo, null, null, HOY)
    assert.equal(validarRespuestasNecesidades(ramo, d.respuestas).ok, true, ramo)
  }
})
