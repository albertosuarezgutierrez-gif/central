// Generali Turismos v0.2.56 (01/11/2026): la elección de la bandeja también vale en el nivel MODELO (lista FORFOUR · FORTWO CABRIO ·
// FORTWO COUPE). Antes `elegirModeloPrimeFaces` no leía `eleccionVersion` y volvía a parar; y con una elección puesta el desempate por el
// vehículo de origen se apagaba también en el modelo. Fixtures SINTÉTICAS (solo nombres de catálogo y datos técnicos; nada personal).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PREFIJO_ELECCION_VERSION, motivoLegible, type FormularioAuto } from '@central/module-tarificacion'
import {
  ErrorEleccionModeloGenerali,
  VERSION_GENERALI_AUTO,
  decidirVersionDesplegableGenerali,
  desempateOrigenSinPersona,
  indicePersonaEnNivelGenerali,
  modeloAmbiguoGenerali,
} from '../src/adapters/generali/auto.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'

type Form = Pick<FormularioAuto, 'eleccionVersion' | 'seleccionVehiculo' | 'vehiculoConfirmado' | 'fechaMatriculacion'>
const SMART = ['Seleccione uno', 'FORFOUR', 'FORTWO CABRIO', 'FORTWO COUPE']
const formMapfre = { vehiculoConfirmado: { origen: 'mapfre', denominacion: 'Smart Forfour Pure 1.1', cv: 75, cc: 1124, puertas: 5, fechaInicio: '2005-03-01' } } as Form
const con = (etiqueta: string, base: Form = formMapfre): Form => ({ ...base, eleccionVersion: { etiqueta } }) as Form

test('v0.2.56 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.58'))

test('v0.2.56 · elección humana a nivel MODELO: casa (normalizada, entera) con UNA opción → esa, y manda sobre el desempate por origen', () => {
  // El origen (Mapfre, Forfour) diría FORFOUR; la persona eligió FORTWO COUPE en la bandeja → manda la persona.
  assert.deepEqual(modeloAmbiguoGenerali(SMART, con('  fortwo   coupe ')), { tipo: 'persona', indice: 3 })
  // Sin datos de origen también se aplica.
  assert.deepEqual(modeloAmbiguoGenerali(SMART, con('FORTWO CABRIO', {} as Form)), { tipo: 'persona', indice: 2 })
  // Entera: «FORTWO» no es «FORTWO COUPE»; repetidas → ninguna elección (no se adivina).
  assert.equal(indicePersonaEnNivelGenerali(SMART, 'FORTWO'), null)
  assert.equal(indicePersonaEnNivelGenerali(['IBIZA', 'IBIZA', 'Otros'], 'IBIZA'), null)
})

test('v0.2.56 · elección que NO casa en el modelo (es de versión) → el desempate por origen sigue funcionando en el modelo', () => {
  const f = con('1.1 PURE 75CV GASOLINA')
  const d = modeloAmbiguoGenerali(SMART, f)
  assert.equal(d?.tipo, 'origen')
  assert.equal(SMART[d!.indice], 'FORFOUR')
  assert.match((d as { supuesto: string }).supuesto, /Mapfre/)
  assert.notEqual(desempateOrigenSinPersona(SMART, f, 'modelo'), null)
  // Sin lista que preguntar (`conOrigen` falso) no hay desempate, como en la 0.2.55.
  assert.equal(modeloAmbiguoGenerali(SMART, f, false), null)
})

test('v0.2.56 · elección a nivel VERSIÓN intacta: manda la persona y el desempate por origen sigue apagado en versión', () => {
  const versiones = ['1.1 PURE 75CV GASOLINA', '1.5 CDI PURE 75CV DIESEL']
  // El origen («1.1») diría la 0; la persona eligió la 1 → la 1.
  assert.equal(decidirVersionDesplegableGenerali(versiones, con('1.5 CDI PURE 75CV DIESEL')).indice, 1)
  assert.equal(desempateOrigenSinPersona(versiones, con('FORFOUR'), 'version'), null)
  assert.equal(desempateOrigenSinPersona(versiones, { ...formMapfre, eleccionVersion: { codigo: 'X1' } } as Form, 'version'), null)
})

test('v0.2.56 · el atasco del MODELO dice «modelos» (no «versiones») y conserva el cable de la elección', () => {
  const e = new ErrorEleccionModeloGenerali(SMART.slice(1).map((etiqueta) => ({ etiqueta, codigo: null })))
  assert.ok(e instanceof ErrorEleccionVersion)
  assert.equal(e.tipo, 'eleccion')
  assert.equal(e.opcionesVersion.length, 3)
  assert.ok(e.message.startsWith(PREFIJO_ELECCION_VERSION), 'la bandeja lo reconoce por el prefijo')
  assert.match(e.message, /3 modelos/)
  assert.match(e.message, /nivel MODELO/)
  assert.doesNotMatch(e.message, /versiones/)
  assert.match(motivoLegible({ tipo: 'eleccion', mensaje: e.message }, 'requiere_humano'), /modelos.*FORFOUR · FORTWO CABRIO · FORTWO COUPE/)
  // La de versión sigue diciendo «versiones».
  assert.match(new ErrorEleccionVersion([{ etiqueta: 'A', codigo: null }, { etiqueta: 'B', codigo: null }]).message, /2 versiones/)
})
