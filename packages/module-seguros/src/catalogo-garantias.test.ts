import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CATALOGO_GARANTIAS, clasificarCoberturas, noReconocidas } from './catalogo-garantias.ts'
import { filtrarPorGarantias, interruptoresGarantias } from './filtro-garantias.ts'

// Nombres REALES de coberturas de moto de Codeoscopic (presupuesto de Manuel, 28/09/2026).
const MOTO_REAL = [
  'Responsabilidad civil obligatoria', 'Responsabilidad civil voluntaria', 'Defensa jurídica', 'Defensa en multas',
  'Retirada de carné', 'Asistencia en viaje', 'Robo', 'Incendio', 'Daños propios', 'Grandes daños / Pérdida total',
  'Vehículo de sustitución', 'Seguro del conductor/ocupantes', 'Rotura del faro/Casco o  Vestimenta', 'Accesorios',
]

test('moto: cada nombre real cae en su garantía', () => {
  const g = clasificarCoberturas('moto', MOTO_REAL.map((nombre) => ({ nombre, incluida: true })))
  for (const [clave, estado] of Object.entries(g.porClave)) {
    if (clave === 'fenomenos_atmosfericos') assert.equal(estado, 'no_consta')
    else assert.equal(estado, 'si', clave)
  }
  assert.deepEqual(noReconocidas('moto', [{ nombre: 'Daños al cargador', incluida: false }, { nombre: 'Robo', incluida: true }]), ['Daños al cargador'])
})

test('🪤 nunca «no» sin incluida === false: lo no reconocido o sin dato es no_consta', () => {
  const g = clasificarCoberturas('auto', [{ nombre: 'Rotura de lunas', incluida: null }, { nombre: 'Cosa rara', incluida: false }])
  assert.equal(g.porClave.lunas, 'no_consta')
  assert.ok(Object.values(g.porClave).every((e) => e !== 'no'))
  assert.ok(Object.values(clasificarCoberturas('hogar', null).porClave).every((e) => e === 'no_consta'))
  assert.equal(clasificarCoberturas('auto', [{ nombre: 'Lunas', incluida: false }]).porClave.lunas, 'no')
})

test('varias coberturas sobre la misma garantía: gana sí', () => {
  const g = clasificarCoberturas('auto', [{ nombre: 'Asistencia en viaje', incluida: false }, { nombre: 'Grúa desde km 0', incluida: true }])
  assert.equal(g.porClave.asistencia_viaje, 'si')
})

test('falsos amigos: robo de accesorios no es robo; defensa en multas no es defensa jurídica; cristales según ramo', () => {
  const a = clasificarCoberturas('moto', [{ nombre: 'Robo de accesorios', incluida: true }, { nombre: 'Defensa en multas', incluida: true }])
  assert.equal(a.porClave.robo, 'no_consta')
  assert.equal(a.porClave.defensa_juridica, 'no_consta')
  assert.equal(clasificarCoberturas('auto', [{ nombre: 'Cristales', incluida: true }]).porClave.lunas, 'si')
  assert.equal(clasificarCoberturas('hogar', [{ nombre: 'Rotura de cristales', incluida: true }]).porClave.cristales, 'si')
})

test('hogar: el vocabulario habitual cae en su garantía', () => {
  const g = clasificarCoberturas('hogar', ['Continente', 'Contenido', 'Daños por agua', 'Responsabilidad civil familiar', 'Robo y expoliación', 'Asistencia en el hogar', 'Daños eléctricos', 'Joyas'].map((nombre) => ({ nombre, incluida: true })))
  for (const c of ['continente', 'contenido', 'danos_agua', 'rc_familiar', 'robo', 'asistencia_hogar', 'danos_electricos', 'joyas']) assert.equal(g.porClave[c], 'si', c)
})

test('las claves del catálogo no se repiten dentro de un ramo', () => {
  for (const [ramo, lista] of Object.entries(CATALOGO_GARANTIAS)) {
    assert.equal(new Set(lista.map((g) => g.clave)).size, lista.length, ramo)
  }
})

const op = (id: string, prima: number | null, lunas: 'si' | 'no' | 'no_consta' | null) => ({
  id, compania: id.split('-')[0]!, primaEur: prima,
  garantias: lunas === null ? null : { version: 1, porClave: { lunas } },
})

test('🪤 filtro: sí → visibles por prima; no consta → aparte, nunca desaparece; no → descartada', () => {
  const r = filtrarPorGarantias([op('A-1', 500, 'si'), op('B-1', 300, 'si'), op('C-1', 200, 'no_consta'), op('D-1', 100, 'no'), op('E-1', 150, null)], ['lunas'])
  assert.deepEqual(r.visibles.map((o) => o.id), ['B-1', 'A-1'])
  assert.deepEqual(r.sinDato.map((o) => o.id), ['E-1', 'C-1'])
  assert.equal(r.descartadas, 1)
})

test('filtro sin garantías marcadas: todas visibles, sin prima al final; y por compañía', () => {
  const r = filtrarPorGarantias([op('A-1', null, 'si'), op('B-1', 300, 'no'), op('A-2', 100, 'si')], [])
  assert.deepEqual(r.visibles.map((o) => o.id), ['A-2', 'B-1', 'A-1'])
  assert.deepEqual(filtrarPorGarantias([op('A-1', 1, 'si'), op('B-1', 2, 'si')], [], { companias: ['B'] }).visibles.map((o) => o.id), ['B-1'])
})

test('interruptores: solo garantías que alguna opción incluye, con su recuento', () => {
  const i = interruptoresGarantias('auto', [op('A-1', 1, 'si'), op('B-1', 2, 'no'), op('C-1', 3, 'si')])
  assert.deepEqual(i.map((x) => [x.clave, x.conSi]), [['lunas', 2]])
})
