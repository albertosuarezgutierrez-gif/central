import test from 'node:test'
import assert from 'node:assert/strict'

import { FAMILIAS_SOLAPAMIENTO, detectarSolapamientos } from './solapamientos.ts'

const auto = { id: 'a', titulo: 'Mapfre · Auto', coberturas: ['Responsabilidad civil obligatoria', 'Defensa jurídica y reclamación de daños', 'Asistencia en viaje desde km 0'] }
const hogar = { id: 'h', titulo: 'Allianz · Hogar', coberturas: ['Continente', 'Defensa jurídica', 'Responsabilidad civil familiar'] }
const rc = { id: 'r', titulo: 'Occident · RC', coberturas: ['Responsabilidad civil privada'] }

test('una cobertura en dos pólizas distintas es un solapamiento, con el texto exacto de cada una', () => {
  const s = detectarSolapamientos([auto, hogar])
  assert.deepEqual(
    s.map((x) => x.familia),
    ['defensa_juridica'],
  )
  assert.deepEqual(s[0].polizas, [
    { id: 'a', titulo: 'Mapfre · Auto', cobertura: 'Defensa jurídica y reclamación de daños' },
    { id: 'h', titulo: 'Allianz · Hogar', cobertura: 'Defensa jurídica' },
  ])
})

test('una sola póliza con dos coberturas de la misma familia NO es solapamiento', () => {
  const una = { id: 'x', titulo: 'X', coberturas: ['Defensa jurídica', 'Reclamación de daños'] }
  assert.deepEqual(detectarSolapamientos([una]), [])
})

test('tres pólizas: la familia lista las tres', () => {
  const s = detectarSolapamientos([auto, hogar, rc])
  const rcFam = s.find((x) => x.familia === 'rc_familiar')
  assert.ok(rcFam)
  assert.deepEqual(rcFam.polizas.map((p) => p.id), ['h', 'r'])
})

test('la RC OBLIGATORIA del auto no casa con la familiar del hogar (son cosas distintas)', () => {
  const s = detectarSolapamientos([auto, hogar])
  assert.ok(!s.some((x) => x.familia === 'rc_familiar'))
})

test('sin coberturas informadas no hay nada que decir: [] y no un aviso vacío', () => {
  assert.deepEqual(detectarSolapamientos([{ id: 'a', titulo: 'A', coberturas: [] }, { id: 'b', titulo: 'B', coberturas: [] }]), [])
  assert.deepEqual(detectarSolapamientos([]), [])
})

test('cada familia tiene su matiz, y ninguno afirma que una póliza SOBRE ni habla de precio', () => {
  for (const f of FAMILIAS_SOLAPAMIENTO) {
    assert.ok(f.matiz.length > 40, `${f.id}: matiz demasiado corto`)
    assert.ok(!/sobra|duplicad|pagas (dos veces|de m[aá]s)|ahorr/i.test(f.matiz), `${f.id}: el matiz juzga en vez de informar`)
  }
})

test('los patrones no llevan la bandera g (un RegExp global guarda lastIndex y se salta textos)', () => {
  for (const f of FAMILIAS_SOLAPAMIENTO) assert.ok(!f.patron.global, `${f.id}: patrón global`)
})
