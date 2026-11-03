// Generali Turismos v0.2.36 (26/10/2026): la tabla «Modalidades de Seguro» salió vacía con «No lo sé» en combustible y potencia. Hipótesis: Generali no calcula sin ellos.
// Ahora se DEDUCEN de la versión (siglas de motor y CV suelto) y solo se marcan si casan EXACTO con una opción del portal. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  avisoDeducidoDeVersionGenerali,
  combustibleDeVersionGenerali,
  combustiblePotenciaRellenosGenerali,
  opcionCombustibleDeVersionGenerali,
  opcionPotenciaDeVersionGenerali,
  potenciaDeVersionGenerali,
  resumenDiagnosticoModalidadesGenerali,
} from '../src/adapters/generali/reglas.ts'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { CONCEPTOS_LECTURA } from '../src/vocabulario.ts'

test('v0.2.36 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[6-9]|[4-9]\d)$/)
})

test('v0.2.36 · potencia: un único entero 40–700 (163), no la cilindrada ni dos candidatos', () => {
  assert.equal(potenciaDeVersionGenerali('2.9 CRDI 163 FULL'), 163)
  assert.equal(potenciaDeVersionGenerali('1.6 TDI 105 DSG7'), 105)
  assert.equal(potenciaDeVersionGenerali('2.0 TDI 150 CV 4MOTION'), 150, 'CV explícito')
  assert.equal(potenciaDeVersionGenerali('1.5 BLUEHDI 130CV'), 130)
  assert.equal(potenciaDeVersionGenerali('2.9 CRDI FULL'), null, 'solo cilindrada')
  assert.equal(potenciaDeVersionGenerali('2.5 TCI'), null)
  assert.equal(potenciaDeVersionGenerali('320D 190 xDrive 700'), null, 'dos candidatos')
  assert.equal(potenciaDeVersionGenerali('1.50 GL'), null, 'decimales no son CV')
  assert.equal(potenciaDeVersionGenerali('3.5 V6 20 195'), 195, '20 no está en 40–700')
  assert.equal(potenciaDeVersionGenerali('2.0 TDI 150 CV 190 CV'), null, 'dos CV explícitos')
  assert.equal(potenciaDeVersionGenerali('2.0 TDI 900'), null, 'fuera de rango')
  assert.equal(potenciaDeVersionGenerali(null), null)
})

test('v0.2.36 · combustible por siglas de motor: una familia → ese; mezcla o nada → null', () => {
  assert.equal(combustibleDeVersionGenerali('2.9 CRDI 163 FULL'), 'diesel')
  for (const v of ['1.6 TDI', '1.5 DCI 90', '2.0 HDI', '2.2 CDI', '1.4 D-4D', '1.3 JTD', '1.6 TDCI', '1.5 BLUEHDI 130', '1.3 MULTIJET', '1.5 CRD']) assert.equal(combustibleDeVersionGenerali(v), 'diesel', v)
  for (const v of ['1.4 TSI 125', '2.0 TFSI', '2.0 GTI', '1.5 VTEC', '1.0 MPI 80', '1.6 T-GDI 177']) assert.equal(combustibleDeVersionGenerali(v), 'gasolina', v)
  assert.equal(combustibleDeVersionGenerali('1.6 TDI TSI'), null, 'mezcla')
  assert.equal(combustibleDeVersionGenerali('2.5 TCI'), null)
  assert.equal(combustibleDeVersionGenerali('1.6 TDIX'), null, 'palabra entera')
  assert.equal(combustibleDeVersionGenerali(''), null)
})

test('v0.2.36 · concepto de vocabulario «combustible_motor» con origen generali 26/10/2026', () => {
  const c = CONCEPTOS_LECTURA.combustible_motor
  assert.equal(c.clase, 'lectura')
  for (const x of [...c.grupos.diesel, ...c.grupos.gasolina]) assert.deepEqual([x.origen.compania, x.origen.fecha], ['generali', '26/10/2026'])
})

test('v0.2.36 · solo se marca la opción que casa EXACTA con el portal', () => {
  assert.equal(opcionCombustibleDeVersionGenerali(['Diésel', 'Gasolina', 'No lo sé'], '2.9 CRDI 163 FULL'), 'Diésel')
  assert.equal(opcionCombustibleDeVersionGenerali(['Gasolina', 'No lo sé'], '2.9 CRDI 163 FULL'), null, 'el portal no ofrece diésel: se mantiene «No lo sé»')
  assert.equal(opcionCombustibleDeVersionGenerali(['Diésel', 'Gasolina', 'No lo sé'], '2.5 TCI'), null)
  assert.equal(opcionPotenciaDeVersionGenerali(['100.0 CV', '163.0 CV', 'No lo sé'], '2.9 CRDI 163 FULL'), '163.0 CV')
  assert.equal(opcionPotenciaDeVersionGenerali(['100.0 CV', '160.0 CV', '170.0 CV', 'No lo sé'], '2.9 CRDI 163 FULL'), null, 'nunca la parecida')
  assert.equal(opcionPotenciaDeVersionGenerali(['163.0 CV', 'No lo sé'], null), null)
})

test('v0.2.36 · aviso de supuesto y detección de «con combustible y potencia rellenos»', () => {
  assert.equal(avisoDeducidoDeVersionGenerali('2.9 CRDI 163 FULL', true, true), 'combustible/potencia deducidos de la versión «2.9 CRDI 163 FULL» (supuesto; revisar en la emisión)')
  assert.match(avisoDeducidoDeVersionGenerali('X', true, false), /^combustible deducido de la versión/)
  assert.match(avisoDeducidoDeVersionGenerali('X', false, true), /^potencia deducida de la versión/)
  assert.equal(combustiblePotenciaRellenosGenerali(['combustible/potencia deducidos de la versión «X» (supuesto; revisar en la emisión)']), true)
  assert.equal(combustiblePotenciaRellenosGenerali(['el combustible del vehículo no consta en el riesgo: se marcó «No lo sé» (supuesto; revisar en la emisión)']), false)
  assert.equal(combustiblePotenciaRellenosGenerali(['la potencia del vehículo no consta en el riesgo: se marcó «No lo sé» (supuesto; revisar en la emisión)']), false)
})

test('v0.2.36 · diagnóstico de marcos: los 12 marcos con ruta y tablas caben; se recorta antes la estructura', () => {
  const doce = Array.from({ length: 12 }, (_, i) => ({ url: `https://portal.example/app/marco${i}.do`, tablas: i, conRecibo: i % 2, estructura: i === 5 ? '<table>' + 'x'.repeat(590) : '' }))
  const r = resumenDiagnosticoModalidadesGenerali(doce, 1_100)
  assert.ok(r.length <= 1_100)
  assert.match(r, /^Marcos \(12\): /)
  for (let i = 0; i < 12; i++) assert.match(r, new RegExp(`\\[${i}\\] /app/marco${i}\\.do tablas=${i} `), `marco ${i}`)
  assert.doesNotMatch(r, /…$/, 'la lista no se trunca')
})
