// Sexo del conductor desde el tratamiento de la ficha (18/10/2026). Datos SINTÉTICOS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { faltanParaTarificar } from '@central/module-tarificacion'
import { aplicarSexoDeFicha, necesitaSexoDeFicha } from './tarificador-sexo-ficha.ts'

const moto = (sexo: unknown = null, extra: Record<string, unknown> = {}) => ({
  ramo: 'moto', matricula: '0000BBB', codigoPostal: '00001', tomadorEsConductor: true, tomadorEsPropietario: true,
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo },
  aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  seleccionVehiculo: { marca: 'MARCA', modelo: 'MODELO', clase: 2, cilindradaCc: 250 },
  // Allianz moto exige el NIF del tomador (tomador = conductor): lo da la ficha. Aquí se mira solo el sexo, no el NIF.
  fichaTomador: { documento: '00000000T' },
  // Allianz moto 0.7.11: seguro anterior (sin años = estuvo asegurado, supuesto favorable) y fecha de adquisición; aquí no se miran.
  companiaAnterior: 'COMPAÑÍA DE PRUEBA', polizaAnteriorUltimos5: '00000', fotocopiaAnterior: 'proximo_anio', fechaAdquisicion: '2016-01-02', ...extra,
})

test('Sr. → hombre, Sra. → mujer, solo si el formulario no lo trae y el conductor es el cliente', () => {
  assert.equal((aplicarSexoDeFicha('moto', moto(), '1') as ReturnType<typeof moto>).conductor.sexo, 'hombre')
  assert.equal((aplicarSexoDeFicha('moto', moto(), '2') as ReturnType<typeof moto>).conductor.sexo, 'mujer')
  assert.equal((aplicarSexoDeFicha('moto', moto('mujer'), '1') as ReturnType<typeof moto>).conductor.sexo, 'mujer', 'el formulario manda')
  assert.equal(necesitaSexoDeFicha('moto', moto(null, { tomadorEsConductor: false })), false, 'otro conductor: no es su ficha')
  assert.equal(necesitaSexoDeFicha('hogar', moto()), false)
})

test('tratamiento no traducible (3, vacío, sin ficha) → no se inventa: sigue faltando, con mensaje claro', () => {
  for (const s of ['3', '', null]) {
    const r = aplicarSexoDeFicha('moto', moto(), s)
    assert.equal((r as ReturnType<typeof moto>).conductor.sexo, null)
    assert.deepEqual(faltanParaTarificar('allianz', 'moto', r)!.map((f) => f.clave), ['conductor.sexo'])
  }
  // Con sexo de la ficha y antecedentes vacíos (supuesto favorable), Allianz moto ya no pide nada.
  assert.deepEqual(faltanParaTarificar('allianz', 'moto', aplicarSexoDeFicha('moto', moto(), '1')), [])
})
