// Generali Turismos v0.2.62 (02/11/2026, trabajo 7f358ff2): el MODELO ya se resolvía (FORTWO COUPE) pero la VERSIÓN paraba con «8 versiones: ELECTRIC DRIVE EQ …
// · Otras versiones ...». Sin nada visible que case con la referencia (gasolina «Fortwo PASSION 52»), se pulsa «Otras versiones ...» y se decide en la lista
// AMPLIADA por similitud (ELECTRIC/EQ penalizadas si la referencia no es eléctrica). Fixtures SINTÉTICAS (solo catálogo; nada personal).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { elegirOpcionPorVehiculoReferencia, type FormularioAuto } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO, decidirVersionDesplegableGenerali } from '../src/adapters/generali/auto.ts'
import { esOpcionOtrasVersionesGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'

type Form = Pick<FormularioAuto, 'eleccionVersion' | 'seleccionVehiculo' | 'vehiculoConfirmado' | 'fechaMatriculacion' | 'vehiculoReferencia'>
const VISIBLES = ['Seleccione una', 'ELECTRIC DRIVE EQ', 'ELECTRIC DRIVE EQ EDI.ONE', 'ELECTRIC DRIVE EQ PASSION', 'ELECTRIC DRIVE EQ PRI EDB', 'ELECTRIC DRIVE EQ PRIME', 'ELECTRIC DRIVE EQ PUL EDB', 'ELECTRIC DRIVE EQ PULSE', 'Otras versiones ...']
const AMPLIADA = ['Seleccione una', 'ELECTRIC DRIVE EQ', 'ELECTRIC DRIVE EQ PASSION', '1.0 52KW PULSE', '1.0 52KW PASSION', '0.9 TURBO 66KW PRIME']
const ref = (extra: Record<string, unknown> = {}) => ({ origen: 'allianz', marca: 'SMART', modelo: 'Fortwo', version: 'PASSION 52', carroceria: null, puertas: null, cc: null, cv: null, combustible: null, anio: null, ...extra }) as unknown as FormularioAuto['vehiculoReferencia']
const form = (extra: Partial<Form> = {}): Form => ({ ...extra }) as Form

test('v0.2.62 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.70'))

test('v0.2.62 · «Otras versiones ...» / «Otros …» se reconocen; una versión normal no', () => {
  assert.equal(esOpcionOtrasVersionesGenerali('Otras versiones ...'), true)
  assert.equal(esOpcionOtrasVersionesGenerali(' OTRAS  VERSIONES…'), true)
  assert.equal(esOpcionOtrasVersionesGenerali('Otros modelos ...'), true)
  assert.equal(esOpcionOtrasVersionesGenerali('ELECTRIC DRIVE EQ'), false)
  assert.equal(esOpcionOtrasVersionesGenerali('Seleccione una'), false)
})

test('v0.2.62 · todas las visibles son ELECTRIC/EQ y la referencia es gasolina (o no dice eléctrico): se pide «Otras versiones ...» (nunca se elige una EQ)', () => {
  for (const r of [ref({ combustible: 'gasolina' }), ref()]) {
    const d = decidirVersionDesplegableGenerali(VISIBLES, form({ vehiculoReferencia: r }))
    assert.equal(d.otras, true)
    assert.equal(VISIBLES[d.indice], 'Otras versiones ...')
    assert.equal(d.supuesto, null)
  }
})

test('v0.2.62 · lista AMPLIADA: gana la de acabado PASSION no eléctrica (gasolina 52 kW), declarada como supuesto de referencia', () => {
  for (const r of [ref({ combustible: 'gasolina' }), ref()]) {
    const d = decidirVersionDesplegableGenerali(AMPLIADA, form({ vehiculoReferencia: r }), [], { ampliada: true })
    assert.equal(d.otras, undefined)
    assert.equal(AMPLIADA[d.indice], '1.0 52KW PASSION')
    assert.match(d.supuesto ?? '', /supuesto/)
    assert.match(d.supuesto ?? '', /Allianz/)
  }
})

test('v0.2.68 · lista ampliada sin nada aceptable (todo eléctrico): se elige la más parecida con aviso de combustible distinto (sin «Otras versiones»)', () => {
  const ampl = ['Seleccione una', 'ELECTRIC DRIVE EQ', 'ELECTRIC DRIVE EQ PASSION', 'ELECTRIC DRIVE EQ PULSE', 'Otras versiones ...']
  const d = decidirVersionDesplegableGenerali(ampl, form({ vehiculoReferencia: ref({ combustible: 'gasolina' }) }), [], { ampliada: true })
  assert.equal(ampl[d.indice], 'ELECTRIC DRIVE EQ PASSION')
  assert.equal(d.otras, undefined)
  assert.match(d.supuesto ?? '', /Modelo distinto del de referencia/)
  assert.match(d.supuesto ?? '', /otro combustible/)
  assert.match(d.supuesto ?? '', /supuesto/)
})

test('v0.2.68 · la elección de una persona que no casa sigue preguntando (no se enmienda)', () => {
  const ampl = ['Seleccione una', 'ELECTRIC DRIVE EQ', 'ELECTRIC DRIVE EQ PASSION']
  assert.throws(
    () => decidirVersionDesplegableGenerali(ampl, form({ eleccionVersion: { codigo: null, etiqueta: 'otra cosa' }, vehiculoReferencia: ref({ combustible: 'gasolina' }) }), [], { ampliada: true }),
    (e: unknown) => e instanceof ErrorEleccionVersion,
  )
})

test('v0.2.62 · si la referencia SÍ es eléctrica, lo visible EQ sirve y no se amplía', () => {
  const d = decidirVersionDesplegableGenerali(VISIBLES, form({ vehiculoReferencia: ref({ version: 'Electric Drive EQ Passion', combustible: 'electrico' }) }))
  assert.equal(d.otras, undefined)
  assert.equal(VISIBLES[d.indice], 'ELECTRIC DRIVE EQ PASSION')
})

test('v0.2.62 · sin referencia ni elección: como siempre (para con la lista, «Otras versiones» incluida); nada se elige a ciegas', () => {
  assert.throws(() => decidirVersionDesplegableGenerali(VISIBLES, form()), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 8)
})

test('v0.2.62 · elección de la bandeja: vale en la lista visible; si solo está en la AMPLIADA, se amplía y se aplica allí (sin supuesto)', () => {
  const eleg = { eleccionVersion: { codigo: null, etiqueta: ' 1.0 52kw  passion ' } }
  const v = decidirVersionDesplegableGenerali(VISIBLES, form({ ...eleg, vehiculoReferencia: ref() }))
  assert.equal(v.otras, true)
  const a = decidirVersionDesplegableGenerali(AMPLIADA, form({ ...eleg, vehiculoReferencia: ref() }), [], { ampliada: true })
  assert.equal(AMPLIADA[a.indice], '1.0 52KW PASSION')
  assert.equal(a.supuesto, null)
  const enVisible = decidirVersionDesplegableGenerali(VISIBLES, form({ eleccionVersion: { codigo: null, etiqueta: 'electric drive eq prime' } }))
  assert.equal(VISIBLES[enVisible.indice], 'ELECTRIC DRIVE EQ PRIME')
  assert.equal(enVisible.otras, undefined)
  // Elección que no está ni en la ampliada → vuelve a preguntar con la lista ampliada.
  assert.throws(() => decidirVersionDesplegableGenerali(AMPLIADA, form({ eleccionVersion: { codigo: null, etiqueta: 'NO EXISTE' } }), [], { ampliada: true }), (e: unknown) => e instanceof ErrorEleccionVersion && e.opcionesVersion.length === 5)
})

test('v0.2.62 · similitud de versión: la referencia no eléctrica penaliza ELECTRIC/EQ/ED aunque no traiga combustible', () => {
  const r = elegirOpcionPorVehiculoReferencia(['ELECTRIC DRIVE EQ PASSION', '1.0 52KW PASSION'], ref(), { nivel: 'version' })
  assert.ok(r.tipo === 'coincidencia' || r.tipo === 'aproximacion')
  if (r.tipo === 'coincidencia' || r.tipo === 'aproximacion') {
    assert.equal(r.etiqueta, '1.0 52KW PASSION')
    assert.equal(r.contradice, false)
  }
  const solo = elegirOpcionPorVehiculoReferencia(['ELECTRIC DRIVE EQ PASSION', 'ELECTRIC DRIVE EQ'], ref(), { nivel: 'version' })
  assert.ok(solo.tipo === 'aproximacion' && solo.contradice === true, 'solo eléctricas ante referencia no eléctrica: nunca se elige (Generali abre «Otras versiones»)')
  // «Otras versiones ...» nunca es candidata.
  assert.equal(elegirOpcionPorVehiculoReferencia(['Otras versiones ...'], ref(), { nivel: 'version' }).tipo, 'sin_opciones')
})
