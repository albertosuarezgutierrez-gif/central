// Generali Turismos v0.2.19 (22/10/2026, trabajo 304ac3a2): sin tomador «Garantías y Resultados» no da precio. Reglas PURAS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  avisosObligatorioGenerali,
  camposInteresadoGenerali,
  fragmentosImportesGenerali,
  leerPrecioGenerali,
  sanearFragmentoGenerali,
} from '../src/adapters/generali/reglas.ts'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'

test('v0.2.19 · versión vigente (0.2.26)', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.27'))

test('v0.2.19 · lector: importe dos líneas por debajo de la etiqueta y etiquetas nuevas', () => {
  assert.deepEqual(leerPrecioGenerali('Prima total\nEUR\n1.234,56 €'), { tipo: 'unico', eur: 1234.56, linea: 'Prima total 1.234,56 €' })
  assert.deepEqual(leerPrecioGenerali('Recibo anual\n456,70'), { tipo: 'unico', eur: 456.7, linea: 'Recibo anual 456,70' })
  assert.equal(leerPrecioGenerali('Capital asegurado 12.000,00 €\nFranquicia 150,00 €').tipo, 'ninguno')
  assert.equal(leerPrecioGenerali('Prima total prima neta 80,00 €\nx').tipo, 'unico')
})

test('v0.2.19 · lector: importes de inputs (etiqueta + valor en líneas contiguas)', () => {
  assert.equal(leerPrecioGenerali('prima total\n612,34').tipo, 'unico')
})

test('v0.2.19 · tomador físico: campos del riesgo, NIF primero, nada inventado', () => {
  const c = camposInteresadoGenerali({
    documentoTomador: '00000000T',
    datosTomador: { tipo: 'fisica', nombre: 'Ana', apellido1: 'Pérez', apellido2: null, fechaNacimiento: '1980-05-17' },
    conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' },
  })
  assert.deepEqual(c.map((x) => x.campo), ['nifcif', 'nombre', 'papell', 'ffnain', 'ffcain'])
  assert.equal(c.find((x) => x.campo === 'ffnain')!.valor, '17/05/1980')
  assert.deepEqual(camposInteresadoGenerali({ datosTomador: { tipo: 'juridica' } }), [])
  assert.deepEqual(camposInteresadoGenerali({}), [])
})

test('v0.2.19 · avisos «Es obligatorio…» y fragmentos saneados', () => {
  assert.deepEqual(avisosObligatorioGenerali('x\nEs obligatorio informar el tomador\nPrima'), ['Es obligatorio informar el tomador'])
  const f = fragmentosImportesGenerali('Cliente 12345678Z nacido 17/05/1980 prima total 500,00 €')
  assert.equal(f.length, 1)
  assert.ok(!/12345678Z|1980/.test(f[0]!), f[0])
  assert.match(f[0]!, /500,00/)
  assert.equal(sanearFragmentoGenerali('mail a@b.es 600123456 1234BCD'), 'mail [correo] [tel] [mat]')
})
