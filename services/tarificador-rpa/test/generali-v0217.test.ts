// Generali Turismos v0.2.17 (22/10/2026, prueba real: tras «Otros modelos ...» el selector enseña «combustible» [grupo], «potencia» [grupo]
// con «No lo sé» y «Versión» [desplegable] con textos REPETIDOS). Reglas PURAS: combustible y CV del riesgo, potencia por CV entero exacto,
// versión del desplegable (repetidas → la primera, declarada). Catálogo genérico de prueba; ningún dato personal.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  combustibleRiesgoGenerali,
  cvRiesgoGenerali,
  decidirCombustibleGenerali,
  elegirVersionDesplegableGenerali,
  esOpcionNoLoSeGenerali,
  grupoCombustibleGenerali,
  grupoPotenciaGenerali,
  potenciaExactaGenerali,
  type CampoSelectorGenerali,
} from '../src/adapters/generali/reglas.ts'

const g = (clave: string, opciones: string[], total = opciones.length): CampoSelectorGenerali => ({ clave, etiqueta: clave.slice(6), tipo: 'grupo', opciones, total })
const COMBUSTIBLES = ['Diésel', 'Gasolina', 'No lo sé']
const POTENCIAS = ['100.0 CV', '150.0 CV', '163.0 CV', '195.0 CV', 'No lo sé']
const VERSIONES = ['Seleccione una', '2.5 TCI', '2.9 CRDI 163 FULL', '2.9 CRDI 163 FULL', '2.9 CRDI 163 FULL AUTO', '2.9 CRDI 163 GL', '2.9 CRDI 163 GLS', '2.9 CRDI 150 GL', '3.5 V6 195']
const vc = (extra: Record<string, unknown> = {}) => ({ origen: 'mapfre' as const, denominacion: 'MARCA MODELO 2.9 CRDI 163 GLS', cv: 163, cc: 2902, puertas: 5, fechaInicio: null, ...extra })

test('v0.2.17 · «No lo sé» y grupos: combustible (por nombre o por opciones) y potencia que admite «No lo sé»', () => {
  assert.equal(esOpcionNoLoSeGenerali('No lo sé'), true)
  assert.equal(esOpcionNoLoSeGenerali(' NO LO SE '), true)
  assert.equal(esOpcionNoLoSeGenerali('No'), false)
  assert.deepEqual(grupoCombustibleGenerali([g('grupo|placaesp', ['Sí', 'No']), g('grupo|combustible', COMBUSTIBLES), g('grupo|potencia', POTENCIAS)]), { grupo: 'combustible', opciones: COMBUSTIBLES })
  assert.deepEqual(grupoCombustibleGenerali([g('grupo|j_idt42', ['Diésel', 'Gasolina'])]), { grupo: 'j_idt42', opciones: ['Diésel', 'Gasolina'] }, 'sin nombre de combustible, por sus opciones')
  assert.equal(grupoCombustibleGenerali([g('grupo|placaesp', ['Sí', 'No'])]), null)
  assert.equal(grupoCombustibleGenerali([g('grupo|potencia', POTENCIAS)]), null, 'la potencia no es combustible')
  assert.deepEqual(grupoPotenciaGenerali([g('grupo|combustible', COMBUSTIBLES), g('grupo|potencia', POTENCIAS)]), { grupo: 'potencia', opciones: POTENCIAS }, '«No lo sé» no impide reconocer la potencia')
  assert.equal(grupoPotenciaGenerali([g('grupo|potencia', ['No lo sé'])]), null, 'al menos una «NNN CV»')
  assert.equal(grupoPotenciaGenerali([g('grupo|combustible', COMBUSTIBLES)]), null)
})

test('v0.2.17 · combustible y CV del riesgo: vehículo confirmado; si no consta, lo que DIGA el texto de la versión; nunca inventado', () => {
  assert.equal(combustibleRiesgoGenerali({ vehiculoConfirmado: vc({ combustible: 'diesel' }), seleccionVehiculo: null }), 'diesel')
  assert.equal(combustibleRiesgoGenerali({ vehiculoConfirmado: vc(), seleccionVehiculo: null }), null, 'la denominación no dice el combustible: no consta')
  assert.equal(combustibleRiesgoGenerali({ vehiculoConfirmado: null, seleccionVehiculo: { marca: 'M', modelo: 'X', descripcion: '1.6 GASOLINA 116 CV' } }), 'gasolina')
  assert.equal(combustibleRiesgoGenerali({ vehiculoConfirmado: null, seleccionVehiculo: { marca: 'M', modelo: 'X' } }), null)
  assert.equal(cvRiesgoGenerali({ vehiculoConfirmado: vc(), seleccionVehiculo: null }), 163)
  assert.equal(cvRiesgoGenerali({ vehiculoConfirmado: vc({ cv: 162.6 }), seleccionVehiculo: null }), 163, 'CV enteros')
  assert.equal(cvRiesgoGenerali({ vehiculoConfirmado: null, seleccionVehiculo: { marca: 'M', modelo: 'X', descripcion: '2.9 CRDI 163 CV GLS' } }), 163)
  assert.equal(cvRiesgoGenerali({ vehiculoConfirmado: null, seleccionVehiculo: { marca: 'M', modelo: 'X', descripcion: '2.9 CRDI GLS' } }), null)
})

test('v0.2.17 · combustible: Diésel/Gasolina normalizados; sin dato o sin opción → «No lo sé» con supuesto SOLO si el portal lo ofrece', () => {
  assert.deepEqual(decidirCombustibleGenerali(COMBUSTIBLES, 'diesel'), { tipo: 'opcion', texto: 'Diésel', supuesto: null })
  assert.deepEqual(decidirCombustibleGenerali(COMBUSTIBLES, 'gasolina'), { tipo: 'opcion', texto: 'Gasolina', supuesto: null })
  assert.deepEqual(decidirCombustibleGenerali(['DIESEL', 'GASOLINA'], 'diesel'), { tipo: 'opcion', texto: 'DIESEL', supuesto: null })
  const sin = decidirCombustibleGenerali(COMBUSTIBLES, null)
  assert.equal(sin.tipo, 'opcion')
  assert.equal(sin.tipo === 'opcion' && sin.texto, 'No lo sé')
  assert.match(sin.tipo === 'opcion' ? sin.supuesto ?? '' : '', /combustible.*no consta.*«No lo sé».*supuesto/i)
  const elec = decidirCombustibleGenerali(COMBUSTIBLES, 'electrico')
  assert.equal(elec.tipo === 'opcion' && elec.texto, 'No lo sé', 'eléctrico no figura: «No lo sé», declarado')
  assert.match(elec.tipo === 'opcion' ? elec.supuesto ?? '' : '', /eléctrico.*no figura/i)
  assert.equal(decidirCombustibleGenerali(['Diésel', 'Gasolina'], null).tipo, 'sin_opcion', 'sin dato y sin «No lo sé»: no se inventa')
  assert.equal(decidirCombustibleGenerali(['Diésel', 'Gasolina'], 'electrico').tipo, 'sin_opcion')
})

test('v0.2.17 · potencia: CV entero EXACTO (163 ↔ «163.0 CV»); sin dato o sin coincidencia → «No lo sé» con supuesto; sin «No lo sé» → regla anterior', () => {
  assert.deepEqual(potenciaExactaGenerali(POTENCIAS, 163), { tipo: 'exacta', texto: '163.0 CV' })
  assert.deepEqual(potenciaExactaGenerali(POTENCIAS, 195), { tipo: 'exacta', texto: '195.0 CV' })
  const cerca = potenciaExactaGenerali(POTENCIAS, 160)
  assert.equal(cerca.tipo, 'no_lo_se', 'tolerancia EXACTA: 160 no es 163')
  assert.match(cerca.tipo === 'no_lo_se' ? cerca.supuesto : '', /160 CV.*no figura.*«No lo sé»/)
  const sin = potenciaExactaGenerali(POTENCIAS, null)
  assert.equal(sin.tipo === 'no_lo_se' && sin.texto, 'No lo sé')
  assert.match(sin.tipo === 'no_lo_se' ? sin.supuesto : '', /no consta/)
  assert.deepEqual(potenciaExactaGenerali(['116.0 CV', '131.0 CV'], 120), { tipo: 'sin_exacta' }, 'sin «No lo sé»: decide la regla de 0.2.14')
  assert.deepEqual(potenciaExactaGenerali(['116.0 CV', '131.0 CV'], 116), { tipo: 'exacta', texto: '116.0 CV' })
})

test('v0.2.17 · versión del desplegable: casa con la versión del riesgo; idénticas repetidas → la PRIMERA, declarada', () => {
  const r = elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: '2.9 CRDI 163 FULL', cv: 163, combustible: null })
  assert.equal(r.tipo, 'opcion')
  assert.equal(r.tipo === 'opcion' && r.indice, 2, 'la primera de las dos idénticas')
  assert.match(r.tipo === 'opcion' ? r.supuesto ?? '' : '', /^Versión elegida automáticamente: 2\.9 CRDI 163 FULL \(había 2 equivalentes; revisar en la emisión\)$/)
  const u = elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: '2.9 crdi 163 gls', cv: 163, combustible: null })
  assert.deepEqual(u, { tipo: 'opcion', indice: 6, supuesto: null }, 'exacta normalizada y única: sin supuesto')
  const den = elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: 'MARCA MODELO 3.5 V6 195', cv: null, combustible: null })
  assert.equal(den.tipo === 'opcion' && den.indice, 8, 'la denominación contiene la opción')
})

test('v0.2.17 · versión sin dato (o sin casar): filtro por potencia; una → esa; varias → la primera con supuesto; ninguna → preguntar con la lista', () => {
  const v = elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: null, cv: 195, combustible: null })
  assert.deepEqual(v, { tipo: 'opcion', indice: 8, supuesto: null }, 'solo «3.5 V6 195» lleva 195')
  const varias = elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: '2.9 CRDI 163 PREMIUM', cv: 163, combustible: 'diesel' })
  assert.equal(varias.tipo === 'opcion' && varias.indice, 2, 'ninguna casa por texto: las de 163, la primera')
  assert.match(varias.tipo === 'opcion' ? varias.supuesto ?? '' : '', /Versión elegida automáticamente: 2\.9 CRDI 163 FULL \(había 5 equivalentes; revisar en la emisión\)/)
  const ninguna = elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: null, cv: 88, combustible: null })
  assert.equal(ninguna.tipo, 'preguntar')
  assert.equal(ninguna.tipo === 'preguntar' && ninguna.candidatas.length, 8, 'todas las reales, sin «Seleccione una»')
  assert.equal(elegirVersionDesplegableGenerali(VERSIONES, { persona: null, buscado: null, cv: null, combustible: null }).tipo, 'preguntar', 'sin NINGÚN dato y varias versiones: nunca la primera a ciegas')
  assert.deepEqual(elegirVersionDesplegableGenerali(['Seleccione una', '2.5 TCI'], { persona: null, buscado: null, cv: null, combustible: null }), { tipo: 'opcion', indice: 1, supuesto: null }, 'una sola versión real')
  assert.equal(elegirVersionDesplegableGenerali(['Seleccione una'], { persona: null, buscado: null, cv: 163, combustible: null }).tipo, 'preguntar')
  const gas = elegirVersionDesplegableGenerali(['1.6 GASOLINA 116', '1.6 DIESEL 116'], { persona: null, buscado: null, cv: 116, combustible: 'diesel' })
  assert.equal(gas.tipo === 'opcion' && gas.indice, 1, 'el combustible del riesgo descarta la que dice otro')
})

test('v0.2.17 · versión elegida por una PERSONA (bandeja): manda; repetida → la primera; si no casa → preguntar', () => {
  assert.equal(elegirVersionDesplegableGenerali(VERSIONES, { persona: '2.9 CRDI 150 GL', buscado: '2.9 CRDI 163 GLS', cv: 163, combustible: null }).tipo === 'opcion', true)
  const p = elegirVersionDesplegableGenerali(VERSIONES, { persona: '2.9 CRDI 150 GL', buscado: '2.9 CRDI 163 GLS', cv: 163, combustible: null })
  assert.equal(p.tipo === 'opcion' && p.indice, 7)
  const rep = elegirVersionDesplegableGenerali(VERSIONES, { persona: '2.9 CRDI 163 FULL', buscado: null, cv: null, combustible: null })
  assert.equal(rep.tipo === 'opcion' && rep.indice, 2)
  assert.equal(elegirVersionDesplegableGenerali(VERSIONES, { persona: 'OTRA VERSIÓN', buscado: null, cv: 163, combustible: null }).tipo, 'preguntar')
})
