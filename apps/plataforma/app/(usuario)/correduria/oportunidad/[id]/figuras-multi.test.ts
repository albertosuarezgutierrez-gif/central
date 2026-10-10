// Papeles de VARIAS personas en «Intervinientes» (asegurados, 10/10/2026): roles únicos vs múltiples, gate de
// migración, identidad por ficha (nunca por nombre) y auto/moto exactamente como antes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { cabeOtro, estadoBloqueMulti, opcionesSinPoner, personasDelRol, repartirRoles } from './figuras-form.ts'
import { varianteDeRiesgo } from './variante.ts'
import { interpretarRiesgo } from '../../../../../lib/riesgo-asegura.ts'
import { rolesDelRamo } from '@central/module-seguros'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

function leer(ramo: string, extra: Record<string, unknown>) {
  const r = interpretarRiesgo(200, { estado: 'ok', oportunidad: { id: 'op1', clienteId: A, clienteNombre: 'Ana', ramo }, vinculos: [], variantes: [], ...extra })
  if (r.estado !== 'ok') throw new Error('no se pudo leer')
  return r.riesgo
}

test('auto y moto: todos sus papeles son de UNA persona; no hay bloque de varios (pantalla igual que antes)', () => {
  for (const ramo of ['auto', 'moto']) {
    const { unicos, multiples } = repartirRoles(rolesDelRamo(ramo))
    assert.deepEqual(unicos, [...rolesDelRamo(ramo)], ramo)
    assert.deepEqual(multiples, [], ramo)
  }
})

test('salud: el tomador sigue en tarjeta y los asegurados van en lista', () => {
  assert.deepEqual(repartirRoles(rolesDelRamo('salud')), { unicos: ['tomador'], multiples: ['asegurado'] })
  assert.ok(cabeOtro('salud', 'asegurado', 9))
  assert.ok(!cabeOtro('salud', 'asegurado', 10))
  assert.ok(!cabeOtro('vida', 'asegurado', 1), 'en vida, uno')
})

test('identidad: dos fichas con el MISMO nombre son dos asegurados; la misma ficha repetida sale una vez', () => {
  const r = leer('salud', {
    roles: ['tomador', 'asegurado'],
    figurasMulti: 'disponible',
    figuras: [
      { rol: 'asegurado', clienteId: B, nombre: 'Lucía Pérez' },
      { rol: 'asegurado', clienteId: C, nombre: 'Lucía Pérez' },
      { rol: 'asegurado', clienteId: B, nombre: 'Lucía Pérez' },
    ],
  })
  assert.deepEqual(personasDelRol(r.figuras, 'asegurado').map((f) => f.clienteId), [B, C])
  // Ofrecer para añadir: por id. Otra «Lucía Pérez» con otra ficha sigue ofreciéndose.
  const opciones = [{ clienteId: B, nombre: 'Lucía Pérez' }, { clienteId: 'otra', nombre: 'Lucía Pérez' }]
  assert.deepEqual(opcionesSinPoner(opciones, personasDelRol(r.figuras, 'asegurado')).map((o) => o.clienteId), ['otra'])
})

test('gate: solo «disponible» deja escribir; sin migración lo dice; no mirado/no dicho tampoco escribe', () => {
  assert.deepEqual(estadoBloqueMulti('disponible'), { editable: true })
  const sin = estadoBloqueMulti('sin_migracion')
  assert.ok(!sin.editable && sin.pendienteMigracion && /Pendiente de migración/.test(sin.texto))
  for (const v of ['desconocido', undefined, null, 'raro']) {
    const x = estadoBloqueMulti(v)
    assert.ok(!x.editable && !x.pendienteMigracion, String(v))
  }
})

test('interpretarRiesgo: figurasMulti null (ramo sin varios) ≠ ausente (asegura viejo → desconocido, nunca disponible)', () => {
  assert.equal(leer('auto', { roles: ['tomador'], figuras: [], figurasMulti: null }).figurasMulti, null)
  assert.equal(leer('salud', { roles: ['tomador', 'asegurado'], figuras: [] }).figurasMulti, 'desconocido')
  assert.equal(leer('salud', { roles: ['tomador', 'asegurado'], figuras: [], figurasMulti: 'sin_migracion' }).figurasMulti, 'sin_migracion')
})

test('la variante de precio no se lleva a los asegurados como papel de vehículo; auto igual que antes', () => {
  const salud = leer('salud', { roles: ['tomador', 'asegurado'], figurasMulti: 'disponible', figuras: [{ rol: 'asegurado', clienteId: B, nombre: 'Lucía' }] })
  const v = varianteDeRiesgo(salud, A, null)
  assert.deepEqual(v.figuras, {})
  assert.deepEqual(v.nombres, {})
  const auto = leer('auto', {
    roles: ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'],
    figuras: [{ rol: 'propietario', clienteId: B, nombre: 'Padre' }, { rol: 'conductor_habitual', clienteId: C, nombre: 'Hijo' }],
  })
  const va = varianteDeRiesgo(auto, A, null)
  assert.deepEqual(va.figuras, { propietario: B, conductor_habitual: C })
  assert.deepEqual(va.nombres, { propietario: 'Padre', conductor_habitual: 'Hijo' })
})

test('pantalla: quitar un asegurado manda SU clienteId y los botones de escribir dependen del gate', () => {
  const src = readFileSync(new URL('./FigurasRiesgo.tsx', import.meta.url), 'utf8')
  assert.match(src, /llamarFiguras\('DELETE', \{ oportunidadId: op\.id, rol, clienteId: f\.clienteId \}\)/)
  const bloque = src.slice(src.indexOf('{multiples.map((rol) => {'), src.indexOf('{editandoFicha && ('))
  assert.ok(bloque.length > 0)
  assert.match(bloque, /\{gate\.editable && \(\s*<button[^]*?quitarDeVarios/)
  assert.match(bloque, /\{gate\.editable && cabe && \(/)
  assert.match(bloque, /\{gate\.editable && abiertoAqui && \(/)
  // Las tarjetas de siempre recorren SOLO los papeles de una persona.
  assert.match(src, /\{unicos\.map\(\(rol\) => \{/)
  assert.doesNotMatch(src, /riesgo\.roles\.map/)
})
